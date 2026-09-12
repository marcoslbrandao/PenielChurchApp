-- ============================================================================
-- Correções de segurança — auditoria de 8/9 Set 2026
--
-- Achados desta migração, em ordem de gravidade. Os quatro primeiros são
-- CRÍTICOS: qualquer pessoa com a chave anônima (que está dentro do app, e
-- se extrai de um .ipa/.apk em minutos) conseguia explorá-los hoje.
--
--  1. ESCALADA A ADMIN. A policy de update de `profiles` prende a LINHA
--     (`auth.uid() = id`) mas não as COLUNAS — e `role` está nessa linha.
--     Um PATCH em /rest/v1/profiles com {"role":"admin"} promovia qualquer
--     conta a administrador, destravando o diretório inteiro de membros,
--     os pedidos de oração, as ofertas e a Área da Banda. Isso anulava na
--     prática toda a migração de permissões de ontem.
--  2. CONVITES LEGÍVEIS POR QUALQUER UM. A policy "Usuário pode verificar
--     código" liberava SELECT em `invite_codes` para todo autenticado. Um
--     GET listava os códigos não usados: era só escolher um de tipo membro
--     (ou banda) e se auto-promover. Caminho independente do item 1.
--  3. `push_tokens` SEM RLS. A tabela nunca teve `enable row level
--     security` em migração nenhuma. Um GET devolvia a lista completa de
--     tokens Expo da congregação — e um token Expo é credencial portadora:
--     com ele se manda push arbitrário, sem autenticação, para o celular da
--     pessoa, com a cara do app da igreja.
--  4. NOME FORJADO NO CHAT. As policies dos três chats amarram `autor_id`
--     mas `autor_nome` é texto livre vindo do cliente. Dava para postar
--     assinando "Pastor Marcos" — e, desde a migração das notificações de
--     ontem, essa mensagem forjada ainda virava PUSH para o grupo inteiro.
--
-- Também aqui: proteção das observações internas da liderança, trava de
-- corrida no resgate de convite, e a RPC que devolve os nomes da Escala
-- Geral (que ficaram em branco quando o diretório fechou para não-admin).
--
-- NADA AQUI RODA SOZINHO. Revise e aplique com `npx supabase db push`.
-- ============================================================================


-- ─── 1. Ninguém se promove a admin ────────────────────────────────────────
-- Um trigger, e não `revoke update (colunas)`, de propósito: a lista de
-- colunas do `grant` precisaria ser mantida à mão a cada campo novo do
-- perfil, e esquecer um quebra a edição do perfil em produção sem avisar.
--
-- `current_user` é o que separa os dois caminhos: numa requisição normal do
-- app via PostgREST ele é `authenticated`; dentro de uma função SECURITY
-- DEFINER (como `use_invite_code`, que promove a pessoa a membro de forma
-- legítima) ele é o dono da função. Só o primeiro caso é barrado.
create or replace function public.profiles_bloqueia_escalada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user = 'authenticated'
     and (new.role is distinct from old.role
          or new.banda_acesso is distinct from old.banda_acesso)
     and not public.is_admin()
  then
    raise exception 'Alteração de papel ou de acesso não é permitida por aqui.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_bloqueia_escalada_trg on public.profiles;
create trigger profiles_bloqueia_escalada_trg
  before update on public.profiles
  for each row execute function public.profiles_bloqueia_escalada();


-- ─── 2. Códigos de convite deixam de ser legíveis ─────────────────────────
-- Esta policy sobreviveu à migração de ontem (que só derrubou a de escrita).
-- Nenhuma tela do app precisa dela: o resgate acontece dentro da função
-- `use_invite_code`, que roda como owner, e a listagem no painel é de admin.
drop policy if exists "Usuário pode verificar código" on public.invite_codes;

-- Se um dia a tela quiser dizer "código válido" antes de resgatar, use isto
-- em vez de reabrir a tabela: responde sim/não sem revelar código nenhum.
create or replace function public.verificar_codigo(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invite_codes
    where code = upper(btrim(p_code))
      and is_used = false
      and (expires_at is null or expires_at > now())
  );
$$;
revoke all on function public.verificar_codigo(text) from public;
grant execute on function public.verificar_codigo(text) to authenticated;


-- ─── 3. RLS em push_tokens ────────────────────────────────────────────────
-- O UPDATE usa `using (true)` de propósito: o app faz upsert com
-- `onConflict: 'token'`, e um aparelho que troca de dono precisa poder
-- reatribuir a própria linha para a conta nova. Quem não consegue mais LER
-- a tabela não descobre tokens alheios para tentar isso.
alter table public.push_tokens enable row level security;

drop policy if exists "Usuário vê os próprios tokens" on public.push_tokens;
create policy "Usuário vê os próprios tokens"
  on public.push_tokens for select
  using (user_id = auth.uid());

drop policy if exists "Usuário registra o próprio token" on public.push_tokens;
create policy "Usuário registra o próprio token"
  on public.push_tokens for insert
  with check (user_id = auth.uid());

drop policy if exists "Aparelho reatribui o token para a conta atual" on public.push_tokens;
create policy "Aparelho reatribui o token para a conta atual"
  on public.push_tokens for update
  using (true)
  with check (user_id = auth.uid());

drop policy if exists "Usuário apaga os próprios tokens" on public.push_tokens;
create policy "Usuário apaga os próprios tokens"
  on public.push_tokens for delete
  using (user_id = auth.uid());


-- ─── 4. O servidor decide quem assina cada mensagem ───────────────────────
-- Vale para os três chats. O padrão certo já existia no projeto —
-- `registra_escala_log` (20260902190100) busca o nome pelo auth.uid() em vez
-- de aceitar do cliente; faltava aplicar aqui.
create or replace function public.forca_autor_da_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_nome text;
begin
  new.autor_id := auth.uid();
  select coalesce(nullif(btrim(full_name), ''), 'Membro')
    into v_nome
    from public.profiles
   where id = auth.uid();
  new.autor_nome := coalesce(v_nome, 'Membro');
  return new;
end;
$$;

drop trigger if exists grupo_chat_forca_autor on public.grupo_chat_mensagens;
create trigger grupo_chat_forca_autor
  before insert on public.grupo_chat_mensagens
  for each row execute function public.forca_autor_da_mensagem();

drop trigger if exists banda_chat_forca_autor on public.banda_chat_mensagens;
create trigger banda_chat_forca_autor
  before insert on public.banda_chat_mensagens
  for each row execute function public.forca_autor_da_mensagem();

drop trigger if exists culto_comentarios_forca_autor on public.culto_comentarios;
create trigger culto_comentarios_forca_autor
  before insert on public.culto_comentarios
  for each row execute function public.forca_autor_da_mensagem();

-- E a notificação do chat deixa de ecoar o texto da mensagem no push. Mesmo
-- com o nome agora garantido, o corpo continua sendo texto de terceiro
-- chegando na tela de bloqueio de todo o grupo — não precisa.
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
    if exists (
      select 1 from public.avisos a
      where a.grupo = v_grupo
        and a.origem = 'chat'
        and a.created_at > now() - interval '60 minutes'
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


-- ─── 5. Observações internas da liderança ficam com a liderança ───────────
-- `members.observacoes` são as notas internas sobre a pessoa (a própria
-- migração 20260821100000 as descreve assim). A policy de auto-edição é por
-- linha, então o membro podia sobrescrevê-las — e a tela Meu Cadastro fazia
-- exatamente isso sem querer, devolvendo no UPDATE tudo que tinha lido com
-- `select('*')`. O trigger devolve os campos da liderança ao valor antigo.
create or replace function public.members_protege_campos_da_lideranca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    new.observacoes := old.observacoes;
    new.status      := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists members_protege_campos_trg on public.members;
create trigger members_protege_campos_trg
  before update on public.members
  for each row execute function public.members_protege_campos_da_lideranca();


-- ─── 6. Trava de corrida no resgate de convite ────────────────────────────
-- Sem `for update`, dois pedidos simultâneos com o mesmo código passavam os
-- dois pelo `is_used = false` antes de qualquer um gravar. `use_banda_code`
-- já fazia certo desde 20260728110000; esta ficou para trás.
create or replace function public.use_invite_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invite_codes%rowtype;
  v_user_id uuid := auth.uid();
  v_full_name text;
  v_email text;
  v_primeiro_nome text;
  v_existing_id uuid;
begin
  if v_user_id is null then
    return json_build_object('success', false, 'error', 'Sessão inválida.');
  end if;
  if btrim(coalesce(p_code, '')) = '' then
    return json_build_object('success', false, 'error', 'Código inválido ou expirado.');
  end if;

  select * into v_invite
  from public.invite_codes
  where code = upper(btrim(p_code))
    and is_used = false
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    return json_build_object('success', false, 'error', 'Código inválido ou expirado.');
  end if;

  update public.invite_codes
  set is_used = true, used_by = v_user_id, used_at = now()
  where id = v_invite.id;

  update public.profiles
  set role = 'membro'
  where id = v_user_id;

  select id into v_existing_id from public.members where profile_id = v_user_id;

  if v_existing_id is null then
    select p.full_name, u.email into v_full_name, v_email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = v_user_id;

    select id into v_existing_id from public.members
    where profile_id is null and email is not null and lower(email) = lower(v_email)
    limit 1;

    if v_existing_id is not null then
      update public.members set profile_id = v_user_id where id = v_existing_id;
    else
      v_primeiro_nome := split_part(coalesce(v_full_name, 'Membro'), ' ', 1);
      insert into public.members (nome, sobrenome, email, status, profile_id, membro_desde)
      values (
        v_primeiro_nome,
        trim(substring(coalesce(v_full_name, '') from length(v_primeiro_nome) + 1)),
        v_email,
        'membro',
        v_user_id,
        current_date
      );
    end if;
  end if;

  return json_build_object('success', true);
end;
$$;

grant execute on function public.use_invite_code(text) to authenticated;


-- ─── 7. Escala Geral volta a mostrar os nomes ─────────────────────────────
-- Efeito colateral de fechar o diretório: a tela Escalas lia
-- `escala_designacoes` com um embed `members(nome, sobrenome)`, e esse embed
-- passa pela RLS de `members` — para quem não é admin, voltava `null` em
-- toda linha que não fosse a dele. A tela ficava com a coluna da pessoa em
-- branco, sem erro nenhum. Mesma solução das outras quatro RPCs de ontem:
-- devolve só o nome, com a permissão checada aqui dentro.
create or replace function public.escala_proximas_designacoes()
returns table (
  id uuid,
  data date,
  area_id uuid,
  area_nome text,
  membro_id uuid,
  nome text,
  sobrenome text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.data, d.area_id, a.nome, d.membro_id, m.nome, m.sobrenome
  from public.escala_designacoes d
  join public.escala_areas a on a.id = d.area_id
  join public.members m on m.id = d.membro_id
  where auth.uid() is not null
    and d.data >= current_date
  order by d.data, a.nome, m.nome;
$$;
revoke all on function public.escala_proximas_designacoes() from public;
grant execute on function public.escala_proximas_designacoes() to authenticated;


-- ─── 8. Conferência obrigatória depois de aplicar ─────────────────────────
-- (a) Nenhuma conta comum deve conseguir se promover. Entrando com uma conta
--     de teste no SQL Editor não dá para simular; teste pelo app ou por curl
--     com a anon key + o access_token da conta:
--       PATCH /rest/v1/profiles?id=eq.<uuid> {"role":"admin"}   → deve dar 403/erro
--
-- (b) Tabelas sem RLS ligado — trate qualquer `false` como incidente:
--       select c.relname, c.relrowsecurity as rls_ligado,
--              (select count(*) from pg_policies p
--                where p.schemaname='public' and p.tablename=c.relname) as policies
--       from pg_class c join pg_namespace n on n.oid=c.relnamespace
--       where n.nspname='public' and c.relkind='r'
--       order by c.relrowsecurity, c.relname;
--
--     Atenção especial a `avisos`, `devocionais`, `songs`, `cultos` e
--     `culto_songs`: elas nasceram fora do controle de versão e TÊM policies
--     escritas nas migrações, mas nenhuma migração liga o RLS delas. Policy
--     em tabela com RLS desligado é decorativa — o Postgres ignora. Se
--     `avisos` ou `devocionais` aparecerem com rls_ligado = false, todo o
--     conteúdo privado dos grupos está aberto, e isso é urgente.
