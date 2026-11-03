-- Liga as 22 imagens aos devocionais agendados (06/11 a 25/12/2026).
-- Antes: subir os 22 arquivos em Storage > devocionais > fotos.
update public.devocionais_agendados a
   set imagem_url = v.url
  from (values
    (date '2026-12-02', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/elevio-01-silencio.jpg'),
    (date '2026-12-04', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/elevio-02-verbo.jpg'),
    (date '2026-12-07', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/elevio-03-arvore.jpg'),
    (date '2026-12-09', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/elevio-04-anunciacao.jpg'),
    (date '2026-12-11', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/elevio-05-jose.jpg'),
    (date '2026-12-14', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/elevio-06-magnificat.jpg'),
    (date '2026-12-16', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/elevio-07-caminho.jpg'),
    (date '2026-12-18', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/elevio-08-pastores.jpg'),
    (date '2026-12-21', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/elevio-09-simeao.jpg'),
    (date '2026-12-23', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/elevio-10-magos.jpg'),
    (date '2026-12-25', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/elevio-11-natal.jpg'),
    (date '2026-11-06', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/promessa-02-familias.jpg'),
    (date '2026-11-09', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/promessa-03-cordeiro.jpg'),
    (date '2026-11-11', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/promessa-04-cetro.jpg'),
    (date '2026-11-13', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/promessa-05-porta.jpg'),
    (date '2026-11-16', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/promessa-06-profeta.jpg'),
    (date '2026-11-18', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/promessa-07-trono.jpg'),
    (date '2026-11-20', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/promessa-08-emanuel.jpg'),
    (date '2026-11-23', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/promessa-09-luz.jpg'),
    (date '2026-11-25', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/promessa-10-servo.jpg'),
    (date '2026-11-27', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/promessa-11-belem.jpg'),
    (date '2026-11-30', 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/promessa-12-sol.jpg')
  ) as v(data, url)
 where a.data = v.data and a.serie_id is not null and a.publicado_em is null;

-- Conferência: a coluna arquivo_no_storage deve ser 1 em todas as linhas
select to_char(a.data,'DD/MM') as dia, a.ordem_na_serie as ord, left(a.titulo,35) as titulo, replace(a.imagem_url, 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/', '') as arquivo,
       (select count(*) from storage.objects o where o.bucket_id = 'devocionais' and o.name = 'fotos/' || replace(a.imagem_url, 'https://yudulaqsqhzbbarhxbnr.supabase.co/storage/v1/object/public/devocionais/fotos/', '')) as arquivo_no_storage
  from public.devocionais_agendados a where a.serie_id is not null order by a.data;
