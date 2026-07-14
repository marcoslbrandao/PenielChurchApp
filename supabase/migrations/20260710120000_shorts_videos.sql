-- Aba "Shorts" na Mídia: grade de vídeos curtos (YouTube Shorts / Instagram
-- Reels) curada pelo admin — toque abre o vídeo real no app do YouTube/Instagram.
create table if not exists public.shorts_videos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  url text not null,
  plataforma text not null default 'youtube' check (plataforma in ('youtube', 'instagram')),
  created_at timestamptz not null default now()
);

alter table public.shorts_videos enable row level security;

drop policy if exists "Qualquer um vê os shorts" on public.shorts_videos;
create policy "Qualquer um vê os shorts"
  on public.shorts_videos for select
  using (true);

drop policy if exists "Admin/líder gerencia os shorts" on public.shorts_videos;
create policy "Admin/líder gerencia os shorts"
  on public.shorts_videos for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ));
