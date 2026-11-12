-- Shorts: playlists dos grupos e Short "geral" dos pastores na aba Midia
-- (pedido do Marcos, 12/11/2026).
--
-- 1) Playlists do YouTube (canal Peniel Church Official), conferidas no Studio.
--    A Banda nao tem playlist. "geral" = playlist "Shorts · Peniel Church",
--    criada pelo Claude em 12/11/2026.
insert into public.shorts_playlists (grupo, playlist_id) values
  ('homens',         'PLUaIi6EJDEfo'),
  ('mulheres',       'PLfLBOYT0dNL0'),
  ('jovens',         'PLGkGvZgNNCX8'),
  ('infantil',       'PLCCETIfr2R8Q'),
  ('estudo_biblico', 'PLEhQNdq_Umak'),
  ('geral',          'PLQz3ctmb4r9Q')
on conflict (grupo) do update set playlist_id = excluded.playlist_id;

-- 2) Grupo "geral": quem grava e publica sao os pastores (e o admin).
create or replace function public.gere_shorts(p_grupo text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_grupo_leader(p_grupo)
      or (p_grupo = 'geral' and public.eh_pastor())
$$;
revoke all on function public.gere_shorts(text) from public, anon;
grant execute on function public.gere_shorts(text) to authenticated;

-- 3) Publicado no grupo "geral" -> aparece nos Shorts da aba Midia (grupo null).
create or replace function public.shorts_marcar(p_id uuid, p_status text, p_youtube_id text default null, p_erro text default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v public.shorts_fila; v_short uuid; v_url text; v_grupo_push text;
begin
  select * into v from public.shorts_fila where id = p_id for update;
  if not found then return 'sem_video'; end if;
  v_grupo_push := nullif(v.grupo, 'geral');
  if p_status = 'publicado' and p_youtube_id is not null then
    v_url := case when coalesce(v.duracao_s, 0) <= 180 then 'https://youtube.com/shorts/' || p_youtube_id
                  else 'https://www.youtube.com/watch?v=' || p_youtube_id end;
    insert into public.shorts_videos (titulo, url, plataforma, grupo)
    values (v.titulo, v_url, 'youtube', nullif(v.grupo, 'geral')) returning id into v_short;
    update public.shorts_fila set status = 'publicado', youtube_id = p_youtube_id, short_id = v_short, erro = null, updated_at = now() where id = p_id;
    perform public.push_para(v.autor, '🎬 Seu vídeo foi publicado!', coalesce(v.titulo, 'Short do grupo'),
      jsonb_build_object('type', 'shorts', 'grupo', v_grupo_push));
    if v.aprovado_por is not null and v.aprovado_por <> v.autor then
      perform public.push_para(v.aprovado_por, '🎬 Short publicado', coalesce(v.titulo, 'Short do grupo'),
        jsonb_build_object('type', 'shorts', 'grupo', v_grupo_push));
    end if;
  elsif p_status in ('processando', 'erro') then
    update public.shorts_fila set status = p_status, erro = left(p_erro, 500), updated_at = now() where id = p_id;
    if p_status = 'erro' and v.aprovado_por is not null then
      perform public.push_para(v.aprovado_por, '⚠️ Short não publicado', 'Deu um erro ao preparar o vídeo. Abra a fila do grupo para tentar de novo.',
        jsonb_build_object('type', 'shorts', 'grupo', v_grupo_push));
    end if;
  else
    return 'status_invalido';
  end if;
  return 'ok';
end $$;
revoke all on function public.shorts_marcar(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.shorts_marcar(uuid, text, text, text) to service_role;
