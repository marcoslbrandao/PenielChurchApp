-- ============================================================================
-- Material dos grupos no Google Drive da igreja (25 Set 2026)
--
-- Pedido do Marcos: acabar com o "Solicitar acesso" do Google quando o aluno
-- abre o material. O Material era só um link colado (o Drive pessoal da
-- professora). Agora cada grupo tem uma subpasta em "Peniel App - Materiais",
-- no Meu Drive de penielchurchlondon@gmail.com, e a Edge Function
-- `materiais-drive` espelha a pasta em `grupo_arquivos`.
--
-- A pasta nunca é compartilhada com os alunos: quem lê o Drive é só a função.
-- Quem vê o quê continua sendo a RLS de `grupo_arquivos`, sem mudança.
-- Material por link continua funcionando igual (drive_id null).
--
-- Ver claude/materiais-dos-grupos-no-drive.md
-- ============================================================================

-- ─── 1. grupo_arquivos ganha o lado Drive ────────────────────────────────────
alter table public.grupo_arquivos
  add column if not exists drive_id   text,
  add column if not exists drive_nome text,   -- nome no Drive, para notar renomeação
  add column if not exists mime_type  text,
  add column if not exists tamanho    bigint;

-- UNIQUE simples (não parcial): é o alvo do ON CONFLICT da sincronização, e
-- NULLs não colidem entre si, então os materiais por link não são afetados.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'grupo_arquivos_drive_id_key'
  ) then
    alter table public.grupo_arquivos add constraint grupo_arquivos_drive_id_key unique (drive_id);
  end if;
end $$;


-- ─── 2. Qual pasta do Drive é de qual grupo ─────────────────────────────────
-- Preenchida pela própria função na primeira sincronização (acha a subpasta
-- pelo nome, ou cria). Depois vale o id: renomear a pasta no Drive não quebra.
-- Sem policy nenhuma: só a service role (a função) lê e escreve.
create table if not exists public.grupo_drive_pastas (
  grupo           text primary key
                  check (grupo in ('infantil', 'mulheres', 'homens', 'jovens', 'estudo_biblico')),
  pasta_id        text not null,
  sincronizado_em timestamptz
);

alter table public.grupo_drive_pastas enable row level security;


-- ─── 3. Um push por leva de arquivos do Drive ───────────────────────────────
-- Cópia da versão de 20260919140000 com um único acréscimo, no ramo
-- `grupo_arquivos`.
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
    v_origem := 'evento';
    v_titulo := 'Novo encontro · ' || v_nome_grupo;
    v_texto  := new.titulo || coalesce(' — ' || to_char(new.data, 'DD/MM'), '')
                           || coalesce(' às ' || new.horario, '');

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



-- ─── 4. Cron da sincronização ───────────────────────────────────────────────
-- A cada 10 minutos. É o que faz o "Novo material" sair mesmo que ninguém
-- abra a aba do grupo. Mesma técnica da 20260920130000: reaproveita a chave do
-- job `encontro-lembretes` em vez de colar uma chave no git.
do $$
declare
  v_chave text;
  v_job_id bigint;
begin
  select substring(command from 'Bearer ([A-Za-z0-9._-]+)')
    into v_chave
    from cron.job where jobname = 'encontro-lembretes'
   limit 1;

  if v_chave is null then
    raise notice 'Cron materiais-drive NÃO criado: não achei a chave no job encontro-lembretes.';
    return;
  end if;

  select jobid into v_job_id from cron.job where jobname = 'materiais-drive';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'materiais-drive',
    '*/10 * * * *',
    format(
      $job$
        select net.http_post(
          url := 'https://yudulaqsqhzbbarhxbnr.supabase.co/functions/v1/materiais-drive',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'),
          body := '{"acao":"sincronizar_todos"}'::jsonb,
          timeout_milliseconds := 60000
        );
      $job$,
      v_chave
    )
  );
end $$;
