-- ============================================================================
-- 08/10/2026 — Imagem de verdade no devocional.
-- O Marcos criou 30 fotos (1600x800, 2:1) por tema. Elas ficam no bucket
-- publico `devocionais` (pasta fotos/), e cada devocional ganha a sua na hora
-- em que e inserido — por um gatilho BEFORE INSERT. Vale para tudo que entra
-- em `devocionais`: o admin publicando, a fila `devocionais_agendados`
-- (cron 20) e devocional de grupo.
--
-- Como escolhe: procura radicais de palavras (sem acento) no titulo (peso 3),
-- referencia e versiculo (peso 2) e na reflexao (peso 1, sem as secoes fixas
-- "Para refletir / Oracao: / Referencias biblicas", que aparecem em todos).
-- Ganha o tema com mais pontos; dentro do tema, a foto usada ha mais tempo
-- (ou nunca usada). Sem nenhum acerto, a foto usada ha mais tempo de todas.
--
-- Foto nova: suba no bucket (Storage > devocionais > fotos) e insira uma linha
-- em `devocional_imagens` com a url publica e os temas. Nao precisa de OTA.
-- Tema novo: uma linha em `devocional_temas`.
-- Trocar a foto de um devocional: update devocionais set imagem_url = '...'.
-- ============================================================================

-- 1. Bucket publico (a Home mostra a foto ate para quem nao tem conta).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('devocionais', 'devocionais', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists devocionais_admin_select on storage.objects;
drop policy if exists devocionais_admin_insert on storage.objects;
drop policy if exists devocionais_admin_update on storage.objects;
drop policy if exists devocionais_admin_delete on storage.objects;
create policy devocionais_admin_select on storage.objects for select
  using (bucket_id = 'devocionais' and public.is_admin());
create policy devocionais_admin_insert on storage.objects for insert
  with check (bucket_id = 'devocionais' and public.is_admin());
create policy devocionais_admin_update on storage.objects for update
  using (bucket_id = 'devocionais' and public.is_admin());
create policy devocionais_admin_delete on storage.objects for delete
  using (bucket_id = 'devocionais' and public.is_admin());

-- 2. Coluna na tabela do devocional.
alter table public.devocionais add column if not exists imagem_url text;

-- 3. Temas e fotos. Só admin le/escreve; o gatilho roda como definer.
create table if not exists public.devocional_temas (
  tema     text primary key,
  radicais text[] not null
);
create table if not exists public.devocional_imagens (
  id         uuid primary key default gen_random_uuid(),
  arquivo    text not null unique,
  url        text not null,
  temas      text[] not null,
  ativa      boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.devocional_temas   enable row level security;
alter table public.devocional_imagens enable row level security;
drop policy if exists "Admin gerencia temas do devocional" on public.devocional_temas;
create policy "Admin gerencia temas do devocional" on public.devocional_temas
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admin gerencia imagens do devocional" on public.devocional_imagens;
create policy "Admin gerencia imagens do devocional" on public.devocional_imagens
  for all using (public.is_admin()) with check (public.is_admin());

-- Radicais SEM acento, minusculos. Espaco no fim = palavra inteira ("mar ").
insert into public.devocional_temas (tema, radicais) values
  ('reconstruir', array['reconstru','rebuild','construi','constroi','edific','alicerce','fundament','muro','muralha','ruina','escombro','pedra','neemias','restaur']),
  ('coracao',     array['coraca','coracoe','amor','ama ','amou','amad','compaixa','alma','sonda','interior','afeto']),
  ('cruz',        array['cruz','calvario','graca','perdo','salvac','salvo','salvador','sangue','cordeiro','ressurrei','ressuscit','redenc','redim','pecado','arrepend']),
  ('oracao',      array['oraca','orar','ore ','orem','clam','silencio','noite','vigia','esperar','espere','aguard','joelho','intercess','madrugada','jejum']),
  ('aguas',       array['agua','rio ','rios','fonte','sede','chuva','jordao','batism','poco ']),
  ('mar',         array['mar ','mares','onda','tempestade','barco','pescador','afog','medo','temor','vento']),
  ('montanhas',   array['monte','montanha','rocha','fortaleza','forca','forte','refugio','firme','socorro','escudo','inabal','vitoria','gigante','coragem']),
  ('caminho',     array['caminh','estrada','vereda','jornada','passo','direc','guia','segui','porta','deserto','peregrin','chamado','decis','andar','ande ']),
  ('colheita',    array['semente','semea','colheit','colher','fruto','frutific','plant','cresc','raiz','raize','campo','trigo','arvore','videira','ramo','seara','permanec']),
  ('paz',         array['paz','descans','calma','quiet','repous','ansied','preocupa','pastor','ovelha','pastos','alivi','consol','tranquil','sossego']),
  ('esperanca',   array['esperanc','amanhec','manha','aurora','luz','novo','nova','renov','recomec','misericordia','promessa','alegria','gloria','brilh','futuro','estacao'])
on conflict (tema) do update set radicais = excluded.radicais;

-- As 30 fotos do Marcos (pasta devocionais-30-imagens). Duas fogem do nome:
-- cruz-3 e uma trilha na duna ate o mar (sem cruz) -> tema mar;
-- mar-2 tem uma cruz de frente para o mar -> mar e cruz.
insert into public.devocional_imagens (arquivo, url, temas)
select f, 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/' || f, t
  from (values
    ('aguas-1.jpg', array['aguas']), ('aguas-2.jpg', array['aguas']),
    ('caminho-1.jpg', array['caminho']), ('caminho-2.jpg', array['caminho']), ('caminho-3.jpg', array['caminho']),
    ('colheita-1.jpg', array['colheita']), ('colheita-2.jpg', array['colheita']), ('colheita-3.jpg', array['colheita']),
    ('coracao-1.jpg', array['coracao']), ('coracao-2.jpg', array['coracao']), ('coracao-3.jpg', array['coracao']),
    ('cruz-1.jpg', array['cruz']), ('cruz-2.jpg', array['cruz']), ('cruz-3.jpg', array['mar']),
    ('esperanca-1.jpg', array['esperanca']), ('esperanca-2.jpg', array['esperanca']), ('esperanca-3.jpg', array['esperanca']),
    ('mar-1.jpg', array['mar']), ('mar-2.jpg', array['mar','cruz']),
    ('montanhas-1.jpg', array['montanhas']), ('montanhas-2.jpg', array['montanhas']),
    ('oracao-1.jpg', array['oracao']), ('oracao-2.jpg', array['oracao']), ('oracao-3.jpg', array['oracao']),
    ('paz-1.jpg', array['paz']), ('paz-2.jpg', array['paz']), ('paz-3.jpg', array['paz']),
    ('reconstruir-1.jpg', array['reconstruir']), ('reconstruir-2.jpg', array['reconstruir']), ('reconstruir-3.jpg', array['reconstruir'])
  ) as v(f, t)
on conflict (arquivo) do nothing;

-- 4. Escolha.
create or replace function public.normalizar_para_tema(p text)
returns text language sql immutable as $$
  select ' ' || regexp_replace(
    lower(translate(coalesce(p, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
    '[^a-z0-9]+', ' ', 'g') || ' ';
$$;

create or replace function public.escolher_imagem_devocional(
  p_titulo text, p_referencia text, p_versiculo text, p_texto text)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_titulo text := public.normalizar_para_tema(p_titulo);
  v_ref    text := public.normalizar_para_tema(p_referencia);
  v_vers   text := public.normalizar_para_tema(p_versiculo);
  v_corpo  text := public.normalizar_para_tema(regexp_replace(coalesce(p_texto, ''),
    '\n\s*(Para refletir|Ora[cç][aã]o:|Refer[eê]ncias b[ií]blicas).*$', '', 'i'));
  v_tema   text;
  v_url    text;
begin
  select t.tema into v_tema
    from public.devocional_temas t
    cross join lateral (
      select sum(
          3 * (length(v_titulo) - length(replace(v_titulo, ' ' || r, ''))) / length(' ' || r)
        + 2 * (length(v_ref)    - length(replace(v_ref,    ' ' || r, ''))) / length(' ' || r)
        + 2 * (length(v_vers)   - length(replace(v_vers,   ' ' || r, ''))) / length(' ' || r)
        + 1 * (length(v_corpo)  - length(replace(v_corpo,  ' ' || r, ''))) / length(' ' || r)
      ) as pontos
      from unnest(t.radicais) r
    ) s
   where s.pontos > 0
     and exists (select 1 from public.devocional_imagens i where i.ativa and t.tema = any(i.temas))
   order by s.pontos desc, t.tema
   limit 1;

  -- A foto usada ha mais tempo (nunca usada vem primeiro). Sem tema, todas.
  select i.url into v_url
    from public.devocional_imagens i
   where i.ativa and (v_tema is null or v_tema = any(i.temas))
   order by (select max(d.data) from public.devocionais d where d.imagem_url = i.url) nulls first,
            random()
   limit 1;
  return v_url;
end $$;
revoke all on function public.escolher_imagem_devocional(text, text, text, text) from public, anon, authenticated;

create or replace function public.devocional_define_imagem()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.imagem_url is null then
    new.imagem_url := public.escolher_imagem_devocional(new.titulo, new.referencia, new.versiculo, new.texto);
  end if;
  return new;
end $$;

drop trigger if exists devocional_define_imagem on public.devocionais;
create trigger devocional_define_imagem
  before insert on public.devocionais
  for each row execute function public.devocional_define_imagem();

-- 5. O devocional que esta na Home agora (o geral mais recente).
update public.devocionais d
   set imagem_url = public.escolher_imagem_devocional(d.titulo, d.referencia, d.versiculo, d.texto)
 where d.id = (select id from public.devocionais where grupo is null order by data desc limit 1)
   and d.imagem_url is null;
