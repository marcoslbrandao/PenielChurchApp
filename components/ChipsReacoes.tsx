// components/ChipsReacoes.tsx
//
// Os emojis de reação embaixo da bolha, nos chats dos grupos e da Banda
// (18/10/2026) — iguais aos do Chat da Igreja. Tocar num chip põe/tira a
// sua reação com aquele emoji.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ChipReacao } from '../lib/reacoesChat';

export default function ChipsReacoes({ chips, minha, cor, corFundo, corNumero, onTocar }: {
  chips: ChipReacao[] | undefined;
  /** Mensagem minha: os chips encostam à direita, como a bolha. */
  minha: boolean;
  cor: string;
  corFundo: string;
  corNumero: string;
  onTocar: (emoji: string) => void;
}) {
  if (!chips || chips.length === 0) return null;
  return (
    <View style={[st.linha, minha && { justifyContent: 'flex-end' }]}>
      {chips.map(c => (
        <TouchableOpacity
          key={c.emoji}
          onPress={() => onTocar(c.emoji)}
          style={[st.chip, { backgroundColor: corFundo }, c.minha && { borderColor: cor }]}
        >
          <Text style={st.emoji}>{c.emoji}</Text>
          {c.n > 1 && <Text style={[st.n, { color: corNumero }]}>{c.n}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4, marginBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 7, paddingVertical: 2 },
  emoji: { fontSize: 14 },
  n: { fontSize: 12, fontWeight: '700' },
});
