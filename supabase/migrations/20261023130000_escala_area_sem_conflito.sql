-- ============================================================================
-- Area de escala "sem conflito" (23/10/2026)
--
-- Pedido do Marcos: a escala da Cantina nao conflita com as outras. Quem esta
-- na Cantina pode estar escalado no mesmo culto em outra area (Recepcao,
-- Diaconos...). So a Cantina tem isso; as outras continuam com a trava de
-- "uma area por culto".
--
-- Antes a trava era `unique (membro_id, data)`. Agora:
--   * `unique (area_id, membro_id, data)`: ninguem duas vezes na MESMA area
--     no mesmo dia;
--   * trigger: entre areas normais (sem_conflito = false) continua valendo
--     uma area por culto. Area sem_conflito nao conta e nao e barrada.
-- ============================================================================

alter table public.escala_areas
  add column if not exists sem_conflito boolean not null default false;

update public.escala_areas set sem_conflito = true where nome ilike 'cantina%';

-- Tira a trava antiga (unique em membro_id + data), qualquer que seja o nome.
do $$
declare c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.escala_designacoes'::regclass
      and con.contype = 'u'
      and (select array_agg(att.attname::text order by att.attname)
           from unnest(con.conkey) k join pg_attribute att
             on att.attrelid = con.conrelid and att.attnum = k) = array['data','membro_id']
  loop
    execute format('alter table public.escala_designacoes drop constraint %I', c);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'escala_designacoes_area_membro_data_key'
  ) then
    alter table public.escala_designacoes
      add constraint escala_designacoes_area_membro_data_key unique (area_id, membro_id, data);
  end if;
end $$;

create or replace function public.escala_designacao_sem_conflito_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.escala_areas where id = new.area_id and sem_conflito) then
    return new;
  end if;
  if exists (
    select 1
    from public.escala_designacoes d
    join public.escala_areas a on a.id = d.area_id
    where d.membro_id = new.membro_id
      and d.data = new.data
      and d.id <> new.id
      and d.area_id <> new.area_id
      and not a.sem_conflito
  ) then
    raise exception 'Esta pessoa ja esta escalada em outra area neste dia.'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists escala_designacao_sem_conflito_trg on public.escala_designacoes;
create trigger escala_designacao_sem_conflito_trg
  before insert or update of area_id, membro_id, data on public.escala_designacoes
  for each row execute function public.escala_designacao_sem_conflito_check();

-- Conferencia:
select nome, sem_conflito from public.escala_areas order by nome;
