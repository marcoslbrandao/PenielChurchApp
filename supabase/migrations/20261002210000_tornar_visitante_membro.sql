-- Admin promove uma conta de visitante a membro, direto da lista
-- "Visitantes com conta" (Admin -> Estatisticas). Faz o mesmo que
-- use_invite_code faz quando a pessoa resgata um convite: muda o papel para
-- 'membro' e garante a ficha no diretorio (members), casando por e-mail com
-- uma ficha sem dono ou criando uma nova.
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
  if v_existing_id is null then
    select id into v_existing_id from public.members
    where profile_id is null and email is not null and lower(email) = lower(v_email)
    limit 1;

    if v_existing_id is not null then
      update public.members set profile_id = p_profile_id where id = v_existing_id;
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
