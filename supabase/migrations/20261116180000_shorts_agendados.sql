-- Shorts dos grupos: agendar a publicacao (pedido do Marcos, 16/11/2026).
-- Ex.: o lider grava na segunda e deixa para sair na quinta as 19h.
--
-- * Coluna publicar_em + status 'agendado'.
-- * shorts_aprovar ganha p_publicar_em (opcional). Sem data (ou data ja
--   passada) = publica agora, como antes.
-- * shorts_desagendar: volta o video para a fila (status 'na_fila').
-- * Cron a cada 5 min chama a funcao shorts-publicar {"acao":"agendados"},
--   que manda para o GitHub os videos com hora chegando (10 min antes, que e
--   o tempo de preparar arte e legenda).
-- * Corrige o limite de duracao no banco: era 330 s (5,5 min); o app ja
--   aceita 10 min desde 12/11/2026.
-- Pode rodar de novo.

alter table public.shorts_fila add column if not exists publicar_em timestamptz;

alter table public.shorts_fila drop constraint if exists shorts_fila_duracao_s_check;
alter table public.shorts_fila add constraint shorts_fila_duracao_s_check
  check (duracao_s is null or duracao_s between 1 and 610);

alter table public.shorts_fila drop constraint if exists shorts_fila_status_check;
alter table public.shorts_fila add constraint shorts_fila_status_check
  check (status in ('na_fila', 'agendado', 'aprovado', 'processando', 'publicado', 'recusado', 'erro'));

create index if not exists shorts_fila_agendados_idx on public.shorts_fila (publicar_em) where status = 'agendado';

-- A versao antiga (6 parametros) sai: o app antigo chama sem p_publicar_em e
-- cai nesta, que tem valor padrao.
drop function if exists public.shorts_aprovar(uuid, text, text, boolean, text, boolean);
create or replace function public.shorts_aprovar(p_id uuid, p_titulo text, p_subtitulo text,
  p_legendas boolean, p_arte text, p_consentimento boolean, p_publicar_em timestamptz default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v public.shorts_fila; v_agendar boolean;
begin
  select * into v from public.shorts_fila where id = p_id for update;
  if not found then return 'sem_video'; end if;
  if not public.gere_shorts(v.grupo) then return 'sem_acesso'; end if;
  if v.status not in ('na_fila', 'erro', 'aprovado', 'agendado') then return 'ja_publicado'; end if;
  if not coalesce(p_consentimento, false) then return 'sem_consentimento'; end if;
  if char_length(btrim(coalesce(p_titulo, ''))) = 0 then return 'sem_titulo'; end if;
  if p_publicar_em is not null and p_publicar_em > now() + interval '60 days' then return 'data_longe'; end if;
  v_agendar := p_publicar_em is not null and p_publicar_em > now() + interval '10 minutes';
  update public.shorts_fila
     set status = case when v_agendar then 'agendado' else 'aprovado' end,
         publicar_em = case when v_agendar then p_publicar_em else null end,
         titulo = left(btrim(p_titulo), 90), subtitulo = nullif(left(btrim(coalesce(p_subtitulo, '')), 90), ''),
         legendas = coalesce(p_legendas, true), arte = case when p_arte = 'limpa' then 'limpa' else 'faixa' end,
         consentimento_imagem = true, aprovado_por = auth.uid(), aprovado_em = now(), erro = null, updated_at = now()
   where id = p_id;
  return case when v_agendar then 'agendado' else 'ok' end;
end $$;
revoke all on function public.shorts_aprovar(uuid, text, text, boolean, text, boolean, timestamptz) from public, anon;
grant execute on function public.shorts_aprovar(uuid, text, text, boolean, text, boolean, timestamptz) to authenticated;

create or replace function public.shorts_desagendar(p_id uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v public.shorts_fila;
begin
  select * into v from public.shorts_fila where id = p_id for update;
  if not found then return 'sem_video'; end if;
  if not public.gere_shorts(v.grupo) then return 'sem_acesso'; end if;
  if v.status <> 'agendado' then return 'nao_agendado'; end if;
  update public.shorts_fila set status = 'na_fila', publicar_em = null, updated_at = now() where id = p_id;
  return 'ok';
end $$;
revoke all on function public.shorts_desagendar(uuid) from public, anon;
grant execute on function public.shorts_desagendar(uuid) to authenticated;

-- Cron: mesma tecnica da 20261002120000 (reaproveita a chave do job
-- encontro-lembretes em vez de colar uma chave no git).
do $$
declare
  v_chave text;
  v_job_id bigint;
begin
  select substring(command from 'Bearer ([A-Za-z0-9._-]+)') into v_chave
    from cron.job where jobname = 'encontro-lembretes' limit 1;
  if v_chave is null then
    raise notice 'Cron shorts-agendados NAO criado: nao achei a chave no job encontro-lembretes.';
    return;
  end if;
  select jobid into v_job_id from cron.job where jobname = 'shorts-agendados';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'shorts-agendados',
    '*/5 * * * *',
    format(
      $job$
        select net.http_post(
          url := 'https://yudulaqsqhzbbarhxbnr.supabase.co/functions/v1/shorts-publicar',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'),
          body := '{"acao":"agendados"}'::jsonb,
          timeout_milliseconds := 30000
        );
      $job$,
      v_chave
    )
  );
end $$;
