-- ============================================================================
-- "Conversa" do culto: mensagens novas aparecem para a Banda (18/10/2026)
--
-- Pergunta do Marcos: quando posto na Conversa de um culto, como os outros
-- vao saber? Ate hoje, so abrindo aquele culto. Agora o cartao do culto e o
-- botao "Conversa" mostram um selo ambar, pulsando, com quantas mensagens
-- novas a pessoa ainda nao viu. Some quando ela abre a conversa.
--
--   culto_comentarios_leituras  -> quando cada um abriu a conversa de cada culto
--   culto_marcar_lido(culto)    -> grava (chamado ao abrir a conversa)
--   culto_conversas_nao_lidas() -> {culto_id, n} das mensagens de OUTRAS pessoas
--                                  depois da ultima leitura (quem nunca abriu:
--                                  as dos ultimos 14 dias)
-- Pode rodar de novo sem estragar nada.
-- ============================================================================

create table if not exists public.culto_comentarios_leituras (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  culto_id uuid not null references public.cultos(id) on delete cascade,
  lida_em  timestamptz not null default now(),
  primary key (user_id, culto_id)
);
alter table public.culto_comentarios_leituras enable row level security;

drop policy if exists "culto leituras: so a propria" on public.culto_comentarios_leituras;
create policy "culto leituras: so a propria"
  on public.culto_comentarios_leituras for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.culto_marcar_lido(p_culto uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_banda_membro() then return; end if;
  insert into public.culto_comentarios_leituras (user_id, culto_id, lida_em)
  values (auth.uid(), p_culto, now())
  on conflict (user_id, culto_id) do update set lida_em = excluded.lida_em;
end;
$$;
revoke all on function public.culto_marcar_lido(uuid) from public, anon;
grant execute on function public.culto_marcar_lido(uuid) to authenticated;

create or replace function public.culto_conversas_nao_lidas()
returns table (culto_id uuid, n integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.culto_id, count(*)::integer
    from public.culto_comentarios c
    left join public.culto_comentarios_leituras l
      on l.culto_id = c.culto_id and l.user_id = auth.uid()
   where public.is_banda_membro()
     and c.autor_id <> auth.uid()
     and c.created_at > coalesce(l.lida_em, now() - interval '14 days')
   group by c.culto_id;
$$;
revoke all on function public.culto_conversas_nao_lidas() from public, anon;
grant execute on function public.culto_conversas_nao_lidas() to authenticated;

-- Conferencia (como voce): cultos com mensagens novas
select * from public.culto_conversas_nao_lidas();
