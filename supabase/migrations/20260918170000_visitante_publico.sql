-- ============================================================================
-- Auto-registro do visitante pelo QR code
--
-- A diferença para a migração de 14h: ali quem digita é a recepção, logada.
-- Aqui quem preenche é o próprio visitante, no celular dele, SEM CONTA — e é
-- por isso que nada disto passa pela chave anônima direto na tabela.
--
-- O CAMINHO: página estática (GitHub Pages) → Edge Function `visitante-publico`
-- → esta função, com service_role. A página nunca fala com a tabela.
--
-- POR QUE O RATE LIMIT NÃO PODE SER POR IP SOZINHO
-- A igreja inteira está no mesmo wi-fi no domingo. Um limite de "3 por IP por
-- hora" recusaria o quarto visitante de um domingo cheio — bloquearia
-- exatamente o caso de sucesso. Por isso o teto por IP é alto (o suficiente
-- para um domingo movimentado, baixo para um robô) e existe um teto global por
-- hora como segunda rede. O filtro que realmente pega robô é o honeypot na
-- página: um campo invisível que humano nenhum preenche.
-- ============================================================================

create table if not exists public.visitante_publico_log (
  id serial primary key,
  ip_hash text,
  criado_em timestamptz not null default now()
);

create index if not exists visitante_publico_log_janela_idx
  on public.visitante_publico_log(criado_em desc);

alter table public.visitante_publico_log enable row level security;
-- Sem policy: só a Edge Function (service_role) escreve e lê.

comment on table public.visitante_publico_log is
  'Só para limitar abuso do formulário público. `ip_hash` é um hash, não o IP: '
  'para contar requisições não é preciso guardar o endereço de ninguém.';


-- ─── A função que a Edge Function chama ─────────────────────────────────────
-- Roda com service_role, então RLS não a alcança — a autorização é a checagem
-- de limite aqui dentro, e é por isso que ela não recebe grant para `anon`
-- nem para `authenticated`: ninguém a chama do app.

create or replace function public.registrar_visitante_publico(
  p_nome text,
  p_telefone text default null,
  p_email text default null,
  p_primeira_vez boolean default true,
  p_como_conheceu text default null,
  p_observacoes text default null,
  p_ip_hash text default null,
  p_max_por_ip int default 40,
  p_max_global int default 120
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no_ip int;
  v_global int;
  v_digitos text;
  v_id uuid;
begin
  if btrim(coalesce(p_nome, '')) = '' then
    return json_build_object('ok', false, 'erro', 'nome_vazio');
  end if;

  select count(*) into v_global
    from public.visitante_publico_log where criado_em > now() - interval '1 hour';
  if v_global >= p_max_global then
    return json_build_object('ok', false, 'erro', 'limite_global');
  end if;

  if p_ip_hash is not null then
    select count(*) into v_no_ip
      from public.visitante_publico_log
     where ip_hash = p_ip_hash and criado_em > now() - interval '1 hour';
    if v_no_ip >= p_max_por_ip then
      return json_build_object('ok', false, 'erro', 'limite_ip');
    end if;
  end if;

  insert into public.visitante_publico_log (ip_hash) values (p_ip_hash);

  v_digitos := public.normaliza_telefone(p_telefone);

  -- Mesma deduplicação da recepção: quem preencheu o formulário em agosto e
  -- preenche de novo hoje é a mesma pessoa, com duas visitas.
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
           email         = coalesce(nullif(btrim(coalesce(p_email, '')), ''), email),
           como_conheceu = coalesce(como_conheceu, nullif(btrim(coalesce(p_como_conheceu, '')), '')),
           observacoes   = case
                             when btrim(coalesce(p_observacoes, '')) = '' then observacoes
                             when observacoes is null then p_observacoes
                             else observacoes || E'\n---\n' || p_observacoes
                           end,
           -- Quem preenche o formulário sozinho está consentindo por ato
           -- próprio: escreveu o telefone num campo que diz para que serve.
           -- É uma base legal melhor do que a da recepção, não pior.
           consentiu_contato = true,
           situacao = case when situacao in ('sem_retorno', 'contatado') then 'retornou' else situacao end
     where id = v_id;
    return json_build_object('ok', true, 'ja_existia', true);
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
     true)
  returning id into v_id;

  return json_build_object('ok', true, 'ja_existia', false);
end;
$$;

-- Ninguém além da service_role executa isto. A Edge Function é o único
-- caminho, e é lá que mora a checagem de honeypot e o hash do IP.
revoke all on function public.registrar_visitante_publico(text, text, text, boolean, text, text, text, int, int)
  from public, anon, authenticated;


-- ─── Limpeza do log ─────────────────────────────────────────────────────────
-- O log só serve para a janela de uma hora. Guardar além disso é acumular
-- hashes de IP sem motivo — e dado que não existe é dado que não vaza.

create or replace function public.limpar_visitante_publico_log()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.visitante_publico_log where criado_em < now() - interval '2 days';
$$;

-- Cron sugerido (criar no painel, junto dos outros):
--   select cron.schedule('limpar-visitante-log', '30 3 * * *',
--     $$select public.limpar_visitante_publico_log();$$);
