-- 08 Out 2026
-- 1) Devocional geral no sininho da Home
-- 2) Visitantes: registrar = Recepcao (e admin); lista = so admin

-- 1) O devocional geral ja mandava push (devocionais_notify_trigger), mas nao
-- aparecia no sininho: o espelho em `avisos` so existia para devocional de
-- grupo. Agora o geral tambem ganha a sua linha, com origem 'devocional'.
--  - A content-notifications ignora espelho com origem 'devocional', entao o
--    push continua chegando UMA vez so.
--  - O mural de Avisos (Midia) e a lista do Admin filtram origem null: o
--    espelho fica so no sininho.
--  - Fica so o ultimo: o espelho do devocional anterior sai quando entra o novo.
create or replace function public.devocional_geral_no_sininho()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.avisos where origem = 'devocional' and grupo is null;
  insert into public.avisos (titulo, texto, tipo, data, grupo, apenas_membros, origem)
  values ('Novo devocional', new.titulo, 'geral', now(), null, false, 'devocional');
  return null;
end;
$$;

drop trigger if exists devocional_geral_no_sininho_trg on public.devocionais;
create trigger devocional_geral_no_sininho_trg
  after insert on public.devocionais
  for each row
  when (new.grupo is null)
  execute function public.devocional_geral_no_sininho();

-- 2) Visitantes
-- Lista (com telefone e anotacoes): so admin. A equipe de acolhimento deixa
-- de dar acesso. Mantem nome e assinatura: policies e o app usam esta funcao.
create or replace function public.eh_acolhimento()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin();
$$;

-- Registrar: so a equipe da Recepcao, mais o admin.
create or replace function public.pode_registrar_visitante()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin() or public.eh_da_equipe('recepcao');
$$;

-- registrar_visitante() e security definer e so conferia se havia sessao:
-- passava por cima da policy de insert. Agora confere a mesma regra.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.registrar_visitante(text,text,text,boolean,text,text,boolean)'::regprocedure);
  if d ilike '%pode_registrar_visitante%' then return; end if;
  d := replace(d,
$a$    return json_build_object('ok', false, 'erro', 'sem_sessao');
  end if;$a$,
$b$    return json_build_object('ok', false, 'erro', 'sem_sessao');
  end if;
  if not public.pode_registrar_visitante() then
    return json_build_object('ok', false, 'erro', 'sem_permissao');
  end if;$b$);
  if d not ilike '%pode_registrar_visitante%' then
    raise exception 'registrar_visitante: trecho esperado nao encontrado';
  end if;
  execute d;
end $$;
