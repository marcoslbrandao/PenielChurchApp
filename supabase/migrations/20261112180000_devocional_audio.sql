-- ============================================================================
-- Devocional em áudio, nos 4 idiomas (pedido do Marcos, 11/11/2026)
--
-- "Para quem não pode ler (ex.: trabalhando)." O app pede o áudio à Edge
-- Function `devocional-audio`, que gera com voz neural (só na primeira vez
-- de cada idioma) e guarda aqui. Da segunda vez em diante é só tocar.
--
-- • `devocional_audios`: um áudio por devocional + idioma + versão do texto
--   (hash) — se o devocional for editado, gera de novo.
-- • `devocionais.audio_proprio_path`: o áudio gravado pelo próprio pastor
--   (português). Quando existe, o app toca este em vez da voz neural.
-- • Bucket público `devocional-audio` (o devocional geral já é público; os
--   caminhos têm um hash, ninguém adivinha).
--
-- Pode rodar de novo.
-- ============================================================================

alter table public.devocionais add column if not exists audio_proprio_path text;

create table if not exists public.devocional_audios (
  id             uuid primary key default gen_random_uuid(),
  devocional_id  uuid not null references public.devocionais(id) on delete cascade,
  lang           text not null check (lang in ('pt', 'en', 'es', 'fr')),
  hash           text not null,
  path           text not null,
  caracteres     integer,
  voz            text,
  created_at     timestamptz not null default now(),
  unique (devocional_id, lang, hash)
);
alter table public.devocional_audios enable row level security;
-- Só a função (service role) lê e grava. O app recebe o link pronto.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('devocional-audio', 'devocional-audio', true, 52428800, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac'])
on conflict (id) do nothing;

-- O áudio próprio do pastor é enviado pelo app (admin) para `proprio/...`.
drop policy if exists "devocional-audio: admin envia o próprio" on storage.objects;
create policy "devocional-audio: admin envia o próprio" on storage.objects for insert to authenticated
  with check (bucket_id = 'devocional-audio' and (storage.foldername(name))[1] = 'proprio' and public.is_admin());
drop policy if exists "devocional-audio: admin apaga o próprio" on storage.objects;
create policy "devocional-audio: admin apaga o próprio" on storage.objects for delete to authenticated
  using (bucket_id = 'devocional-audio' and (storage.foldername(name))[1] = 'proprio' and public.is_admin());
