-- ============================================================================
-- CONSERTO 11/10/2026 — desfaz o que a migração antiga 20260709000000
-- (profiles_and_invite_codes) trouxe de volta ao ser rodada por engano.
--
-- 1. Fecha de novo os códigos de convite: qualquer pessoa logada voltou a
--    conseguir LER todos os códigos (e virar membro com o de outra pessoa).
-- 2. Tira de novo dos líderes o poder de criar convites (só o Admin).
-- 3. Remove a policy antiga de perfil (a "Admin vê todos os perfis" já cobre).
-- 4. Volta a versão certa de use_invite_code (trava de corrida + diretório de
--    membros), copiada de 20260909010000_correcoes_seguranca.sql.
-- Pode rodar mais de uma vez sem problema.
-- ============================================================================

drop policy if exists "Usuário pode verificar código" on public.invite_codes;
drop policy if exists "Líderes gerenciam convites" on public.invite_codes;
drop policy if exists "Perfil visível pelo próprio usuário" on public.profiles;

create or replace function public.use_invite_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invite_codes%rowtype;
  v_user_id uuid := auth.uid();
  v_full_name text;
  v_email text;
  v_primeiro_nome text;
  v_existing_id uuid;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'Sessão inválida.');
  end if;
  if btrim(coalesce(p_code, '')) = '' then
    return json_build_object('success', false, 'error', 'Código inválido ou expirado.');
  end if;

  select * into v_invite
  from public.invite_codes
  where code = upper(btrim(p_code))
    and is_used = false
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    return json_build_object('success', false, 'error', 'Código inválido ou expirado.');
  end if;

  update public.invite_codes
  set is_used = true, used_by = v_user_id, used_at = now()
  where id = v_invite.id;

  update public.profiles
  set role = 'membro'
  where id = v_user_id;

  select id into v_existing_id from public.members where profile_id = v_user_id;

  if v_existing_id is null then
    select p.full_name, u.email into v_full_name, v_email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = v_user_id;

    select id into v_existing_id from public.members
    where profile_id is null and email is not null and lower(email) = lower(v_email)
    limit 1;

    if v_existing_id is not null then
      update public.members set profile_id = v_user_id where id = v_existing_id;
    else
      v_primeiro_nome := split_part(coalesce(v_full_name, 'Membro'), ' ', 1);
      insert into public.members (nome, sobrenome, email, status, profile_id, membro_desde)
      values (
        v_primeiro_nome,
        trim(substring(coalesce(v_full_name, '') from length(v_primeiro_nome) + 1)),
        v_email,
        'membro',
        v_user_id,
        current_date
      );
    end if;
  end if;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.use_invite_code(text) to authenticated;
