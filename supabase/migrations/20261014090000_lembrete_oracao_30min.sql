-- 14/10/2026 - Lembretes GERAIS do Estudo Biblico e da Reuniao de Oracao.
-- Decisao do Marcos: as duas reunioes avisam TODOS os membros da igreja
-- (nao so a turma), de manha e 30 min antes. Cada lembrete e um aviso
-- sem grupo com apenas_membros = true: o INSERT dispara o push
-- (content-notifications) para todo mundo com conta de membro.
--
--   Reuniao de Oracao  - terca 21h:  manha (job 13) + 20:30
--   Estudo Biblico     - quarta 20h: manha (job 10) + 19:30
--
-- pg_cron roda em UTC e Londres alterna BST (UTC+1) / GMT (UTC+0). Os jobs
-- de 30 min rodam nas duas horas UTC possiveis e so inserem quando o relogio
-- de Londres bate. Os da manha (8h UTC) saem as 9h no verao e 8h no inverno.
--
-- O lembrete de 30 min do Estudo que a Edge Function encontro-lembretes
-- mandava so para a turma foi desligado nela (filtro estudo_biblico), para
-- nao chegar em dobro.
--
-- Titulos fixos: o gatilho avisos_um_por_titulo_trg mantem um de cada no mural.
begin;

-- Oracao, manha (job 13): passa a ser so para membros.
select cron.alter_job(13, command := $job$
  insert into public.avisos (titulo, texto, tipo, data, grupo, apenas_membros, cta_texto, cta_url)
  values ('Reunião de Oração é hoje!',
          'Nos vemos hoje às 21h no Zoom para a nossa Reunião de Oração.',
          'evento', now(), null, true,
          'Entrar no Zoom',
          'https://us02web.zoom.us/j/89123221983?pwd=m6qRFHxC1Qaq6mETTzTrrYdwLXnG41.1');
$job$);

-- Estudo, manha (job 10): deixa de ser so da turma e vai para todos os membros.
select cron.alter_job(10, command := $job$
  insert into public.avisos (titulo, texto, tipo, data, grupo, apenas_membros, cta_texto, cta_url)
  values ('Estudo Bíblico é hoje!',
          'Nos vemos hoje às 20h no Zoom para o nosso Estudo Bíblico.',
          'evento', now(), null, true,
          'Entrar no Zoom',
          'https://us02web.zoom.us/j/88370473540?pwd=rWbKlHoav2d5Oxc8pOFaGby5pbdmwR.1');
$job$);

-- Oracao, 30 min antes (terca 20:30 Londres).
select cron.schedule('lembrete-oracao-30min', '30 19,20 * * 2', $job$
  insert into public.avisos (titulo, texto, tipo, data, grupo, apenas_membros, cta_texto, cta_url)
  select 'Reunião de Oração começa em 30 minutos',
         'Nos vemos às 21h no Zoom para a nossa Reunião de Oração. Toque para entrar.',
         'evento', now(), null, true,
         'Entrar no Zoom',
         'https://us02web.zoom.us/j/89123221983?pwd=m6qRFHxC1Qaq6mETTzTrrYdwLXnG41.1'
   where to_char(now() at time zone 'Europe/London', 'HH24:MI') between '20:20' and '20:40';
$job$);

-- Estudo, 30 min antes (quarta 19:30 Londres).
select cron.schedule('lembrete-estudo-30min', '30 18,19 * * 3', $job$
  insert into public.avisos (titulo, texto, tipo, data, grupo, apenas_membros, cta_texto, cta_url)
  select 'Estudo Bíblico começa em 30 minutos',
         'Nos vemos às 20h no Zoom para o nosso Estudo Bíblico. Toque para entrar.',
         'evento', now(), null, true,
         'Entrar no Zoom',
         'https://us02web.zoom.us/j/88370473540?pwd=rWbKlHoav2d5Oxc8pOFaGby5pbdmwR.1'
   where to_char(now() at time zone 'Europe/London', 'HH24:MI') between '19:20' and '19:40';
$job$);

-- O aviso antigo do Estudo era do grupo; o novo e geral (titulo igual, grupo
-- diferente), entao o gatilho nao apaga o velho. Limpa aqui.
delete from public.avisos
 where grupo = 'estudo_biblico' and titulo = 'Estudo Bíblico é hoje!';

commit;
