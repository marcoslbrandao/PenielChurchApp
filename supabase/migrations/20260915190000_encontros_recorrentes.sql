-- ============================================================================
-- Encontros recorrentes — o Estudo Bíblico de toda sexta se cria sozinho
-- (15 Set 2026)
--
-- Pedido do Marcos: o Estudo Bíblico acontece toda sexta às 20h; os encontros
-- devem existir com ~2 meses de antecedência, renovando sozinhos, e o líder
-- continua podendo criar e editar encontros à mão.
--
-- QUATRO DECISÕES QUE ESTÃO GRAVADAS AQUI
--
-- 1. O GERADOR É IDEMPOTENTE E RODA SEMANALMENTE, não mensalmente. A regra é
--    "sempre existam as próximas N sextas"; cada passada cria só o que falta.
--    Com renovação mensal, uma execução que falha abre um buraco de um mês que
--    ninguém percebe até a sexta chegar sem encontro. Rodar de novo no mesmo
--    dia não duplica nada.
--
-- 2. ENCONTRO GERADO NASCE SILENCIOSO. Criar encontro dispara
--    `evento_grupo_no_mural`, que espelha em `avisos` e manda push. Gerar oito
--    sextas de uma vez mandaria oito "Novo encontro" para a turma. A igreja já
--    tem o aviso geral de sexta de manhã e o lembrete de 30 minutos antes —
--    um terceiro aviso por aula é spam. Por isso `notificar_grupo_no_mural()`
--    ganhou uma linha: evento com `gerado_automaticamente` não é espelhado.
--    Encontro criado à mão continua notificando, como sempre.
--
-- 3. APAGAR UMA SEXTA É DEFINITIVO. Sem isso, o líder apagaria o feriado e o
--    gerador o recriaria na passada seguinte — toda semana, até a data passar.
--    O gatilho de after-delete grava a data em `grupo_recorrencia_excecoes`, e
--    o gerador pula. Mover a data de um encontro gerado grava exceção na data
--    ANTIGA pelo mesmo motivo: senão a sexta original renasce ao lado da nova.
--
-- 4. O GERADOR NÃO ENCOSTA EM ENCONTRO QUE JÁ EXISTE. Se já houver qualquer
--    encontro naquele dia — gerado antes ou criado à mão — ele pula. Assim a
--    edição do líder nunca é sobrescrita: o gerador só faz INSERT, nunca UPDATE.
--
-- ESTA MIGRAÇÃO NÃO CRIA NENHUM ENCONTRO. Enquanto não existir uma linha em
-- `grupo_recorrencias`, o gerador roda e devolve zero. A recorrência do Estudo
-- Bíblico é cadastrada à parte (o INSERT está no documento do projeto), porque
-- depende de dados que só a igreja tem: link do Zoom, horário de término e o
-- título exato.
-- ============================================================================


-- ─── 1. Marca de origem no encontro ─────────────────────────────────────────
alter table public.grupo_eventos
  add column if not exists gerado_automaticamente boolean not null default false;

comment on column public.grupo_eventos.gerado_automaticamente is
  'true = criado por gerar_encontros_recorrentes(). Não espelha no mural, e apagá-lo grava exceção.';

create index if not exists grupo_eventos_gerado_idx
  on public.grupo_eventos (grupo, data)
  where gerado_automaticamente;


-- ─── 2. A regra da recorrência ──────────────────────────────────────────────
create table if not exists public.grupo_recorrencias (
  id uuid primary key default gen_random_uuid(),
  grupo text not null check (grupo in ('mulheres', 'homens', 'jovens', 'estudo_biblico')),
  ativo boolean not null default true,
  -- Convenção do Postgres (`extract(dow)`): 0 = domingo … 6 = sábado.
  -- Sexta-feira é 5.
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  horario text not null,               -- o texto do card: "20h às 21h30"
  titulo text not null,
  descricao text,
  local text not null,
  tipo text not null default 'online' check (tipo in ('presencial', 'online', 'casa')),
  link_online text,
  roteiro text,
  semanas_a_frente smallint not null default 9 check (semanas_a_frente between 1 and 26),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grupo_recorrencias_grupo_idx on public.grupo_recorrencias (grupo) where ativo;

alter table public.grupo_recorrencias enable row level security;

drop policy if exists "Recorrência é legível" on public.grupo_recorrencias;
create policy "Recorrência é legível"
  on public.grupo_recorrencias for select
  using (auth.role() = 'authenticated');

drop policy if exists "Líder do grupo define a recorrência" on public.grupo_recorrencias;
create policy "Líder do grupo define a recorrência"
  on public.grupo_recorrencias for all
  using (public.is_admin() or public.is_grupo_leader(grupo))
  with check (public.is_admin() or public.is_grupo_leader(grupo));

drop trigger if exists grupo_recorrencias_updated_at on public.grupo_recorrencias;
create trigger grupo_recorrencias_updated_at
  before update on public.grupo_recorrencias
  for each row execute function public.toca_updated_at();


-- ─── 3. As semanas que não têm estudo ───────────────────────────────────────
create table if not exists public.grupo_recorrencia_excecoes (
  grupo text not null check (grupo in ('mulheres', 'homens', 'jovens', 'estudo_biblico')),
  data date not null,
  motivo text,
  registrado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (grupo, data)
);

alter table public.grupo_recorrencia_excecoes enable row level security;

drop policy if exists "Exceções são legíveis" on public.grupo_recorrencia_excecoes;
create policy "Exceções são legíveis"
  on public.grupo_recorrencia_excecoes for select
  using (auth.role() = 'authenticated');

-- O líder pode DESFAZER uma exceção (apagar a linha) para a sexta voltar a ser
-- gerada — é o caminho de quem apagou por engano.
drop policy if exists "Líder do grupo gerencia as exceções" on public.grupo_recorrencia_excecoes;
create policy "Líder do grupo gerencia as exceções"
  on public.grupo_recorrencia_excecoes for all
  using (public.is_admin() or public.is_grupo_leader(grupo))
  with check (public.is_admin() or public.is_grupo_leader(grupo));


-- ─── 4. Apagar (ou mover) um encontro gerado vira exceção ───────────────────
-- `security definer` porque quem apaga é o líder, e a policy de INSERT em
-- `grupo_recorrencia_excecoes` não é o que decide aqui: o gatilho registra um
-- fato que acabou de acontecer, não um pedido do cliente.
create or replace function public.registra_excecao_recorrencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    if old.gerado_automaticamente then
      insert into public.grupo_recorrencia_excecoes (grupo, data, motivo, registrado_por)
      values (old.grupo, old.data, 'Encontro apagado', auth.uid())
      on conflict (grupo, data) do nothing;
    end if;
    return old;
  end if;

  -- UPDATE: só interessa quando a DATA muda. Mover a sexta de 26 para 27 sem
  -- registrar exceção no dia 26 faria a sexta original renascer ao lado da
  -- remarcada, e o líder veria duas.
  if old.gerado_automaticamente and new.data is distinct from old.data then
    insert into public.grupo_recorrencia_excecoes (grupo, data, motivo, registrado_por)
    values (old.grupo, old.data, 'Encontro remarcado', auth.uid())
    on conflict (grupo, data) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists grupo_eventos_excecao_ao_apagar on public.grupo_eventos;
create trigger grupo_eventos_excecao_ao_apagar
  after delete on public.grupo_eventos
  for each row execute function public.registra_excecao_recorrencia();

drop trigger if exists grupo_eventos_excecao_ao_remarcar on public.grupo_eventos;
create trigger grupo_eventos_excecao_ao_remarcar
  after update of data on public.grupo_eventos
  for each row execute function public.registra_excecao_recorrencia();


-- ─── 5. O mural ignora encontro gerado ──────────────────────────────────────
-- Corpo idêntico ao de 20260909010000, com UMA condição a mais no ramo de
-- `grupo_eventos`. Recriada por inteiro porque `create or replace` substitui a
-- função toda — não dá para acrescentar uma linha por fora.
create or replace function public.notificar_grupo_no_mural()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo       text := new.grupo;
  v_nome_grupo  text;
  v_titulo      text;
  v_texto       text;
  v_origem      text;
begin
  if v_grupo is null then return new; end if;

  v_nome_grupo := case v_grupo
    when 'mulheres'       then 'Grupo de Mulheres'
    when 'homens'         then 'Grupo de Homens'
    when 'jovens'         then 'Peniel Alive'
    when 'estudo_biblico' then 'Estudo Bíblico'
    else v_grupo
  end;

  if TG_TABLE_NAME = 'devocionais' then
    v_origem := 'devocional';
    v_titulo := 'Novo devocional · ' || v_nome_grupo;
    v_texto  := new.titulo;

  elsif TG_TABLE_NAME = 'shorts_videos' then
    v_origem := 'short';
    v_titulo := 'Novo vídeo · ' || v_nome_grupo;
    v_texto  := new.titulo;

  elsif TG_TABLE_NAME = 'grupo_arquivos' then
    v_origem := 'material';
    v_titulo := 'Novo material · ' || v_nome_grupo;
    v_texto  := new.titulo;

  elsif TG_TABLE_NAME = 'grupo_eventos' then
    -- A LINHA NOVA (15 Set 2026): a agenda que se cria sozinha não anuncia
    -- nada. O aviso geral de sexta de manhã e o lembrete de 30 minutos antes
    -- já cobrem a turma; oito "Novo encontro" de uma vez seria spam.
    if new.gerado_automaticamente then return new; end if;

    v_origem := 'evento';
    v_titulo := 'Novo encontro · ' || v_nome_grupo;
    v_texto  := new.titulo || coalesce(' — ' || to_char(new.data, 'DD/MM'), '')
                           || coalesce(' às ' || new.horario, '');

  elsif TG_TABLE_NAME = 'grupo_chat_mensagens' then
    v_origem := 'chat';
    if exists (
      select 1 from public.avisos a
      where a.grupo = v_grupo
        and a.origem = 'chat'
        and a.created_at > now() - interval '60 minutes'
    ) then
      return new;
    end if;
    v_titulo := 'Novas mensagens no chat · ' || v_nome_grupo;
    v_texto  := 'Há mensagens novas no chat do grupo.';

  else
    return new;
  end if;

  insert into public.avisos (titulo, texto, tipo, data, grupo, apenas_membros, origem)
  values (v_titulo, v_texto, 'geral', now(), v_grupo, false, v_origem);

  return new;
end;
$$;


-- ─── 6. O gerador ───────────────────────────────────────────────────────────
-- Roda pelo Cron do Supabase, como SQL: `select public.gerar_encontros_recorrentes();`
-- Semanalmente. Rodar mais vezes não faz mal nenhum — é idempotente.
--
-- Fuso: a data de corte é o HOJE DE LONDRES, não o do servidor (UTC). Entre
-- meia-noite e 1h do horário de verão britânico os dois discordam, e a
-- diferença decidiria se a sexta de hoje ainda entra na janela.
create or replace function public.gerar_encontros_recorrentes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  d        date;
  hoje     date := (now() at time zone 'Europe/London')::date;
  criados  integer := 0;
begin
  for r in select * from public.grupo_recorrencias where ativo loop
    for d in
      select gs::date
      from generate_series(hoje, hoje + (r.semanas_a_frente * 7), interval '1 day') gs
      where extract(dow from gs) = r.dia_semana
    loop
      -- Já existe encontro nesse dia (gerado antes OU criado à mão)? Pula.
      -- É esta linha que garante que o gerador nunca sobrescreve o líder.
      continue when exists (
        select 1 from public.grupo_eventos e where e.grupo = r.grupo and e.data = d
      );
      -- Semana cancelada de propósito? Pula para sempre.
      continue when exists (
        select 1 from public.grupo_recorrencia_excecoes x where x.grupo = r.grupo and x.data = d
      );

      insert into public.grupo_eventos (
        grupo, titulo, descricao, data, horario, hora_inicio,
        local, tipo, link_online, roteiro, gerado_automaticamente
      ) values (
        r.grupo, r.titulo, r.descricao, d, r.horario, r.hora_inicio,
        r.local, r.tipo, r.link_online, r.roteiro, true
      );
      criados := criados + 1;
    end loop;
  end loop;

  return criados;
end;
$$;

-- Ninguém do app chama isto: quem roda é o Cron, como `postgres`. Deixar
-- aberta para `authenticated` daria a qualquer conta o poder de encher a
-- agenda de todos os grupos.
revoke all on function public.gerar_encontros_recorrentes() from public;
revoke all on function public.gerar_encontros_recorrentes() from authenticated;
revoke all on function public.gerar_encontros_recorrentes() from anon;


-- ─── Conferência depois de aplicar ───────────────────────────────────────────
-- 1. `select public.gerar_encontros_recorrentes();` deve devolver 0 enquanto
--    não houver linha em `grupo_recorrencias`.
-- 2. Depois de cadastrar a recorrência, rodar de novo devolve o número de
--    sextas criadas; rodar uma TERCEIRA vez devolve 0.
-- 3. Apagar uma delas no app e rodar de novo: continua 0, e a data está em
--    `grupo_recorrencia_excecoes`.
-- 4. `select count(*) from avisos where origem = 'evento' and created_at > now() - interval '5 minutes';`
--    deve ser 0 — a geração é silenciosa.
