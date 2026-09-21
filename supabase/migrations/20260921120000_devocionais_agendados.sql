-- Devocionais agendados (21 Set 2026)
--
-- Pedido do Marcos: postar a série "REBUILDING" (12 devocionais, 21/09 a 16/10)
-- nas datas certas, às 6h de Londres, sem ninguém precisar abrir o Admin.
--
-- POR QUE UMA TABELA SEPARADA, e não inserir direto em `devocionais` com data
-- futura: a Home e as telas de grupo mostram "o devocional de `data` mais
-- recente" — uma linha com data futura apareceria HOJE, no topo. E o push sai
-- no INSERT (webhook `devocionais_notify_trigger`), então a notificação
-- chegaria agora, não no dia. A fila guarda o conteúdo; o cron só insere em
-- `devocionais` quando chega a hora — e aí tudo o que já existe (push, sininho
-- do grupo, RLS por grupo) funciona igual a um devocional publicado à mão.
--
-- TRADUÇÕES: a coluna `traducoes` leva o texto já traduzido (en/es/fr). Na
-- publicação ele é gravado em `content_translations` com o texto português
-- EXATO como `original_text` — é a chave que a Edge Function
-- `translate-content` confere. Assim o app acha a tradução no cache na
-- primeira abertura, sem depender da tradução automática (MyMemory).
-- Sem `traducoes`, nada muda: o app traduz automaticamente como sempre.
--
-- Serve para devocional de grupo também: `grupo` segue a mesma regra de
-- `devocionais.grupo` (null = Devocional Peniel, na Home).

create table if not exists public.devocionais_agendados (
  id uuid primary key default gen_random_uuid(),
  publicar_em timestamptz not null,
  data date not null,
  grupo text,
  titulo text not null,
  versiculo text not null,
  referencia text not null,
  texto text not null,
  autor text not null default 'Peniel Church',
  traducoes jsonb,          -- {"en": {"titulo":..,"versiculo":..,"referencia":..,"texto":..}, "es": {...}, "fr": {...}}
  publicado_em timestamptz,
  devocional_id uuid references public.devocionais(id) on delete set null,
  erro text,
  created_at timestamptz not null default now()
);

create index if not exists devocionais_agendados_pendentes_idx
  on public.devocionais_agendados (publicar_em) where publicado_em is null;

alter table public.devocionais_agendados enable row level security;

drop policy if exists "Admin gerencia devocionais agendados" on public.devocionais_agendados;
create policy "Admin gerencia devocionais agendados"
  on public.devocionais_agendados for all
  using (public.is_admin()) with check (public.is_admin());

-- Publica tudo o que já passou da hora. Idempotente: roda de 15 em 15 min e
-- cada linha só é publicada uma vez (`publicado_em`). Se já existir um
-- devocional no mesmo dia/destino (índices únicos de 20260823213300), a linha
-- não é publicada e o motivo fica em `erro` — nunca duplica, nunca apaga o
-- que o Admin publicou à mão.
create or replace function public.publicar_devocionais_agendados()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  novo_id uuid;
  v_lang text;
  v_campo text;
  publicados integer := 0;
begin
  for r in
    select * from public.devocionais_agendados
     where publicado_em is null and erro is null and publicar_em <= now()
     order by publicar_em
     for update skip locked
  loop
    begin
      insert into public.devocionais (titulo, versiculo, referencia, texto, autor, data, grupo)
      values (r.titulo, r.versiculo, r.referencia, r.texto, r.autor, r.data, r.grupo)
      returning id into novo_id;

      if r.traducoes is not null then
        foreach v_lang in array array['en', 'es', 'fr'] loop
          continue when r.traducoes -> v_lang is null;
          foreach v_campo in array array['titulo', 'versiculo', 'referencia', 'texto'] loop
            continue when coalesce(r.traducoes -> v_lang ->> v_campo, '') = '';
            insert into public.content_translations
              (table_name, row_id, field_name, lang, original_text, translated_text)
            values
              ('devocionais', novo_id::text, v_campo, v_lang,
               case v_campo when 'titulo' then r.titulo when 'versiculo' then r.versiculo
                          when 'referencia' then r.referencia else r.texto end,
               r.traducoes -> v_lang ->> v_campo)
            on conflict (table_name, row_id, field_name, lang)
            do update set original_text = excluded.original_text,
                          translated_text = excluded.translated_text;
          end loop;
        end loop;
      end if;

      update public.devocionais_agendados
         set publicado_em = now(), devocional_id = novo_id
       where id = r.id;
      publicados := publicados + 1;
    exception when others then
      update public.devocionais_agendados set erro = sqlerrm where id = r.id;
    end;
  end loop;
  return publicados;
end;
$$;

revoke all on function public.publicar_devocionais_agendados() from public, anon, authenticated;

-- Cron de SQL puro (sem chave nenhuma). De 15 em 15 min: o horário de verão
-- não importa, porque `publicar_em` já é um instante absoluto calculado com
-- 'Europe/London' — 6h de Londres é 05:00 UTC no verão e 06:00 no inverno,
-- e o cron pega as duas.
do $$
begin
  perform cron.unschedule('publicar-devocionais-agendados')
    where exists (select 1 from cron.job where jobname = 'publicar-devocionais-agendados');
  perform cron.schedule('publicar-devocionais-agendados', '*/15 * * * *',
                        'select public.publicar_devocionais_agendados();');
end $$;
