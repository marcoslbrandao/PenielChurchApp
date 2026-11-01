-- ============================================================================
-- Gatilho notificar_grupo_no_mural: cópia EXATA da versão que está no ar
-- (01 Nov 2026).
--
-- Por quê: a prévia da mensagem do chat ("Nome: começo da mensagem", 19/10)
-- foi aplicada direto no banco e nunca virou arquivo. E a migration
-- 20261026170000 tinha uma cópia mais antiga, sem a prévia. Este arquivo
-- deixa o repositório igual ao banco:
--   * grupo_eventos não anuncia sozinho (aviso manual pelo sino ->
--     notificar_encontro, aplicado em 01/11);
--   * chat dos grupos com prévia da mensagem e silêncio de 2h.
-- Já está aplicado no banco; foi só registrado com `migration repair`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notificar_grupo_no_mural()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_grupo text := new.grupo;
  v_nome_grupo text;
  v_titulo text;
  v_texto text;
  v_origem text;
  v_previa text;
begin
  if v_grupo is null then
    return new;
  end if;

  v_nome_grupo := case v_grupo
    when 'mulheres' then 'Grupo de Mulheres'
    when 'homens' then 'Grupo de Homens'
    when 'jovens' then 'Peniel Alive'
    when 'estudo_biblico' then 'Estudo Bíblico'
    when 'infantil' then 'Peniel Kids'
    else v_grupo
  end;

  if TG_TABLE_NAME = 'devocionais' then
    v_origem := 'devocional';
    v_titulo := 'Novo devocional · ' || v_nome_grupo;
    v_texto := new.titulo;

  elsif TG_TABLE_NAME = 'shorts_videos' then
    v_origem := 'short';
    v_titulo := 'Novo vídeo · ' || v_nome_grupo;
    v_texto := new.titulo;

  elsif TG_TABLE_NAME = 'grupo_arquivos' then
    v_origem := 'material';
    -- Arquivo vindo do Drive da igreja: um "Novo material" por leva basta.
    if new.drive_id is not null and exists (
      select 1 from public.avisos a
      where a.grupo = v_grupo
        and a.origem = 'material'
        and a.created_at > now() - interval '10 minutes'
    ) then
      return new;
    end if;
    v_titulo := 'Novo material · ' || v_nome_grupo;
    v_texto := new.titulo;

  elsif TG_TABLE_NAME = 'grupo_eventos' then
    -- Criar encontro nao notifica; aviso manual pelo sino (notificar_encontro).
    return new;

  elsif TG_TABLE_NAME = 'grupo_chat_mensagens' then
    v_origem := 'chat';
    -- Conversa ja anunciada nas ultimas 2h fica calada (ver chat_janela_silencio).
    if exists (
      select 1 from public.grupo_chat_mensagens m
      where m.grupo = v_grupo
        and m.id <> new.id
        and m.created_at <= new.created_at
        and m.created_at > new.created_at - public.chat_janela_silencio()
    ) then
      return new;
    end if;

    v_titulo := 'Novas mensagens no chat · ' || v_nome_grupo;

    -- NOVO: previa da mensagem. Texto cortado em 100 caracteres, sem os
    -- asteriscos do negrito; anexos viram um rotulo.
    v_previa := nullif(btrim(replace(coalesce(new.texto, ''), '*', '')), '');
    if v_previa is not null then
      v_previa := case when length(v_previa) > 100
                       then left(v_previa, 100) || '…'
                       else v_previa end;
    elsif new.audio_path is not null then
      v_previa := '🎤 Mensagem de voz';
    elsif new.midia_tipo ilike '%video%' or new.midia_mime ilike 'video/%' then
      v_previa := '🎥 Vídeo';
    elsif new.midia_tipo ilike '%imag%' or new.midia_tipo ilike '%foto%' or new.midia_mime ilike 'image/%' then
      v_previa := '📷 Foto';
    elsif new.midia_tipo ilike '%audio%' or new.midia_mime ilike 'audio/%' then
      v_previa := '🎤 Mensagem de voz';
    elsif new.midia_path is not null then
      v_previa := '📄 ' || coalesce(new.midia_nome, 'Arquivo');
    else
      v_previa := 'Nova mensagem';
    end if;

    v_texto := coalesce(new.autor_nome || ': ', '') || v_previa;

  else
    return new;
  end if;

  insert into public.avisos (titulo, texto, tipo, data, grupo, apenas_membros, origem)
  values (v_titulo, v_texto, 'geral', now(), v_grupo, false, v_origem);

  return new;
end;
$function$;
