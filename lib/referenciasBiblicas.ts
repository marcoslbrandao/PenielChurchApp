// referenciasBiblicas — acha referencias biblicas dentro de um texto corrido
// ("Isaías 54:2", "2 Coríntios 5:17", "Hab 3:17-18", "Salmos 30:5, 7") e
// devolve o texto em pedacos, com a referencia ja decomposta. Usado para
// deixar os versiculos das Mensagens clicaveis.
//
// O MESMO arquivo existe no app (lib/referenciasBiblicas.ts) e no site
// (src/lib/referenciasBiblicas.ts). Mudou um, copie para o outro.
//
// Regras:
//  - Nome completo do livro (pt, en, es, fr) vale com "cap" ou "cap:vers".
//  - Abreviacao (Is, Sl, Ef, 1Co, Jo...) so vale com "cap:vers", para nao
//    confundir com palavras comuns.
//  - O capitulo precisa existir no livro (Judas 5 nao vira link, Isaias 80 tambem nao).

export type RefBiblica = {
  /** posicao do livro (0 = Genesis ... 65 = Apocalipse), mesma ordem de livrosAT + livrosNT */
  livro: number;
  /** codigo USFM do livro (ISA, 2CO...), usado pelo YouVersion */
  usfm: string;
  capitulo: number;
  /** versiculos citados, em ordem; vazio = capitulo inteiro */
  versos: number[];
  /** o texto exatamente como estava escrito */
  rotulo: string;
};

export type Pedaco = { texto: string; ref?: RefBiblica };

// [USFM, capitulos, nomes completos | abreviacoes]
const LIVROS: [string, number, string, string][] = [
  ['GEN', 50, 'Gênesis|Genesis|Génesis|Genèse', 'Gn|Gên|Gen'],
  ['EXO', 40, 'Êxodo|Exodo|Exodus|Éxodo|Exode', 'Êx|Ex|Exo'],
  ['LEV', 27, 'Levítico|Levitico|Leviticus|Lévitique', 'Lv|Lev'],
  ['NUM', 36, 'Números|Numeros|Numbers|Nombres', 'Nm|Num'],
  ['DEU', 34, 'Deuteronômio|Deuteronomio|Deuteronomy|Deutéronome', 'Dt|Deut'],
  ['JOS', 24, 'Josué|Josue|Joshua', 'Js|Jos|Josh'],
  ['JDG', 21, 'Juízes|Juizes|Judges|Jueces|Juges', 'Jz|Jdg|Juí'],
  ['RUT', 4, 'Rute|Ruth|Rut', 'Rt'],
  ['1SA', 31, '1 Samuel|1Samuel|I Samuel', '1Sm|1 Sm|1Sam|1 Sam'],
  ['2SA', 24, '2 Samuel|2Samuel|II Samuel', '2Sm|2 Sm|2Sam|2 Sam'],
  ['1KI', 22, '1 Reis|1Reis|1 Kings|1 Reyes|1 Rois', '1Rs|1 Rs|1Kgs|1 Kgs'],
  ['2KI', 25, '2 Reis|2Reis|2 Kings|2 Reyes|2 Rois', '2Rs|2 Rs|2Kgs|2 Kgs'],
  ['1CH', 29, '1 Crônicas|1 Cronicas|1 Chronicles|1 Crónicas|1 Chroniques', '1Cr|1 Cr|1Chr|1 Chr'],
  ['2CH', 36, '2 Crônicas|2 Cronicas|2 Chronicles|2 Crónicas|2 Chroniques', '2Cr|2 Cr|2Chr|2 Chr'],
  ['EZR', 10, 'Esdras|Ezra', 'Ed|Esd|Ezr'],
  ['NEH', 13, 'Neemias|Nehemiah|Nehemías|Néhémie', 'Ne|Neh'],
  ['EST', 10, 'Ester|Esther', 'Et|Est'],
  ['JOB', 42, 'Jó|Job', ''],
  ['PSA', 150, 'Salmos|Salmo|Psalms|Psalm|Psaumes|Psaume', 'Sl|Sal|Ps|Psa'],
  ['PRO', 31, 'Provérbios|Proverbios|Proverbs|Proverbes', 'Pv|Pr|Prov'],
  ['ECC', 12, 'Eclesiastes|Ecclesiastes|Eclesiastés|Ecclésiaste', 'Ec|Ecl|Ecc'],
  ['SNG', 8, 'Cânticos dos Cânticos|Cântico dos Cânticos|Cantares|Song of Solomon|Song of Songs|Cantique des Cantiques|Cantique', 'Ct|Cnt'],
  ['ISA', 66, 'Isaías|Isaias|Isaiah|Ésaïe|Esaïe|Isaïe', 'Is|Isa'],
  ['JER', 52, 'Jeremias|Jeremiah|Jeremías|Jérémie', 'Jr|Jer'],
  ['LAM', 5, 'Lamentações|Lamentacoes|Lamentations|Lamentaciones', 'Lm|Lam'],
  ['EZK', 48, 'Ezequiel|Ezekiel|Ézéchiel', 'Ez|Eze|Ezk'],
  ['DAN', 12, 'Daniel', 'Dn|Dan'],
  ['HOS', 14, 'Oséias|Oseias|Hosea|Oseas|Osée', 'Os|Hos'],
  ['JOL', 3, 'Joel|Joël', 'Jl'],
  ['AMO', 9, 'Amós|Amos', 'Am'],
  ['OBA', 1, 'Obadias|Obadiah|Abdías|Abdias', 'Ob|Obd'],
  ['JON', 4, 'Jonas|Jonah|Jonás', 'Jn|Jon'],
  ['MIC', 7, 'Miquéias|Miqueias|Micah|Miqueas|Michée', 'Mq|Mic'],
  ['NAM', 3, 'Naum|Nahum|Nahúm', 'Na|Nah'],
  ['HAB', 3, 'Habacuque|Habakkuk|Habacuc', 'Hc|Hab'],
  ['ZEP', 3, 'Sofonias|Zephaniah|Sofonías|Sophonie', 'Sf|Sof|Zeph'],
  ['HAG', 2, 'Ageu|Haggai|Hageo|Aggée', 'Ag|Hag'],
  ['ZEC', 14, 'Zacarias|Zechariah|Zacarías|Zacharie', 'Zc|Zac|Zech'],
  ['MAL', 4, 'Malaquias|Malachi|Malaquías|Malachie', 'Ml|Mal'],
  ['MAT', 28, 'Mateus|Matthew|Mateo|Matthieu', 'Mt|Mat|Matt'],
  ['MRK', 16, 'Marcos|Mark|Marc', 'Mc|Mk|Mrk'],
  ['LUK', 24, 'Lucas|Luke|Luc', 'Lc|Lk|Luk'],
  ['JHN', 21, 'João|Joao|John|Juan|Jean', 'Jo|Jn|Jhn'],
  ['ACT', 28, 'Atos|Acts|Hechos|Actes', 'At|Act'],
  ['ROM', 16, 'Romanos|Romans|Romains', 'Rm|Rom'],
  ['1CO', 16, '1 Coríntios|1 Corintios|1Coríntios|1 Corinthians|1 Corinthiens|I Coríntios', '1Co|1 Co|1Cor|1 Cor'],
  ['2CO', 13, '2 Coríntios|2 Corintios|2Coríntios|2 Corinthians|2 Corinthiens|II Coríntios', '2Co|2 Co|2Cor|2 Cor'],
  ['GAL', 6, 'Gálatas|Galatas|Galatians|Galates', 'Gl|Gál|Gal'],
  ['EPH', 6, 'Efésios|Efesios|Ephesians|Éphésiens', 'Ef|Efé|Eph'],
  ['PHP', 4, 'Filipenses|Philippians|Philippiens', 'Fp|Fl|Fil|Phil'],
  ['COL', 4, 'Colossenses|Colossians|Colosenses|Colossiens', 'Cl|Col'],
  ['1TH', 5, '1 Tessalonicenses|1 Thessalonians|1 Tesalonicenses|1 Thessaloniciens', '1Ts|1 Ts|1Tes|1 Tes|1Thess|1 Thess'],
  ['2TH', 3, '2 Tessalonicenses|2 Thessalonians|2 Tesalonicenses|2 Thessaloniciens', '2Ts|2 Ts|2Tes|2 Tes|2Thess|2 Thess'],
  ['1TI', 6, '1 Timóteo|1 Timoteo|1 Timothy|1 Timothée', '1Tm|1 Tm|1Tim|1 Tim'],
  ['2TI', 4, '2 Timóteo|2 Timoteo|2 Timothy|2 Timothée', '2Tm|2 Tm|2Tim|2 Tim'],
  ['TIT', 3, 'Tito|Titus|Tite', 'Tt|Tit'],
  ['PHM', 1, 'Filemom|Filemon|Philemon|Filemón|Philémon', 'Fm|Flm|Phlm'],
  ['HEB', 13, 'Hebreus|Hebrews|Hebreos|Hébreux', 'Hb|Heb'],
  ['JAS', 5, 'Tiago|James|Santiago|Jacques', 'Tg|Jas|Tia'],
  ['1PE', 5, '1 Pedro|1 Peter|1 Pierre', '1Pe|1 Pe|1Pd|1 Pd|1Pet|1 Pet'],
  ['2PE', 3, '2 Pedro|2 Peter|2 Pierre', '2Pe|2 Pe|2Pd|2 Pd|2Pet|2 Pet'],
  ['1JN', 5, '1 João|1 Joao|1 John|1 Juan|1 Jean', '1Jo|1 Jo|1Jn|1 Jn'],
  ['2JN', 1, '2 João|2 Joao|2 John|2 Juan|2 Jean', '2Jo|2 Jo|2Jn|2 Jn'],
  ['3JN', 1, '3 João|3 Joao|3 John|3 Juan|3 Jean', '3Jo|3 Jo|3Jn|3 Jn'],
  ['JUD', 1, 'Judas|Jude', 'Jd'],
  ['REV', 22, 'Apocalipse|Revelation|Apocalipsis|Apocalypse', 'Ap|Apoc|Rev|Ap'],
];

type Entrada = { nome: string; livro: number; abrev: boolean };

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s?');

const ENTRADAS: Entrada[] = [];
LIVROS.forEach(([, , nomes, abrevs], livro) => {
  nomes.split('|').forEach(nome => ENTRADAS.push({ nome, livro, abrev: false }));
  abrevs.split('|').filter(Boolean).forEach(nome => ENTRADAS.push({ nome, livro, abrev: true }));
});
// Mais longo primeiro: "1 João" antes de "João", "Salmos" antes de "Salmo".
ENTRADAS.sort((a, b) => b.nome.length - a.nome.length);

const POR_NOME = new Map<string, Entrada>();
for (const e of ENTRADAS) {
  const chave = e.nome.replace(/\s/g, '');
  if (!POR_NOME.has(chave)) POR_NOME.set(chave, e);
}

// livro + (ponto opcional da abreviacao) + capitulo + (:versos)
const RE = new RegExp(
  '(' + ENTRADAS.map(e => escapar(e.nome)).join('|') + ')\\.?\\s?' +
  '(\\d{1,3})' +
  '(?::(\\d{1,3}(?:\\s?[-\\u2013]\\s?\\d{1,3})?(?:,\\s?\\d{1,3}(?:\\s?[-\\u2013]\\s?\\d{1,3})?(?![\\d:]|\\s?[A-ZÀ-Ý]))*))?',
  'g',
);

const LETRA = /[A-Za-zÀ-ÿ0-9]/;

function expandirVersos(s: string): number[] {
  const nums: number[] = [];
  for (const parte of s.split(',')) {
    const [a, b] = parte.split(/[-\u2013]/).map(x => parseInt(x.trim(), 10));
    if (isNaN(a)) continue;
    const fim = !isNaN(b) && b >= a && b - a < 200 ? b : a;
    for (let n = a; n <= fim; n++) if (!nums.includes(n)) nums.push(n);
  }
  return nums.sort((x, y) => x - y);
}

/** Quebra o texto em pedacos; os que sao referencia biblica trazem `ref`. */
export function segmentarReferencias(texto: string): Pedaco[] {
  const saida: Pedaco[] = [];
  let ultimo = 0;
  RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(texto))) {
    const inicio = m.index;
    const fim = inicio + m[0].length;
    const antes = inicio > 0 ? texto[inicio - 1] : '';
    const depois = fim < texto.length ? texto[fim] : '';
    const entrada = POR_NOME.get(m[1].replace(/\s/g, ''));
    const capitulo = parseInt(m[2], 10);
    const temVersos = m[3] !== undefined;
    const valido =
      !!entrada &&
      !LETRA.test(antes) &&
      !LETRA.test(depois) &&
      (!entrada.abrev || temVersos) &&
      capitulo >= 1 &&
      capitulo <= LIVROS[entrada.livro][1];
    if (!valido) {
      // Recomeca uma posicao depois para nao perder uma referencia colada.
      RE.lastIndex = inicio + 1;
      continue;
    }
    if (inicio > ultimo) saida.push({ texto: texto.slice(ultimo, inicio) });
    saida.push({
      texto: m[0],
      ref: {
        livro: entrada!.livro,
        usfm: LIVROS[entrada!.livro][0],
        capitulo,
        versos: temVersos ? expandirVersos(m[3]!) : [],
        rotulo: m[0],
      },
    });
    ultimo = fim;
  }
  if (ultimo < texto.length) saida.push({ texto: texto.slice(ultimo) });
  return saida;
}

/** "Isaías 54:2" -> nome do livro no idioma pedido + cap:versos, para o titulo da janela. */
export function rotuloVersos(ref: RefBiblica): string {
  if (!ref.versos.length) return `${ref.capitulo}`;
  const partes: string[] = [];
  let a = ref.versos[0];
  let b = a;
  for (let i = 1; i <= ref.versos.length; i++) {
    const v = ref.versos[i];
    if (v === b + 1) { b = v; continue; }
    partes.push(a === b ? `${a}` : `${a}-${b}`);
    a = b = v;
  }
  return `${ref.capitulo}:${partes.join(',')}`;
}
