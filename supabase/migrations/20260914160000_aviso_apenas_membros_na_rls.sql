-- ============================================================================
-- `avisos.apenas_membros` passa a valer no banco (14 Set 2026)
--
-- A COLUNA EXISTE DESDE 21 DE AGOSTO E NUNCA FOI RESPEITADA PELA LEITURA
-- `apenas_membros` (migração 20260821090000) sempre governou só QUEM RECEBE O
-- PUSH: a `content-notifications` filtra os tokens por `role != 'visitante'`.
-- A RLS nunca olhou para a coluna. Na prática, um aviso marcado como "só
-- membros" — o lembrete da Reunião de Oração, por exemplo — não ia por push
-- para visitante, mas aparecia no mural para qualquer pessoa logada. E desde
-- 20260914120000, que abriu o aviso geral para quem não tem conta, aparecia
-- para todo mundo.
--
-- Nada grave no conteúdo publicado até aqui. O problema é a promessa: uma
-- marcação chamada "apenas membros" que não restringe nada é pior que não
-- existir, porque alguém vai escrever um recado confiando nela.
--
-- O QUE MUDA
-- O aviso geral passa a ter dois casos em vez de um:
--   • `apenas_membros = false` → público, inclusive sem conta (o padrão da
--     coluna, e o caso da esmagadora maioria dos avisos);
--   • `apenas_membros = true`  → só quem tem conta com papel de membro,
--     líder ou admin.
-- Aviso de grupo não muda: continua por `tem_acesso_grupo()`.
-- ============================================================================

-- Mesmo critério que a `content-notifications` usa para escolher os tokens:
-- tem conta e o papel não é 'visitante'. `security definer` porque a policy
-- de `avisos` precisa ler `profiles`, e quem está lendo o aviso nem sempre
-- pode ler a linha de perfil — sem isto a policy devolveria falso por falta
-- de permissão, não por falta de papel.
create or replace function public.is_membro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and coalesce(role, 'visitante') <> 'visitante'
  );
$$;

revoke all on function public.is_membro() from public;
grant execute on function public.is_membro() to anon, authenticated;

drop policy if exists "Aviso geral é público pra todos" on public.avisos;

create policy "Aviso geral aberto é público pra todos"
  on public.avisos
  for select
  using (grupo is null and apenas_membros = false);

create policy "Aviso geral de membros só pra membros"
  on public.avisos
  for select
  using (grupo is null and apenas_membros = true and public.is_membro());

-- ─── Conferência ───────────────────────────────────────────────────────────
-- 1. Quatro policies de SELECT em `avisos` (duas gerais + a de grupo), e
--    nenhuma com auth.role():
--      select policyname, cmd, qual from pg_policies
--      where schemaname = 'public' and tablename = 'avisos' order by cmd;
--
-- 2. Marcar um aviso de teste com apenas_membros = true e conferir no app:
--    aparece para a conta de membro, some para a conta de visitante e para
--    quem está sem conta.
