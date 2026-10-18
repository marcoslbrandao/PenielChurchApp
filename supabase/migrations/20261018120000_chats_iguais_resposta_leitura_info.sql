-- ============================================================================
-- Chats iguais (18/10/2026): grupos e Banda ganham o que o Chat da Igreja tem
--
-- Pedido do Marcos: "quero que os chats tenham exatamente o mesmo padrao e
-- funcionalidades". O app agora usa UMA tela de chat para os tres; aqui entra
-- o que faltava no banco dos grupos e da Banda:
--   1. resposta_a          -> responder citando uma mensagem
--   2. chat_leituras       -> quando cada pessoa abriu cada chat ("visto por")
--   3. chat_marcar_lido()  -> grava a leitura
--   4. chat_info_mensagem()-> "Reacoes e visualizacoes" (quem reagiu; quem
--                             viu, so para o autor e o admin)
--   5. chats dos grupos guardados 15 dias (eram 14), como os outros dois
-- Pode rodar de novo sem estragar nada.
-- ============================================================================

-- 1. Responder ----------------------------------------------------------------
alter table public.grupo_chat_mensagens
  add column if not exists resposta_a uuid references public.grupo_chat_mensagens(id) on delete set null;
alter table public.banda_chat_mensagens
  add column if not exists resposta_a uuid references public.banda_chat_mensagens(id) on delete set null;

-- 2. Leituras por chat ('grupo:<id>' ou 'banda') ----------------------------------
create table if not exists public.chat_leituras (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chat    text not null check (chat = 'banda' or chat like 'grupo:%'),
  lida_em timestamptz not null default now(),
  primary key (user_id, chat)
);
alter table public.chat_leituras enable row level security;

drop policy if exists "chat leituras: so a propria" on public.chat_leituras;
create policy "chat leituras: so a propria"
  on public.chat_leituras for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. Marcar como lido ---------------------------------------------------------
-- So grava se a pessoa enxerga aquele chat (senao apareceria como "visto"
-- num grupo do qual nao participa).
create or replace function public.chat_marcar_lido(p_chat text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if p_chat = 'banda' then
    if not public.is_banda_membro() then return; end if;
  elsif p_chat like 'grupo:%' then
    if not public.tem_acesso_grupo(substr(p_chat, 7)) then return; end if;
  else
    return;
  end if;
  insert into public.chat_leituras (user_id, chat, lida_em)
  values (auth.uid(), p_chat, now())
  on conflict (user_id, chat) do update set lida_em = excluded.lida_em;
end;
$$;
revoke all on function public.chat_marcar_lido(text) from public, anon;
grant execute on function public.chat_marcar_lido(text) to authenticated;

-- 4. Reacoes e visualizacoes de uma mensagem ---------------------------------
-- p_chat: 'grupo' ou 'banda'. Mesmo formato de chat_geral_info_mensagem.
create or replace function public.chat_info_mensagem(p_chat text, p_mensagem uuid)
returns table (tipo text, user_id uuid, nome text, emoji text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_autor  uuid;
  v_criada timestamptz;
  v_grupo  text;
  v_chave  text;
begin
  if p_chat = 'grupo' then
    select m.autor_id, m.created_at, m.grupo into v_autor, v_criada, v_grupo
      from public.grupo_chat_mensagens m where m.id = p_mensagem;
    if v_autor is null or not public.tem_acesso_grupo(v_grupo) then return; end if;
    v_chave := 'grupo:' || v_grupo;

    return query
      select 'reacao'::text, r.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Membro'), r.emoji
        from public.grupo_chat_reacoes r
        left join public.profiles p on p.id = r.user_id
       where r.mensagem_id = p_mensagem
       order by r.created_at;
  elsif p_chat = 'banda' then
    select m.autor_id, m.created_at into v_autor, v_criada
      from public.banda_chat_mensagens m where m.id = p_mensagem;
    if v_autor is null or not public.is_banda_membro() then return; end if;
    v_chave := 'banda';

    return query
      select 'reacao'::text, r.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Membro'), r.emoji
        from public.banda_chat_reacoes r
        left join public.profiles p on p.id = r.user_id
       where r.mensagem_id = p_mensagem
       order by r.created_at;
  else
    return;
  end if;

  if auth.uid() = v_autor or public.is_admin() then
    return query
      select 'visto'::text, l.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Membro'), null::text
        from public.chat_leituras l
        join public.profiles p on p.id = l.user_id
       where l.chat = v_chave
         and l.lida_em >= v_criada
         and l.user_id <> v_autor
       order by p.full_name;
  end if;
end;
$$;
revoke all on function public.chat_info_mensagem(text, uuid) from public, anon;
grant execute on function public.chat_info_mensagem(text, uuid) to authenticated;

-- 4b. Mensagens de ate 2000 caracteres, como no Chat da Igreja (eram 1000) ------
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass::text as tabela
      from pg_constraint c
     where c.conrelid in ('public.grupo_chat_mensagens'::regclass, 'public.banda_chat_mensagens'::regclass)
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%char_length(texto) <= 1000%'
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
  end loop;
end $$;
alter table public.grupo_chat_mensagens drop constraint if exists grupo_chat_mensagens_texto_2000;
alter table public.grupo_chat_mensagens add constraint grupo_chat_mensagens_texto_2000
  check (char_length(btrim(texto)) > 0 and char_length(texto) <= 2000);
alter table public.banda_chat_mensagens drop constraint if exists banda_chat_mensagens_texto_2000;
alter table public.banda_chat_mensagens add constraint banda_chat_mensagens_texto_2000
  check (char_length(btrim(texto)) > 0 and char_length(texto) <= 2000);

-- 5. Grupos guardam 15 dias, como a Igreja e a Banda (eram 14) ------------------
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'limpar-chat-grupos-antigo';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end $$;

select cron.schedule(
  'limpar-chat-grupos-antigo',
  '0 3 * * *',
  $$ delete from public.grupo_chat_mensagens where created_at < now() - interval '15 days'; $$
);

-- Conferencia
select column_name, table_name from information_schema.columns
 where column_name = 'resposta_a' and table_name in ('grupo_chat_mensagens', 'banda_chat_mensagens');
