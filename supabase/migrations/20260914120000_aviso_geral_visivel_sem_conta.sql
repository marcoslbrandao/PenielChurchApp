-- ============================================================================
-- Aviso geral visível para quem não tem conta (14 Set 2026)
--
-- O QUE ESTAVA ERRADO
-- A policy de leitura do aviso geral era
--   using (grupo is null and auth.role() = 'authenticated')
-- ou seja, quem abre o app sem criar conta não via aviso NENHUM: o sininho e
-- a aba de avisos mostravam "Nenhum aviso publicado ainda" — uma frase falsa,
-- porque os avisos existem. Primeira impressão de app morto, justamente para
-- o visitante que a igreja mais quer alcançar.
--
-- POR QUE ISTO É DESCUIDO E NÃO DECISÃO
-- Todo o resto do conteúdo geral já é público para quem não tem conta:
--   • `agenda_eventos`  → "Qualquer um vê a agenda"        using (true)
--   • `mensagens`       → "Qualquer um vê as mensagens"    using (true)
--   • `shorts_videos`   → "Short geral é público"          using (grupo is null)
--   • `devocionais`     → "Devocional geral é público pra todos"
--                                                          using (grupo is null)
-- O devocional tinha exatamente este mesmo defeito e foi corrigido em
-- 20260824090000, com esta justificativa no cabeçalho: "por isso quem não
-- estava logado (visitante) não conseguia ver nem na Home nem na tela
-- Devocionais". Naquele dia `avisos` ficou de fora. Esta migração termina o
-- serviço.
--
-- E A PRIVACIDADE?
-- Exigir conta não protegia nada: o cadastro é gratuito, leva um minuto e
-- ninguém verifica quem é. O aviso geral já era, na prática, público — só
-- custava uma barreira a quem chegava de fora. Aviso de grupo continua
-- fechado por `tem_acesso_grupo()`, que é o gate de verdade.
--
-- Se um dia existir aviso que é mesmo só da congregação, o caminho certo é
-- uma marcação "somente membros" na própria linha do aviso — e não voltar a
-- confiar em `auth.role()`.
-- ============================================================================

drop policy if exists "Aviso geral é público pra autenticado" on public.avisos;

create policy "Aviso geral é público pra todos"
  on public.avisos
  for select
  using (grupo is null);

-- ─── Conferência ───────────────────────────────────────────────────────────
-- 1. A de grupo tem que continuar de pé, e a nova sem auth.role():
--      select policyname, cmd, qual from pg_policies
--      where schemaname = 'public' and tablename = 'avisos' order by cmd;
--
-- 2. No app: sair da conta por completo, fechar e reabrir. O sininho e a aba
--    de avisos têm que mostrar os avisos gerais — e nenhum aviso de grupo.
