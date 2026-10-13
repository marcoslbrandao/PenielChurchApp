-- 13/10/2026 - Limites novos (decisao do Marcos):
--   * video no Chat da Igreja: ate 5 min (antes 2 min);
--   * mensagem de voz (chat geral, grupos e banda): ate 10 min (antes 5 min);
--   * bucket chat-geral: 50 MB por arquivo (maximo do Supabase com spend cap).
-- Os arquivos continuam sendo apagados em 15 dias (14 nos grupos).
begin;

-- Chat geral: so mudam os limites de 'audio' e 'video'.
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
        and duracao_ms between 1 and 610000
      when 'video' then
        midia_path ~ ('^' || autor_id::text || '/[0-9a-f-]{36}\.(mp4|mov)$')
        and duracao_ms between 1 and 305000
      when 'arquivo' then
        midia_path ~ ('^' || autor_id::text || '/[0-9a-f-]{36}\.(mp3|m4a|wav|aac|ogg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip)$')
        and char_length(btrim(coalesce(midia_nome, ''))) between 1 and 200
        and midia_tamanho between 1 and 26214400
        and midia_mime is not null
        and (duracao_ms is null or duracao_ms >= 1)
      else false
    end
  );

-- Grupos: voz ate 10 min.
alter table public.grupo_chat_mensagens
  drop constraint if exists grupo_chat_mensagens_audio_check;
alter table public.grupo_chat_mensagens
  add constraint grupo_chat_mensagens_audio_check
  check (
    (audio_path is null and audio_duracao_ms is null)
    or (audio_path ~ ('^' || grupo || '/' || autor_id::text || '/[0-9a-f-]{36}\.m4a$')
        and audio_duracao_ms between 1 and 610000)
  );

-- Banda: voz ate 10 min.
alter table public.banda_chat_mensagens
  drop constraint if exists banda_chat_mensagens_audio_check;
alter table public.banda_chat_mensagens
  add constraint banda_chat_mensagens_audio_check
  check (
    (audio_path is null and audio_duracao_ms is null)
    or (audio_path ~ ('^banda/' || autor_id::text || '/[0-9a-f-]{36}\.m4a$')
        and audio_duracao_ms between 1 and 610000)
  );

-- Bucket do chat geral: 50 MB por arquivo.
update storage.buckets set file_size_limit = 52428800 where id = 'chat-geral';

commit;
