-- Conversa privada notifica TODA mensagem, como no WhatsApp (pedido do
-- Marcos, 11/11/2026). Antes valia a janela de 2 h dos outros chats (só a
-- mensagem que abre a conversa notificava). Os chats da Igreja, grupos e
-- Banda continuam com a janela.
create or replace function public.conversa_push()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_outro uuid;
  v_corpo text;
  v_msgs  jsonb;
begin
  v_outro := public.outro_da_conversa(new.conversa_id, new.autor_id);
  v_corpo := case new.tipo
    when 'imagem'  then '📷 Foto'
    when 'audio'   then '🎤 Mensagem de voz'
    when 'video'   then '🎬 Vídeo'
    when 'arquivo' then '📎 ' || coalesce(new.midia_nome, 'Arquivo')
    else new.texto end;

  select jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', '💬 ' || new.autor_nome,
           'body', left(coalesce(v_corpo, ''), 140),
           'sound', 'default',
           -- Mesmo grupo de notificação por conversa (Android empilha).
           'channelId', 'default',
           'data', jsonb_build_object('type', 'conversa', 'id', new.conversa_id)))
    into v_msgs
    from (select distinct pt.token from public.push_tokens pt where pt.user_id = v_outro) t;

  if v_msgs is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_msgs,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 15000
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

select 'ok: conversa privada notifica toda mensagem' as resultado;
