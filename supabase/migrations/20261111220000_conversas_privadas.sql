-- ============================================================================
-- Conversas privadas entre membros (pedido do Marcos, 11/11/2026)
--
-- Regras de produto (decididas pelo Marcos em 11/11/2026):
--   • Só MEMBROS conversam no privado (visitante não vê nem escreve) — na RLS.
--   • Mensagens somem em 15 dias, como os outros chats.
--   • O admin NÃO lê conversa privada; só o que for denunciado (a denúncia
--     guarda uma cópia do texto e do arquivo até ser resolvida).
--   • Adulto ↔ menor de 18 (pela data de nascimento da ficha) — "conversa
--     protegida":
--       - mensagens guardadas por 4 meses (não 15 dias);
--       - sem envio entre 22h e 7h (horário de Londres);
--       - os SUPERVISORES DE PROTEÇÃO (marcados pelo admin no painel) podem
--         ler, informando o motivo; cada leitura fica registrada;
--       - os responsáveis vinculados veem COM QUEM o filho conversa (nomes),
--         nunca o conteúdo.
--     Quem não informou a data de nascimento conta como "idade desconhecida"
--     e a conversa fica protegida (lado seguro). Para ABRIR uma conversa a
--     pessoa precisa ter a data na ficha (o app pede).
--   • Bloquear, denunciar, suspensão e regras da comunidade valem aqui também.
--   • Cada pessoa pode desligar "Receber mensagens privadas".
--   • Push com o nome e o início da mensagem, com a janela de 2 h dos outros
--     chats (só a mensagem que abre a conversa notifica).
--
-- Partes:
--   0. Preferência, idade e "par protegido"
--   1. conversas_privadas            (um par de pessoas = uma conversa)
--   2. conversa_mensagens            (+ regras de envio e horário)
--   3. conversa_reacoes / conversa_leituras
--   4. RPCs do app: abrir_conversa, minhas_conversas, membros_para_conversa,
--      conversa_marcar_lido, conversa_info_mensagem, minha_situacao_privadas,
--      definir_minha_data_nascimento, definir_aceita_privadas
--   5. Push
--   6. Bucket privado `chat-privado` + policies + arquivos órfãos
--   7. Denúncias ('privada')
--   8. Supervisores de proteção + registro de leituras
--   9. Vínculo responsável ↔ filho (código) e o que o responsável vê
--  10. Limpeza diária (15 dias / 4 meses)
--  11. Realtime
--
-- Pode rodar de novo sem estragar nada.
-- ============================================================================

begin;

-- ─── 0. Preferência, idade e "par protegido" ────────────────────────────────
alter table public.profiles
  add column if not exists aceita_privadas boolean not null default true;

-- Idade em anos completos, pela ficha da própria pessoa (members.profile_id é
-- único). NULL = sem data na ficha. Sem grant para o app: a idade de ninguém
-- sai do banco — só é usada aqui dentro.
create or replace function public.idade_da_conta(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select extract(year from age((now() at time zone 'Europe/London')::date, m.data_nascimento))::int
    from public.members m
   where m.profile_id = p_user
     and m.data_nascimento is not null
   limit 1;
$$;
revoke all on function public.idade_da_conta(uuid) from public, anon, authenticated;

-- Protegida = adulto com menor, ou alguém com idade desconhecida. Dois
-- adultos ou dois menores conversam com as regras normais.
create or replace function public.par_protegido(p_a uuid, p_b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare ia int := public.idade_da_conta(p_a); ib int := public.idade_da_conta(p_b);
begin
  if ia is null or ib is null then return true; end if;
  if ia >= 18 and ib >= 18 then return false; end if;
  if ia < 18 and ib < 18 then return false; end if;
  return true;
end;
$$;
revoke all on function public.par_protegido(uuid, uuid) from public, anon, authenticated;

create or replace function public.eh_membro_conta(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles
                  where id = p_user and coalesce(role, 'visitante') <> 'visitante');
$$;
revoke all on function public.eh_membro_conta(uuid) from public, anon, authenticated;

-- Bloqueio em qualquer direção entre duas pessoas.
create or replace function public.bloqueio_entre(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios_bloqueados b
                  where (b.bloqueador_id = p_a and b.bloqueado_id = p_b)
                     or (b.bloqueador_id = p_b and b.bloqueado_id = p_a));
$$;
revoke all on function public.bloqueio_entre(uuid, uuid) from public, anon, authenticated;


-- ─── 1. Conversas ───────────────────────────────────────────────────────────
-- Um par = uma conversa. user_a < user_b para o par não existir duas vezes.
create table if not exists public.conversas_privadas (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references auth.users(id) on delete cascade,
  user_b     uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  ultima_em  timestamptz not null default now(),
  constraint conversas_privadas_ordem check (user_a < user_b),
  constraint conversas_privadas_par unique (user_a, user_b)
);
create index if not exists conversas_privadas_b_idx on public.conversas_privadas (user_b);

alter table public.conversas_privadas enable row level security;

-- Só os dois enxergam. Criar só por abrir_conversa(); ninguém edita.
drop policy if exists "conversas: os dois leem" on public.conversas_privadas;
create policy "conversas: os dois leem"
  on public.conversas_privadas for select to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

create or replace function public.participo_da_conversa(p_conversa uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.conversas_privadas c
                  where c.id = p_conversa and auth.uid() in (c.user_a, c.user_b));
$$;
revoke all on function public.participo_da_conversa(uuid) from public, anon;
grant execute on function public.participo_da_conversa(uuid) to authenticated;

-- Versão para o Storage: a pasta é texto e pode não ser um uuid.
create or replace function public.participo_da_conversa_txt(p_pasta text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_pasta !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.participo_da_conversa(p_pasta::uuid);
end;
$$;
revoke all on function public.participo_da_conversa_txt(text) from public, anon;
grant execute on function public.participo_da_conversa_txt(text) to authenticated;

-- O outro participante (para quem estou falando).
create or replace function public.outro_da_conversa(p_conversa uuid, p_eu uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when c.user_a = p_eu then c.user_b else c.user_a end
    from public.conversas_privadas c where c.id = p_conversa;
$$;
revoke all on function public.outro_da_conversa(uuid, uuid) from public, anon, authenticated;


-- ─── 2. Mensagens ───────────────────────────────────────────────────────────
-- Mesmo formato do Chat da Igreja (a tela é a mesma), mais a conversa e a
-- marca `protegida` (gravada no envio: decide o tempo de guarda e quem
-- supervisiona, mesmo que alguém faça 18 anos depois).
create table if not exists public.conversa_mensagens (
  id            uuid primary key default gen_random_uuid(),
  conversa_id   uuid not null references public.conversas_privadas(id) on delete cascade,
  autor_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  autor_nome    text not null default 'Membro',
  tipo          text not null default 'texto',
  texto         text not null default '',
  midia_path    text,
  midia_largura integer,
  midia_altura  integer,
  duracao_ms    integer,
  midia_nome    text,
  midia_tamanho bigint,
  midia_mime    text,
  resposta_a    uuid references public.conversa_mensagens(id) on delete set null,
  protegida     boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists conversa_mensagens_conversa_idx
  on public.conversa_mensagens (conversa_id, created_at desc);
create index if not exists conversa_mensagens_midia_idx
  on public.conversa_mensagens (midia_path) where midia_path is not null;
create index if not exists conversa_mensagens_limpeza_idx
  on public.conversa_mensagens (protegida, created_at);

alter table public.conversa_mensagens drop constraint if exists conversa_mensagens_tipo_check;
alter table public.conversa_mensagens add constraint conversa_mensagens_tipo_check
  check (tipo in ('texto', 'imagem', 'audio', 'video', 'arquivo'));

-- Arquivo sempre em `<conversa>/<autor>/<uuid>.<ext>` (o autor já foi forçado
-- pelo gatilho quando este check roda). Limites iguais aos do Chat da Igreja.
alter table public.conversa_mensagens drop constraint if exists conversa_mensagens_conteudo_check;
alter table public.conversa_mensagens add constraint conversa_mensagens_conteudo_check
  check (
    char_length(texto) <= 2000 and
    case tipo
      when 'texto' then
        midia_path is null and char_length(btrim(texto)) > 0
      when 'imagem' then
        midia_path ~ ('^' || conversa_id::text || '/' || autor_id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|heic)$')
      when 'audio' then
        midia_path ~ ('^' || conversa_id::text || '/' || autor_id::text || '/[0-9a-f-]{36}\.m4a$')
        and duracao_ms between 1 and 610000
      when 'video' then
        midia_path ~ ('^' || conversa_id::text || '/' || autor_id::text || '/[0-9a-f-]{36}\.(mp4|mov)$')
        and duracao_ms between 1 and 305000
      when 'arquivo' then
        midia_path ~ ('^' || conversa_id::text || '/' || autor_id::text || '/[0-9a-f-]{36}\.(mp3|m4a|wav|aac|ogg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip)$')
        and char_length(btrim(coalesce(midia_nome, ''))) between 1 and 200
        and midia_tamanho between 1 and 52428800
        and midia_mime is not null
        and (duracao_ms is null or duracao_ms >= 1)
      else false
    end
  );

-- Autor e nome vêm do servidor (mesma função dos outros chats). O nome do
-- gatilho começa com "a_" para rodar ANTES das regras (ordem alfabética).
drop trigger if exists a_conversa_forca_autor on public.conversa_mensagens;
create trigger a_conversa_forca_autor
  before insert on public.conversa_mensagens
  for each row execute function public.forca_autor_da_mensagem();

-- Regras de envio. As mensagens de erro começam com "peniel_" para o app
-- traduzir (lib/conversas.ts).
create or replace function public.conversa_regras_de_envio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outro uuid;
  v_hora  int;
begin
  if not public.participo_da_conversa(new.conversa_id) then
    raise exception 'peniel_sem_acesso';
  end if;
  v_outro := public.outro_da_conversa(new.conversa_id, new.autor_id);
  if not public.eh_membro_conta(new.autor_id) or not public.eh_membro_conta(v_outro) then
    raise exception 'peniel_sem_acesso';
  end if;
  if public.estou_suspenso_dos_chats() then
    raise exception 'peniel_suspenso';
  end if;
  if public.bloqueio_entre(new.autor_id, v_outro) then
    raise exception 'peniel_bloqueado';
  end if;
  if not coalesce((select aceita_privadas from public.profiles where id = v_outro), true) then
    raise exception 'peniel_nao_aceita';
  end if;

  new.protegida := public.par_protegido(new.autor_id, v_outro);
  if new.protegida then
    v_hora := extract(hour from (now() at time zone 'Europe/London'))::int;
    if v_hora >= 22 or v_hora < 7 then
      raise exception 'peniel_fora_do_horario';
    end if;
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists b_conversa_regras on public.conversa_mensagens;
create trigger b_conversa_regras
  before insert on public.conversa_mensagens
  for each row execute function public.conversa_regras_de_envio();

-- Nada de editar mensagem (como nos outros chats).
alter table public.conversa_mensagens enable row level security;

drop policy if exists "conversa: os dois leem" on public.conversa_mensagens;
create policy "conversa: os dois leem"
  on public.conversa_mensagens for select to authenticated
  using (public.participo_da_conversa(conversa_id));

drop policy if exists "bloqueio esconde mensagens" on public.conversa_mensagens;
create policy "bloqueio esconde mensagens"
  on public.conversa_mensagens as restrictive for select to authenticated
  using (not public.eu_bloqueei(autor_id));

drop policy if exists "conversa: membro escreve" on public.conversa_mensagens;
create policy "conversa: membro escreve"
  on public.conversa_mensagens for insert to authenticated
  with check (autor_id = auth.uid() and public.is_membro() and public.participo_da_conversa(conversa_id));

drop policy if exists "conversa: autor apaga" on public.conversa_mensagens;
create policy "conversa: autor apaga"
  on public.conversa_mensagens for delete to authenticated
  using (autor_id = auth.uid());

-- A conversa sobe na lista a cada mensagem.
create or replace function public.conversa_atualiza_ultima()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversas_privadas set ultima_em = new.created_at where id = new.conversa_id;
  return new;
end;
$$;
drop trigger if exists conversa_atualiza_ultima_trg on public.conversa_mensagens;
create trigger conversa_atualiza_ultima_trg
  after insert on public.conversa_mensagens
  for each row execute function public.conversa_atualiza_ultima();


-- ─── 3. Reações e leituras ──────────────────────────────────────────────────
create or replace function public.participo_da_mensagem(p_mensagem uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.conversa_mensagens m
                   join public.conversas_privadas c on c.id = m.conversa_id
                  where m.id = p_mensagem and auth.uid() in (c.user_a, c.user_b));
$$;
revoke all on function public.participo_da_mensagem(uuid) from public, anon;
grant execute on function public.participo_da_mensagem(uuid) to authenticated;

create table if not exists public.conversa_reacoes (
  mensagem_id uuid not null references public.conversa_mensagens(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji       text not null check (char_length(emoji) between 1 and 16),
  created_at  timestamptz not null default now(),
  primary key (mensagem_id, user_id)
);
alter table public.conversa_reacoes enable row level security;

drop policy if exists "conversa reacoes: os dois leem" on public.conversa_reacoes;
create policy "conversa reacoes: os dois leem"
  on public.conversa_reacoes for select to authenticated
  using (public.participo_da_mensagem(mensagem_id));

drop policy if exists "conversa reacoes: reage" on public.conversa_reacoes;
create policy "conversa reacoes: reage"
  on public.conversa_reacoes for insert to authenticated
  with check (user_id = auth.uid() and public.is_membro() and public.participo_da_mensagem(mensagem_id));

drop policy if exists "conversa reacoes: troca a sua" on public.conversa_reacoes;
create policy "conversa reacoes: troca a sua"
  on public.conversa_reacoes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.participo_da_mensagem(mensagem_id));

drop policy if exists "conversa reacoes: tira a sua" on public.conversa_reacoes;
create policy "conversa reacoes: tira a sua"
  on public.conversa_reacoes for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.conversa_leituras (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversa_id uuid not null references public.conversas_privadas(id) on delete cascade,
  lida_em     timestamptz not null default now(),
  primary key (user_id, conversa_id)
);
alter table public.conversa_leituras enable row level security;

drop policy if exists "conversa leituras: so a propria" on public.conversa_leituras;
create policy "conversa leituras: so a propria"
  on public.conversa_leituras for select to authenticated
  using (user_id = auth.uid());


-- ─── 4. RPCs do app ─────────────────────────────────────────────────────────

-- Abre (ou reabre) a conversa com alguém. Devolve { status, conversa_id }.
-- status: ok | sem_acesso | propria | nao_membro | sem_nascimento |
--         bloqueado | nao_aceita
create or replace function public.abrir_conversa(p_outro uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eu uuid := auth.uid();
  v_a uuid; v_b uuid; v_id uuid;
begin
  if v_eu is null or not public.is_membro() then
    return jsonb_build_object('status', 'sem_acesso');
  end if;
  if p_outro is null or p_outro = v_eu then
    return jsonb_build_object('status', 'propria');
  end if;
  if not public.eh_membro_conta(p_outro) then
    return jsonb_build_object('status', 'nao_membro');
  end if;
  if public.idade_da_conta(v_eu) is null then
    return jsonb_build_object('status', 'sem_nascimento');
  end if;
  if public.bloqueio_entre(v_eu, p_outro) then
    return jsonb_build_object('status', 'bloqueado');
  end if;

  v_a := least(v_eu, p_outro); v_b := greatest(v_eu, p_outro);
  select id into v_id from public.conversas_privadas where user_a = v_a and user_b = v_b;
  if v_id is null then
    if not coalesce((select aceita_privadas from public.profiles where id = p_outro), true) then
      return jsonb_build_object('status', 'nao_aceita');
    end if;
    insert into public.conversas_privadas (user_a, user_b) values (v_a, v_b)
    on conflict (user_a, user_b) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.conversas_privadas where user_a = v_a and user_b = v_b;
    end if;
  end if;
  return jsonb_build_object('status', 'ok', 'conversa_id', v_id,
                            'protegida', public.par_protegido(v_eu, p_outro));
end;
$$;
revoke all on function public.abrir_conversa(uuid) from public, anon;
grant execute on function public.abrir_conversa(uuid) to authenticated;

-- Lista da aba Conversas: as minhas, da mais recente para a mais antiga.
-- Conversa vazia só aparece no dia em que foi aberta.
create or replace function public.minhas_conversas()
returns table (
  conversa_id   uuid,
  outro_id      uuid,
  outro_nome    text,
  outro_foto    text,
  ultima_tipo   text,
  ultima_texto  text,
  ultima_minha  boolean,
  ultima_em     timestamptz,
  nao_lidas     integer,
  protegida     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with minhas as (
    select c.id, case when c.user_a = auth.uid() then c.user_b else c.user_a end as outro, c.created_at, c.ultima_em
      from public.conversas_privadas c
     where auth.uid() in (c.user_a, c.user_b)
       and public.is_membro()
  )
  select
    mi.id,
    mi.outro,
    coalesce(nullif(btrim(p.full_name), ''), 'Membro'),
    p.avatar_url,
    u.tipo,
    u.texto,
    u.autor_id = auth.uid(),
    coalesce(u.created_at, mi.created_at),
    (select count(*)::int from public.conversa_mensagens m
      where m.conversa_id = mi.id
        and m.autor_id <> auth.uid()
        and not public.eu_bloqueei(m.autor_id)
        and m.created_at > coalesce((select l.lida_em from public.conversa_leituras l
                                       where l.user_id = auth.uid() and l.conversa_id = mi.id), 'epoch'::timestamptz)),
    public.par_protegido(auth.uid(), mi.outro)
  from minhas mi
  left join public.profiles p on p.id = mi.outro
  left join lateral (
    select m.tipo, m.texto, m.autor_id, m.created_at
      from public.conversa_mensagens m
     where m.conversa_id = mi.id and not public.eu_bloqueei(m.autor_id)
     order by m.created_at desc
     limit 1
  ) u on true
  where u.created_at is not null or mi.created_at > now() - interval '1 day'
  order by coalesce(u.created_at, mi.created_at) desc;
$$;
revoke all on function public.minhas_conversas() from public, anon;
grant execute on function public.minhas_conversas() to authenticated;

-- Total de não lidas (ícone da Home).
create or replace function public.conversas_nao_lidas()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(nao_lidas), 0)::int from public.minhas_conversas();
$$;
revoke all on function public.conversas_nao_lidas() from public, anon;
grant execute on function public.conversas_nao_lidas() to authenticated;

-- Para "Nova conversa": membros que aceitam privadas, sem bloqueio.
create or replace function public.membros_para_conversa(p_busca text default null)
returns table (user_id uuid, nome text, foto text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Membro'), p.avatar_url
    from public.profiles p
   where public.is_membro()
     and p.id <> auth.uid()
     and coalesce(p.role, 'visitante') <> 'visitante'
     and coalesce(p.aceita_privadas, true)
     and not public.bloqueio_entre(auth.uid(), p.id)
     and nullif(btrim(p.full_name), '') is not null
     and (p_busca is null or btrim(p_busca) = '' or p.full_name ilike '%' || btrim(p_busca) || '%')
   order by p.full_name
   limit 200;
$$;
revoke all on function public.membros_para_conversa(text) from public, anon;
grant execute on function public.membros_para_conversa(text) to authenticated;

create or replace function public.conversa_marcar_lido(p_conversa uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.participo_da_conversa(p_conversa) then return; end if;
  insert into public.conversa_leituras (user_id, conversa_id, lida_em)
  values (auth.uid(), p_conversa, now())
  on conflict (user_id, conversa_id) do update set lida_em = excluded.lida_em;
end;
$$;
revoke all on function public.conversa_marcar_lido(uuid) from public, anon;
grant execute on function public.conversa_marcar_lido(uuid) to authenticated;

-- Reações e "visto" de uma mensagem (mesmo formato de chat_info_mensagem).
create or replace function public.conversa_info_mensagem(p_mensagem uuid)
returns table (tipo text, user_id uuid, nome text, emoji text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_autor uuid; v_criada timestamptz; v_conversa uuid;
begin
  select m.autor_id, m.created_at, m.conversa_id into v_autor, v_criada, v_conversa
    from public.conversa_mensagens m where m.id = p_mensagem;
  if v_autor is null or not public.participo_da_conversa(v_conversa) then return; end if;

  return query
    select 'reacao'::text, r.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Membro'), r.emoji
      from public.conversa_reacoes r
      left join public.profiles p on p.id = r.user_id
     where r.mensagem_id = p_mensagem
     order by r.created_at;

  if auth.uid() = v_autor then
    return query
      select 'visto'::text, l.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Membro'), null::text
        from public.conversa_leituras l
        join public.profiles p on p.id = l.user_id
       where l.conversa_id = v_conversa
         and l.lida_em >= v_criada
         and l.user_id <> v_autor;
  end if;
end;
$$;
revoke all on function public.conversa_info_mensagem(uuid) from public, anon;
grant execute on function public.conversa_info_mensagem(uuid) to authenticated;

-- O que o app precisa saber de mim para a aba Conversas (sem expor idade).
create or replace function public.minha_situacao_privadas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_idade int := public.idade_da_conta(auth.uid());
begin
  if auth.uid() is null then return null; end if;
  return jsonb_build_object(
    'membro', public.is_membro(),
    'aceita', coalesce((select aceita_privadas from public.profiles where id = auth.uid()), true),
    'tem_nascimento', v_idade is not null,
    'menor', coalesce(v_idade < 18, false),
    'supervisor', public.is_supervisor_protecao(),
    'responsaveis', coalesce((
      select jsonb_agg(coalesce(nullif(btrim(p.full_name), ''), 'Membro') order by p.full_name)
        from public.vinculos_responsavel v
        join public.profiles p on p.id = v.responsavel_id
       where v.filho_id = auth.uid()), '[]'::jsonb),
    'tem_filhos_vinculados', exists (select 1 from public.vinculos_responsavel v where v.responsavel_id = auth.uid())
  );
end;
$$;

-- Data de nascimento que falta na ficha (o app pede antes da 1ª conversa).
-- Só preenche se estiver vazia: corrigir uma data errada continua sendo com
-- a secretaria / Meu cadastro.
create or replace function public.definir_minha_data_nascimento(p_data date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth.uid() is null then return 'sem_acesso'; end if;
  if p_data is null or p_data > (now() at time zone 'Europe/London')::date - interval '5 years'
     or p_data < date '1900-01-01' then
    return 'data_invalida';
  end if;
  update public.members set data_nascimento = p_data
   where profile_id = auth.uid() and data_nascimento is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    if exists (select 1 from public.members where profile_id = auth.uid()) then return 'ja_tinha'; end if;
    return 'sem_ficha';
  end if;
  return 'ok';
end;
$$;
revoke all on function public.definir_minha_data_nascimento(date) from public, anon;
grant execute on function public.definir_minha_data_nascimento(date) to authenticated;

create or replace function public.definir_aceita_privadas(p_aceita boolean)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.profiles set aceita_privadas = coalesce(p_aceita, true) where id = auth.uid();
$$;
revoke all on function public.definir_aceita_privadas(boolean) from public, anon;
grant execute on function public.definir_aceita_privadas(boolean) to authenticated;


-- ─── 5. Push ────────────────────────────────────────────────────────────────
-- Para o outro participante, com o nome e o começo da mensagem. Mesma janela
-- dos outros chats: só notifica se a conversa estava parada há 2 h.
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
  if exists (select 1 from public.conversa_mensagens m
              where m.conversa_id = new.conversa_id
                and m.id <> new.id
                and m.created_at <= new.created_at
                and m.created_at >  new.created_at - public.chat_janela_silencio()) then
    return new;
  end if;

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
  -- Push nunca derruba o envio da mensagem.
  return new;
end;
$$;
drop trigger if exists conversa_push_trg on public.conversa_mensagens;
create trigger conversa_push_trg
  after insert on public.conversa_mensagens
  for each row execute function public.conversa_push();


-- ─── 8 (antes do Storage). Supervisores de proteção ─────────────────────────
create table if not exists public.supervisores_protecao (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  por        uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.supervisores_protecao enable row level security;

drop policy if exists "supervisores: admin e o proprio leem" on public.supervisores_protecao;
create policy "supervisores: admin e o proprio leem"
  on public.supervisores_protecao for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "supervisores: admin marca" on public.supervisores_protecao;
create policy "supervisores: admin marca"
  on public.supervisores_protecao for insert to authenticated
  with check (public.is_admin());

drop policy if exists "supervisores: admin tira" on public.supervisores_protecao;
create policy "supervisores: admin tira"
  on public.supervisores_protecao for delete to authenticated
  using (public.is_admin());

create or replace function public.is_supervisor_protecao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_membro()
     and exists (select 1 from public.supervisores_protecao s where s.user_id = auth.uid());
$$;
revoke all on function public.is_supervisor_protecao() from public, anon;
grant execute on function public.is_supervisor_protecao() to authenticated;

revoke all on function public.minha_situacao_privadas() from public, anon;
grant execute on function public.minha_situacao_privadas() to authenticated;

-- Registro de cada leitura feita por um supervisor.
create table if not exists public.supervisao_registro (
  id            uuid primary key default gen_random_uuid(),
  supervisor_id uuid references auth.users(id) on delete set null,
  conversa_id   uuid,
  nomes         text,
  motivo        text not null,
  created_at    timestamptz not null default now()
);
alter table public.supervisao_registro enable row level security;

drop policy if exists "supervisao registro: admin e supervisores leem" on public.supervisao_registro;
create policy "supervisao registro: admin e supervisores leem"
  on public.supervisao_registro for select to authenticated
  using (public.is_admin() or public.is_supervisor_protecao());

-- Lista para o painel Admin (marcar / tirar supervisores).
create or replace function public.supervisores_lista()
returns table (user_id uuid, nome text, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, coalesce(nullif(btrim(p.full_name), ''), 'Membro'), s.created_at
    from public.supervisores_protecao s
    left join public.profiles p on p.id = s.user_id
   where public.is_admin()
   order by p.full_name;
$$;
revoke all on function public.supervisores_lista() from public, anon;
grant execute on function public.supervisores_lista() to authenticated;

-- Conversas protegidas (só nomes e datas) para o supervisor escolher.
create or replace function public.supervisao_conversas()
returns table (conversa_id uuid, nome_a text, nome_b text, ultima_em timestamptz, mensagens integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         coalesce(nullif(btrim(pa.full_name), ''), 'Membro'),
         coalesce(nullif(btrim(pb.full_name), ''), 'Membro'),
         max(m.created_at),
         count(m.id)::int
    from public.conversas_privadas c
    join public.conversa_mensagens m on m.conversa_id = c.id and m.protegida
    left join public.profiles pa on pa.id = c.user_a
    left join public.profiles pb on pb.id = c.user_b
   where public.is_supervisor_protecao()
   group by c.id, pa.full_name, pb.full_name
   order by max(m.created_at) desc;
$$;
revoke all on function public.supervisao_conversas() from public, anon;
grant execute on function public.supervisao_conversas() to authenticated;

-- Ler uma conversa protegida: exige motivo, fica registrado e os admins são
-- avisados (sem o conteúdo).
create or replace function public.supervisao_ler(p_conversa uuid, p_motivo text)
returns table (id uuid, autor_id uuid, autor_nome text, tipo text, texto text, midia_path text,
               midia_nome text, duracao_ms integer, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_nomes text; v_quem text;
begin
  if not public.is_supervisor_protecao() then raise exception 'peniel_sem_acesso'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'peniel_motivo'; end if;
  if not exists (select 1 from public.conversa_mensagens m where m.conversa_id = p_conversa and m.protegida) then
    raise exception 'peniel_sem_acesso';
  end if;

  select coalesce(pa.full_name, 'Membro') || ' ↔ ' || coalesce(pb.full_name, 'Membro')
    into v_nomes
    from public.conversas_privadas c
    left join public.profiles pa on pa.id = c.user_a
    left join public.profiles pb on pb.id = c.user_b
   where c.id = p_conversa;

  insert into public.supervisao_registro (supervisor_id, conversa_id, nomes, motivo)
  values (auth.uid(), p_conversa, v_nomes, btrim(p_motivo));

  select coalesce(nullif(btrim(pr.full_name), ''), 'Um supervisor') into v_quem from public.profiles pr where pr.id = auth.uid();
  perform public.notificar_admins('🛡️ Supervisão de proteção',
    coalesce(v_quem, 'Um supervisor') || ' abriu uma conversa protegida (' || coalesce(v_nomes, '') || ').',
    jsonb_build_object('type', 'admin_denuncia'));

  return query
    select m.id, m.autor_id, m.autor_nome, m.tipo, m.texto, m.midia_path, m.midia_nome, m.duracao_ms, m.created_at
      from public.conversa_mensagens m
     where m.conversa_id = p_conversa and m.protegida
     order by m.created_at;
end;
$$;
revoke all on function public.supervisao_ler(uuid, text) from public, anon;
grant execute on function public.supervisao_ler(uuid, text) to authenticated;

-- Supervisor vê arquivos das conversas protegidas (para abrir foto/áudio).
create or replace function public.supervisor_ve_arquivo(p_caminho text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_supervisor_protecao()
     and exists (select 1 from public.conversa_mensagens m where m.midia_path = p_caminho and m.protegida);
$$;
revoke all on function public.supervisor_ve_arquivo(text) from public, anon;
grant execute on function public.supervisor_ve_arquivo(text) to authenticated;

create or replace function public.admin_ve_arquivo_denunciado(p_caminho text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
     and exists (select 1 from public.chat_denuncias d where d.chat = 'privada' and d.midia_path = p_caminho);
$$;
revoke all on function public.admin_ve_arquivo_denunciado(text) from public, anon;
grant execute on function public.admin_ve_arquivo_denunciado(text) to authenticated;


-- ─── 6. Bucket privado `chat-privado` ───────────────────────────────────────
-- Caminho: `<conversa>/<autor>/<uuid>.<ext>`. Mesmos tipos e limite do Chat
-- da Igreja.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select 'chat-privado', 'chat-privado', false, 52428800, b.allowed_mime_types
  from storage.buckets b where b.id = 'chat-geral'
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat-privado: participantes veem" on storage.objects;
create policy "chat-privado: participantes veem"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-privado'
    and (public.participo_da_conversa_txt((storage.foldername(name))[1])
         or public.supervisor_ve_arquivo(name)
         or public.admin_ve_arquivo_denunciado(name))
  );

drop policy if exists "chat-privado: membro envia na propria pasta" on storage.objects;
create policy "chat-privado: membro envia na propria pasta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-privado'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_membro()
    and public.participo_da_conversa_txt((storage.foldername(name))[1])
  );

drop policy if exists "chat-privado: autor apaga" on storage.objects;
create policy "chat-privado: autor apaga"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat-privado' and (storage.foldername(name))[2] = auth.uid()::text);

-- Arquivos sem mensagem (apagada pela limpeza ou pelo autor) — a Edge
-- Function limpar-audios-chat remove. Arquivo de denúncia aberta fica.
create or replace function public.chat_privado_midias_orfas(p_limite int default 500)
returns table (caminho text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'chat-privado'
     and o.created_at < now() - interval '1 hour'
     and not exists (select 1 from public.conversa_mensagens m where m.midia_path = o.name)
     and not exists (select 1 from public.chat_denuncias d
                      where d.chat = 'privada' and d.status = 'aberta' and d.midia_path = o.name)
   order by o.created_at
   limit greatest(1, least(p_limite, 1000));
$$;
revoke all on function public.chat_privado_midias_orfas(int) from public, anon, authenticated;


-- ─── 7. Denúncias ───────────────────────────────────────────────────────────
alter table public.chat_denuncias drop constraint if exists chat_denuncias_chat_check;
alter table public.chat_denuncias add constraint chat_denuncias_chat_check
  check (chat in ('geral', 'grupo', 'banda', 'privada'));

-- Mesma função de antes (20261017170000), com o ramo 'privada'. Na privada o
-- `grupo` guarda o id da conversa.
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
  elsif p_chat = 'privada' then
    select autor_id, autor_nome,
           case tipo when 'texto' then texto
                     when 'imagem' then '📷 Foto ' || texto
                     when 'audio' then '🎤 Mensagem de voz'
                     when 'video' then '🎬 Vídeo ' || texto
                     else '📎 ' || coalesce(midia_nome, 'Arquivo') end,
           midia_path, conversa_id::text
      into v_autor, v_nome, v_texto, v_midia, v_grupo
      from public.conversa_mensagens where id = p_mensagem_id;
    if not found or not public.participo_da_conversa(v_grupo::uuid) then return 'sem_acesso'; end if;
    v_onde := 'conversa privada';
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
    '🚩 Denúncia na ' || v_onde,
    coalesce(v_nome, 'Alguém') || ': ' || left(coalesce(v_texto, ''), 120),
    jsonb_build_object('type', 'admin_denuncia', 'id', v_id)
  );
  return 'ok';
end;
$$;
revoke all on function public.denunciar_mensagem(text, uuid, text) from public, anon;
grant execute on function public.denunciar_mensagem(text, uuid, text) to authenticated;


-- O admin apaga a mensagem privada SÓ se ela foi denunciada (o admin não lê
-- conversa privada; vê apenas a cópia que a denúncia guarda).
create or replace function public.admin_apagar_mensagem_privada(p_mensagem uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then return false; end if;
  if not exists (select 1 from public.chat_denuncias d where d.chat = 'privada' and d.mensagem_id = p_mensagem) then
    return false;
  end if;
  delete from public.conversa_mensagens where id = p_mensagem;
  return true;
end;
$$;
revoke all on function public.admin_apagar_mensagem_privada(uuid) from public, anon;
grant execute on function public.admin_apagar_mensagem_privada(uuid) to authenticated;


-- ─── 9. Responsável ↔ filho (contas do App) ─────────────────────────────────
-- O filho adolescente gera um código no App; o pai ou a mãe digita o código
-- e as contas ficam ligadas. O responsável vê COM QUEM o filho conversa no
-- privado (nomes e data), nunca o conteúdo — e só enquanto o filho é menor.
create table if not exists public.vinculos_responsavel (
  responsavel_id uuid not null references auth.users(id) on delete cascade,
  filho_id       uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (responsavel_id, filho_id),
  check (responsavel_id <> filho_id)
);
alter table public.vinculos_responsavel enable row level security;

drop policy if exists "vinculos: os dois e o admin leem" on public.vinculos_responsavel;
create policy "vinculos: os dois e o admin leem"
  on public.vinculos_responsavel for select to authenticated
  using (auth.uid() in (responsavel_id, filho_id) or public.is_admin());

drop policy if exists "vinculos: os dois e o admin desfazem" on public.vinculos_responsavel;
create policy "vinculos: os dois e o admin desfazem"
  on public.vinculos_responsavel for delete to authenticated
  using (auth.uid() in (responsavel_id, filho_id) or public.is_admin());

create table if not exists public.codigos_vinculo (
  filho_id  uuid primary key references auth.users(id) on delete cascade,
  codigo    text not null unique,
  expira_em timestamptz not null
);
alter table public.codigos_vinculo enable row level security;
-- Sem policies: só pelas funções abaixo.

create or replace function public.gerar_codigo_vinculo()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_cod text;
  i int;
begin
  if auth.uid() is null or not public.is_membro() then raise exception 'peniel_sem_acesso'; end if;
  if coalesce(public.idade_da_conta(auth.uid()), 99) >= 18 then raise exception 'peniel_so_menor'; end if;
  loop
    v_cod := '';
    for i in 1..6 loop
      v_cod := v_cod || substr(v_letras, 1 + floor(random() * length(v_letras))::int, 1);
    end loop;
    exit when not exists (select 1 from public.codigos_vinculo where codigo = v_cod);
  end loop;
  insert into public.codigos_vinculo (filho_id, codigo, expira_em)
  values (auth.uid(), v_cod, now() + interval '30 minutes')
  on conflict (filho_id) do update set codigo = excluded.codigo, expira_em = excluded.expira_em;
  return v_cod;
end;
$$;
revoke all on function public.gerar_codigo_vinculo() from public, anon;
grant execute on function public.gerar_codigo_vinculo() to authenticated;

-- Devolve { status, nome }: ok | invalido | proprio | sem_acesso
create or replace function public.usar_codigo_vinculo(p_codigo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_filho uuid; v_nome text;
begin
  if auth.uid() is null or not public.is_membro() then return jsonb_build_object('status', 'sem_acesso'); end if;
  select filho_id into v_filho from public.codigos_vinculo
   where codigo = upper(btrim(coalesce(p_codigo, ''))) and expira_em > now();
  if v_filho is null then return jsonb_build_object('status', 'invalido'); end if;
  if v_filho = auth.uid() then return jsonb_build_object('status', 'proprio'); end if;
  insert into public.vinculos_responsavel (responsavel_id, filho_id)
  values (auth.uid(), v_filho) on conflict do nothing;
  delete from public.codigos_vinculo where filho_id = v_filho;
  select coalesce(nullif(btrim(full_name), ''), 'Membro') into v_nome from public.profiles where id = v_filho;
  return jsonb_build_object('status', 'ok', 'nome', v_nome);
end;
$$;
revoke all on function public.usar_codigo_vinculo(text) from public, anon;
grant execute on function public.usar_codigo_vinculo(text) to authenticated;

-- Para o responsável: cada filho vinculado (menor) e com quem conversa.
create or replace function public.conversas_dos_meus_filhos()
returns table (filho_id uuid, filho_nome text, com_nome text, ultima_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select v.filho_id,
         coalesce(nullif(btrim(pf.full_name), ''), 'Membro'),
         coalesce(nullif(btrim(po.full_name), ''), 'Membro'),
         c.ultima_em
    from public.vinculos_responsavel v
    join public.profiles pf on pf.id = v.filho_id
    left join public.conversas_privadas c
           on v.filho_id in (c.user_a, c.user_b)
          and exists (select 1 from public.conversa_mensagens m where m.conversa_id = c.id)
    left join public.profiles po
           on po.id = case when c.user_a = v.filho_id then c.user_b else c.user_a end
   where v.responsavel_id = auth.uid()
     and coalesce(public.idade_da_conta(v.filho_id), 0) < 18
   order by pf.full_name, c.ultima_em desc nulls last;
$$;
revoke all on function public.conversas_dos_meus_filhos() from public, anon;
grant execute on function public.conversas_dos_meus_filhos() to authenticated;


-- ─── 10. Limpeza diária ─────────────────────────────────────────────────────
-- 3h05 UTC, antes da limpar-audios-chat (3h30), que apaga os arquivos órfãos.
create or replace function public.limpar_conversas_privadas()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.conversa_mensagens
   where (not protegida and created_at < now() - interval '15 days')
      or (protegida and created_at < now() - interval '4 months');
  delete from public.conversas_privadas c
   where c.ultima_em < now() - interval '15 days'
     and not exists (select 1 from public.conversa_mensagens m where m.conversa_id = c.id);
  delete from public.codigos_vinculo where expira_em < now();
$$;
revoke all on function public.limpar_conversas_privadas() from public, anon, authenticated;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'limpar-conversas-privadas';
  if v_job is not null then perform cron.unschedule(v_job); end if;
end $$;

select cron.schedule('limpar-conversas-privadas', '5 3 * * *', $$ select public.limpar_conversas_privadas(); $$);


-- ─── 11. Realtime ───────────────────────────────────────────────────────────
do $$
begin
  begin alter publication supabase_realtime add table public.conversa_mensagens; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.conversa_reacoes;   exception when duplicate_object then null; end;
end $$;

commit;

-- Conferência: deve listar as 6 tabelas novas.
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('conversas_privadas', 'conversa_mensagens', 'conversa_reacoes', 'conversa_leituras',
                      'supervisores_protecao', 'supervisao_registro', 'vinculos_responsavel', 'codigos_vinculo')
 order by table_name;
