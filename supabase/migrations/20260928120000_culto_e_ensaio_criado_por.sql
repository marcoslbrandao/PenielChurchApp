-- ============================================================================
-- Quem criou o culto e o ensaio (28 Set 2026)
--
-- Pedido do Marcos: quando o ministro cria um culto e salva como RASCUNHO,
-- ele precisa conseguir voltar depois pra terminar e publicar. Até aqui o
-- rascunho só aparecia pro admin.
--
-- O app já deixa ver/publicar o rascunho quem é o ministro do culto
-- (`ministro_id`, preenchido sozinho por quem monta o setlist). Mas um culto
-- salvo como rascunho SEM músicas ainda não tem ministro — e sumiria da tela
-- de quem criou. Esta coluna fecha esse buraco.
--
-- `default auth.uid()`: o app não precisa mandar nada; o banco grava quem
-- estava logado no insert. Cultos antigos ficam null (não dá pra saber quem
-- criou) e continuam como estavam.
--
-- Continua sendo filtro de INTERFACE (ver 20260902180000): a RLS de `cultos`
-- já deixa qualquer membro da banda ler e editar.
-- ============================================================================

alter table public.cultos
  add column if not exists criado_por uuid default auth.uid()
    references auth.users(id) on delete set null;

comment on column public.cultos.criado_por is
  'Quem criou o culto (auth.uid() no insert). Usado pra deixar o autor ver e publicar o próprio rascunho.';


-- Ensaio não tem ministro: aqui o autor é a ÚNICA forma, além do admin, de
-- alguém voltar no próprio rascunho. Mesmo esquema do culto.
alter table public.ensaios
  add column if not exists criado_por uuid default auth.uid()
    references auth.users(id) on delete set null;

comment on column public.ensaios.criado_por is
  'Quem criou o ensaio (auth.uid() no insert). Usado pra deixar o autor ver e publicar o próprio rascunho.';
