-- 14/10/2026 - Chat da Banda guardado por 15 dias (como o Chat da Igreja).
-- Roda as 3h10 UTC, antes da Edge Function limpar-audios-chat (3h30), que
-- apaga do Storage os audios e anexos que ficaram sem mensagem.
select cron.schedule(
  'limpar-chat-banda',
  '10 3 * * *',
  $job$ delete from public.banda_chat_mensagens where created_at < now() - interval '15 days'; $job$
);
