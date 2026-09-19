-- ============================================================================
-- Notificação de chat: uma por CONVERSA, e não uma por hora de conversa
--
-- O QUE MUDA, E POR QUÊ
-- A regra de hoje pergunta "já saiu um aviso de chat deste grupo na última
-- hora?". Parece o mesmo, mas não é: num chat que corre a noite inteira ela
-- dispara às 20h, às 21h, às 22h e às 23h — porque o relógio de uma hora
-- conta a partir do ÚLTIMO AVISO, e a conversa continua viva o tempo todo.
-- Quatro notificações de uma conversa só é exatamente o que faz a pessoa
-- desligar as notificações do app.
--
-- A regra nova pergunta outra coisa: "esta mensagem ABRE uma conversa?" —
-- isto é, o chat estava em silêncio antes dela. Assim:
--   • a primeira mensagem notifica;
--   • as vinte seguintes, na mesma conversa, não notificam;
--   • e a próxima notificação só vem quando o chat esfriar de novo — o que,
--     na prática, quase sempre quer dizer no dia seguinte, porque a noite
--     inteira sempre excede a janela.
--
-- É o que o Marcos pediu em 19/09: "somente a primeira mensagem gera a
-- notificação e somente depois de um tempo ou no dia seguinte gerar outra".
-- O "no dia seguinte" sai de graça desta formulação; não precisa de uma
-- regra de calendário, que traria junto o problema do horário de verão.
--
-- A janela mora em UM lugar só, `chat_janela_silencio()`, porque a mesma
-- decisão vale para os grupos e para a banda — e duas cópias de uma regra
-- de produto acabam sempre discordando.
-- ============================================================================


-- ─── A janela ───────────────────────────────────────────────────────────────
-- Duas horas. Chat de igreja vem em rajadas: alguém posta, três pessoas
-- respondem em dez minutos, e para. Duas horas de silêncio é um sinal
-- honesto de "isto aqui é assunto novo", e qualquer noite é mais longa que
-- isso. Para afrouxar ou apertar, muda-se aqui e mais nada.

create or replace function public.chat_janela_silencio()
returns interval
language sql
immutable
as $$ select interval '2 hours' $$;

comment on function public.chat_janela_silencio() is
  'Silêncio necessário para que a próxima mensagem volte a notificar. Vale '
  'para o chat dos grupos e para o chat da banda.';


-- ─── 1. Chat dos grupos ─────────────────────────────────────────────────────
-- A função inteira é reescrita (e não emendada) porque o que muda é lógica,
-- não texto. Tudo o mais — devocional, short, material, encontro — continua
-- exatamente como estava desde 20260909010000.
--
-- `infantil` entra no rótulo aqui de uma vez. A migração 20260919090000
-- acrescenta a linha procurando o corpo da função; recriá-la sem o rótulo
-- desfaria aquilo e a igreja receberia "Novo material · infantil".

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

-- O gatilho do chat existe desde 20260908230000. Recriado aqui porque uma
-- tabela de grupo nova (o infantil ainda não tem chat, mas terá) não pode
-- depender de alguém lembrar de voltar nesta linha.
drop trigger if exists chat_grupo_no_mural on public.grupo_chat_mensagens;
create trigger chat_grupo_no_mural
  after insert on public.grupo_chat_mensagens
  for each row execute function public.notificar_grupo_no_mural();


-- ─── 2. Chat da banda ───────────────────────────────────────────────────────
-- Mesma pergunta, outra tabela. A banda não tem mural — o push sai por
-- webhook direto para `banda-notifications` —, então a decisão vive numa
-- função que a Edge Function consulta antes de enviar.
--
-- A ASSINATURA MUDA: agora recebe o id da mensagem, e não uma janela em
-- minutos. Duas razões, e a segunda é a que importa:
--
--   • a janela passou a ser uma só, em `chat_janela_silencio()`;
--   • o webhook chega com atraso, e duas mensagens em sequência rápida
--     podem ter seus webhooks processados fora de ordem. Ancorar a conta no
--     `created_at` DA PRÓPRIA MENSAGEM, e não em `now()`, faz a resposta ser
--     a mesma um segundo ou um minuto depois. Com a versão anterior, a
--     mensagem que abria a conversa podia perder a notificação por causa da
--     que veio logo atrás.
--
-- A função antiga some junto: deixar as duas conviveria com a Edge Function
-- chamando a errada sem ninguém perceber.

drop function if exists public.banda_chat_deve_notificar(int);

create or replace function public.banda_chat_deve_notificar(p_mensagem_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with alvo as (
    select created_at from public.banda_chat_mensagens where id = p_mensagem_id
  )
  select exists (select 1 from alvo)
     and not exists (
       select 1
         from public.banda_chat_mensagens m, alvo
        where m.id <> p_mensagem_id
          and m.created_at <= alvo.created_at
          and m.created_at >  alvo.created_at - public.chat_janela_silencio()
     );
$$;

revoke all on function public.banda_chat_deve_notificar(uuid) from public, anon, authenticated;

comment on function public.banda_chat_deve_notificar(uuid) is
  'true quando esta mensagem ABRE uma conversa no chat da banda — isto é, o '
  'chat esteve em silêncio durante chat_janela_silencio() antes dela.';


-- ─── Conferência ────────────────────────────────────────────────────────────
-- Depois de publicar, no chat de um grupo:
--   1ª mensagem  → aparece linha nova em `avisos` com origem = 'chat'
--   2ª, logo em seguida → NENHUMA linha nova
--   e, no dia seguinte, a primeira do dia volta a criar uma.
--
--   select titulo, grupo, created_at from public.avisos
--    where origem = 'chat' order by created_at desc limit 10;
