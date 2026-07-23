-- ============================================================================
-- Escalas — Fase 2: designações (quem serve em qual área, em qual domingo)
--
-- Diferente de `escala_area_voluntarios` (o "pool" de quem PODE ser escalado
-- numa área), esta tabela guarda a escala de fato: uma linha por
-- pessoa+área+data. É o que a tela de visualização (todos os membros) e o
-- gerador semestral (Fase 3) leem e escrevem.
--
-- `unique (membro_id, data)`: uma pessoa só pode estar escalada em UMA área
-- por domingo — é a trava que evita o "crash" de escalas (mesma pessoa em
-- duas áreas ao mesmo tempo) que o usuário pediu para não deixar acontecer.
-- ============================================================================

create table if not exists public.escala_designacoes (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.escala_areas(id) on delete cascade,
  membro_id uuid not null references public.members(id) on delete cascade,
  data date not null,
  gerado_automaticamente boolean not null default false,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (membro_id, data)
);

create index if not exists escala_designacoes_data_idx on public.escala_designacoes(data);
create index if not exists escala_designacoes_area_idx on public.escala_designacoes(area_id);

alter table public.escala_designacoes enable row level security;

-- A escala é visível a todos os membros logados (mesma decisão já tomada
-- pro time de voluntários de cada área).
drop policy if exists "Qualquer autenticado vê a escala" on public.escala_designacoes;
create policy "Qualquer autenticado vê a escala"
  on public.escala_designacoes for select
  using (auth.role() = 'authenticated');

-- Admin ou líder daquela área específica pode criar/editar/remover designações.
drop policy if exists "Líder da área gerencia a escala" on public.escala_designacoes;
create policy "Líder da área gerencia a escala"
  on public.escala_designacoes for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
    or exists (
      select 1 from public.escala_area_lideres
      where escala_area_lideres.profile_id = auth.uid()
        and escala_area_lideres.area_id = escala_designacoes.area_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
    or exists (
      select 1 from public.escala_area_lideres
      where escala_area_lideres.profile_id = auth.uid()
        and escala_area_lideres.area_id = escala_designacoes.area_id
    )
  );
