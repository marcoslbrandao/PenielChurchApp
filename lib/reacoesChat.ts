// lib/reacoesChat.ts
//
// Reações com emoji nos chats dos grupos e da Banda (18/10/2026) — as mesmas
// regras do Chat da Igreja: uma reação por pessoa por mensagem; outro emoji
// troca; o mesmo emoji de novo tira. Tabelas e RLS na migração
// 20261018100000_reacoes_grupos_e_banda.sql.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

export type Reacao = { mensagem_id: string; user_id: string; emoji: string };
export type ChipReacao = { emoji: string; n: number; minha: boolean };

type Onde = { tabela: 'grupo_chat_reacoes'; grupo: string } | { tabela: 'banda_chat_reacoes' };

export function useReacoesChat(onde: Onde, userId: string | null | undefined, ativo: boolean) {
  const [reacoes, setReacoes] = useState<Reacao[]>([]);
  const chave = onde.tabela === 'grupo_chat_reacoes' ? `grupo-${onde.grupo}` : 'banda';

  const carregar = useCallback(async () => {
    const q = onde.tabela === 'grupo_chat_reacoes'
      ? supabase.from('grupo_chat_reacoes')
        .select('mensagem_id, user_id, emoji, grupo_chat_mensagens!inner(grupo)')
        .eq('grupo_chat_mensagens.grupo', onde.grupo)
      : supabase.from('banda_chat_reacoes').select('mensagem_id, user_id, emoji');
    const { data, error } = await q.limit(5000);
    // Sem a migração ainda (tabela não existe): fica sem reações, sem quebrar.
    if (error) return;
    setReacoes(((data ?? []) as any[]).map(r => ({ mensagem_id: r.mensagem_id, user_id: r.user_id, emoji: r.emoji })));
  }, [chave]);

  useEffect(() => {
    if (!ativo) return;
    carregar();
    const canal = supabase
      .channel(`reacoes-${chave}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: onde.tabela }, (p) => {
        if (p.eventType === 'DELETE') {
          const v = p.old as Reacao;
          setReacoes(prev => prev.filter(r => !(r.mensagem_id === v.mensagem_id && r.user_id === v.user_id)));
        } else {
          const n = p.new as Reacao;
          // A RLS já filtra o que chega; mensagens de outro grupo simplesmente
          // não estão na tela, então uma reação delas não aparece em lugar nenhum.
          setReacoes(prev => [...prev.filter(r => !(r.mensagem_id === n.mensagem_id && r.user_id === n.user_id)),
            { mensagem_id: n.mensagem_id, user_id: n.user_id, emoji: n.emoji }]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [ativo, chave, carregar]);

  const porMensagem = useMemo(() => {
    const mapa = new Map<string, ChipReacao[]>();
    for (const r of reacoes) {
      const lista = mapa.get(r.mensagem_id) ?? [];
      const item = lista.find(x => x.emoji === r.emoji);
      if (item) { item.n++; item.minha = item.minha || r.user_id === userId; }
      else lista.push({ emoji: r.emoji, n: 1, minha: r.user_id === userId });
      mapa.set(r.mensagem_id, lista);
    }
    return mapa;
  }, [reacoes, userId]);

  /** Devolve true quando a reação foi POSTA (para contar nos favoritos). */
  const reagir = useCallback(async (mensagemId: string, emoji: string): Promise<boolean> => {
    if (!userId) return false;
    const minha = reacoes.find(r => r.mensagem_id === mensagemId && r.user_id === userId);
    if (minha?.emoji === emoji) {
      setReacoes(prev => prev.filter(r => !(r.mensagem_id === mensagemId && r.user_id === userId)));
      await supabase.from(onde.tabela).delete().eq('mensagem_id', mensagemId).eq('user_id', userId);
      return false;
    }
    setReacoes(prev => [...prev.filter(r => !(r.mensagem_id === mensagemId && r.user_id === userId)),
      { mensagem_id: mensagemId, user_id: userId, emoji }]);
    const { error } = await supabase.from(onde.tabela)
      .upsert({ mensagem_id: mensagemId, user_id: userId, emoji }, { onConflict: 'mensagem_id,user_id' });
    if (error) { carregar(); return false; }
    return true;
  }, [reacoes, userId, chave, carregar]);

  return { porMensagem, reagir };
}
