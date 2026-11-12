-- ============================================================================
-- Audio pronto assim que publica (pedido do Marcos, 12/11/2026)
--
-- Antes: o audio do devocional/mensagem so era gerado quando a PRIMEIRA
-- pessoa tocava em "Ouvir", e ela esperava (texto longo demora).
-- Agora: ao entrar um devocional ou uma mensagem nova (ou ao mudar o texto),
-- o banco pede a funcao `devocional-audio` para gerar nos 4 idiomas. Quando
-- alguem tocar em "Ouvir", ja esta pronto.
--
-- A chamada sai pelo pg_net depois do commit (nao atrasa quem salva). A chave
-- e a do job `encontro-lembretes`, mesma tecnica das outras (nao vai no git).
-- Se a traducao de algum idioma ainda nao estiver pronta, aquele idioma fica
-- para o primeiro "Ouvir", como antes. Pode rodar de novo.
-- ============================================================================
create or replace function public.audio_pre_gerar(p_tipo text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_chave text;
  v_lang text;
  v_campo text := case when p_tipo = 'mensagem' then 'mensagem_id' else 'devocional_id' end;
begin
  select substring(command from 'Bearer ([A-Za-z0-9._-]+)') into v_chave
    from cron.job where jobname = 'encontro-lembretes' limit 1;
  if v_chave is null then return; end if;
  foreach v_lang in array array['pt', 'en', 'es', 'fr'] loop
    perform net.http_post(
      url := 'https://yudulaqsqhzbbarhxbnr.supabase.co/functions/v1/devocional-audio',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chave),
      body := jsonb_build_object(v_campo, p_id, 'lang', v_lang, 'pre_gerar', true),
      timeout_milliseconds := 150000
    );
  end loop;
end;
$$;
revoke all on function public.audio_pre_gerar(text, uuid) from public, anon, authenticated;

create or replace function public.devocional_audio_ao_publicar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Salvar sem mudar o texto nao gera de novo.
  if tg_op = 'UPDATE' and new.titulo is not distinct from old.titulo and new.versiculo is not distinct from old.versiculo and new.referencia is not distinct from old.referencia and new.texto is not distinct from old.texto then return new; end if;
  perform public.audio_pre_gerar('devocional', new.id);
  return new;
end $$;
drop trigger if exists devocional_audio_ao_publicar on public.devocionais;
create trigger devocional_audio_ao_publicar
  after insert or update of titulo, versiculo, referencia, texto on public.devocionais
  for each row execute function public.devocional_audio_ao_publicar();

create or replace function public.mensagem_audio_ao_publicar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Salvar sem mudar o texto nao gera de novo.
  if tg_op = 'UPDATE' and new.titulo is not distinct from old.titulo and new.resumo is not distinct from old.resumo and new.conteudo is not distinct from old.conteudo then return new; end if;
  perform public.audio_pre_gerar('mensagem', new.id);
  return new;
end $$;
drop trigger if exists mensagem_audio_ao_publicar on public.mensagens;
create trigger mensagem_audio_ao_publicar
  after insert or update of titulo, resumo, conteudo on public.mensagens
  for each row execute function public.mensagem_audio_ao_publicar();

-- Deixa prontos tambem os 3 devocionais e as 3 mensagens mais recentes.
select public.audio_pre_gerar('devocional', id) from (select id from public.devocionais where data <= current_date order by data desc limit 3) d;
select public.audio_pre_gerar('mensagem', id) from (select id from public.mensagens order by data desc, created_at desc limit 3) m;
