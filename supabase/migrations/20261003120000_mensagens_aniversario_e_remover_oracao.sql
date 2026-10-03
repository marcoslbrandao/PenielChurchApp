-- Mensagens de aniversario editaveis + admin remove pedido de oracao.
--
-- 1. textos_app: textos que o admin corrige pelo app (Admin > Textos), sem
--    novo build nem publicacao. {nome} vira o nome da pessoa.
--      aniversario_membro    -> Home de todos os membros, no dia, e o push do dia.
--      aniversario_visitante -> so o proprio visitante ve (Home + push so pra ele).
-- 2. aniversariantes_de_hoje(): quem faz aniversario hoje (Londres), so para
--    membros. Visitante nao entra: o aniversario dele e so dele.
-- 3. meu_aniversario_hoje(): a mensagem de visitante, para a propria pessoa.
-- 4. Admin pode apagar pedido de oracao.

create table if not exists public.textos_app (
  chave         text primary key,
  texto         text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id) on delete set null
);

alter table public.textos_app enable row level security;

drop policy if exists "Admin le os textos" on public.textos_app;
create policy "Admin le os textos"
  on public.textos_app for select
  using (public.is_admin());

drop policy if exists "Admin edita os textos" on public.textos_app;
create policy "Admin edita os textos"
  on public.textos_app for update
  using (public.is_admin())
  with check (public.is_admin());

insert into public.textos_app (chave, texto) values
  ('aniversario_membro',
   'Hoje é aniversário de {nome}! 🎂 A família Peniel Church celebra a sua vida e agradece a Deus por mais um ano. Que o Senhor te abençoe e te guarde!'),
  ('aniversario_visitante',
   'Feliz aniversário, {nome}! 🎂 A Peniel Church se alegra com você neste dia e ora para que Deus abençoe ricamente o seu novo ano de vida. Você é sempre bem-vindo(a) entre nós!')
on conflict (chave) do nothing;


create or replace function public.aniversariantes_de_hoje()
returns table (id uuid, nome text, sobrenome text, mensagem text)
language sql
security definer
stable
set search_path = public
as $$
  with hoje as (
    select (now() at time zone 'Europe/London')::date as d
  )
  select
    m.id,
    m.nome,
    coalesce(m.sobrenome, '') as sobrenome,
    -- O modelo vai cru (com {nome}): com dois aniversariantes no mesmo dia o
    -- app junta os nomes numa frase so.
    coalesce((select texto from public.textos_app where chave = 'aniversario_membro'), '') as mensagem
  from public.members m, hoje
  where public.is_membro()
    and m.data_nascimento is not null
    and coalesce(m.mostrar_aniversario, true)
    and m.status <> 'visitante'
    and extract(month from m.data_nascimento) = extract(month from hoje.d)
    and extract(day   from m.data_nascimento) = extract(day   from hoje.d)
  order by m.nome;
$$;

revoke all on function public.aniversariantes_de_hoje() from public, anon;
grant execute on function public.aniversariantes_de_hoje() to authenticated;


create or replace function public.meu_aniversario_hoje()
returns table (nome text, mensagem text)
language sql
security definer
stable
set search_path = public
as $$
  with hoje as (
    select (now() at time zone 'Europe/London')::date as d
  )
  select
    m.nome,
    replace(
      coalesce((select texto from public.textos_app where chave = 'aniversario_visitante'), ''),
      '{nome}', m.nome
    ) as mensagem
  from public.members m, hoje
  where auth.uid() is not null
    and m.profile_id = auth.uid()
    and m.responsavel_id is null
    and m.status = 'visitante'
    and m.data_nascimento is not null
    and extract(month from m.data_nascimento) = extract(month from hoje.d)
    and extract(day   from m.data_nascimento) = extract(day   from hoje.d)
  limit 1;
$$;

revoke all on function public.meu_aniversario_hoje() from public, anon;
grant execute on function public.meu_aniversario_hoje() to authenticated;


-- O push agora pode ter um terceiro tipo: 'visitante' (so pra pessoa).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.aniversario_push_log'::regclass and contype = 'c'
  loop
    execute format('alter table public.aniversario_push_log drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.aniversario_push_log
  add constraint aniversario_push_log_tipo_check
  check (tipo in ('vespera', 'dia', 'visitante'));


drop policy if exists "Admin remove pedido de oração" on public.prayer_requests;
create policy "Admin remove pedido de oração"
  on public.prayer_requests for delete
  using (public.is_admin());
