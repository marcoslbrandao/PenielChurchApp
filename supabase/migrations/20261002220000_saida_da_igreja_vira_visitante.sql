-- Quem deixa a igreja sai da area de membros mas continua com a conta do app,
-- como visitante. A ficha no diretorio (members) e mantida com status
-- 'visitante' -- o historico (presencas, escalas antigas) continua ligado a ela.
--
-- O gatilho abaixo mantem profiles.role em sincronia com o status da ficha:
--   membro/lider -> visitante : conta vira 'visitante' (admin nunca e rebaixado),
--                               perde banda, lideranca de grupo, lideranca de
--                               area de escala e participacao nos grupos.
--   visitante -> membro/lider : conta visitante volta a 'membro'.
-- So admin muda o status da ficha (members_protege_campos_trg), entao o
-- gatilho nao abre caminho de escalada. Tambem saem: voluntariado e escalas
-- futuras das areas, equipes (acolhimento/recepcao), escalas futuras da banda
-- (cultos e ensaios) e os times da banda.
create or replace function public.members_sincroniza_papel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'Europe/London')::date;
  v_banda uuid;
begin
  if new.responsavel_id is not null then
    return new;
  end if;

  if new.status = 'visitante' and old.status is distinct from 'visitante' then
    -- Grupos e escalas moram na ficha (members.id): vale mesmo sem conta.
    delete from public.grupo_membros where membro_id = new.id;
    delete from public.escala_area_voluntarios where membro_id = new.id;
    -- Escalas futuras saem; as passadas ficam como historico.
    delete from public.escala_designacoes where membro_id = new.id and data >= v_hoje;

    if new.profile_id is not null then
      update public.profiles
        set role = 'visitante', banda_acesso = false
        where id = new.profile_id and role <> 'admin';
      delete from public.group_leaders where profile_id = new.profile_id;
      delete from public.escala_area_lideres where profile_id = new.profile_id;
      delete from public.equipes_membros where profile_id = new.profile_id;

      select id into v_banda from public.banda_membros where profile_id = new.profile_id;
      if v_banda is not null then
        delete from public.culto_escala
          where membro_id = v_banda
            and culto_id in (select id from public.cultos where date >= v_hoje);
        delete from public.ensaio_escala
          where membro_id = v_banda
            and ensaio_id in (select id from public.ensaios where date >= v_hoje);
        delete from public.banda_time_membros where membro_id = v_banda;
      end if;
    end if;
  elsif new.status in ('membro', 'lider') and old.status = 'visitante' and new.profile_id is not null then
    update public.profiles
      set role = 'membro'
      where id = new.profile_id and role = 'visitante';
  end if;

  return new;
end;
$$;

drop trigger if exists members_sincroniza_papel_trg on public.members;
create trigger members_sincroniza_papel_trg
  after update of status on public.members
  for each row execute function public.members_sincroniza_papel();

-- tornar_visitante_membro: se a pessoa ja tem ficha (saiu e voltou), a ficha
-- volta para 'membro' tambem.
create or replace function public.tornar_visitante_membro(p_profile_id uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_full_name text;
  v_email text;
  v_primeiro_nome text;
  v_existing_id uuid;
begin
  if not public.is_admin() then
    raise exception 'acesso negado';
  end if;

  select p.full_name, u.email into v_full_name, v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_profile_id and p.role = 'visitante';

  if not found then
    return json_build_object('success', false, 'error', 'Conta não encontrada ou já não é visitante.');
  end if;

  update public.profiles set role = 'membro' where id = p_profile_id;

  select id into v_existing_id from public.members where profile_id = p_profile_id;
  if v_existing_id is not null then
    update public.members set status = 'membro' where id = v_existing_id and status = 'visitante';
  else
    select id into v_existing_id from public.members
    where profile_id is null and email is not null and lower(email) = lower(v_email)
    limit 1;

    if v_existing_id is not null then
      update public.members set profile_id = p_profile_id,
        status = case when status = 'visitante' then 'membro' else status end
      where id = v_existing_id;
    else
      v_primeiro_nome := split_part(coalesce(v_full_name, 'Membro'), ' ', 1);
      insert into public.members (nome, sobrenome, email, status, profile_id, membro_desde)
      values (
        v_primeiro_nome,
        trim(substring(coalesce(v_full_name, '') from length(v_primeiro_nome) + 1)),
        v_email, 'membro', p_profile_id, current_date
      );
    end if;
  end if;

  return json_build_object('success', true);
end;
$$;

revoke all on function public.tornar_visitante_membro(uuid) from public, anon;
grant execute on function public.tornar_visitante_membro(uuid) to authenticated;


-- tornar_membro_visitante: o botao "Saiu da igreja" do Admin chama esta
-- funcao (e nao um update solto), para ficar explicito e conferido no banco.
create or replace function public.tornar_membro_visitante(p_member_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ficha public.members%rowtype;
begin
  if not public.is_admin() then
    raise exception 'acesso negado';
  end if;

  select * into v_ficha from public.members where id = p_member_id;
  if not found then
    return json_build_object('success', false, 'error', 'Cadastro não encontrado.');
  end if;
  if v_ficha.responsavel_id is not null then
    return json_build_object('success', false, 'error', 'Cadastro de criança não muda de status.');
  end if;
  if v_ficha.status = 'visitante' then
    return json_build_object('success', false, 'error', 'Já é visitante.');
  end if;
  if v_ficha.profile_id is not null and exists (
    select 1 from public.profiles where id = v_ficha.profile_id and role = 'admin'
  ) then
    return json_build_object('success', false, 'error', 'Esta pessoa é administradora. Tire o acesso de admin antes.');
  end if;

  update public.members set status = 'visitante' where id = p_member_id;
  return json_build_object('success', true);
end;
$$;

revoke all on function public.tornar_membro_visitante(uuid) from public, anon;
grant execute on function public.tornar_membro_visitante(uuid) to authenticated;

-- listar_contas_visitantes passa a devolver a foto do perfil tambem.
drop function if exists public.listar_contas_visitantes();
create function public.listar_contas_visitantes()
returns table (id uuid, nome text, email text, criado_em timestamptz, ultimo_acesso timestamptz, avatar_url text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'acesso negado';
  end if;
  return query
    select p.id, p.full_name::text, u.email::text, u.created_at, u.last_sign_in_at, p.avatar_url::text
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'visitante'
    order by u.created_at desc;
end;
$$;

revoke all on function public.listar_contas_visitantes() from public, anon;
grant execute on function public.listar_contas_visitantes() to authenticated;
