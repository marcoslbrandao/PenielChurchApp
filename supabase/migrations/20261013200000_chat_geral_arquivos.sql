-- Chat da Igreja: anexos (tipo 'arquivo') — 13/10/2026.
-- JA APLICADA no SQL Editor em 13/10/2026; este arquivo e o registro.
--
-- Audio baixado (ex.: Presenter Diario da RTM em mp3), PDF e documentos.
-- Os 4 tipos antigos ficam iguais. Limite: 25 MB por anexo (o bucket segue
-- com 40 MB por causa do video). A limpeza dos 15 dias ja cobre os anexos:
-- o cron limpar-chat-geral apaga a mensagem e a Edge Function
-- limpar-audios-chat apaga o arquivo orfao (RPC chat_geral_midias_orfas).
begin;

alter table public.chat_geral_mensagens
  add column if not exists midia_nome    text,
  add column if not exists midia_tamanho bigint,
  add column if not exists midia_mime    text;

alter table public.chat_geral_mensagens
  drop constraint if exists chat_geral_mensagens_tipo_check;
alter table public.chat_geral_mensagens
  add constraint chat_geral_mensagens_tipo_check
  check (tipo = any (array['texto','imagem','audio','video','arquivo']));

alter table public.chat_geral_mensagens
  drop constraint if exists chat_geral_mensagens_conteudo_check;
alter table public.chat_geral_mensagens
  add constraint chat_geral_mensagens_conteudo_check
  check (
    char_length(texto) <= 2000 and
    case tipo
      when 'texto' then
        midia_path is null and char_length(btrim(texto)) > 0
      when 'imagem' then
        midia_path ~ ('^' || autor_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|heic)$')
      when 'audio' then
        midia_path ~ ('^' || autor_id::text || '/[0-9a-f-]{36}\.m4a$')
        and duracao_ms between 1 and 330000
      when 'video' then
        midia_path ~ ('^' || autor_id::text || '/[0-9a-f-]{36}\.(mp4|mov)$')
        and duracao_ms between 1 and 125000
      when 'arquivo' then
        midia_path ~ ('^' || autor_id::text || '/[0-9a-f-]{36}\.(mp3|m4a|wav|aac|ogg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip)$')
        and char_length(btrim(coalesce(midia_nome, ''))) between 1 and 200
        and midia_tamanho between 1 and 26214400
        and midia_mime is not null
        and (duracao_ms is null or duracao_ms >= 1)
      else false
    end
  );

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/png','image/gif','image/webp','image/heic',
  'audio/mp4','audio/m4a','audio/x-m4a','audio/aac',
  'video/mp4','video/quicktime',
  'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/ogg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip','application/x-zip-compressed'
]
where id = 'chat-geral';

commit;
