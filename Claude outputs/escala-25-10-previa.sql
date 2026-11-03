-- PREVIA (so le, nao envia nada): quem recebe o lembrete da escala de amanha (25/10)
with escalados as (
  select m.id as membro_id, m.nome, m.profile_id,
         string_agg(a.nome, ' e ' order by a.nome) as areas
  from public.escala_designacoes d
  join public.escala_areas a on a.id = d.area_id
  join public.members m on m.id = d.membro_id
  where d.data = date '2026-10-25'
  group by m.id, m.nome, m.profile_id
)
select
  e.nome || ' ' as pessoa,
  e.areas,
  (select count(*) from public.push_tokens t where t.user_id = e.profile_id) as celulares,
  case
    when e.profile_id is null then 'NAO RECEBE: sem conta no app'
    when not exists (select 1 from public.push_tokens t where t.user_id = e.profile_id) then 'NAO RECEBE: notificacao desligada'
    else 'recebe'
  end as situacao,
  '📋 Você está na escala de amanhã!' as titulo,
  'Olá, ' || split_part(trim(e.nome), ' ', 1) || '! Amanhã, domingo (25/10), você serve em ' || e.areas || '. Obrigado por servir! 🙏' as mensagem
from escalados e
order by situacao desc, pessoa;
