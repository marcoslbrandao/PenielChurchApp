-- ============================================================================
-- Chat da Igreja — chat geral dos membros (pedido do Marcos, 10/10/2026)
--
-- Regras de produto:
--   • Só MEMBROS (role membro, lider ou admin). Visitante não vê nem escreve —
--     e isto é garantido aqui, na RLS, não só escondendo o botão no app.
--   • Mensagens guardadas por 15 dias (janela rolante; cron diário).
--   • Texto, emoji, foto/meme/GIF, áudio e (no próximo build) vídeo de até
--     2 minutos. Reações, responder, apagar.
--   • Moderação: o autor apaga a própria mensagem; o Admin apaga qualquer uma,
--     vê as denúncias e pode silenciar alguém.
--
-- Partes:
--   1. chat_geral_mensagens       (+ gatilho que força autor e nome)
--   2. chat_geral_reacoes         (uma reação por pessoa por mensagem)
--   3. chat_geral_leituras        (até onde cada um leu → contador da Home)
--   4. chat_geral_denuncias
--   5. chat_geral_silenciados
--   6. chat_geral_resumo() / chat_geral_marcar_lido()
--   7. Bucket privado `chat-geral` + policies do Storage
--   8. chat_geral_midias_orfas()  (a Edge Function limpar-audios-chat apaga)
--   9. Cron `limpar-chat-geral` (15 dias)
--  10. Realtime
--
-- Pode rodar de novo sem estragar nada (tudo é "if not exists"/"or replace").
-- ============================================================================


-- ─── Quem pode escrever ──────────────────────────────────────────────────────
-- Membro e não silenciado. Uma função só, usada pela tabela e pelo Storage,
-- para as duas regras nunca discordarem.
create table if not exists public.chat_geral_silenciados (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  por        uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.chat_geral_posso_escrever()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_membro()
     and not exists (select 1 from public.chat_geral_silenciados s where s.user_id = auth.uid());
$$;
revoke all on function public.chat_geral_posso_escrever() from public, anon;
grant execute on function public.chat_geral_posso_escrever() to authenticated;


-- ─── 1. Mensagens ────────────────────────────────────────────────────────────
create table if not exists public.chat_geral_mensagens (
  id            uuid primary key default gen_random_uuid(),
  autor_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  autor_nome    text not null default 'Membro',
  tipo          text not null default 'texto',
  texto         text not null default '',
  midia_path    text,
  midia_largura integer,
  midia_altura  integer,
  duracao_ms    integer,
  resposta_a    uuid references public.chat_geral_mensagens(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.chat_geral_mensagens drop constraint if exists chat_geral_mensagens_tipo_check;
alter table public.chat_geral_mensagens add constraint chat_geral_mensagens_tipo_check
  check (tipo in ('texto', 'imagem', 'audio', 'video'));

alter table public.chat_geral_mensagens drop constraint if exists chat_geral_mensagens_conteudo_check;
alter table public.chat_geral_mensagens add constraint chat_geral_mensagens_conteudo_check check (
  char_length(texto) <= 2000
  and case tipo
    when 'texto' then
      midia_path is null and char_length(btrim(texto)) > 0
    -- O arquivo tem que estar na pasta do PRÓPRIO autor (autor_id já foi
    -- forçado para auth.uid() pelo gatilho quando este check roda). Sem isso,
    -- dava para "reenviar" o arquivo de outra pessoa.
    when 'imagem' then
      midia_path ~ ('^' || autor_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|heic)$')
    when 'audio' then
      midia_path ~ ('^' || autor_id::text || '/[0-9a-f-]{36}\.m4a$')
      and duracao_ms between 1 and 330000
    when 'video' then
      midia_path ~ ('^' || autor_id::text || '/[0-9a-f-]{36}\.(mp4|mov)$')
      -- 2 minutos no app, com folga para o arredondamento do celular.
      and duracao_ms between 1 and 125000
    else false
  end
);

create index if not exists chat_geral_mensagens_created_idx
  on public.chat_geral_mensagens (created_at desc);
create index if not exists chat_geral_mensagens_midia_idx
  on public.chat_geral_mensagens (midia_path) where midia_path is not null;

-- Autor e nome vêm do servidor, nunca do celular (mesma função dos outros chats).
drop trigger if exists chat_geral_forca_autor on public.chat_geral_mensagens;
create trigger chat_geral_forca_autor
  before insert on public.chat_geral_mensagens
  for each row execute function public.forca_autor_da_mensagem();

alter table public.chat_geral_mensagens enable row level security;

drop policy if exists "chat geral: membros leem" on public.chat_geral_mensagens;
create policy "chat geral: membros leem"
  on public.chat_geral_mensagens for select to authenticated
  using (public.is_membro());

drop policy if exists "chat geral: membros escrevem" on public.chat_geral_mensagens;
create policy "chat geral: membros escrevem"
  on public.chat_geral_mensagens for insert to authenticated
  with check (autor_id = auth.uid() and public.chat_geral_posso_escrever());

drop policy if exists "chat geral: autor ou admin apaga" on public.chat_geral_mensagens;
create policy "chat geral: autor ou admin apaga"
  on public.chat_geral_mensagens for delete to authenticated
  using (autor_id = auth.uid() or public.is_admin());


-- ─── 2. Reações ──────────────────────────────────────────────────────────────
-- Como no WhatsApp: uma reação por pessoa por mensagem. Trocar de emoji é um
-- upsert; tocar no mesmo emoji de novo apaga.
create table if not exists public.chat_geral_reacoes (
  mensagem_id uuid not null references public.chat_geral_mensagens(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  primary key (mensagem_id, user_id)
);

alter table public.chat_geral_reacoes drop constraint if exists chat_geral_reacoes_emoji_check;
alter table public.chat_geral_reacoes add constraint chat_geral_reacoes_emoji_check
  check (char_length(emoji) between 1 and 16);

alter table public.chat_geral_reacoes enable row level security;

drop policy if exists "chat geral reacoes: membros leem" on public.chat_geral_reacoes;
create policy "chat geral reacoes: membros leem"
  on public.chat_geral_reacoes for select to authenticated
  using (public.is_membro());

drop policy if exists "chat geral reacoes: membro reage" on public.chat_geral_reacoes;
create policy "chat geral reacoes: membro reage"
  on public.chat_geral_reacoes for insert to authenticated
  with check (user_id = auth.uid() and public.is_membro());

drop policy if exists "chat geral reacoes: membro troca a sua" on public.chat_geral_reacoes;
create policy "chat geral reacoes: membro troca a sua"
  on public.chat_geral_reacoes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_membro());

drop policy if exists "chat geral reacoes: membro tira a sua" on public.chat_geral_reacoes;
create policy "chat geral reacoes: membro tira a sua"
  on public.chat_geral_reacoes for delete to authenticated
  using (user_id = auth.uid());


-- ─── 3. Leituras ─────────────────────────────────────────────────────────────
create table if not exists public.chat_geral_leituras (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  lida_em timestamptz not null default now()
);

alter table public.chat_geral_leituras enable row level security;

drop policy if exists "chat geral leituras: só a própria" on public.chat_geral_leituras;
create policy "chat geral leituras: só a própria"
  on public.chat_geral_leituras for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ─── 4. Denúncias ────────────────────────────────────────────────────────────
create table if not exists public.chat_geral_denuncias (
  id             uuid primary key default gen_random_uuid(),
  mensagem_id    uuid not null references public.chat_geral_mensagens(id) on delete cascade,
  denunciante_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (mensagem_id, denunciante_id)
);

alter table public.chat_geral_denuncias enable row level security;

drop policy if exists "chat geral denuncias: membro denuncia" on public.chat_geral_denuncias;
create policy "chat geral denuncias: membro denuncia"
  on public.chat_geral_denuncias for insert to authenticated
  with check (denunciante_id = auth.uid() and public.is_membro());

-- Quem denunciou vê a própria denúncia (para o app não deixar repetir); o
-- Admin vê todas — é assim que a mensagem aparece marcada para ele no chat.
drop policy if exists "chat geral denuncias: admin e o próprio leem" on public.chat_geral_denuncias;
create policy "chat geral denuncias: admin e o próprio leem"
  on public.chat_geral_denuncias for select to authenticated
  using (denunciante_id = auth.uid() or public.is_admin());

drop policy if exists "chat geral denuncias: admin resolve" on public.chat_geral_denuncias;
create policy "chat geral denuncias: admin resolve"
  on public.chat_geral_denuncias for delete to authenticated
  using (public.is_admin());


-- ─── 5. Silenciados ──────────────────────────────────────────────────────────
alter table public.chat_geral_silenciados enable row level security;

drop policy if exists "chat geral silenciados: o próprio e o admin leem" on public.chat_geral_silenciados;
create policy "chat geral silenciados: o próprio e o admin leem"
  on public.chat_geral_silenciados for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "chat geral silenciados: admin silencia" on public.chat_geral_silenciados;
create policy "chat geral silenciados: admin silencia"
  on public.chat_geral_silenciados for insert to authenticated
  with check (public.is_admin());

drop policy if exists "chat geral silenciados: admin libera" on public.chat_geral_silenciados;
create policy "chat geral silenciados: admin libera"
  on public.chat_geral_silenciados for delete to authenticated
  using (public.is_admin());


-- ─── 6. Resumo para o card da Home e "marcar como lido" ──────────────────────
-- Roda com as permissões de quem chama (sem security definer): para um
-- visitante a RLS esconde tudo e o resultado é zero, sem regra duplicada.
create or replace function public.chat_geral_resumo()
returns table (
  nao_lidas    integer,
  ultima_autor text,
  ultima_tipo  text,
  ultima_texto text,
  ultima_em    timestamptz
)
language sql
stable
set search_path = public
as $$
  with lida as (
    select coalesce(
      (select l.lida_em from public.chat_geral_leituras l where l.user_id = auth.uid()),
      'epoch'::timestamptz
    ) as em
  ),
  ultima as (
    select m.autor_nome, m.tipo, m.texto, m.created_at
      from public.chat_geral_mensagens m
     order by m.created_at desc
     limit 1
  )
  select
    (select count(*)::int
       from public.chat_geral_mensagens m, lida
      where m.created_at > lida.em
        and m.autor_id <> auth.uid()),
    u.autor_nome, u.tipo, u.texto, u.created_at
  from (select 1) um
  left join ultima u on true;
$$;
revoke all on function public.chat_geral_resumo() from public, anon;
grant execute on function public.chat_geral_resumo() to authenticated;

-- A hora vem do servidor (o relógio do celular pode estar errado).
create or replace function public.chat_geral_marcar_lido()
returns void
language sql
volatile
set search_path = public
as $$
  insert into public.chat_geral_leituras (user_id, lida_em)
  values (auth.uid(), now())
  on conflict (user_id) do update set lida_em = excluded.lida_em;
$$;
revoke all on function public.chat_geral_marcar_lido() from public, anon;
grant execute on function public.chat_geral_marcar_lido() to authenticated;


-- ─── 7. Bucket e policies do Storage ─────────────────────────────────────────
-- Caminho: `<autor>/<uuid>.<ext>`. Privado: o app pede URL assinada de 1 h.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-geral', 'chat-geral', false,
  40 * 1024 * 1024,   -- vídeo de 2 min comprimido cabe com folga
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac',
    'video/mp4', 'video/quicktime'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat-geral: membros veem" on storage.objects;
create policy "chat-geral: membros veem"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-geral' and public.is_membro());

drop policy if exists "chat-geral: membro envia na própria pasta" on storage.objects;
create policy "chat-geral: membro envia na própria pasta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-geral'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.chat_geral_posso_escrever()
  );

drop policy if exists "chat-geral: autor ou admin apaga" on storage.objects;
create policy "chat-geral: autor ou admin apaga"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-geral'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );


-- ─── 8. Arquivos órfãos ──────────────────────────────────────────────────────
-- O arquivo segue a mensagem: quando a linha some (15 dias, autor apagando,
-- admin moderando), a Edge Function `limpar-audios-chat` remove o arquivo.
-- Uma hora de carência porque o app sobe o arquivo ANTES de gravar a linha.
create or replace function public.chat_geral_midias_orfas(p_limite int default 500)
returns table (caminho text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'chat-geral'
     and o.created_at < now() - interval '1 hour'
     and not exists (
       select 1 from public.chat_geral_mensagens m where m.midia_path = o.name
     )
   order by o.created_at
   limit greatest(1, least(p_limite, 1000));
$$;
revoke all on function public.chat_geral_midias_orfas(int) from public, anon, authenticated;
grant execute on function public.chat_geral_midias_orfas(int) to service_role;


-- ─── 9. Cron: 15 dias ────────────────────────────────────────────────────────
-- 3h15 UTC: antes da limpeza de arquivos (3h30), que então já encontra os
-- arquivos destas mensagens como órfãos e os apaga na mesma madrugada.
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'limpar-chat-geral';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end $$;

select cron.schedule(
  'limpar-chat-geral',
  '15 3 * * *',
  $$ delete from public.chat_geral_mensagens where created_at < now() - interval '15 days'; $$
);


-- ─── 10. Realtime ────────────────────────────────────────────────────────────
do $$
begin
  execute 'alter publication supabase_realtime add table public.chat_geral_mensagens';
exception when duplicate_object then null;
end $$;

do $$
begin
  execute 'alter publication supabase_realtime add table public.chat_geral_reacoes';
exception when duplicate_object then null;
end $$;


-- ─── Conferência ─────────────────────────────────────────────────────────────
-- 1. Tabelas com RLS ligada:
--      select tablename, rowsecurity from pg_tables
--       where tablename like 'chat_geral%';
-- 2. Cron criado:
--      select jobname, schedule from cron.job where jobname = 'limpar-chat-geral';
-- 3. No app: conta de membro manda mensagem; conta de visitante não vê o card.
