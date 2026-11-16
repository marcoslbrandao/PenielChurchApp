// supabase/functions/shorts-publicar/index.ts
//
// Shorts dos grupos (12/11/2026). O líder aprova no app (shorts_aprovar) e o
// app chama esta função, que dispara o GitHub Actions
// (.github/workflows/publicar-short.yml): arte + legenda + YouTube.
//
//   POST { id }  (com o token do líder)  → { disparado: boolean }
//   POST { acao: 'agendados' }  (cron a cada 5 min, chave de serviço) → manda
//        para o GitHub os vídeos agendados cuja hora está chegando (16/11/2026).
//
// Secret necessário no Supabase: GITHUB_TOKEN — um token "fine-grained" do
// GitHub só para o repositório PenielChurchApp, com permissão
// "Contents: Read and write" (é o que libera o repository_dispatch).
// Sem ele o vídeo fica como "aprovado" esperando, e nada se perde.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chamadaAutorizada, respostaNaoAutorizado } from '../_shared/hook-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GITHUB_TOKEN = (Deno.env.get('GITHUB_TOKEN') ?? '').trim();
const REPO = Deno.env.get('GITHUB_REPO') ?? 'marcoslbrandao/PenielChurchApp';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Começa a preparar 10 min antes da hora marcada (arte + legenda + envio).
const ANTECEDENCIA_MIN = 10;

async function dispararGithub(id: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!GITHUB_TOKEN) return { ok: false, motivo: 'sem_token' };
  const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'publicar-short', client_payload: { id } }),
  });
  return r.ok ? { ok: true } : { ok: false, motivo: `github_${r.status}` };
}

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('authorization') ?? '';
    const { id, acao } = await req.json();

    // Cron: vídeos agendados com a hora chegando. Só com a chave de serviço.
    if (acao === 'agendados') {
      if (!chamadaAutorizada(req)) return respostaNaoAutorizado();
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const limite = new Date(Date.now() + ANTECEDENCIA_MIN * 60_000).toISOString();
      const { data: prontos } = await admin.from('shorts_fila').select('id')
        .eq('status', 'agendado').lte('publicar_em', limite).limit(5);
      const resultado: Record<string, unknown> = {};
      for (const p of prontos ?? []) {
        // Passa para "aprovado" só se ainda estiver agendado (evita duplo envio).
        const { data: mudou } = await admin.from('shorts_fila')
          .update({ status: 'aprovado', updated_at: new Date().toISOString() })
          .eq('id', p.id).eq('status', 'agendado').select('id');
        if (!mudou?.length) continue;
        const d = await dispararGithub(p.id);
        // GitHub fora do ar: volta para agendado e o próximo cron tenta de novo.
        if (!d.ok) await admin.from('shorts_fila').update({ status: 'agendado' }).eq('id', p.id).eq('status', 'aprovado');
        resultado[p.id] = d;
      }
      return json({ ok: true, resultado });
    }

    if (!auth || !id) return json({ error: 'pedido_invalido' }, 400);

    // Confere, com o token de quem pediu, que é o líder e que está aprovado.
    const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: v } = await comoUsuario.from('shorts_fila').select('id, grupo, status').eq('id', id).maybeSingle();
    if (!v) return json({ error: 'sem_video' }, 404);
    const { data: gere } = await comoUsuario.rpc('gere_shorts', { p_grupo: v.grupo });
    if (gere !== true) return json({ error: 'sem_acesso' }, 403);
    if (v.status !== 'aprovado') return json({ error: 'nao_aprovado' }, 400);

    const d = await dispararGithub(id);
    return json(d.ok ? { disparado: true } : { disparado: false, motivo: d.motivo });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
