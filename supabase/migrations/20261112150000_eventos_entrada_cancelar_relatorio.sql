-- ============================================================================
-- Eventos: a entrada confirma a vaga, só a gestão cancela e relatório
-- (Marcos, 12/11/2026 — Retiro Peniel 2027)
--
-- 1. "A inscrição só é confirmada depois do pagamento mínimo (£50). A pessoa
--    pode deixar a inscrição feita, mas ela não conta até pagar a entrada."
--    → status novo 'pendente' (Aguardando entrada). Não ocupa vaga. Quando o
--      pago chega à entrada mínima (Stripe, dinheiro, transferência ou
--      desconto), vira 'confirmada' — ou 'espera', se as vagas acabaram — e a
--      pessoa recebe um push.
-- 2. "Não deixe a opção de cancelar. Isso tem que ser feito por nós."
--    → cancelar_minha_inscricao não cancela mais; a gestão cancela pelo painel.
--      Quem a gestão cancelou não se reinscreve sozinho.
-- 3. Relatório (planilha) da gestão: evento_relatorio + bucket privado
--    `relatorios` (a Edge Function `evento-relatorio` monta o .xlsx).
--
-- Depende de 20261112090000 e 20261112140000. Pode rodar de novo.
-- ============================================================================

-- ─── 1. Status 'pendente' ──────────────────────────────────────────────────
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.inscricoes'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.inscricoes drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.inscricoes add constraint inscricoes_status_check
  check (status in ('pendente', 'confirmada', 'espera', 'cancelada'));

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
  -- Só a gestão cancela (12/11/2026): quem foi cancelado não se reinscreve sozinho.
  if v_id is not null and not v_testando
     and exists (select 1 from public.inscricoes where id = v_id and status = 'cancelada') then
    return jsonb_build_object('status', 'erro_cancelada');
  end if;
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
  -- Com entrada mínima (12/11/2026): a vaga só conta depois de pagar a entrada.
  if coalesce(v_cfg.com_pagamento, true) and least(coalesce(v_cfg.entrada_minima, 0), v_total) > 0 then
    v_status := 'pendente';
  end if;

  update public.inscricoes
     set total = v_total, status = v_status, aceitou_regras_em = now(), cancelada_em = null
   where id = v_id;

  return jsonb_build_object('status', 'ok', 'inscricao_id', v_id, 'estado', v_status, 'total', v_total);
end;
$$;

-- Reavalia uma inscrição pendente: pagou a entrada → confirma (ou espera).
create or replace function public.inscricao_reavaliar(p_inscricao uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_i public.inscricoes; v_cfg public.evento_inscricao_config;
  v_min numeric; v_n int; v_pessoas int; v_status text; v_nome text;
begin
  select * into v_i from public.inscricoes where id = p_inscricao for update;
  if not found or v_i.status <> 'pendente' then return 'nada'; end if;
  select * into v_cfg from public.evento_inscricao_config where evento_id = v_i.evento_id;
  v_min := case when coalesce(v_cfg.com_pagamento, true)
                then least(coalesce(v_cfg.entrada_minima, 0), greatest(v_i.total - v_i.desconto, 0)) else 0 end;
  if public.inscricao_pago(p_inscricao) < v_min then return 'pendente'; end if;

  select count(*)::int into v_n
    from public.inscricao_pessoas ip join public.inscricoes i on i.id = ip.inscricao_id
   where i.evento_id = v_i.evento_id and i.status = 'confirmada';
  select count(*)::int into v_pessoas from public.inscricao_pessoas where inscricao_id = p_inscricao;
  v_status := case when v_cfg.vagas is not null and v_n + v_pessoas > v_cfg.vagas then 'espera' else 'confirmada' end;
  update public.inscricoes set status = v_status where id = p_inscricao;

  select nome into v_nome from public.agenda_eventos where id = v_i.evento_id;
  perform public.push_para(v_i.responsavel_id,
    case when v_status = 'confirmada' then '✅ Vaga confirmada — ' else '⏳ Lista de espera — ' end || coalesce(v_nome, 'Evento'),
    case when v_status = 'confirmada' then 'Recebemos a entrada. Sua vaga está garantida!'
         else 'Recebemos a entrada, mas as vagas acabaram. Você está na lista de espera e a organização vai falar com você.' end,
    jsonb_build_object('type', 'evento', 'id', v_i.evento_id));
  return v_status;
end;
$$;
revoke all on function public.inscricao_reavaliar(uuid) from public, anon, authenticated;

-- Pagamento entrou (qualquer forma) → reavalia.
create or replace function public.inscricao_pagamento_reavalia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.inscricao_reavaliar(new.inscricao_id);
  return new;
end $$;
drop trigger if exists inscricao_pagamento_reavalia on public.inscricao_pagamentos;
create trigger inscricao_pagamento_reavalia after insert on public.inscricao_pagamentos
  for each row execute function public.inscricao_pagamento_reavalia();

-- Desconto mudou → reavalia (a entrada pode ter ficado menor que o pago).
create or replace function public.inscricao_desconto_reavalia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pendente' then perform public.inscricao_reavaliar(new.id); end if;
  return new;
end $$;
drop trigger if exists inscricao_desconto_reavalia on public.inscricoes;
create trigger inscricao_desconto_reavalia after update of desconto on public.inscricoes
  for each row execute function public.inscricao_desconto_reavalia();

-- Entrada (ou cobrança) mudou no Configurar → reavalia os pendentes do evento;
-- e se o evento deixou de ter entrada, os pendentes passam a valer.
create or replace function public.evento_config_reavalia()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.inscricoes where evento_id = new.evento_id and status = 'pendente' order by created_at loop
    perform public.inscricao_reavaliar(r.id);
  end loop;
  return new;
end $$;
drop trigger if exists evento_config_reavalia on public.evento_inscricao_config;
create trigger evento_config_reavalia after update of entrada_minima, com_pagamento on public.evento_inscricao_config
  for each row execute function public.evento_config_reavalia();

-- Gestão: aceita também voltar para 'pendente'.
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
  if p_status not in ('pendente', 'confirmada', 'espera', 'cancelada') then return 'status_invalido'; end if;
  update public.inscricoes
     set status = p_status, cancelada_em = case when p_status = 'cancelada' then now() else null end
   where id = p_inscricao;
  return 'ok';
end;
$$;
revoke all on function public.evento_definir_status(uuid, text) from public, anon;
grant execute on function public.evento_definir_status(uuid, text) to authenticated;

-- ─── 2. Só a gestão cancela ────────────────────────────────────────────────
create or replace function public.cancelar_minha_inscricao(p_evento uuid)
returns text
language sql
stable
as $$ select 'nao_permitido'::text $$;
revoke all on function public.cancelar_minha_inscricao(uuid) from public, anon;
grant execute on function public.cancelar_minha_inscricao(uuid) to authenticated;

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
     where i.status in ('confirmada', 'pendente') and c.ativa
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

-- ─── 3. Relatório da gestão ────────────────────────────────────────────────
-- Tudo o que vai para a planilha. Telefone e e-mail só para admin/tesouraria
-- (o diretório de membros é restrito); o líder vê o resto.
create or replace function public.evento_relatorio(p_evento uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_contatos boolean := public.is_tesouraria();
begin
  if auth.uid() is null or not public.gere_evento(p_evento) then return null; end if;
  return jsonb_build_object(
    'evento', (select jsonb_build_object('nome', a.nome, 'data', a.data, 'data_fim', a.data_fim, 'local', a.local)
                 from public.agenda_eventos a where a.id = p_evento),
    'config', (select to_jsonb(c) from public.evento_inscricao_config c where c.evento_id = p_evento),
    'contatos', v_contatos,
    'perguntas', coalesce((select jsonb_agg(q.texto order by q.ordem) from public.evento_perguntas q where q.evento_id = p_evento), '[]'::jsonb),
    'inscricoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'responsavel', coalesce(nullif(btrim(pr.full_name), ''), 'Membro'),
        'telefone', case when v_contatos then m.telefone end,
        'email', case when v_contatos then m.email end,
        'status', i.status, 'total', i.total, 'desconto', i.desconto, 'desconto_motivo', i.desconto_motivo,
        'pago', public.inscricao_pago(i.id), 'saldo', public.inscricao_saldo(i.id),
        'inscrito_em', i.created_at, 'cancelada_em', i.cancelada_em,
        'ultimo_pagamento', (select max(g.pago_em) from public.inscricao_pagamentos g where g.inscricao_id = i.id),
        'pessoas', coalesce((select jsonb_agg(jsonb_build_object(
                     'nome', p.nome, 'idade', p.idade_no_evento, 'nascimento', p.data_nascimento,
                     'categoria', p.categoria, 'valor', p.valor, 'respostas', p.respostas) order by p.created_at)
                   from public.inscricao_pessoas p where p.inscricao_id = i.id), '[]'::jsonb),
        'pagamentos', coalesce((select jsonb_agg(jsonb_build_object(
                     'valor', g.valor, 'forma', g.forma, 'pago_em', g.pago_em, 'observacao', g.observacao,
                     'stripe', g.stripe_pi,
                     'por', (select full_name from public.profiles where id = g.registrado_por)) order by g.pago_em)
                   from public.inscricao_pagamentos g where g.inscricao_id = i.id), '[]'::jsonb)
      ) order by i.created_at)
      from public.inscricoes i
      left join public.profiles pr on pr.id = i.responsavel_id
      left join lateral (select telefone, email from public.members where profile_id = i.responsavel_id limit 1) m on true
     where i.evento_id = p_evento), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.evento_relatorio(uuid) from public, anon;
grant execute on function public.evento_relatorio(uuid) to authenticated;

-- Bucket privado: a função grava o .xlsx e devolve um link que vale 15 min.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('relatorios', 'relatorios', false, 10485760,
        array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;
