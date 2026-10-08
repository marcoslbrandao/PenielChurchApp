-- Avisos sem repeticao + edicao de aviso existente (08 Out 2026)
--
-- Problema: os crons 10 (estudo), 13 (oracao) e 14 (culto) inserem o mesmo
-- aviso toda semana, e o mural de Avisos acumulava varias copias iguais.
--
-- Regra do Marcos: um aviso de cada. Quando entra um aviso escrito (origem
-- null) com o MESMO titulo e o MESMO grupo de um que ja existe, o antigo sai
-- e fica so o novo. Continua sendo um INSERT, entao o push semanal sai
-- normalmente (avisos_notify_trigger e AFTER INSERT).
--
-- Espelhos automaticos (origem = material, evento, chat...) ficam de fora:
-- cada "Novo material" e um arquivo diferente.

create or replace function public.avisos_um_por_titulo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.avisos a
   where a.id <> new.id
     and a.origem is null
     and lower(btrim(a.titulo)) = lower(btrim(new.titulo))
     and a.grupo is not distinct from new.grupo;
  return null;
end;
$$;

drop trigger if exists avisos_um_por_titulo_trg on public.avisos;
create trigger avisos_um_por_titulo_trg
  after insert on public.avisos
  for each row
  when (new.origem is null)
  execute function public.avisos_um_por_titulo();

-- Editar um aviso: a traducao guardada em cache (content_translations) e por
-- linha, nao por texto. Sem isto, quem usa o app em ingles continuaria vendo
-- o texto antigo depois da edicao.
create or replace function public.avisos_limpa_traducao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.content_translations t
   where t.table_name = 'avisos'
     and t.row_id = new.id::text
     and (
       (t.field_name = 'titulo'    and new.titulo    is distinct from old.titulo) or
       (t.field_name = 'texto'     and new.texto     is distinct from old.texto) or
       (t.field_name = 'cta_texto' and new.cta_texto is distinct from old.cta_texto)
     );
  return null;
end;
$$;

drop trigger if exists avisos_limpa_traducao_trg on public.avisos;
create trigger avisos_limpa_traducao_trg
  after update of titulo, texto, cta_texto on public.avisos
  for each row
  execute function public.avisos_limpa_traducao();

-- Limpeza do que ja acumulou: fica o mais recente de cada titulo/grupo.
delete from public.avisos a
 using public.avisos b
 where a.origem is null and b.origem is null
   and lower(btrim(a.titulo)) = lower(btrim(b.titulo))
   and a.grupo is not distinct from b.grupo
   and (a.created_at, a.id::text) < (b.created_at, b.id::text);
