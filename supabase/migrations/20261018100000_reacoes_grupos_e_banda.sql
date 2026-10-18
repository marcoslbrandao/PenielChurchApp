-- ============================================================================
-- Reacoes (emoji) tambem nos chats dos grupos e da Banda (18/10/2026)
--
-- Pedido do Marcos: "quero que todos os chats funcionem iguais". O Chat da
-- Igreja ja tinha reacoes (chat_geral_reacoes); aqui entram as mesmas regras
-- para os outros dois: uma reacao por pessoa por mensagem, trocar = upsert,
-- tocar no mesmo emoji de novo = apagar. Quem le/reage e quem enxerga aquele
-- chat. Apagar a mensagem (ou a limpeza de 15 dias) leva as reacoes junto.
-- Pode rodar de novo sem estragar nada.
-- ============================================================================

-- --- Grupos -----------------------------------------------------------------
create table if not exists public.grupo_chat_reacoes (
  mensagem_id uuid not null references public.grupo_chat_mensagens(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji       text not null check (char_length(emoji) between 1 and 16),
  created_at  timestamptz not null default now(),
  primary key (mensagem_id, user_id)
);
alter table public.grupo_chat_reacoes enable row level security;

-- Quem enxerga a mensagem enxerga as reacoes dela.
create or replace function public.posso_ver_msg_grupo(p_mensagem uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.grupo_chat_mensagens m
                  where m.id = p_mensagem and public.tem_acesso_grupo(m.grupo));
$$;
revoke all on function public.posso_ver_msg_grupo(uuid) from public, anon;
grant execute on function public.posso_ver_msg_grupo(uuid) to authenticated;

drop policy if exists "grupo reacoes: quem ve le" on public.grupo_chat_reacoes;
create policy "grupo reacoes: quem ve le"
  on public.grupo_chat_reacoes for select to authenticated
  using (public.posso_ver_msg_grupo(mensagem_id));

drop policy if exists "grupo reacoes: reage" on public.grupo_chat_reacoes;
create policy "grupo reacoes: reage"
  on public.grupo_chat_reacoes for insert to authenticated
  with check (user_id = auth.uid() and public.posso_ver_msg_grupo(mensagem_id));

drop policy if exists "grupo reacoes: troca a sua" on public.grupo_chat_reacoes;
create policy "grupo reacoes: troca a sua"
  on public.grupo_chat_reacoes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.posso_ver_msg_grupo(mensagem_id));

drop policy if exists "grupo reacoes: tira a sua" on public.grupo_chat_reacoes;
create policy "grupo reacoes: tira a sua"
  on public.grupo_chat_reacoes for delete to authenticated
  using (user_id = auth.uid());

-- --- Banda ------------------------------------------------------------------
create table if not exists public.banda_chat_reacoes (
  mensagem_id uuid not null references public.banda_chat_mensagens(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji       text not null check (char_length(emoji) between 1 and 16),
  created_at  timestamptz not null default now(),
  primary key (mensagem_id, user_id)
);
alter table public.banda_chat_reacoes enable row level security;

drop policy if exists "banda reacoes: banda le" on public.banda_chat_reacoes;
create policy "banda reacoes: banda le"
  on public.banda_chat_reacoes for select to authenticated
  using (public.is_banda_membro());

drop policy if exists "banda reacoes: reage" on public.banda_chat_reacoes;
create policy "banda reacoes: reage"
  on public.banda_chat_reacoes for insert to authenticated
  with check (user_id = auth.uid() and public.is_banda_membro());

drop policy if exists "banda reacoes: troca a sua" on public.banda_chat_reacoes;
create policy "banda reacoes: troca a sua"
  on public.banda_chat_reacoes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_banda_membro());

drop policy if exists "banda reacoes: tira a sua" on public.banda_chat_reacoes;
create policy "banda reacoes: tira a sua"
  on public.banda_chat_reacoes for delete to authenticated
  using (user_id = auth.uid());

-- --- Tempo real -------------------------------------------------------------
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.grupo_chat_reacoes';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.banda_chat_reacoes';
  exception when duplicate_object then null;
  end;
end $$;
alter table public.grupo_chat_reacoes replica identity full;
alter table public.banda_chat_reacoes replica identity full;

-- Conferencia: 8 policies
select tablename, policyname, cmd from pg_policies
 where tablename in ('grupo_chat_reacoes', 'banda_chat_reacoes') order by 1, 3;
