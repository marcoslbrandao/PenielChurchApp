// Nas escalas aparece so o primeiro nome + o ultimo sobrenome (pedido do
// Marcos, 23/10): "Everton Do Nascimento Conceicao" -> "Everton Conceicao",
// "Priscila Adriane" + "Paesano Jota De Matos" -> "Priscila Matos".
export function nomeCurto(nome?: string | null, sobrenome?: string | null): string {
  const n = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  const s = (sobrenome ?? '').trim().split(/\s+/).filter(Boolean);
  const primeiro = n[0] ?? '';
  const ultimo = s.length ? s[s.length - 1] : n.length > 1 ? n[n.length - 1] : '';
  return [primeiro, ultimo].filter(Boolean).join(' ');
}
