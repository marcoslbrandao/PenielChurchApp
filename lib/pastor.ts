// lib/pastor.ts
//
// Área do Pastor (12/11/2026): compromissos (reuniões, aconselhamentos,
// visitas), anotações do que foi falado e lembretes. Regras no banco
// (20261112160000_area_do_pastor.sql): só quem está em `pastores` entra; cada
// item é de quem criou, a não ser que esteja "compartilhado com os pastores".
import { supabase } from './supabase';

export type TipoCompromisso = 'reuniao' | 'aconselhamento' | 'visita' | 'oracao' | 'outro';
export const TIPOS: { id: TipoCompromisso; emoji: string; cor: string }[] = [
  { id: 'reuniao', emoji: '🤝', cor: '#534AB7' },
  { id: 'aconselhamento', emoji: '💬', cor: '#1F8A70' },
  { id: 'visita', emoji: '🏠', cor: '#D9480F' },
  { id: 'oracao', emoji: '🙏', cor: '#3AA0E0' },
  { id: 'outro', emoji: '📌', cor: '#8C8799' },
];
export const tipoDe = (id: string) => TIPOS.find(t => t.id === id) ?? TIPOS[TIPOS.length - 1];

export type Compromisso = {
  id: string; dono: string; titulo: string; tipo: TipoCompromisso; pessoa: string | null; member_id: string | null;
  inicio: string; fim: string | null; local: string | null; status: 'agendado' | 'feito' | 'cancelado';
  lembrete_min: number | null; compartilhado: boolean;
};
export type Nota = {
  id: string; dono: string; compromisso_id: string | null; pessoa: string | null; member_id: string | null;
  titulo: string; texto: string; proximo_passo: string | null; compartilhado: boolean; created_at: string; updated_at: string;
};
export type Lembrete = { id: string; texto: string; quando: string; feito: boolean };
export type PessoaIgreja = { id: string; nome: string; telefone: string | null };

export async function souPastor(): Promise<boolean> {
  const { data, error } = await supabase.rpc('eh_pastor');
  return !error && data === true;
}

export async function carregarTudo() {
  const [c, n, l] = await Promise.all([
    supabase.from('pastor_compromissos').select('*').order('inicio', { ascending: true }),
    supabase.from('pastor_notas').select('*').order('updated_at', { ascending: false }).limit(300),
    supabase.from('pastor_lembretes').select('id, texto, quando, feito').order('quando', { ascending: true }),
  ]);
  return {
    compromissos: (c.data ?? []) as Compromisso[],
    notas: (n.data ?? []) as Nota[],
    lembretes: (l.data ?? []) as Lembrete[],
  };
}

const erro = (e: any) => (e ? (e.message || 'erro') : 'ok');

export async function salvarCompromisso(c: Partial<Compromisso>) {
  const linha = {
    titulo: c.titulo?.trim(), tipo: c.tipo ?? 'reuniao', pessoa: c.pessoa?.trim() || null, member_id: c.member_id ?? null,
    inicio: c.inicio, fim: c.fim ?? null, local: c.local?.trim() || null, status: c.status ?? 'agendado',
    lembrete_min: c.lembrete_min ?? null, compartilhado: !!c.compartilhado,
  };
  const { error } = c.id
    ? await supabase.from('pastor_compromissos').update(linha).eq('id', c.id)
    : await supabase.from('pastor_compromissos').insert(linha);
  return erro(error);
}
export async function apagarCompromisso(id: string) {
  return erro((await supabase.from('pastor_compromissos').delete().eq('id', id)).error);
}
export async function statusCompromisso(id: string, status: Compromisso['status']) {
  return erro((await supabase.from('pastor_compromissos').update({ status }).eq('id', id)).error);
}

export async function salvarNota(n: Partial<Nota>) {
  const linha = {
    titulo: n.titulo?.trim(), texto: n.texto ?? '', pessoa: n.pessoa?.trim() || null, member_id: n.member_id ?? null,
    compromisso_id: n.compromisso_id ?? null, proximo_passo: n.proximo_passo?.trim() || null, compartilhado: !!n.compartilhado,
  };
  const { error } = n.id
    ? await supabase.from('pastor_notas').update(linha).eq('id', n.id)
    : await supabase.from('pastor_notas').insert(linha);
  return erro(error);
}
export async function apagarNota(id: string) {
  return erro((await supabase.from('pastor_notas').delete().eq('id', id)).error);
}

export async function salvarLembrete(l: { id?: string; texto: string; quando: string }) {
  const { error } = l.id
    ? await supabase.from('pastor_lembretes').update({ texto: l.texto.trim(), quando: l.quando }).eq('id', l.id)
    : await supabase.from('pastor_lembretes').insert({ texto: l.texto.trim(), quando: l.quando });
  return erro(error);
}
export async function marcarLembrete(id: string, feito: boolean) {
  return erro((await supabase.from('pastor_lembretes').update({ feito }).eq('id', id)).error);
}
export async function apagarLembrete(id: string) {
  return erro((await supabase.from('pastor_lembretes').delete().eq('id', id)).error);
}

export async function buscarPessoas(busca: string): Promise<PessoaIgreja[]> {
  if (busca.trim().length < 2) return [];
  const { data } = await supabase.rpc('pastor_buscar_membros', { p_busca: busca.trim() });
  return (data ?? []) as PessoaIgreja[];
}

// ── Pastores (o admin escolhe) ──
export async function listaPastores(): Promise<{ user_id: string; nome: string }[]> {
  const { data } = await supabase.rpc('pastores_lista');
  return (data ?? []) as { user_id: string; nome: string }[];
}
export async function adicionarPastor(userId: string) {
  const { error } = await supabase.from('pastores').insert({ user_id: userId });
  return error && !String(error.message).includes('duplicate') ? error.message : 'ok';
}
export async function removerPastor(userId: string) {
  return erro((await supabase.from('pastores').delete().eq('user_id', userId)).error);
}

// ── Datas (Londres = horário do celular, que está no Reino Unido) ──
/** "DD/MM/AAAA" + "HH:MM" → ISO (com o fuso do celular). */
export function paraISO(dataBR: string, hora: string): string | null {
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataBR.trim());
  const h = /^(\d{2}):(\d{2})$/.exec(hora.trim());
  if (!d || !h) return null;
  const dt = new Date(Number(d[3]), Number(d[2]) - 1, Number(d[1]), Number(h[1]), Number(h[2]));
  if (dt.getMonth() !== Number(d[2]) - 1 || Number(h[1]) > 23 || Number(h[2]) > 59) return null;
  return dt.toISOString();
}
const p2 = (n: number) => String(n).padStart(2, '0');
export const dataDe = (iso: string) => { const d = new Date(iso); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const horaDe = (iso: string) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const chaveDia = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
