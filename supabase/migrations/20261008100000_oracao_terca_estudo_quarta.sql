-- ============================================================================
-- 08/10/2026 — Reuniao de Oracao passa para TERCA 21h; Estudo Biblico para
-- QUARTA 20h. Decisoes do Marcos:
--   * a sexta 09/10 ja nao tem estudo; o primeiro na quarta e 14/10;
--   * o link do Zoom do estudo fica clicavel para todos (Home, avisos, agenda),
--     como o da oracao.
-- Aplicada direto pelo SQL Editor em 08/10 e registrada em schema_migrations.
-- Tudo aqui e idempotente: rodar de novo nao muda nada.
-- ============================================================================

-- 1. Agenda (aba Agenda do app). 0 = domingo ... 2 = terca, 3 = quarta.
update public.agenda_eventos set dia_semana = 2
 where nome = 'Sala de Oração' and recorrente;
update public.agenda_eventos set dia_semana = 3
 where nome = 'Estudo Bíblico' and recorrente;

-- 2. Regra da agenda automatica do grupo.
update public.grupo_recorrencias set dia_semana = 3
 where grupo = 'estudo_biblico';

-- 3. As sextas que ja estavam geradas (09/10 a 04/12) somem. Nenhuma tinha
--    presenca, pergunta, nota, arquivo ou roteiro (conferido antes). O gatilho
--    de exclusao grava cada sexta como excecao — inofensivo, a regra agora e
--    de quarta. So apaga as GERADAS: encontro criado a mao pelo lider fica.
delete from public.grupo_eventos
 where grupo = 'estudo_biblico'
   and gerado_automaticamente
   and data >= date '2026-10-09'
   and extract(dow from data) = 5;

-- 4. Gera as quartas (silencioso: encontro gerado nao vai para o mural).
select public.gerar_encontros_recorrentes();

-- 5. Lembretes da manha (pg_cron em UTC; 8h UTC = 9h Londres no verao).
--    Oracao: so muda o dia — o comando ja tem o botao "Entrar no Zoom".
select cron.alter_job(13, schedule := '0 8 * * 2');
--    Estudo: muda o dia e ganha o botao do Zoom (antes dizia "confira o link
--    na Agenda"). Continua indo so para o grupo, como antes.
select cron.alter_job(10,
  schedule := '0 8 * * 3',
  command := $job$
    insert into public.avisos (titulo, texto, tipo, data, grupo, cta_texto, cta_url)
    values (
      'Estudo Bíblico é hoje!',
      'Nos vemos hoje às 20h na sala do Zoom para o nosso Estudo Bíblico.',
      'evento',
      now(),
      'estudo_biblico',
      'Entrar no Zoom',
      'https://us02web.zoom.us/j/88370473540?pwd=rWbKlHoav2d5Oxc8pOFaGby5pbdmwR.1'
    );
  $job$);

-- 6. Banda: cultos e ensaios em tempo real. O app passou a recarregar a lista
--    quando alguem cria/publica um culto; sem a tabela na publicacao do
--    Realtime o evento nunca chega (a RLS is_banda_membro continua valendo).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cultos') then
    alter publication supabase_realtime add table public.cultos;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ensaios') then
    alter publication supabase_realtime add table public.ensaios;
  end if;
end $$;
