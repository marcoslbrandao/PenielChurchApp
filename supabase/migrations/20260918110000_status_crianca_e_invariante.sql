-- ============================================================================
-- `responsavel_id is not null` ⇒ `status = 'crianca'`, para TODO MUNDO
--
-- O BUG (encontrado pelo Marcos em 18/09, cadastrando o próprio filho)
-- O gatilho de 20260917220000 forçava `status = 'crianca'` dentro da guarda:
--
--     if auth.uid() is not null and not public.is_admin() then
--
-- Essa guarda existe para PROTEGER campos da liderança contra o cliente comum
-- — e para isso está certa. Só que a normalização do status foi escrita dentro
-- dela, e as duas coisas não são a mesma. Resultado: quando quem cadastra o
-- filho é um ADMIN, o bloco inteiro é pulado e a linha nasce com o status
-- padrão ('membro'), apesar de ter `responsavel_id` preenchido.
--
-- A criança ficava então invisível na aba Membros: escondida da lista
-- principal por ser dependente, e fora da pílula "Crianças" porque aquele
-- filtro olhava o status. A tela foi corrigida para filtrar por
-- `responsavel_id` — mas o dado errado no banco continuaria errado, e qualquer
-- consulta futura que confiasse no status herdaria o problema.
--
-- A SEPARAÇÃO QUE FALTAVA. São duas regras de naturezas diferentes:
--
--   1. INVARIANTE DO MODELO — dependente é criança. Vale para admin, para o
--      responsável, para o cron e para a migração. Não é proteção contra
--      ninguém; é a definição de o que a linha é.
--   2. PROTEÇÃO CONTRA O CLIENTE — `observacoes`, `profile_id` e a troca de
--      dono. Essa sim depende de quem chamou.
--
-- Estavam no mesmo `if`. Agora são dois blocos, e o primeiro vem antes.
--
-- CONSEQUÊNCIA PARA QUANDO A CRIANÇA CRESCER: promover um dependente a membro
-- exige limpar o `responsavel_id` primeiro. É o certo — enquanto ele existe, a
-- pessoa é um cadastro pendurado no de outra, sem conta própria.
-- ============================================================================

create or replace function public.members_protege_campos_da_lideranca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ── 1. Invariante do modelo: dependente é criança, venha de onde vier ──
  if new.responsavel_id is not null then
    new.status := 'crianca';
  end if;

  -- ── 2. Proteção contra o cliente comum ────────────────────────────────
  -- `auth.uid() is null` é o service_role, o cron e as migrações: precisam
  -- escrever e passam direto. Admin passa por `is_admin()`.
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'UPDATE' then
      new.observacoes    := old.observacoes;
      new.responsavel_id := old.responsavel_id;
      -- O status só é devolvido ao valor antigo quando a linha NÃO é de um
      -- dependente; do contrário este `else` desfaria a invariante acima.
      if new.responsavel_id is null then
        new.status := old.status;
      end if;
    else
      new.observacoes := null;
      if new.responsavel_id is not null then
        new.profile_id := null;
      elsif new.status = 'lider' then
        -- Quem chega sozinho chega como visitante. Promover é ato da
        -- liderança; a permissão real mora em `group_leaders`.
        new.status := 'visitante';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists members_protege_campos_trg on public.members;
create trigger members_protege_campos_trg
  before insert or update on public.members
  for each row execute function public.members_protege_campos_da_lideranca();


-- ─── Backfill: conserta quem já foi cadastrado com o status errado ──────────
-- Sem isto, as crianças cadastradas por um admin entre 17/09 e agora ficariam
-- com o status antigo para sempre — e a tela nova as mostraria, mas qualquer
-- relatório que contasse "membros" ainda as somaria como adultos.
update public.members
   set status = 'crianca'
 where responsavel_id is not null
   and status is distinct from 'crianca';
