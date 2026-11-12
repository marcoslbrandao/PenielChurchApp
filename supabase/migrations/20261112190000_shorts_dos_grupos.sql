-- ============================================================================
-- Shorts dos grupos (pedido do Marcos, 11/11/2026)
--
-- • Membro do grupo grava (ou escolhe da galeria) um vídeo de até 5 min e
--   ENVIA PARA O LÍDER (fila). Só o líder (ou o admin) publica.
-- • O líder põe título, arte e legenda automática, confirma a autorização de
--   imagem (menores com autorização dos responsáveis) e publica.
-- • Publicar dispara o GitHub Actions (workflow publicar-short.yml): aplica a
--   arte, gera a legenda (Whisper), sobe para o YouTube da igreja e coloca na
--   playlist do grupo. Até 3 min sai como Short; acima, como vídeo normal.
-- • Pronto: o vídeo entra em `shorts_videos` (a seção Shorts do grupo que já
--   existe) e quem enviou recebe um push.
--
-- Depende de push_para (20261112090000). Pode rodar de novo.
-- ============================================================================

create table if not exists public.shorts_fila (
  id                      uuid primary key default gen_random_uuid(),
  grupo                   text not null,
  autor                   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  autor_nome              text,
  video_path              text not null,
  duracao_s               integer check (duracao_s is null or duracao_s between 1 and 330),
  mensagem                text check (mensagem is null or char_length(mensagem) <= 500),
  status                  text not null default 'na_fila'
                            check (status in ('na_fila', 'aprovado', 'processando', 'publicado', 'recusado', 'erro')),
  titulo                  text check (titulo is null or char_length(titulo) <= 90),
  subtitulo               text check (subtitulo is null or char_length(subtitulo) <= 90),
  legendas                boolean not null default true,
  arte                    text not null default 'faixa' check (arte in ('faixa', 'limpa')),
  consentimento_imagem    boolean not null default false,
  aprovado_por            uuid references public.profiles(id) on delete set null,
  aprovado_em             timestamptz,
  youtube_id              text,
  short_id                uuid references public.shorts_videos(id) on delete set null,
  erro                    text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists shorts_fila_grupo_idx on public.shorts_fila (grupo, status, created_at desc);
alter table public.shorts_fila enable row level security;

alter table public.shorts_fila add column if not exists autor_nome text;

-- Nome de quem enviou (o líder vê na fila sem precisar ler profiles).
create or replace function public.shorts_fila_nome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.autor := auth.uid();
  select coalesce(nullif(btrim(full_name), ''), 'Membro') into new.autor_nome from public.profiles where id = new.autor;
  return new;
end $$;
drop trigger if exists shorts_fila_nome on public.shorts_fila;
create trigger shorts_fila_nome before insert on public.shorts_fila for each row execute function public.shorts_fila_nome();

-- Playlist de cada grupo no YouTube (o admin preenche).
create table if not exists public.shorts_playlists (
  grupo        text primary key,
  playlist_id  text not null
);
alter table public.shorts_playlists enable row level security;
drop policy if exists "shorts_playlists: admin" on public.shorts_playlists;
create policy "shorts_playlists: admin" on public.shorts_playlists for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "shorts_playlists: lideres leem" on public.shorts_playlists;
create policy "shorts_playlists: lideres leem" on public.shorts_playlists for select using (auth.uid() is not null);
grant select, insert, update, delete on public.shorts_playlists to authenticated;

create or replace function public.gere_shorts(p_grupo text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_grupo_leader(p_grupo)
$$;
revoke all on function public.gere_shorts(text) from public, anon;
grant execute on function public.gere_shorts(text) to authenticated;

drop policy if exists "shorts_fila: autor e lider veem" on public.shorts_fila;
create policy "shorts_fila: autor e lider veem" on public.shorts_fila for select
  using (autor = auth.uid() or public.gere_shorts(grupo));
drop policy if exists "shorts_fila: membro do grupo envia" on public.shorts_fila;
create policy "shorts_fila: membro do grupo envia" on public.shorts_fila for insert
  with check (autor = auth.uid() and status = 'na_fila'
              and (public.tem_acesso_grupo(grupo) or public.gere_shorts(grupo))
              and video_path like grupo || '/' || auth.uid()::text || '/%');
drop policy if exists "shorts_fila: autor apaga o que ainda esta na fila" on public.shorts_fila;
create policy "shorts_fila: autor apaga o que ainda esta na fila" on public.shorts_fila for delete
  using ((autor = auth.uid() and status = 'na_fila') or public.gere_shorts(grupo));
grant select, insert, delete on public.shorts_fila to authenticated;
-- Mudar status/título é só pelas funções abaixo (líder) e pelo GitHub (service role).

-- Líder publica: grava título/arte/legenda e manda para o processamento.
create or replace function public.shorts_aprovar(p_id uuid, p_titulo text, p_subtitulo text,
  p_legendas boolean, p_arte text, p_consentimento boolean)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v public.shorts_fila;
begin
  select * into v from public.shorts_fila where id = p_id for update;
  if not found then return 'sem_video'; end if;
  if not public.gere_shorts(v.grupo) then return 'sem_acesso'; end if;
  if v.status not in ('na_fila', 'erro', 'aprovado') then return 'ja_publicado'; end if;
  if not coalesce(p_consentimento, false) then return 'sem_consentimento'; end if;
  if char_length(btrim(coalesce(p_titulo, ''))) = 0 then return 'sem_titulo'; end if;
  update public.shorts_fila
     set status = 'aprovado', titulo = left(btrim(p_titulo), 90), subtitulo = nullif(left(btrim(coalesce(p_subtitulo, '')), 90), ''),
         legendas = coalesce(p_legendas, true), arte = case when p_arte = 'limpa' then 'limpa' else 'faixa' end,
         consentimento_imagem = true, aprovado_por = auth.uid(), aprovado_em = now(), erro = null, updated_at = now()
   where id = p_id;
  return 'ok';
end $$;
revoke all on function public.shorts_aprovar(uuid, text, text, boolean, text, boolean) from public, anon;
grant execute on function public.shorts_aprovar(uuid, text, text, boolean, text, boolean) to authenticated;

create or replace function public.shorts_recusar(p_id uuid, p_motivo text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v public.shorts_fila; v_nome text;
begin
  select * into v from public.shorts_fila where id = p_id for update;
  if not found then return 'sem_video'; end if;
  if not public.gere_shorts(v.grupo) then return 'sem_acesso'; end if;
  update public.shorts_fila set status = 'recusado', erro = left(p_motivo, 300), updated_at = now() where id = p_id;
  if v.autor <> auth.uid() then
    perform public.push_para(v.autor, '🎬 Seu vídeo', coalesce('O líder não publicou desta vez: ' || nullif(btrim(p_motivo), ''), 'O líder não publicou este vídeo desta vez.'),
      jsonb_build_object('type', 'shorts', 'grupo', v.grupo));
  end if;
  return 'ok';
end $$;
revoke all on function public.shorts_recusar(uuid, text) from public, anon;
grant execute on function public.shorts_recusar(uuid, text) to authenticated;

-- Chamado pelo GitHub Actions (service role) no começo e no fim.
create or replace function public.shorts_marcar(p_id uuid, p_status text, p_youtube_id text default null, p_erro text default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v public.shorts_fila; v_short uuid; v_url text;
begin
  select * into v from public.shorts_fila where id = p_id for update;
  if not found then return 'sem_video'; end if;
  if p_status = 'publicado' and p_youtube_id is not null then
    v_url := case when coalesce(v.duracao_s, 0) <= 180 then 'https://youtube.com/shorts/' || p_youtube_id
                  else 'https://www.youtube.com/watch?v=' || p_youtube_id end;
    insert into public.shorts_videos (titulo, url, plataforma, grupo)
    values (v.titulo, v_url, 'youtube', v.grupo) returning id into v_short;
    update public.shorts_fila set status = 'publicado', youtube_id = p_youtube_id, short_id = v_short, erro = null, updated_at = now() where id = p_id;
    perform public.push_para(v.autor, '🎬 Seu vídeo foi publicado!', coalesce(v.titulo, 'Short do grupo'),
      jsonb_build_object('type', 'shorts', 'grupo', v.grupo));
    if v.aprovado_por is not null and v.aprovado_por <> v.autor then
      perform public.push_para(v.aprovado_por, '🎬 Short publicado', coalesce(v.titulo, 'Short do grupo'),
        jsonb_build_object('type', 'shorts', 'grupo', v.grupo));
    end if;
  elsif p_status in ('processando', 'erro') then
    update public.shorts_fila set status = p_status, erro = left(p_erro, 500), updated_at = now() where id = p_id;
    if p_status = 'erro' and v.aprovado_por is not null then
      perform public.push_para(v.aprovado_por, '⚠️ Short não publicado', 'Deu um erro ao preparar o vídeo. Abra a fila do grupo para tentar de novo.',
        jsonb_build_object('type', 'shorts', 'grupo', v.grupo));
    end if;
  else
    return 'status_invalido';
  end if;
  return 'ok';
end $$;
revoke all on function public.shorts_marcar(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.shorts_marcar(uuid, text, text, text) to service_role;

-- Novo vídeo na fila → avisa os líderes do grupo.
create or replace function public.shorts_avisar_lideres()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_nome text;
begin
  select coalesce(nullif(btrim(full_name), ''), 'Alguém') into v_nome from public.profiles where id = new.autor;
  for r in select profile_id from public.group_leaders where grupo = new.grupo and profile_id <> new.autor loop
    perform public.push_para(r.profile_id, '🎬 Vídeo para o Short do grupo', v_nome || ' enviou um vídeo para você publicar.',
      jsonb_build_object('type', 'shorts', 'grupo', new.grupo));
  end loop;
  return new;
end $$;
drop trigger if exists shorts_avisar_lideres on public.shorts_fila;
create trigger shorts_avisar_lideres after insert on public.shorts_fila for each row execute function public.shorts_avisar_lideres();

-- ─── Storage: vídeos da fila (privado) ────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shorts-fila', 'shorts-fila', false, 209715200, array['video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

drop policy if exists "shorts-fila: membro envia na sua pasta" on storage.objects;
create policy "shorts-fila: membro envia na sua pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'shorts-fila' and (storage.foldername(name))[2] = auth.uid()::text
              and (public.tem_acesso_grupo((storage.foldername(name))[1]) or public.gere_shorts((storage.foldername(name))[1])));
drop policy if exists "shorts-fila: autor e lider leem" on storage.objects;
create policy "shorts-fila: autor e lider leem" on storage.objects for select to authenticated
  using (bucket_id = 'shorts-fila' and ((storage.foldername(name))[2] = auth.uid()::text
         or public.gere_shorts((storage.foldername(name))[1])));
drop policy if exists "shorts-fila: autor e lider apagam" on storage.objects;
create policy "shorts-fila: autor e lider apagam" on storage.objects for delete to authenticated
  using (bucket_id = 'shorts-fila' and ((storage.foldername(name))[2] = auth.uid()::text
         or public.gere_shorts((storage.foldername(name))[1])));
