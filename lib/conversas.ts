// lib/conversas.ts
//
// Conversas privadas entre membros (pedido do Marcos, 11/11/2026). As regras
// moram no banco (migração 20261111220000_conversas_privadas.sql); aqui só
// as chamadas e a tradução dos erros.
//
// • Só membros; mensagens somem em 15 dias.
// • Adulto ↔ menor de 18: conversa "protegida" — guarda 4 meses, sem envio
//   entre 22h e 7h, supervisores de proteção podem ler (com motivo, fica
//   registrado), responsáveis vinculados veem com quem o filho conversa.
// • O admin não lê; só o que for denunciado.

import type { TFunction } from 'i18next';
import { supabase } from './supabase';
import type { TipoMensagem } from './chatGeral';

export type ConversaResumo = {
  conversa_id: string;
  outro_id: string;
  outro_nome: string;
  outro_foto: string | null;
  ultima_tipo: TipoMensagem | null;
  ultima_texto: string | null;
  ultima_minha: boolean | null;
  ultima_em: string;
  nao_lidas: number;
  protegida: boolean;
};

export type MembroParaConversa = { user_id: string; nome: string; foto: string | null };

export type SituacaoPrivadas = {
  membro: boolean;
  aceita: boolean;
  tem_nascimento: boolean;
  menor: boolean;
  supervisor: boolean;
  responsaveis: string[];
  tem_filhos_vinculados: boolean;
};

export type ResultadoAbrir =
  | { status: 'ok'; conversa_id: string; protegida: boolean }
  | { status: 'sem_acesso' | 'propria' | 'nao_membro' | 'sem_nascimento' | 'bloqueado' | 'nao_aceita' };

export async function minhasConversas(): Promise<ConversaResumo[]> {
  const { data, error } = await supabase.rpc('minhas_conversas');
  if (error) return [];
  return (data ?? []) as ConversaResumo[];
}

export async function conversasNaoLidas(): Promise<number> {
  const { data, error } = await supabase.rpc('conversas_nao_lidas');
  return error ? 0 : Number(data ?? 0);
}

export async function membrosParaConversa(busca: string): Promise<MembroParaConversa[]> {
  const { data, error } = await supabase.rpc('membros_para_conversa', { p_busca: busca || null });
  return error ? [] : ((data ?? []) as MembroParaConversa[]);
}

export async function abrirConversa(outroId: string): Promise<ResultadoAbrir> {
  const { data, error } = await supabase.rpc('abrir_conversa', { p_outro: outroId });
  if (error || !data) return { status: 'sem_acesso' };
  return data as ResultadoAbrir;
}

export async function minhaSituacao(): Promise<SituacaoPrivadas | null> {
  const { data, error } = await supabase.rpc('minha_situacao_privadas');
  return error ? null : (data as SituacaoPrivadas | null);
}

/** 'ok' | 'data_invalida' | 'sem_ficha' | 'ja_tinha' | 'sem_acesso' */
export async function definirMinhaDataNascimento(iso: string): Promise<string> {
  const { data, error } = await supabase.rpc('definir_minha_data_nascimento', { p_data: iso });
  return error ? 'erro' : String(data);
}

export async function definirAceitaPrivadas(aceita: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('definir_aceita_privadas', { p_aceita: aceita });
  return !error;
}

// ── Responsável ↔ filho ─────────────────────────────────────────────────────
export async function gerarCodigoVinculo(): Promise<string | null> {
  const { data, error } = await supabase.rpc('gerar_codigo_vinculo');
  return error ? null : String(data);
}

export async function usarCodigoVinculo(codigo: string): Promise<{ status: string; nome?: string }> {
  const { data, error } = await supabase.rpc('usar_codigo_vinculo', { p_codigo: codigo });
  if (error || !data) return { status: 'erro' };
  return data as { status: string; nome?: string };
}

export type ConversaDoFilho = { filho_id: string; filho_nome: string; com_nome: string | null; ultima_em: string | null };

export async function conversasDosMeusFilhos(): Promise<ConversaDoFilho[]> {
  const { data, error } = await supabase.rpc('conversas_dos_meus_filhos');
  return error ? [] : ((data ?? []) as ConversaDoFilho[]);
}

// ── Supervisão de proteção ──────────────────────────────────────────────────
export type ConversaSupervisao = { conversa_id: string; nome_a: string; nome_b: string; ultima_em: string; mensagens: number };
export type MensagemSupervisao = {
  id: string; autor_id: string; autor_nome: string; tipo: TipoMensagem; texto: string;
  midia_path: string | null; midia_nome: string | null; duracao_ms: number | null; created_at: string;
};

export async function supervisaoConversas(): Promise<ConversaSupervisao[]> {
  const { data, error } = await supabase.rpc('supervisao_conversas');
  return error ? [] : ((data ?? []) as ConversaSupervisao[]);
}

export async function supervisaoLer(conversa: string, motivo: string): Promise<{ ok: true; msgs: MensagemSupervisao[] } | { ok: false; erro: string }> {
  const { data, error } = await supabase.rpc('supervisao_ler', { p_conversa: conversa, p_motivo: motivo });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, msgs: (data ?? []) as MensagemSupervisao[] };
}

/** Erros do banco começam com "peniel_" (gatilho de envio). Devolve a frase
 *  traduzida, ou null se não for um deles. */
export function erroDaConversa(t: TFunction, mensagem?: string | null): string | null {
  const m = /peniel_[a-z_]+/.exec(mensagem ?? '')?.[0];
  switch (m) {
    case 'peniel_fora_do_horario': return t('conversas.erroHorario');
    case 'peniel_bloqueado': return t('conversas.erroBloqueado');
    case 'peniel_nao_aceita': return t('conversas.erroNaoAceita');
    case 'peniel_suspenso': return t('conversas.erroSuspenso');
    case 'peniel_sem_acesso': return t('conversas.erroSemAcesso');
    case 'peniel_motivo': return t('conversas.erroMotivo');
    case 'peniel_so_menor': return t('conversas.erroSoMenor');
    default: return null;
  }
}
