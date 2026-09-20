// Detecta links dentro de um texto de chat, para torná-los clicáveis.
//
// Reconhece três formas, que é como as pessoas colam links na prática:
//   • com protocolo:     https://instagram.com/p/xyz   http://site.org
//   • começando em www.: www.penielchurch.org.uk
//   • domínio conhecido sem nada na frente: youtu.be/abc, instagram.com/peniel
//     (lista curta de propósito — "fim.de" ou "obs.no" numa frase normal NÃO
//     pode virar link; só domínios que alguém cola de verdade no chat)
//
// A pontuação no fim ("veja isso: https://x.com/a." ou "(https://x.com)") não
// entra no link: é o erro mais comum de detector ingênuo, e o link abre
// quebrado.

export type Trecho = { tipo: 'texto'; valor: string } | { tipo: 'link'; valor: string; url: string };

const DOMINIOS_SEM_PROTOCOLO =
  '(?:youtu\\.be|youtube\\.com|m\\.youtube\\.com|instagram\\.com|instagr\\.am|facebook\\.com|fb\\.watch|' +
  'wa\\.me|chat\\.whatsapp\\.com|tiktok\\.com|vm\\.tiktok\\.com|open\\.spotify\\.com|spotify\\.link|' +
  'x\\.com|twitter\\.com|zoom\\.us|[a-z0-9-]+\\.zoom\\.us|maps\\.app\\.goo\\.gl|goo\\.gl|bit\\.ly|' +
  'penielchurch\\.org\\.uk|cifraclub\\.com\\.br|letras\\.mus\\.br)';

// Um "pedaço de URL" é qualquer coisa até o próximo espaço.
const RE_LINK = new RegExp(
  '(?:https?:\\/\\/[^\\s<>"]+)' +
  '|(?:\\bwww\\.[^\\s<>"]+)' +
  `|(?:(?<![\\w@.\\/])${DOMINIOS_SEM_PROTOCOLO}(?:\\/[^\\s<>"]*)?)`,
  'gi',
);

/** Tira do fim do link a pontuação que pertence à frase, não à URL. */
function aparaFinal(bruto: string): string {
  let s = bruto;
  for (;;) {
    const ultimo = s.slice(-1);
    if (/[.,;:!?'"…]/.test(ultimo)) { s = s.slice(0, -1); continue; }
    // Parêntese/colchete de fechamento só sai se não tiver o par de abertura
    // dentro do link — senão quebraria links da Wikipédia, por exemplo.
    const pares: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    if (pares[ultimo]) {
      const abre = (s.match(new RegExp('\\' + pares[ultimo], 'g')) ?? []).length;
      const fecha = (s.match(new RegExp('\\' + ultimo, 'g')) ?? []).length;
      if (fecha > abre) { s = s.slice(0, -1); continue; }
    }
    return s;
  }
}

export function normalizarUrl(link: string): string {
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

/** Quebra o texto em trechos de texto puro e trechos de link, na ordem. */
export function separarLinks(texto: string): Trecho[] {
  const saida: Trecho[] = [];
  let ultimo = 0;
  RE_LINK.lastIndex = 0;
  for (let m = RE_LINK.exec(texto); m; m = RE_LINK.exec(texto)) {
    const link = aparaFinal(m[0]);
    if (!link || link.length < 4) continue;
    const inicio = m.index;
    const fim = inicio + link.length;
    if (inicio > ultimo) saida.push({ tipo: 'texto', valor: texto.slice(ultimo, inicio) });
    saida.push({ tipo: 'link', valor: link, url: normalizarUrl(link) });
    ultimo = fim;
    // O que foi aparado volta a ser procurado como texto normal.
    RE_LINK.lastIndex = fim;
  }
  if (ultimo < texto.length) saida.push({ tipo: 'texto', valor: texto.slice(ultimo) });
  return saida;
}
