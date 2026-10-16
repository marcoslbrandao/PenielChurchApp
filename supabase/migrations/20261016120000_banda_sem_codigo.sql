-- ============================================================================
-- 16/10/2026 - Banda SEM codigo de acesso (decisao do Marcos)
--
-- Igual aos membros: ninguem mais digita codigo para entrar na Banda. O Admin
-- ou o lider da Banda adiciona a pessoa direto pela aba Equipe da Banda.
--
--   1. Codigos da Banda ainda nao usados deixam de valer.
--   2. banda_membros.ativo: quem sai da Banda some da Equipe e das escalas
--      novas, mas o historico (escalas passadas, ministro do culto) continua
--      com o nome certo. Fica sincronizado com profiles.banda_acesso por
--      gatilho - inclusive quando a pessoa sai da igreja.
--   3. listar_candidatos_banda(): membros da igreja que ainda nao estao na
--      Banda (a tela de lider nao consegue ler profiles de outras pessoas).
--   4. adicionar_a_banda() / remover_da_banda(): so Admin ou lider da Banda.
-- Pode rodar mais de uma vez sem problema.
-- ============================================================================


-- ─── 1. Codigos da Banda ───────────────────────────────────────────────────
update public.invite_codes
   set expires_at = now()
 where is_used = false
   and tipo = 'banda'
   and (expires_at is null or expires_at > now());


-- ─── 2. Integrante ativo ou nao ────────────────────────────────────────────
alter table public.banda_membros add column if not exists ativo boolean not null default true;

update public.banda_membros bm
   set ativo = (p.banda_acesso = true
                or exists (select 1 from public.banda_lideres l where l.profile_id = bm.profile_id))
  from public.profiles p
 where p.id = bm.profile_id;

create or replace function public.profiles_sync_banda_ativo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.banda_acesso is distinct from old.banda_acesso then
    update public.banda_membros
       set ativo = coalesce(new.banda_acesso, false)
     where profile_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_banda_ativo_trg on public.profiles;
create trigger profiles_sync_banda_ativo_trg
  after update of banda_acesso on public.profiles
  for each row execute function public.profiles_sync_banda_ativo();


-- ─── 3. Quem pode ser adicionado ───────────────────────────────────────────
create or replace function public.listar_candidatos_banda()
returns table (id uuid, nome text, avatar_url text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_banda_lider() then
    raise exception 'acesso negado';
  end if;
  return query
    select p.id, coalesce(nullif(trim(p.full_name), ''), 'Sem nome')::text, p.avatar_url::text
      from public.profiles p
     where p.role in ('membro', 'lider', 'admin')
       and not exists (
         select 1 from public.banda_membros bm
          where bm.profile_id = p.id and bm.ativo = true)
     order by 2;
end;
$$;

revoke all on function public.listar_candidatos_banda() from public, anon;
grant execute on function public.listar_candidatos_banda() to authenticated;


-- ─── 4. Adicionar / remover da Banda ───────────────────────────────────────
create or replace function public.adicionar_a_banda(p_profile_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_nome text;
  v_avatar text;
begin
  if not public.is_banda_lider() then
    raise exception 'acesso negado';
  end if;

  select role, full_name, avatar_url into v_role, v_nome, v_avatar
    from public.profiles where id = p_profile_id;
  if not found then
    return json_build_object('success', false, 'error', 'Conta não encontrada.');
  end if;
  if v_role not in ('membro', 'lider', 'admin') then
    return json_build_object('success', false,
      'error', 'Só membros da igreja entram na Banda. Peça ao Admin para tornar a pessoa membro primeiro.');
  end if;

  update public.profiles set banda_acesso = true where id = p_profile_id;

  insert into public.banda_membros (profile_id, nome, avatar_url, ativo)
  values (p_profile_id, coalesce(nullif(trim(v_nome), ''), 'Sem nome'), v_avatar, true)
  on conflict (profile_id) do update set ativo = true;

  return json_build_object('success', true);
end;
$$;

revoke all on function public.adicionar_a_banda(uuid) from public, anon;
grant execute on function public.adicionar_a_banda(uuid) to authenticated;


create or replace function public.remover_da_banda(p_profile_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'Europe/London')::date;
  v_membro uuid;
begin
  if not public.is_banda_lider() then
    raise exception 'acesso negado';
  end if;

  if exists (select 1 from public.banda_lideres where profile_id = p_profile_id) then
    return json_build_object('success', false,
      'error', 'Esta pessoa é líder da Banda. O Admin precisa tirar a liderança antes (Membros > ficha da pessoa).');
  end if;

  select id into v_membro from public.banda_membros where profile_id = p_profile_id;

  -- Escalas futuras e formacoes salvas saem; as passadas ficam como historico.
  if v_membro is not null then
    delete from public.culto_escala
     where membro_id = v_membro
       and culto_id in (select id from public.cultos where date >= v_hoje);
    delete from public.ensaio_escala
     where membro_id = v_membro
       and ensaio_id in (select id from public.ensaios where date >= v_hoje);
    delete from public.banda_time_membros where membro_id = v_membro;
    update public.banda_membros set ativo = false where id = v_membro;
  end if;

  update public.profiles set banda_acesso = false where id = p_profile_id;

  return json_build_object('success', true);
end;
$$;

revoke all on function public.remover_da_banda(uuid) from public, anon;
grant execute on function public.remover_da_banda(uuid) to authenticated;
