-- ============================================================================
-- RLS em `songs`, `cultos` e `culto_songs` (13 Set 2026)
--
-- POR QUE
-- Estas três tabelas nasceram no painel do Supabase, fora do controle de
-- versão, e NENHUMA das 47 migrações liga o RLS delas. Se estiverem sem RLS,
-- qualquer pessoa com a chave anônima do app — que se extrai de um .ipa em
-- minutos, sem conta nenhuma — lê e ESCREVE o repertório inteiro, os cultos e
-- o setlist da banda. Apagar um culto leva junto, em cascata, setlist, escala,
-- roadmap e comentários.
--
-- CONFIRA ANTES DE RODAR (e guarde o resultado):
--   select relname, relrowsecurity
--   from pg_class
--   where relname in ('songs','cultos','culto_songs') and relnamespace = 'public'::regnamespace;
--
-- Se `relrowsecurity` já vier `true` nas três, esta migração só normaliza os
-- nomes das policies — o que continua valendo a pena, porque as que existem
-- hoje não estão documentadas em lugar nenhum e podem ser permissivas demais.
--
-- QUEM PODE O QUÊ (espelha exatamente o que a tela da Banda já faz)
--   • Ler e mexer no repertório e no setlist → membro da banda.
--     `is_banda_membro()` (migração 20260728090000) = quem resgatou o código
--     da banda (`profiles.banda_acesso`) OU é admin. É a MESMA função que já
--     governa ensaios e escalas da banda — nada de critério novo.
--   • Apagar um culto → só admin. É o que a tela faz desde a correção de
--     8 Set, quando a lixeira deixou de aparecer para todo mundo da banda.
--     Aqui a regra passa a valer no banco também, e não só no botão.
-- ============================================================================

alter table public.songs       enable row level security;
alter table public.cultos      enable row level security;
alter table public.culto_songs enable row level security;

-- Derruba TODA policy existente nas três tabelas antes de recriar. Como elas
-- foram criadas fora do versionamento, não dá para confiar nos nomes: pode
-- haver uma policy antiga e permissiva que ninguém documentou, e criar as
-- novas por cima não anula a velha — no Postgres as policies se SOMAM, basta
-- uma liberar para o acesso passar.
do $$
declare
  pol record;
  tabela text;
begin
  foreach tabela in array array['songs', 'cultos', 'culto_songs'] loop
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tabela
    loop
      execute format('drop policy %I on public.%I', pol.policyname, tabela);
    end loop;
  end loop;
end $$;

-- ─── Repertório ────────────────────────────────────────────────────────────
create policy "Banda lê o repertório"
  on public.songs for select using (public.is_banda_membro());
create policy "Banda cadastra música"
  on public.songs for insert with check (public.is_banda_membro());
create policy "Banda edita música"
  on public.songs for update using (public.is_banda_membro()) with check (public.is_banda_membro());
create policy "Banda apaga música"
  on public.songs for delete using (public.is_banda_membro());

-- ─── Cultos ────────────────────────────────────────────────────────────────
create policy "Banda vê os cultos"
  on public.cultos for select using (public.is_banda_membro());
create policy "Banda cria culto"
  on public.cultos for insert with check (public.is_banda_membro());
create policy "Banda edita culto"
  on public.cultos for update using (public.is_banda_membro()) with check (public.is_banda_membro());
-- Só admin apaga: um delete aqui cascateia em setlist, escala, roadmap e
-- comentários daquele culto.
create policy "Admin apaga culto"
  on public.cultos for delete using (public.is_admin());

-- ─── Setlist do culto ──────────────────────────────────────────────────────
create policy "Banda gerencia o setlist do culto"
  on public.culto_songs for all
  using (public.is_banda_membro())
  with check (public.is_banda_membro());

-- ─── Conferência depois de aplicar ─────────────────────────────────────────
-- 1. As três devem aparecer com relrowsecurity = true:
--      select relname, relrowsecurity from pg_class
--      where relname in ('songs','cultos','culto_songs')
--        and relnamespace = 'public'::regnamespace;
--
-- 2. As policies devem ser só estas, e nenhuma outra:
--      select tablename, policyname, cmd, qual from pg_policies
--      where schemaname = 'public'
--        and tablename in ('songs','cultos','culto_songs')
--      order by tablename, cmd;
--
-- 3. No app: abrir a aba Banda com uma conta que TEM o código e conferir que
--    repertório, cultos e setlist continuam carregando e salvando; e que a
--    lixeira do culto só funciona para admin.
