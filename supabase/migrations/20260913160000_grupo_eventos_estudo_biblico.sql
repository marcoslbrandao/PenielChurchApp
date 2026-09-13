-- ============================================================================
-- `grupo_eventos` também aceita o grupo `estudo_biblico` (13 Set 2026)
--
-- A tabela nasceu em 20260709120000 com `check (grupo in ('mulheres',
-- 'homens', 'jovens'))`. O Estudo Bíblico virou grupo depois
-- (20260729100000) e ficou de fora do check — ninguém percebeu porque NUNCA
-- EXISTIU TELA PARA CRIAR EVENTO DE GRUPO: a tabela só era lida. Agora que a
-- criação existe no painel do líder, o líder do Estudo Bíblico tomaria um
-- erro de constraint na cara ao salvar.
-- ============================================================================

alter table public.grupo_eventos drop constraint if exists grupo_eventos_grupo_check;
alter table public.grupo_eventos add constraint grupo_eventos_grupo_check
  check (grupo in ('mulheres', 'homens', 'jovens', 'estudo_biblico'));

-- Conferência:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.grupo_eventos'::regclass;
