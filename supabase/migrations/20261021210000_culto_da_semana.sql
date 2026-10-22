-- ============================================================================
-- 21/10/2026 - "Culto da semana" no Painel Admin.
-- O Admin preenche o culto (data, tipo, tema, texto base, pregador e foto),
-- o app desenha a thumb (1280x720) e a Edge Function `youtube-culto` cria o
-- live AGENDADO no canal da Peniel com titulo, descricao e thumb. No domingo,
-- no OBS, a equipe escolhe "Selecionar transmissao existente".
--
-- Bucket publico `culto-semana`:
--   pregadores/<arquivo>.png  fotos recortadas (sem fundo) dos pregadores
--   thumbs/<id do culto>.jpg  thumb gerada pelo app
-- So admin le a lista e escreve; a leitura das imagens e pela URL publica.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('culto-semana', 'culto-semana', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists culto_semana_admin_select on storage.objects;
drop policy if exists culto_semana_admin_insert on storage.objects;
drop policy if exists culto_semana_admin_update on storage.objects;
drop policy if exists culto_semana_admin_delete on storage.objects;
create policy culto_semana_admin_select on storage.objects for select
  using (bucket_id = 'culto-semana' and public.is_admin());
create policy culto_semana_admin_insert on storage.objects for insert
  with check (bucket_id = 'culto-semana' and public.is_admin());
create policy culto_semana_admin_update on storage.objects for update
  using (bucket_id = 'culto-semana' and public.is_admin());
create policy culto_semana_admin_delete on storage.objects for delete
  using (bucket_id = 'culto-semana' and public.is_admin());

create table if not exists public.cultos_semana (
  id                   uuid primary key default gen_random_uuid(),
  data                 date not null,
  hora                 time not null default '18:00',
  tipo                 text not null default 'adoracao'
                       check (tipo in ('adoracao','ceia','alive','mulheres','homens','kids','casais','especial')),
  tema                 text not null check (char_length(btrim(tema)) between 1 and 80),
  subtitulo            text check (subtitulo is null or char_length(subtitulo) <= 60),
  referencia           text check (referencia is null or char_length(referencia) <= 40),
  pregador             text not null default 'Pr. Marcos Brandão',
  foto_path            text,
  observacao           text check (observacao is null or char_length(observacao) <= 1500),
  thumb_path           text,
  youtube_id           text,
  youtube_publicado_em timestamptz,
  youtube_erro         text,
  criado_por           uuid default auth.uid() references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists cultos_semana_data_idx on public.cultos_semana (data desc);

alter table public.cultos_semana enable row level security;
drop policy if exists "Admin gerencia o culto da semana" on public.cultos_semana;
create policy "Admin gerencia o culto da semana" on public.cultos_semana
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.cultos_semana_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists cultos_semana_touch on public.cultos_semana;
create trigger cultos_semana_touch before update on public.cultos_semana
  for each row execute function public.cultos_semana_touch();
