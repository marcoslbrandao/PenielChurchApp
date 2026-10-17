-- ============================================================================
-- Chats: so quem escreveu e o admin apagam mensagem (17/10/2026)
--
-- Decisao do Marcos: em todos os chats, apagar mensagem dos outros e so do
-- admin. Lider de grupo e lider da banda deixam de apagar mensagem alheia.
-- (O Chat da Igreja ja era assim.) As limpezas automaticas (cron) rodam
-- como servico e nao passam por esta regra.
-- ============================================================================

drop policy if exists "Autor ou líder apaga mensagem do chat" on public.grupo_chat_mensagens;
drop policy if exists "Autor ou admin apaga mensagem do chat" on public.grupo_chat_mensagens;
create policy "Autor ou admin apaga mensagem do chat"
  on public.grupo_chat_mensagens for delete
  using (autor_id = auth.uid() or public.is_admin());

drop policy if exists "Autor ou admin apaga mensagem da banda" on public.banda_chat_mensagens;
create policy "Autor ou admin apaga mensagem da banda"
  on public.banda_chat_mensagens for delete
  using (autor_id = auth.uid() or public.is_admin());

-- Conferencia (3 linhas, todas so com autor e is_admin):
select tablename, policyname, qual from pg_policies
 where cmd = 'DELETE' and tablename in ('grupo_chat_mensagens','banda_chat_mensagens','chat_geral_mensagens')
 order by 1;
