-- ============================================================================
-- Moderacao dos chats + autorizacao de fotos das criancas (17/10/2026)
--
-- Por que: a Apple revisou a diretriz 1.2 (conteudo gerado por usuarios) em
-- 16/10/2026. App com chat precisa ter: filtro de conteudo ofensivo, um jeito
-- de DENUNCIAR com resposta rapida, um jeito de BLOQUEAR quem abusa e contato
-- publicado. Quem nao tem essas protecoes pode ser enquadrado no Codigo de
-- Conduta do desenvolvedor. O Marcos decidiu (17/10) voltar com o Denunciar.
--
-- O que esta migracao cria:
--   1. chat_denuncias      -> uma tabela so para os tres chats (Igreja,
--                             grupos, Banda), com copia da mensagem (o Admin
--                             ve o que foi denunciado mesmo se a mensagem
--                             for apagada) e push imediato para os admins.
--   2. denunciar_mensagem() -> unica porta de entrada da denuncia (confere se
--                             quem denuncia enxerga aquela mensagem).
--   3. usuarios_bloqueados -> "Bloquear" pessoal: as mensagens da pessoa
--                             somem para quem bloqueou (pelo banco, inclusive
--                             no tempo real) e o Admin e avisado.
--   4. Suspensao em TODOS os chats: quem esta em chat_geral_silenciados nao
--      escreve mais tambem nos grupos e na Banda.
--   5. aceite_regras_chat  -> aceite das Regras da comunidade (o app pede
--                             antes de abrir qualquer chat).
--   6. members.autoriza_fotos -> resposta do responsavel sobre fotos/videos
--                             da crianca; aparece na Ficha da sala.
--
-- Pode rodar de novo sem estragar nada.
-- ============================================================================


-- ─── 1. Denuncias (os tres chats) ───────────────────────────────────────────
create table if not exists public.chat_denuncias (
  id             uuid primary key default gen_random_uuid(),
  chat           text not null check (chat in ('geral', 'grupo', 'banda')),
  grupo          text,
  mensagem_id    uuid not null,
  autor_id       uuid references auth.users(id) on delete set null,
  autor_nome     text,
  texto          text,
  midia_path     text,
  motivo         text,
  denunciante_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status         text not null default 'aberta' check (status in ('aberta', 'resolvida')),
  resolucao      text,
  resolvida_por  uuid references auth.users(id) on delete set null,
  resolvida_em   timestamptz,
  created_at     timestamptz not null default now(),
  unique (chat, mensagem_id, denunciante_id)
);
create index if not exists chat_denuncias_status_idx on public.chat_denuncias (status, created_at desc);

alter table public.chat_denuncias enable row level security;

-- Sem policy de INSERT: denuncia so entra por denunciar_mensagem().
drop policy if exists "chat denuncias: admin e o proprio leem" on public.chat_denuncias;
create policy "chat denuncias: admin e o proprio leem"
  on public.chat_denuncias for select to authenticated
  using (denunciante_id = auth.uid() or public.is_admin());

drop policy if exists "chat denuncias: admin resolve" on public.chat_denuncias;
create policy "chat denuncias: admin resolve"
  on public.chat_denuncias for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "chat denuncias: admin apaga" on public.chat_denuncias;
create policy "chat denuncias: admin apaga"
  on public.chat_denuncias for delete to authenticated
  using (public.is_admin());


-- ─── 2. denunciar_mensagem() ────────────────────────────────────────────────
-- Devolve 'ok', 'ja' (essa pessoa ja denunciou essa mensagem), 'propria' ou
-- 'sem_acesso' (mensagem nao existe ou a pessoa nao enxerga aquele chat).
create or replace function public.denunciar_mensagem(p_chat text, p_mensagem_id uuid, p_motivo text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor uuid; v_nome text; v_texto text; v_midia text; v_grupo text;
  v_id uuid; v_onde text;
begin
  if auth.uid() is null then return 'sem_acesso'; end if;

  if p_chat = 'geral' then
    select autor_id, autor_nome, texto, midia_path, null
      into v_autor, v_nome, v_texto, v_midia, v_grupo
      from public.chat_geral_mensagens where id = p_mensagem_id;
    if not found or not public.is_membro() then return 'sem_acesso'; end if;
    v_onde := 'Chat da Igreja';
  elsif p_chat = 'grupo' then
    select autor_id, autor_nome, texto, coalesce(midia_path, audio_path), grupo
      into v_autor, v_nome, v_texto, v_midia, v_grupo
      from public.grupo_chat_mensagens where id = p_mensagem_id;
    if not found or not public.tem_acesso_grupo(v_grupo) then return 'sem_acesso'; end if;
    v_onde := 'chat do grupo ' || v_grupo;
  elsif p_chat = 'banda' then
    select autor_id, autor_nome, texto, coalesce(midia_path, audio_path), null
      into v_autor, v_nome, v_texto, v_midia, v_grupo
      from public.banda_chat_mensagens where id = p_mensagem_id;
    if not found or not public.is_banda_membro() then return 'sem_acesso'; end if;
    v_onde := 'chat da Banda';
  else
    return 'sem_acesso';
  end if;

  if v_autor = auth.uid() then return 'propria'; end if;

  insert into public.chat_denuncias
    (chat, grupo, mensagem_id, autor_id, autor_nome, texto, midia_path, motivo, denunciante_id)
  values
    (p_chat, v_grupo, p_mensagem_id, v_autor, v_nome, v_texto, v_midia, nullif(trim(p_motivo), ''), auth.uid())
  on conflict (chat, mensagem_id, denunciante_id) do nothing
  returning id into v_id;

  if v_id is null then return 'ja'; end if;

  perform public.notificar_admins(
    '🚩 Denúncia no ' || v_onde,
    coalesce(v_nome, 'Alguém') || ': ' || left(coalesce(v_texto, ''), 120),
    jsonb_build_object('type', 'admin_denuncia', 'id', v_id)
  );
  return 'ok';
end;
$$;
revoke all on function public.denunciar_mensagem(text, uuid, text) from public, anon;
grant execute on function public.denunciar_mensagem(text, uuid, text) to authenticated;

-- Versoes antigas do app gravavam em chat_geral_denuncias: copia para a
-- tabela nova, para nada ficar fora da fila do Admin.
create or replace function public.chat_geral_denuncia_legada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.chat_denuncias (chat, mensagem_id, autor_id, autor_nome, texto, midia_path, denunciante_id)
  select 'geral', m.id, m.autor_id, m.autor_nome, m.texto, m.midia_path, new.denunciante_id
    from public.chat_geral_mensagens m where m.id = new.mensagem_id
  on conflict (chat, mensagem_id, denunciante_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform public.notificar_admins('🚩 Denúncia no Chat da Igreja', 'Toque para ver no Painel Admin.',
      jsonb_build_object('type', 'admin_denuncia', 'id', v_id));
  end if;
  return new;
end;
$$;
drop trigger if exists chat_geral_denuncia_legada_trg on public.chat_geral_denuncias;
create trigger chat_geral_denuncia_legada_trg
  after insert on public.chat_geral_denuncias
  for each row execute function public.chat_geral_denuncia_legada();


-- ─── 3. Bloquear ────────────────────────────────────────────────────────────
create table if not exists public.usuarios_bloqueados (
  bloqueador_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bloqueado_id  uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (bloqueador_id, bloqueado_id),
  check (bloqueador_id <> bloqueado_id)
);
alter table public.usuarios_bloqueados enable row level security;

drop policy if exists "bloqueios: o proprio e o admin leem" on public.usuarios_bloqueados;
create policy "bloqueios: o proprio e o admin leem"
  on public.usuarios_bloqueados for select to authenticated
  using (bloqueador_id = auth.uid() or public.is_admin());

drop policy if exists "bloqueios: o proprio bloqueia" on public.usuarios_bloqueados;
create policy "bloqueios: o proprio bloqueia"
  on public.usuarios_bloqueados for insert to authenticated
  with check (bloqueador_id = auth.uid());

drop policy if exists "bloqueios: o proprio desbloqueia" on public.usuarios_bloqueados;
create policy "bloqueios: o proprio desbloqueia"
  on public.usuarios_bloqueados for delete to authenticated
  using (bloqueador_id = auth.uid());

-- "Eu bloqueei esta pessoa?" — security definer para a policy das mensagens
-- nao depender da RLS da tabela de bloqueios.
create or replace function public.eu_bloqueei(p_autor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios_bloqueados b
                  where b.bloqueador_id = auth.uid() and b.bloqueado_id = p_autor);
$$;
revoke all on function public.eu_bloqueei(uuid) from public, anon;
grant execute on function public.eu_bloqueei(uuid) to authenticated;

-- As mensagens de quem eu bloqueei somem para mim (leitura e tempo real).
-- RESTRICTIVE: soma-se as policies que ja existem, sem mexer nelas.
drop policy if exists "bloqueio esconde mensagens" on public.chat_geral_mensagens;
create policy "bloqueio esconde mensagens"
  on public.chat_geral_mensagens as restrictive for select to authenticated
  using (not public.eu_bloqueei(autor_id));

drop policy if exists "bloqueio esconde mensagens" on public.grupo_chat_mensagens;
create policy "bloqueio esconde mensagens"
  on public.grupo_chat_mensagens as restrictive for select to authenticated
  using (not public.eu_bloqueei(autor_id));

drop policy if exists "bloqueio esconde mensagens" on public.banda_chat_mensagens;
create policy "bloqueio esconde mensagens"
  on public.banda_chat_mensagens as restrictive for select to authenticated
  using (not public.eu_bloqueei(autor_id));

-- Lista para Perfil > Pessoas bloqueadas (com o nome, para poder desfazer).
create or replace function public.meus_bloqueados()
returns table (user_id uuid, nome text, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.bloqueado_id, coalesce(nullif(trim(p.full_name), ''), 'Membro'), b.created_at
    from public.usuarios_bloqueados b
    left join public.profiles p on p.id = b.bloqueado_id
   where b.bloqueador_id = auth.uid()
   order by b.created_at desc;
$$;
revoke all on function public.meus_bloqueados() from public, anon;
grant execute on function public.meus_bloqueados() to authenticated;

-- A Apple pede que o desenvolvedor fique sabendo do bloqueio.
create or replace function public.bloqueio_avisa_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_quem text; v_bloq text;
begin
  select coalesce(nullif(trim(full_name), ''), 'Alguém') into v_quem from public.profiles where id = new.bloqueador_id;
  select coalesce(nullif(trim(full_name), ''), 'um membro') into v_bloq from public.profiles where id = new.bloqueado_id;
  perform public.notificar_admins('⛔ Bloqueio no chat',
    coalesce(v_quem, 'Alguém') || ' bloqueou ' || coalesce(v_bloq, 'um membro') || '.',
    jsonb_build_object('type', 'admin_denuncia'));
  return new;
end;
$$;
drop trigger if exists bloqueio_avisa_admin_trg on public.usuarios_bloqueados;
create trigger bloqueio_avisa_admin_trg
  after insert on public.usuarios_bloqueados
  for each row execute function public.bloqueio_avisa_admin();


-- ─── 4. Suspensao vale para todos os chats ──────────────────────────────────
create or replace function public.estou_suspenso_dos_chats()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.chat_geral_silenciados s where s.user_id = auth.uid());
$$;
revoke all on function public.estou_suspenso_dos_chats() from public, anon;
grant execute on function public.estou_suspenso_dos_chats() to authenticated;

drop policy if exists "suspenso nao escreve" on public.grupo_chat_mensagens;
create policy "suspenso nao escreve"
  on public.grupo_chat_mensagens as restrictive for insert to authenticated
  with check (not public.estou_suspenso_dos_chats());

drop policy if exists "suspenso nao escreve" on public.banda_chat_mensagens;
create policy "suspenso nao escreve"
  on public.banda_chat_mensagens as restrictive for insert to authenticated
  with check (not public.estou_suspenso_dos_chats());

-- Lista para o Painel Admin (nome de quem esta suspenso).
create or replace function public.chat_suspensos()
returns table (user_id uuid, nome text, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, coalesce(nullif(trim(p.full_name), ''), 'Membro'), s.created_at
    from public.chat_geral_silenciados s
    left join public.profiles p on p.id = s.user_id
   where public.is_admin()
   order by s.created_at desc;
$$;
revoke all on function public.chat_suspensos() from public, anon;
grant execute on function public.chat_suspensos() to authenticated;


-- ─── 5. Aceite das Regras da comunidade ─────────────────────────────────────
create table if not exists public.aceite_regras_chat (
  user_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  versao    integer not null default 1,
  aceito_em timestamptz not null default now()
);
alter table public.aceite_regras_chat enable row level security;

drop policy if exists "regras: o proprio e o admin leem" on public.aceite_regras_chat;
create policy "regras: o proprio e o admin leem"
  on public.aceite_regras_chat for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "regras: o proprio aceita" on public.aceite_regras_chat;
create policy "regras: o proprio aceita"
  on public.aceite_regras_chat for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "regras: o proprio atualiza" on public.aceite_regras_chat;
create policy "regras: o proprio atualiza"
  on public.aceite_regras_chat for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ─── 6. Autorizacao de fotos da crianca ─────────────────────────────────────
-- null = o responsavel ainda nao respondeu (a sala trata como NAO autorizado).
alter table public.members
  add column if not exists autoriza_fotos boolean,
  add column if not exists autoriza_fotos_em timestamptz;

comment on column public.members.autoriza_fotos is
  'Resposta do responsavel: autoriza fotos/videos da crianca nas atividades da '
  'igreja e no chat do Ministerio Infantil? null = nao respondeu (tratar como nao).';

-- Data da resposta: gravada pelo banco quando o valor muda.
create or replace function public.members_data_autoriza_fotos()
returns trigger
language plpgsql
as $$
begin
  if new.autoriza_fotos is distinct from (case when tg_op = 'UPDATE' then old.autoriza_fotos else null end) then
    new.autoriza_fotos_em := case when new.autoriza_fotos is null then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists members_data_autoriza_fotos_trg on public.members;
create trigger members_data_autoriza_fotos_trg
  before insert or update of autoriza_fotos on public.members
  for each row execute function public.members_data_autoriza_fotos();

-- A Ficha da sala passa a mostrar a autorizacao. Mudou o retorno: drop antes.
drop function if exists public.ficha_seguranca_sala(text);
create function public.ficha_seguranca_sala(p_grupo text)
returns table (
  id uuid,
  nome text,
  sobrenome text,
  data_nascimento date,
  alergias text,
  necessidades_especiais text,
  info_responsavel text,
  responsavel_nome text,
  autoriza_fotos boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.id,
    m.nome,
    coalesce(m.sobrenome, ''),
    m.data_nascimento,
    m.alergias,
    m.necessidades_especiais,
    m.info_responsavel,
    coalesce(r.nome || coalesce(' ' || r.sobrenome, ''), ''),
    m.autoriza_fotos
  from public.members m
  join public.members r on r.id = m.responsavel_id
  where p_grupo = 'infantil'
    and (public.is_admin() or public.is_grupo_leader(p_grupo))
    and (m.data_nascimento is null or m.data_nascimento > (current_date - interval '13 years'))
  order by m.nome;
$$;
revoke all on function public.ficha_seguranca_sala(text) from public, anon;
grant execute on function public.ficha_seguranca_sala(text) to authenticated;


-- ─── Conferencia ────────────────────────────────────────────────────────────
select tablename, policyname, cmd, permissive
  from pg_policies
 where tablename in ('chat_denuncias', 'usuarios_bloqueados', 'aceite_regras_chat')
    or policyname in ('bloqueio esconde mensagens', 'suspenso nao escreve')
 order by 1, 2;
