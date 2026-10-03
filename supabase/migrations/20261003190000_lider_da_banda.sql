-- Lider da Banda.
--
-- A Banda nao e um grupo (nao vive em group_leaders): tem equipe propria
-- (banda_membros) e, ate aqui, so o admin tinha os poderes de lideranca
-- (ver rascunhos de escala, apagar culto, moderar chat e comentarios).
-- banda_lideres da esses mesmos poderes, dentro da Banda, a quem o admin
-- marcar na ficha do membro (Membros > Conta no app > Lider da Banda).

create table if not exists public.banda_lideres (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  adicionado_por uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.banda_lideres enable row level security;

drop policy if exists "Logado ve lideres da banda" on public.banda_lideres;
create policy "Logado ve lideres da banda"
  on public.banda_lideres for select
  using (auth.uid() is not null);

drop policy if exists "Admin gerencia lideres da banda" on public.banda_lideres;
create policy "Admin gerencia lideres da banda"
  on public.banda_lideres for all
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.is_banda_lider()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (select 1 from public.banda_lideres where profile_id = auth.uid());
$$;
revoke all on function public.is_banda_lider() from public, anon;
grant execute on function public.is_banda_lider() to authenticated;

-- Quem vira lider da banda ganha acesso a Banda e entra na equipe.
create or replace function public.banda_lider_garante_acesso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_nome text;
begin
  update public.profiles set banda_acesso = true where id = new.profile_id;
  select full_name into v_nome from public.profiles where id = new.profile_id;
  insert into public.banda_membros (profile_id, nome)
  values (new.profile_id, coalesce(v_nome, 'Sem nome'))
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists banda_lider_garante_acesso_trg on public.banda_lideres;
create trigger banda_lider_garante_acesso_trg
  after insert on public.banda_lideres
  for each row execute function public.banda_lider_garante_acesso();

-- Saiu da igreja (ficha virou visitante): deixa de liderar a banda tambem.
create or replace function public.members_tira_lider_da_banda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'visitante' and old.status is distinct from 'visitante'
     and new.profile_id is not null and new.responsavel_id is null then
    delete from public.banda_lideres where profile_id = new.profile_id;
  end if;
  return new;
end;
$$;

drop trigger if exists members_tira_lider_da_banda_trg on public.members;
create trigger members_tira_lider_da_banda_trg
  after update of status on public.members
  for each row execute function public.members_tira_lider_da_banda();

-- Poderes de lideranca dentro da Banda: admin OU lider da banda.
drop policy if exists "Admin apaga culto" on public.cultos;
drop policy if exists "Lider da banda apaga culto" on public.cultos;
create policy "Lider da banda apaga culto"
  on public.cultos for delete using (public.is_banda_lider());

drop policy if exists "Autor ou admin apaga mensagem da banda" on public.banda_chat_mensagens;
create policy "Autor ou admin apaga mensagem da banda"
  on public.banda_chat_mensagens for delete
  using (autor_id = auth.uid() or public.is_banda_lider());

drop policy if exists "Autor ou admin apaga comentário" on public.culto_comentarios;
create policy "Autor ou admin apaga comentário"
  on public.culto_comentarios for delete
  using (autor_id = auth.uid() or public.is_banda_lider());
