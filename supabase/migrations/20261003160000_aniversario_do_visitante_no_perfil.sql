-- Aniversario do visitante que so tem conta no app (sem ficha em members).
--
-- O visitante preenche "Data de aniversario" no Perfil -> profiles.data_nascimento.
-- meu_aniversario_hoje passa a olhar a ficha (se houver) OU o perfil.
-- tornar_visitante_membro leva a data para a ficha quando a pessoa vira membro.
-- A Edge Function birthday-notifications tambem le profiles.data_nascimento.

alter table public.profiles add column if not exists data_nascimento date;

create or replace function public.meu_aniversario_hoje()
returns table (nome text, mensagem text)
language sql
security definer
stable
set search_path = public
as $$
  with hoje as (
    select (now() at time zone 'Europe/London')::date as d
  ),
  eu as (
    -- Ficha de visitante, se existir; senao o proprio perfil (conta visitante).
    select coalesce(m.nome, split_part(coalesce(p.full_name, ''), ' ', 1)) as nome,
           coalesce(m.data_nascimento, p.data_nascimento) as nascimento
    from public.profiles p
    left join public.members m
      on m.profile_id = p.id and m.responsavel_id is null
    where p.id = auth.uid()
      and (
        m.status = 'visitante'
        or (m.id is null and p.role = 'visitante')
      )
    limit 1
  )
  select
    eu.nome,
    replace(
      coalesce((select texto from public.textos_app where chave = 'aniversario_visitante'), ''),
      '{nome}', eu.nome
    ) as mensagem
  from eu, hoje
  where auth.uid() is not null
    and eu.nascimento is not null
    and extract(month from eu.nascimento) = extract(month from hoje.d)
    and extract(day   from eu.nascimento) = extract(day   from hoje.d);
$$;

revoke all on function public.meu_aniversario_hoje() from public, anon;
grant execute on function public.meu_aniversario_hoje() to authenticated;

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
  v_nascimento date;
begin
  if not public.is_admin() then
    raise exception 'acesso negado';
  end if;

  select p.full_name, u.email, p.data_nascimento into v_full_name, v_email, v_nascimento
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
    update public.members set data_nascimento = v_nascimento
      where id = v_existing_id and data_nascimento is null and v_nascimento is not null;
  else
    select id into v_existing_id from public.members
    where profile_id is null and email is not null and lower(email) = lower(v_email)
    limit 1;

    if v_existing_id is not null then
      update public.members set profile_id = p_profile_id,
        status = case when status = 'visitante' then 'membro' else status end,
        data_nascimento = coalesce(data_nascimento, v_nascimento)
      where id = v_existing_id;
    else
      v_primeiro_nome := split_part(coalesce(v_full_name, 'Membro'), ' ', 1);
      insert into public.members (nome, sobrenome, email, status, profile_id, membro_desde, data_nascimento)
      values (
        v_primeiro_nome,
        trim(substring(coalesce(v_full_name, '') from length(v_primeiro_nome) + 1)),
        v_email, 'membro', p_profile_id, current_date, v_nascimento
      );
    end if;
  end if;

  return json_build_object('success', true);
end;
$$;


revoke all on function public.tornar_visitante_membro(uuid) from public, anon;
grant execute on function public.tornar_visitante_membro(uuid) to authenticated;
