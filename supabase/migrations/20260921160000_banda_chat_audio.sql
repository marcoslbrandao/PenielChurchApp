-- ============================================================================
-- Mensagens de voz no chat da Banda
--
-- Mesma mecânica do chat dos grupos (20260920130000_chat_grupo_audio.sql):
-- mesmo bucket privado `chat-audio`, numa pasta própria:
--   banda/<autor>/<uuid>.m4a
-- Quem ouve e grava é quem é da Banda (`is_banda_membro()`, que já inclui o
-- admin) — a mesma regra das mensagens de texto.
--
-- Limpeza: o áudio segue a mensagem. O chat da Banda NÃO tem limpeza por
-- tempo (diferente dos grupos, 14 dias), então o áudio fica enquanto a
-- mensagem existir; quando o autor ou o admin apaga, a Edge Function
-- `limpar-audios-chat` remove o arquivo na passada seguinte (3h30 UTC).
-- ============================================================================

-- ─── 1. Colunas ──────────────────────────────────────────────────────────────
alter table public.banda_chat_mensagens
  add column if not exists audio_path text,
  add column if not exists audio_duracao_ms integer;

alter table public.banda_chat_mensagens
  drop constraint if exists banda_chat_mensagens_audio_check;
alter table public.banda_chat_mensagens
  add constraint banda_chat_mensagens_audio_check check (
    (audio_path is null and audio_duracao_ms is null)
    or (
      -- Pasta da Banda e do PRÓPRIO autor (`autor_id` já foi forçado para
      -- auth.uid() pelo gatilho BEFORE INSERT `banda_chat_forca_autor`).
      audio_path ~ ('^banda/' || autor_id::text || '/[0-9a-f-]{36}\.m4a$')
      and audio_duracao_ms between 1 and 330000
    )
  );

create index if not exists banda_chat_mensagens_audio_idx
  on public.banda_chat_mensagens (audio_path) where audio_path is not null;

-- ─── 2. Policies do Storage (pasta banda/) ───────────────────────────────────
-- Somam às dos grupos (policies permissivas se somam com OR). As dos grupos
-- não liberam `banda/` para ninguém além do admin, porque não existe grupo
-- chamado "banda".
drop policy if exists "chat-audio: banda ouve" on storage.objects;
create policy "chat-audio: banda ouve"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-audio'
    and (storage.foldername(name))[1] = 'banda'
    and public.is_banda_membro()
  );

drop policy if exists "chat-audio: banda grava na própria pasta" on storage.objects;
create policy "chat-audio: banda grava na própria pasta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-audio'
    and (storage.foldername(name))[1] = 'banda'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_banda_membro()
  );

-- Mesma regra do DELETE da mensagem da Banda: o autor, ou o admin.
drop policy if exists "chat-audio: banda, autor ou admin apaga" on storage.objects;
create policy "chat-audio: banda, autor ou admin apaga"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-audio'
    and (storage.foldername(name))[1] = 'banda'
    and ((storage.foldername(name))[2] = auth.uid()::text or public.is_admin())
  );

-- ─── 3. Órfãos: agora olhando as duas tabelas ────────────────────────────────
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
     and not exists (
       select 1 from public.banda_chat_mensagens b where b.audio_path = o.name
     )
   order by o.created_at
   limit greatest(1, least(p_limite, 1000));
$$;

revoke all on function public.chat_audios_orfaos(int) from public, anon, authenticated;
grant execute on function public.chat_audios_orfaos(int) to service_role;
