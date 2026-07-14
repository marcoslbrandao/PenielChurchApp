-- ============================================================================
-- Códigos de acesso únicos para a área da Banda de Louvor
--
-- Hoje a BandaScreen usa uma senha fixa ('PENIEL2024') escrita no código-fonte
-- do app — a mesma para todo mundo, para sempre, e visível a quem inspecionar
-- o bundle do app. Esta migração reaproveita a tabela `invite_codes` (já usada
-- para convidar membros) adicionando um tipo, e cria uma função para resgatar
-- códigos de banda de forma segura e de uso único, sem alterar o role do
-- perfil do usuário (diferente do convite de membro).
-- ============================================================================

alter table public.invite_codes
  add column if not exists tipo text not null default 'membro' check (tipo in ('membro', 'banda'));

create or replace function public.use_banda_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row invite_codes%rowtype;
begin
  select * into v_row from invite_codes
    where code = upper(trim(p_code)) and tipo = 'banda'
    for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Código inválido.');
  end if;

  if v_row.is_used then
    return jsonb_build_object('success', false, 'error', 'Este código já foi utilizado.');
  end if;

  if v_row.expires_at is not null and v_row.expires_at < now() then
    return jsonb_build_object('success', false, 'error', 'Este código expirou.');
  end if;

  update invite_codes set is_used = true, used_at = now() where id = v_row.id;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.use_banda_code(text) to authenticated;
