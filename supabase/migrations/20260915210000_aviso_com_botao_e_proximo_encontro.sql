-- ============================================================================
-- Aviso com botão de link + o próximo encontro visível para todos (15 Set 2026)
--
-- Dois pedidos do Marcos numa migração só, porque nascem do mesmo caso: a
-- Reunião de Oração de quarta e o Estudo Bíblico de sexta acontecem pelo Zoom,
-- e quem recebe o aviso precisa de um caminho para a sala.
--
-- 1. `avisos` GANHA `cta_texto` E `cta_url`
--    O padrão já existe no projeto — `agenda_eventos` tem os dois desde
--    20260903190000, e é assim que o card de destaque da Home mostra um botão.
--    Faltava em `avisos`, que é o que alimenta o sininho, a busca e o push. Com
--    isso, o aviso de sexta de manhã e o da oração passam a ter "Entrar no
--    Zoom" no lugar de um link colado no meio do texto.
--
--    Sem policy nova: quem já podia escrever aviso (admin, e líder no aviso do
--    próprio grupo) passa a poder preencher o botão, e quem já lia continua
--    lendo. As duas colunas seguem a RLS da linha.
--
-- 2. RPC `proximo_encontro_publico(grupo)`
--    A Home mostra "Próximos eventos" para TODO MUNDO, inclusive visitante sem
--    conta. `grupo_eventos` é fechado por `tem_acesso_grupo`, então uma leitura
--    direta faria o card do Estudo Bíblico SUMIR justamente para quem ainda não
--    é do grupo — o oposto do que um card de divulgação deve fazer.
--
--    A função devolve só DATA e HORÁRIO do próximo encontro. Nada de título,
--    descrição ou link: o horário do estudo já é informação pública (está
--    escrito no código da Home e no site da igreja desde sempre), o link do
--    Zoom não é. É essa a linha que ela não cruza.
-- ============================================================================


-- ─── 1. Botão no aviso ──────────────────────────────────────────────────────
alter table public.avisos
  add column if not exists cta_texto text,
  add column if not exists cta_url   text;

comment on column public.avisos.cta_texto is
  'Rótulo do botão do aviso ("Entrar no Zoom"). Sem `cta_url` preenchido, não aparece botão nenhum.';
comment on column public.avisos.cta_url is
  'Para onde o botão leva. Mesmo par de `agenda_eventos.cta_texto`/`cta_url` (20260903190000).';


-- ─── 2. O próximo encontro, sem abrir o resto ───────────────────────────────
create or replace function public.proximo_encontro_publico(p_grupo text)
returns table (data date, horario text, hora_inicio time)
language sql
stable
security definer
set search_path = public
as $$
  select e.data, e.horario, e.hora_inicio
  from public.grupo_eventos e
  where e.grupo = p_grupo
    -- Hoje de Londres, não do servidor: o encontro de hoje à noite ainda é o
    -- "próximo" até a data virar de verdade para quem está no Reino Unido.
    and e.data >= (now() at time zone 'Europe/London')::date
  order by e.data, e.hora_inicio nulls last
  limit 1;
$$;

-- `anon` inclusive: a Home é a primeira tela de quem ainda não tem conta, e é
-- exatamente essa pessoa que o card do Estudo Bíblico existe para alcançar.
revoke all on function public.proximo_encontro_publico(text) from public;
grant execute on function public.proximo_encontro_publico(text) to anon, authenticated;


-- ─── Conferência depois de aplicar ───────────────────────────────────────────
-- Deslogado (chave anônima):
--   select * from proximo_encontro_publico('estudo_biblico');  -- devolve 1 linha
--   select * from grupo_eventos where grupo = 'estudo_biblico'; -- devolve VAZIO
-- As duas coisas ao mesmo tempo são o ponto desta função.
