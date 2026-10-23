-- Rodar no SQL Editor do Supabase DEPOIS da migracao
-- 20261023130000_escala_area_sem_conflito.sql (ou junto, colando as duas).
--
-- Refazer a escala da Cantina (pedido do Marcos, 23/10): apaga a Cantina de
-- 01/11 em diante. O domingo 25/10 (Marinelza) fica como esta.
-- Depois: Admin > Escalas > Gerar escala, De 01/11/2026, so a Cantina marcada.

delete from public.escala_designacoes d
using public.escala_areas a
where a.id = d.area_id
  and a.nome ilike 'cantina%'
  and d.data >= date '2026-11-01';

-- Conferencia: o que sobrou da Cantina daqui pra frente (deve ser so 25/10).
select d.data, m.nome, m.sobrenome
from public.escala_designacoes d
join public.escala_areas a on a.id = d.area_id
join public.members m on m.id = d.membro_id
where a.nome ilike 'cantina%' and d.data >= current_date
order by d.data;
