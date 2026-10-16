-- ============================================================================
-- 16/10/2026 - Push para o ADMIN quando chega mensagem de Contato ou pedido de
-- oracao (pedido do Marcos: "nao corro o risco de nao ver se eu nao abrir a
-- aba Admin").
--
-- Manda direto para a API de push do Expo pelo pg_net, sem Edge Function:
-- a API do Expo nao pede chave, entao nao ha segredo guardado no banco e nada
-- para fazer deploy. So recebe quem tem papel 'admin' e push ativado.
-- O toque abre o Admin ja na aba certa (lib/destinoNotificacao.ts).
-- Pode rodar mais de uma vez.
-- ============================================================================

create or replace function public.notificar_admins(p_titulo text, p_corpo text, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', p_titulo,
           'body', left(coalesce(p_corpo, ''), 160),
           'sound', 'default',
           'data', p_dados))
    into v_msgs
    from (select distinct pt.token
            from public.push_tokens pt
            join public.profiles p on p.id = pt.user_id
           where p.role = 'admin') t;

  if v_msgs is null then
    return;  -- nenhum admin com push ativado
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_msgs,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 15000
  );
exception when others then
  -- Push nunca pode impedir a mensagem/pedido de ser gravado.
  raise warning 'notificar_admins falhou: %', sqlerrm;
end;
$$;

revoke all on function public.notificar_admins(text, text, jsonb) from public, anon, authenticated;


-- ─── Contato ───────────────────────────────────────────────────────────────
create or replace function public.contato_avisa_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notificar_admins(
    '✉️ Nova mensagem de ' || coalesce(nullif(trim(new.nome), ''), 'alguém'),
    new.mensagem,
    jsonb_build_object('type', 'admin_contato', 'id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists contato_avisa_admin_trg on public.contact_messages;
create trigger contato_avisa_admin_trg
  after insert on public.contact_messages
  for each row execute function public.contato_avisa_admin();


-- ─── Pedido de oracao ──────────────────────────────────────────────────────
create or replace function public.oracao_avisa_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  select full_name into v_nome from public.profiles where id = new.user_id;
  perform public.notificar_admins(
    '🙏 Novo pedido de oração' || coalesce(' de ' || nullif(trim(v_nome), ''), ''),
    new.titulo,
    jsonb_build_object('type', 'admin_oracao', 'id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists oracao_avisa_admin_trg on public.prayer_requests;
create trigger oracao_avisa_admin_trg
  after insert on public.prayer_requests
  for each row execute function public.oracao_avisa_admin();
