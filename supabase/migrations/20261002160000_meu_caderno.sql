-- ============================================================================
-- Meu caderno — o caderno pessoal de cada participante do grupo (02 Out 2026)
--
-- Pedido do Marcos: o líder tem o caderno do líder (`grupo_caderno`), mas o
-- participante não tinha onde anotar. Decisões dele:
--   • Só a PRÓPRIA PESSOA lê. Nem o líder nem o Admin, pelo app. (Como em
--     `grupo_encontro_notas` e `grupo_caderno`, a service role e o dono do
--     banco continuam enxergando pelo painel do Supabase: RLS não vale para
--     eles.)
--   • Um caderno POR GRUPO.
--   • As anotações de aula que a pessoa já faz (`grupo_encontro_notas`)
--     aparecem juntas no caderno — isso é só leitura no app, sem tabela nova.
-- ============================================================================

create table if not exists public.grupo_caderno_pessoal (
  id uuid primary key default gen_random_uuid(),
  grupo text not null
        check (grupo in ('infantil', 'mulheres', 'homens', 'jovens', 'estudo_biblico')),
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  data date not null default current_date,
  titulo text not null default '' check (char_length(titulo) <= 120),
  texto text not null check (char_length(btrim(texto)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grupo_caderno_pessoal_idx
  on public.grupo_caderno_pessoal (profile_id, grupo, data desc, created_at desc);

alter table public.grupo_caderno_pessoal enable row level security;

-- Ler, editar e apagar: só a dona. Sem is_admin(), de propósito.
drop policy if exists "Meu caderno: só eu leio" on public.grupo_caderno_pessoal;
create policy "Meu caderno: só eu leio"
  on public.grupo_caderno_pessoal for select
  using (profile_id = auth.uid());

-- Escrever: só no caderno de um grupo de que a pessoa faz parte.
drop policy if exists "Meu caderno: escrevo no meu grupo" on public.grupo_caderno_pessoal;
create policy "Meu caderno: escrevo no meu grupo"
  on public.grupo_caderno_pessoal for insert
  with check (profile_id = auth.uid() and public.tem_acesso_grupo(grupo));

drop policy if exists "Meu caderno: só eu edito" on public.grupo_caderno_pessoal;
create policy "Meu caderno: só eu edito"
  on public.grupo_caderno_pessoal for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "Meu caderno: só eu apago" on public.grupo_caderno_pessoal;
create policy "Meu caderno: só eu apago"
  on public.grupo_caderno_pessoal for delete
  using (profile_id = auth.uid());

-- O dono é sempre quem está logado — o valor que viesse do cliente é ignorado.
create or replace function public.caderno_pessoal_forca_dono()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.profile_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists grupo_caderno_pessoal_forca_dono on public.grupo_caderno_pessoal;
create trigger grupo_caderno_pessoal_forca_dono
  before insert on public.grupo_caderno_pessoal
  for each row execute function public.caderno_pessoal_forca_dono();

-- `toca_updated_at()` vem da 20260915170000 (caderno do líder).
drop trigger if exists grupo_caderno_pessoal_updated_at on public.grupo_caderno_pessoal;
create trigger grupo_caderno_pessoal_updated_at
  before update on public.grupo_caderno_pessoal
  for each row execute function public.toca_updated_at();
