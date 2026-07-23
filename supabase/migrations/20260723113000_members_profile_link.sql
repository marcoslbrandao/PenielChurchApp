-- ============================================================================
-- Vínculo entre o diretório de membros (`members`) e a conta de login do app
-- (`profiles`/`auth.users`).
--
-- Até agora essas duas tabelas eram independentes: `members` guarda o
-- cadastro completo da igreja (nome, telefone, ministério...), e `profiles`
-- é criada automaticamente quando alguém se cadastra no app. Não havia como
-- saber, a partir do usuário logado, qual linha do diretório é a dele —
-- o que impede features como "meus dias na escala" ou "meu grupo".
--
-- Esta migração adiciona `members.profile_id`, preenchido manualmente pelo
-- admin (ao editar o cadastro do membro) ou futuramente de forma automática
-- quando alguém resgatar um convite com o mesmo email já cadastrado no
-- diretório.
-- ============================================================================

alter table public.members
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create index if not exists members_profile_id_idx on public.members(profile_id);

-- Evita vincular a mesma conta a mais de um registro do diretório por engano
create unique index if not exists members_profile_id_unique
  on public.members(profile_id) where profile_id is not null;

-- Permite que o próprio usuário logado veja seu registro no diretório (hoje
-- só admin/líder conseguem ler `members`). Necessário pra telas de "meus
-- grupos" e "minhas escalas" funcionarem sem precisar de privilégio de admin.
drop policy if exists "Usuário vê seu próprio registro no diretório" on public.members;
create policy "Usuário vê seu próprio registro no diretório"
  on public.members for select
  using (profile_id = auth.uid());
