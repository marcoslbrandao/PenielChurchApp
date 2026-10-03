// Padrao de datas do app: a pessoa sempre DIGITA e LE no formato DD/MM/AAAA
// (ex.: 04/10/2026). O banco (coluna `date` do Postgres) guarda AAAA-MM-DD.
// Nunca mandar DD/MM/AAAA cru para o banco: o Postgres le "04/10/2026" como
// mes/dia (10 de abril), sem dar erro -- foi assim que um evento de 4 de
// outubro foi parar em abril.

// Mascara para o TextInput: aceita so numeros e coloca as barras sozinho.
export function mascaraDataBR(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

// DD/MM/AAAA -> AAAA-MM-DD. Devolve '' se nao for uma data real (31/02 nao passa).
export function dataBRparaISO(br: string): string {
  const m = (br ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, d, mes, a] = m;
  const iso = `${a}-${mes}-${d}`;
  const teste = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(teste.getTime())) return '';
  if (teste.getUTCDate() !== Number(d) || teste.getUTCMonth() + 1 !== Number(mes)) return '';
  return iso;
}

// AAAA-MM-DD (ou timestamp ISO) -> DD/MM/AAAA, para mostrar na tela.
export function isoParaDataBR(iso: string | null | undefined): string {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Dia e mes de HOJE em Londres, sem depender de Intl. O Hermes (motor JS do
// app) nao aplica `timeZone` em `formatToParts` de forma confiavel: a parte
// 'month' vinha vazia e o codigo caia no padrao 1 -- o filtro de aniversario
// abria sempre em Janeiro. Aqui a conta e feita na mao: Londres e UTC no
// inverno e UTC+1 no horario de verao (BST), que vai do ultimo domingo de
// marco ao ultimo domingo de outubro, sempre as 01:00 UTC.
function ultimoDomingoUTC(ano: number, mes0: number): number {
  const ultimoDia = new Date(Date.UTC(ano, mes0 + 1, 0));
  const dia = ultimoDia.getUTCDate() - ultimoDia.getUTCDay();
  return Date.UTC(ano, mes0, dia, 1, 0, 0);
}
export function hojeEmLondres(agora: Date = new Date()): { dia: number; mes: number; ano: number } {
  const t = agora.getTime();
  const ano = agora.getUTCFullYear();
  const emBST = t >= ultimoDomingoUTC(ano, 2) && t < ultimoDomingoUTC(ano, 9);
  const londres = new Date(t + (emBST ? 3600_000 : 0));
  return { dia: londres.getUTCDate(), mes: londres.getUTCMonth() + 1, ano: londres.getUTCFullYear() };
}
