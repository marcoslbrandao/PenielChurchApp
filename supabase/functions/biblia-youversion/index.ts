// biblia-youversion — busca um capitulo no YouVersion Platform (fonte
// licenciada oficialmente pelas editoras) e devolve versiculo por versiculo.
//
// Por que existe: a NVI caiu no bolls.life em 08/10/2026 (a Biblica proibiu o
// site de servir o texto). O YouVersion Platform tem a NVI e outras versoes
// licenciadas para o app da Peniel (conta "Peniel Church", app nao comercial,
// licencas da Biblica e de dominio publico aceitas pelo Marcos).
//
// A App Key fica so aqui (segredo YVP_APP_KEY no Supabase), nunca dentro do app.
//
// Pedido (POST JSON, via supabase.functions.invoke):
//   { bible: 129, ref: "JHN.3" }
// Resposta:
//   { verses: [{ verse: 1, text: "..." }, ...], copyright: "...", abbreviation: "NVI" }

const API = 'https://api.youversion.com/v1';
const APP_KEY = Deno.env.get('YVP_APP_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Copyright de cada versao muda quase nunca: guarda enquanto a funcao estiver quente.
const metaCache = new Map<number, { copyright: string; abbreviation: string }>();

async function yv(path: string) {
  const res = await fetch(`${API}${path}`, { headers: { 'X-YVP-App-Key': APP_KEY } });
  if (!res.ok) throw new Error(`YouVersion ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Elementos que nao fazem parte do texto do versiculo: titulos de secao,
// referencias cruzadas, notas de rodape e o rotulo com o numero do versiculo.
const CLASSES_FORA = /^(s\d?|ms\d?|mr|r|sp|d|cl|f|x|fr|ft|yv-n.*|yv-vlbl|note.*)$/;

const ENTIDADES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

function versiculosDoHtml(html: string): { verse: number; text: string }[] {
  const versos = new Map<number, string>();
  let atual = 0; // 0 = antes do primeiro versiculo (titulo do salmo etc.) -> descartado
  const pilha: boolean[] = []; // para cada tag aberta: estamos dentro de algo descartado?
  const dentroDescartado = () => pilha.some(Boolean);

  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, fecha, tag, attrs, texto] = m;
    if (texto !== undefined) {
      if (atual > 0 && !dentroDescartado()) {
        versos.set(atual, (versos.get(atual) ?? '') + texto);
      }
      continue;
    }
    const autoFecha = /\/\s*$/.test(attrs ?? '') || tag.toLowerCase() === 'br';
    if (fecha) {
      pilha.pop();
      // Fim de paragrafo/linha poetica vira espaco, para nao colar palavras.
      if (atual > 0 && !dentroDescartado()) versos.set(atual, (versos.get(atual) ?? '') + ' ');
      continue;
    }
    const classe = /class="([^"]*)"/.exec(attrs ?? '')?.[1] ?? '';
    const v = /\bv="(\d+)"/.exec(attrs ?? '')?.[1];
    if (classe.split(/\s+/).includes('yv-v') && v) atual = Number(v);
    if (!autoFecha) pilha.push(classe.split(/\s+/).some(c => CLASSES_FORA.test(c)));
  }

  return [...versos.entries()]
    .map(([verse, text]) => ({
      verse,
      text: text
        .replace(/&[a-z#0-9]+;/gi, e => ENTIDADES[e] ?? e)
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    .filter(v => v.text.length > 0)
    .sort((a, b) => a.verse - b.verse);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!APP_KEY) return json({ error: 'YVP_APP_KEY nao configurada' }, 500);

  try {
    const { bible, ref } = await req.json();
    const id = Number(bible);
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'bible invalida' }, 400);
    if (typeof ref !== 'string' || !/^[1-4A-Z]{3}\.\d{1,3}$/.test(ref)) return json({ error: 'ref invalida' }, 400);

    const [passagem, meta] = await Promise.all([
      yv(`/bibles/${id}/passages/${ref}?format=html`),
      metaCache.has(id)
        ? Promise.resolve(metaCache.get(id)!)
        : yv(`/bibles/${id}`).then((b: any) => {
            const m = { copyright: String(b.copyright ?? '').trim(), abbreviation: String(b.localized_abbreviation ?? b.abbreviation ?? '') };
            metaCache.set(id, m);
            return m;
          }),
    ]);

    const verses = versiculosDoHtml(String(passagem?.content ?? ''));
    if (verses.length === 0) return json({ error: 'capitulo vazio' }, 404);
    return json({ verses, copyright: meta.copyright, abbreviation: meta.abbreviation });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 502);
  }
});
