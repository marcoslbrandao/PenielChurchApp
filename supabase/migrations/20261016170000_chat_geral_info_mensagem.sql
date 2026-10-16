-- Chat da Igreja: "Reacoes e visualizacoes" de uma mensagem (16/10/2026).
-- Rodar no SQL Editor do Supabase.
--
-- Quem REAGIU: qualquer membro ve (as reacoes ja sao publicas no chat; aqui
-- so aparecem os nomes).
-- Quem VIU: so o AUTOR da mensagem e o Admin (igual ao "Info" do WhatsApp em
-- grupo). "Viu" = abriu o Chat da Igreja depois que a mensagem foi enviada
-- (chat_geral_leituras.lida_em, gravada ao abrir/fechar o chat e a cada
-- mensagem nova com o chat aberto).
--
-- As tabelas de reacoes/leituras tem RLS restrita; por isso a funcao e
-- SECURITY DEFINER e confere is_membro()/autor/admin por dentro.
begin;

create or replace function public.chat_geral_info_mensagem(p_mensagem uuid)
returns table (tipo text, user_id uuid, nome text, emoji text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_autor  uuid;
  v_criada timestamptz;
begin
  if not public.is_membro() then
    return;
  end if;

  select m.autor_id, m.created_at into v_autor, v_criada
  from public.chat_geral_mensagens m
  where m.id = p_mensagem;
  if v_autor is null then
    return;
  end if;

  return query
    select 'reacao'::text, r.user_id,
           coalesce(nullif(btrim(p.full_name), ''), 'Membro'), r.emoji
    from public.chat_geral_reacoes r
    left join public.profiles p on p.id = r.user_id
    where r.mensagem_id = p_mensagem
    order by r.created_at;

  if auth.uid() = v_autor or public.is_admin() then
    return query
      select 'visto'::text, l.user_id,
             coalesce(nullif(btrim(p.full_name), ''), 'Membro'), null::text
      from public.chat_geral_leituras l
      join public.profiles p on p.id = l.user_id
      where l.lida_em >= v_criada
        and l.user_id <> v_autor
        and coalesce(p.role, 'visitante') <> 'visitante'
      order by p.full_name;
  end if;
end;
$$;

revoke all on function public.chat_geral_info_mensagem(uuid) from public, anon;
grant execute on function public.chat_geral_info_mensagem(uuid) to authenticated;

commit;
