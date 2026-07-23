-- ============================================================================
-- Liderança e participação nos Grupos (Mulheres, Homens, Jovens/Alive)
--
-- `group_leaders`: quem lidera cada grupo. Um líder pode liderar mais de um
-- grupo (ex: a mesma pessoa lidera Homens e Jovens), e um grupo pode ter mais
-- de um líder — por isso é uma tabela separada (many-to-many), não uma
-- coluna única em `profiles`.
--
-- `grupo_membros`: quem faz parte de cada grupo, escolhido pelo líder a
-- partir do diretório de membros (`members`) — não precisa ter conta no app
-- pra fazer parte de um grupo.
--
-- Novos grupos além de mulheres/homens/jovens exigem código novo no
-- `GruposScreen` de qualquer forma (cor, ícone, textos traduzidos são
-- fixos ali), então a lista de grupos válidos aqui é só uma checagem simples
-- — estender é uma migração de uma linha quando chegar a hora, não uma
-- tabela dinâmica.
-- ============================================================================

create table if not exists public.group_leaders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  grupo text not null check (grupo in ('mulheres', 'homens', 'jovens')),
  created_at timestamptz not null default now(),
  unique (profile_id, grupo)
);

alter table public.group_leaders enable row level security;

drop policy if exists "Qualquer autenticado vê líderes de grupo" on public.group_leaders;
create policy "Qualquer autenticado vê líderes de grupo"
  on public.group_leaders for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admin gerencia líderes de grupo" on public.group_leaders;
create policy "Admin gerencia líderes de grupo"
  on public.group_leaders for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));


create table if not exists public.grupo_membros (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references public.members(id) on delete cascade,
  grupo text not null check (grupo in ('mulheres', 'homens', 'jovens')),
  adicionado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (membro_id, grupo)
);

alter table public.grupo_membros enable row level security;

-- Visibilidade restrita por enquanto: só quem lidera aquele grupo específico
-- (ou admin) vê a lista de participantes — mesmo padrão de privacidade já
-- usado pro diretório de membros em geral. Reabrir pra "membros do próprio
-- grupo verem uns aos outros" é só trocar esta policy, sem mudar nada mais.
drop policy if exists "Líder do grupo vê participantes" on public.grupo_membros;
create policy "Líder do grupo vê participantes"
  on public.grupo_membros for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
    or exists (
      select 1 from public.group_leaders
      where group_leaders.profile_id = auth.uid()
        and group_leaders.grupo = grupo_membros.grupo
    )
  );

drop policy if exists "Líder do grupo gerencia participantes" on public.grupo_membros;
create policy "Líder do grupo gerencia participantes"
  on public.grupo_membros for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
    or exists (
      select 1 from public.group_leaders
      where group_leaders.profile_id = auth.uid()
        and group_leaders.grupo = grupo_membros.grupo
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
    or exists (
      select 1 from public.group_leaders
      where group_leaders.profile_id = auth.uid()
        and group_leaders.grupo = grupo_membros.grupo
    )
  );
