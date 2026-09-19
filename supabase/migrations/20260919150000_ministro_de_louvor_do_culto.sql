-- ============================================================================
-- Ministro(a) de louvor do culto
--
-- A PERGUNTA QUE ISTO RESPONDE
-- "Quem está à frente do louvor neste domingo?" Hoje a escala diz quem toca
-- o quê, mas não diz quem conduz — e é essa a pessoa a quem os outros
-- perguntam o tom, a ordem e se cabe mais uma música.
--
-- COMO A PESSOA É IDENTIFICADA
-- Por um gesto que já acontece: quem monta o setlist do culto. Foi a decisão
-- do Marcos em 19/09 — "o ministro entra e adiciona a playlist, essa pessoa
-- já pode ser identificada automaticamente". Ninguém preenche um campo a
-- mais, e no fluxo real da Peniel é quase sempre a pessoa certa.
--
-- POR QUE "QUASE SEMPRE" IMPORTA
-- Um admin que monte o culto de outra pessoa viraria ministro dela. Por isso
-- o automático só age quando o campo está VAZIO, e a tela deixa trocar. Um
-- palpite que não se pode corrigir vira um dado errado permanente — e este
-- em particular apareceria com o nome de alguém na frente da banda inteira.
-- ============================================================================


-- `cultos` nasceu fora das migrations, direto no painel do Supabase (a
-- migração 20260902170100 conta essa história). `add column if not exists`
-- por isso: a tabela existe, a coluna não.
--
-- `on delete set null`: se alguém sai da banda, o culto passado não some nem
-- trava — só deixa de ter ministro registrado.
alter table public.cultos
  add column if not exists ministro_id uuid
    references public.banda_membros(id) on delete set null;

comment on column public.cultos.ministro_id is
  'Quem conduz o louvor neste culto. Preenchido sozinho por quem monta o '
  'setlist, e trocável à mão na aba Banda.';


-- ─── O automático ───────────────────────────────────────────────────────────
-- Gatilho em `culto_songs` e não em `cultos`: na criação de um culto o app
-- insere a linha do culto e as músicas em seguida, e é a segunda operação
-- que carrega a intenção. Um culto criado sem setlist ainda não tem
-- ministro — e é correto que não tenha, porque ninguém montou nada.
--
-- `where ... and ministro_id is null` faz três coisas de uma vez: só a
-- primeira música do lote escreve, um setlist editado depois não rouba o
-- ministro de quem já estava lá, e uma correção feita à mão sobrevive a
-- qualquer edição posterior das músicas.

create or replace function public.culto_define_ministro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro uuid;
begin
  -- Sem sessão não há quem identificar: uma carga por service role ou por
  -- SQL Editor não deve inventar um ministro.
  if auth.uid() is null then return new; end if;

  select bm.id into v_membro
    from public.banda_membros bm
   where bm.profile_id = auth.uid()
   limit 1;

  -- Quem não é da banda (um admin da igreja, por exemplo) pode montar o
  -- setlist sem virar ministro de louvor. O campo fica vazio e alguém
  -- escolhe na tela.
  if v_membro is null then return new; end if;

  update public.cultos
     set ministro_id = v_membro
   where id = new.culto_id
     and ministro_id is null;

  return new;
end;
$$;

drop trigger if exists culto_songs_define_ministro on public.culto_songs;
create trigger culto_songs_define_ministro
  after insert on public.culto_songs
  for each row execute function public.culto_define_ministro();


-- ─── Conferência ────────────────────────────────────────────────────────────
--   select c.label, c.date, bm.nome as ministro
--     from public.cultos c
--     left join public.banda_membros bm on bm.id = c.ministro_id
--    order by c.date desc limit 10;
--
-- Cultos antigos ficam com ministro vazio: o gatilho olha para frente, e
-- adivinhar retroativamente por quem inseriu as músicas não é possível —
-- `culto_songs` não guarda autor. A tela deixa preencher à mão os que
-- valerem a pena.
