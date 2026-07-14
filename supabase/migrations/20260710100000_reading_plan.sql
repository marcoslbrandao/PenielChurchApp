-- Plano de leitura funcional: progresso de cada usuário no plano de 30 dias
-- com os Salmos (conteúdo do plano vive no app, só o progresso fica aqui).

create table if not exists public.reading_plan_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dia_atual int not null default 1 check (dia_atual >= 1 and dia_atual <= 31),
  atualizado_em timestamptz not null default now()
);

alter table public.reading_plan_progress enable row level security;

drop policy if exists "usuario ve seu progresso" on public.reading_plan_progress;
create policy "usuario ve seu progresso"
  on public.reading_plan_progress for select
  using (auth.uid() = user_id);

drop policy if exists "usuario cria seu progresso" on public.reading_plan_progress;
create policy "usuario cria seu progresso"
  on public.reading_plan_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "usuario atualiza seu progresso" on public.reading_plan_progress;
create policy "usuario atualiza seu progresso"
  on public.reading_plan_progress for update
  using (auth.uid() = user_id);
