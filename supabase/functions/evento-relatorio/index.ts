// supabase/functions/evento-relatorio/index.ts
//
// Relatório (planilha .xlsx) de um evento com inscrição — pedido do Marcos,
// 12/11/2026: "onde fica registrado o nome de todos, o que já foi pago, as
// datas e o que for mais relevante".
//
// Abas: Resumo · Inscrições · Pessoas · Pagamentos.
// Quem pode: a gestão do evento (admin, tesouraria, líder e equipe com gestão).
// Telefone e e-mail só saem para admin/tesouraria (regra do banco,
// evento_relatorio). O arquivo vai para o bucket privado `relatorios` e o app
// recebe um link que vale 15 minutos (abre no navegador do celular, de onde
// dá para salvar, abrir no Excel/Numbers ou enviar).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const STATUS: Record<string, string> = {
  pendente: 'Aguardando entrada', confirmada: 'Confirmada', espera: 'Lista de espera', cancelada: 'Cancelada',
};
const FORMA: Record<string, string> = {
  stripe: 'Cartão / Apple Pay / Google Pay', dinheiro: 'Dinheiro', transferencia: 'Transferência',
  reembolso: 'Reembolso', outro: 'Outro',
};

// DD/MM/AAAA (e hora, em Londres)
function data(iso?: string | null, comHora = false) {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).formatToParts(d);
  const g = (t: string) => f.find(x => x.type === t)?.value ?? '';
  return comHora ? `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}` : `${g('day')}/${g('month')}/${g('year')}`;
}
const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

function aba(linhas: unknown[][], larguras: number[], moeda: number[] = []) {
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols'] = larguras.map(w => ({ wch: w }));
  // Formato £ nas colunas de dinheiro (da linha 2 em diante).
  const ref = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let r = 1; r <= ref.e.r; r++) {
    for (const c of moeda) {
      const cel = ws[XLSX.utils.encode_cell({ r, c })];
      if (cel && cel.t === 'n') cel.z = '£#,##0.00';
    }
  }
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: larguras.length - 1 } }) };
  return ws;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('authorization') ?? '';
    if (!auth) return json({ error: 'Entre na sua conta.' }, 401);
    const { evento_id } = await req.json();
    if (!evento_id) return json({ error: 'Evento não informado.' }, 400);

    // Com o JWT de quem pediu: o banco confere se a pessoa faz parte da gestão.
    const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: r, error } = await comoUsuario.rpc('evento_relatorio', { p_evento: evento_id });
    if (error) throw error;
    if (!r) return json({ error: 'Sem permissão para ver o relatório deste evento.' }, 403);

    const ev = r.evento ?? {};
    const cfg = r.config ?? {};
    const comPag = cfg.com_pagamento !== false;
    const contatos = !!r.contatos;
    const perguntas: string[] = r.perguntas ?? [];
    const inscs: any[] = r.inscricoes ?? [];

    // ── Inscrições ──
    const cabInsc = ['Responsável', ...(contatos ? ['Telefone', 'E-mail'] : []), 'Status', 'Nº pessoas', 'Pessoas',
      ...(comPag ? ['Total', 'Desconto', 'Pago', 'Falta', 'Entrada paga?', 'Último pagamento'] : []),
      'Inscrito em', 'Cancelada em'];
    const moedaInsc = comPag ? [0, 1, 2, 3].map(i => cabInsc.indexOf(['Total', 'Desconto', 'Pago', 'Falta'][i])) : [];
    const linhasInsc = inscs.map(i => [
      i.responsavel, ...(contatos ? [i.telefone ?? '', i.email ?? ''] : []),
      STATUS[i.status] ?? i.status, (i.pessoas ?? []).length,
      (i.pessoas ?? []).map((p: any) => p.nome + (p.idade != null ? ` (${p.idade})` : '')).join(', '),
      ...(comPag ? [n(i.total), n(i.desconto), n(i.pago), n(i.saldo),
        n(i.pago) >= Math.min(n(cfg.entrada_minima), n(i.total) - n(i.desconto)) ? 'Sim' : 'Não',
        data(i.ultimo_pagamento, true)] : []),
      data(i.inscrito_em, true), data(i.cancelada_em, true),
    ]);

    // ── Pessoas ──
    const cabPess = ['Nome', 'Idade no evento', 'Nascimento', ...(comPag ? ['Categoria', 'Valor'] : []),
      'Responsável', 'Status', ...perguntas];
    const linhasPess = inscs.flatMap(i => (i.pessoas ?? []).map((p: any) => [
      p.nome, p.idade ?? '', data(p.nascimento), ...(comPag ? [p.categoria ?? '', n(p.valor)] : []),
      i.responsavel, STATUS[i.status] ?? i.status,
      ...perguntas.map(q => String(p.respostas?.[q] ?? '')),
    ]));

    // ── Pagamentos ──
    const linhasPag = inscs.flatMap(i => (i.pagamentos ?? []).map((g: any) => [
      data(g.pago_em, true), i.responsavel, n(g.valor), FORMA[g.forma] ?? g.forma,
      g.por ?? (g.forma === 'stripe' ? 'App (Stripe)' : ''), g.observacao ?? '', g.stripe ?? '',
    ])).sort((a, b) => String(a[0]).split(' ')[0].split('/').reverse().join('').localeCompare(String(b[0]).split(' ')[0].split('/').reverse().join('')));

    // ── Resumo ──
    const ativas = inscs.filter(i => i.status === 'confirmada');
    const contaPessoas = (st: string) => inscs.filter(i => i.status === st).reduce((a, i) => a + (i.pessoas ?? []).length, 0);
    const resumo: unknown[][] = [
      ['Evento', ev.nome ?? ''],
      ['Data', ev.data_fim ? `${data(ev.data)} a ${data(ev.data_fim)}` : data(ev.data)],
      ['Local', ev.local ?? ''],
      ['Vagas', cfg.vagas ?? 'Sem limite'],
      ['Pessoas confirmadas', contaPessoas('confirmada')],
      ['Aguardando entrada (pessoas)', contaPessoas('pendente')],
      ['Lista de espera (pessoas)', contaPessoas('espera')],
      ['Inscrições canceladas', inscs.filter(i => i.status === 'cancelada').length],
      ...(comPag ? [
        ['Entrada mínima', n(cfg.entrada_minima)],
        ['Quitar até', data(cfg.quitar_ate)],
        ['Total esperado (confirmadas)', n(ativas.reduce((a, i) => a + n(i.total) - n(i.desconto), 0))],
        ['Arrecadado (todas)', n(inscs.reduce((a, i) => a + n(i.pago), 0))],
        ['Falta receber (confirmadas)', n(ativas.reduce((a, i) => a + n(i.saldo), 0))],
      ] : [['Tipo', 'Só inscrição (sem pagamento)']]),
      ['Gerado em', data(new Date().toISOString(), true)],
    ];
    const wsResumo = XLSX.utils.aoa_to_sheet([['Relatório', ''], ...resumo]);
    wsResumo['!cols'] = [{ wch: 32 }, { wch: 40 }];
    for (let row = 1; row <= resumo.length; row++) {
      const cel = wsResumo[XLSX.utils.encode_cell({ r: row, c: 1 })];
      const rot = String(resumo[row - 1][0]);
      if (cel && cel.t === 'n' && /Entrada|esperado|Arrecadado|Falta/.test(rot)) cel.z = '£#,##0.00';
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
    XLSX.utils.book_append_sheet(wb, aba([cabInsc, ...linhasInsc], cabInsc.map(c => Math.max(12, c.length + 2)).map((w, i) => (i === 0 ? 26 : cabInsc[i] === 'Pessoas' ? 40 : w)), moedaInsc), 'Inscrições');
    XLSX.utils.book_append_sheet(wb, aba([cabPess, ...linhasPess], cabPess.map((c, i) => (i === 0 ? 26 : Math.max(12, Math.min(40, c.length + 2)))), comPag ? [4] : []), 'Pessoas');
    if (comPag) {
      const cabPag = ['Data', 'Responsável', 'Valor', 'Forma', 'Registrado por', 'Observação', 'ID Stripe'];
      XLSX.utils.book_append_sheet(wb, aba([cabPag, ...linhasPag], [18, 26, 12, 30, 20, 30, 30], [2]), 'Pagamentos');
    }
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const nomeArq = `${String(ev.nome ?? 'Evento').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Evento'} - inscritos ${data(new Date().toISOString()).replaceAll('/', '-')}.xlsx`;
    const caminho = `${evento_id}/${Date.now()}.xlsx`;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const up = await admin.storage.from('relatorios').upload(caminho, new Uint8Array(bytes), {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true,
    });
    if (up.error) throw up.error;
    const { data: link, error: e2 } = await admin.storage.from('relatorios').createSignedUrl(caminho, 900, { download: nomeArq });
    if (e2) throw e2;
    return json({ url: link.signedUrl, nome: nomeArq });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
