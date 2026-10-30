-- ============================================================================
-- Tradução ao vivo desliga sozinha quando a live termina (30 Out 2026)
--
-- Antes: a tradução só parava pelo botão "Finalizar" (painel do Mac mini ou
-- Admin do app). Se ninguém lembrasse, o Mac mini seguia ouvindo a mesa e
-- gastando Azure, e o app continuava mostrando "Tradução ao vivo".
--
-- Agora: a cada 5 min, SÓ enquanto `traducao_ao_vivo.ativa = true`, o cron
-- chama a função `youtube-culto` com { acao: 'fim_da_live' }. Ela desliga a
-- tradução quando a live do culto do dia está como encerrada no YouTube
-- (lifeCycleStatus = complete) ou, por segurança, se ficou ligada mais de 4 h.
-- Desligar = ativa=false + atualizado_em (igual ao botão do Admin); o serviço
-- do Mac mini escuta pelo Realtime e para a captura.
--
-- Mesma técnica das outras: reaproveita a chave do job `encontro-lembretes`
-- em vez de colar uma chave no git.
-- ============================================================================
do $$
declare
  v_chave text;
  v_job_id bigint;
begin
  select substring(command from 'Bearer ([A-Za-z0-9._-]+)')
    into v_chave
    from cron.job where jobname = 'encontro-lembretes'
   limit 1;

  if v_chave is null then
    raise notice 'Cron traducao-fim-da-live NÃO criado: não achei a chave no job encontro-lembretes.';
    return;
  end if;

  select jobid into v_job_id from cron.job where jobname = 'traducao-fim-da-live';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'traducao-fim-da-live',
    '*/5 * * * *',
    format(
      $job$
        select net.http_post(
          url := 'https://yudulaqsqhzbbarhxbnr.supabase.co/functions/v1/youtube-culto',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'),
          body := '{"acao":"fim_da_live"}'::jsonb,
          timeout_milliseconds := 30000
        )
        where exists (select 1 from public.traducao_ao_vivo where id = 1 and ativa);
      $job$,
      v_chave
    )
  );
end $$;
