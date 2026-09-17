-- ============================================================================
-- Filhos no cadastro do responsável + lista de aniversariantes por mês
--
-- O PROBLEMA
-- Criança não tem e-mail, logo não tem conta, logo nunca entrou no diretório.
-- Resultado prático: a igreja não sabe quantas crianças tem, quem são os pais
-- delas, nem quando é o aniversário de nenhuma. O ministério infantil começa
-- sem lista de chamada.
--
-- A DECISÃO
-- A criança é uma linha em `members`, como qualquer pessoa da igreja, ligada
-- ao responsável por `responsavel_id`. Não é tabela nova, de propósito:
-- `members` já aceita gente sem conta (é assim que metade do Estudo Bíblico
-- está lá), já tem data de nascimento, e já é o que a chamada, a escala e os
-- aniversariantes leem. Tabela separada obrigaria a escrever tudo isso duas
-- vezes.
--
-- O discriminador é `responsavel_id is not null`, NÃO o status — assim as
-- telas antigas que filtram por status continuam corretas sem saber que
-- crianças existem. O status ganha 'crianca' por clareza, mas nada depende
-- disso.
--
-- PRIVACIDADE
-- `aniversariantes_do_mes` devolve dia e mês, NUNCA o ano. A lista é visível
-- para qualquer membro logado (decisão do Marcos, 17/09), e sem o ano ela
-- responde "quem faz aniversário em outubro" sem publicar a data de
-- nascimento completa de ninguém — de menor, principalmente. Quem não quiser
-- aparecer desliga em `mostrar_aniversario`.
-- ============================================================================


-- ─── 1. As colunas ──────────────────────────────────────────────────────────

alter table public.members
  add column if not exists responsavel_id uuid
    references public.members(id) on delete cascade,
  add column if not exists mostrar_aniversario boolean not null default true;

comment on column public.members.responsavel_id is
  'Membro responsável por este cadastro (pai/mãe/tutor). Preenchido quando a '
  'pessoa é dependente e não tem conta própria — tipicamente criança. '
  'ON DELETE CASCADE: remover o responsável remove os dependentes dele.';

comment on column public.members.mostrar_aniversario is
  'Falso esconde a pessoa da lista pública de aniversariantes. Não afeta o '
  'diretório do admin, que continua vendo a data completa.';

create index if not exists members_responsavel_id_idx
  on public.members(responsavel_id) where responsavel_id is not null;

-- Índice para a busca por mês. `extract` é imutável sobre `date`, então dá
-- para indexar; sem isto a lista varre a tabela inteira a cada abertura.
create index if not exists members_aniversario_idx
  on public.members((extract(month from data_nascimento)), (extract(day from data_nascimento)))
  where data_nascimento is not null;


-- ─── 2. O status 'crianca' ──────────────────────────────────────────────────
-- `members` nasceu no painel do Supabase, fora do controle de versão, então
-- não dá para confiar no nome do CHECK de status que existe lá — pode ser
-- `members_status_check`, pode ser um nome gerado, pode não existir. O bloco
-- abaixo remove qualquer CHECK que mencione status e recria um só.
--
-- `not valid` de propósito: valida as linhas novas, não recusa a migração se
-- alguma linha antiga tiver um status digitado à mão que ninguém previu.

do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'members'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.members drop constraint %I', r.conname);
    raise notice 'CHECK de status removido para ser recriado: %', r.conname;
  end loop;
end $$;

alter table public.members
  add constraint members_status_check
  check (status in ('membro', 'visitante', 'lider', 'crianca')) not valid;


-- ─── 3. Quem é o meu cadastro ───────────────────────────────────────────────
-- Existe só para a policy abaixo. Uma policy EM `members` que consultasse
-- `members` num subselect entraria em recursão infinita de RLS — o subselect
-- também passa pela policy. `security definer` corta esse laço.

create or replace function public.meu_member_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.members where profile_id = auth.uid() limit 1;
$$;

revoke all on function public.meu_member_id() from public, anon;
grant execute on function public.meu_member_id() to authenticated;


-- ─── 4. O responsável gerencia os próprios dependentes ──────────────────────
-- Some com o resto: as policies de admin e a de "vejo meu próprio registro"
-- continuam intactas, e o Postgres combina policies permissivas com OR.
--
-- O `with check` repete a condição de propósito: sem ele, o responsável
-- poderia editar um filho e, no update, apontar `responsavel_id` para outra
-- pessoa — entregando o cadastro da criança a terceiros.

drop policy if exists "Responsável gerencia seus dependentes" on public.members;
create policy "Responsável gerencia seus dependentes"
  on public.members for all
  using (responsavel_id is not null and responsavel_id = public.meu_member_id())
  with check (responsavel_id is not null and responsavel_id = public.meu_member_id());


-- ─── 5. A lista de aniversariantes ──────────────────────────────────────────
-- `members` é fechada para admin (migração 20260908203000). Esta função é a
-- única porta pela qual um membro comum enxerga alguma coisa dela, e ela
-- devolve exatamente quatro campos: nome, sobrenome, dia e mês.
--
-- Sem o ano. Sem idade, telefone, endereço ou e-mail. É o mesmo padrão de
-- `participantes_do_grupo` e `membros_para_grupo`: a função é a permissão, a
-- tabela continua trancada.

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
  where auth.uid() is not null
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


-- ─── 6. Guarda contra push repetido ─────────────────────────────────────────
-- O cron de aniversário roda uma vez por dia, mas "uma vez por dia" é uma
-- promessa do agendador, não uma garantia: um retry, um teste manual ou um
-- segundo cron criado por engano mandam a congregação inteira receber o mesmo
-- "🎂 Aniversário hoje!" duas vezes. A chave primária (data, tipo) é o que
-- impede isso — a função grava ANTES de enviar e desiste se a linha já existe.

create table if not exists public.aniversario_push_log (
  data       date not null,
  tipo       text not null check (tipo in ('vespera', 'dia')),
  enviados   int  not null default 0,
  created_at timestamptz not null default now(),
  primary key (data, tipo)
);

alter table public.aniversario_push_log enable row level security;
-- Sem policy nenhuma, de propósito: só a service_role (as Edge Functions)
-- escreve aqui. Cliente nenhum tem o que fazer com esta tabela.


-- ─── 7. O gatilho de proteção: conserto + INSERT ───────────────────────────
--
-- ACHADO — A PROTEÇÃO NUNCA VALEU. Revisando este gatilho para estendê-lo ao
-- INSERT, descobriu-se que ele não protegia nada desde que nasceu (migração
-- 20260909010000). A condição era:
--
--     if current_user = 'authenticated' and not public.is_admin() then
--
-- e a função é `security definer`. Dentro de uma função `security definer`,
-- `current_user` é o DONO da função — `postgres` ou `supabase_admin` —, nunca
-- `authenticated`, por mais que a chamada tenha vindo de um celular. A
-- condição era falsa em toda execução, e o corpo do `if` jamais rodou.
--
-- Consequência em produção: qualquer pessoa com a chave anônima (que sai de um
-- .ipa em minutos) podia, com um update no próprio cadastro, escrever nas
-- `observacoes` — as notas internas da liderança sobre a pessoa — e mudar o
-- próprio `status` para 'lider'. Reproduzido num Postgres 16 local com o
-- esquema da tabela antes de escrever este conserto.
--
-- O CONSERTO não é trocar por `session_user`: seria trocar uma pegadinha por
-- outra, porque `session_user` também não distingue admin de membro. A
-- pergunta certa é quem está chamando, e isso o projeto já sabe responder:
--
--     auth.uid() is not null  → veio de um cliente com sessão de usuário
--     not public.is_admin()   → e essa sessão não é de administrador
--
-- Os dois casos que PRECISAM passar continuam passando: admin (is_admin()
-- verdadeiro) e as Edge Functions com service_role, onde `auth.uid()` é nulo —
-- é assim que `birthday-notifications` e o backfill de `use_invite_code`
-- escrevem em `members` sem esbarrar aqui.
--
-- O ALCANCE NOVO é o INSERT, que a policy da seção 4 passou a permitir ao
-- responsável. Sem ele, o pai escolheria o `status` do "filho" (um cadastro
-- 'lider' no diretório da igreja), o `profile_id` (apontando a ficha da
-- criança para a conta de outra pessoa) e as `observacoes`.

create or replace function public.members_protege_campos_da_lideranca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sessão de cliente que não é admin. `auth.uid() is null` = service_role,
  -- cron ou migração: esses precisam escrever e passam direto.
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'UPDATE' then
      new.observacoes    := old.observacoes;
      new.status         := old.status;
      -- Um dependente não muda de dono por update do cliente.
      new.responsavel_id := old.responsavel_id;
    else
      new.observacoes := null;
      if new.responsavel_id is not null then
        -- Dependente cadastrado pelo responsável: criança, sem conta, ponto.
        new.status     := 'crianca';
        new.profile_id := null;
      elsif new.status = 'lider' then
        -- Quem chega sozinho chega como visitante. Promover é ato da
        -- liderança, e `members.status` é o que o admin lê para saber quem é
        -- quem — a permissão de verdade mora em `group_leaders`.
        new.status := 'visitante';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists members_protege_campos_trg on public.members;
create trigger members_protege_campos_trg
  before insert or update on public.members
  for each row execute function public.members_protege_campos_da_lideranca();
