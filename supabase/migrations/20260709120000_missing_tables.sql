-- ============================================================================
-- Peniel Church App — tabelas que faltam para tirar os placeholders do app
-- Cobre: versículos salvos, pedidos de oração (privados), histórico de
-- ofertas (registro manual), histórico de leitura, e eventos/devocionais
-- por grupo (Mulheres/Homens/Jovens) na GruposScreen.
--
-- Como aplicar: revise este arquivo e rode via Supabase Dashboard > SQL
-- Editor, ou `supabase db push` com o CLI autenticado. Nada aqui é
-- executado automaticamente.
-- ============================================================================

-- ─── 1. Versículos salvos (HomeScreen + BibleScreen "Salvar") ───────────────
create table if not exists public.saved_verses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  texto text not null,
  referencia text not null,
  versao text not null default 'ARC',
  created_at timestamptz not null default now(),
  unique (user_id, referencia, versao)
);

alter table public.saved_verses enable row level security;

create policy "Usuário vê seus próprios versículos salvos"
  on public.saved_verses for select
  using (auth.uid() = user_id);

create policy "Usuário salva seus próprios versículos"
  on public.saved_verses for insert
  with check (auth.uid() = user_id);

create policy "Usuário remove seus próprios versículos salvos"
  on public.saved_verses for delete
  using (auth.uid() = user_id);


-- ─── 2. Pedidos de oração (privados — só o membro e admin/pastor veem) ─────
create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  descricao text not null,
  status text not null default 'aberto' check (status in ('aberto', 'em_oracao', 'respondido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prayer_requests enable row level security;

create policy "Usuário vê seus próprios pedidos de oração"
  on public.prayer_requests for select
  using (auth.uid() = user_id);

create policy "Admin/líder vê todos os pedidos de oração"
  on public.prayer_requests for select
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ));

create policy "Usuário cria seus próprios pedidos de oração"
  on public.prayer_requests for insert
  with check (auth.uid() = user_id);

create policy "Usuário edita seus próprios pedidos de oração"
  on public.prayer_requests for update
  using (auth.uid() = user_id);

create policy "Admin atualiza status de qualquer pedido"
  on public.prayer_requests for update
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ));


-- ─── 3. Histórico de ofertas (registro manual pelo admin/tesoureiro) ────────
-- Observação: liga a profiles(id), ou seja, só cobre ofertas de quem tem
-- conta no app. Ofertas de visitantes sem conta ficam de fora por enquanto.
create table if not exists public.offerings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  valor numeric(10, 2) not null check (valor > 0),
  tipo text not null default 'oferta' check (tipo in ('dizimo', 'oferta', 'missoes', 'outro')),
  metodo text check (metodo in ('sumup', 'pix', 'dinheiro', 'transferencia', 'outro')),
  data date not null default current_date,
  observacoes text,
  registrado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.offerings enable row level security;

create policy "Usuário vê suas próprias ofertas"
  on public.offerings for select
  using (auth.uid() = user_id);

create policy "Admin gerencia todas as ofertas"
  on public.offerings for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));


-- ─── 4. Histórico de leitura ("Histórico de Estudos" no Perfil) ────────────
create table if not exists public.reading_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  livro text not null,
  capitulo int not null,
  versao text not null default 'ARC',
  lido_em timestamptz not null default now()
);

alter table public.reading_history enable row level security;

create policy "Usuário vê seu próprio histórico de leitura"
  on public.reading_history for select
  using (auth.uid() = user_id);

create policy "Usuário registra sua própria leitura"
  on public.reading_history for insert
  with check (auth.uid() = user_id);


-- ─── 5. Devocionais por grupo (Mulheres/Homens/Jovens na GruposScreen) ─────
-- A tabela `devocionais` já existe e é usada pela JovensScreen (feed geral).
-- Adiciona uma coluna opcional `grupo` para permitir filtrar por grupo sem
-- quebrar os devocionais gerais existentes (grupo = null continua valendo
-- para o feed geral).
alter table public.devocionais
  add column if not exists grupo text check (grupo in ('mulheres', 'homens', 'jovens'));


-- ─── 6. Eventos por grupo (substitui EVENTOS_MOCK na GruposScreen) ─────────
create table if not exists public.grupo_eventos (
  id uuid primary key default gen_random_uuid(),
  grupo text not null check (grupo in ('mulheres', 'homens', 'jovens')),
  titulo text not null,
  descricao text,
  data date not null,
  horario text not null,
  local text not null,
  tipo text not null default 'presencial' check (tipo in ('presencial', 'online', 'casa')),
  created_at timestamptz not null default now()
);

alter table public.grupo_eventos enable row level security;

create policy "Qualquer usuário autenticado vê eventos de grupo"
  on public.grupo_eventos for select
  using (auth.role() = 'authenticated');

create policy "Admin/líder gerencia eventos de grupo"
  on public.grupo_eventos for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ));
