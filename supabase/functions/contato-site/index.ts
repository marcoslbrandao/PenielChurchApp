// supabase/functions/contato-site/index.ts
//
// Recebe o formulário de Contato do site novo (penielchurch.org.uk/contato/)
// e grava em `contact_messages`; a mensagem aparece na aba Contato do Painel
// Admin do app.
//
// DEPLOY (igual à visitante-publico, página pública sem login):
//   npx -y supabase@latest functions deploy contato-site --no-verify-jwt
//
// Portão em três camadas (mesmo desenho da visitante-publico):
//   1. honeypot (campo invisível `site`) -> responde "ok" e não grava;
//   2. tempo mínimo de 3 s entre abrir a página e enviar;
//   3. limite por hora por IP e global, dentro de `registrar_contato_site`.
// O IP nunca é gravado: vira hash com sal.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SAL = Deno.env.get('VISITANTE_IP_SALT') ?? 'peniel-sem-sal';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function hashDoIp(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(`contato:${SAL}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

function limpa(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  // Tira caracteres de controle, mas mantém quebras de linha da mensagem.
  const t = v.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
  return t || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ ok: false, erro: 'metodo' }, 405);

  try {
    const corpo = await req.json().catch(() => ({}));

    if (limpa(corpo.site, 200)) return resposta({ ok: true }); // robô

    const abertoEm = Number(corpo.aberto_em);
    if (!Number.isFinite(abertoEm) || Date.now() - abertoEm < 3000) {
      return resposta({ ok: false, erro: 'rapido_demais' }, 429);
    }

    const nome = limpa(corpo.nome, 120);
    const email = limpa(corpo.email, 160);
    const mensagem = limpa(corpo.mensagem, 4000);
    if (!nome || !mensagem) return resposta({ ok: false, erro: 'vazio' }, 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return resposta({ ok: false, erro: 'email' }, 400);
    }

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconhecido';
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase.rpc('registrar_contato_site', {
      p_nome: nome,
      p_email: email,
      p_mensagem: mensagem,
      p_ip_hash: await hashDoIp(ip),
    });

    if (error) {
      console.error('registrar_contato_site:', error.message);
      return resposta({ ok: false, erro: 'falhou' }, 500);
    }
    const r = data as { ok: boolean; erro?: string };
    if (!r?.ok) {
      const estourou = r?.erro === 'limite_ip' || r?.erro === 'limite_global';
      return resposta({ ok: false, erro: r?.erro ?? 'falhou' }, estourou ? 429 : 400);
    }
    return resposta({ ok: true });
  } catch (err: any) {
    console.error('contato-site:', err?.message);
    return resposta({ ok: false, erro: 'falhou' }, 500);
  }
});
