-- ============================================================================
-- Encontro novo não notifica sozinho (26 Out 2026)
--
-- Problema: em 26/10 chegou "Novo encontro · Estudo Bíblico — 23/12" para
-- todo mundo. Era o encontro que a recorrência cria sozinha semanas antes.
-- A trava `gerado_automaticamente` (20260915190000) se perdeu quando a
-- função foi recriada em 20260919140000 e 20261002120000.
--
-- Decisão do Marcos: criar encontro nunca manda notificação; ficam só os
-- lembretes do dia. O líder do grupo (ou o admin) pode mandar o aviso à mão
-- pelo sino no card do encontro -> RPC `notificar_encontro`.
-- ============================================================================

-- ─── 1. Gatilho: grupo_eventos não anuncia mais ─────────────────────────────
-- Cópia da versão de 20261002120000; só o ramo `grupo_eventos` mudou.
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
    when 'infantil'       then 'Peniel Kids'
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

    -- Arquivo vindo do Drive da igreja: a professora costuma soltar vários de
    -- uma vez, e a sincronização insere todos juntos. Um "Novo material" por
    -- leva basta — sem isto, cinco PDFs viram cinco pushes seguidos.
    if new.drive_id is not null and exists (
      select 1 from public.avisos a
       where a.grupo = v_grupo
         and a.origem = 'material'
         and a.created_at > now() - interval '10 minutes'
    ) then
      return new;
    end if;

    v_titulo := 'Novo material · ' || v_nome_grupo;
    v_texto  := new.titulo;

  elsif TG_TABLE_NAME = 'grupo_eventos' then
    -- (26 Out 2026) Criar encontro NUNCA notifica, seja o gerado sozinho
    -- pela recorrência, seja o criado à mão. Quem avisa a turma são os
    -- lembretes do dia (09:00 e 30 min antes). Se o líder quiser avisar, usa
    -- o sino do card, que chama `notificar_encontro`.
    return new;

  elsif TG_TABLE_NAME = 'grupo_chat_mensagens' then
    v_origem := 'chat';

    -- A pergunta é sobre a CONVERSA (a tabela de mensagens), não sobre o
    -- último aviso. Se havia mensagem recente, esta continua uma conversa
    -- que já foi anunciada e fica calada.
    --
    -- A conta é ancorada em `new.created_at`, não em `now()`: a janela é
    -- "antes DESTA mensagem", que é a pergunta de verdade. Na prática as
    -- duas coincidem, mas com `now()` uma linha carregada com data antiga
    -- (importação, correção no SQL Editor) se compararia com o relógio de
    -- hoje e notificaria fora de hora.
    --
    -- `m.id <> new.id`: o gatilho é AFTER INSERT, então a própria linha já
    -- está lá e, sem isto, nenhuma mensagem jamais notificaria.
    --
    -- Num INSERT de várias mensagens de uma vez, os gatilhos AFTER ROW só
    -- correm no fim do comando e cada linha enxerga as outras — ninguém
    -- notifica. O app manda uma mensagem por vez, e errar para MENOS
    -- notificação é o lado certo de errar.
    if exists (
      select 1 from public.grupo_chat_mensagens m
       where m.grupo = v_grupo
         and m.id <> new.id
         and m.created_at <= new.created_at
         and m.created_at >  new.created_at - public.chat_janela_silencio()
    ) then
      return new;
    end if;

    v_titulo := 'Novas mensagens no chat · ' || v_nome_grupo;
    -- Texto genérico: o conteúdo da conversa não vai para a tela de bloqueio.
    v_texto  := 'Há mensagens novas no chat do grupo.';

  else
    return new;
  end if;

  insert into public.avisos (titulo, texto, tipo, data, grupo, apenas_membros, origem)
  values (v_titulo, v_texto, 'geral', now(), v_grupo, false, v_origem);

  return new;
end;
$$;


-- ─── 2. Aviso manual de um encontro ─────────────────────────────────────────
-- Só líder do grupo ou admin. O texto sai igual ao antigo, com "das" quando o
-- horário é um intervalo ("20h às 21h30") — antes saía "às 20h às 21h30".
create or replace function public.notificar_encontro(p_evento uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev         public.grupo_eventos%rowtype;
  v_nome_grupo text;
  v_texto      text;
begin
  select * into v_ev from public.grupo_eventos where id = p_evento;
  if not found then
    raise exception 'Encontro não encontrado';
  end if;

  if not (public.is_admin() or public.is_grupo_leader(v_ev.grupo)) then
    raise exception 'Sem permissão para notificar este grupo';
  end if;

  v_nome_grupo := case v_ev.grupo
    when 'mulheres'       then 'Grupo de Mulheres'
    when 'homens'         then 'Grupo de Homens'
    when 'jovens'         then 'Peniel Alive'
    when 'estudo_biblico' then 'Estudo Bíblico'
    when 'infantil'       then 'Peniel Kids'
    else v_ev.grupo
  end;

  v_texto := v_ev.titulo
          || coalesce(' — ' || to_char(v_ev.data, 'DD/MM'), '')
          || coalesce(
               case when v_ev.horario ilike '%às%' then ' das ' else ' às ' end
               || nullif(v_ev.horario, ''), '');

  insert into public.avisos (titulo, texto, tipo, data, grupo, apenas_membros, origem)
  values ('Encontro · ' || v_nome_grupo, v_texto, 'geral', now(), v_ev.grupo, false, 'evento');
end;
$$;

revoke all on function public.notificar_encontro(uuid) from public, anon;
grant execute on function public.notificar_encontro(uuid) to authenticated;
