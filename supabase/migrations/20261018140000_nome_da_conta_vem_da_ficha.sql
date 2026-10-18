-- ============================================================================
-- Nome da conta do app = nome completo da ficha de membro (18/10/2026)
--
-- Pedido do Marcos: corrigir o nome da conta usando o nome completo do
-- cadastro de membros, e que isso seja o PADRAO. Ex.: a conta "Bruno" virou
-- "Bruno Albuquerque"; aparecia so o primeiro nome na Banda, nos lideres dos
-- grupos e nos chats.
--
-- Regra: quem tem ficha de membro (members.profile_id, sem responsavel_id)
-- tem o nome da conta (profiles.full_name) igual a nome + sobrenome da ficha.
--   1. Ao criar/editar a ficha (Admin > Membros ou Meu Cadastro) ou ligar a
--      ficha a uma conta, o nome da conta e o da Banda sao atualizados.
--   2. Mudar o nome direto na conta (Perfil > Editar perfil, ou versao antiga
--      do app) nao desalinha: volta para o nome da ficha. O app novo mostra
--      o nome como "vem do Meu Cadastro".
--   3. Acerta agora as contas que estao diferentes (5 em 18/10).
-- Quem NAO tem ficha (visitante que so criou conta) continua com o nome que
-- digitou na conta.
-- Pode rodar de novo sem estragar nada.
-- ============================================================================

-- Nome completo de uma ficha.
create or replace function public.nome_da_ficha(p_nome text, p_sobrenome text)
returns text
language sql
immutable
as $$
  select nullif(btrim(coalesce(p_nome, '') || coalesce(' ' || nullif(btrim(p_sobrenome), ''), '')), '');
$$;

-- 1. Ficha -> conta (e Banda) --------------------------------------------------
create or replace function public.members_sincroniza_nome_da_conta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_nome text;
begin
  if new.profile_id is null or new.responsavel_id is not null then
    return new;
  end if;
  v_nome := public.nome_da_ficha(new.nome, new.sobrenome);
  if v_nome is null then
    return new;
  end if;
  update public.profiles set full_name = v_nome
   where id = new.profile_id and full_name is distinct from v_nome;
  update public.banda_membros set nome = v_nome
   where profile_id = new.profile_id and nome is distinct from v_nome;
  return new;
end;
$$;

drop trigger if exists members_sincroniza_nome_da_conta_trg on public.members;
create trigger members_sincroniza_nome_da_conta_trg
  after insert or update of nome, sobrenome, profile_id, responsavel_id on public.members
  for each row execute function public.members_sincroniza_nome_da_conta();

-- 2. Conta nao desalinha da ficha ----------------------------------------------
create or replace function public.profiles_nome_segue_a_ficha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_nome text;
begin
  select public.nome_da_ficha(m.nome, m.sobrenome) into v_nome
    from public.members m
   where m.profile_id = new.id and m.responsavel_id is null
   order by m.created_at nulls last
   limit 1;
  if v_nome is not null then
    new.full_name := v_nome;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_nome_segue_a_ficha_trg on public.profiles;
create trigger profiles_nome_segue_a_ficha_trg
  before update of full_name on public.profiles
  for each row execute function public.profiles_nome_segue_a_ficha();

-- 3. Acerta quem ja esta diferente ----------------------------------------------
update public.profiles p
   set full_name = x.nome
  from (
    select distinct on (m.profile_id) m.profile_id, public.nome_da_ficha(m.nome, m.sobrenome) as nome
      from public.members m
     where m.profile_id is not null and m.responsavel_id is null
     order by m.profile_id, m.created_at nulls last
  ) x
 where p.id = x.profile_id
   and x.nome is not null
   and p.full_name is distinct from x.nome;

update public.banda_membros bm
   set nome = p.full_name
  from public.profiles p
 where p.id = bm.profile_id
   and exists (select 1 from public.members m where m.profile_id = p.id and m.responsavel_id is null)
   and bm.nome is distinct from p.full_name;

-- Conferencia: deve voltar vazio (todas as contas iguais a ficha)
select p.full_name as conta, public.nome_da_ficha(m.nome, m.sobrenome) as ficha
  from public.members m join public.profiles p on p.id = m.profile_id
 where m.responsavel_id is null
   and p.full_name is distinct from public.nome_da_ficha(m.nome, m.sobrenome);
