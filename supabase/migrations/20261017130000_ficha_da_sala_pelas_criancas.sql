-- ============================================================================
-- Ficha da sala do Peniel Kids: lista as CRIANCAS cadastradas (17/10/2026)
--
-- Antes a ficha listava quem estava em `grupo_membros` do grupo `infantil`.
-- Agora o grupo infantil e a EQUIPE do Ministerio Infantil (professores e
-- auxiliares, aba "Kids" em Grupos), e as criancas nao entram nele. A ficha
-- passa a listar as criancas cadastradas pelos pais (members com
-- responsavel_id), ate 12 anos. Quem ve continua igual: admin e lider do
-- grupo infantil.
-- ============================================================================

create or replace function public.ficha_seguranca_sala(p_grupo text)
returns table (
  id uuid,
  nome text,
  sobrenome text,
  data_nascimento date,
  alergias text,
  necessidades_especiais text,
  info_responsavel text,
  responsavel_nome text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.id,
    m.nome,
    coalesce(m.sobrenome, ''),
    m.data_nascimento,
    m.alergias,
    m.necessidades_especiais,
    m.info_responsavel,
    coalesce(r.nome || coalesce(' ' || r.sobrenome, ''), '')
  from public.members m
  join public.members r on r.id = m.responsavel_id
  where p_grupo = 'infantil'
    and (public.is_admin() or public.is_grupo_leader(p_grupo))
    and (m.data_nascimento is null or m.data_nascimento > (current_date - interval '13 years'))
  order by m.nome;
$$;

revoke all on function public.ficha_seguranca_sala(text) from public, anon;
grant execute on function public.ficha_seguranca_sala(text) to authenticated;

-- Conferencia: quantas criancas a ficha vai mostrar
select count(*) as criancas_na_ficha
from public.members m
where m.responsavel_id is not null
  and (m.data_nascimento is null or m.data_nascimento > (current_date - interval '13 years'));
