-- ============================================================================
-- Caderno do líder — anotações livres do grupo (15 Set 2026)
--
-- Pedido do Marcos: um caderno no sentido literal. Entradas datadas, com
-- título e texto — "onde paramos", decisões, ideias para a próxima aula, o
-- que rendeu e o que não.
--
-- QUEM LÊ: OS LÍDERES DAQUELE GRUPO, E SÓ ELES — escolha do Marcos.
--
-- É a primeira tabela do app em que `is_admin()` NÃO aparece na policy. Em
-- todo o resto, admin vê tudo. Aqui não: a policy é `is_grupo_leader(grupo)`
-- e nada mais. Três consequências que vêm junto, e que são reais:
--
--   1. O admin da igreja não lê o caderno PELO APP. Ele continua podendo ler
--      pelo painel do Supabase — RLS não se aplica à service role nem ao dono
--      do banco. Ou seja, "sem o admin" quer dizer "sem o admin dentro do
--      app", e não sigilo contra quem administra o banco. Prometer mais que
--      isso seria mentira.
--   2. O admin pode se nomear líder do grupo (`group_leaders`) e passar a
--      ler. É o mesmo poder que ele já tem sobre qualquer grupo.
--   3. Se o último líder do grupo for removido, as anotações ficam sem
--      ninguém que possa lê-las pelo app. Elas não somem — continuam no banco
--      e aparecem de novo assim que alguém for nomeado líder daquele grupo.
--
-- ESCREVER, EDITAR E APAGAR é só de quem escreveu. Ler é de todos os líderes
-- do grupo: é justamente isso que faz o caderno servir para o próximo líder
-- retomar de onde o anterior parou. Um caderno que só o autor lê já existe no
-- app (as anotações de aula, em `grupo_encontro_notas`) e não é o que foi
-- pedido aqui.
--
-- NÃO É FICHA PASTORAL. Não há vínculo com `members` de propósito: anotação
-- sobre pessoa identificável é outra decisão, com outras regras de quem lê e
-- por quanto tempo fica, e ficou para depois.
-- ============================================================================

create table if not exists public.grupo_caderno (
  id uuid primary key default gen_random_uuid(),
  grupo text not null check (grupo in ('mulheres', 'homens', 'jovens', 'estudo_biblico')),
  -- A data DA ANOTAÇÃO, que não é a data em que ela foi escrita: o líder
  -- anota na quinta o que aconteceu na quarta. `created_at` guarda a outra.
  data date not null default current_date,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 120),
  texto text not null check (char_length(btrim(texto)) between 1 and 5000),
  autor_id uuid not null references public.profiles(id) on delete cascade,
  autor_nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grupo_caderno_grupo_idx
  on public.grupo_caderno (grupo, data desc, created_at desc);

alter table public.grupo_caderno enable row level security;

-- Sem `is_admin()`, de propósito — ver o cabeçalho.
drop policy if exists "Líder do grupo lê o caderno do grupo" on public.grupo_caderno;
create policy "Líder do grupo lê o caderno do grupo"
  on public.grupo_caderno for select
  using (public.is_grupo_leader(grupo));

drop policy if exists "Líder do grupo escreve no caderno" on public.grupo_caderno;
create policy "Líder do grupo escreve no caderno"
  on public.grupo_caderno for insert
  with check (public.is_grupo_leader(grupo) and autor_id = auth.uid());

drop policy if exists "Cada um edita a própria anotação" on public.grupo_caderno;
create policy "Cada um edita a própria anotação"
  on public.grupo_caderno for update
  using (autor_id = auth.uid() and public.is_grupo_leader(grupo))
  with check (autor_id = auth.uid() and public.is_grupo_leader(grupo));

drop policy if exists "Cada um apaga a própria anotação" on public.grupo_caderno;
create policy "Cada um apaga a própria anotação"
  on public.grupo_caderno for delete
  using (autor_id = auth.uid() and public.is_grupo_leader(grupo));

-- O SERVIDOR ASSINA A ANOTAÇÃO. Mesmo gatilho dos três chats e das perguntas
-- da aula (`forca_autor_da_mensagem`, de 20260909010000): `autor_id` e
-- `autor_nome` saem do `auth.uid()`, nunca do que o cliente mandou. Aqui isso
-- vale duas vezes, porque `autor_id` é o que decide quem pode editar e apagar.
drop trigger if exists grupo_caderno_forca_autor on public.grupo_caderno;
create trigger grupo_caderno_forca_autor
  before insert on public.grupo_caderno
  for each row execute function public.forca_autor_da_mensagem();

-- Genérica de propósito: `toca_updated_at_presenca` (20260915150000) faz o
-- mesmo, mas o nome dela é de outra tabela. Duplicar quatro linhas custa menos
-- que renomear uma função de uma migração que já pode ter sido aplicada.
create or replace function public.toca_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists grupo_caderno_updated_at on public.grupo_caderno;
create trigger grupo_caderno_updated_at
  before update on public.grupo_caderno
  for each row execute function public.toca_updated_at();

-- ─── Conferência depois de aplicar ───────────────────────────────────────────
-- Como líder do Estudo Bíblico: insert e select funcionam.
-- Como líder de OUTRO grupo: `select * from grupo_caderno` volta vazio.
-- Como admin que NÃO lidera o grupo: também volta vazio — é o ponto desta
--   tabela, e é o único lugar do app onde isso acontece.
-- Como participante comum: vazio, e o insert é barrado.
