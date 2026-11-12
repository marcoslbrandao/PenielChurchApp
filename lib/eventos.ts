// lib/eventos.ts
//
// Eventos com inscrição e pagamento parcelado (Retiro Peniel 2027 e outros) —
// pedido do Marcos, 09–11/11/2026. As regras moram no banco (migração
// 20261112090000_eventos_inscricoes.sql); aqui só as chamadas.
//
// Pagamento LIVRE: a pessoa paga o valor que quiser, quando quiser. Quem
// grava o pagamento é o stripe-webhook (quando o dinheiro entra), nunca o app.

import { Platform, Linking } from 'react-native';
import { supabase } from './supabase';

export type EstadoInscricao = 'aberta' | 'em_breve' | 'encerrada' | 'lotada' | 'fechada';

export type ConfigEvento = {
  evento_id: string;
  ativa: boolean;
  inicio: string | null;
  fim: string | null;
  abre_em: string | null;
  fecha_em: string | null;
  vagas: number | null;
  entrada_minima: number;
  quitar_ate: string | null;
  publico: 'membros' | 'todos';
  regras: string | null;
  reembolso: string | null;
  programacao: string | null;
  o_que_levar: string | null;
  contato: string | null;
  /** false = só inscrição (confirma a vaga), sem preço nem pagamento (12/11/2026). */
  com_pagamento?: boolean;
};

export type Preco = { id?: string; categoria: string; idade_min: number; idade_max: number | null; valor: number };
export type Pergunta = { id?: string; texto: string; tipo: 'texto' | 'sim_nao' | 'opcoes'; opcoes: string[] | null; obrigatoria: boolean };
export type MembroEquipe = { user_id: string; nome: string; foto: string | null; funcao: string | null; eh_lider: boolean };

export type DetalhesEvento = {
  tem_inscricao: boolean;
  gere: boolean;
  estado?: EstadoInscricao;
  pode_publico?: boolean;
  config?: ConfigEvento;
  ocupadas?: number;
  precos?: Preco[];
  perguntas?: Pergunta[];
  equipe?: MembroEquipe[];
};

export type PessoaFamilia = {
  member_id: string; nome: string; data_nascimento: string | null; idade: number | null;
  categoria: string | null; valor: number | null; sou_eu: boolean;
};

export type MinhaInscricao = {
  id: string;
  /** pendente = inscrito, mas ainda sem a entrada mínima (não ocupa vaga). */
  status: 'pendente' | 'confirmada' | 'espera' | 'cancelada';
  total: number; desconto: number; pago: number; saldo: number; sugestao: number;
  created_at: string;
  pessoas: { nome: string; idade: number | null; categoria: string | null; valor: number; member_id: string | null; data_nascimento: string | null; respostas: Record<string, string> }[];
  pagamentos: { valor: number; forma: string; pago_em: string }[];
};

export type LinhaPainel = {
  inscricao_id: string; responsavel_id: string; responsavel_nome: string; status: MinhaInscricao['status'];
  pessoas: number; nomes: string | null; total: number; desconto: number; pago: number; saldo: number;
  ultimo_pagamento: string | null; created_at: string;
};

export type PessoaParaInscrever = { member_id?: string; nome?: string; data_nascimento?: string | null; respostas?: Record<string, string> };

export async function detalhesEvento(eventoId: string): Promise<DetalhesEvento | null> {
  const { data, error } = await supabase.rpc('evento_detalhes', { p_evento: eventoId });
  return error ? null : (data as DetalhesEvento | null);
}

export async function minhaFamilia(eventoId: string): Promise<PessoaFamilia[]> {
  const { data, error } = await supabase.rpc('evento_minha_familia', { p_evento: eventoId });
  return error ? [] : ((data ?? []) as PessoaFamilia[]);
}

export async function minhaInscricao(eventoId: string): Promise<MinhaInscricao | null> {
  const { data, error } = await supabase.rpc('minha_inscricao', { p_evento: eventoId });
  return error ? null : (data as MinhaInscricao | null);
}

export async function inscrever(eventoId: string, pessoas: PessoaParaInscrever[], aceite: boolean) {
  const { data, error } = await supabase.rpc('inscrever_evento', { p_evento: eventoId, p_pessoas: pessoas, p_aceite: aceite });
  type R = { status: string; inscricao_id?: string; estado?: string; total?: number };
  if (error) return { status: 'erro' } as R;
  return data as R;
}

export async function cancelarMinhaInscricao(eventoId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancelar_minha_inscricao', { p_evento: eventoId });
  return !error && data === 'ok';
}

/** Planilha (.xlsx) do evento para a gestão: abre o link no navegador do celular. */
export async function relatorioEvento(eventoId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('evento-relatorio', { body: { evento_id: eventoId } });
  if (error || !data?.url) {
    let msg = data?.error;
    try { msg = msg ?? (await (error as any)?.context?.json?.())?.error; } catch { /* sem corpo */ }
    return `erro:${msg || 'Não foi possível gerar o relatório.'}`;
  }
  await Linking.openURL(data.url);
  return 'ok';
}

export async function painelEvento(eventoId: string): Promise<LinhaPainel[]> {
  const { data, error } = await supabase.rpc('evento_painel', { p_evento: eventoId });
  return error ? [] : ((data ?? []) as LinhaPainel[]);
}

export async function detalheInscricao(inscricaoId: string): Promise<any | null> {
  const { data, error } = await supabase.rpc('evento_inscricao_detalhe', { p_inscricao: inscricaoId });
  return error ? null : data;
}

export async function registrarPagamento(inscricaoId: string, valor: number, forma: string, obs?: string) {
  const { data, error } = await supabase.rpc('evento_registrar_pagamento', {
    p_inscricao: inscricaoId, p_valor: valor, p_forma: forma, p_obs: obs ?? null,
  });
  return error ? 'erro' : String(data);
}

export async function definirDesconto(inscricaoId: string, valor: number, motivo?: string) {
  const { data, error } = await supabase.rpc('evento_definir_desconto', { p_inscricao: inscricaoId, p_desconto: valor, p_motivo: motivo ?? null });
  return error ? 'erro' : String(data);
}

export async function definirStatus(inscricaoId: string, status: string) {
  const { data, error } = await supabase.rpc('evento_definir_status', { p_inscricao: inscricaoId, p_status: status });
  return error ? 'erro' : String(data);
}

export async function salvarConfig(eventoId: string, p: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('evento_salvar_config', { p_evento: eventoId, p });
  return error ? (error.message || 'erro') : String(data);
}

export type ModoInscricao = 'nenhuma' | 'gratis' | 'paga';

/** Formulário do evento no Admin: Sem inscrição / Só inscrição / Inscrição e pagamento. */
export async function definirInscricao(eventoId: string, modo: ModoInscricao) {
  const { data, error } = await supabase.rpc('evento_definir_inscricao', { p_evento: eventoId, p_modo: modo });
  return error ? (error.message || 'erro') : String(data);
}

/** Interruptor "Com pagamento" do Configurar. */
export async function definirPagamento(eventoId: string, com: boolean) {
  const { data, error } = await supabase.rpc('evento_definir_pagamento', { p_evento: eventoId, p_com: com });
  return error ? (error.message || 'erro') : String(data);
}

export async function definirEquipe(eventoId: string, userId: string, funcao: string, lider: boolean) {
  const { data, error } = await supabase.rpc('evento_equipe_definir', { p_evento: eventoId, p_user: userId, p_funcao: funcao, p_lider: lider });
  return error ? 'erro' : String(data);
}

export async function removerDaEquipe(eventoId: string, userId: string) {
  const { data, error } = await supabase.rpc('evento_equipe_remover', { p_evento: eventoId, p_user: userId });
  return error ? 'erro' : String(data);
}

/** Valores de exemplo do Retiro Peniel 2027 (Marcos, 11/11/2026). Ele ajusta no painel. */
export const PRECOS_PADRAO: Preco[] = [
  { categoria: 'Criança até 5 anos', idade_min: 0, idade_max: 5, valor: 0 },
  { categoria: 'Criança de 6 a 12 anos', idade_min: 6, idade_max: 12, valor: 150 },
  { categoria: 'Adulto (13 anos ou mais)', idade_min: 13, idade_max: null, valor: 180 },
];
export const PERGUNTAS_PADRAO: Pergunta[] = [
  { texto: 'Alguma alergia ou restrição alimentar?', tipo: 'texto', opcoes: null, obrigatoria: false },
  { texto: 'Precisa de carona?', tipo: 'sim_nao', opcoes: null, obrigatoria: false },
];

export function libras(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return `£${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}

/** DD/MM/AAAA de uma data ISO (padrão do app). */
export function dataBR(iso: string | null | undefined) {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** DD/MM/AAAA → AAAA-MM-DD (ou null). */
export function isoDeBR(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function mascaraData(txt: string) {
  const n = txt.replace(/\D/g, '').slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
}

/**
 * Pagar uma parcela. iPhone: PaymentSheet do Stripe (Apple Pay/cartão).
 * Android: página do Checkout do Stripe (Google Pay/cartão), como a Oferta.
 * Devolve 'ok' | 'cancelado' | 'aberto_fora' | mensagem de erro.
 */
export async function pagarParcela(
  inscricaoId: string,
  valor: number,
  folha: { initPaymentSheet: (o: any) => Promise<{ error?: any }>; presentPaymentSheet: () => Promise<{ error?: any }> },
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('evento-pagamento', {
    body: { inscricao_id: inscricaoId, valor, plataforma: Platform.OS },
  });
  if (error || data?.error) {
    let msg = data?.error;
    try { msg = msg ?? (await (error as any)?.context?.json?.())?.error; } catch { /* sem corpo */ }
    return msg || 'Não foi possível iniciar o pagamento.';
  }
  if (data?.url) {
    await Linking.openURL(data.url);
    return 'aberto_fora';
  }
  if (!data?.clientSecret) return 'Não foi possível iniciar o pagamento.';
  const init = await folha.initPaymentSheet({
    merchantDisplayName: 'Peniel Church',
    paymentIntentClientSecret: data.clientSecret,
    applePay: { merchantCountryCode: 'GB' },
    googlePay: { merchantCountryCode: 'GB', currencyCode: 'GBP', testEnv: false },
  });
  if (init.error) return init.error.message ?? 'Erro no pagamento.';
  const r = await folha.presentPaymentSheet();
  if (r.error) return r.error.code === 'Canceled' ? 'cancelado' : (r.error.message ?? 'Erro no pagamento.');
  return 'ok';
}
