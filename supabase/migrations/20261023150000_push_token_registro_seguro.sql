-- ============================================================================
-- Push: aparelho que ja foi de outra conta nao conseguia se registrar (23/10/2026)
--
-- O app salva o token com upsert(onConflict: 'token'). Quando o token do
-- aparelho ja estava gravado em OUTRA conta (perfil duplicado, celular que
-- trocou de conta, conta apagada), o Postgres exige que a linha antiga passe
-- na policy de SELECT ("so os proprios tokens") para fazer o UPDATE. Nao passa,
-- o upsert falha calado, e o token continua preso a conta antiga: a pessoa
-- ativa tudo e nunca recebe nada.
--
-- Agora o app chama esta funcao, que roda com permissao do servidor e sempre
-- grava o token na conta logada. Tambem limpa tokens de contas que nao existem
-- mais (perfis duplicados removidos).
-- ============================================================================

create or replace function public.registrar_push_token(p_token text, p_idioma text default 'pt')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(trim(p_token), '') = '' then
    return;
  end if;
  insert into public.push_tokens (user_id, token, idioma)
  values (auth.uid(), p_token, nullif(p_idioma, ''))
  on conflict (token) do update
    set user_id = excluded.user_id,
        idioma  = excluded.idioma;
end;
$$;

revoke all on function public.registrar_push_token(text, text) from public;
grant execute on function public.registrar_push_token(text, text) to authenticated;

-- Tokens de contas que nao existem mais.
delete from public.push_tokens t
where not exists (select 1 from public.profiles p where p.id = t.user_id);

-- Conferencia:
select count(*) as tokens, count(distinct user_id) as contas_com_push from public.push_tokens;
