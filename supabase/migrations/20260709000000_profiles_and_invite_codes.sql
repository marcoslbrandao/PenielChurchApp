-- ============================================================================
-- Documentação retroativa: perfis de usuário e códigos de convite
--
-- As tabelas `profiles` e `invite_codes`, a função `use_invite_code`, e a
-- função/trigger `handle_new_user` já existem e estão em uso no banco de
-- dados de produção — foram criadas diretamente pelo Editor SQL do Supabase,
-- fora do controle de versão. Esta migração documenta essas peças
-- retroativamente, usando `if not exists` / `create or replace` em tudo,
-- para não alterar nada que já está funcionando. Serve como registro
-- histórico e para permitir recriar o banco do zero (ex: ambiente de teste
-- novo, ou recuperação de desastre) a partir apenas dos arquivos do repositório.
-- ============================================================================

-- Perfil de cada usuário autenticado (1 linha por usuário do Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  avatar_url text,
  baptized boolean default false,
  member_since date,
  role text default 'visitante',
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Perfil visível pelo próprio usuário" on public.profiles;
create policy "Perfil visível pelo próprio usuário"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Perfil editável pelo próprio usuário" on public.profiles;
create policy "Perfil editável pelo próprio usuário"
  on public.profiles for update
  using (auth.uid() = id);

-- Cria automaticamente uma linha em `profiles` quando um novo usuário se
-- cadastra no Supabase Auth (auth.users)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Códigos de convite: usados para promover um usuário comum (visitante) a
-- membro. A coluna `tipo` (para distinguir convites de banda) é adicionada
-- depois, de forma idempotente, em 20260710090000_banda_invite_codes.sql.
create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  created_by uuid,
  assigned_to_email text,
  used_by uuid,
  used_at timestamptz,
  expires_at timestamptz,
  is_used boolean default false,
  created_at timestamptz default now()
);

alter table public.invite_codes enable row level security;

drop policy if exists "Líderes gerenciam convites" on public.invite_codes;
create policy "Líderes gerenciam convites"
  on public.invite_codes for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = any (array['lider', 'admin'])
    )
  );

drop policy if exists "Usuário pode verificar código" on public.invite_codes;
create policy "Usuário pode verificar código"
  on public.invite_codes for select
  using (auth.uid() is not null);

-- Resgata um código de convite: marca como usado e promove o perfil do
-- usuário atual para 'membro'
create or replace function public.use_invite_code(p_code text)
returns json
language plpgsql
security definer
as $$
declare
  v_invite invite_codes%rowtype;
  v_user_id uuid := auth.uid();
begin
  select * into v_invite
  from public.invite_codes
  where code = upper(p_code)
    and is_used = false
    and (expires_at is null or expires_at > now());

  if not found then
    return json_build_object('success', false, 'error', 'Código inválido ou expirado.');
  end if;

  update public.invite_codes
  set is_used = true, used_by = v_user_id, used_at = now()
  where id = v_invite.id;

  update public.profiles
  set role = 'membro'
  where id = v_user_id;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.use_invite_code(text) to authenticated;
