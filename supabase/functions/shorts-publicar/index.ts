// supabase/functions/shorts-publicar/index.ts
//
// Shorts dos grupos (12/11/2026). O líder aprova no app (shorts_aprovar) e o
// app chama esta função, que dispara o GitHub Actions
// (.github/workflows/publicar-short.yml): arte + legenda + YouTube.
//
//   POST { id }  (com o token do líder)  → { disparado: boolean }
//
// Secret necessário no Supabase: GITHUB_TOKEN — um token "fine-grained" do
// GitHub só para o repositório PenielChurchApp, com permissão
// "Contents: Read and write" (é o que libera o repository_dispatch).
// Sem ele o vídeo fica como "aprovado" esperando, e nada se perde.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') ?? '';
const REPO = Deno.env.get('GITHUB_REPO') ?? 'marcoslbrandao/PenielChurchApp';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('authorization') ?? '';
    const { id } = await req.json();
    if (!auth || !id) return json({ error: 'pedido_invalido' }, 400);

    // Confere, com o token de quem pediu, que é o líder e que está aprovado.
    const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: v } = await comoUsuario.from('shorts_fila').select('id, grupo, status').eq('id', id).maybeSingle();
    if (!v) return json({ error: 'sem_video' }, 404);
    const { data: gere } = await comoUsuario.rpc('gere_shorts', { p_grupo: v.grupo });
    if (gere !== true) return json({ error: 'sem_acesso' }, 403);
    if (v.status !== 'aprovado') return json({ error: 'nao_aprovado' }, 400);

    if (!GITHUB_TOKEN) return json({ disparado: false, motivo: 'sem_token' });
    const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event_type: 'publicar-short', client_payload: { id } }),
    });
    if (!r.ok) return json({ disparado: false, motivo: `github_${r.status}` });
    return json({ disparado: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
