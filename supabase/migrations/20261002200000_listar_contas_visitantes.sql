-- Lista as contas do app com papel 'visitante' (criaram conta mas ainda nao
-- sao membros), com nome e e-mail. O e-mail mora em auth.users, que o app nao
-- pode ler direto -- por isso a funcao e security definer e checa is_admin()
-- antes de devolver qualquer coisa.
create or replace function public.listar_contas_visitantes()
returns table (id uuid, nome text, email text, criado_em timestamptz, ultimo_acesso timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'acesso negado';
  end if;
  return query
    select p.id, p.full_name::text, u.email::text, u.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'visitante'
    order by u.created_at desc;
end;
$$;

revoke all on function public.listar_contas_visitantes() from public, anon;
grant execute on function public.listar_contas_visitantes() to authenticated;
