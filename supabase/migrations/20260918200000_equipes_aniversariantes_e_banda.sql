-- ============================================================================
-- Três ajustes pedidos pelo Marcos em 18/09, à noite:
--   1. Aniversariantes passa a ser só do admin.
--   2. Equipe da RECEPÇÃO, separada da de acolhimento, com regra própria de
--      quem pode registrar visitante.
--   3. Notificações da Banda: culto publicado, ensaio novo e chat.
--
-- A GENERALIZAÇÃO QUE ESTE PEDIDO FORÇOU
-- `equipe_acolhimento` nasceu hoje de manhã como tabela própria. Agora vem a
-- Recepção — e a terceira equipe (Infantil, Mídia, Intercessão) é questão de
-- tempo. Três tabelas com uma coluna cada, três funções `eh_x()`, três telas de
-- gestão: é o começo de um padrão que se paga em cada equipe nova.
--
-- Uma tabela com a equipe como VALOR resolve isso: adicionar uma equipe passa
-- a ser um item no CHECK, não uma migração com tabela, policy e função. O
-- momento de fazer essa troca é AGORA, antes de existirem dados de verdade —
-- daqui a um mês seria uma migração de dados de verdade, com risco de verdade.
-- ============================================================================


-- ─── 1. Equipes de ministério ───────────────────────────────────────────────

create table if not exists public.equipes_membros (
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  equipe         text not null check (equipe in ('acolhimento', 'recepcao')),
  adicionado_por uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (profile_id, equipe)
);

comment on table public.equipes_membros is
  'Quem serve em cada equipe que tem permissão própria no app. Não confundir '
  'com `members.ministerio` (o que a pessoa declara no cadastro dela, que é '
  'informação, não permissão) nem com `escala_areas` (quem é escalado).';

alter table public.equipes_membros enable row level security;

drop policy if exists "Admin gerencia as equipes" on public.equipes_membros;
create policy "Admin gerencia as equipes"
  on public.equipes_membros for all
  using (public.is_admin()) with check (public.is_admin());

-- Cada pessoa precisa saber de quais equipes faz parte: é isso que decide o
-- que a tela dela mostra.
drop policy if exists "Vejo minhas equipes" on public.equipes_membros;
create policy "Vejo minhas equipes"
  on public.equipes_membros for select
  using (profile_id = auth.uid());


-- Migra o que a tabela de hoje de manhã tiver. O bloco é condicional porque a
-- `20260918140000` pode não ter sido aplicada ainda neste banco — e uma
-- migração que assume o estado do banco em vez de conferir é como se perde uma
-- tarde descobrindo por que ela falhou só em produção.
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'equipe_acolhimento'
  ) then
    insert into public.equipes_membros (profile_id, equipe, adicionado_por, created_at)
    select profile_id, 'acolhimento', adicionado_por, created_at
      from public.equipe_acolhimento
    on conflict (profile_id, equipe) do nothing;

    drop table public.equipe_acolhimento cascade;
    raise notice 'equipe_acolhimento migrada para equipes_membros e removida';
  end if;
end $$;


create or replace function public.eh_da_equipe(p_equipe text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.equipes_membros
     where profile_id = auth.uid() and equipe = p_equipe
  );
$$;

revoke all on function public.eh_da_equipe(text) from public, anon;
grant execute on function public.eh_da_equipe(text) to authenticated;


-- `eh_acolhimento()` mantém o nome e a assinatura: o `cascade` do drop acima
-- levou a versão antiga junto, e o app commitado hoje de manhã chama esta
-- função por RPC. Recriá-la aqui é o que impede a tela de Visitantes de
-- quebrar entre esta migração e o próximo OTA.
create or replace function public.eh_acolhimento()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin() or public.eh_da_equipe('acolhimento');
$$;

revoke all on function public.eh_acolhimento() from public, anon;
grant execute on function public.eh_acolhimento() to authenticated;


-- Quem pode registrar um visitante, decidido em um lugar só.
--
-- A regra do Marcos: membro, líder, admin e a equipe da Recepção. Note que
-- `profiles.role = 'membro'` já cobre líder e admin — o papel é hierárquico
-- desde sempre. A Recepção entra porque alguém pode servir na porta sem ser
-- membro formal da igreja, e é exatamente essa pessoa que mais registra.
create or replace function public.pode_registrar_visitante()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role in ('membro', 'lider', 'admin')
  ) or public.eh_da_equipe('recepcao');
$$;

revoke all on function public.pode_registrar_visitante() from public, anon;
grant execute on function public.pode_registrar_visitante() to authenticated;


-- A policy de insert em `visitantes` para de aceitar "qualquer um logado".
-- Esconder o botão no app nunca foi proteção: a regra tem de estar aqui.
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'visitantes'
  ) then
    execute 'drop policy if exists "Membro registra visitante" on public.visitantes';
    execute $p$
      create policy "Membro ou recepção registra visitante"
        on public.visitantes for insert
        with check (public.pode_registrar_visitante())
    $p$;
  end if;
end $$;


-- ─── 2. Aniversariantes: só o admin ─────────────────────────────────────────
-- Mudança de decisão do Marcos (antes era "todos veem"). A lista sai do menu
-- de todo mundo — e a FUNÇÃO fecha junto. Só esconder a entrada seria
-- segurança por obscuridade: a RPC continuaria respondendo para qualquer um
-- com a chave anônima e uma sessão.
--
-- A assinatura e o retorno não mudam; muda quem passa pela porta.

create or replace function public.aniversariantes_do_mes(p_mes int default null)
returns table (
  id uuid,
  nome text,
  sobrenome text,
  dia int,
  mes int,
  eh_crianca boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.id,
    m.nome,
    coalesce(m.sobrenome, '') as sobrenome,
    extract(day   from m.data_nascimento)::int as dia,
    extract(month from m.data_nascimento)::int as mes,
    (m.responsavel_id is not null)             as eh_crianca
  from public.members m
  where public.is_admin()
    and m.data_nascimento is not null
    and coalesce(m.mostrar_aniversario, true)
    and extract(month from m.data_nascimento)::int = coalesce(
          p_mes,
          extract(month from (now() at time zone 'Europe/London'))::int
        )
  order by extract(day from m.data_nascimento), m.nome;
$$;

revoke all on function public.aniversariantes_do_mes(int) from public, anon;
grant execute on function public.aniversariantes_do_mes(int) to authenticated;


-- ─── 3. Notificações da Banda ───────────────────────────────────────────────
--
-- Três gatilhos, uma Edge Function. Os avisos vão só para quem está em
-- `banda_membros` — a equipe da banda, não a congregação.
--
-- POR QUE O CHAT PRECISA DE UM LOG
-- Uma conversa de banda no sábado à noite tem trinta mensagens em vinte
-- minutos. Um push por mensagem é a forma mais rápida de alguém desligar a
-- notificação do app inteiro — e aí perde o aviso da escala junto. A primeira
-- mensagem avisa; as seguintes ficam quietas por 20 minutos. Quem está na
-- conversa já está com o app aberto.
--
-- O log também protege contra o webhook disparar duas vezes, que acontece.

create table if not exists public.banda_push_log (
  id         serial primary key,
  tipo       text not null check (tipo in ('culto', 'ensaio', 'chat')),
  referencia text,
  enviado_em timestamptz not null default now()
);

create index if not exists banda_push_log_tipo_idx
  on public.banda_push_log(tipo, enviado_em desc);

alter table public.banda_push_log enable row level security;
-- Sem policy: só a Edge Function (service_role) escreve e lê.

comment on table public.banda_push_log is
  'Agrupa o push do chat da banda (uma notificação por bloco de conversa) e '
  'evita reenvio quando o webhook dispara duas vezes.';


-- Decide se o chat deve notificar agora. Fica no banco, e não na Edge
-- Function, porque é uma pergunta sobre o estado da tabela — e porque assim a
-- janela pode ser ajustada sem publicar função nenhuma.
create or replace function public.banda_chat_deve_notificar(p_janela_min int default 20)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.banda_push_log
     where tipo = 'chat'
       and enviado_em > now() - make_interval(mins => p_janela_min)
  );
$$;

revoke all on function public.banda_chat_deve_notificar(int) from public, anon, authenticated;


-- Quem recebe: a equipe inteira, menos quem causou o aviso. Mandar para o
-- próprio autor a notificação da mensagem que ele acabou de escrever é o tipo
-- de detalhe que faz o recurso parecer mal feito.
create or replace function public.banda_tokens_para_push(p_excluir uuid default null)
returns table (token text)
language sql
security definer
stable
set search_path = public
as $$
  select pt.token
    from public.push_tokens pt
    join public.banda_membros bm on bm.profile_id = pt.user_id
   where p_excluir is null or bm.profile_id <> p_excluir;
$$;

revoke all on function public.banda_tokens_para_push(uuid) from public, anon, authenticated;
