-- ============================================================================
-- Banda: nome completo da ficha de membro (18/10/2026)
--
-- O Marcos buscou "Bruno" para adicionar a Banda e viu "Bruno" e "Bruno
-- Speltri" — o Bruno Albuquerque nao aparecia. Aparecia sim, mas como "Bruno":
-- a lista usava o nome da CONTA (profiles.full_name), e ele criou a conta so
-- com o primeiro nome. A ficha de membro tem o nome completo.
--
-- Agora o nome mostrado (e gravado em banda_membros) e o da ficha de membro
-- (nome + sobrenome) quando existe; senao, o da conta.
-- Pode rodar de novo sem estragar nada.
-- ============================================================================

create or replace function public.nome_completo_do_perfil(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(m.nome || coalesce(' ' || nullif(btrim(m.sobrenome), ''), '')), '')
       from public.members m
      where m.profile_id = p_profile_id and m.responsavel_id is null
      order by m.created_at nulls last
      limit 1),
    (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = p_profile_id),
    'Sem nome');
$$;
revoke all on function public.nome_completo_do_perfil(uuid) from public, anon;
grant execute on function public.nome_completo_do_perfil(uuid) to authenticated;

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
    select p.id, public.nome_completo_do_perfil(p.id)::text, p.avatar_url::text
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

create or replace function public.adicionar_a_banda(p_profile_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_avatar text;
  v_nome text;
begin
  if not public.is_banda_lider() then
    raise exception 'acesso negado';
  end if;

  select role, avatar_url into v_role, v_avatar
    from public.profiles where id = p_profile_id;
  if not found then
    return json_build_object('success', false, 'error', 'Conta não encontrada.');
  end if;
  if v_role not in ('membro', 'lider', 'admin') then
    return json_build_object('success', false,
      'error', 'Só membros da igreja entram na Banda. Peça ao Admin para tornar a pessoa membro primeiro.');
  end if;
  v_nome := public.nome_completo_do_perfil(p_profile_id);

  update public.profiles set banda_acesso = true where id = p_profile_id;

  insert into public.banda_membros (profile_id, nome, avatar_url, ativo)
  values (p_profile_id, v_nome, v_avatar, true)
  on conflict (profile_id) do update set ativo = true, nome = excluded.nome;

  return json_build_object('success', true);
end;
$$;
revoke all on function public.adicionar_a_banda(uuid) from public, anon;
grant execute on function public.adicionar_a_banda(uuid) to authenticated;

-- Quem ja esta na Banda com o nome curto da conta passa a aparecer com o da ficha.
update public.banda_membros bm
   set nome = public.nome_completo_do_perfil(bm.profile_id)
 where bm.profile_id is not null
   and bm.nome is distinct from public.nome_completo_do_perfil(bm.profile_id)
   and exists (select 1 from public.members m where m.profile_id = bm.profile_id and m.responsavel_id is null);

-- --- Lideres dos grupos: busca e lista pelo nome completo ---------------------
-- A tela de escolher lider buscava em profiles.full_name: "Albuquerque" nao
-- achava o Bruno, e a lista de lideres mostrava so "Bruno". Esta busca olha o
-- nome da ficha E o da conta, e devolve o nome completo. So para o admin (a
-- mesma regra de quem pode escolher lider).
create or replace function public.buscar_contas_por_nome(p_busca text)
returns table (id uuid, nome text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'acesso negado';
  end if;
  return query
    select p.id, public.nome_completo_do_perfil(p.id)::text
      from public.profiles p
     where p.role in ('membro', 'lider', 'admin')
       and (p.full_name ilike '%' || btrim(p_busca) || '%'
            or exists (select 1 from public.members m
                        where m.profile_id = p.id and m.responsavel_id is null
                          and (coalesce(m.nome, '') || ' ' || coalesce(m.sobrenome, '')) ilike '%' || btrim(p_busca) || '%'))
     order by 2
     limit 15;
end;
$$;
revoke all on function public.buscar_contas_por_nome(text) from public, anon;
grant execute on function public.buscar_contas_por_nome(text) to authenticated;

-- Nomes completos de varias contas de uma vez (lista de lideres, nome no chat).
create or replace function public.nomes_completos(p_ids uuid[])
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, public.nome_completo_do_perfil(u.id)
    from unnest(p_ids) as u(id)
   where public.is_membro();
$$;
revoke all on function public.nomes_completos(uuid[]) from public, anon;
grant execute on function public.nomes_completos(uuid[]) to authenticated;

-- Conferencia: deve mostrar "Bruno Albuquerque"
select public.nome_completo_do_perfil('a43bb529-bacd-4da3-bbcc-830ddc0034dd') as nome;
