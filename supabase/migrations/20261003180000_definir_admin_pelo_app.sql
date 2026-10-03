-- Tornar / remover administrador pelo app (Membros > ficha do membro).
--
-- So admin chama. O papel muda em profiles.role, que e o que o app e o banco
-- (is_admin) leem. Protecoes:
--   * a pessoa precisa ter conta no app (profiles);
--   * nao remove o ULTIMO admin (a igreja ficaria sem ninguem para administrar);
--   * ao remover, a pessoa volta para 'lider' se a ficha for de lider, senao 'membro'.
create or replace function public.definir_admin(p_profile_id uuid, p_admin boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'acesso negado';
  end if;

  select role into v_role from public.profiles where id = p_profile_id;
  if not found then
    return json_build_object('success', false, 'error', 'Esta pessoa não tem conta no app.');
  end if;

  if p_admin then
    if v_role = 'admin' then
      return json_build_object('success', true);
    end if;
    update public.profiles set role = 'admin' where id = p_profile_id;
    -- Ficha de visitante vira membro: admin nao pode ficar marcado como visitante.
    update public.members set status = 'membro'
      where profile_id = p_profile_id and status = 'visitante' and responsavel_id is null;
  else
    if v_role <> 'admin' then
      return json_build_object('success', true);
    end if;
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      return json_build_object('success', false, 'error', 'Não dá para remover o último administrador.');
    end if;
    select status into v_status from public.members
      where profile_id = p_profile_id and responsavel_id is null limit 1;
    update public.profiles
      set role = case when v_status = 'lider' then 'lider' else 'membro' end
      where id = p_profile_id;
  end if;

  return json_build_object('success', true);
end;
$$;

revoke all on function public.definir_admin(uuid, boolean) from public, anon;
grant execute on function public.definir_admin(uuid, boolean) to authenticated;
