-- ============================================================================
-- 16/10/2026 - Entrada de membro SEM codigo de convite (decisao do Marcos)
--
-- Novo fluxo: quem baixa o app cria um perfil e entra como visitante. Se a
-- pessoa e da igreja, o Admin toca em "Tornar membro" (Membros > Visitantes).
-- Nada de gerar, enviar ou digitar codigo.
--
-- Esta migracao:
--   1. Expira os codigos de convite de MEMBRO ainda nao usados (a Banda tem
--      codigo proprio, use_banda_code, e nao muda aqui).
--   2. Garante que TODO membro, lider e admin tem ficha no diretorio
--      (members): "membros sao todos da igreja, mesmo lider ou admin".
--      Backfill agora + gatilho para os proximos.
--   3. listar_contas_visitantes passa a dizer se a conta VISITOU A IGREJA
--      (bate com um registro da Recepcao por e-mail ou telefone) ou se a
--      pessoa so baixou o app.
--   4. tornar_visitante_membro tambem marca o registro da Recepcao como
--      'virou_membro', ligado a ficha.
-- Pode rodar mais de uma vez sem problema.
-- ============================================================================


-- ─── 1. Codigos de convite de membro deixam de valer ───────────────────────
update public.invite_codes
   set expires_at = now()
 where is_used = false
   and tipo = 'membro'
   and (expires_at is null or expires_at > now());


-- ─── 2. Ficha no diretorio para todo membro / lider / admin ────────────────
create or replace function public.garantir_ficha_membro(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_full_name text;
  v_email text;
  v_phone text;
  v_primeiro_nome text;
  v_id uuid;
begin
  select id into v_id from public.members
   where profile_id = p_profile_id and responsavel_id is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select p.full_name, u.email, p.phone into v_full_name, v_email, v_phone
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = p_profile_id;
  if not found then
    return null;
  end if;

  -- Ficha que o Admin ja tinha criado a mao, com o mesmo e-mail e sem dono.
  select id into v_id from public.members
   where profile_id is null and responsavel_id is null
     and email is not null and lower(email) = lower(v_email)
   limit 1;

  if v_id is not null then
    update public.members set profile_id = p_profile_id where id = v_id;
  else
    v_primeiro_nome := split_part(coalesce(nullif(trim(v_full_name), ''), 'Membro'), ' ', 1);
    insert into public.members (nome, sobrenome, email, telefone, status, profile_id, membro_desde)
    values (
      v_primeiro_nome,
      trim(substring(coalesce(v_full_name, '') from length(v_primeiro_nome) + 1)),
      v_email, v_phone, 'membro', p_profile_id, current_date
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.garantir_ficha_membro(uuid) from public, anon, authenticated;

-- Gatilho: virou membro/lider/admin (por qualquer caminho) -> ganha ficha.
create or replace function public.profiles_garante_ficha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('membro', 'lider', 'admin')
     and (tg_op = 'INSERT' or old.role is distinct from new.role) then
    perform public.garantir_ficha_membro(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_garante_ficha_trg on public.profiles;
create trigger profiles_garante_ficha_trg
  after insert or update of role on public.profiles
  for each row execute function public.profiles_garante_ficha();

-- Backfill: quem ja e membro/lider/admin e ainda nao tem ficha.
do $$
declare r record;
begin
  for r in
    select p.id from public.profiles p
     where p.role in ('membro', 'lider', 'admin')
       and not exists (
         select 1 from public.members m
          where m.profile_id = p.id and m.responsavel_id is null)
  loop
    perform public.garantir_ficha_membro(r.id);
  end loop;
end $$;

-- Ficha de admin/lider marcada como 'visitante' por engano volta a 'membro'.
update public.members m
   set status = 'membro'
  from public.profiles p
 where p.id = m.profile_id
   and m.responsavel_id is null
   and m.status = 'visitante'
   and p.role in ('lider', 'admin');


-- ─── 3. Visitante do app: visitou a igreja ou so baixou o app? ─────────────
create or replace function public.conta_visitou_igreja(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.profiles p
      join auth.users u on u.id = p.id
      join public.visitantes v
        on (v.email is not null and lower(v.email) = lower(u.email))
        or (v.telefone_digitos is not null
            and v.telefone_digitos = public.normaliza_telefone(p.phone))
     where p.id = p_profile_id
  );
$$;

revoke all on function public.conta_visitou_igreja(uuid) from public, anon, authenticated;

-- O tipo de retorno mudou (coluna nova), entao precisa apagar antes.
drop function if exists public.listar_contas_visitantes();
create function public.listar_contas_visitantes()
returns table (
  id uuid, nome text, email text, criado_em timestamptz, ultimo_acesso timestamptz,
  avatar_url text, visitou_igreja boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'acesso negado';
  end if;
  return query
    select p.id, p.full_name::text, u.email::text, u.created_at, u.last_sign_in_at,
           p.avatar_url::text, public.conta_visitou_igreja(p.id)
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.role = 'visitante'
     order by public.conta_visitou_igreja(p.id) desc, u.created_at desc;
end;
$$;

revoke all on function public.listar_contas_visitantes() from public, anon;
grant execute on function public.listar_contas_visitantes() to authenticated;


-- ─── 4. Tornar membro: liga tambem o registro da Recepcao ──────────────────
create or replace function public.tornar_visitante_membro(p_profile_id uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_phone text;
  v_member_id uuid;
begin
  if not public.is_admin() then
    raise exception 'acesso negado';
  end if;

  select u.email, p.phone into v_email, v_phone
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = p_profile_id and p.role = 'visitante';

  if not found then
    return json_build_object('success', false, 'error', 'Conta não encontrada ou já não é visitante.');
  end if;

  -- O gatilho profiles_garante_ficha cria/liga a ficha; a chamada abaixo
  -- so devolve o id dela (e cobre o caso de o gatilho nao existir).
  update public.profiles set role = 'membro' where id = p_profile_id;
  v_member_id := public.garantir_ficha_membro(p_profile_id);

  -- Ficha antiga marcada como visitante passa a membro.
  update public.members set status = 'membro'
   where id = v_member_id and status = 'visitante';

  -- Registro da Recepcao (se a pessoa visitou a igreja) fecha o ciclo.
  update public.visitantes v
     set situacao = 'virou_membro',
         member_id = coalesce(v.member_id, v_member_id)
   where (v.email is not null and lower(v.email) = lower(v_email))
      or (v.telefone_digitos is not null
          and v.telefone_digitos = public.normaliza_telefone(v_phone));

  return json_build_object('success', true);
end;
$$;

revoke all on function public.tornar_visitante_membro(uuid) from public, anon;
grant execute on function public.tornar_visitante_membro(uuid) to authenticated;
