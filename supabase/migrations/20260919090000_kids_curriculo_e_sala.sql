-- ============================================================================
-- Peniel Kids — leva 1: o currículo, a sala infantil e a ficha que faltava
--
-- O QUE ESTA LEVA ENTREGA
--   • o grupo `infantil` liberado em toda a máquina de grupos que já existe;
--   • o currículo: trimestre → lição → conteúdo por trilha → jogo;
--   • `kit_da_semana(...)`: o que a família vê durante a semana;
--   • `ficha_seguranca_sala(...)`: alergia e necessidade especial chegando em
--     quem está com a criança no domingo — a lacuna aberta desde 18/09;
--   • o carimbo, que liga o kit feito em casa à sala do domingo.
--
-- O QUE FICA DE FORA, por decisão do Marcos (19/09): check-in e check-out com
-- código de retirada. São poucas crianças; quando a sala crescer, a ficha de
-- cada uma já existe e o fluxo entra em cima dela.
-- ============================================================================


-- ─── 1. O grupo `infantil`, em todos os CHECKs de uma vez ───────────────────
--
-- A sala infantil não ganha tabelas próprias de presença, chamada, eventos ou
-- caderno: ela usa as de grupo, que estão prontas e testadas desde julho. O
-- preço é que `'infantil'` precisa entrar num CHECK em cada uma delas —
-- `grupo_membros`, `grupo_eventos`, `grupo_config`, `grupo_caderno`,
-- `grupo_recorrencias`, `group_leaders` — e ESQUECER UMA só aparece no
-- domingo, quando a professora tenta salvar a chamada.
--
-- Por isso o bloco não lista as tabelas: ele PROCURA todo CHECK que enumere os
-- grupos (reconhecido por conter 'mulheres', que está em todos desde o começo)
-- e reescreve a própria definição do constraint. Uma tabela de grupo que eu
-- não conheça é tratada junto, e rodar de novo não faz nada — o `not like
-- '%infantil%'` é o que torna isto idempotente.
--
-- `not valid` na recriação: valida as linhas novas e não recusa a migração por
-- causa de alguma linha antiga com um valor que ninguém previu.

do $$
declare
  r record;
  nova_def text;
  contador int := 0;
begin
  for r in
    select c.relname as tabela, con.conname as nome, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%''mulheres''%'
       and pg_get_constraintdef(con.oid) not like '%''infantil''%'
  loop
    -- Insere 'infantil' imediatamente antes de 'mulheres', preservando o cast
    -- que o Postgres escreve na definição normalizada ('mulheres'::text).
    nova_def := regexp_replace(r.def, '(''mulheres''(::[a-z ]+)?)', '''infantil''\2, \1');

    execute format('alter table public.%I drop constraint %I', r.tabela, r.nome);
    execute format('alter table public.%I add constraint %I %s not valid', r.tabela, r.nome, nova_def);
    contador := contador + 1;
    raise notice 'grupo infantil liberado em %.%', r.tabela, r.nome;
  end loop;

  if contador = 0 then
    raise notice 'nenhum CHECK de grupo precisou mudar (já liberado, ou nenhum encontrado)';
  end if;
end $$;

-- A sala nasce com a chamada ligada. As "perguntas da aula" ficam desligadas:
-- são o formato do Estudo Bíblico (adulto respondendo sobre o texto), e não o
-- que se faz com uma criança de cinco anos.
insert into public.grupo_config (grupo, presenca_ativa, perguntas_ativas)
select 'infantil', true, false
 where exists (
   select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'grupo_config'
 )
on conflict (grupo) do nothing;


-- ─── 1b. O nome que a notificação mostra ────────────────────────────────────
-- Duas funções de gatilho montam o título do push com um CASE de rótulos que
-- termina em `else v_grupo`. Sem esta emenda, a igreja receberia "Novo
-- material · infantil" — o nome de coluna vazando para a tela de quem só
-- queria saber que a professora subiu a atividade da semana.
--
-- O CASE está escrito dentro do corpo das funções, então a emenda é no texto
-- do próprio corpo: pego a definição que o banco guarda, acrescento a linha
-- depois do `estudo_biblico`, e reexecuto. O `not like '%Peniel Kids%'` é o
-- que faz rodar duas vezes não fazer nada.

do $$
declare
  r record;
  def text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       -- só funções comuns: pg_get_functiondef recusa agregados e janelas.
       and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%''estudo_biblico'' then ''Estudo Bíblico''%'
       and pg_get_functiondef(p.oid) not like '%Peniel Kids%'
  loop
    def := replace(
      pg_get_functiondef(r.oid),
      'when ''estudo_biblico'' then ''Estudo Bíblico''',
      'when ''estudo_biblico'' then ''Estudo Bíblico''' || chr(10) ||
      '    when ''infantil''       then ''Peniel Kids'''
    );
    execute def;
    raise notice 'rotulo Peniel Kids acrescentado em %', r.proname;
  end loop;
end $$;


-- ─── 2. O currículo ─────────────────────────────────────────────────────────
-- Três níveis, e a razão de cada um:
--
--   trimestre → o arco. 13 domingos, um tema. É a unidade que a liderança
--     planeja e da qual sai o material impresso.
--   lição     → o domingo. O que a sala ensina e do que a semana é filha.
--   conteúdo  → a lição EM UMA TRILHA. Jardim e Exploradores recebem o mesmo
--     tema em dois textos escritos do zero — uma criança de 4 anos não lê e a
--     de 10 se sente bebê com boneco. Encurtar o texto do maior para o menor
--     é o erro que faz material infantil soar falso.

create table if not exists public.kids_trimestres (
  id       uuid primary key default gen_random_uuid(),
  nome     text not null,
  tema     text,
  inicio   date not null,
  fim      date not null,
  ativo    boolean not null default false,
  created_at timestamptz not null default now()
);

-- Um trimestre ativo por vez: é o que a tela da família abre sem perguntar
-- nada. Índice parcial em vez de coluna calculada — o banco recusa o segundo.
create unique index if not exists kids_trimestres_um_ativo
  on public.kids_trimestres((ativo)) where ativo;

create table if not exists public.kids_licoes (
  id             uuid primary key default gen_random_uuid(),
  trimestre_id   uuid not null references public.kids_trimestres(id) on delete cascade,
  numero         int  not null,
  data           date not null,
  titulo         text not null,
  base_biblica   text,
  verdade_central text,
  enfase         text,
  created_at     timestamptz not null default now(),
  unique (trimestre_id, numero)
);

create index if not exists kids_licoes_data_idx on public.kids_licoes(data);

create table if not exists public.kids_conteudo (
  id        uuid primary key default gen_random_uuid(),
  licao_id  uuid not null references public.kids_licoes(id) on delete cascade,
  trilha    text not null check (trilha in ('jardim', 'exploradores')),

  versiculo_texto   text,
  versiculo_ref     text,

  historia_titulo   text,
  historia_texto    text,
  -- Áudio NOSSO, no Storage: a voz da professora que a criança reconhece do
  -- domingo, sem uma linha de direito autoral. `expo-audio` já está no app.
  historia_audio_url text,
  historia_duracao_s int,

  musica_titulo     text,
  musica_audio_url  text,

  -- Vídeo NUNCA é hospedado: é embed, e a curadoria é a proteção. Um vídeo
  -- por semana, escolhido pela professora — nunca uma busca ou uma lista
  -- aberta, que é o que entrega a criança ao autoplay e às sugestões.
  video_titulo      text,
  video_youtube_id  text,

  atividade_titulo  text,
  atividade_pdf_url text,

  -- O roteiro do domingo. Só a liderança lê.
  roteiro_sala      text,

  devocional_familia text,

  created_at timestamptz not null default now(),
  unique (licao_id, trilha)
);

-- ─── O jogo: cinco mecânicas, não 52 jogos ──────────────────────────────────
-- `dados` é jsonb de propósito. Cada mecânica tem uma forma diferente
-- (ordenar quer uma lista de cenas; decorar quer um versículo e uma ordem de
-- sumiço), e criar uma tabela por mecânica significaria uma migração a cada
-- jogo novo. O app valida a forma ao renderizar; o banco guarda o conteúdo.
create table if not exists public.kids_jogos (
  id        uuid primary key default gen_random_uuid(),
  licao_id  uuid not null references public.kids_licoes(id) on delete cascade,
  trilha    text not null check (trilha in ('jardim', 'exploradores')),
  mecanica  text not null check (mecanica in ('ordenar', 'parear', 'escolher', 'decorar', 'encontrar')),
  titulo    text not null,
  instrucao text,
  dados     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (licao_id, trilha)
);

comment on column public.kids_jogos.dados is
  'A forma depende da mecânica. ordenar: {"itens":[{"id","texto","imagem"}]} na '
  'ordem CERTA (o app embaralha). parear: {"pares":[{"a","b"}]}. escolher: '
  '{"perguntas":[{"texto","opcoes":[...],"certa":0}]}. decorar: {"versiculo", '
  '"passos":3}. encontrar: {"cena","achar":[{"nome","x","y"}]}.';


-- ─── 3. O carimbo ───────────────────────────────────────────────────────────
-- É o elo entre a semana e o domingo, e o motivo de a família abrir o app:
-- a criança faz o kit em casa, a professora valida na sala. Sem esse gesto o
-- material da semana é mais um app que ninguém abre.
--
-- O PROGRESSO em si (quais paradas a criança fez) NÃO está aqui — fica no
-- aparelho. Guardar no servidor o que uma criança de 5 anos respondeu num
-- quiz é criar um perfil de menor sem nenhum ganho: ninguém precisa dessa
-- informação. O carimbo é dado da SALA, como a presença.

create table if not exists public.kids_carimbos (
  id           uuid primary key default gen_random_uuid(),
  crianca_id   uuid not null references public.members(id) on delete cascade,
  licao_id     uuid not null references public.kids_licoes(id) on delete cascade,
  carimbado_por uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (crianca_id, licao_id)
);

create index if not exists kids_carimbos_crianca_idx on public.kids_carimbos(crianca_id);


-- ─── 4. Quem lê e quem escreve ──────────────────────────────────────────────
-- O currículo é conteúdo da igreja: qualquer membro logado lê (o pai precisa,
-- e o professor também), e só admin ou quem lidera a sala escreve.
--
-- `roteiro_sala` é a exceção e por isso NÃO sai por select direto: a tela da
-- família lê por RPC, que devolve tudo menos ele.

alter table public.kids_trimestres enable row level security;
alter table public.kids_licoes     enable row level security;
alter table public.kids_conteudo   enable row level security;
alter table public.kids_jogos      enable row level security;
alter table public.kids_carimbos   enable row level security;

create or replace function public.pode_editar_kids()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin() or public.is_grupo_leader('infantil');
$$;

revoke all on function public.pode_editar_kids() from public, anon;
grant execute on function public.pode_editar_kids() to authenticated;

-- `to authenticated` em todas elas, e não só o `using`: sem isso o Postgres
-- avalia a policy de escrita também para o visitante deslogado, que não tem
-- permissão de executar `pode_editar_kids()` — e ele recebe um erro de
-- permissão em vez de uma lista vazia. Nenhum dado vaza dos dois jeitos; com
-- `to authenticated` o app deslogado simplesmente não vê nada.

do $$
declare t text;
begin
  foreach t in array array['kids_trimestres', 'kids_licoes', 'kids_conteudo', 'kids_jogos']
  loop
    execute format('drop policy if exists "Membro lê o currículo" on public.%I', t);
    execute format(
      'create policy "Membro lê o currículo" on public.%I for select '
      'to authenticated using (auth.uid() is not null)', t);

    execute format('drop policy if exists "Liderança do infantil edita" on public.%I', t);
    execute format(
      'create policy "Liderança do infantil edita" on public.%I for all '
      'to authenticated '
      'using (public.pode_editar_kids()) with check (public.pode_editar_kids())', t);
  end loop;
end $$;

-- Carimbo: o responsável vê o do próprio filho (é o que faz a árvore crescer
-- na tela dele), e quem lidera a sala carimba.
drop policy if exists "Vejo o carimbo do meu filho" on public.kids_carimbos;
create policy "Vejo o carimbo do meu filho"
  on public.kids_carimbos for select
  to authenticated
  using (
    public.pode_editar_kids()
    or exists (
      select 1 from public.members m
       where m.id = kids_carimbos.crianca_id
         and m.responsavel_id = public.meu_member_id()
    )
  );

drop policy if exists "Liderança do infantil carimba" on public.kids_carimbos;
create policy "Liderança do infantil carimba"
  on public.kids_carimbos for all
  to authenticated
  using (public.pode_editar_kids()) with check (public.pode_editar_kids());


-- ─── 5. O kit da semana ─────────────────────────────────────────────────────
-- O que a família abre. Uma função, e não um select, por três razões que só
-- aparecem juntas: a TRILHA sai da idade (ninguém escolhe faixa etária à
-- mão), a LIÇÃO sai da data (o domingo mais recente que já passou), e o
-- `roteiro_sala` NÃO PODE sair — é o material do professor.
--
-- `security definer` porque precisa ler `members` para descobrir a idade, e a
-- tabela é fechada. Devolve só o que a tela mostra.

create or replace function public.kit_da_semana(p_crianca_id uuid)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_crianca   record;
  v_trilha    text;
  v_licao     record;
  v_conteudo  record;
  v_jogo      record;
  v_carimbada boolean;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'erro', 'sem_sessao');
  end if;

  select m.id, m.nome, m.data_nascimento, m.responsavel_id
    into v_crianca
    from public.members m
   where m.id = p_crianca_id;

  if not found then
    return json_build_object('ok', false, 'erro', 'crianca_nao_encontrada');
  end if;

  -- Só o responsável e a liderança da sala. Sem esta guarda, a função viraria
  -- uma forma de ler o nome e a idade de qualquer criança da igreja passando
  -- ids ao acaso.
  if not (
    v_crianca.responsavel_id = public.meu_member_id()
    or public.pode_editar_kids()
  ) then
    return json_build_object('ok', false, 'erro', 'sem_acesso');
  end if;

  if v_crianca.data_nascimento is null then
    return json_build_object('ok', false, 'erro', 'sem_data_nascimento');
  end if;

  -- A trilha sai da idade, e muda sozinha no aniversário de 7 anos.
  v_trilha := case
    when extract(year from age(current_date, v_crianca.data_nascimento)) < 7
      then 'jardim' else 'exploradores' end;

  -- A lição da semana é o domingo mais recente que já passou. Numa quarta, a
  -- família ainda está trabalhando a aula do domingo anterior — é esse o
  -- ponto de o material da semana ser filho da aula.
  select l.* into v_licao
    from public.kids_licoes l
    join public.kids_trimestres t on t.id = l.trimestre_id
   where t.ativo and l.data <= current_date
   order by l.data desc
   limit 1;

  if not found then
    return json_build_object('ok', true, 'sem_licao', true,
      'crianca', json_build_object('id', v_crianca.id, 'nome', v_crianca.nome, 'trilha', v_trilha));
  end if;

  select * into v_conteudo
    from public.kids_conteudo
   where licao_id = v_licao.id and trilha = v_trilha;

  select * into v_jogo
    from public.kids_jogos
   where licao_id = v_licao.id and trilha = v_trilha;

  select exists (
    select 1 from public.kids_carimbos
     where crianca_id = v_crianca.id and licao_id = v_licao.id
  ) into v_carimbada;

  return json_build_object(
    'ok', true,
    'crianca', json_build_object(
      'id', v_crianca.id, 'nome', v_crianca.nome, 'trilha', v_trilha),
    'licao', json_build_object(
      'id', v_licao.id, 'numero', v_licao.numero, 'data', v_licao.data,
      'titulo', v_licao.titulo, 'base_biblica', v_licao.base_biblica,
      'verdade_central', v_licao.verdade_central),
    'carimbada', v_carimbada,
    -- `roteiro_sala` fica de fora, campo a campo. Um `select *` aqui o
    -- entregaria a todo pai da igreja no dia em que alguém acrescentasse uma
    -- coluna sem lembrar desta função.
    'conteudo', case when v_conteudo.id is null then null else json_build_object(
      'versiculo_texto', v_conteudo.versiculo_texto,
      'versiculo_ref', v_conteudo.versiculo_ref,
      'historia_titulo', v_conteudo.historia_titulo,
      'historia_texto', v_conteudo.historia_texto,
      'historia_audio_url', v_conteudo.historia_audio_url,
      'historia_duracao_s', v_conteudo.historia_duracao_s,
      'musica_titulo', v_conteudo.musica_titulo,
      'musica_audio_url', v_conteudo.musica_audio_url,
      'video_titulo', v_conteudo.video_titulo,
      'video_youtube_id', v_conteudo.video_youtube_id,
      'atividade_titulo', v_conteudo.atividade_titulo,
      'atividade_pdf_url', v_conteudo.atividade_pdf_url,
      'devocional_familia', v_conteudo.devocional_familia
    ) end,
    'jogo', case when v_jogo.id is null then null else json_build_object(
      'mecanica', v_jogo.mecanica, 'titulo', v_jogo.titulo,
      'instrucao', v_jogo.instrucao, 'dados', v_jogo.dados
    ) end
  );
end;
$$;

revoke all on function public.kit_da_semana(uuid) from public, anon;
grant execute on function public.kit_da_semana(uuid) to authenticated;


-- ─── 6. A ficha de segurança da sala — a lacuna que faltava ─────────────────
--
-- Guardar a alergia da criança não serve de nada se ela não chega em quem
-- está com a criança no domingo. `members` é fechada para admin desde
-- 20260908203000, e líder de grupo não lê o diretório — decisão certa, e que
-- deixou a professora sem ver exatamente o que mais importa.
--
-- Esta função é a ponte, no mesmo padrão de `participantes_do_grupo`: devolve
-- NOME, ALERGIA, NECESSIDADE ESPECIAL e o RECADO DO RESPONSÁVEL, de quem está
-- naquele grupo, para quem lidera aquele grupo. Nada de telefone, endereço,
-- e-mail ou as observações internas da liderança — a sala vê o que a sala
-- precisa, e a função é a permissão.

create or replace function public.ficha_seguranca_sala(p_grupo text)
returns table (
  id uuid,
  nome text,
  sobrenome text,
  data_nascimento date,
  alergias text,
  necessidades_especiais text,
  info_responsavel text,
  responsavel_nome text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.id,
    m.nome,
    coalesce(m.sobrenome, ''),
    m.data_nascimento,
    m.alergias,
    m.necessidades_especiais,
    m.info_responsavel,
    -- Só o nome de quem responde pela criança: é o que a professora precisa
    -- para saber a quem chamar no corredor.
    coalesce(r.nome || coalesce(' ' || r.sobrenome, ''), '')
  from public.grupo_membros gm
  join public.members m on m.id = gm.membro_id
  left join public.members r on r.id = m.responsavel_id
  where gm.grupo = p_grupo
    and (public.is_admin() or public.is_grupo_leader(p_grupo))
  order by m.nome;
$$;

revoke all on function public.ficha_seguranca_sala(text) from public, anon;
grant execute on function public.ficha_seguranca_sala(text) to authenticated;


-- ─── 7. Quem vê a entrada "Peniel Kids" ─────────────────────────────────────
-- Uma função e não duas consultas no cliente, pelo motivo de sempre: a tela
-- não guarda uma cópia da regra. Vê a área quem tem filho cadastrado, quem
-- lidera a sala e o admin.
--
-- Esconder a entrada NÃO é a proteção — `kit_da_semana` e
-- `ficha_seguranca_sala` já recusam quem não deveria estar lá. Isto só evita
-- oferecer um caminho que terminaria numa tela vazia sem explicação.

create or replace function public.tenho_acesso_kids()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.pode_editar_kids()
      or exists (
        select 1 from public.members
         where responsavel_id = public.meu_member_id()
      );
$$;

revoke all on function public.tenho_acesso_kids() from public, anon;
grant execute on function public.tenho_acesso_kids() to authenticated;
