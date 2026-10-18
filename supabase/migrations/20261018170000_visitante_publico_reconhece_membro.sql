-- Ficha de visitante (QR Code): quem já é membro não vira visitante.
--
-- Pedido do Marcos (18/10): se o telefone digitado na ficha pública for de um
-- membro (ou líder), a página mostra "você já é membro da Peniel" e NADA é
-- gravado em `visitantes`. O registro no log de limite continua acontecendo
-- antes, de propósito: é ele que impede alguém de testar telefone atrás de
-- telefone para descobrir quem é membro.
--
-- O telefone é comparado com a ficha (`members.telefone`) e com a conta do
-- app (`profiles.phone`), sempre pelos dígitos normalizados.
--
-- A Edge Function `visitante-publico` não muda: ela já repassa `erro` para a
-- página quando `ok` é false (status 400), e a página trata `erro = 'membro'`.

create or replace function public.registrar_visitante_publico(
  p_nome text,
  p_telefone text default null,
  p_email text default null,
  p_primeira_vez boolean default true,
  p_como_conheceu text default null,
  p_observacoes text default null,
  p_ip_hash text default null,
  p_max_por_ip int default 40,
  p_max_global int default 120
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no_ip int;
  v_global int;
  v_digitos text;
  v_id uuid;
begin
  if btrim(coalesce(p_nome, '')) = '' then
    return json_build_object('ok', false, 'erro', 'nome_vazio');
  end if;

  select count(*) into v_global
    from public.visitante_publico_log where criado_em > now() - interval '1 hour';
  if v_global >= p_max_global then
    return json_build_object('ok', false, 'erro', 'limite_global');
  end if;

  if p_ip_hash is not null then
    select count(*) into v_no_ip
      from public.visitante_publico_log
     where ip_hash = p_ip_hash and criado_em > now() - interval '1 hour';
    if v_no_ip >= p_max_por_ip then
      return json_build_object('ok', false, 'erro', 'limite_ip');
    end if;
  end if;

  insert into public.visitante_publico_log (ip_hash) values (p_ip_hash);

  v_digitos := public.normaliza_telefone(p_telefone);

  -- Já é membro? Não grava nada em `visitantes`.
  if v_digitos is not null and exists (
    select 1
      from public.members m
      left join public.profiles p on p.id = m.profile_id
     where m.status in ('membro', 'lider')
       and (public.normaliza_telefone(m.telefone) = v_digitos
            or public.normaliza_telefone(p.phone) = v_digitos)
  ) then
    return json_build_object('ok', false, 'erro', 'membro');
  end if;

  -- Mesma deduplicação da recepção: quem preencheu o formulário em agosto e
  -- preenche de novo hoje é a mesma pessoa, com duas visitas.
  if v_digitos is not null then
    select id into v_id from public.visitantes
     where telefone_digitos = v_digitos
     order by ultima_visita desc limit 1
     for update;
  end if;

  if v_id is not null then
    update public.visitantes
       set ultima_visita = current_date,
           total_visitas = total_visitas + 1,
           primeira_vez  = false,
           email         = coalesce(nullif(btrim(coalesce(p_email, '')), ''), email),
           como_conheceu = coalesce(como_conheceu, nullif(btrim(coalesce(p_como_conheceu, '')), '')),
           observacoes   = case
                             when btrim(coalesce(p_observacoes, '')) = '' then observacoes
                             when observacoes is null then p_observacoes
                             else observacoes || E'\n---\n' || p_observacoes
                           end,
           consentiu_contato = true,
           situacao = case when situacao in ('sem_retorno', 'contatado') then 'retornou' else situacao end
     where id = v_id;
    return json_build_object('ok', true, 'ja_existia', true);
  end if;

  insert into public.visitantes
    (nome, telefone, email, primeira_vez, como_conheceu, observacoes, consentiu_contato)
  values
    (btrim(p_nome),
     nullif(btrim(coalesce(p_telefone, '')), ''),
     nullif(btrim(coalesce(p_email, '')), ''),
     coalesce(p_primeira_vez, true),
     nullif(btrim(coalesce(p_como_conheceu, '')), ''),
     nullif(btrim(coalesce(p_observacoes, '')), ''),
     true)
  returning id into v_id;

  return json_build_object('ok', true, 'ja_existia', false);
end;
$$;
