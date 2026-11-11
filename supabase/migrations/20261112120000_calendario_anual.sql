-- ============================================================================
-- Calendário anual da igreja (pedido do Marcos, 11/11/2026)
--
-- • Categorias com cor e emoji (Ceia, Conferências, Retiros, Alive, Mulheres,
--   Homens, Kids, Oração e jejum, Datas especiais, Igreja fechada). O admin
--   muda nome, cor, emoji e ordem no painel.
-- • Quem edita as datas: o admin (todas) e o líder do grupo ligado à
--   categoria (Alive → jovens, Mulheres → mulheres, Homens → homens). Para
--   categorias sem grupo (Kids, Oração...) o admin pode nomear editores extras
--   em `calendario_editores`.
-- • Leitura aberta (inclusive visitante sem conta e o feed .ics da função
--   `calendario`, que o iPhone/Google assinam).
-- • Começa vazio para 2027, só com Natal, Páscoa e as Ceias de 1º domingo.
--
-- Como aplicar: Supabase Dashboard > SQL Editor. Pode rodar de novo sem
-- duplicar nada.
-- ============================================================================

create table if not exists public.calendario_categorias (
  id text primary key,
  nome text not null check (char_length(btrim(nome)) between 1 and 40),
  emoji text not null default '📅',
  cor text not null default '#534AB7' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  grupo text,                         -- grupo em group_leaders cujo líder edita
  ordem int not null default 0,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.calendario_editores (
  categoria_id text not null references public.calendario_categorias(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (categoria_id, profile_id)
);

create table if not exists public.calendario_datas (
  id uuid primary key default gen_random_uuid(),
  categoria_id text not null references public.calendario_categorias(id) on update cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 120),
  descricao text check (descricao is null or char_length(descricao) <= 2000),
  data_inicio date not null,
  data_fim date,                      -- vários dias (retiro, conferência)
  hora_inicio time,                   -- null = dia inteiro
  hora_fim time,
  local text check (local is null or char_length(local) <= 200),
  evento_id uuid references public.agenda_eventos(id) on delete set null, -- evento com inscrição
  semente text unique,                -- datas criadas por esta migração
  criado_por uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_fim is null or data_fim >= data_inicio),
  check (hora_fim is null or hora_inicio is not null)
);

create index if not exists calendario_datas_inicio_idx on public.calendario_datas (data_inicio);
create index if not exists calendario_datas_categoria_idx on public.calendario_datas (categoria_id, data_inicio);

-- ─── Quem pode editar uma categoria ────────────────────────────────────────
create or replace function public.pode_editar_calendario(p_categoria text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.is_admin()
    or exists (select 1 from public.calendario_categorias c
               join public.group_leaders gl on gl.grupo = c.grupo
               where c.id = p_categoria and gl.profile_id = auth.uid())
    or exists (select 1 from public.calendario_editores e
               where e.categoria_id = p_categoria and e.profile_id = auth.uid())
  )
$$;
revoke all on function public.pode_editar_calendario(text) from public;
grant execute on function public.pode_editar_calendario(text) to authenticated, anon;

-- Categorias que EU posso editar (o app mostra o "+" só se houver alguma).
create or replace function public.calendario_minhas_categorias()
returns setof text language sql stable security definer set search_path = public as $$
  select c.id from public.calendario_categorias c
  where c.ativa and public.pode_editar_calendario(c.id)
  order by c.ordem
$$;
revoke all on function public.calendario_minhas_categorias() from public;
grant execute on function public.calendario_minhas_categorias() to authenticated;

-- ─── RLS ──────────────────────────────────────────────────────────────────
alter table public.calendario_categorias enable row level security;
alter table public.calendario_editores enable row level security;
alter table public.calendario_datas enable row level security;

drop policy if exists "Todos veem as categorias do calendário" on public.calendario_categorias;
create policy "Todos veem as categorias do calendário"
  on public.calendario_categorias for select using (true);
drop policy if exists "Admin gerencia categorias do calendário" on public.calendario_categorias;
create policy "Admin gerencia categorias do calendário"
  on public.calendario_categorias for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin gerencia editores do calendário" on public.calendario_editores;
create policy "Admin gerencia editores do calendário"
  on public.calendario_editores for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Editor vê a própria permissão" on public.calendario_editores;
create policy "Editor vê a própria permissão"
  on public.calendario_editores for select using (profile_id = auth.uid());

drop policy if exists "Todos veem o calendário" on public.calendario_datas;
create policy "Todos veem o calendário"
  on public.calendario_datas for select using (true);
drop policy if exists "Editor cria datas da sua categoria" on public.calendario_datas;
create policy "Editor cria datas da sua categoria"
  on public.calendario_datas for insert
  with check (public.pode_editar_calendario(categoria_id));
drop policy if exists "Editor muda datas da sua categoria" on public.calendario_datas;
create policy "Editor muda datas da sua categoria"
  on public.calendario_datas for update
  using (public.pode_editar_calendario(categoria_id))
  with check (public.pode_editar_calendario(categoria_id));
drop policy if exists "Editor apaga datas da sua categoria" on public.calendario_datas;
create policy "Editor apaga datas da sua categoria"
  on public.calendario_datas for delete
  using (public.pode_editar_calendario(categoria_id));

grant select on public.calendario_categorias, public.calendario_datas to anon, authenticated;
grant insert, update, delete on public.calendario_datas to authenticated;
grant insert, update, delete on public.calendario_categorias to authenticated;
grant select, insert, delete on public.calendario_editores to authenticated;

-- updated_at e autor protegidos
create or replace function public.calendario_datas_carimbo()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    if auth.uid() is not null then new.semente := null; end if; -- só a migração semeia
  else new.criado_por := old.criado_por; new.semente := old.semente; end if;
  return new;
end $$;
drop trigger if exists calendario_datas_carimbo on public.calendario_datas;
create trigger calendario_datas_carimbo before insert or update on public.calendario_datas
  for each row execute function public.calendario_datas_carimbo();

-- ─── Categorias iniciais ──────────────────────────────────────────────────
insert into public.calendario_categorias (id, nome, emoji, cor, grupo, ordem) values
  ('ceia',        'Ceia',              '🍷', '#8E1B3A', null,       1),
  ('conferencia', 'Conferências',      '🔥', '#E84B1A', null,       2),
  ('retiro',      'Retiros',          '⛺', '#1F9D55', null,       3),
  ('alive',       'Alive',             '⚡', '#7B3FE4', 'jovens',   4),
  ('mulheres',    'Mulheres',          '🌸', '#E64C93', 'mulheres', 5),
  ('homens',      'Homens',            '🛡️', '#2B6CB0', 'homens',   6),
  ('kids',        'Kids',              '🎈', '#F2B705', null,       7),
  ('oracao',      'Oração e jejum',    '🙏', '#3AA0E0', null,       8),
  ('especial',    'Datas especiais',   '🎉', '#D4A017', null,       9),
  ('fechada',     'Igreja fechada',    '🗓️', '#8C8799', null,      10)
on conflict (id) do nothing;

-- ─── Datas iniciais: Natal, Páscoa, aniversário da igreja, Retiro e Ceias (dez/2026 a dez/2027) ───────────
insert into public.calendario_datas (categoria_id, titulo, data_inicio, hora_inicio, semente) values
  ('especial', 'Natal',            date '2026-12-25', null, 'natal-2026'),
  ('especial', 'Domingo de Páscoa', date '2027-03-28', null, 'pascoa-2027'),
  -- 1º domingo de março: aniversário da igreja (Marcos, 11/11/2026)
  ('especial', 'Aniversário da Peniel Church · 10 anos', date '2027-03-07', time '18:00', 'aniversario-igreja-2027'),
  ('especial', 'Natal',            date '2027-12-25', null, 'natal-2027')
on conflict (semente) do nothing;

-- Retiro Peniel 2027: último fim de semana de agosto, sexta a segunda
-- (bank holiday do Carnaval) — Marcos, 11/11/2026.
insert into public.calendario_datas (categoria_id, titulo, data_inicio, data_fim, semente) values
  ('retiro', 'Retiro Peniel 2027', date '2027-08-27', date '2027-08-30', 'retiro-peniel-2027')
on conflict (semente) do nothing;

-- 1º domingo de cada mês, 18h
insert into public.calendario_datas (categoria_id, titulo, data_inicio, hora_inicio, hora_fim, semente)
select 'ceia',
       case when m < date '2027-01-01' then 'Santa Ceia' else 'Culto da Família & Santa Ceia' end,
       d, time '18:00', time '20:00', 'ceia-' || to_char(d, 'YYYY-MM')
from generate_series(date '2026-12-01', date '2027-12-01', interval '1 month') as m,
     lateral (select (m::date + ((7 - extract(dow from m)::int) % 7))::date as d) x
on conflict (semente) do nothing;
