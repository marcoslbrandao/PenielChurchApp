// components/BotaoNegrito.tsx
//
// Faixa que aparece acima da caixa de digitar quando a pessoa SELECIONA um
// trecho do texto (18/10/2026): toque em "Negrito" e o trecho fica *assim*,
// que a bolha mostra em negrito (lib/negrito.ts). Tocar de novo tira.
// Também explica o atalho do WhatsApp para quem prefere digitar.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function BotaoNegrito({ cor, corTexto, corSuave, corFundo, corBorda, onPress }: {
  cor: string; corTexto: string; corSuave: string; corFundo: string; corBorda: string; onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={[st.barra, { backgroundColor: corFundo, borderTopColor: corBorda }]}>
      <TouchableOpacity onPress={onPress} style={[st.botao, { borderColor: cor }]} hitSlop={6}
        accessibilityRole="button" accessibilityLabel={t('chatFormato.negrito')}>
        <Text style={[st.b, { color: cor }]}>B</Text>
        <Text style={[st.botaoTexto, { color: corTexto }]}>{t('chatFormato.negrito')}</Text>
      </TouchableOpacity>
      <Text style={[st.dica, { color: corSuave }]} numberOfLines={1}>{t('chatFormato.dica')}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  barra: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  botao: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  b: { fontSize: 15, fontWeight: '900' },
  botaoTexto: { fontSize: 13, fontWeight: '700' },
  dica: { fontSize: 12, flex: 1 },
});
