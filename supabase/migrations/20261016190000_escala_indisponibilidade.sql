-- ============================================================================
-- Escalas: dias em que o voluntario NAO pode servir (16/10/2026)
--
-- Pedido do Marcos: quem esta em alguma area de escala marca antes os dias em
-- que nao vai estar, para a escala sair certa e nao precisar de troca depois
-- de pronta. O gerador pula esses dias e o "Ver e editar escala" avisa.
--
-- Uma linha por pessoa (ficha em `members`, igual a `escala_designacoes`) por
-- dia. Janela de marcacao: de hoje ate o fim do 2o mes seguinte (em outubro,
-- ate 31/12), conferida aqui no banco tambem.
--
-- Quem ve: a propria pessoa, o admin e o lider de uma area em que ela serve.
-- O resto da igreja nao ve (diferente da banda, onde todos veem).
-- Quem mexe: so a propria pessoa (marcar e desmarcar); o admin pode apagar.
-- ============================================================================

create table if not exists public.escala_indisponibilidade (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references public.members(id) on delete cascade,
  data date not null,
  created_at timestamptz not null default now(),
  unique (membro_id, data)
);

create index if not exists escala_indisponibilidade_data_idx
  on public.escala_indisponibilidade (data);

alter table public.escala_indisponibilidade enable row level security;

-- A ficha `members` e da pessoa logada?
create or replace function public.e_minha_ficha(p_membro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where id = p_membro_id and profile_id = auth.uid()
  );
$$;

-- A pessoa logada lidera alguma area em que esse membro serve?
create or replace function public.lidera_area_do_voluntario(p_membro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.escala_area_voluntarios v
    join public.escala_area_lideres l on l.area_id = v.area_id
    where v.membro_id = p_membro_id and l.profile_id = auth.uid()
  );
$$;

revoke all on function public.e_minha_ficha(uuid) from public;
revoke all on function public.lidera_area_do_voluntario(uuid) from public;
grant execute on function public.e_minha_ficha(uuid) to authenticated;
grant execute on function public.lidera_area_do_voluntario(uuid) to authenticated;

drop policy if exists "Ve indisponibilidade da escala" on public.escala_indisponibilidade;
create policy "Ve indisponibilidade da escala"
  on public.escala_indisponibilidade for select
  using (
    public.e_minha_ficha(membro_id)
    or public.is_admin()
    or public.lidera_area_do_voluntario(membro_id)
  );

drop policy if exists "Marca os proprios dias de escala" on public.escala_indisponibilidade;
create policy "Marca os proprios dias de escala"
  on public.escala_indisponibilidade for insert
  with check (
    public.e_minha_ficha(membro_id)
    and data >= current_date
    and data < (date_trunc('month', current_date) + interval '3 months')::date
  );

drop policy if exists "Desmarca os proprios dias de escala" on public.escala_indisponibilidade;
create policy "Desmarca os proprios dias de escala"
  on public.escala_indisponibilidade for delete
  using (public.e_minha_ficha(membro_id) or public.is_admin());

-- Conferencia depois de aplicar:
--   select policyname, cmd from pg_policies where tablename = 'escala_indisponibilidade';
--   (3 linhas: SELECT, INSERT, DELETE)
