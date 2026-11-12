-- Mensagens (resumo do culto) em audio, nos 4 idiomas (pedido do Marcos,
-- 12/11/2026). A Edge Function `devocional-audio` recebe `mensagem_id`, gera
-- a voz neural so na primeira vez de cada idioma e guarda no bucket publico
-- `devocional-audio`, em `mensagens/<id>/`. Se a mensagem for editada, gera
-- de novo (hash do texto). Pode rodar de novo.
create table if not exists public.mensagem_audios (
  id           uuid primary key default gen_random_uuid(),
  mensagem_id  uuid not null references public.mensagens(id) on delete cascade,
  lang         text not null check (lang in ('pt', 'en', 'es', 'fr')),
  hash         text not null,
  path         text not null,
  caracteres   integer,
  voz          text,
  created_at   timestamptz not null default now(),
  unique (mensagem_id, lang, hash)
);
alter table public.mensagem_audios enable row level security;
-- So a funcao (service role) le e grava. O app recebe o link pronto.
