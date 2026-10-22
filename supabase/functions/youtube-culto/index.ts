// supabase/functions/youtube-culto/index.ts
//
// "Culto da semana" (Painel Admin, 21/10/2026).
// O Admin preenche o culto no app; o app desenha a thumb e grava em
// `culto-semana/thumbs/<id>.jpg`. Esta função, chamada pelo app com o JWT do
// Admin, conversa com o YouTube pela conta da igreja:
//
//   { acao: 'publicar', id }  cria (ou atualiza) o live AGENDADO:
//       título, descrição, horário, público, auto-start/stop, categoria
//       Sem fins lucrativos, idioma pt-BR, thumb e playlist dos cultos.
//   { acao: 'remover', id }   apaga o live agendado do YouTube.
//
// No domingo, no OBS, a equipe escolhe "Selecionar transmissão existente"
// e pega este live — assim não nasce um segundo live "Peniel Church Reading".
//
// Autorização da conta da igreja (OAuth Playground, 21/10/2026), nos secrets:
//   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
// Opcional: YOUTUBE_STREAM_ID — a chave de transmissão (liveStream) do OBS.
// Sem ele, o live fica sem chave ligada e o OBS liga a dele ao selecionar.
//
// Não precisa da auditoria do Google: live agendado não é upload de vídeo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const PLAYLIST_CULTOS = 'PLzGSemk_TLBERzRrxvcMOUaCY-yl2E3el'; // Cultos de Adoração · Domingos 18h
const TIPOS_NA_PLAYLIST = new Set(['adoracao', 'ceia', 'especial']);
const BUCKET = 'culto-semana';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const NOME_TIPO: Record<string, string> = {
  adoracao: 'Culto de Adoração', ceia: 'Culto de Santa Ceia', alive: 'Peniel Alive',
  mulheres: 'Culto de Mulheres', homens: 'Culto de Homens', kids: 'Peniel Kids',
  casais: 'Culto de Casais', especial: 'Culto Especial',
};

type Culto = {
  id: string; data: string; hora: string; tipo: string; tema: string;
  subtitulo: string | null; referencia: string | null; pregador: string;
  observacao: string | null; thumb_path: string | null; youtube_id: string | null;
};

// ─── Google ──────────────────────────────────────────────────────────────────

let tokenCache: { valor: string; expira: number } | null = null;

async function tokenGoogle(): Promise<string> {
  if (tokenCache && tokenCache.expira > Date.now() + 60_000) return tokenCache.valor;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('YOUTUBE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('YOUTUBE_CLIENT_SECRET') ?? '',
      refresh_token: Deno.env.get('YOUTUBE_REFRESH_TOKEN') ?? '',
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    // `invalid_grant` = a autorização da conta da igreja caiu (senha trocada,
    // acesso revogado). Refazer o OAuth Playground e trocar YOUTUBE_REFRESH_TOKEN.
    throw new Error(`Autorização do YouTube recusada (${d.error ?? r.status}).`);
  }
  tokenCache = { valor: d.access_token, expira: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return tokenCache.valor;
}

async function yt(caminho: string, init: RequestInit = {}): Promise<any> {
  const token = await tokenGoogle();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const base = caminho.startsWith('https://') ? '' : 'https://www.googleapis.com/youtube/v3/';
  const r = await fetch(base + caminho, { ...init, headers });
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const motivo = d?.error?.errors?.[0]?.reason ?? d?.error?.status ?? r.status;
    throw new Error(`YouTube: ${d?.error?.message ?? 'erro'} (${motivo})`);
  }
  return d;
}

// ─── Textos ─────────────────────────────────────────────────────────────────

// "18:00" de domingo em Reading → ISO em UTC (cuida do horário de verão).
function horarioUTC(data: string, hora: string): string {
  const [a, m, d] = data.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const palpite = new Date(Date.UTC(a, m - 1, d, hh, mm));
  const nome = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' })
    .formatToParts(palpite).find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
  const off = nome.match(/GMT([+-]\d+)?(?::(\d+))?/);
  const horas = off?.[1] ? Number(off[1]) : 0;
  const minutos = off?.[2] ? Number(off[2]) * Math.sign(horas || 1) : 0;
  return new Date(palpite.getTime() - (horas * 60 + minutos) * 60_000).toISOString();
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function cortar(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

function montarTitulo(c: Culto): string {
  const tema = [c.tema.replace(/\s*\n+\s*/g, ' ').trim(), c.subtitulo?.trim()].filter(Boolean).join(' ');
  const partes = [tema, c.referencia?.trim(), c.pregador?.trim()].filter(Boolean) as string[];
  let titulo = partes.join(' · ');
  if (titulo.length > 100) titulo = [tema, c.pregador?.trim()].filter(Boolean).join(' · ');
  // O YouTube recusa < e > no título.
  return cortar(titulo.replace(/[<>]/g, ''), 100);
}

function montarDescricao(c: Culto): string {
  const tema = [c.tema.replace(/\s*\n+\s*/g, ' ').trim(), c.subtitulo?.trim()].filter(Boolean).join(' ');
  const linhas = [
    `${NOME_TIPO[c.tipo] ?? 'Culto'} · ${dataBR(c.data)} · ${c.hora.slice(0, 5)} (Reading, UK)`,
    '',
    `✨ ${tema}`,
    ...(c.referencia ? [`📖 Texto base: ${c.referencia.trim()}`] : []),
    `🎤 ${c.pregador.trim()}`,
    ...(c.observacao?.trim() ? ['', c.observacao.trim()] : []),
    '',
    'Uma só família em Cristo Jesus. Seja bem-vindo à Peniel Church!',
    '',
    '📱 Baixe o App da Peniel — tradução ao vivo do culto em inglês e espanhol:',
    'https://app.penielchurch.org.uk',
    '',
    '🙏 Dízimos e ofertas: https://penielchurch.org.uk/contribua/',
    '',
    '⛪ Nossa semana',
    'Domingo 18h · Culto de Adoração (presencial e YouTube)',
    'Terça 21h · Oração (Zoom)',
    'Quarta 20h · Estudo Bíblico (Zoom)',
    'Sábado 19h · Peniel Alive (jovens, nas casas)',
    '',
    '📍 Abbey Square, Reading RG1 3BE',
    '🌐 https://penielchurch.org.uk',
    '📷 https://www.instagram.com/penielchurchofficial',
    '👍 https://www.facebook.com/penielchurchofficial',
    '',
    '#PenielChurch #Reading #CultoAoVivo #IgrejaBrasileira',
  ];
  return cortar(linhas.join('\n').replace(/[<>]/g, ''), 4900);
}

// ─── Ações ──────────────────────────────────────────────────────────────────

async function publicar(admin: ReturnType<typeof createClient>, c: Culto) {
  const titulo = montarTitulo(c);
  const descricao = montarDescricao(c);
  const inicio = horarioUTC(c.data, c.hora);
  if (new Date(inicio).getTime() < Date.now() - 5 * 60_000) {
    throw new Error('Esse culto já passou. Confira a data e a hora.');
  }

  let videoId = c.youtube_id;
  let novo = false;

  // Se o live foi apagado direto no Studio, cria de novo.
  if (videoId) {
    const existe = await yt(`liveBroadcasts?part=id,status&id=${videoId}`);
    const st = existe.items?.[0]?.status?.lifeCycleStatus;
    if (!existe.items?.length) videoId = null;
    else if (st === 'live' || st === 'complete' || st === 'revoked') {
      throw new Error('Esse live já aconteceu (ou está no ar) — não dá mais para alterar por aqui.');
    }
  }

  if (!videoId) {
    const b = await yt('liveBroadcasts?part=snippet,status,contentDetails', {
      method: 'POST',
      body: JSON.stringify({
        snippet: { title: titulo, description: descricao, scheduledStartTime: inicio },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
        contentDetails: {
          enableAutoStart: true, enableAutoStop: true, enableDvr: true,
          enableEmbed: true, recordFromStart: true, latencyPreference: 'normal',
          monitorStream: { enableMonitorStream: false },
        },
      }),
    });
    videoId = b.id as string;
    novo = true;
  } else {
    await yt('liveBroadcasts?part=snippet,status', {
      method: 'PUT',
      body: JSON.stringify({
        id: videoId,
        snippet: { title: titulo, description: descricao, scheduledStartTime: inicio },
        status: { privacyStatus: 'public' },
      }),
    });
  }

  // Grava já o id: se algo abaixo falhar, um novo "Publicar" atualiza o mesmo live.
  await admin.from('cultos_semana').update({ youtube_id: videoId }).eq('id', c.id);

  const avisos: string[] = [];

  // Chave de transmissão do OBS (opcional).
  const streamId = Deno.env.get('YOUTUBE_STREAM_ID');
  if (streamId && novo) {
    try { await yt(`liveBroadcasts/bind?id=${videoId}&part=id&streamId=${encodeURIComponent(streamId)}`, { method: 'POST' }); }
    catch (e) { avisos.push(`chave do OBS: ${(e as Error).message}`); }
  }

  // Categoria e idioma (o liveBroadcast não tem esses campos; o vídeo tem).
  try {
    await yt('videos?part=snippet', {
      method: 'PUT',
      body: JSON.stringify({
        id: videoId,
        snippet: {
          title: titulo, description: descricao, categoryId: '29',
          defaultLanguage: 'pt-BR', defaultAudioLanguage: 'pt-BR',
          tags: ['Peniel Church', 'Reading', 'culto ao vivo', 'igreja brasileira', NOME_TIPO[c.tipo] ?? 'culto'],
        },
      }),
    });
  } catch (e) { avisos.push(`categoria: ${(e as Error).message}`); }

  // Thumb.
  if (c.thumb_path) {
    try {
      const { data: arq, error } = await admin.storage.from(BUCKET).download(c.thumb_path);
      if (error || !arq) throw new Error(error?.message ?? 'thumb não encontrada');
      const token = await tokenGoogle();
      const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
        body: new Uint8Array(await arq.arrayBuffer()),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error?.message ?? String(r.status));
      }
    } catch (e) { avisos.push(`thumb: ${(e as Error).message}`); }
  } else {
    avisos.push('thumb: ainda não gerada');
  }

  // Playlist dos cultos (só na criação).
  if (novo && TIPOS_NA_PLAYLIST.has(c.tipo)) {
    try {
      await yt('playlistItems?part=snippet', {
        method: 'POST',
        body: JSON.stringify({ snippet: { playlistId: PLAYLIST_CULTOS, resourceId: { kind: 'youtube#video', videoId } } }),
      });
    } catch (e) { avisos.push(`playlist: ${(e as Error).message}`); }
  }

  await admin.from('cultos_semana').update({
    youtube_id: videoId,
    youtube_publicado_em: new Date().toISOString(),
    youtube_erro: avisos.length ? avisos.join(' · ') : null,
  }).eq('id', c.id);

  return { ok: true, youtube_id: videoId, novo, titulo, inicio, avisos };
}

async function remover(admin: ReturnType<typeof createClient>, c: Culto) {
  if (c.youtube_id) {
    try { await yt(`liveBroadcasts?id=${c.youtube_id}`, { method: 'DELETE' }); }
    catch (e) {
      const msg = (e as Error).message;
      if (!/notFound|liveBroadcastNotFound/i.test(msg)) throw e;
    }
  }
  await admin.from('cultos_semana').update({ youtube_id: null, youtube_publicado_em: null, youtube_erro: null }).eq('id', c.id);
  return { ok: true };
}

// ─── Entrada ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não suportado.' }, 405);

  try {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const pessoa = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: u } = await pessoa.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'Faça login.' }, 401);
    const { data: ehAdmin } = await pessoa.rpc('is_admin');
    if (!ehAdmin) return json({ error: 'Só o Admin publica o culto da semana.' }, 403);

    const corpo = await req.json().catch(() => ({}));
    const acao = String(corpo?.acao ?? '');
    const id = String(corpo?.id ?? '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Culto inválido.' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: culto, error } = await admin.from('cultos_semana')
      .select('id, data, hora, tipo, tema, subtitulo, referencia, pregador, observacao, thumb_path, youtube_id')
      .eq('id', id).maybeSingle();
    if (error || !culto) return json({ error: 'Culto não encontrado.' }, 404);

    if (acao === 'publicar') return json(await publicar(admin, culto as Culto));
    if (acao === 'remover') return json(await remover(admin, culto as Culto));
    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error(msg);
    return json({ error: msg }, 500);
  }
});
