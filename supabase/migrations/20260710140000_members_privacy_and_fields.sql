-- ============================================================================
-- 1. PRIVACIDADE: a tabela `members` guarda dados sensíveis (telefone, email,
--    endereço completo, data de nascimento) e a tela que a lista (MembrosScreen)
--    hoje é visível para QUALQUER membro logado, não só admin/líder. Este
--    bloco tranca a tabela via RLS pra só admin/líder conseguirem ler/editar,
--    mesmo que a tela em algum outro lugar tente buscar sem checar o cargo.
--    Rode isto o quanto antes — é uma correção de privacidade, não só uma
--    conveniência.
-- ============================================================================
alter table public.members enable row level security;

drop policy if exists "Admin/líder gerencia membros" on public.members;
create policy "Admin/líder gerencia membros"
  on public.members for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ));

-- ============================================================================
-- 2. Campos novos no cadastro: sexo, país, talentos/hobbies, e vínculos
--    familiares (cônjuge, pai, mãe — todos apontando pra outro registro na
--    própria tabela `members`).
-- ============================================================================
alter table public.members
  add column if not exists sexo text check (sexo in ('masculino', 'feminino', 'prefiro_nao_informar')),
  add column if not exists pais text default 'Reino Unido',
  add column if not exists talentos_hobbies text,
  add column if not exists conjuge_id uuid references public.members(id) on delete set null,
  add column if not exists pai_id uuid references public.members(id) on delete set null,
  add column if not exists mae_id uuid references public.members(id) on delete set null;
