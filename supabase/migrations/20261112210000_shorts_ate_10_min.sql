-- Shorts dos grupos: videos de ate 10 min (decisao do Marcos, 12/11/2026).
-- Limite do bucket da fila: 200 MB -> 300 MB. O limite geral do Storage
-- (painel: Storage > Settings) tambem foi para 300 MB.
update storage.buckets set file_size_limit = 314572800 where id = 'shorts-fila';
