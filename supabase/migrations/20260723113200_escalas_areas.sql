-- ============================================================================
-- Escalas — Fase 1: áreas de serviço, liderança e time de voluntários
--
-- `escala_areas`: lista das áreas que têm escala (Recepção, Ministério
-- Infantil, Diáconos, Obreiros, Cantina...). Diferente dos Grupos, aqui não
-- tem nada de visual fixo no código por área — é uma lista genuína no banco,
-- então adicionar uma área nova é só um cadastro, sem deploy.
-- `vagas_padrao` guarda quantas pessoas essa área costuma precisar por data
-- (varia por área e muda com o tempo — por isso é editável, não fixo).
--
-- `escala_area_lideres`: quem lidera cada área. Mesmo esquema many-to-many
-- dos líderes de grupo — um líder pode responder por mais de uma área.
--
-- `escala_area_voluntarios`: o time de cada área, escolhido pelo líder a
-- partir do diretório de membros (`members`). É o "pool" de quem pode ser
-- escalado ali — as datas de fato (Fase 2) serão sorteadas/distribuídas
-- a partir desse time.
-- ============================================================================

create table if not exists public.escala_areas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  vagas_padrao int not null default 1 check (vagas_padrao > 0),
  created_at timestamptz not null default now()
);

alter table public.escala_areas enable row level security;

drop policy if exists "Qualquer autenticado vê áreas de escala" on public.escala_areas;
create policy "Qualquer autenticado vê áreas de escala"
  on public.escala_areas for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admin gerencia áreas de escala" on public.escala_areas;
create policy "Admin gerencia áreas de escala"
  on public.escala_areas for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));


create table if not exists public.escala_area_lideres (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.escala_areas(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (area_id, profile_id)
);

alter table public.escala_area_lideres enable row level security;

drop policy if exists "Qualquer autenticado vê líderes de área" on public.escala_area_lideres;
create policy "Qualquer autenticado vê líderes de área"
  on public.escala_area_lideres for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admin gerencia líderes de área" on public.escala_area_lideres;
create policy "Admin gerencia líderes de área"
  on public.escala_area_lideres for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));


create table if not exists public.escala_area_voluntarios (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.escala_areas(id) on delete cascade,
  membro_id uuid not null references public.members(id) on delete cascade,
  adicionado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (area_id, membro_id)
);

alter table public.escala_area_voluntarios enable row level security;

-- O time de cada área fica visível a todos os membros logados (igual a
-- escala em si vai ficar, na Fase 2) — diferente da decisão de privacidade
-- tomada pros Grupos.
drop policy if exists "Qualquer autenticado vê voluntários de área" on public.escala_area_voluntarios;
create policy "Qualquer autenticado vê voluntários de área"
  on public.escala_area_voluntarios for select
  using (auth.role() = 'authenticated');

drop policy if exists "Líder da área gerencia voluntários" on public.escala_area_voluntarios;
create policy "Líder da área gerencia voluntários"
  on public.escala_area_voluntarios for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
    or exists (
      select 1 from public.escala_area_lideres
      where escala_area_lideres.profile_id = auth.uid()
        and escala_area_lideres.area_id = escala_area_voluntarios.area_id
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
        and escala_area_lideres.area_id = escala_area_voluntarios.area_id
    )
  );


-- Áreas iniciais, com base no que já existe hoje.
insert into public.escala_areas (nome, vagas_padrao) values
  ('Recepção', 2),
  ('Ministério Infantil', 3),
  ('Diáconos', 2),
  ('Obreiros', 2),
  ('Cantina', 2)
on conflict (nome) do nothing;
