-- ============================================================================
-- Escalas em dupla (17/10/2026)
--
-- Pedido do Marcos: nos Diaconos quem serve e o casal. Cada area passa a ter
-- um modo:
--   em_duplas = false -> como antes: o gerador escolhe pessoa por pessoa.
--   em_duplas = true  -> o gerador escala as duplas definidas aqui juntas
--                        (as duas pessoas no mesmo culto). Quem do time nao
--                        estiver em dupla continua sendo escalado sozinho.
-- Se uma pessoa da dupla marcou que nao pode, a dupla inteira fica de fora
-- naquele dia.
-- ============================================================================

alter table public.escala_areas
  add column if not exists em_duplas boolean not null default false;

create table if not exists public.escala_duplas (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.escala_areas(id) on delete cascade,
  membro_a uuid not null references public.members(id) on delete cascade,
  membro_b uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (membro_a <> membro_b)
);

-- Uma pessoa so pode estar em UMA dupla por area.
create unique index if not exists escala_duplas_area_a_idx on public.escala_duplas (area_id, membro_a);
create unique index if not exists escala_duplas_area_b_idx on public.escala_duplas (area_id, membro_b);

create or replace function public.escala_dupla_sem_repetir()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.escala_duplas d
    where d.area_id = new.area_id and d.id <> new.id
      and (d.membro_a in (new.membro_a, new.membro_b) or d.membro_b in (new.membro_a, new.membro_b))
  ) then
    raise exception 'Essa pessoa ja esta em outra dupla nesta area' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists escala_dupla_sem_repetir on public.escala_duplas;
create trigger escala_dupla_sem_repetir
  before insert or update on public.escala_duplas
  for each row execute function public.escala_dupla_sem_repetir();

alter table public.escala_duplas enable row level security;

drop policy if exists "Qualquer autenticado ve as duplas" on public.escala_duplas;
create policy "Qualquer autenticado ve as duplas"
  on public.escala_duplas for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admin ou lider da area monta as duplas" on public.escala_duplas;
create policy "Admin ou lider da area monta as duplas"
  on public.escala_duplas for all
  using (public.is_admin() or public.lidera_area_escala(area_id))
  with check (public.is_admin() or public.lidera_area_escala(area_id));

-- Conferencia:
select column_name from information_schema.columns
 where table_name = 'escala_areas' and column_name = 'em_duplas'
union all
select policyname from pg_policies where tablename = 'escala_duplas';
