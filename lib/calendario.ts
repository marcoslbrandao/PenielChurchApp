// lib/calendario.ts
//
// Calendário anual da igreja (pedido do Marcos, 11/11/2026). As regras moram
// no banco (migração 20261112120000_calendario_anual.sql): todo mundo lê; o
// admin edita tudo e o líder de grupo só a categoria do seu grupo.
//
// "Adicionar ao meu calendário" (sem build novo, sem permissão do aparelho):
//   • iPhone — `webcal://…/functions/v1/calendario` → "Assinar calendário?".
//     A assinatura se atualiza sozinha: data nova cai no celular da pessoa.
//     Uma data só → link https com ?id= → "Adicionar evento?".
//   • Android — Google Agenda: assinatura por `calendar.google.com/…?cid=` e
//     uma data só pelo modelo de evento (action=TEMPLATE).

import { Platform, Linking } from 'react-native';
import { supabase } from './supabase';

export type CategoriaCal = {
  id: string; nome: string; emoji: string; cor: string; grupo: string | null; ordem: number; ativa: boolean;
};

export type DataCal = {
  id: string; categoria_id: string; titulo: string; descricao: string | null;
  data_inicio: string; data_fim: string | null; hora_inicio: string | null; hora_fim: string | null;
  local: string | null; evento_id: string | null;
};

export const PALETA_CAL = [
  '#8E1B3A', '#E84B1A', '#1F9D55', '#7B3FE4', '#E64C93', '#2B6CB0',
  '#F2B705', '#3AA0E0', '#D4A017', '#8C8799', '#0E9F9A', '#534AB7',
];

const BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/calendario`;

export async function carregarCalendario(): Promise<{ categorias: CategoriaCal[]; datas: DataCal[] }> {
  const desde = `${new Date().getFullYear() - 1}-01-01`;
  const [c, d] = await Promise.all([
    supabase.from('calendario_categorias').select('*').order('ordem'),
    supabase.from('calendario_datas')
      .select('id, categoria_id, titulo, descricao, data_inicio, data_fim, hora_inicio, hora_fim, local, evento_id')
      .gte('data_inicio', desde).order('data_inicio').order('hora_inicio', { nullsFirst: true }),
  ]);
  return { categorias: (c.data ?? []) as CategoriaCal[], datas: (d.data ?? []) as DataCal[] };
}

export async function minhasCategoriasEditaveis(): Promise<string[]> {
  const { data, error } = await supabase.rpc('calendario_minhas_categorias');
  return error ? [] : ((data ?? []) as string[]);
}

export async function salvarData(d: Partial<DataCal> & { categoria_id: string; titulo: string; data_inicio: string }) {
  const linha = {
    categoria_id: d.categoria_id, titulo: d.titulo.trim(), descricao: d.descricao?.trim() || null,
    data_inicio: d.data_inicio, data_fim: d.data_fim || null,
    hora_inicio: d.hora_inicio || null, hora_fim: d.hora_inicio ? (d.hora_fim || null) : null,
    local: d.local?.trim() || null,
  };
  const { error } = d.id
    ? await supabase.from('calendario_datas').update(linha).eq('id', d.id)
    : await supabase.from('calendario_datas').insert(linha);
  return error ? (error.message || 'erro') : 'ok';
}

export async function apagarData(id: string) {
  const { error } = await supabase.from('calendario_datas').delete().eq('id', id);
  return error ? (error.message || 'erro') : 'ok';
}

/** Data "AAAA-MM-DD" → Date ao meio-dia local (sem tropeçar no fuso). */
export function diaLocal(iso: string) {
  return new Date(`${iso}T12:00:00`);
}
export function isoDoDia(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** A data cobre o dia `iso`? (eventos de vários dias aparecem em todos). */
export function cobreDia(d: DataCal, iso: string) {
  return d.data_inicio <= iso && (d.data_fim ?? d.data_inicio) >= iso;
}
export const horaCurta = (h: string | null) => (h ? h.slice(0, 5) : '');

/** Assinar o calendário (todas as categorias ou só as escolhidas). */
export async function assinarCalendario(categorias: string[] | null) {
  const q = categorias && categorias.length ? `?cats=${categorias.join(',')}` : '';
  const https = `${BASE}${q}`;
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  if (Platform.OS === 'ios') return Linking.openURL(webcal);
  return Linking.openURL(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`);
}

function googleData(iso: string, hora: string | null) {
  return iso.replaceAll('-', '') + (hora ? `T${hora.slice(0, 5).replace(':', '')}00` : '');
}
function maisUmDia(iso: string) {
  const d = diaLocal(iso); d.setDate(d.getDate() + 1); return isoDoDia(d);
}
function maisDuasHoras(h: string) {
  const [hh, mm] = h.split(':').map(Number);
  const t = Math.min(hh * 60 + mm + 120, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Uma data só no calendário do celular ("Adicionar evento?"). */
export async function adicionarUmaData(d: DataCal, cat?: CategoriaCal) {
  if (Platform.OS === 'ios') return Linking.openURL(`${BASE}?id=${d.id}`);
  const fim = d.data_fim ?? d.data_inicio;
  const datas = d.hora_inicio
    ? `${googleData(d.data_inicio, d.hora_inicio)}/${googleData(fim, d.hora_fim ?? (d.data_fim ? d.hora_inicio : maisDuasHoras(d.hora_inicio)))}`
    : `${googleData(d.data_inicio, null)}/${googleData(maisUmDia(fim), null)}`;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${cat?.emoji ? cat.emoji + ' ' : ''}${d.titulo}`,
    dates: datas,
    ctz: 'Europe/London',
    details: [d.descricao, 'Peniel Church'].filter(Boolean).join('\n\n'),
  });
  if (d.local) p.set('location', d.local);
  return Linking.openURL(`https://calendar.google.com/calendar/render?${p.toString()}`);
}

/** Máscara "HH:MM". */
export function mascaraHora(txt: string) {
  const n = txt.replace(/\D/g, '').slice(0, 4);
  return n.length <= 2 ? n : `${n.slice(0, 2)}:${n.slice(2)}`;
}
export function horaValida(h: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(h);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}
