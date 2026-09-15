-- ============================================================================
-- Participante do grupo passa a ver quem mais está no grupo — 15 Set 2026
--
-- Regra de produto (Marcos): só o líder tem o Admin do grupo e só ele adiciona
-- ou remove participantes. O participante comum pode VER os outros
-- participantes, sem poder mexer. Vale para todos os grupos.
--
-- Nenhuma policy nova em `grupo_membros`: a tabela continua fechada para admin
-- e líder. Quem abre é a RPC `participantes_do_grupo`, que é security definer
-- e devolve SÓ nome e sobrenome — sem telefone, endereço ou as observações da
-- liderança. Trocar a policy da tabela entregaria as linhas inteiras
-- (membro_id, adicionado_por, created_at) para todo membro do grupo, e não é
-- disso que a tela precisa.
--
-- `membros_para_grupo` — a busca no diretório para ADICIONAR alguém — continua
-- exigindo admin ou líder. É ela que encosta no diretório da igreja, e é ela
-- que não pode afrouxar.
--
-- `tem_acesso_grupo(p_grupo)` já existe desde 20260727160000 e é exatamente a
-- conta certa: admin, ou líder daquele grupo, ou participante daquele grupo.
-- ============================================================================

create or replace function public.participantes_do_grupo(p_grupo text)
returns table (id uuid, membro_id uuid, nome text, sobrenome text)
language sql
stable
security definer
set search_path = public
as $$
  select gm.id, gm.membro_id, m.nome, m.sobrenome
  from public.grupo_membros gm
  join public.members m on m.id = gm.membro_id
  where public.tem_acesso_grupo(p_grupo)
    and gm.grupo = p_grupo
  order by m.nome, m.sobrenome;
$$;

revoke all on function public.participantes_do_grupo(text) from public;
grant execute on function public.participantes_do_grupo(text) to authenticated;

-- Conferência depois de aplicar: como um membro comum do grupo, a chamada
-- `select * from participantes_do_grupo('homens')` deve devolver a lista;
-- `select * from membros_para_grupo('homens', 'a')` deve devolver vazio; e
-- `insert into grupo_membros ...` deve ser barrado pela RLS.
