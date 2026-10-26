-- ============================================================================
-- "O culto já vai começar!" com link e no horário certo (26 Out 2026)
--
-- 1. O aviso ganha o botão/link do YouTube ao vivo: tocar na notificação
--    (ou no card do sininho) abre a transmissão direto.
-- 2. O cron era '45 16 * * 0' em UTC: 17:45 de Londres no verão, mas 16:45
--    no inverno (1h15 antes do culto). Agora roda às 16:45 e 17:45 UTC e só
--    insere quando em Londres forem 17:45 — vale o ano todo.
-- ============================================================================
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'lembrete-culto-youtube-domingo';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end $$;

select cron.schedule(
  'lembrete-culto-youtube-domingo',
  '45 16,17 * * 0',
  $$
    insert into public.avisos (titulo, texto, tipo, data, grupo, apenas_membros, cta_texto, cta_url)
    select 'O culto já vai começar!',
           'Nosso culto ao vivo no YouTube começa às 18h. Toque para assistir!',
           'evento', now(), null, false,
           'Assistir ao vivo', 'https://www.youtube.com/@PenielChurchOfficial/live'
     where to_char(now() at time zone 'Europe/London', 'HH24:MI') between '17:40' and '17:50';
  $$
);
