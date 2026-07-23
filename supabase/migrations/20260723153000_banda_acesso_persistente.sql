-- ============================================================================
-- Acesso à área da Banda deixa de ser só "enquanto a tela estiver aberta"
--
-- Hoje `use_banda_code` só marca o CÓDIGO como usado — não guarda em lugar
-- nenhum que aquela pessoa já desbloqueou a Banda. A BandaScreen guarda isso
-- só em estado local (`useState`), que reseta toda vez que o app é fechado e
-- reaberto, obrigando a digitar o código de novo sempre.
--
-- Esta migração adiciona `profiles.banda_acesso`, preenchido pela própria
-- função `use_banda_code` no momento em que o código é resgatado. Dali em
-- diante, a tela consulta esse campo direto do perfil — igual já acontece
-- com `profiles.role` pro acesso geral de membro, que já persiste entre
-- sessões.
-- ============================================================================

alter table public.profiles
  add column if not exists banda_acesso boolean not null default false;

create or replace function public.use_banda_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row invite_codes%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Você precisa estar logado.');
  end if;

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

  update invite_codes set is_used = true, used_by = v_user_id, used_at = now() where id = v_row.id;
  update profiles set banda_acesso = true where id = v_user_id;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.use_banda_code(text) to authenticated;
