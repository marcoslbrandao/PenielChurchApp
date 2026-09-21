// Canal da Peniel no YouTube: "está ao vivo agora?" e "últimos vídeos".
//
// POR QUE ESTE ARQUIVO EXISTE (21 Set 2026): no culto de 20/09 a Home não
// mostrou o "Ao vivo". Duas causas somadas:
//
// 1. A checagem de graça esperava que `/channel/<id>/live` REDIRECIONASSE
//    para `watch?v=...`. O YouTube não redireciona mais: serve a página do
//    vídeo no próprio endereço /live. A URL final nunca tinha `v=`, então o
//    app concluía "não está ao vivo" sempre — com ou sem o cookie de
//    consentimento (a correção de 23/08 atacou o sintoma errado).
// 2. A rede de segurança era `search?eventType=live`, que custa 100 unidades
//    da cota diária (10.000). A aba Mídia gastava mais 200 a cada abertura
//    (duas buscas). Num domingo, com vários celulares checando a cada 4,5 min,
//    a cota acaba cedo — e a partir daí a API só devolve erro.
//
// Agora:
// - Checagem de graça lê o HTML de /live: id do vídeo no `<link rel=canonical>`
//   e `"isLiveNow":true` (uma transmissão só AGENDADA também aparece em /live,
//   mas com isLiveNow false — não pode acender o botão).
// - Rede de segurança: ids dos vídeos recentes pelo RSS do canal (0 unidades)
//   ou pela playlist de uploads (1 unidade), e o status de cada um por
//   `videos.list` (1 unidade para até 50 vídeos). 2 unidades em vez de 100.
import { Platform } from 'react-native';

export const CHANNEL_ID = 'UCeipicy-AS_b66Asu65TBQQ';
// Playlist de uploads do canal = o id com "UU" no lugar de "UC".
const UPLOADS_ID = 'UU' + CHANNEL_ID.slice(2);
const API_KEY = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;

export const YOUTUBE_CANAL_URL = 'https://www.youtube.com/@PenielChurchOfficial';
export const YOUTUBE_LIVES_URL = 'https://www.youtube.com/@PenielChurchOfficial/streams';
export const urlDoVideo = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

async function comTempoLimite(url: string, init?: RequestInit, ms = 10000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type LiveAtual = { videoId: string; titulo: string | null };

/**
 * Checagem sem cota, pela página /live.
 * - `LiveAtual` → está ao vivo.
 * - `null` → a página carregou e NÃO está ao vivo.
 * - `undefined` → não deu para saber (rede, página de consentimento, YouTube
 *   mudou o HTML). Quem chama usa a API.
 */
export async function liveSemCota(): Promise<LiveAtual | null | undefined> {
  const res = await comTempoLimite(`https://www.youtube.com/channel/${CHANNEL_ID}/live`, {
    headers: {
      // Página de consentimento de cookies (UE/Reino Unido) no lugar do vídeo.
      Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+119; SOCS=CAI',
      'Accept-Language': 'en-US,en;q=0.9',
      // Sem um User-Agent de navegador o YouTube às vezes devolve uma página
      // reduzida, sem os dados do player.
      'User-Agent': Platform.OS === 'android'
        ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'
        : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    },
  });
  if (!res || !res.ok) return undefined;
  let html: string;
  try { html = await res.text(); } catch { return undefined; }

  // Se ainda houver redirecionamento em algum caso, vale também.
  const daUrl = (res.url ?? '').match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1];
  const doCanonical = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/)?.[1];
  const videoId = daUrl ?? doCanonical;

  const aoVivo = /"isLiveNow"\s*:\s*true/.test(html);
  const temDadosDoPlayer = html.includes('ytInitialPlayerResponse') || html.includes('"isLiveNow"');

  if (videoId && aoVivo) {
    const titulo = html.match(/<meta name="title" content="([^"]*)"/)?.[1]
      ?? html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]
      ?? null;
    return { videoId, titulo: titulo ? decodificarHtml(titulo) : null };
  }
  // Página do canal (sem vídeo) ou vídeo agendado → não está ao vivo.
  if (html.includes('ytInitialData') && (!videoId || temDadosDoPlayer)) return null;
  // Algo que não reconhecemos (consentimento, HTML novo): não concluir nada.
  return undefined;
}

function decodificarHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Ids dos vídeos mais recentes do canal, do mais novo para o mais antigo. */
async function idsRecentes(max = 15): Promise<string[]> {
  // 1) RSS do canal: sem chave, sem cota.
  const rss = await comTempoLimite(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
  if (rss?.ok) {
    try {
      const xml = await rss.text();
      const ids = [...xml.matchAll(/<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>/g)].map(m => m[1]);
      if (ids.length) return ids.slice(0, max);
    } catch { /* cai na API */ }
  }
  // 2) Playlist de uploads: 1 unidade.
  if (!API_KEY) return [];
  const res = await comTempoLimite(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${UPLOADS_ID}&maxResults=${max}&key=${API_KEY}`,
  );
  if (!res?.ok) return [];
  try {
    const data = await res.json();
    return (data.items ?? []).map((i: any) => i.contentDetails?.videoId).filter(Boolean);
  } catch {
    return [];
  }
}

export type VideoDoCanal = {
  videoId: string;
  titulo: string;
  miniatura: string;
  publicadoEm: string;
  status: 'live' | 'upcoming' | 'none';
};

/** Detalhes e status (ao vivo/agendado/normal): 1 unidade para até 50 ids. */
async function detalhes(ids: string[]): Promise<VideoDoCanal[] | null> {
  if (!API_KEY || ids.length === 0) return ids.length === 0 ? [] : null;
  const res = await comTempoLimite(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids.slice(0, 50).join(',')}&key=${API_KEY}`,
  );
  if (!res?.ok) return null;
  try {
    const data = await res.json();
    return (data.items ?? []).map((i: any) => ({
      videoId: i.id,
      titulo: i.snippet?.title ?? '',
      miniatura: i.snippet?.thumbnails?.medium?.url ?? i.snippet?.thumbnails?.default?.url ?? '',
      publicadoEm: i.snippet?.publishedAt ?? '',
      status: i.snippet?.liveBroadcastContent === 'live' ? 'live'
        : i.snippet?.liveBroadcastContent === 'upcoming' ? 'upcoming' : 'none',
    }));
  } catch {
    return null;
  }
}

/** Rede de segurança com a API: `null` = não está ao vivo; `undefined` = não deu para saber. */
export async function liveComApi(): Promise<LiveAtual | null | undefined> {
  const ids = await idsRecentes(10);
  if (ids.length === 0) return undefined;
  const vids = await detalhes(ids);
  if (!vids) return undefined;
  const live = vids.find(v => v.status === 'live');
  return live ? { videoId: live.videoId, titulo: live.titulo } : null;
}

/**
 * Lista da aba Mídia: o que está ao vivo primeiro, depois os vídeos mais
 * recentes. Transmissões só agendadas ficam de fora (ainda não dá para assistir).
 * 1–2 unidades por chamada (antes: 200).
 */
export async function videosRecentes(max = 10): Promise<VideoDoCanal[] | null> {
  const ids = await idsRecentes(15);
  if (ids.length === 0) return null;
  const vids = await detalhes(ids);
  if (!vids) return null;
  const aoVivo = vids.filter(v => v.status === 'live');
  const normais = vids
    .filter(v => v.status === 'none')
    .sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm));
  return [...aoVivo, ...normais].slice(0, max);
}
