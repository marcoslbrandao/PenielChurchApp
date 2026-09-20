-- Botões "Iniciar tradução" / "Parar tradução" no Painel Admin, controlando
-- remotamente o translator-service do Mac mini.
--
-- A tabela traducao_ao_vivo já existe em produção desde 24/08/2026 (criada
-- direto no SQL Editor, nunca tinha sido registrada como migração aqui) —
-- por isso o CREATE TABLE abaixo é IF NOT EXISTS, só pra deixar o schema
-- rastreado no repositório também, sem risco de conflitar com o que já
-- existe.
create table if not exists public.traducao_ao_vivo (
  id integer primary key,
  ativa boolean not null default false,
  idioma_origem text,
  idioma_destino text,
  iniciado_em timestamptz,
  atualizado_em timestamptz default now()
);

alter table public.traducao_ao_vivo enable row level security;

-- Leitura pública (qualquer um, logado ou não, precisa ver se está "ao
-- vivo" pra tela "Tradução ao vivo" mostrar o botão "Ouvir tradução").
drop policy if exists "traducao_ao_vivo select publico" on public.traducao_ao_vivo;
create policy "traducao_ao_vivo select publico"
  on public.traducao_ao_vivo for select
  using (true);

-- NOVO: admin pode ligar/desligar a tradução direto pelo app (botões
-- "Iniciar tradução" / "Parar tradução" no Painel Admin > Estatísticas),
-- sem precisar abrir Terminal/SSH no Mac mini a cada culto. O serviço no
-- Mac mini (que usa a service_role key, sempre ignora RLS) escuta essa
-- mudança via Realtime e liga/desliga a captura de áudio de verdade.
drop policy if exists "traducao_ao_vivo update admin" on public.traducao_ao_vivo;
create policy "traducao_ao_vivo update admin"
  on public.traducao_ao_vivo for update
  using (public.is_admin())
  with check (public.is_admin());

-- Garante que a tabela está na publicação de Realtime (idempotente — pode
-- já ter sido adicionada manualmente em 24/08/2026).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'traducao_ao_vivo'
  ) then
    alter publication supabase_realtime add table public.traducao_ao_vivo;
  end if;
end $$;
