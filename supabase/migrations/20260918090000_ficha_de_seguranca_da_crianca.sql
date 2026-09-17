-- ============================================================================
-- Ficha de segurança: alergia, necessidade especial e o recado do responsável
--
-- Pedido do Marcos (18/09): o pai deve poder informar alergia, necessidade
-- especial e "outra informação relevante" sobre o filho.
--
-- POR QUE ISTO É O CAMPO MAIS SENSÍVEL DA TABELA
-- Alergia e necessidade especial são DADO DE SAÚDE — e de um menor. No Reino
-- Unido isso é categoria especial sob o UK GDPR, com um patamar de cuidado
-- acima do resto do cadastro. Nada disso é motivo para não guardar: a igreja
-- precisa saber de alergia a amendoim ANTES do lanche de domingo, e essa é a
-- razão de a coluna existir. É motivo para o dado não escapar.
--
-- Onde ele NÃO vai, e por construção, não por disciplina:
--
--   • `aniversariantes_do_mes` (migração 20260917220000) devolve nome,
--     sobrenome, dia e mês. Uma função com colunas fixas não passa a vazar um
--     campo novo porque a tabela ganhou um — é justamente por isso que a lista
--     pública é uma RPC e não um select na tabela.
--   • `participantes_do_grupo` e `membros_para_grupo` devolvem só nome e
--     sobrenome, pelo mesmo desenho.
--   • `members` continua fechada: admin, o próprio dono da linha, e o
--     responsável sobre os dependentes dele. Nenhuma policy nova aqui.
--
-- SEPARADO DE `observacoes`, DE PROPÓSITO
-- `observacoes` são as notas INTERNAS da liderança sobre a pessoa —
-- aconselhamento, situação familiar — e o gatilho
-- `members_protege_campos_trg` impede o cliente de escrever nelas. O que o pai
-- informa sobre o próprio filho é outra coisa, com outro dono e outra
-- visibilidade, e juntar as duas numa coluna só perderia essa distinção para
-- sempre. É a mesma lição de `compartilhar_mais` vs `observacoes`, na
-- migração 20260821100000.
--
-- AS COLUNAS VALEM PARA QUALQUER PESSOA, não só criança: um adulto com alergia
-- grave é a mesma informação no mesmo almoço da igreja. Por ora só o cartão
-- "Meus filhos" e o Admin preenchem; estender ao próprio membro em Meu
-- Cadastro não precisa de migração nova.
-- ============================================================================

alter table public.members
  add column if not exists alergias text,
  add column if not exists necessidades_especiais text,
  add column if not exists info_responsavel text;

comment on column public.members.alergias is
  'Alergias e restrições alimentares, escritas pelo responsável (ou pelo '
  'próprio membro). DADO DE SAÚDE: não pode ser exposto por nenhuma RPC '
  'pública. Visível para admin, para o dono da linha e para o responsável.';

comment on column public.members.necessidades_especiais is
  'Necessidade de apoio, condição ou cuidado que a sala precisa conhecer. '
  'Mesmas restrições de visibilidade de `alergias`.';

comment on column public.members.info_responsavel is
  'Campo livre do RESPONSÁVEL — "o que mais você quer que a gente saiba". '
  'Não confundir com `observacoes`, que são as notas internas da liderança e '
  'que o cliente não pode escrever (gatilho members_protege_campos_trg).';
