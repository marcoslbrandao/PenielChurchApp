-- ============================================================================
-- Eventos com inscrição e pagamento parcelado (pedido do Marcos, 09–11/11/2026)
--
-- Primeiro uso: Camping 2027 (retiro de agosto, inscrições a partir de janeiro).
-- Serve para qualquer evento: a inscrição é uma CONFIGURAÇÃO a mais de um
-- evento especial da Agenda (`agenda_eventos`), para não haver dois lugares
-- de eventos.
--
-- Decisões do Marcos (11/11/2026):
--   • Pagamento LIVRE: cada parcela é um pagamento do Stripe que a pessoa faz
--     quando quiser; o app sugere valor e data e manda lembretes.
--   • Preços de exemplo do Camping: até 5 anos grátis, 6 a 12 £150, acima de
--     12 (adulto) £180. 60 vagas. (Entrada £50 e quitar até 31/07 são
--     exemplos — ele ajusta no painel.)
--   • Membros E visitantes podem se inscrever (precisa ter conta no app).
--   • Tesouraria do evento: quantas pessoas o admin quiser.
--   • Cada evento tem líder e equipe (com função), numa aba "Equipe".
--
-- A FONTE DA VERDADE do dinheiro é `inscricao_pagamentos`, gravada pelo
-- webhook do Stripe (ou pela tesouraria, para dinheiro/transferência) —
-- nunca pelo app. Saldo = total − desconto − pagamentos.
--
-- Partes:
--   1. Papéis: tesouraria (global) e helpers de quem administra o evento
--   2. evento_inscricao_config · evento_precos · evento_perguntas
--   3. evento_equipe
--   4. inscricoes · inscricao_pessoas · inscricao_pagamentos
--   5. Cálculos: idade no evento, preço, saldo, vagas
--   6. RPCs do membro: evento_detalhes, evento_minha_familia, inscrever,
--      minha_inscricao, cancelar_minha_inscricao
--   7. RPCs da gestão: painel, pagamento manual, desconto, status, equipe,
--      configuração
--   8. Push (pagamento recebido) e lembretes diários (9h de Londres)
--
-- Pode rodar de novo sem estragar nada.
-- ============================================================================

begin;

-- ─── 1. Papéis ──────────────────────────────────────────────────────────────
create table if not exists public.tesouraria_eventos (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  por        uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.tesouraria_eventos enable row level security;

drop policy if exists "tesouraria: todos logados leem" on public.tesouraria_eventos;
create policy "tesouraria: todos logados leem"
  on public.tesouraria_eventos for select to authenticated using (true);
drop policy if exists "tesouraria: admin marca" on public.tesouraria_eventos;
create policy "tesouraria: admin marca"
  on public.tesouraria_eventos for insert to authenticated with check (public.is_admin());
drop policy if exists "tesouraria: admin tira" on public.tesouraria_eventos;
create policy "tesouraria: admin tira"
  on public.tesouraria_eventos for delete to authenticated using (public.is_admin());

create or replace function public.is_tesouraria()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (select 1 from public.tesouraria_eventos t where t.user_id = auth.uid());
$$;
revoke all on function public.is_tesouraria() from public, anon;
grant execute on function public.is_tesouraria() to authenticated;


-- ─── 2. Configuração da inscrição ───────────────────────────────────────────
create table if not exists public.evento_inscricao_config (
  evento_id       uuid primary key references public.agenda_eventos(id) on delete cascade,
  ativa           boolean not null default false,       -- inscrições ligadas
  inicio          timestamptz,                           -- começo do evento (idade é calculada aqui)
  fim             timestamptz,
  abre_em         date,                                  -- inscrições abrem (dia, Londres)
  fecha_em        date,                                  -- inscrições fecham (inclusive)
  vagas           integer check (vagas is null or vagas > 0),
  entrada_minima  numeric(10,2) not null default 0 check (entrada_minima >= 0),
  quitar_ate      date,
  publico         text not null default 'todos' check (publico in ('membros', 'todos')),
  regras          text,
  reembolso       text,
  programacao     text,
  o_que_levar     text,
  contato         text,
  updated_at      timestamptz not null default now()
);
alter table public.evento_inscricao_config enable row level security;
drop policy if exists "inscricao config: logados leem" on public.evento_inscricao_config;
create policy "inscricao config: logados leem"
  on public.evento_inscricao_config for select to authenticated using (true);
-- Escrita só pela RPC evento_salvar_config (admin/tesouraria).

create table if not exists public.evento_precos (
  id          uuid primary key default gen_random_uuid(),
  evento_id   uuid not null references public.agenda_eventos(id) on delete cascade,
  categoria   text not null,
  idade_min   integer not null default 0 check (idade_min >= 0),
  idade_max   integer check (idade_max is null or idade_max >= idade_min),
  valor       numeric(10,2) not null default 0 check (valor >= 0),
  ordem       integer not null default 0
);
create index if not exists evento_precos_evento_idx on public.evento_precos (evento_id, ordem);
alter table public.evento_precos enable row level security;
drop policy if exists "precos: logados leem" on public.evento_precos;
create policy "precos: logados leem" on public.evento_precos for select to authenticated using (true);

create table if not exists public.evento_perguntas (
  id          uuid primary key default gen_random_uuid(),
  evento_id   uuid not null references public.agenda_eventos(id) on delete cascade,
  texto       text not null,
  tipo        text not null default 'texto' check (tipo in ('texto', 'sim_nao', 'opcoes')),
  opcoes      text[],
  obrigatoria boolean not null default false,
  ordem       integer not null default 0
);
create index if not exists evento_perguntas_evento_idx on public.evento_perguntas (evento_id, ordem);
alter table public.evento_perguntas enable row level security;
drop policy if exists "perguntas: logados leem" on public.evento_perguntas;
create policy "perguntas: logados leem" on public.evento_perguntas for select to authenticated using (true);


-- ─── 3. Equipe do evento ────────────────────────────────────────────────────
create table if not exists public.evento_equipe (
  evento_id  uuid not null references public.agenda_eventos(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  funcao     text,
  eh_lider   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (evento_id, user_id)
);
alter table public.evento_equipe enable row level security;
drop policy if exists "equipe: logados leem" on public.evento_equipe;
create policy "equipe: logados leem" on public.evento_equipe for select to authenticated using (true);

-- Quem administra ESTE evento: admin, tesouraria ou líder do evento.
create or replace function public.gere_evento(p_evento uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_tesouraria()
      or exists (select 1 from public.evento_equipe e
                  where e.evento_id = p_evento and e.user_id = auth.uid() and e.eh_lider);
$$;
revoke all on function public.gere_evento(uuid) from public, anon;
grant execute on function public.gere_evento(uuid) to authenticated;


-- ─── 4. Inscrições, pessoas e pagamentos ────────────────────────────────────
create table if not exists public.inscricoes (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.agenda_eventos(id) on delete cascade,
  responsavel_id  uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'confirmada' check (status in ('confirmada', 'espera', 'cancelada')),
  total           numeric(10,2) not null default 0,
  desconto        numeric(10,2) not null default 0 check (desconto >= 0),
  desconto_motivo text,
  aceitou_regras_em timestamptz,
  observacao      text,
  cancelada_em    timestamptz,
  created_at      timestamptz not null default now(),
  constraint inscricoes_uma_por_pessoa unique (evento_id, responsavel_id)
);
create index if not exists inscricoes_evento_idx on public.inscricoes (evento_id, status);
alter table public.inscricoes enable row level security;
drop policy if exists "inscricoes: o proprio e a gestao leem" on public.inscricoes;
create policy "inscricoes: o proprio e a gestao leem"
  on public.inscricoes for select to authenticated
  using (responsavel_id = auth.uid() or public.gere_evento(evento_id));

create table if not exists public.inscricao_pessoas (
  id              uuid primary key default gen_random_uuid(),
  inscricao_id    uuid not null references public.inscricoes(id) on delete cascade,
  nome            text not null check (char_length(btrim(nome)) between 1 and 120),
  data_nascimento date,
  idade_no_evento integer,
  categoria       text,
  valor           numeric(10,2) not null default 0,
  member_id       uuid references public.members(id) on delete set null,
  respostas       jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists inscricao_pessoas_insc_idx on public.inscricao_pessoas (inscricao_id);
alter table public.inscricao_pessoas enable row level security;
drop policy if exists "inscricao pessoas: o proprio e a gestao leem" on public.inscricao_pessoas;
create policy "inscricao pessoas: o proprio e a gestao leem"
  on public.inscricao_pessoas for select to authenticated
  using (exists (select 1 from public.inscricoes i where i.id = inscricao_id
                  and (i.responsavel_id = auth.uid() or public.gere_evento(i.evento_id))));

create table if not exists public.inscricao_pagamentos (
  id             uuid primary key default gen_random_uuid(),
  inscricao_id   uuid not null references public.inscricoes(id) on delete cascade,
  valor          numeric(10,2) not null check (valor <> 0),   -- negativo = reembolso
  forma          text not null check (forma in ('stripe', 'dinheiro', 'transferencia', 'reembolso', 'outro')),
  stripe_pi      text unique,
  registrado_por uuid references auth.users(id) on delete set null,
  observacao     text,
  pago_em        timestamptz not null default now()
);
create index if not exists inscricao_pagamentos_insc_idx on public.inscricao_pagamentos (inscricao_id, pago_em);
alter table public.inscricao_pagamentos enable row level security;
drop policy if exists "inscricao pagamentos: o proprio e a gestao leem" on public.inscricao_pagamentos;
create policy "inscricao pagamentos: o proprio e a gestao leem"
  on public.inscricao_pagamentos for select to authenticated
  using (exists (select 1 from public.inscricoes i where i.id = inscricao_id
                  and (i.responsavel_id = auth.uid() or public.gere_evento(i.evento_id))));
-- Gravação só pelo webhook (service role) e pelas RPCs da tesouraria.


-- ─── 5. Cálculos ────────────────────────────────────────────────────────────
create or replace function public.evento_idade_em(p_nasc date, p_evento uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when p_nasc is null then null else
    extract(year from age(coalesce((select (c.inicio at time zone 'Europe/London')::date
                                      from public.evento_inscricao_config c where c.evento_id = p_evento),
                                   (select a.data from public.agenda_eventos a where a.id = p_evento),
                                   (now() at time zone 'Europe/London')::date),
                          p_nasc))::int end;
$$;

-- Faixa de preço pela idade (sem data = adulto, a faixa mais cara).
create or replace function public.evento_preco_para(p_evento uuid, p_idade integer)
returns table (categoria text, valor numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.categoria, p.valor
    from public.evento_precos p
   where p.evento_id = p_evento
     and (p_idade is null
          or (p_idade >= p.idade_min and (p.idade_max is null or p_idade <= p.idade_max)))
   order by case when p_idade is null then -p.valor else p.ordem end
   limit 1;
$$;

create or replace function public.inscricao_pago(p_inscricao uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(valor), 0) from public.inscricao_pagamentos where inscricao_id = p_inscricao;
$$;

create or replace function public.inscricao_saldo(p_inscricao uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, i.total - i.desconto - public.inscricao_pago(i.id))
    from public.inscricoes i where i.id = p_inscricao;
$$;

-- Lugares ocupados (pessoas em inscrições confirmadas).
create or replace function public.evento_ocupadas(p_evento uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.inscricao_pessoas ip
    join public.inscricoes i on i.id = ip.inscricao_id
   where i.evento_id = p_evento and i.status = 'confirmada';
$$;

-- Sugestão de quanto pagar agora: a entrada, se ainda não foi paga; depois o
-- saldo dividido pelos meses até a data de quitar.
create or replace function public.inscricao_sugestao(p_inscricao uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_saldo numeric := public.inscricao_saldo(p_inscricao);
  v_pago  numeric := public.inscricao_pago(p_inscricao);
  v_cfg   public.evento_inscricao_config;
  v_meses int;
begin
  if v_saldo <= 0 then return 0; end if;
  select c.* into v_cfg from public.evento_inscricao_config c
    join public.inscricoes i on i.evento_id = c.evento_id where i.id = p_inscricao;
  if v_pago < coalesce(v_cfg.entrada_minima, 0) then
    return least(v_saldo, v_cfg.entrada_minima - v_pago);
  end if;
  if v_cfg.quitar_ate is null then return v_saldo; end if;
  v_meses := greatest(1,
    (extract(year from age(v_cfg.quitar_ate, (now() at time zone 'Europe/London')::date)) * 12
     + extract(month from age(v_cfg.quitar_ate, (now() at time zone 'Europe/London')::date)))::int + 1);
  return ceil(v_saldo / v_meses);
end;
$$;


-- ─── 6. RPCs do membro ──────────────────────────────────────────────────────

-- Tudo o que a página do evento precisa (menos a minha inscrição).
create or replace function public.evento_detalhes(p_evento uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg public.evento_inscricao_config;
  v_hoje date := (now() at time zone 'Europe/London')::date;
  v_estado text;
begin
  if auth.uid() is null then return null; end if;
  select * into v_cfg from public.evento_inscricao_config where evento_id = p_evento;
  if not found then return jsonb_build_object('tem_inscricao', false, 'gere', public.gere_evento(p_evento)); end if;

  v_estado := case
    when not v_cfg.ativa then 'fechada'
    when v_cfg.abre_em is not null and v_hoje < v_cfg.abre_em then 'em_breve'
    when v_cfg.fecha_em is not null and v_hoje > v_cfg.fecha_em then 'encerrada'
    when v_cfg.vagas is not null and public.evento_ocupadas(p_evento) >= v_cfg.vagas then 'lotada'
    else 'aberta' end;

  return jsonb_build_object(
    'tem_inscricao', true,
    'estado', v_estado,
    'gere', public.gere_evento(p_evento),
    'pode_publico', v_cfg.publico = 'todos' or public.is_membro(),
    'config', to_jsonb(v_cfg),
    'ocupadas', public.evento_ocupadas(p_evento),
    'precos', coalesce((select jsonb_agg(to_jsonb(p) order by p.ordem) from public.evento_precos p where p.evento_id = p_evento), '[]'::jsonb),
    'perguntas', coalesce((select jsonb_agg(to_jsonb(q) order by q.ordem) from public.evento_perguntas q where q.evento_id = p_evento), '[]'::jsonb),
    'equipe', coalesce((select jsonb_agg(jsonb_build_object(
                 'user_id', e.user_id, 'nome', coalesce(nullif(btrim(pr.full_name), ''), 'Membro'),
                 'foto', pr.avatar_url, 'funcao', e.funcao, 'eh_lider', e.eh_lider)
                 order by e.eh_lider desc, pr.full_name)
               from public.evento_equipe e left join public.profiles pr on pr.id = e.user_id
              where e.evento_id = p_evento), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.evento_detalhes(uuid) from public, anon;
grant execute on function public.evento_detalhes(uuid) to authenticated;

-- Eu e minha família (da ficha), com idade e preço já calculados.
create or replace function public.evento_minha_familia(p_evento uuid)
returns table (member_id uuid, nome text, data_nascimento date, idade integer, categoria text, valor numeric, sou_eu boolean)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select m.id from public.members m where m.profile_id = auth.uid() limit 1)
  select m.id,
         btrim(coalesce(m.nome, '') || ' ' || coalesce(m.sobrenome, '')),
         m.data_nascimento,
         public.evento_idade_em(m.data_nascimento, p_evento),
         pr.categoria, pr.valor,
         m.profile_id = auth.uid()
    from public.members m
    left join lateral public.evento_preco_para(p_evento, public.evento_idade_em(m.data_nascimento, p_evento)) pr on true
   where auth.uid() is not null
     and (m.profile_id = auth.uid() or m.responsavel_id = (select id from eu))
   order by (m.profile_id = auth.uid()) desc, m.data_nascimento nulls last;
$$;
revoke all on function public.evento_minha_familia(uuid) from public, anon;
grant execute on function public.evento_minha_familia(uuid) to authenticated;

-- Inscrever (ou refazer a lista de pessoas de uma inscrição ainda sem
-- pagamento). p_pessoas: [{member_id?, nome, data_nascimento?, respostas?}]
-- Preço e categoria são calculados AQUI, nunca vêm do app.
-- Devolve { status, inscricao_id, estado } — status: ok | erro_*
create or replace function public.inscrever_evento(p_evento uuid, p_pessoas jsonb, p_aceite boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cfg public.evento_inscricao_config;
  v_hoje date := (now() at time zone 'Europe/London')::date;
  v_id uuid; v_status text; v_total numeric := 0; v_n int; v_p jsonb;
  v_nasc date; v_idade int; v_cat text; v_valor numeric; v_mem uuid; v_nome text;
  v_testando boolean := public.gere_evento(p_evento);
begin
  if auth.uid() is null then return jsonb_build_object('status', 'erro_login'); end if;
  select * into v_cfg from public.evento_inscricao_config where evento_id = p_evento for update;
  if not found or not v_cfg.ativa then return jsonb_build_object('status', 'erro_fechada'); end if;
  -- A gestão pode testar antes de abrir.
  if not v_testando then
    if v_cfg.abre_em is not null and v_hoje < v_cfg.abre_em then return jsonb_build_object('status', 'erro_em_breve'); end if;
    if v_cfg.fecha_em is not null and v_hoje > v_cfg.fecha_em then return jsonb_build_object('status', 'erro_encerrada'); end if;
  end if;
  if v_cfg.publico = 'membros' and not public.is_membro() then return jsonb_build_object('status', 'erro_so_membros'); end if;
  if not coalesce(p_aceite, false) then return jsonb_build_object('status', 'erro_regras'); end if;
  if jsonb_typeof(p_pessoas) <> 'array' or jsonb_array_length(p_pessoas) = 0 then
    return jsonb_build_object('status', 'erro_pessoas');
  end if;
  if jsonb_array_length(p_pessoas) > 15 then return jsonb_build_object('status', 'erro_pessoas'); end if;

  select id into v_id from public.inscricoes where evento_id = p_evento and responsavel_id = auth.uid();
  if v_id is not null then
    if public.inscricao_pago(v_id) > 0 then return jsonb_build_object('status', 'erro_ja_paga'); end if;
    delete from public.inscricao_pessoas where inscricao_id = v_id;
  else
    insert into public.inscricoes (evento_id, responsavel_id) values (p_evento, auth.uid()) returning id into v_id;
  end if;

  for v_p in select * from jsonb_array_elements(p_pessoas) loop
    v_mem := null; v_nome := btrim(coalesce(v_p->>'nome', '')); v_nasc := null;
    -- Pessoa da minha ficha: nome e nascimento vêm do cadastro.
    if nullif(v_p->>'member_id', '') is not null then
      select m.id, btrim(coalesce(m.nome, '') || ' ' || coalesce(m.sobrenome, '')), m.data_nascimento
        into v_mem, v_nome, v_nasc
        from public.members m
       where m.id = (v_p->>'member_id')::uuid
         and (m.profile_id = auth.uid()
              or m.responsavel_id = (select id from public.members where profile_id = auth.uid() limit 1));
      if v_mem is null then return jsonb_build_object('status', 'erro_pessoas'); end if;
    else
      begin v_nasc := nullif(v_p->>'data_nascimento', '')::date; exception when others then v_nasc := null; end;
    end if;
    if v_nome = '' then return jsonb_build_object('status', 'erro_pessoas'); end if;
    v_idade := public.evento_idade_em(v_nasc, p_evento);
    select pr.categoria, pr.valor into v_cat, v_valor from public.evento_preco_para(p_evento, v_idade) pr;
    insert into public.inscricao_pessoas (inscricao_id, nome, data_nascimento, idade_no_evento, categoria, valor, member_id, respostas)
    values (v_id, left(v_nome, 120), v_nasc, v_idade, v_cat, coalesce(v_valor, 0), v_mem,
            coalesce(v_p->'respostas', '{}'::jsonb));
    v_total := v_total + coalesce(v_valor, 0);
  end loop;

  -- Vagas: conta quem já está confirmado (fora esta inscrição).
  select count(*)::int into v_n
    from public.inscricao_pessoas ip join public.inscricoes i on i.id = ip.inscricao_id
   where i.evento_id = p_evento and i.status = 'confirmada' and i.id <> v_id;
  v_status := case when v_cfg.vagas is not null and v_n + jsonb_array_length(p_pessoas) > v_cfg.vagas
                   then 'espera' else 'confirmada' end;

  update public.inscricoes
     set total = v_total, status = v_status, aceitou_regras_em = now(), cancelada_em = null
   where id = v_id;

  return jsonb_build_object('status', 'ok', 'inscricao_id', v_id, 'estado', v_status, 'total', v_total);
end;
$$;
revoke all on function public.inscrever_evento(uuid, jsonb, boolean) from public, anon;
grant execute on function public.inscrever_evento(uuid, jsonb, boolean) to authenticated;

-- Minha inscrição: o extrato.
create or replace function public.minha_inscricao(p_evento uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', i.id, 'status', i.status, 'total', i.total, 'desconto', i.desconto,
    'pago', public.inscricao_pago(i.id), 'saldo', public.inscricao_saldo(i.id),
    'sugestao', public.inscricao_sugestao(i.id), 'created_at', i.created_at,
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object('nome', p.nome, 'idade', p.idade_no_evento,
                  'categoria', p.categoria, 'valor', p.valor, 'member_id', p.member_id,
                  'data_nascimento', p.data_nascimento, 'respostas', p.respostas) order by p.created_at)
                from public.inscricao_pessoas p where p.inscricao_id = i.id), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('valor', g.valor, 'forma', g.forma, 'pago_em', g.pago_em)
                  order by g.pago_em) from public.inscricao_pagamentos g where g.inscricao_id = i.id), '[]'::jsonb))
    from public.inscricoes i
   where i.evento_id = p_evento and i.responsavel_id = auth.uid();
$$;
revoke all on function public.minha_inscricao(uuid) from public, anon;
grant execute on function public.minha_inscricao(uuid) to authenticated;

-- Cancelar a própria inscrição. Reembolso (se houver) é com a tesouraria,
-- conforme a regra do evento — a gestão é avisada.
create or replace function public.cancelar_minha_inscricao(p_evento uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_id uuid; v_nome text; v_ev text; v_pago numeric;
begin
  select id into v_id from public.inscricoes
   where evento_id = p_evento and responsavel_id = auth.uid() and status <> 'cancelada';
  if v_id is null then return 'nada'; end if;
  update public.inscricoes set status = 'cancelada', cancelada_em = now() where id = v_id;
  v_pago := public.inscricao_pago(v_id);
  select coalesce(nullif(btrim(full_name), ''), 'Alguém') into v_nome from public.profiles where id = auth.uid();
  select nome into v_ev from public.agenda_eventos where id = p_evento;
  perform public.notificar_admins('❌ Inscrição cancelada',
    coalesce(v_nome, 'Alguém') || ' cancelou a inscrição em ' || coalesce(v_ev, 'um evento')
      || case when v_pago > 0 then ' (já tinha pago £' || to_char(v_pago, 'FM999990.00') || ').' else '.' end,
    jsonb_build_object('type', 'evento_painel', 'id', p_evento));
  return 'ok';
end;
$$;
revoke all on function public.cancelar_minha_inscricao(uuid) from public, anon;
grant execute on function public.cancelar_minha_inscricao(uuid) to authenticated;


-- ─── 7. Gestão (admin, tesouraria, líder do evento) ─────────────────────────

-- Painel: todas as inscrições com totais.
create or replace function public.evento_painel(p_evento uuid)
returns table (inscricao_id uuid, responsavel_id uuid, responsavel_nome text, status text, pessoas integer,
               nomes text, total numeric, desconto numeric, pago numeric, saldo numeric,
               ultimo_pagamento timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.responsavel_id, coalesce(nullif(btrim(pr.full_name), ''), 'Membro'), i.status,
         (select count(*)::int from public.inscricao_pessoas p where p.inscricao_id = i.id),
         (select string_agg(p.nome || coalesce(' (' || p.idade_no_evento || ')', ''), ', ' order by p.created_at)
            from public.inscricao_pessoas p where p.inscricao_id = i.id),
         i.total, i.desconto, public.inscricao_pago(i.id), public.inscricao_saldo(i.id),
         (select max(g.pago_em) from public.inscricao_pagamentos g where g.inscricao_id = i.id),
         i.created_at
    from public.inscricoes i
    left join public.profiles pr on pr.id = i.responsavel_id
   where i.evento_id = p_evento and public.gere_evento(p_evento)
   order by i.status, pr.full_name;
$$;
revoke all on function public.evento_painel(uuid) from public, anon;
grant execute on function public.evento_painel(uuid) to authenticated;

-- Pagamento manual (dinheiro / transferência / reembolso). Reembolso entra
-- negativo. Só a tesouraria (e o admin) — líder do evento não mexe em dinheiro.
create or replace function public.evento_registrar_pagamento(p_inscricao uuid, p_valor numeric, p_forma text, p_obs text default null)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_valor numeric;
begin
  if not public.is_tesouraria() then return 'sem_acesso'; end if;
  if p_forma not in ('dinheiro', 'transferencia', 'reembolso', 'outro') then return 'forma_invalida'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 10000 then return 'valor_invalido'; end if;
  v_valor := case when p_forma = 'reembolso' then -p_valor else p_valor end;
  insert into public.inscricao_pagamentos (inscricao_id, valor, forma, registrado_por, observacao)
  values (p_inscricao, round(v_valor, 2), p_forma, auth.uid(), nullif(btrim(p_obs), ''));
  perform public.evento_avisar_pagamento(p_inscricao, v_valor);
  return 'ok';
end;
$$;
revoke all on function public.evento_registrar_pagamento(uuid, numeric, text, text) from public, anon;
grant execute on function public.evento_registrar_pagamento(uuid, numeric, text, text) to authenticated;

create or replace function public.evento_definir_desconto(p_inscricao uuid, p_desconto numeric, p_motivo text default null)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_tesouraria() then return 'sem_acesso'; end if;
  if p_desconto is null or p_desconto < 0 then return 'valor_invalido'; end if;
  update public.inscricoes set desconto = round(p_desconto, 2), desconto_motivo = nullif(btrim(p_motivo), '')
   where id = p_inscricao;
  return 'ok';
end;
$$;
revoke all on function public.evento_definir_desconto(uuid, numeric, text) from public, anon;
grant execute on function public.evento_definir_desconto(uuid, numeric, text) to authenticated;

-- Mudar status (confirmar quem está na lista de espera, cancelar).
create or replace function public.evento_definir_status(p_inscricao uuid, p_status text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_ev uuid;
begin
  select evento_id into v_ev from public.inscricoes where id = p_inscricao;
  if v_ev is null or not public.gere_evento(v_ev) then return 'sem_acesso'; end if;
  if p_status not in ('confirmada', 'espera', 'cancelada') then return 'status_invalido'; end if;
  update public.inscricoes
     set status = p_status, cancelada_em = case when p_status = 'cancelada' then now() else null end
   where id = p_inscricao;
  return 'ok';
end;
$$;
revoke all on function public.evento_definir_status(uuid, text) from public, anon;
grant execute on function public.evento_definir_status(uuid, text) to authenticated;

-- Detalhe de uma inscrição para a gestão.
create or replace function public.evento_inscricao_detalhe(p_inscricao uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', i.id, 'status', i.status, 'total', i.total, 'desconto', i.desconto, 'desconto_motivo', i.desconto_motivo,
    'pago', public.inscricao_pago(i.id), 'saldo', public.inscricao_saldo(i.id),
    'responsavel', coalesce(nullif(btrim(pr.full_name), ''), 'Membro'), 'created_at', i.created_at,
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object('nome', p.nome, 'idade', p.idade_no_evento,
                  'categoria', p.categoria, 'valor', p.valor, 'respostas', p.respostas) order by p.created_at)
                from public.inscricao_pessoas p where p.inscricao_id = i.id), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('valor', g.valor, 'forma', g.forma,
                  'pago_em', g.pago_em, 'observacao', g.observacao,
                  'por', (select full_name from public.profiles where id = g.registrado_por)) order by g.pago_em)
                from public.inscricao_pagamentos g where g.inscricao_id = i.id), '[]'::jsonb))
    from public.inscricoes i
    left join public.profiles pr on pr.id = i.responsavel_id
   where i.id = p_inscricao and public.gere_evento(i.evento_id);
$$;
revoke all on function public.evento_inscricao_detalhe(uuid) from public, anon;
grant execute on function public.evento_inscricao_detalhe(uuid) to authenticated;

-- Salvar configuração + preços + perguntas de uma vez (admin/tesouraria).
-- p: { ativa, inicio, fim, abre_em, fecha_em, vagas, entrada_minima, quitar_ate,
--      publico, regras, reembolso, programacao, o_que_levar, contato,
--      precos: [{categoria, idade_min, idade_max, valor}],
--      perguntas: [{texto, tipo, opcoes, obrigatoria}] }
create or replace function public.evento_salvar_config(p_evento uuid, p jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_item jsonb; v_ordem int := 0;
begin
  if not public.is_tesouraria() then return 'sem_acesso'; end if;
  if not exists (select 1 from public.agenda_eventos where id = p_evento) then return 'sem_evento'; end if;

  insert into public.evento_inscricao_config as c (
    evento_id, ativa, inicio, fim, abre_em, fecha_em, vagas, entrada_minima, quitar_ate, publico,
    regras, reembolso, programacao, o_que_levar, contato, updated_at)
  values (
    p_evento,
    coalesce((p->>'ativa')::boolean, false),
    nullif(p->>'inicio', '')::timestamptz, nullif(p->>'fim', '')::timestamptz,
    nullif(p->>'abre_em', '')::date, nullif(p->>'fecha_em', '')::date,
    nullif(p->>'vagas', '')::int,
    coalesce(nullif(p->>'entrada_minima', '')::numeric, 0),
    nullif(p->>'quitar_ate', '')::date,
    case when p->>'publico' = 'membros' then 'membros' else 'todos' end,
    nullif(p->>'regras', ''), nullif(p->>'reembolso', ''), nullif(p->>'programacao', ''),
    nullif(p->>'o_que_levar', ''), nullif(p->>'contato', ''), now())
  on conflict (evento_id) do update set
    ativa = excluded.ativa, inicio = excluded.inicio, fim = excluded.fim, abre_em = excluded.abre_em,
    fecha_em = excluded.fecha_em, vagas = excluded.vagas, entrada_minima = excluded.entrada_minima,
    quitar_ate = excluded.quitar_ate, publico = excluded.publico, regras = excluded.regras,
    reembolso = excluded.reembolso, programacao = excluded.programacao, o_que_levar = excluded.o_que_levar,
    contato = excluded.contato, updated_at = now();

  if p ? 'precos' then
    delete from public.evento_precos where evento_id = p_evento;
    for v_item in select * from jsonb_array_elements(p->'precos') loop
      v_ordem := v_ordem + 1;
      insert into public.evento_precos (evento_id, categoria, idade_min, idade_max, valor, ordem)
      values (p_evento, coalesce(nullif(btrim(v_item->>'categoria'), ''), 'Categoria'),
              coalesce(nullif(v_item->>'idade_min', '')::int, 0), nullif(v_item->>'idade_max', '')::int,
              coalesce(nullif(v_item->>'valor', '')::numeric, 0), v_ordem);
    end loop;
  end if;

  if p ? 'perguntas' then
    v_ordem := 0;
    delete from public.evento_perguntas where evento_id = p_evento;
    for v_item in select * from jsonb_array_elements(p->'perguntas') loop
      v_ordem := v_ordem + 1;
      if nullif(btrim(v_item->>'texto'), '') is null then continue; end if;
      insert into public.evento_perguntas (evento_id, texto, tipo, opcoes, obrigatoria, ordem)
      values (p_evento, btrim(v_item->>'texto'),
              case when v_item->>'tipo' in ('sim_nao', 'opcoes') then v_item->>'tipo' else 'texto' end,
              case when jsonb_typeof(v_item->'opcoes') = 'array'
                   then array(select jsonb_array_elements_text(v_item->'opcoes')) else null end,
              coalesce((v_item->>'obrigatoria')::boolean, false), v_ordem);
    end loop;
  end if;

  -- Total das inscrições sem pagamento acompanha a tabela nova de preços.
  update public.inscricao_pessoas ip
     set categoria = (select pr.categoria from public.evento_preco_para(p_evento, ip.idade_no_evento) pr),
         valor = coalesce((select pr.valor from public.evento_preco_para(p_evento, ip.idade_no_evento) pr), 0)
    from public.inscricoes i
   where ip.inscricao_id = i.id and i.evento_id = p_evento and public.inscricao_pago(i.id) = 0;
  update public.inscricoes i
     set total = coalesce((select sum(valor) from public.inscricao_pessoas where inscricao_id = i.id), 0)
   where i.evento_id = p_evento and public.inscricao_pago(i.id) = 0;
  return 'ok';
end;
$$;
revoke all on function public.evento_salvar_config(uuid, jsonb) from public, anon;
grant execute on function public.evento_salvar_config(uuid, jsonb) to authenticated;

-- Equipe: admin/tesouraria escolhem o líder; o líder (e a gestão) montam a equipe.
create or replace function public.evento_equipe_definir(p_evento uuid, p_user uuid, p_funcao text, p_lider boolean)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.gere_evento(p_evento) then return 'sem_acesso'; end if;
  if coalesce(p_lider, false) and not public.is_tesouraria() then return 'sem_acesso'; end if;
  insert into public.evento_equipe (evento_id, user_id, funcao, eh_lider)
  values (p_evento, p_user, nullif(btrim(p_funcao), ''), coalesce(p_lider, false))
  on conflict (evento_id, user_id) do update
    set funcao = excluded.funcao,
        eh_lider = case when public.is_tesouraria() then excluded.eh_lider else public.evento_equipe.eh_lider end;
  return 'ok';
end;
$$;
revoke all on function public.evento_equipe_definir(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.evento_equipe_definir(uuid, uuid, text, boolean) to authenticated;

create or replace function public.evento_equipe_remover(p_evento uuid, p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.gere_evento(p_evento) then return 'sem_acesso'; end if;
  if exists (select 1 from public.evento_equipe where evento_id = p_evento and user_id = p_user and eh_lider)
     and not public.is_tesouraria() then return 'sem_acesso'; end if;
  delete from public.evento_equipe where evento_id = p_evento and user_id = p_user;
  return 'ok';
end;
$$;
revoke all on function public.evento_equipe_remover(uuid, uuid) from public, anon;
grant execute on function public.evento_equipe_remover(uuid, uuid) to authenticated;

-- Lista para o painel Admin (marcar / tirar tesouraria).
create or replace function public.tesouraria_lista()
returns table (user_id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select t.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Membro')
    from public.tesouraria_eventos t left join public.profiles p on p.id = t.user_id
   where public.is_admin()
   order by p.full_name;
$$;
revoke all on function public.tesouraria_lista() from public, anon;
grant execute on function public.tesouraria_lista() to authenticated;


-- ─── 8. Push e lembretes ────────────────────────────────────────────────────
create or replace function public.push_para(p_user uuid, p_titulo text, p_corpo text, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare v_msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object('to', t.token, 'title', p_titulo, 'body', left(coalesce(p_corpo, ''), 170),
                                      'sound', 'default', 'data', p_dados))
    into v_msgs
    from (select distinct token from public.push_tokens where user_id = p_user) t;
  if v_msgs is null then return; end if;
  perform net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := v_msgs,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 15000);
exception when others then
  null;  -- push nunca derruba o que veio antes
end;
$$;
revoke all on function public.push_para(uuid, text, text, jsonb) from public, anon, authenticated;

-- "Recebemos £X. Pago £Y · Falta £Z." (Stripe e tesouraria.)
create or replace function public.evento_avisar_pagamento(p_inscricao uuid, p_valor numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_ev uuid; v_nome text; v_pago numeric; v_saldo numeric;
begin
  select i.responsavel_id, i.evento_id, a.nome into v_user, v_ev, v_nome
    from public.inscricoes i join public.agenda_eventos a on a.id = i.evento_id where i.id = p_inscricao;
  if v_user is null then return; end if;
  v_pago := public.inscricao_pago(p_inscricao);
  v_saldo := public.inscricao_saldo(p_inscricao);
  perform public.push_para(v_user,
    case when p_valor < 0 then '↩️ Reembolso — ' else '✅ Pagamento recebido — ' end || coalesce(v_nome, 'Evento'),
    case when p_valor < 0 then 'Reembolsamos £' || to_char(-p_valor, 'FM999990.00') || '.'
         else 'Recebemos £' || to_char(p_valor, 'FM999990.00') || '.' end
      || ' Pago £' || to_char(v_pago, 'FM999990.00')
      || case when v_saldo > 0 then ' · Falta £' || to_char(v_saldo, 'FM999990.00') else ' · Tudo pago 🎉' end,
    jsonb_build_object('type', 'evento', 'id', v_ev));
end;
$$;
revoke all on function public.evento_avisar_pagamento(uuid, numeric) from public, anon, authenticated;

-- Gravado pelo webhook do Stripe (service role). Idempotente pelo pi.
create or replace function public.evento_pagamento_stripe(p_inscricao uuid, p_valor numeric, p_pi text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.inscricao_pagamentos (inscricao_id, valor, forma, stripe_pi)
  values (p_inscricao, round(p_valor, 2), 'stripe', p_pi)
  on conflict (stripe_pi) do nothing
  returning id into v_id;
  if v_id is null then return 'duplicado'; end if;
  perform public.evento_avisar_pagamento(p_inscricao, p_valor);
  return 'ok';
end;
$$;
revoke all on function public.evento_pagamento_stripe(uuid, numeric, text) from public, anon, authenticated;

-- Lembretes do dia (roda às 9h de Londres; o cron chama às 8h e 9h UTC e a
-- função só age quando em Londres são 9h, como os outros lembretes).
--   • entrada pendente 3 dias depois de se inscrever;
--   • dia 1 de cada mês: quem tem saldo recebe a sugestão do mês;
--   • 30 e 7 dias antes da data de quitar.
create or replace function public.eventos_lembretes(p_forcar boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r record; v_n int := 0;
  v_hoje date := (now() at time zone 'Europe/London')::date;
  v_texto text;
begin
  if not p_forcar and extract(hour from (now() at time zone 'Europe/London'))::int <> 9 then return 0; end if;
  for r in
    select i.id, i.responsavel_id, i.evento_id, i.created_at, a.nome, c.quitar_ate, c.entrada_minima,
           public.inscricao_saldo(i.id) as saldo, public.inscricao_pago(i.id) as pago,
           public.inscricao_sugestao(i.id) as sugestao
      from public.inscricoes i
      join public.evento_inscricao_config c on c.evento_id = i.evento_id
      join public.agenda_eventos a on a.id = i.evento_id
     where i.status = 'confirmada' and c.ativa
  loop
    if r.saldo <= 0 then continue; end if;
    v_texto := null;
    if r.pago < r.entrada_minima and (r.created_at at time zone 'Europe/London')::date = v_hoje - 3 then
      v_texto := 'Falta a entrada de £' || to_char(r.entrada_minima - r.pago, 'FM999990.00') || ' para garantir a vaga.';
    elsif r.quitar_ate is not null and r.quitar_ate - v_hoje in (30, 7) then
      v_texto := 'Faltam £' || to_char(r.saldo, 'FM999990.00') || ' e o prazo para quitar é '
                 || to_char(r.quitar_ate, 'DD/MM/YYYY') || '.';
    elsif extract(day from v_hoje) = 1 and r.pago >= r.entrada_minima then
      v_texto := 'Sugestão deste mês: £' || to_char(r.sugestao, 'FM999990.00')
                 || '. Faltam £' || to_char(r.saldo, 'FM999990.00') || '.';
    end if;
    if v_texto is not null then
      perform public.push_para(r.responsavel_id, '💳 ' || r.nome, v_texto,
                               jsonb_build_object('type', 'evento', 'id', r.evento_id));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.eventos_lembretes(boolean) from public, anon, authenticated;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'eventos-lembretes';
  if v_job is not null then perform cron.unschedule(v_job); end if;
end $$;
select cron.schedule('eventos-lembretes', '0 8,9 * * *', $$ select public.eventos_lembretes(); $$);

-- Funções internas sem acesso direto do app.
revoke all on function public.evento_idade_em(date, uuid) from public, anon, authenticated;
revoke all on function public.evento_preco_para(uuid, integer) from public, anon, authenticated;
revoke all on function public.inscricao_pago(uuid) from public, anon, authenticated;
revoke all on function public.inscricao_saldo(uuid) from public, anon, authenticated;
revoke all on function public.inscricao_sugestao(uuid) from public, anon, authenticated;
revoke all on function public.evento_ocupadas(uuid) from public, anon, authenticated;

-- O que as Edge Functions (service_role) chamam:
--   • stripe-webhook   → evento_pagamento_stripe
--   • evento-pagamento → inscricao_saldo
--   • limpar-audios-chat → chat_privado_midias_orfas (faltou na migração
--     20261111220000; sem isto a limpeza dos arquivos privados falhava).
grant execute on function public.evento_pagamento_stripe(uuid, numeric, text) to service_role;
grant execute on function public.inscricao_saldo(uuid) to service_role;
grant execute on function public.chat_privado_midias_orfas(int) to service_role;

commit;

select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('tesouraria_eventos', 'evento_inscricao_config', 'evento_precos', 'evento_perguntas',
                      'evento_equipe', 'inscricoes', 'inscricao_pessoas', 'inscricao_pagamentos')
 order by table_name;
