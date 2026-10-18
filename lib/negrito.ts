// lib/negrito.ts
//
// Negrito nos chats, no padrão do WhatsApp (18/10/2026): *assim* vira
// **assim**. O texto é gravado no banco com os asteriscos (versões antigas do
// app e as notificações mostram os asteriscos, como o WhatsApp faz quando não
// formata); a bolha do chat é que desenha em negrito.
//
// Regras (as mesmas do WhatsApp):
//   • o * de abertura vem no começo ou depois de espaço/pontuação;
//   • o de fechamento vem no fim ou antes de espaço/pontuação;
//   • não pode começar nem terminar com espaço ("* oi *" não vale);
//   • não atravessa linha.

export type TrechoNegrito = { texto: string; negrito: boolean };

const RE_NEGRITO = /(^|[\s.,;:!?¡¿()[\]{}"'“”‘’«»\-_~])\*(?=\S)([^*\n]*?\S)\*(?=$|[\s.,;:!?¡¿()[\]{}"'“”‘’«»\-_~])/g;

export function separarNegrito(texto: string): TrechoNegrito[] {
  const saida: TrechoNegrito[] = [];
  let ultimo = 0;
  RE_NEGRITO.lastIndex = 0;
  for (let m = RE_NEGRITO.exec(texto); m; m = RE_NEGRITO.exec(texto)) {
    const inicio = m.index + m[1].length;          // posição do * de abertura
    const fim = m.index + m[0].length;             // depois do * de fechamento
    if (inicio > ultimo) saida.push({ texto: texto.slice(ultimo, inicio), negrito: false });
    saida.push({ texto: m[2], negrito: true });
    ultimo = fim;
    // O caractere que vem antes do próximo * pode ser o fim deste trecho.
    RE_NEGRITO.lastIndex = fim;
  }
  if (ultimo < texto.length) saida.push({ texto: texto.slice(ultimo), negrito: false });
  return saida;
}

/** Tira os asteriscos de formatação (para resumos e citações). */
export function semFormatacao(texto: string): string {
  return separarNegrito(texto).map(t => t.texto).join('');
}

/**
 * Põe (ou tira) o negrito do trecho selecionado na caixa de digitar.
 * Espaços nas pontas da seleção ficam de fora — "* oi *" não seria negrito.
 * Devolve o texto novo e onde o cursor deve ficar.
 */
export function alternarNegrito(texto: string, sel: { start: number; end: number }): { texto: string; cursor: number } {
  let a = Math.min(sel.start, sel.end);
  let b = Math.max(sel.start, sel.end);
  while (a < b && /\s/.test(texto[a])) a++;
  while (b > a && /\s/.test(texto[b - 1])) b--;
  if (a === b) return { texto, cursor: sel.end };

  // Já está em negrito (asteriscos colados por fora ou incluídos na seleção)? Tira.
  if (texto[a - 1] === '*' && texto[b] === '*') {
    return { texto: texto.slice(0, a - 1) + texto.slice(a, b) + texto.slice(b + 1), cursor: b - 1 };
  }
  if (b - a >= 2 && texto[a] === '*' && texto[b - 1] === '*') {
    return { texto: texto.slice(0, a) + texto.slice(a + 1, b - 1) + texto.slice(b), cursor: b - 2 };
  }

  // Põe. Se colado numa letra, separa com espaço — senão o WhatsApp-style não vale.
  const antes = a > 0 && /[\p{L}\p{N}]/u.test(texto[a - 1]) ? ' ' : '';
  const depois = b < texto.length && /[\p{L}\p{N}]/u.test(texto[b]) ? ' ' : '';
  const novo = texto.slice(0, a) + antes + '*' + texto.slice(a, b) + '*' + depois + texto.slice(b);
  return { texto: novo, cursor: b + antes.length + 2 };
}
