-- Cache de traduções automáticas para conteúdo digitado pelo admin em
-- português (devocionais, avisos, mensagens do blog, agenda). O app chama a
-- Edge Function `translate-content`, que consulta esta tabela primeiro; só
-- traduz de novo (via API externa) se ainda não existir tradução para aquele
-- texto exato naquele idioma. Assim cada trecho só é traduzido uma vez,
-- mesmo com muitos usuários vendo o mesmo conteúdo.

create table if not exists public.content_translations (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id text not null,
  field_name text not null,
  lang text not null check (lang in ('en', 'es', 'fr')),
  original_text text not null,
  translated_text text not null,
  created_at timestamptz not null default now(),
  unique (table_name, row_id, field_name, lang)
);

alter table public.content_translations enable row level security;

-- Qualquer pessoa pode ler traduções em cache (não é dado sensível).
drop policy if exists "content_translations_select_all" on public.content_translations;
create policy "content_translations_select_all"
  on public.content_translations for select
  using (true);

-- Só a Edge Function (service role) grava novas traduções — usuários comuns
-- nunca inserem direto, sempre via chamada à função `translate-content`.
drop policy if exists "content_translations_insert_service_role" on public.content_translations;
create policy "content_translations_insert_service_role"
  on public.content_translations for insert
  to service_role
  with check (true);

create index if not exists content_translations_lookup_idx
  on public.content_translations (table_name, row_id, field_name, lang);
