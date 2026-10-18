// lib/chatFonte.ts
//
// UMA tela de chat para os três (18/10/2026): Chat da Igreja, chats dos
// grupos e chat da Banda. Pedido do Marcos: "quero que os chats tenham
// exatamente o mesmo padrão e funcionalidades".
//
// A tela (components/ChatGeralModal.tsx) trabalha sempre com o formato do Chat
// da Igreja (`MensagemGeral`). Esta "fonte" diz de onde vêm e para onde vão as
// mensagens de cada chat e traduz as linhas dos grupos/Banda — que guardam o
// áudio em `audio_path` e o anexo em `midia_tipo/midia_*`, com um rótulo em
// `texto` para versões antigas do app — para esse formato, e de volta.

import type { TFunction } from 'i18next';
import { supabase } from './supabase';
import { BUCKET_CHAT_GERAL, marcarComoLido, type MensagemGeral, type TipoMensagem } from './chatGeral';
import { BUCKET_AUDIO, TEXTO_DO_AUDIO } from './chatAudio';
import { legendaDoAnexo, TEXTO_FOTO, TEXTO_VIDEO } from './chatAnexos';

export type FonteChat = {
  /** 'geral' | 'grupo' | 'banda' — também o `chat` das denúncias. */
  tipo: 'geral' | 'grupo' | 'banda';
  /** Grupo ('homens', 'infantil'...), só no tipo 'grupo'. */
  grupo?: string;
  /** Destino no "Compartilhar com o chat aberto" (lib/chatAberto.ts). */
  destino: string;
  tabela: 'chat_geral_mensagens' | 'grupo_chat_mensagens' | 'banda_chat_mensagens';
  tabelaReacoes: 'chat_geral_reacoes' | 'grupo_chat_reacoes' | 'banda_chat_reacoes';
  bucket: string;
  /** Pasta antes do autor no bucket `chat-audio` (grupo ou 'banda'). */
  prefixo?: string;
  titulo: string;
  subtitulo: string;
  cor: string;
};

export const COR_IGREJA = '#6A55E0';

export function fonteIgreja(t: TFunction): FonteChat {
  return {
    tipo: 'geral', destino: 'igreja', tabela: 'chat_geral_mensagens', tabelaReacoes: 'chat_geral_reacoes',
    bucket: BUCKET_CHAT_GERAL, titulo: t('chatGeral.titulo'), subtitulo: t('chatGeral.subtitulo'), cor: COR_IGREJA,
  };
}

export function fonteGrupo(t: TFunction, grupo: string, nome: string, cor: string): FonteChat {
  return {
    tipo: 'grupo', grupo, destino: grupo, tabela: 'grupo_chat_mensagens', tabelaReacoes: 'grupo_chat_reacoes',
    bucket: BUCKET_AUDIO, prefixo: grupo,
    titulo: `Chat — ${nome}`, subtitulo: t('chatGeral.subtituloGrupo'), cor,
  };
}

export function fonteBanda(t: TFunction, cor: string): FonteChat {
  return {
    tipo: 'banda', destino: 'banda', tabela: 'banda_chat_mensagens', tabelaReacoes: 'banda_chat_reacoes',
    bucket: BUCKET_AUDIO, prefixo: 'banda',
    titulo: t('chatGeral.tituloBanda'), subtitulo: t('chatGeral.subtituloBanda'), cor,
  };
}

/** Chave da leitura ("visto por") e do canal de tempo real. */
export function chaveDaFonte(f: FonteChat): string {
  return f.tipo === 'grupo' ? `grupo:${f.grupo}` : f.tipo;
}

/** Linha do banco → formato da tela. */
export function deLinha(f: FonteChat, r: any): MensagemGeral {
  if (f.tipo === 'geral') return r as MensagemGeral;
  const tipo: TipoMensagem = r.audio_path ? 'audio' : (r.midia_tipo ?? 'texto');
  return {
    id: r.id,
    autor_id: r.autor_id,
    autor_nome: r.autor_nome,
    tipo,
    texto: tipo === 'audio' ? '' : tipo === 'texto' ? (r.texto ?? '') : (legendaDoAnexo(r) ?? ''),
    midia_path: r.audio_path ?? r.midia_path ?? null,
    midia_largura: r.midia_largura ?? null,
    midia_altura: r.midia_altura ?? null,
    duracao_ms: r.audio_duracao_ms ?? r.midia_duracao_ms ?? null,
    midia_nome: r.midia_nome ?? null,
    midia_tamanho: r.midia_tamanho ?? null,
    midia_mime: r.midia_mime ?? null,
    resposta_a: r.resposta_a ?? null,
    created_at: r.created_at,
  };
}

/** Formato da tela → linha para gravar no banco. */
export function paraLinha(f: FonteChat, m: Partial<MensagemGeral>, autorId: string, autorNome: string): Record<string, unknown> {
  if (f.tipo === 'geral') return { ...m };
  const base: Record<string, unknown> = {
    autor_id: autorId,
    autor_nome: autorNome || 'Membro',
    resposta_a: m.resposta_a ?? null,
  };
  if (f.tipo === 'grupo') base.grupo = f.grupo;
  const legenda = (m.texto ?? '').trim();
  switch (m.tipo) {
    case 'audio':
      return { ...base, texto: TEXTO_DO_AUDIO, audio_path: m.midia_path, audio_duracao_ms: m.duracao_ms };
    case 'imagem':
    case 'video':
    case 'arquivo': {
      // `texto` é obrigatório nessas tabelas: vai a legenda ou o rótulo que
      // as versões antigas do app mostram ("📷 Foto", "🎬 Vídeo", "📎 nome").
      const rotulo = m.tipo === 'imagem' ? TEXTO_FOTO
        : m.tipo === 'video' ? TEXTO_VIDEO
          : `${(m.midia_mime ?? '').startsWith('audio/') ? '🎵' : '📎'} ${m.midia_nome ?? 'Arquivo'}`;
      return {
        ...base,
        texto: (legenda || rotulo).slice(0, 2000),
        midia_tipo: m.tipo,
        midia_path: m.midia_path,
        midia_largura: m.midia_largura ?? null,
        midia_altura: m.midia_altura ?? null,
        midia_duracao_ms: m.duracao_ms ?? null,
        midia_nome: m.midia_nome ?? null,
        midia_tamanho: m.midia_tamanho ?? null,
        midia_mime: m.midia_mime ?? null,
      };
    }
    default:
      return { ...base, texto: (m.texto ?? '').slice(0, 2000) };
  }
}

export async function marcarLido(f: FonteChat): Promise<void> {
  if (f.tipo === 'geral') return marcarComoLido();
  await supabase.rpc('chat_marcar_lido', { p_chat: chaveDaFonte(f) }).then(() => {}, () => {});
}

export type LinhaInfo = { tipo: 'reacao' | 'visto'; user_id: string; nome: string; emoji: string | null };

export async function infoDaMensagem(f: FonteChat, mensagemId: string): Promise<LinhaInfo[]> {
  const { data, error } = f.tipo === 'geral'
    ? await supabase.rpc('chat_geral_info_mensagem', { p_mensagem: mensagemId })
    : await supabase.rpc('chat_info_mensagem', { p_chat: f.tipo, p_mensagem: mensagemId });
  return error ? [] : ((data ?? []) as LinhaInfo[]);
}
