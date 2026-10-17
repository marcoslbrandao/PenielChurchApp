-- ============================================================================
-- Versao RECOMENDADA do app, por plataforma (17/10/2026)
--
-- O aviso suave ("versao nova disponivel", com "Agora nao") so existia no
-- iPhone, porque so a App Store tem consulta publica de versao. No Android
-- ninguem era avisado. Agora o admin informa aqui a versao que esta nas lojas
-- (Admin -> Estatisticas -> Versao do app) e quem estiver abaixo dela ve o
-- aviso suave, no iPhone e no Android.
--
--   versao_recomendada -> aviso que da para fechar (volta em 3 dias)
--   versao_minima      -> tela obrigatoria "Atualize para continuar"
--
-- So subir DEPOIS que a versao estiver aprovada e publicada naquela loja.
-- ============================================================================

alter table public.app_versao
  add column if not exists versao_recomendada text not null default '0.0.0';

alter table public.app_versao drop constraint if exists app_versao_versao_recomendada_check;
alter table public.app_versao
  add constraint app_versao_versao_recomendada_check check (versao_recomendada ~ '^\d+\.\d+\.\d+$');

-- Conferencia:
select plataforma, versao_recomendada, versao_minima from public.app_versao order by plataforma;
