// supabase/functions/calendario/index.ts
//
// Calendário anual da igreja em formato iCalendar (.ics) — pedido do Marcos,
// 11/11/2026. É o que faz o celular perguntar "Adicionar ao calendário?".
//
//   GET /calendario                 → o ano todo (assinatura: o iPhone e o
//                                     Google Agenda buscam de novo sozinhos,
//                                     então data nova aparece no celular)
//   GET /calendario?cats=ceia,alive → só as categorias escolhidas
//   GET /calendario?id=<uuid>       → uma data só (o "+" de cada evento)
//
// No iPhone o app abre `webcal://…/calendario` (Assinar calendário?) ou o link
// https com ?id= (Adicionar evento?). No Android usa o Google Agenda.
//
// Público, sem login (DEPLOY com --no-verify-jwt): o calendário já é aberto a
// visitantes no app, e o Calendário do iPhone não manda cabeçalho nenhum.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

type Categoria = { id: string; nome: string; emoji: string; cor: string };
type Data = {
  id: string; categoria_id: string; titulo: string; descricao: string | null;
  data_inicio: string; data_fim: string | null; hora_inicio: string | null; hora_fim: string | null;
  local: string | null; updated_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fuso de Reading (horário de verão do Reino Unido).
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/London',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0000', 'TZOFFSETTO:+0100', 'TZNAME:BST',
  'DTSTART:19700329T010000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0000', 'TZNAME:GMT',
  'DTSTART:19701025T020000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

function texto(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Linhas de no máximo 75 bytes (regra do formato), sem partir emoji/acento.
function dobrar(linha: string) {
  const enc = new TextEncoder();
  if (enc.encode(linha).length <= 75) return linha;
  const partes: string[] = [];
  let atual = '';
  let limite = 75;
  for (const ch of linha) {
    if (enc.encode(atual + ch).length > limite) { partes.push(atual); atual = ch; limite = 74; }
    else atual += ch;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

const soData = (iso: string) => iso.replaceAll('-', '');
const hora = (h: string) => h.slice(0, 5).replace(':', '') + '00';
function maisUmDia(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function utc(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function vevent(d: Data, cat: Categoria | undefined) {
  const l = ['BEGIN:VEVENT', `UID:${d.id}@penielchurch.org.uk`, `DTSTAMP:${utc(d.updated_at)}`];
  if (!d.hora_inicio) {
    l.push(`DTSTART;VALUE=DATE:${soData(d.data_inicio)}`);
    l.push(`DTEND;VALUE=DATE:${soData(maisUmDia(d.data_fim ?? d.data_inicio))}`);
  } else {
    l.push(`DTSTART;TZID=Europe/London:${soData(d.data_inicio)}T${hora(d.hora_inicio)}`);
    const fimDia = d.data_fim ?? d.data_inicio;
    if (d.hora_fim) l.push(`DTEND;TZID=Europe/London:${soData(fimDia)}T${hora(d.hora_fim)}`);
    else if (d.data_fim) l.push(`DTEND;TZID=Europe/London:${soData(fimDia)}T${hora(d.hora_inicio)}`);
    else l.push('DURATION:PT2H');
  }
  l.push(`SUMMARY:${texto(`${cat?.emoji ? cat.emoji + ' ' : ''}${d.titulo}`)}`);
  if (cat) l.push(`CATEGORIES:${texto(cat.nome)}`);
  const desc = [d.descricao?.trim(), 'Peniel Church · app.penielchurch.org.uk'].filter(Boolean).join('\n\n');
  l.push(`DESCRIPTION:${texto(desc)}`);
  if (d.local) l.push(`LOCATION:${texto(d.local)}`);
  l.push('TRANSP:' + (d.hora_inicio ? 'OPAQUE' : 'TRANSPARENT'));
  l.push('END:VEVENT');
  return l;
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Método não permitido', { status: 405 });
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const cats = (url.searchParams.get('cats') ?? '').split(',').map(s => s.trim()).filter(s => /^[a-z0-9_-]{1,30}$/.test(s));

  const db = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: categorias } = await db.from('calendario_categorias').select('id, nome, emoji, cor').eq('ativa', true);
  const porId = new Map(((categorias ?? []) as Categoria[]).map(c => [c.id, c]));

  let q = db.from('calendario_datas')
    .select('id, categoria_id, titulo, descricao, data_inicio, data_fim, hora_inicio, hora_fim, local, updated_at')
    .order('data_inicio');
  if (id) {
    if (!UUID.test(id)) return new Response('Evento não encontrado', { status: 404 });
    q = q.eq('id', id);
  } else {
    // Dos últimos 2 meses em diante (o passado distante só pesa o calendário).
    const desde = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    q = q.gte('data_inicio', desde).limit(1000);
    if (cats.length) q = q.in('categoria_id', cats);
  }
  const { data, error } = await q;
  if (error) return new Response('Erro ao ler o calendário', { status: 500 });
  const datas = ((data ?? []) as Data[]).filter(d => porId.has(d.categoria_id));
  if (id && !datas.length) return new Response('Evento não encontrado', { status: 404 });

  const nome = cats.length === 1 && porId.get(cats[0])
    ? `Peniel Church · ${porId.get(cats[0])!.nome}`
    : 'Peniel Church';

  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Peniel Church//Calendario//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${texto(nome)}`, 'X-WR-TIMEZONE:Europe/London',
    'X-WR-CALDESC:Calendário anual da Peniel Church (Reading)',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
    'X-APPLE-CALENDAR-COLOR:#534AB7',
    ...VTIMEZONE,
    ...datas.flatMap(d => vevent(d, porId.get(d.categoria_id))),
    'END:VCALENDAR',
  ];
  const corpo = linhas.map(dobrar).join('\r\n') + '\r\n';

  return new Response(req.method === 'HEAD' ? null : corpo, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${id ? 'evento-peniel' : 'peniel-church'}.ics"`,
      'Cache-Control': 'public, max-age=900',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
