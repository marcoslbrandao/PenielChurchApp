// supabase/functions/translate-content/index.ts
// Traduz automaticamente conteúdo digitado pelo admin em português (devocional,
// avisos, mensagens do blog, eventos da agenda) para o idioma que o usuário
// escolheu no app (EN/ES/FR). Chamado pelo app via
// `supabase.functions.invoke('translate-content', { body: {...} })`.
//
// Fluxo:
// 1. Se lang === 'pt' ou texto vazio, devolve o texto original (sem custo).
// 2. Procura em `content_translations` se esse texto exato já foi traduzido
//    antes para esse idioma — se sim, devolve o cache (sem chamar API externa).
// 3. Se não tiver cache (ou o texto mudou desde a última tradução), chama a
//    MyMemory Translation API (gratuita, sem chave) e grava o resultado em
//    cache antes de responder.
//
// Como ligar (uma vez só):
//   supabase functions deploy translate-content
//
// Provedor: MyMemory (https://mymemory.translated.net) — gratuito, sem API key.
// Tem limite de ~500 caracteres por requisição, então textos longos são
// quebrados em pedaços e traduzidos em sequência.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const IDIOMAS_VALIDOS = ['en', 'es', 'fr'];

function quebrarEmPedacos(texto: string, tamanhoMax = 450): string[] {
  if (texto.length <= tamanhoMax) return [texto];
  const pedacos: string[] = [];
  let resto = texto;
  while (resto.length > tamanhoMax) {
    let corte = resto.lastIndexOf('. ', tamanhoMax);
    if (corte < tamanhoMax * 0.4) corte = resto.lastIndexOf(' ', tamanhoMax);
    if (corte <= 0) corte = tamanhoMax;
    pedacos.push(resto.slice(0, corte + 1));
    resto = resto.slice(corte + 1);
  }
  if (resto) pedacos.push(resto);
  return pedacos;
}

async function traduzirComMyMemory(texto: string, idiomaDestino: string): Promise<string> {
  const pedacos = quebrarEmPedacos(texto);
  const traduzidos: string[] = [];
  for (const pedaco of pedacos) {
    const url = `${MYMEMORY_URL}?q=${encodeURIComponent(pedaco)}&langpair=pt|${idiomaDestino}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MyMemory respondeu ${res.status}`);
    const data = await res.json();
    const traduzido = data?.responseData?.translatedText;
    if (!traduzido) throw new Error('MyMemory não retornou tradução.');
    traduzidos.push(traduzido);
  }
  return traduzidos.join('');
}

Deno.serve(async (req) => {
  try {
    const { table, rowId, field, text, lang } = await req.json();

    if (!table || !rowId || !field || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios: table, rowId, field, text.' }), { status: 400 });
    }
    if (!text.trim() || !IDIOMAS_VALIDOS.includes(lang)) {
      // Português (idioma original) ou texto vazio — nada a traduzir.
      return new Response(JSON.stringify({ translated: text }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: cacheHit } = await supabase
      .from('content_translations')
      .select('original_text, translated_text')
      .eq('table_name', table)
      .eq('row_id', String(rowId))
      .eq('field_name', field)
      .eq('lang', lang)
      .maybeSingle();

    if (cacheHit && cacheHit.original_text === text) {
      return new Response(JSON.stringify({ translated: cacheHit.translated_text, cached: true }), { status: 200 });
    }

    let translated: string;
    try {
      translated = await traduzirComMyMemory(text, lang);
    } catch (apiError) {
      // Se a API externa falhar, devolve o texto original em vez de quebrar a tela.
      console.error('Erro ao traduzir via MyMemory:', apiError);
      return new Response(JSON.stringify({ translated: text, fallback: true }), { status: 200 });
    }

    await supabase.from('content_translations').upsert({
      table_name: table, row_id: String(rowId), field_name: field, lang,
      original_text: text, translated_text: translated,
    }, { onConflict: 'table_name,row_id,field_name,lang' });

    return new Response(JSON.stringify({ translated }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
