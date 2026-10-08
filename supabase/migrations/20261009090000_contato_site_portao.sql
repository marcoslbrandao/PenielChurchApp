-- ============================================================================
-- Formulário de Contato do site novo (Astro): portão contra spam no servidor.
--
-- Antes: o site gravava direto em `contact_messages` com a chave anônima, e a
-- policy "Qualquer um envia mensagem de contato" deixava qualquer pessoa na
-- internet inserir quantas linhas quisesse. A única defesa era no navegador
-- (campo-armadilha, 3 s, 1 por minuto), que um robô simplesmente ignora.
--
-- Agora: o site chama a Edge Function `contato-site`, que chama esta função
-- com a chave de serviço. Aqui dentro ficam os limites:
--   * 5 mensagens por hora por IP (o IP chega como hash, nunca o IP em si);
--   * 40 mensagens por hora no total (teto contra ataque espalhado).
-- O app não grava em `contact_messages` (conferido em 09/10/2026), então a
-- policy de insert público sai sem quebrar nada.
-- ============================================================================

create table if not exists public.contato_site_log (
  id bigint generated always as identity primary key,
  ip_hash text,
  criado_em timestamptz not null default now()
);
create index if not exists contato_site_log_criado_idx on public.contato_site_log (criado_em desc);
alter table public.contato_site_log enable row level security;
comment on table public.contato_site_log is
  'Só para limitar abuso do formulário de contato do site. `ip_hash` é um hash, não o IP.';

create or replace function public.registrar_contato_site(
  p_nome text,
  p_email text,
  p_mensagem text,
  p_ip_hash text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_nome), '') = '' or coalesce(btrim(p_mensagem), '') = '' then
    return json_build_object('ok', false, 'erro', 'vazio');
  end if;

  if (select count(*) from public.contato_site_log
       where criado_em > now() - interval '1 hour') >= 40 then
    return json_build_object('ok', false, 'erro', 'limite_global');
  end if;

  if p_ip_hash is not null and (select count(*) from public.contato_site_log
       where ip_hash = p_ip_hash and criado_em > now() - interval '1 hour') >= 5 then
    return json_build_object('ok', false, 'erro', 'limite_ip');
  end if;

  insert into public.contato_site_log (ip_hash) values (p_ip_hash);
  insert into public.contact_messages (nome, email, mensagem)
    values (left(btrim(p_nome), 120), left(btrim(p_email), 160), left(btrim(p_mensagem), 4000));

  -- Log antigo não serve para nada depois de um dia.
  delete from public.contato_site_log where criado_em < now() - interval '1 day';

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.registrar_contato_site(text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_contato_site(text, text, text, text) to service_role;

-- Fecha a porta antiga: ninguém mais insere direto com a chave anônima.
drop policy if exists "Qualquer um envia mensagem de contato" on public.contact_messages;
