-- Agenda dinâmica: substitui o array fixo `eventos` no AgendaScreen.tsx por
-- uma tabela que o admin/líder gerencia pelo Painel Admin.
-- Cobre tanto eventos recorrentes semanais (ex: Culto Dominical toda semana)
-- quanto eventos especiais com data marcada (ex: Camping Peniel 2026).

create table if not exists public.agenda_eventos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'presencial' check (tipo in ('presencial', 'online', 'casa')),
  recorrente boolean not null default true,
  dia_semana int check (dia_semana between 0 and 6), -- 0=Domingo ... 6=Sábado (só se recorrente)
  data date,                                          -- data específica (só se não recorrente)
  horario text not null,
  local text not null,
  descricao text,
  link_zoom text,
  meeting_id text,
  passcode text,
  map_url text,
  especial boolean not null default false,            -- true = aparece como banner de evento especial
  cor text,                                            -- cor do banner (só eventos especiais)
  created_at timestamptz not null default now()
);

alter table public.agenda_eventos enable row level security;

-- Agenda é pública dentro do app (não exige login) — leitura liberada.
drop policy if exists "Qualquer um vê a agenda" on public.agenda_eventos;
create policy "Qualquer um vê a agenda"
  on public.agenda_eventos for select
  using (true);

drop policy if exists "Admin/líder gerencia a agenda" on public.agenda_eventos;
create policy "Admin/líder gerencia a agenda"
  on public.agenda_eventos for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role in ('admin', 'lider')
  ));

-- Popula com os eventos que já existiam fixos no código, para não começar vazio.
insert into public.agenda_eventos (nome, tipo, recorrente, dia_semana, horario, local, descricao, map_url)
values
  ('Culto Dominical', 'presencial', true, 0, '18h00', 'Abbey Square, Reading', 'Nosso culto semanal com louvor, palavra e comunhão.', 'https://maps.google.com/?q=Peniel+Church+Reading');

insert into public.agenda_eventos (nome, tipo, recorrente, dia_semana, horario, local, descricao, link_zoom, meeting_id, passcode)
values
  ('Sala de Oração', 'online', true, 3, '21h00', 'Zoom', 'Reunião de oração e intercessão pelo Zoom.', 'https://us02web.zoom.us/j/89123221983?pwd=m6qRFHxC1Qaq6mETTzTrrYdwLXnG41.1', '891 2322 1983', '532371'),
  ('Estudo Bíblico', 'online', true, 5, '20h00', 'Zoom', 'Estudo profundo da Palavra de Deus pelo Zoom.', 'https://us02web.zoom.us/j/88370473540?pwd=rWbKlHoav2d5Oxc8pOFaGby5pbdmwR.1', '883 7047 3540', '547608');

insert into public.agenda_eventos (nome, tipo, recorrente, dia_semana, horario, local, descricao)
values
  ('Reunião de Jovens', 'casa', true, 6, '19h00', 'Nas casas', 'Encontro dos jovens em células. Entre em contato para receber o endereço.');

insert into public.agenda_eventos (nome, tipo, recorrente, data, horario, local, descricao, especial, cor)
values
  ('Camping Peniel 2026', 'presencial', false, '2026-08-28', 'Dia todo', 'A definir', 'Inscrições abertas! Não perca esse momento incrível.', true, '#E84B1A');
