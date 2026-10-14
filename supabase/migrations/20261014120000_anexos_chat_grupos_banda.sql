-- 14/10/2026 - Anexos nos chats dos GRUPOS e da BANDA, com a mesma logica do
-- Chat da Igreja: foto/GIF, video ate 5 min (50 MB) e arquivo (audio baixado,
-- PDF, Word, Excel, PowerPoint, txt, zip ate 25 MB). App: lib/chatAnexos.ts.
--
-- Os arquivos vao para o bucket chat-audio (o mesmo da mensagem de voz), em
-- <grupo>/<autor>/... ou banda/<autor>/... — as policies desse bucket ja
-- decidem quem le pela primeira pasta. `texto` continua obrigatorio: o app
-- grava a legenda ou um rotulo ("📷 Foto"), que e o que as versoes antigas
-- do app mostram.
begin;

-- 1. Colunas
alter table public.grupo_chat_mensagens
  add column if not exists midia_tipo       text,
  add column if not exists midia_path       text,
  add column if not exists midia_nome       text,
  add column if not exists midia_tamanho    bigint,
  add column if not exists midia_mime       text,
  add column if not exists midia_largura    integer,
  add column if not exists midia_altura     integer,
  add column if not exists midia_duracao_ms integer;

alter table public.banda_chat_mensagens
  add column if not exists midia_tipo       text,
  add column if not exists midia_path       text,
  add column if not exists midia_nome       text,
  add column if not exists midia_tamanho    bigint,
  add column if not exists midia_mime       text,
  add column if not exists midia_largura    integer,
  add column if not exists midia_altura     integer,
  add column if not exists midia_duracao_ms integer;

-- 2. Regras do anexo (caminho na pasta do proprio autor, extensoes e limites)
alter table public.grupo_chat_mensagens drop constraint if exists grupo_chat_mensagens_midia_check;
alter table public.grupo_chat_mensagens add constraint grupo_chat_mensagens_midia_check check (
  (midia_tipo is null and midia_path is null)
  or (
    audio_path is null
    and case midia_tipo
      when 'imagem' then
        midia_path ~ ('^' || grupo || '/' || autor_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|heic)$')
      when 'video' then
        midia_path ~ ('^' || grupo || '/' || autor_id::text || '/[0-9a-f-]{36}\.(mp4|mov)$')
        and midia_duracao_ms between 1 and 305000
      when 'arquivo' then
        midia_path ~ ('^' || grupo || '/' || autor_id::text || '/[0-9a-f-]{36}\.(mp3|m4a|wav|aac|ogg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip)$')
        and char_length(btrim(coalesce(midia_nome, ''))) between 1 and 200
        and midia_tamanho between 1 and 26214400
        and midia_mime is not null
      else false
    end
  )
);

alter table public.banda_chat_mensagens drop constraint if exists banda_chat_mensagens_midia_check;
alter table public.banda_chat_mensagens add constraint banda_chat_mensagens_midia_check check (
  (midia_tipo is null and midia_path is null)
  or (
    audio_path is null
    and case midia_tipo
      when 'imagem' then
        midia_path ~ ('^banda/' || autor_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|heic)$')
      when 'video' then
        midia_path ~ ('^banda/' || autor_id::text || '/[0-9a-f-]{36}\.(mp4|mov)$')
        and midia_duracao_ms between 1 and 305000
      when 'arquivo' then
        midia_path ~ ('^banda/' || autor_id::text || '/[0-9a-f-]{36}\.(mp3|m4a|wav|aac|ogg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip)$')
        and char_length(btrim(coalesce(midia_nome, ''))) between 1 and 200
        and midia_tamanho between 1 and 26214400
        and midia_mime is not null
      else false
    end
  )
);

-- 3. Bucket chat-audio: 50 MB e os mesmos formatos do chat-geral
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
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
where id = 'chat-audio';

-- 4. Limpeza: arquivo sem mensagem (voz OU anexo) e orfao
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
     and not exists (select 1 from public.grupo_chat_mensagens m where m.audio_path = o.name or m.midia_path = o.name)
     and not exists (select 1 from public.banda_chat_mensagens b where b.audio_path = o.name or b.midia_path = o.name)
   order by o.created_at
   limit greatest(1, least(p_limite, 1000));
$$;

revoke all on function public.chat_audios_orfaos(int) from public, anon, authenticated;
grant execute on function public.chat_audios_orfaos(int) to service_role;

commit;
