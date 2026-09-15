-- ============================================================================
-- Presença, frequência e ferramentas de aula nos grupos — 15 Set 2026
--
-- Pedido do Marcos: registrar quem esteve presente em cada Estudo Bíblico e
-- rodar um relatório de frequência no fim do semestre; e dar ao líder
-- ferramentas para usar durante a aula, que acontece pelo Zoom.
--
-- DECISÕES QUE ESTÃO GRAVADAS AQUI
--
-- 1. GENÉRICO POR GRUPO, LIGADO NUM INTERRUPTOR. Nada disto é do Estudo
--    Bíblico: é de `grupo_eventos`, que todo grupo já tem. `grupo_config`
--    decide quem enxerga as ferramentas, e só `estudo_biblico` nasce ligado.
--    Ligar no Alive depois é um UPDATE de uma linha, não uma refatoração.
--
-- 2. A PRESENÇA É DE `members`, NÃO DE `profiles`. Participante de grupo é
--    `grupo_membros.membro_id -> members`, e muita gente da igreja está no
--    grupo sem nunca ter criado conta no app. Se a chamada fosse por
--    `profile_id`, metade da turma não poderia sequer ser chamada. O vínculo
--    `members.profile_id` é o que liga a linha à conta de quem tem uma.
--
-- 3. FALTA É UMA LINHA, NÃO A AUSÊNCIA DE UMA LINHA. O líder salva a turma
--    inteira de uma vez, com `ausente` gravado. Sem isso não há como
--    distinguir "faltou" de "o líder não fez a chamada", e o denominador do
--    relatório ("14 de 18") seria inventado. `chamada_feita_em` no encontro
--    é o carimbo que diz que a chamada aconteceu.
--
-- 4. QUEM VÊ A PRESENÇA. Líder do grupo e admin veem tudo; cada pessoa vê
--    só a PRÓPRIA linha. Falta é assunto entre a pessoa e a liderança — a
--    lista de quem faltou não é conteúdo de grupo como um devocional é.
--    (Contraste proposital com `participantes_do_grupo`, que todo mundo do
--    grupo vê desde 20260915093000: nome não é falta.)
--
-- 5. PERGUNTA ANÔNIMA FICOU DE FORA de propósito. Com a linha legível pelo
--    grupo, `autor_id` continuaria lá para quem chamasse a API direto —
--    anonimato de mentira é pior que nenhum. Se for para existir, é por RPC
--    que não devolve o autor, e isso é outra rodada.
-- ============================================================================


-- ─── 1. Interruptor por grupo ────────────────────────────────────────────────
create table if not exists public.grupo_config (
  grupo text primary key check (grupo in ('mulheres', 'homens', 'jovens', 'estudo_biblico')),
  presenca_ativa boolean not null default false,
  perguntas_ativas boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.grupo_config enable row level security;

-- Leitura para qualquer autenticado: é um interruptor de interface, não
-- conteúdo. Filtrar por `tem_acesso_grupo` aqui só custaria uma consulta a
-- mais para esconder um booleano que não conta nada sobre ninguém.
drop policy if exists "Config de grupo é legível" on public.grupo_config;
create policy "Config de grupo é legível"
  on public.grupo_config for select
  using (auth.role() = 'authenticated');

drop policy if exists "Líder do grupo mexe na config do próprio grupo" on public.grupo_config;
create policy "Líder do grupo mexe na config do próprio grupo"
  on public.grupo_config for all
  using (public.is_admin() or public.is_grupo_leader(grupo))
  with check (public.is_admin() or public.is_grupo_leader(grupo));

insert into public.grupo_config (grupo, presenca_ativa, perguntas_ativas)
values ('estudo_biblico', true, true)
on conflict (grupo) do nothing;


-- ─── 2. O encontro vira uma aula ─────────────────────────────────────────────
-- `horario` continua sendo o texto que aparece no card ("20h às 22h"): é o
-- que o líder já digita e o que a turma lê. `hora_inicio` é o relógio, e é
-- separado porque texto livre não dá para somar 30 minutos — "20h às 22h",
-- "8pm", "das 20 às 22" e "20:00" são todos legítimos e nenhum é parseável
-- com segurança. Sem `hora_inicio` preenchida, o encontro simplesmente não
-- entra no lembrete; nada quebra.
alter table public.grupo_eventos
  add column if not exists link_online        text,
  add column if not exists hora_inicio        time,
  add column if not exists roteiro            text,
  add column if not exists chamada_feita_em   timestamptz,
  add column if not exists lembrete_enviado_em timestamptz;

comment on column public.grupo_eventos.link_online is
  'Link do Zoom/Meet do encontro. Separado de `local` porque `local` é texto livre que aparece no card.';
comment on column public.grupo_eventos.hora_inicio is
  'Relógio do início, para o lembrete automático. `horario` continua sendo o texto exibido.';
comment on column public.grupo_eventos.lembrete_enviado_em is
  'Carimbo do push de lembrete. A janela do cron se sobrepõe de propósito; é este campo que impede o segundo envio.';

create index if not exists grupo_eventos_lembrete_idx
  on public.grupo_eventos (data, hora_inicio)
  where hora_inicio is not null and lembrete_enviado_em is null;


-- ─── 3. Material preso a uma aula ────────────────────────────────────────────
-- `on delete set null`: apagar o encontro não pode levar junto a apostila.
-- Ela volta a ser material solto do grupo, que é onde estava antes.
alter table public.grupo_arquivos
  add column if not exists evento_id uuid references public.grupo_eventos(id) on delete set null;

create index if not exists grupo_arquivos_evento_idx on public.grupo_arquivos (evento_id);


-- ─── 4. Presença ─────────────────────────────────────────────────────────────
create table if not exists public.grupo_presenca (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.grupo_eventos(id) on delete cascade,
  membro_id uuid not null references public.members(id) on delete cascade,
  status text not null check (status in ('presente', 'justificado', 'ausente')),
  motivo text check (motivo is null or char_length(motivo) <= 200),
  registrado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evento_id, membro_id)
);

-- Só o de `membro_id`: o unique (evento_id, membro_id) já serve de índice
-- para `evento_id`, que é a coluna líder dele.
create index if not exists grupo_presenca_membro_idx on public.grupo_presenca (membro_id);

alter table public.grupo_presenca enable row level security;

drop policy if exists "Líder e admin veem a presença do grupo" on public.grupo_presenca;
create policy "Líder e admin veem a presença do grupo"
  on public.grupo_presenca for select
  using (exists (
    select 1 from public.grupo_eventos e
    where e.id = grupo_presenca.evento_id
      and (public.is_admin() or public.is_grupo_leader(e.grupo))
  ));

-- Cada um vê a própria frequência — é o que alimenta "você esteve em 14 dos
-- 18 estudos" no perfil, sem abrir a lista da turma para ninguém.
drop policy if exists "Cada um vê a própria presença" on public.grupo_presenca;
create policy "Cada um vê a própria presença"
  on public.grupo_presenca for select
  using (exists (
    select 1 from public.members m
    where m.id = grupo_presenca.membro_id and m.profile_id = auth.uid()
  ));

drop policy if exists "Líder e admin fazem a chamada" on public.grupo_presenca;
create policy "Líder e admin fazem a chamada"
  on public.grupo_presenca for all
  using (exists (
    select 1 from public.grupo_eventos e
    where e.id = grupo_presenca.evento_id
      and (public.is_admin() or public.is_grupo_leader(e.grupo))
  ))
  with check (exists (
    select 1 from public.grupo_eventos e
    where e.id = grupo_presenca.evento_id
      and (public.is_admin() or public.is_grupo_leader(e.grupo))
  ));

create or replace function public.toca_updated_at_presenca()
returns trigger language plpgsql
set search_path = public
as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists grupo_presenca_updated_at on public.grupo_presenca;
create trigger grupo_presenca_updated_at
  before update on public.grupo_presenca
  for each row execute function public.toca_updated_at_presenca();


-- ─── 5. Perguntas da turma ───────────────────────────────────────────────────
create table if not exists public.grupo_encontro_perguntas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.grupo_eventos(id) on delete cascade,
  autor_id uuid not null references public.profiles(id) on delete cascade,
  autor_nome text not null,
  texto text not null check (char_length(texto) between 1 and 500),
  resposta text check (resposta is null or char_length(resposta) <= 1000),
  respondida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists grupo_perguntas_evento_idx
  on public.grupo_encontro_perguntas (evento_id, created_at);

-- O SERVIDOR ASSINA A PERGUNTA, não o cliente. `forca_autor_da_mensagem()`
-- existe desde 20260909010000 e já protege os três chats; uma tabela nova com
-- `autor_nome` vindo do app reabriria exatamente o buraco que ela fechou —
-- a chave anônima sai de um .ipa, e a pergunta apareceria assinada "Pastor
-- Marcos" na tela de todo mundo, ao vivo, pelo Realtime.
drop trigger if exists grupo_perguntas_forca_autor on public.grupo_encontro_perguntas;
create trigger grupo_perguntas_forca_autor
  before insert on public.grupo_encontro_perguntas
  for each row execute function public.forca_autor_da_mensagem();

alter table public.grupo_encontro_perguntas enable row level security;

drop policy if exists "Quem tem acesso ao grupo vê as perguntas" on public.grupo_encontro_perguntas;
create policy "Quem tem acesso ao grupo vê as perguntas"
  on public.grupo_encontro_perguntas for select
  using (exists (
    select 1 from public.grupo_eventos e
    where e.id = grupo_encontro_perguntas.evento_id
      and public.tem_acesso_grupo(e.grupo)
  ));

drop policy if exists "Quem é do grupo pergunta em nome próprio" on public.grupo_encontro_perguntas;
create policy "Quem é do grupo pergunta em nome próprio"
  on public.grupo_encontro_perguntas for insert
  with check (
    autor_id = auth.uid()
    and exists (
      select 1 from public.grupo_eventos e
      where e.id = grupo_encontro_perguntas.evento_id
        and public.tem_acesso_grupo(e.grupo)
    )
  );

-- Responder é do líder, e só o líder faz UPDATE aqui: quem se arrependeu da
-- pergunta apaga e faz outra. (A policy é por linha, não por coluna, então em
-- tese o líder também poderia reescrever o `texto` — é o mesmo poder que ele
-- já tem de apagar a pergunta inteira, e não vale um gatilho para travar.)
drop policy if exists "Líder responde as perguntas" on public.grupo_encontro_perguntas;
create policy "Líder responde as perguntas"
  on public.grupo_encontro_perguntas for update
  using (exists (
    select 1 from public.grupo_eventos e
    where e.id = grupo_encontro_perguntas.evento_id
      and (public.is_admin() or public.is_grupo_leader(e.grupo))
  ))
  with check (exists (
    select 1 from public.grupo_eventos e
    where e.id = grupo_encontro_perguntas.evento_id
      and (public.is_admin() or public.is_grupo_leader(e.grupo))
  ));

drop policy if exists "Autor ou líder apaga a pergunta" on public.grupo_encontro_perguntas;
create policy "Autor ou líder apaga a pergunta"
  on public.grupo_encontro_perguntas for delete
  using (
    autor_id = auth.uid()
    or exists (
      select 1 from public.grupo_eventos e
      where e.id = grupo_encontro_perguntas.evento_id
        and (public.is_admin() or public.is_grupo_leader(e.grupo))
    )
  );

create table if not exists public.grupo_pergunta_curtidas (
  pergunta_id uuid not null references public.grupo_encontro_perguntas(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pergunta_id, profile_id)
);

alter table public.grupo_pergunta_curtidas enable row level security;

drop policy if exists "Curtidas seguem a pergunta" on public.grupo_pergunta_curtidas;
create policy "Curtidas seguem a pergunta"
  on public.grupo_pergunta_curtidas for select
  using (exists (
    select 1 from public.grupo_encontro_perguntas p
    join public.grupo_eventos e on e.id = p.evento_id
    where p.id = grupo_pergunta_curtidas.pergunta_id
      and public.tem_acesso_grupo(e.grupo)
  ));

drop policy if exists "Cada um curte por si" on public.grupo_pergunta_curtidas;
create policy "Cada um curte por si"
  on public.grupo_pergunta_curtidas for insert
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.grupo_encontro_perguntas p
      join public.grupo_eventos e on e.id = p.evento_id
      where p.id = grupo_pergunta_curtidas.pergunta_id
        and public.tem_acesso_grupo(e.grupo)
    )
  );

drop policy if exists "Cada um descurte por si" on public.grupo_pergunta_curtidas;
create policy "Cada um descurte por si"
  on public.grupo_pergunta_curtidas for delete
  using (profile_id = auth.uid());

-- Realtime: a pergunta tem que aparecer na tela do líder enquanto ele fala,
-- não no próximo refresh. Mesmo bloco idempotente do chat da Banda.
do $$
begin
  execute 'alter publication supabase_realtime add table public.grupo_encontro_perguntas';
exception when duplicate_object then null;
end $$;


-- ─── 6. Anotações pessoais da aula ───────────────────────────────────────────
-- Uma linha por pessoa por aula, visível só para ela. Nem o líder lê.
create table if not exists public.grupo_encontro_notas (
  evento_id uuid not null references public.grupo_eventos(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  texto text not null default '' check (char_length(texto) <= 10000),
  updated_at timestamptz not null default now(),
  primary key (evento_id, profile_id)
);

alter table public.grupo_encontro_notas enable row level security;

-- USING é só `profile_id = auth.uid()`, de propósito: quem saiu do grupo
-- continua podendo LER e apagar o caderno que escreveu. O WITH CHECK é que
-- exige acesso ao grupo — sem ele, qualquer conta autenticada gravaria
-- anotações em qualquer `evento_id` que descobrisse, inclusive de um grupo do
-- qual nunca fez parte. Não vazaria nada (ninguém lê a nota de ninguém), mas
-- é escrita sem autorização.
drop policy if exists "Anotação é só de quem escreveu" on public.grupo_encontro_notas;
create policy "Anotação é só de quem escreveu"
  on public.grupo_encontro_notas for all
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.grupo_eventos e
      where e.id = grupo_encontro_notas.evento_id
        and public.tem_acesso_grupo(e.grupo)
    )
  );


-- ─── 7. O relatório ──────────────────────────────────────────────────────────
-- Devolve a presença crua com o nome já resolvido, no período pedido.
--
-- POR QUE UMA RPC E NÃO UM SELECT DIRETO: quem saiu do grupo no meio do
-- semestre some de `participantes_do_grupo`, mas as presenças dele continuam
-- lá. Sem o join a `members` feito aqui dentro, o app teria um `membro_id`
-- sem nome para mostrar na grade — e `members` está fechada para o líder
-- desde 20260908203000, de propósito (é o diretório da igreja inteira).
-- Este é o mesmo desenho de `participantes_do_grupo`: security definer,
-- permissão conferida dentro, e só o nome sai.
create or replace function public.frequencia_do_grupo(
  p_grupo  text,
  p_inicio date,
  p_fim    date
)
returns table (
  evento_id uuid,
  data      date,
  membro_id uuid,
  nome      text,
  sobrenome text,
  status    text,
  motivo    text
)
language sql
stable
security definer
set search_path = public
as $$
  select gp.evento_id, e.data, gp.membro_id, m.nome, m.sobrenome, gp.status, gp.motivo
  from public.grupo_presenca gp
  join public.grupo_eventos e on e.id = gp.evento_id
  join public.members m       on m.id = gp.membro_id
  where (public.is_admin() or public.is_grupo_leader(p_grupo))
    and e.grupo = p_grupo
    and e.data between p_inicio and p_fim
  order by e.data, m.nome, m.sobrenome;
$$;

revoke all on function public.frequencia_do_grupo(text, date, date) from public;
grant execute on function public.frequencia_do_grupo(text, date, date) to authenticated;


-- ─── Conferência depois de aplicar ───────────────────────────────────────────
-- Como líder do Estudo Bíblico:
--   select * from frequencia_do_grupo('estudo_biblico', '2026-09-01', '2026-12-31');
-- Como líder de OUTRO grupo, a mesma chamada deve voltar vazia.
-- Como participante comum: `select * from grupo_presenca` deve trazer só as
-- linhas dele, e `insert into grupo_presenca ...` deve ser barrado.
