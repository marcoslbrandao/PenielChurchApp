-- 13/10/2026 - Estudo Biblico: a aula da semana da mudanca (sexta -> quarta)
-- aconteceu na QUINTA 08/10, e nao havia encontro nesse dia (as sextas
-- geradas foram apagadas em 20261008100000). Sem encontro, a chamada nao
-- tinha onde ser feita. JA APLICADO no SQL Editor (id 0d9d8087-...).
-- Marcado como gerado_automaticamente = true para nao mandar push de
-- "Novo encontro" ao grupo por uma aula que ja passou.
insert into public.grupo_eventos (
  grupo, titulo, descricao, data, horario, hora_inicio,
  local, tipo, link_online, roteiro, gerado_automaticamente
)
select r.grupo, r.titulo, r.descricao, date '2026-10-08', r.horario, r.hora_inicio,
       r.local, r.tipo, r.link_online, r.roteiro, true
from public.grupo_recorrencias r
where r.grupo = 'estudo_biblico'
  and not exists (
    select 1 from public.grupo_eventos e
    where e.grupo = 'estudo_biblico' and e.data = date '2026-10-08'
  );
