-- ============================================================================
-- Escalas: lider obrigatorio por culto (17/10/2026)
--
-- Pedido do Marcos para o Ministerio Infantil: em todo culto tem que ter um
-- lider. Hoje sao 4 lideres e 2 auxiliares. Regra:
--   1a vaga  -> sempre um lider;
--   as demais -> qualquer um do time (lideres que sobraram ou auxiliares).
--
-- escala_areas.exige_lider          -> liga a regra na area (so o admin muda).
-- escala_area_voluntarios.lider_de_turno -> marca quem do time e lider
--                                       (admin ou lider da area marca).
-- ============================================================================

alter table public.escala_areas
  add column if not exists exige_lider boolean not null default false;

alter table public.escala_area_voluntarios
  add column if not exists lider_de_turno boolean not null default false;

-- A tela do time (admin e lider da area) le por esta funcao, por causa da
-- RLS de members. Agora devolve tambem quem e lider.
drop function if exists public.voluntarios_da_area(uuid);
create function public.voluntarios_da_area(p_area_id uuid)
returns table (id uuid, area_id uuid, membro_id uuid, nome text, sobrenome text, lider_de_turno boolean)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.area_id, v.membro_id, m.nome, m.sobrenome, v.lider_de_turno
  from public.escala_area_voluntarios v
  join public.members m on m.id = v.membro_id
  where (public.is_admin() or public.lidera_area_escala(p_area_id))
    and v.area_id = p_area_id
  order by m.nome, m.sobrenome;
$$;
revoke all on function public.voluntarios_da_area(uuid) from public;
grant execute on function public.voluntarios_da_area(uuid) to authenticated;

-- Conferencia (2 linhas):
select table_name, column_name from information_schema.columns
 where (table_name = 'escala_areas' and column_name = 'exige_lider')
    or (table_name = 'escala_area_voluntarios' and column_name = 'lider_de_turno');
