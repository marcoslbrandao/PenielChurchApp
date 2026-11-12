// supabase/functions/shorts-trabalho/index.ts
//
// Shorts dos grupos (12/11/2026): o "balcão" do GitHub Actions.
//
// O repositório é PÚBLICO, então o GitHub não guarda chave nenhuma do
// Supabase nem do YouTube — só uma senha compartilhada (SHORTS_SEGREDO, nos
// secrets do GitHub E do Supabase). Com ela, o workflow pede aqui:
//
//   { acao: 'iniciar',  id } → dados do vídeo, link do vídeo (1 h), playlist
//                              do grupo e um token do YouTube (1 h)
//   { acao: 'concluir', id, youtube_id } → publica no app (shorts_videos) e avisa
//   { acao: 'erro',     id, erro }       → marca o erro e avisa o líder
//
// Usa os mesmos YOUTUBE_CLIENT_ID / _SECRET / _REFRESH_TOKEN do Culto da semana.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SEGREDO = Deno.env.get('SHORTS_SEGREDO') ?? '';
const YT_ID = Deno.env.get('YOUTUBE_CLIENT_ID') ?? '';
const YT_SECRET = Deno.env.get('YOUTUBE_CLIENT_SECRET') ?? '';
const YT_REFRESH = Deno.env.get('YOUTUBE_REFRESH_TOKEN') ?? '';

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'Content-Type': 'application/json' } });

function iguais(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'metodo' }, 405);
  if (!SEGREDO || !iguais(req.headers.get('x-shorts-segredo') ?? '', SEGREDO)) return json({ error: 'sem_acesso' }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { acao, id, youtube_id, erro } = await req.json();
    const { data: v } = await admin.from('shorts_fila').select('*').eq('id', id).maybeSingle();
    if (!v) return json({ error: 'sem_video' }, 404);

    if (acao === 'iniciar') {
      if (!['aprovado', 'erro', 'processando'].includes(v.status)) return json({ error: `status_${v.status}` }, 409);
      await admin.rpc('shorts_marcar', { p_id: id, p_status: 'processando' });
      const { data: assinado, error: e1 } = await admin.storage.from('shorts-fila').createSignedUrl(v.video_path, 3600);
      if (e1) throw e1;
      const { data: pl } = await admin.from('shorts_playlists').select('playlist_id').eq('grupo', v.grupo).maybeSingle();
      const t = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: YT_ID, client_secret: YT_SECRET, refresh_token: YT_REFRESH, grant_type: 'refresh_token' }),
      }).then(r => r.json());
      if (!t.access_token) throw new Error('youtube_token');
      return json({
        video: {
          grupo: v.grupo, titulo: v.titulo, subtitulo: v.subtitulo, legendas: v.legendas, arte: v.arte,
          duracao_s: v.duracao_s,
        },
        video_url: assinado.signedUrl,
        playlist_id: pl?.playlist_id ?? null,
        youtube_token: t.access_token,
      });
    }
    if (acao === 'concluir') {
      if (!youtube_id) return json({ error: 'youtube_id' }, 400);
      const { data } = await admin.rpc('shorts_marcar', { p_id: id, p_status: 'publicado', p_youtube_id: String(youtube_id) });
      // Publicado no YouTube: o vídeo da fila não é mais necessário (o app
      // abre pelo link do YouTube). Apaga do Storage para não acumular
      // (pedido do Marcos, 12/11/2026). Falha aqui não desfaz a publicação.
      if (data === 'ok') {
        const { data: f } = await admin.from('shorts_fila').select('video_path').eq('id', id).maybeSingle();
        if (f?.video_path) {
          const { error: eRm } = await admin.storage.from('shorts-fila').remove([f.video_path]);
          if (eRm) console.error('shorts-trabalho: nao apagou', f.video_path, eRm.message);
        }
      }
      return json({ ok: data === 'ok' });
    }
    if (acao === 'erro') {
      await admin.rpc('shorts_marcar', { p_id: id, p_status: 'erro', p_erro: String(erro ?? 'erro').slice(0, 500) });
      return json({ ok: true });
    }
    return json({ error: 'acao' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
