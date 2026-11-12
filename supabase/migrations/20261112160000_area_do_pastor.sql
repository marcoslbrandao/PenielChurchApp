-- ============================================================================
-- Área do Pastor (pedido do Marcos, nov/2026; construída em 12/11/2026)
--
-- "Controle de reuniões, agendamentos, anotações do que foi falado e
-- lembretes." Protegida por Face ID no app.
--
-- • Quem entra: quem está em `pastores` (o admin escolhe, no próprio app).
--   Ser admin NÃO dá acesso às anotações — é sigilo pastoral.
-- • Cada compromisso/anotação é do pastor que criou. Ele pode marcar
--   "compartilhar com os pastores" para os outros pastores verem também.
--   Lembretes pessoais são só do dono.
-- • Lembretes por push (cron a cada 5 min): antes do compromisso (15 min,
--   1 h, 1 dia…) e lembretes avulsos na hora marcada.
--
-- Depende de push_para (20261112090000). Pode rodar de novo.
-- ============================================================================

create table if not exists public.pastores (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.pastores enable row level security;
drop policy if exists "pastores: admin gerencia" on public.pastores;
create policy "pastores: admin gerencia" on public.pastores for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "pastores: cada um se vê" on public.pastores;
create policy "pastores: cada um se vê" on public.pastores for select using (user_id = auth.uid());
grant select, insert, delete on public.pastores to authenticated;

create or replace function public.eh_pastor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pastores where user_id = auth.uid())
$$;
revoke all on function public.eh_pastor() from public, anon;
grant execute on function public.eh_pastor() to authenticated;

-- Lista para o admin (nome de quem é pastor).
create or replace function public.pastores_lista()
returns table (user_id uuid, nome text, desde timestamptz)
language sql stable security definer set search_path = public as $$
  select p.user_id, coalesce(nullif(btrim(pr.full_name), ''), 'Membro'), p.created_at
    from public.pastores p join public.profiles pr on pr.id = p.user_id
   where public.is_admin() or public.eh_pastor()
   order by 2
$$;
revoke all on function public.pastores_lista() from public, anon;
grant execute on function public.pastores_lista() to authenticated;

-- ─── Compromissos (reuniões, aconselhamentos, visitas…) ───────────────────
create table if not exists public.pastor_compromissos (
  id              uuid primary key default gen_random_uuid(),
  dono            uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  titulo          text not null check (char_length(btrim(titulo)) between 1 and 120),
  tipo            text not null default 'reuniao'
                    check (tipo in ('reuniao', 'aconselhamento', 'visita', 'oracao', 'outro')),
  pessoa          text check (pessoa is null or char_length(pessoa) <= 120),
  member_id       uuid references public.members(id) on delete set null,
  inicio          timestamptz not null,
  fim             timestamptz,
  local           text check (local is null or char_length(local) <= 200),
  status          text not null default 'agendado' check (status in ('agendado', 'feito', 'cancelado')),
  lembrete_min    integer check (lembrete_min is null or lembrete_min between 0 and 10080),
  lembrete_enviado_em timestamptz,
  compartilhado   boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);
create index if not exists pastor_compromissos_dono_idx on public.pastor_compromissos (dono, inicio);
create index if not exists pastor_compromissos_lembrete_idx on public.pastor_compromissos (inicio)
  where status = 'agendado' and lembrete_min is not null and lembrete_enviado_em is null;

-- ─── Anotações (o que foi falado) ─────────────────────────────────────────
create table if not exists public.pastor_notas (
  id              uuid primary key default gen_random_uuid(),
  dono            uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  compromisso_id  uuid references public.pastor_compromissos(id) on delete set null,
  pessoa          text check (pessoa is null or char_length(pessoa) <= 120),
  member_id       uuid references public.members(id) on delete set null,
  titulo          text not null check (char_length(btrim(titulo)) between 1 and 120),
  texto           text not null default '' check (char_length(texto) <= 20000),
  proximo_passo   text check (proximo_passo is null or char_length(proximo_passo) <= 1000),
  compartilhado   boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists pastor_notas_dono_idx on public.pastor_notas (dono, created_at desc);
create index if not exists pastor_notas_member_idx on public.pastor_notas (member_id);

-- ─── Lembretes avulsos ────────────────────────────────────────────────────
create table if not exists public.pastor_lembretes (
  id          uuid primary key default gen_random_uuid(),
  dono        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  texto       text not null check (char_length(btrim(texto)) between 1 and 300),
  quando      timestamptz not null,
  feito       boolean not null default false,
  enviado_em  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists pastor_lembretes_dono_idx on public.pastor_lembretes (dono, quando);

-- ─── RLS ──────────────────────────────────────────────────────────────────
alter table public.pastor_compromissos enable row level security;
alter table public.pastor_notas enable row level security;
alter table public.pastor_lembretes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pastor_compromissos', 'pastor_notas'] loop
    execute format('drop policy if exists "pastor: ve o seu e o compartilhado" on public.%I', t);
    execute format('create policy "pastor: ve o seu e o compartilhado" on public.%I for select
                      using (public.eh_pastor() and (dono = auth.uid() or compartilhado))', t);
    execute format('drop policy if exists "pastor: cria o seu" on public.%I', t);
    execute format('create policy "pastor: cria o seu" on public.%I for insert
                      with check (public.eh_pastor() and dono = auth.uid())', t);
    execute format('drop policy if exists "pastor: muda o seu" on public.%I', t);
    execute format('create policy "pastor: muda o seu" on public.%I for update
                      using (public.eh_pastor() and dono = auth.uid())
                      with check (public.eh_pastor() and dono = auth.uid())', t);
    execute format('drop policy if exists "pastor: apaga o seu" on public.%I', t);
    execute format('create policy "pastor: apaga o seu" on public.%I for delete
                      using (public.eh_pastor() and dono = auth.uid())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists "pastor: lembretes só do dono" on public.pastor_lembretes;
create policy "pastor: lembretes só do dono" on public.pastor_lembretes for all
  using (public.eh_pastor() and dono = auth.uid())
  with check (public.eh_pastor() and dono = auth.uid());
grant select, insert, update, delete on public.pastor_lembretes to authenticated;

-- Carimbo: updated_at, dono fixo, lembrete volta a valer se mudar a hora.
create or replace function public.pastor_carimbo()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.dono := old.dono; new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;
create or replace function public.pastor_compromisso_carimbo()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.dono := old.dono; new.created_at := old.created_at;
    if new.inicio is distinct from old.inicio or new.lembrete_min is distinct from old.lembrete_min then
      new.lembrete_enviado_em := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create or replace function public.pastor_lembrete_carimbo()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.dono := old.dono; new.created_at := old.created_at;
    if new.quando is distinct from old.quando then new.enviado_em := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists pastor_carimbo on public.pastor_compromissos;
create trigger pastor_carimbo before insert or update on public.pastor_compromissos
  for each row execute function public.pastor_compromisso_carimbo();
drop trigger if exists pastor_carimbo on public.pastor_notas;
create trigger pastor_carimbo before insert or update on public.pastor_notas
  for each row execute function public.pastor_carimbo();
drop trigger if exists pastor_carimbo on public.pastor_lembretes;
create trigger pastor_carimbo before insert or update on public.pastor_lembretes
  for each row execute function public.pastor_lembrete_carimbo();

-- Buscar pessoa da igreja para ligar ao compromisso/anotação (nome e telefone).
create or replace function public.pastor_buscar_membros(p_busca text)
returns table (id uuid, nome text, telefone text)
language sql stable security definer set search_path = public as $$
  select m.id, btrim(coalesce(m.nome, '') || ' ' || coalesce(m.sobrenome, '')), m.telefone
    from public.members m
   where public.eh_pastor()
     and char_length(btrim(coalesce(p_busca, ''))) >= 2
     and (coalesce(m.nome, '') || ' ' || coalesce(m.sobrenome, '')) ilike '%' || btrim(p_busca) || '%'
   order by 2
   limit 30
$$;
revoke all on function public.pastor_buscar_membros(text) from public, anon;
grant execute on function public.pastor_buscar_membros(text) to authenticated;

-- ─── Lembretes por push (cron a cada 5 minutos) ───────────────────────────
create or replace function public.pastor_enviar_lembretes()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare r record; v_n int := 0; v_hora text;
begin
  for r in
    select c.* from public.pastor_compromissos c
     where c.status = 'agendado' and c.lembrete_min is not null and c.lembrete_enviado_em is null
       and c.inicio - make_interval(mins => c.lembrete_min) <= now()
       and c.inicio > now() - interval '30 minutes'
     for update skip locked
  loop
    v_hora := to_char(r.inicio at time zone 'Europe/London', 'DD/MM HH24:MI');
    perform public.push_para(r.dono, '📅 ' || r.titulo,
      v_hora || coalesce(' · ' || r.pessoa, '') || coalesce(' · ' || r.local, ''),
      jsonb_build_object('type', 'pastor', 'id', r.id));
    update public.pastor_compromissos set lembrete_enviado_em = now() where id = r.id;
    v_n := v_n + 1;
  end loop;

  for r in
    select l.* from public.pastor_lembretes l
     where not l.feito and l.enviado_em is null and l.quando <= now()
     for update skip locked
  loop
    perform public.push_para(r.dono, '🔔 Lembrete', r.texto, jsonb_build_object('type', 'pastor', 'aba', 'lembretes'));
    update public.pastor_lembretes set enviado_em = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.pastor_enviar_lembretes() from public, anon, authenticated;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'pastor-lembretes';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('pastor-lembretes', '*/5 * * * *', 'select public.pastor_enviar_lembretes();');
end $$;
