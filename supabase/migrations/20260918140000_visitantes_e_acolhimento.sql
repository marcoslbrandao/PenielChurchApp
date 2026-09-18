-- ============================================================================
-- Visitantes e equipe de acolhimento
--
-- Pedido do Marcos (18/09): registrar o contato de quem visita a igreja, mesmo
-- que a pessoa não tenha o app — e de um jeito fácil para ela.
--
-- A ESCOLHA DELE: a RECEPÇÃO registra pelo app. Não há formulário público.
-- Isso simplifica muito e elimina uma classe inteira de problema: sem página
-- aberta, não há spam de robô, não há portão por IP, não há chave anônima
-- gravando na tabela. Todo insert vem de alguém logado, com nome e sobrenome.
--
-- POR QUE NÃO É UMA LINHA EM `members`
-- `members` é o diretório da igreja: trinta e poucas colunas, endereço,
-- batismo, ministério. Visitante é outra coisa — é alguém que apareceu no
-- domingo e pode nunca mais voltar. Três diferenças que quebrariam `members`:
--
--   • Um visitante que volta em três domingos é UMA pessoa com três visitas,
--     não três cadastros. `total_visitas` e `ultima_visita` resolvem isso; em
--     `members` viraria lixo duplicado que alguém teria de limpar à mão.
--   • O ciclo é de acompanhamento, não de cadastro: novo → contatado →
--     retornou → virou membro. Isso não existe no diretório.
--   • Quem vê é diferente. O diretório é do admin; a lista de visitantes é da
--     equipe de acolhimento, que não tem (nem deve ter) acesso ao diretório.
--
-- Quando a pessoa vira membro, `member_id` liga as duas e a história fica:
-- dá para saber que o irmão que hoje serve na Recepção chegou num domingo de
-- setembro trazido por um amigo.
-- ============================================================================


-- ─── 1. A equipe de acolhimento ─────────────────────────────────────────────
-- Tabela própria, e não uma área de `escala_areas` ou um grupo de
-- `group_leaders`: aquelas duas respondem "quem escala" e "quem lidera um
-- grupo", e esta responde "quem pode ler os dados de contato de quem visitou a
-- igreja". Forçar esse significado numa tabela existente economizaria uma
-- migração e custaria clareza em toda consulta futura.

create table if not exists public.equipe_acolhimento (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  adicionado_por uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.equipe_acolhimento enable row level security;

drop policy if exists "Admin gerencia a equipe de acolhimento" on public.equipe_acolhimento;
create policy "Admin gerencia a equipe de acolhimento"
  on public.equipe_acolhimento for all
  using (public.is_admin()) with check (public.is_admin());

-- Quem está na equipe precisa saber que está — senão a tela não tem como
-- decidir se mostra a lista sem uma segunda consulta.
drop policy if exists "Vejo se estou na equipe" on public.equipe_acolhimento;
create policy "Vejo se estou na equipe"
  on public.equipe_acolhimento for select
  using (profile_id = auth.uid());

create or replace function public.eh_acolhimento()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin()
      or exists (select 1 from public.equipe_acolhimento where profile_id = auth.uid());
$$;

revoke all on function public.eh_acolhimento() from public, anon;
grant execute on function public.eh_acolhimento() to authenticated;


-- ─── 2. Normalizar telefone — o que faz a deduplicação funcionar ────────────
-- Tirar os não-dígitos não basta, e o teste provou isso: "+44 7700 900123" e
-- "07700900123" são o MESMO celular britânico, e viravam duas pessoas na
-- lista. Quem digita na recepção escreve do jeito que a pessoa dita, e as duas
-- formas convivem no mesmo domingo.
--
-- A regra, com o Reino Unido como padrão porque é onde a igreja está:
--   00XXXX…  → prefixo internacional discado; tira os dois zeros
--   0XXXX…   → formato nacional britânico; o 0 vira 44
--   44XXXX…  → já internacional; fica
--   o resto  → fica como está (um +55 brasileiro já chega certo)
--
-- Função única, usada pelo gatilho E pela RPC. A lógica estava escrita duas
-- vezes; duas cópias de uma regra de normalização é como a deduplicação passa
-- a furar em silêncio quando só uma delas é corrigida.

create or replace function public.normaliza_telefone(p_telefone text)
returns text
language sql
immutable
as $$
  with d as (
    select nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '') as n
  )
  select case
    when n is null           then null
    when n like '00%'        then substring(n from 3)
    when n like '0%'
     and length(n) between 10 and 11 then '44' || substring(n from 2)
    else n
  end
  from d;
$$;


-- ─── 3. Os visitantes ───────────────────────────────────────────────────────

create table if not exists public.visitantes (
  id uuid primary key default gen_random_uuid(),

  nome            text not null,
  telefone        text,
  -- Só dígitos, calculado pelo gatilho abaixo. É a chave de deduplicação:
  -- "+44 7700 900123", "07700900123" e "44 7700-900123" são a mesma pessoa,
  -- e sem normalizar a lista encheria de repetidos em três domingos.
  telefone_digitos text,
  email           text,

  primeira_vez    boolean not null default true,
  como_conheceu   text,
  observacoes     text,

  -- CONSENTIMENTO. Quem digita é a recepção, não a pessoa — então o app tem
  -- de perguntar em voz alta e marcar aqui. No Reino Unido guardar telefone
  -- para entrar em contato precisa de base legal, e "alguém anotou num
  -- papel" não é uma. Sem isto marcado, a lista mostra a pessoa mas avisa
  -- que não se deve ligar.
  consentiu_contato boolean not null default false,

  primeira_visita date not null default current_date,
  ultima_visita   date not null default current_date,
  total_visitas   int  not null default 1,

  situacao text not null default 'novo'
    check (situacao in ('novo', 'contatado', 'retornou', 'virou_membro', 'sem_retorno')),
  contatado_em   timestamptz,
  contatado_por  uuid references public.profiles(id) on delete set null,
  nota_contato   text,

  member_id      uuid references public.members(id) on delete set null,
  registrado_por uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists visitantes_situacao_idx on public.visitantes(situacao, ultima_visita desc);
create index if not exists visitantes_telefone_idx on public.visitantes(telefone_digitos)
  where telefone_digitos is not null;

comment on table public.visitantes is
  'Quem visitou a igreja. UMA linha por pessoa, com o contador de visitas — '
  'não uma linha por domingo. Dados de contato: só a equipe de acolhimento e '
  'o admin leem.';


-- ─── 4. O servidor normaliza e assina ───────────────────────────────────────
-- Mesmo princípio do `forca_autor_da_mensagem` dos chats: o que identifica
-- quem escreveu não vem do cliente. Aqui vale também para o telefone — se a
-- normalização ficasse no app, uma versão antiga do app gravaria o formato
-- velho e a deduplicação furaria sem ninguém perceber.

create or replace function public.visitantes_normaliza()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.telefone_digitos := public.normaliza_telefone(new.telefone);

  if tg_op = 'INSERT' then
    new.registrado_por := coalesce(auth.uid(), new.registrado_por);
  else
    new.registrado_por := old.registrado_por;
    new.created_at     := old.created_at;
  end if;

  -- Marcar "contatado" carimba a data e quem falou, sem depender do cliente.
  if new.situacao is distinct from coalesce(old.situacao, '') and new.situacao <> 'novo' then
    new.contatado_em  := coalesce(new.contatado_em, now());
    new.contatado_por := coalesce(new.contatado_por, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists visitantes_normaliza_trg on public.visitantes;
create trigger visitantes_normaliza_trg
  before insert or update on public.visitantes
  for each row execute function public.visitantes_normaliza();


-- ─── 5. Quem pode o quê ─────────────────────────────────────────────────────
-- A assimetria é de propósito: REGISTRAR é liberal, LER é restrito.
--
-- Qualquer membro logado pode registrar um visitante. Quem recebe alguém na
-- porta nem sempre é da escala de Recepção — é quem estava ali. Travar o
-- insert na equipe faria a igreja perder exatamente os contatos que o irmão
-- comum traria, que é o problema que esta feature existe para resolver.
--
-- Ler a lista inteira, com telefone e observações, é outra conversa: isso é
-- da equipe de acolhimento e do admin.

alter table public.visitantes enable row level security;

drop policy if exists "Membro registra visitante" on public.visitantes;
create policy "Membro registra visitante"
  on public.visitantes for insert
  with check (auth.uid() is not null);

drop policy if exists "Acolhimento lê os visitantes" on public.visitantes;
create policy "Acolhimento lê os visitantes"
  on public.visitantes for select
  using (public.eh_acolhimento() or registrado_por = auth.uid());

drop policy if exists "Acolhimento atualiza os visitantes" on public.visitantes;
create policy "Acolhimento atualiza os visitantes"
  on public.visitantes for update
  using (public.eh_acolhimento() or registrado_por = auth.uid())
  with check (public.eh_acolhimento() or registrado_por = auth.uid());

-- Apagar é só do admin. Um registro de visitante é a memória de que alguém
-- esteve ali; quem digitou errado corrige, não apaga.
drop policy if exists "Admin apaga visitante" on public.visitantes;
create policy "Admin apaga visitante"
  on public.visitantes for delete
  using (public.is_admin());


-- ─── 6. Registrar, com deduplicação ─────────────────────────────────────────
-- A recepção não vai lembrar se o João já veio em agosto. A função responde
-- isso sozinha, pelo telefone: se a pessoa já está lá, conta mais uma visita
-- em vez de criar uma linha nova.
--
-- `security definer` porque precisa PROCURAR em toda a tabela para decidir, e
-- quem registra normalmente não tem permissão de leitura. Devolve apenas o id
-- e se já existia — nunca os dados de quem já está cadastrado, senão viraria
-- uma forma de consultar a lista por tentativa e erro.

create or replace function public.registrar_visitante(
  p_nome text,
  p_telefone text default null,
  p_email text default null,
  p_primeira_vez boolean default true,
  p_como_conheceu text default null,
  p_observacoes text default null,
  p_consentiu_contato boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digitos text;
  v_id uuid;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'erro', 'sem_sessao');
  end if;
  if btrim(coalesce(p_nome, '')) = '' then
    return json_build_object('ok', false, 'erro', 'nome_vazio');
  end if;

  v_digitos := public.normaliza_telefone(p_telefone);

  -- Só deduplica com telefone: dois "João" sem telefone são duas pessoas até
  -- prova em contrário, e juntá-los perderia uma visita de verdade.
  if v_digitos is not null then
    select id into v_id from public.visitantes
     where telefone_digitos = v_digitos
     order by ultima_visita desc limit 1
     for update;
  end if;

  if v_id is not null then
    update public.visitantes
       set ultima_visita = current_date,
           total_visitas = total_visitas + 1,
           primeira_vez  = false,
           -- Só preenche o que estava em branco: a recepção de hoje não
           -- apaga o que a de agosto anotou.
           email         = coalesce(nullif(btrim(coalesce(p_email, '')), ''), email),
           como_conheceu = coalesce(como_conheceu, nullif(btrim(coalesce(p_como_conheceu, '')), '')),
           observacoes   = case
                             when btrim(coalesce(p_observacoes, '')) = '' then observacoes
                             when observacoes is null then p_observacoes
                             else observacoes || E'\n---\n' || p_observacoes
                           end,
           consentiu_contato = consentiu_contato or p_consentiu_contato,
           -- Quem já tinha sido dado como sem retorno e apareceu de novo
           -- volta para a fila; quem já é membro continua membro.
           situacao = case when situacao in ('sem_retorno', 'contatado') then 'retornou' else situacao end
     where id = v_id;

    return json_build_object('ok', true, 'id', v_id, 'ja_existia', true, 'telefone_wa', v_digitos);
  end if;

  insert into public.visitantes
    (nome, telefone, email, primeira_vez, como_conheceu, observacoes, consentiu_contato)
  values
    (btrim(p_nome),
     nullif(btrim(coalesce(p_telefone, '')), ''),
     nullif(btrim(coalesce(p_email, '')), ''),
     coalesce(p_primeira_vez, true),
     nullif(btrim(coalesce(p_como_conheceu, '')), ''),
     nullif(btrim(coalesce(p_observacoes, '')), ''),
     coalesce(p_consentiu_contato, false))
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'ja_existia', false, 'telefone_wa', v_digitos);
end;
$$;

revoke all on function public.registrar_visitante(text, text, text, boolean, text, text, boolean) from public, anon;
grant execute on function public.registrar_visitante(text, text, text, boolean, text, text, boolean) to authenticated;


-- ─── 7. Números para a liderança ────────────────────────────────────────────
-- Uma consulta, não uma tela que soma no cliente: contar no banco evita que a
-- estatística mude conforme o filtro que a pessoa deixou ligado.

create or replace function public.resumo_visitantes()
returns table (
  novos_semana   int,
  novos_mes      int,
  aguardando     int,
  retornaram     int,
  viraram_membro int
)
language sql
security definer
stable
set search_path = public
as $$
  select
    count(*) filter (where v.primeira_visita >= current_date - 7)::int,
    count(*) filter (where v.primeira_visita >= date_trunc('month', current_date)::date)::int,
    count(*) filter (where v.situacao = 'novo')::int,
    count(*) filter (where v.situacao = 'retornou')::int,
    count(*) filter (where v.situacao = 'virou_membro')::int
  from public.visitantes v
  where public.eh_acolhimento();
$$;

revoke all on function public.resumo_visitantes() from public, anon;
grant execute on function public.resumo_visitantes() to authenticated;
