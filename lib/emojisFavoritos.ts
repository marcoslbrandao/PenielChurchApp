// lib/emojisFavoritos.ts
//
// As 6 reações que aparecem ao segurar uma mensagem no Chat da Igreja são as
// MAIS USADAS pela própria pessoa (18/10/2026, pedido do Marcos). Começa com
// o padrão (REACOES) e, conforme a pessoa reage, os emojis dela tomam o lugar.
//
// A contagem fica guardada no aparelho (AsyncStorage), por conta: é gosto
// pessoal, não precisa ir para o banco nem para os outros membros.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REACOES } from './chatGeral';

type Contagem = Record<string, { n: number; ultima: number }>;

const chave = (userId: string) => `peniel.reacoes.uso.v1.${userId}`;

function seisMais(cont: Contagem): string[] {
  const usados = Object.entries(cont)
    .sort((a, b) => b[1].n - a[1].n || b[1].ultima - a[1].ultima)
    .map(([e]) => e);
  const lista: string[] = [];
  for (const e of [...usados, ...REACOES]) {
    if (!lista.includes(e)) lista.push(e);
    if (lista.length === 6) break;
  }
  return lista;
}

export function useEmojisFavoritos(userId: string | null | undefined) {
  const [contagem, setContagem] = useState<Contagem>({});

  useEffect(() => {
    if (!userId) return;
    let vivo = true;
    AsyncStorage.getItem(chave(userId))
      .then(v => { if (vivo && v) setContagem(JSON.parse(v)); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [userId]);

  const registrarUso = useCallback((emoji: string) => {
    if (!userId) return;
    setContagem(atual => {
      const novo = { ...atual, [emoji]: { n: (atual[emoji]?.n ?? 0) + 1, ultima: Date.now() } };
      AsyncStorage.setItem(chave(userId), JSON.stringify(novo)).catch(() => {});
      return novo;
    });
  }, [userId]);

  return { favoritos: seisMais(contagem), registrarUso };
}
