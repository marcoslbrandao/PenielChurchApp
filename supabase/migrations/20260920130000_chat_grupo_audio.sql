-- ============================================================================
-- Mensagens de voz no chat dos grupos
--
-- 1. `grupo_chat_mensagens` ganha `audio_path` e `audio_duracao_ms`.
--    `texto` continua obrigatório: numa mensagem de voz ele leva o rótulo
--    "🎤 Mensagem de voz", que é o que versões antigas do app mostram.
-- 2. Bucket PRIVADO `chat-audio`, caminho `<grupo>/<autor>/<uuid>.m4a`.
--    Quem lê é quem tem acesso ao grupo — a mesma regra das mensagens.
-- 3. `chat_audios_orfaos()` — lista os arquivos cuja mensagem já não existe,
--    para a Edge Function `limpar-audios-chat` apagar.
-- 4. Cron diário da limpeza, 3h30 UTC — meia hora depois do
--    `limpar-chat-grupos-antigo` (14 dias). O áudio segue a mensagem.
-- ============================================================================

-- ─── 1. Colunas ──────────────────────────────────────────────────────────────
alter table public.grupo_chat_mensagens
  add column if not exists audio_path text,
  add column if not exists audio_duracao_ms integer;

alter table public.grupo_chat_mensagens
  drop constraint if exists grupo_chat_mensagens_audio_check;
alter table public.grupo_chat_mensagens
  add constraint grupo_chat_mensagens_audio_check check (
    (audio_path is null and audio_duracao_ms is null)
    or (
      -- O arquivo tem que estar na pasta do PRÓPRIO grupo e do PRÓPRIO autor.
      -- Sem isso, alguém do grupo de homens podia gravar uma mensagem
      -- apontando para um áudio do grupo de mulheres e, pela URL assinada,
      -- fazer o app de outra pessoa pedir um arquivo que não é dela.
      -- (`autor_id` já foi forçado para auth.uid() pelo gatilho BEFORE INSERT
      -- `grupo_chat_forca_autor` quando este check roda.)
      audio_path ~ ('^' || grupo || '/' || autor_id::text || '/[0-9a-f-]{36}\.m4a$')
      -- 5 min de limite no app, com folga para o atraso do botão de parar.
      and audio_duracao_ms between 1 and 330000
    )
  );

-- ─── 2. Bucket e policies ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-audio', 'chat-audio', false,
  10 * 1024 * 1024,   -- 5 min em AAC 64 kbps ≈ 2,5 MB; 10 MB é teto de sobra
  array['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat-audio: quem é do grupo ouve" on storage.objects;
create policy "chat-audio: quem é do grupo ouve"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-audio'
    and public.tem_acesso_grupo((storage.foldername(name))[1])
  );

drop policy if exists "chat-audio: quem é do grupo grava na própria pasta" on storage.objects;
create policy "chat-audio: quem é do grupo grava na própria pasta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-audio'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.tem_acesso_grupo((storage.foldername(name))[1])
  );

-- Mesma regra do DELETE da mensagem: o autor, ou líder/admin moderando.
drop policy if exists "chat-audio: autor ou líder apaga" on storage.objects;
create policy "chat-audio: autor ou líder apaga"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-audio'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_admin()
      or public.is_grupo_leader((storage.foldername(name))[1])
    )
  );

-- ─── 3. Órfãos ───────────────────────────────────────────────────────────────
-- Uma hora de carência: o app sobe o arquivo ANTES de gravar a mensagem, então
-- durante um envio em andamento o arquivo existe sem linha. Sem a carência, a
-- limpeza podia apagar um áudio no meio do envio.
create or replace function public.chat_audios_orfaos(p_limite int default 500)
returns table (caminho text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'chat-audio'
     and o.created_at < now() - interval '1 hour'
     and not exists (
       select 1 from public.grupo_chat_mensagens m where m.audio_path = o.name
     )
   order by o.created_at
   limit greatest(1, least(p_limite, 1000));
$$;

revoke all on function public.chat_audios_orfaos(int) from public, anon, authenticated;
grant execute on function public.chat_audios_orfaos(int) to service_role;

create index if not exists grupo_chat_mensagens_audio_idx
  on public.grupo_chat_mensagens (audio_path) where audio_path is not null;

-- ─── 4. Cron da limpeza ──────────────────────────────────────────────────────
-- A chave que os crons de HTTP usam fica escrita dentro de cada comando (ver
-- claude/crons-do-supabase-inventario.md, armadilha 3). Em vez de colar a chave
-- aqui — e no git —, reaproveita a do `encontro-lembretes`, que está
-- comprovadamente funcionando. Se esse job não existir, só avisa: o cron pode
-- ser criado depois à mão, e o resto desta migração continua valendo.
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
    raise notice 'Cron limpar-audios-chat NÃO criado: não achei a chave no job encontro-lembretes.';
    return;
  end if;

  select jobid into v_job_id from cron.job where jobname = 'limpar-audios-chat';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'limpar-audios-chat',
    '30 3 * * *',
    format(
      $job$
        select net.http_post(
          url := 'https://yudulaqsqhzbbarhxbnr.supabase.co/functions/v1/limpar-audios-chat',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'),
          body := '{}'::jsonb,
          timeout_milliseconds := 30000
        );
      $job$,
      v_chave
    )
  );
end $$;
