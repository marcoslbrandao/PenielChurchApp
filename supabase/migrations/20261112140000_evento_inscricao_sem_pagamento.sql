-- ============================================================================
-- Evento com inscrição SEM pagamento (Marcos, 12/11/2026)
--
-- "Uma coisa é ter inscrição, outra é ter inscrição e pagamento. Podemos ter
-- um evento só com inscrição para confirmar a vaga, mas sem pagamento."
--
-- • evento_inscricao_config.com_pagamento (padrão true = como era antes).
-- • Sem pagamento: sem tabela de preços, sem entrada, total 0 — a inscrição
--   só reserva a vaga (vagas e lista de espera continuam valendo).
-- • evento_definir_inscricao: usado pelo formulário do evento no Admin
--   (Sem inscrição / Só inscrição / Inscrição e pagamento).
-- • evento_definir_pagamento: o interruptor "Com pagamento" do Configurar.
--
-- Depende de 20261112090000_eventos_inscricoes.sql. Pode rodar de novo.
-- ============================================================================

alter table public.evento_inscricao_config
  add column if not exists com_pagamento boolean not null default true;

-- Liga/desliga a cobrança de um evento.
create or replace function public.evento_definir_pagamento(p_evento uuid, p_com boolean)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_tesouraria() then return 'sem_acesso'; end if;
  if not exists (select 1 from public.evento_inscricao_config where evento_id = p_evento) then return 'sem_config'; end if;

  if not p_com then
    -- Não dá para tirar a cobrança de quem já pagou alguma coisa.
    if exists (select 1 from public.inscricao_pagamentos g
                 join public.inscricoes i on i.id = g.inscricao_id
                where i.evento_id = p_evento) then
      return 'tem_pagamentos';
    end if;
    delete from public.evento_precos where evento_id = p_evento;
    update public.evento_inscricao_config
       set com_pagamento = false, entrada_minima = 0, quitar_ate = null, updated_at = now()
     where evento_id = p_evento;
    update public.inscricao_pessoas ip set valor = 0, categoria = null
      from public.inscricoes i where i.id = ip.inscricao_id and i.evento_id = p_evento;
    update public.inscricoes set total = 0, desconto = 0 where evento_id = p_evento;
  else
    update public.evento_inscricao_config
       set com_pagamento = true, updated_at = now()
     where evento_id = p_evento;
    -- Primeira vez com pagamento: valores de exemplo (o admin ajusta no Configurar).
    if not exists (select 1 from public.evento_precos where evento_id = p_evento) then
      insert into public.evento_precos (evento_id, categoria, idade_min, idade_max, valor, ordem) values
        (p_evento, 'Criança até 5 anos', 0, 5, 0, 1),
        (p_evento, 'Criança de 6 a 12 anos', 6, 12, 150, 2),
        (p_evento, 'Adulto (13 anos ou mais)', 13, null, 180, 3);
    end if;
    -- Quem já estava inscrito (sem nada pago) passa a ter o valor da tabela.
    update public.inscricao_pessoas ip
       set categoria = (select pr.categoria from public.evento_preco_para(p_evento, ip.idade_no_evento) pr),
           valor = coalesce((select pr.valor from public.evento_preco_para(p_evento, ip.idade_no_evento) pr), 0)
      from public.inscricoes i
     where ip.inscricao_id = i.id and i.evento_id = p_evento and public.inscricao_pago(i.id) = 0;
    update public.inscricoes i
       set total = coalesce((select sum(valor) from public.inscricao_pessoas where inscricao_id = i.id), 0)
     where i.evento_id = p_evento and public.inscricao_pago(i.id) = 0;
  end if;
  return 'ok';
end;
$$;
revoke all on function public.evento_definir_pagamento(uuid, boolean) from public, anon;
grant execute on function public.evento_definir_pagamento(uuid, boolean) to authenticated;

-- Formulário do evento no Admin: 'nenhuma' | 'gratis' | 'paga'.
-- Cria a configuração se ainda não existe (datas do próprio evento) e não
-- apaga nada do que já foi configurado no 🎟️.
create or replace function public.evento_definir_inscricao(p_evento uuid, p_modo text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_ev record; v_r text;
begin
  if not public.is_tesouraria() then return 'sem_acesso'; end if;
  select id, data, data_fim into v_ev from public.agenda_eventos where id = p_evento;
  if not found then return 'sem_evento'; end if;
  if p_modo not in ('nenhuma', 'gratis', 'paga') then return 'modo_invalido'; end if;

  if p_modo = 'nenhuma' then
    update public.evento_inscricao_config set ativa = false, updated_at = now() where evento_id = p_evento;
    return 'ok';
  end if;

  insert into public.evento_inscricao_config (evento_id, ativa, inicio, fim, com_pagamento)
  values (p_evento, true,
          case when v_ev.data is not null then (v_ev.data::text || 'T12:00:00Z')::timestamptz end,
          case when coalesce(v_ev.data_fim, v_ev.data) is not null then (coalesce(v_ev.data_fim, v_ev.data)::text || 'T12:00:00Z')::timestamptz end,
          p_modo = 'paga')
  on conflict (evento_id) do update set ativa = true, updated_at = now(),
    inicio = coalesce(public.evento_inscricao_config.inicio, excluded.inicio),
    fim = coalesce(public.evento_inscricao_config.fim, excluded.fim);

  v_r := public.evento_definir_pagamento(p_evento, p_modo = 'paga');
  return v_r;
end;
$$;
revoke all on function public.evento_definir_inscricao(uuid, text) from public, anon;
grant execute on function public.evento_definir_inscricao(uuid, text) to authenticated;
