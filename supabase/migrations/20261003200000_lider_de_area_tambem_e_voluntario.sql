-- Lider de area de escala tambem e voluntario da area.
--
-- escala_area_lideres (quem monta a escala) e escala_area_voluntarios (quem
-- pode ser escalado) eram listas separadas: marcar a Blenda como lider da
-- Recepcao dava a ela o poder de montar a escala, mas ela nao aparecia na
-- lista da Recepcao nem entrava na escala. Agora, virar lider poe a ficha da
-- pessoa como voluntaria da area. Tirar a lideranca NAO tira do voluntariado
-- (o lider pode continuar servindo; remove-se pela lista, se for o caso).

create or replace function public.lider_de_area_vira_voluntario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.escala_area_voluntarios (area_id, membro_id, adicionado_por)
  select new.area_id, m.id, auth.uid()
  from public.members m
  where m.profile_id = new.profile_id and m.responsavel_id is null
    and m.status <> 'visitante'
  on conflict (area_id, membro_id) do nothing;
  return new;
end;
$$;

drop trigger if exists lider_de_area_vira_voluntario_trg on public.escala_area_lideres;
create trigger lider_de_area_vira_voluntario_trg
  after insert on public.escala_area_lideres
  for each row execute function public.lider_de_area_vira_voluntario();

-- Ficha ligada a uma conta DEPOIS de a conta ja ser lider: entra tambem.
create or replace function public.ficha_ligada_entra_nas_areas_lideradas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is not null and new.profile_id is distinct from old.profile_id
     and new.responsavel_id is null and new.status <> 'visitante' then
    insert into public.escala_area_voluntarios (area_id, membro_id, adicionado_por)
    select l.area_id, new.id, auth.uid()
    from public.escala_area_lideres l
    where l.profile_id = new.profile_id
    on conflict (area_id, membro_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists ficha_ligada_entra_nas_areas_lideradas_trg on public.members;
create trigger ficha_ligada_entra_nas_areas_lideradas_trg
  after update of profile_id on public.members
  for each row execute function public.ficha_ligada_entra_nas_areas_lideradas();

-- Quem ja e lider hoje (a Blenda na Recepcao, por exemplo) entra agora.
insert into public.escala_area_voluntarios (area_id, membro_id)
select l.area_id, m.id
from public.escala_area_lideres l
join public.members m on m.profile_id = l.profile_id
where m.responsavel_id is null and m.status <> 'visitante'
on conflict (area_id, membro_id) do nothing;
