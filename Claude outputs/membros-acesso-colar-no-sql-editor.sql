-- ============================================================================
-- 26/10/2026 - Quem esta na lista de Membros TEM acesso de membro
--
-- Problema: membros da lista sem acesso a area de membros, e ofertas que
-- aparecem como "Membro removido" no relatorio.
--
-- O acesso vem de profiles.role (is_membro()); a lista vem de members (a
-- ficha). As duas coisas se desencontravam por quatro caminhos:
--   1. "Vincular conta" na ficha so gravava members.profile_id. O papel da
--      conta continuava 'visitante' (o gatilho members_sincroniza_papel so
--      reage a mudanca de STATUS, nao de vinculo).
--   2. Conta duplicada apagada: o vinculo da ficha volta a null (on delete
--      set null) e a conta que sobrou continua visitante e solta.
--   3. Ficha criada pelo Admin antes de a pessoa criar conta: a conta nova
--      entrava como visitante e nunca se ligava a ficha.
--   4. "Tornar membro" numa conta com e-mail diferente do da ficha criava uma
--      SEGUNDA ficha em vez de usar a que ja existia.
-- Ofertas: "Membro removido" era oferta sem conta (user_id nulo, ex.: cartao
-- sem login). E excluir a conta APAGAVA as ofertas da pessoa (cascade).
--
-- Regra daqui pra frente: ficha com status membro/lider ligada a uma conta
-- => a conta e membro. Pode rodar mais de uma vez sem problema.
-- ============================================================================


-- ─── 0. Nome comparavel (sem acento, minusculo, espacos simples) ────────────
create or replace function public.normaliza_nome(p text)
returns text
language sql
immutable
as $$
  select nullif(
    translate(
      lower(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ), '');
$$;


-- ─── 1. Ficha de membro ligada a conta => conta vira membro ─────────────────
create or replace function public.members_garante_acesso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsavel_id is null
     and new.status in ('membro', 'lider')
     and new.profile_id is not null then
    update public.profiles
       set role = 'membro'
     where id = new.profile_id
       and coalesce(role, 'visitante') = 'visitante';
  end if;
  return new;
end;
$$;

drop trigger if exists members_garante_acesso_trg on public.members;
create trigger members_garante_acesso_trg
  after insert or update of profile_id, status on public.members
  for each row execute function public.members_garante_acesso();


-- ─── 2. Tornar membro reaproveita a ficha que ja existe ─────────────────────
-- Antes: so procurava ficha sem dono pelo E-MAIL. Agora tambem pelo TELEFONE
-- e, por ultimo, pelo NOME COMPLETO — sempre so quando o resultado e unico,
-- para nunca ligar a pessoa errada. So roda quando o papel muda para membro,
-- e isso so o Admin faz.
create or replace function public.garantir_ficha_membro(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_full_name text;
  v_email text;
  v_phone text;
  v_primeiro_nome text;
  v_id uuid;
begin
  select id into v_id from public.members
   where profile_id = p_profile_id and responsavel_id is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select p.full_name, u.email, p.phone into v_full_name, v_email, v_phone
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = p_profile_id;
  if not found then
    return null;
  end if;

  -- a) mesmo e-mail
  select id into v_id from (
    select m.id, count(*) over () as n from public.members m
     where m.profile_id is null and m.responsavel_id is null
       and m.email is not null and lower(trim(m.email)) = lower(v_email)
  ) x where n = 1;

  -- b) mesmo telefone
  if v_id is null and public.normaliza_telefone(v_phone) is not null then
    select id into v_id from (
      select m.id, count(*) over () as n from public.members m
       where m.profile_id is null and m.responsavel_id is null
         and public.normaliza_telefone(m.telefone) = public.normaliza_telefone(v_phone)
    ) x where n = 1;
  end if;

  -- c) mesmo nome completo
  if v_id is null and public.normaliza_nome(v_full_name) is not null then
    select id into v_id from (
      select m.id, count(*) over () as n from public.members m
       where m.profile_id is null and m.responsavel_id is null
         and public.normaliza_nome(m.nome || ' ' || coalesce(m.sobrenome, ''))
             = public.normaliza_nome(v_full_name)
    ) x where n = 1;
  end if;

  if v_id is not null then
    update public.members set profile_id = p_profile_id where id = v_id;
  else
    v_primeiro_nome := split_part(coalesce(nullif(trim(v_full_name), ''), 'Membro'), ' ', 1);
    insert into public.members (nome, sobrenome, email, telefone, status, profile_id, membro_desde)
    values (
      v_primeiro_nome,
      trim(substring(coalesce(v_full_name, '') from length(v_primeiro_nome) + 1)),
      v_email, v_phone, 'membro', p_profile_id, current_date
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.garantir_ficha_membro(uuid) from public, anon, authenticated;


-- ─── 3. Conta nova com o e-mail de uma ficha de membro ──────────────────────
-- Se o Admin ja cadastrou a pessoa na lista e ela cria a conta com o MESMO
-- e-mail, a conta se liga a ficha e ja entra como membro — assim que o
-- e-mail estiver confirmado (o codigo do cadastro prova que o e-mail e dela).
-- Telefone NAO liga sozinho: qualquer um pode digitar o telefone de outra
-- pessoa no perfil.
create or replace function public.vincular_ficha_por_email(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_id uuid;
begin
  select u.email into v_email
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = p_profile_id
     and coalesce(p.role, 'visitante') = 'visitante'
     and u.email_confirmed_at is not null;
  if v_email is null then
    return;
  end if;
  -- Ja tem ficha? Entao nao mexe (pode ser quem saiu da igreja).
  if exists (select 1 from public.members
              where profile_id = p_profile_id and responsavel_id is null) then
    return;
  end if;

  select id into v_id from (
    select m.id, count(*) over () as n from public.members m
     where m.profile_id is null and m.responsavel_id is null
       and m.status in ('membro', 'lider')
       and m.email is not null and lower(trim(m.email)) = lower(v_email)
  ) x where n = 1;

  if v_id is not null then
    -- members_garante_acesso_trg promove a conta.
    update public.members set profile_id = p_profile_id where id = v_id;
  end if;
end;
$$;

revoke all on function public.vincular_ficha_por_email(uuid) from public, anon, authenticated;

create or replace function public.profiles_vincula_ficha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.vincular_ficha_por_email(new.id);
  exception when others then
    -- Nunca deixar o cadastro falhar por causa disto.
    raise warning 'vincular_ficha_por_email falhou: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists profiles_vincula_ficha_trg on public.profiles;
create trigger profiles_vincula_ficha_trg
  after insert on public.profiles
  for each row execute function public.profiles_vincula_ficha();

create or replace function public.auth_email_confirmado_vincula_ficha()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    begin
      perform public.vincular_ficha_por_email(new.id);
    exception when others then
      raise warning 'vincular_ficha_por_email falhou: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists auth_email_confirmado_vincula_ficha_trg on auth.users;
create trigger auth_email_confirmado_vincula_ficha_trg
  after update of email_confirmed_at on auth.users
  for each row execute function public.auth_email_confirmado_vincula_ficha();


-- ─── 4. CORRECAO DA LISTA DE HOJE ───────────────────────────────────────────
-- 4a. Ficha de membro sem conta: liga a conta com o MESMO e-mail (se essa
--     conta ainda nao estiver ligada a outra ficha).
do $$
declare r record;
begin
  for r in
    select m.id as member_id, p.id as profile_id
      from public.members m
      join auth.users u on lower(u.email) = lower(trim(m.email))
      join public.profiles p on p.id = u.id
     where m.profile_id is null
       and m.responsavel_id is null
       and m.status in ('membro', 'lider')
       and m.email is not null
       and not exists (select 1 from public.members m2
                        where m2.profile_id = p.id and m2.responsavel_id is null)
  loop
    update public.members set profile_id = r.profile_id
     where id = r.member_id and profile_id is null
       and not exists (select 1 from public.members m2
                        where m2.profile_id = r.profile_id and m2.responsavel_id is null);
  end loop;
end $$;

-- 4a2. Quem nao casou pelo e-mail (ex.: conta duplicada com outro e-mail):
--      liga pela conta com o mesmo TELEFONE ou o mesmo NOME COMPLETO, so
--      quando existe UMA conta candidata e ela casa com UMA ficha. Tudo o
--      que for ligado aqui aparece no resultado final para voce conferir.
create temp table if not exists _ligados_agora (ficha text, conta text, como text) on commit preserve rows;
truncate _ligados_agora;
do $$
declare r record;
begin
  for r in
    with cand as (
      select m.id as member_id, p.id as profile_id,
             trim(m.nome || ' ' || coalesce(m.sobrenome, '')) as ficha,
             coalesce(p.full_name, '') || ' <' || u.email || '>' as conta,
             case when public.normaliza_telefone(m.telefone) is not null
                   and public.normaliza_telefone(p.phone) = public.normaliza_telefone(m.telefone)
                  then 'mesmo telefone' else 'mesmo nome' end as como
        from public.members m
        join public.profiles p
          on (public.normaliza_telefone(m.telefone) is not null
               and public.normaliza_telefone(p.phone) = public.normaliza_telefone(m.telefone))
          or (public.normaliza_nome(p.full_name)
               = public.normaliza_nome(m.nome || ' ' || coalesce(m.sobrenome, '')))
        join auth.users u on u.id = p.id
       where m.profile_id is null
         and m.responsavel_id is null
         and m.status in ('membro', 'lider')
         and not exists (select 1 from public.members m2
                          where m2.profile_id = p.id and m2.responsavel_id is null)
    )
    select c.* from cand c
     where (select count(*) from cand c2 where c2.member_id = c.member_id) = 1
       and (select count(*) from cand c3 where c3.profile_id = c.profile_id) = 1
  loop
    update public.members set profile_id = r.profile_id
     where id = r.member_id and profile_id is null;
    insert into _ligados_agora values (r.ficha, r.conta, r.como);
  end loop;
end $$;

-- 4b. Toda ficha de membro/lider ligada a uma conta visitante: a conta vira
--     membro (este e o caso de quem esta na lista e nao entra na area).
update public.profiles p
   set role = 'membro'
  from public.members m
 where m.profile_id = p.id
   and m.responsavel_id is null
   and m.status in ('membro', 'lider')
   and coalesce(p.role, 'visitante') = 'visitante';

-- 4c. Toda conta membro/lider/admin tem ficha na lista.
do $$
declare r record;
begin
  for r in
    select p.id from public.profiles p
     where p.role in ('membro', 'lider', 'admin')
       and not exists (select 1 from public.members m
                        where m.profile_id = p.id and m.responsavel_id is null)
  loop
    perform public.garantir_ficha_membro(r.id);
  end loop;
end $$;


-- ─── 5. Ofertas: nome guardado e nada apagado junto com a conta ─────────────
alter table public.offerings add column if not exists pagante_nome text;

create or replace function public.offerings_guarda_nome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pagante_nome is null and new.user_id is not null then
    select full_name into new.pagante_nome from public.profiles where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists offerings_guarda_nome_trg on public.offerings;
create trigger offerings_guarda_nome_trg
  before insert or update of user_id on public.offerings
  for each row execute function public.offerings_guarda_nome();

update public.offerings o
   set pagante_nome = p.full_name
  from public.profiles p
 where p.id = o.user_id and o.pagante_nome is null;

-- Excluir a conta nao apaga mais o registro financeiro: a oferta fica, sem
-- dono, com o nome guardado. (Mesmo nome de constraint: o app usa ele.)
alter table public.offerings drop constraint if exists offerings_user_id_fkey;
alter table public.offerings
  add constraint offerings_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;


-- ─── 6. Resultado: confira o que foi ligado e o que ainda falta ────────────
-- "LIGADA AGORA": ficha que ganhou a conta pelo telefone ou pelo nome — confira
--   se e mesmo a pessoa (se nao for: ficha > Conta no app > Desvincular).
-- "SEM CONTA": ficha de membro que continua sem conta. A pessoa ainda nao
--   criou conta, ou criou com nome/telefone diferentes. Resolva em
--   ficha > Conta no app > Vincular — agora isso ja libera o acesso.
select 'LIGADA AGORA' as situacao, ficha, conta, como as detalhe
  from _ligados_agora
union all
select 'SEM CONTA',
       trim(m.nome || ' ' || coalesce(m.sobrenome, '')),
       '-',
       coalesce(nullif(concat_ws(' / ', m.email, m.telefone), ''), 'ficha sem e-mail nem telefone')
  from public.members m
 where m.profile_id is null
   and m.responsavel_id is null
   and m.status in ('membro', 'lider')
union all
select 'RESUMO', 'contas com acesso de membro', count(*)::text, 'membro + lider + admin'
  from public.profiles where role in ('membro', 'lider', 'admin')
order by 1, 2;
