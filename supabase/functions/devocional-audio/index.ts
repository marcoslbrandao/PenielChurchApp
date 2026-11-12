// supabase/functions/devocional-audio/index.ts
//
// Devocional em áudio nos 4 idiomas (pedido do Marcos, 11/11/2026; feito em
// 12/11/2026). "Para quem não pode ler — trabalhando, dirigindo."
//
//   POST { devocional_id, lang, so_verificar? }
//     → { disponivel: boolean, url?: string, proprio?: boolean }
//
// 1. Português com áudio gravado pelo pastor (`devocionais.audio_proprio_path`)
//    → devolve esse.
// 2. Senão, voz neural: monta o texto (título, versículo, referência e o
//    devocional), traduz pelo mesmo cache do app (content_translations /
//    translate-content) e gera o MP3 — só na primeira vez; depois é cache
//    (`devocional_audios` + bucket público `devocional-audio`).
//
// Provedor (secrets do Supabase, o que estiver configurado):
//   • ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID → ElevenLabs (dá para clonar a
//     voz do pastor e ela fala os 4 idiomas)
//   • OPENAI_API_KEY → OpenAI (voz neural pronta, ~US$ 0,02 por devocional)
//   Opcionais: OPENAI_TTS_VOZ (padrão "onyx"), OPENAI_TTS_MODELO.
// Sem nenhum: { disponivel: false } e o app esconde o botão "Ouvir".
//
// Quem pode ouvir: quem pode LER o devocional (a consulta vai com o token de
// quem pediu, então a regra do banco vale — devocional geral é público).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const OPENAI = Deno.env.get('OPENAI_API_KEY') ?? '';
const ELEVEN = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
const ELEVEN_VOZ = Deno.env.get('ELEVENLABS_VOICE_ID') ?? '';
const VOZ_OPENAI = Deno.env.get('OPENAI_TTS_VOZ') ?? 'onyx';
const MODELO_OPENAI = Deno.env.get('OPENAI_TTS_MODELO') ?? 'gpt-4o-mini-tts';
const BUCKET = 'devocional-audio';
const IDIOMAS = ['pt', 'en', 'es', 'fr'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const provedor = ELEVEN && ELEVEN_VOZ ? 'elevenlabs' : OPENAI ? 'openai' : null;
const nomeVoz = provedor === 'elevenlabs' ? `eleven:${ELEVEN_VOZ}` : provedor === 'openai' ? `openai:${MODELO_OPENAI}:${VOZ_OPENAI}` : '';

const INSTRUCOES: Record<string, string> = {
  pt: 'Leia em português do Brasil, com voz calma, acolhedora e pastoral, em ritmo tranquilo, com pausas naturais entre os parágrafos.',
  en: 'Read in English with a calm, warm, pastoral voice, at a gentle pace, with natural pauses between paragraphs.',
  es: 'Lee en español con una voz tranquila, cálida y pastoral, a un ritmo pausado, con pausas naturales entre los párrafos.',
  fr: 'Lis en français avec une voix calme, chaleureuse et pastorale, à un rythme posé, avec des pauses naturelles entre les paragraphes.',
};

async function hash(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).slice(0, 10).map(x => x.toString(16).padStart(2, '0')).join('');
}

// Corta em pedaços de até ~3500 caracteres, em fim de parágrafo/frase.
function pedacos(texto: string, max = 3500): string[] {
  const saida: string[] = [];
  let atual = '';
  for (const par of texto.split(/\n{2,}/)) {
    if ((atual + '\n\n' + par).length <= max) { atual = atual ? `${atual}\n\n${par}` : par; continue; }
    if (atual) saida.push(atual);
    if (par.length <= max) { atual = par; continue; }
    atual = '';
    for (const frase of par.split(/(?<=[.!?…])\s+/)) {
      if ((atual + ' ' + frase).length > max && atual) { saida.push(atual); atual = frase; }
      else atual = atual ? `${atual} ${frase}` : frase;
    }
  }
  if (atual) saida.push(atual);
  return saida;
}

async function falar(texto: string, lang: string): Promise<Uint8Array> {
  const partes: Uint8Array[] = [];
  for (const p of pedacos(texto)) {
    let r: Response;
    if (provedor === 'elevenlabs') {
      r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOZ}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': ELEVEN, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: p, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.55, similarity_boost: 0.8 } }),
      });
    } else {
      r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODELO_OPENAI, voice: VOZ_OPENAI, input: p, instructions: INSTRUCOES[lang], response_format: 'mp3' }),
      });
    }
    if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 200)}`);
    partes.push(new Uint8Array(await r.arrayBuffer()));
  }
  // MP3 pode ser emendado direto, quadro atrás de quadro.
  const total = partes.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of partes) { out.set(b, o); o += b.length; }
  return out;
}

async function traduzir(campo: string, texto: string, devId: string, lang: string): Promise<string | null> {
  if (lang === 'pt' || !texto.trim()) return texto;
  const r = await fetch(`${SUPABASE_URL}/functions/v1/translate-content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'devocionais', rowId: devId, field: campo, text: texto, lang }),
  });
  const j = await r.json().catch(() => null);
  if (!j?.translated || j.fallback) return null; // tradução indisponível agora: não lê em português com voz de outro idioma
  return j.translated as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { devocional_id, lang: langPedido, so_verificar } = await req.json();
    const lang = IDIOMAS.includes(langPedido) ? langPedido : 'pt';
    if (!devocional_id) return json({ error: 'devocional_id' }, 400);

    // Lê COMO quem pediu: se não pode ler o devocional, não pode ouvir.
    const auth = req.headers.get('authorization') ?? `Bearer ${ANON_KEY}`;
    const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: dev } = await comoUsuario.from('devocionais')
      .select('id, titulo, versiculo, referencia, texto, audio_proprio_path').eq('id', devocional_id).maybeSingle();
    if (!dev) return json({ disponivel: false }, 404);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const publico = (p: string) => admin.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;

    if (lang === 'pt' && dev.audio_proprio_path) {
      return json({ disponivel: true, proprio: true, url: publico(dev.audio_proprio_path) });
    }
    if (!provedor) return json({ disponivel: false });

    // Versão do texto em português: se o devocional mudar, o áudio muda.
    const h = await hash([lang, nomeVoz, dev.titulo, dev.versiculo, dev.referencia, dev.texto].join('\u0001'));
    const { data: pronto } = await admin.from('devocional_audios').select('path')
      .eq('devocional_id', dev.id).eq('lang', lang).eq('hash', h).maybeSingle();
    if (pronto) return json({ disponivel: true, url: publico(pronto.path) });
    if (so_verificar) return json({ disponivel: true });

    const [titulo, versiculo, referencia, texto] = await Promise.all([
      traduzir('titulo', dev.titulo ?? '', dev.id, lang),
      traduzir('versiculo', dev.versiculo ?? '', dev.id, lang),
      traduzir('referencia', dev.referencia ?? '', dev.id, lang),
      traduzir('texto', dev.texto ?? '', dev.id, lang),
    ]);
    if ([titulo, versiculo, referencia, texto].some(x => x === null)) {
      return json({ disponivel: true, error: 'traducao_indisponivel' }, 503);
    }
    // Sem o negrito do app (**texto**) e sem links.
    const limpo = (s: string) => s.replace(/\*\*/g, '').replace(/https?:\/\/\S+/g, '').trim();
    const roteiro = [limpo(titulo!), `${limpo(versiculo!)} — ${limpo(referencia!)}`, limpo(texto!)].filter(Boolean).join('\n\n');

    const mp3 = await falar(roteiro, lang);
    const caminho = `${dev.id}/${lang}-${h}.mp3`;
    const up = await admin.storage.from(BUCKET).upload(caminho, mp3, { contentType: 'audio/mpeg', upsert: true });
    if (up.error) throw up.error;
    await admin.from('devocional_audios').upsert(
      { devocional_id: dev.id, lang, hash: h, path: caminho, caracteres: roteiro.length, voz: nomeVoz },
      { onConflict: 'devocional_id,lang,hash' },
    );
    return json({ disponivel: true, url: publico(caminho) });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
