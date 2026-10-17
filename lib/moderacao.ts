// lib/moderacao.ts
//
// Moderação dos três chats (Chat da Igreja, grupos e Banda) — 17/10/2026.
//
// POR QUE ISTO EXISTE
// A Apple revisou a diretriz 1.2 (conteúdo gerado por usuários) em 16/10/2026.
// App com chat precisa ter: (1) filtro de conteúdo ofensivo, (2) denunciar
// com resposta rápida, (3) bloquear quem abusa e (4) contato publicado.
// Quem não tem essas proteções pode ser enquadrado no Código de Conduta do
// desenvolvedor — o que afeta a conta, não só o app. O Marcos decidiu voltar
// com o "Denunciar" (17/10).
//
// O que mora no banco (migração 20261017170000_moderacao_dos_chats.sql):
//   • denunciar_mensagem()  → fila `chat_denuncias` + push para os admins;
//   • usuarios_bloqueados   → o banco já esconde as mensagens de quem eu
//                              bloqueei (inclusive no tempo real);
//   • chat_geral_silenciados → "suspenso" vale para TODOS os chats;
//   • aceite_regras_chat    → aceite das Regras da comunidade.
//
// Esta tela só reflete isso. O filtro de palavras é o único item que vive
// aqui no aparelho.

import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { TFunction } from 'i18next';
import { supabase } from './supabase';

export type ChatTipo = 'geral' | 'grupo' | 'banda';

/** Versão das Regras da comunidade. Subir quando o texto mudar de verdade:
 *  todo mundo precisa aceitar de novo. */
export const VERSAO_REGRAS = 1;

export const EMAIL_MODERACAO = 'info@penielchurch.org.uk';

// ─── Filtro de palavras ──────────────────────────────────────────────────────
// Lista curta e de propósito conservadora: palavrões e ofensas comuns em
// português, inglês e espanhol (a igreja tem as três línguas). `*` no fim =
// qualquer palavra que COMECE assim ("fod*" pega foda, foder, fodido).
// Sem `*` = só a palavra inteira (evita barrar "computador" por causa de
// "puta", ou "Scunthorpe").
const PROIBIDAS = [
  // pt
  'porra', 'caralh*', 'buceta*', 'puta', 'putas', 'puto', 'putaria', 'merda*', 'fod*', 'fudid*',
  'viado*', 'arrombad*', 'cuzao', 'cuzona', 'desgracad*', 'vagabund*', 'vadia*', 'piranha',
  'otari*', 'babaca*', 'cacete', 'punheta*', 'xoxota*', 'xereca*', 'boquete*', 'safad*', 'corno', 'cornos', 'cu',
  'filhodaputa', 'fdp', 'vsf', 'pqp', 'krl', 'tnc',
  // en
  'fuck*', 'shit', 'shits', 'shitty', 'bullshit', 'bitch*', 'cunt*', 'dickhead', 'pussy', 'asshole*', 'bastard*',
  'slut*', 'whore*', 'nigg*', 'fag', 'faggot*', 'retard*', 'motherfucker*', 'wtf',
  // es
  'mierda*', 'cabron*', 'pendej*', 'joder', 'jodete', 'cono', 'gilipolla*', 'maricon*', 'zorra*',
];

const EXATAS = new Set(PROIBIDAS.filter(p => !p.endsWith('*')));
const PREFIXOS = PROIBIDAS.filter(p => p.endsWith('*')).map(p => p.slice(0, -1));

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acentos
    .replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/[1!]/g, 'i').replace(/0/g, 'o').replace(/\$/g, 's')
    .replace(/(.)\1{2,}/g, '$1$1');                      // "poooorra" → "poorra"
}

/** true quando o texto tem alguma palavra da lista. Links não contam: um
 *  endereço do YouTube com letras aleatórias não pode barrar a mensagem. */
export function temPalavraProibida(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const semLinks = texto.replace(/https?:\/\/\S+|www\.\S+/gi, ' ');
  const palavras = normalizar(semLinks).split(/[^a-z]+/).filter(Boolean);
  for (const p of palavras) {
    const compacta = p.replace(/(.)\1+/g, '$1');
    if (EXATAS.has(p) || EXATAS.has(compacta)) return true;
    if (PREFIXOS.some(pre => p.startsWith(pre) || compacta.startsWith(pre))) return true;
  }
  return false;
}

/** Mostra o aviso e devolve true quando a mensagem NÃO pode ir. */
export function barrarSeOfensivo(texto: string | null | undefined, t: TFunction): boolean {
  if (!temPalavraProibida(texto)) return false;
  Alert.alert(t('moderacao.filtroTitulo'), t('moderacao.filtroTexto'));
  return true;
}

// ─── Denunciar ───────────────────────────────────────────────────────────────
export function denunciarMensagem(chat: ChatTipo, mensagemId: string, t: TFunction) {
  const enviar = async (motivo: string) => {
    const { data, error } = await supabase.rpc('denunciar_mensagem', {
      p_chat: chat, p_mensagem_id: mensagemId, p_motivo: motivo,
    });
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    if (data === 'ja') { Alert.alert(t('moderacao.jaDenunciada')); return; }
    if (data === 'propria') return;
    if (data !== 'ok') { Alert.alert(t('common.erro'), t('moderacao.denunciaFalhou')); return; }
    Alert.alert(t('moderacao.denunciadaTitulo'), t('moderacao.denunciadaTexto'));
  };
  // Motivo em um toque (Alert do Android aceita no máximo 3 botões).
  Alert.alert(t('moderacao.denunciarTitulo'), t('moderacao.denunciarTexto'), [
    { text: t('moderacao.motivoOfensivo'), onPress: () => enviar('ofensivo') },
    { text: t('moderacao.motivoOutro'), onPress: () => enviar('outro') },
    { text: t('common.cancelar'), style: 'cancel' },
  ]);
}

// ─── Suspender (só admin) ────────────────────────────────────────────────────
export function alternarSuspensao(
  userId: string, nome: string, suspensoAgora: boolean, t: TFunction, depois: () => void,
) {
  if (suspensoAgora) {
    supabase.from('chat_geral_silenciados').delete().eq('user_id', userId).then(({ error }) => {
      if (error) { Alert.alert(t('common.erro'), error.message); return; }
      depois();
    });
    return;
  }
  Alert.alert(t('moderacao.suspenderTitulo'), t('moderacao.suspenderTexto', { nome }), [
    { text: t('common.cancelar'), style: 'cancel' },
    {
      text: t('moderacao.suspender'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('chat_geral_silenciados').insert({ user_id: userId });
        if (error && error.code !== '23505') { Alert.alert(t('common.erro'), error.message); return; }
        depois();
      },
    },
  ]);
}

// ─── Hook usado pelos três chats ─────────────────────────────────────────────
// Bloqueados, "estou suspenso?", "já aceitei as regras?" e quem está suspenso
// (só o admin enxerga essa lista — a RLS devolve só a própria linha para os
// outros, que é o que basta para `suspenso`).
export function useModeracaoChat(userId: string | null | undefined, ativo: boolean) {
  const [bloqueados, setBloqueados] = useState<Set<string>>(new Set());
  const [suspensos, setSuspensos] = useState<Set<string>>(new Set());
  // null = ainda carregando (não mostra as regras antes de saber).
  const [regrasAceitas, setRegrasAceitas] = useState<boolean | null>(null);

  const recarregar = useCallback(async () => {
    if (!userId) return;
    const [b, s, r] = await Promise.all([
      supabase.from('usuarios_bloqueados').select('bloqueado_id').eq('bloqueador_id', userId),
      supabase.from('chat_geral_silenciados').select('user_id'),
      supabase.from('aceite_regras_chat').select('versao').eq('user_id', userId).maybeSingle(),
    ]);
    setBloqueados(new Set(((b.data ?? []) as { bloqueado_id: string }[]).map(x => x.bloqueado_id)));
    setSuspensos(new Set(((s.data ?? []) as { user_id: string }[]).map(x => x.user_id)));
    // Se a tabela ainda não existe (migração não rodou), não trava o chat.
    if (r.error) { setRegrasAceitas(true); return; }
    setRegrasAceitas(((r.data as { versao: number } | null)?.versao ?? 0) >= VERSAO_REGRAS);
  }, [userId]);

  useEffect(() => { if (ativo) recarregar(); }, [ativo, recarregar]);

  const aceitarRegras = useCallback(async () => {
    if (!userId) return false;
    const { error } = await supabase.from('aceite_regras_chat')
      .upsert({ user_id: userId, versao: VERSAO_REGRAS, aceito_em: new Date().toISOString() });
    if (error) { Alert.alert('Erro', error.message); return false; }
    setRegrasAceitas(true);
    return true;
  }, [userId]);

  const bloquear = useCallback((autorId: string, nome: string, t: TFunction) => {
    Alert.alert(t('moderacao.bloquearTitulo', { nome }), t('moderacao.bloquearTexto', { nome }), [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('moderacao.bloquear'), style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('usuarios_bloqueados').insert({ bloqueado_id: autorId });
          if (error && error.code !== '23505') { Alert.alert(t('common.erro'), error.message); return; }
          setBloqueados(prev => new Set(prev).add(autorId));
          Alert.alert(t('moderacao.bloqueadoTitulo'), t('moderacao.bloqueadoTexto', { nome }));
        },
      },
    ]);
  }, []);

  const desbloquear = useCallback(async (autorId: string) => {
    const { error } = await supabase.from('usuarios_bloqueados').delete()
      .eq('bloqueador_id', userId ?? '').eq('bloqueado_id', autorId);
    if (error) { Alert.alert('Erro', error.message); return; }
    setBloqueados(prev => { const n = new Set(prev); n.delete(autorId); return n; });
  }, [userId]);

  return {
    bloqueados,
    suspensos,
    souSuspenso: !!userId && suspensos.has(userId),
    regrasAceitas,
    aceitarRegras,
    bloquear,
    desbloquear,
    recarregar,
  };
}
