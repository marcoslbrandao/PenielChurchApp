-- ============================================================================
-- Versão mínima do app, por plataforma
--
-- O aviso de "versão nova disponível" no iPhone é automático: o app pergunta
-- à App Store (itunes.apple.com/lookup). Esta tabela serve para o caso
-- OBRIGATÓRIO: quando uma versão tem que ser instalada de qualquer jeito, o
-- admin sobe `versao_minima` e quem estiver abaixo vê a tela "Atualize para
-- continuar", sem botão de fechar.
--
-- Leitura pública (inclusive sem login): quem precisa atualizar pode nem ter
-- conta. Escrita só admin — pelo SQL Editor:
--
--   update public.app_versao set versao_minima = '1.4.1', atualizado_em = now()
--    where plataforma = 'ios';
--
-- Só subir DEPOIS que a versão estiver aprovada e disponível na loja daquela
-- plataforma — senão a pessoa fica presa numa tela pedindo uma atualização
-- que a loja ainda não tem.
-- ============================================================================

create table if not exists public.app_versao (
  plataforma text primary key check (plataforma in ('ios', 'android')),
  versao_minima text not null default '0.0.0'
    check (versao_minima ~ '^\d+\.\d+\.\d+$'),
  atualizado_em timestamptz not null default now()
);

insert into public.app_versao (plataforma) values ('ios'), ('android')
on conflict (plataforma) do nothing;

alter table public.app_versao enable row level security;

drop policy if exists "Todo mundo lê a versão mínima" on public.app_versao;
create policy "Todo mundo lê a versão mínima"
  on public.app_versao for select
  to anon, authenticated
  using (true);

drop policy if exists "Admin muda a versão mínima" on public.app_versao;
create policy "Admin muda a versão mínima"
  on public.app_versao for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.app_versao to anon, authenticated;
grant update on public.app_versao to authenticated;
