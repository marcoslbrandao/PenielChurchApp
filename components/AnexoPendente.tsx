// components/AnexoPendente.tsx
//
// Faixa "Pronto para enviar" acima da caixa de digitar, nos chats dos grupos
// e da Banda (18/10/2026): o arquivo chegou pelo Compartilhar com o chat já
// aberto. O texto digitado vira a legenda; o botão Enviar manda os dois.
// (O Chat da Igreja tem a mesma faixa dentro do próprio ChatGeralModal.)

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatarTamanho, type Compartilhado } from '../lib/chatGeral';

export default function AnexoPendente({ arquivo, cor, corTexto, corSuave, corFundo, corBorda, desativado, onRemover }: {
  arquivo: NonNullable<Compartilhado['arquivo']>;
  cor: string;
  corTexto: string;
  corSuave: string;
  corFundo: string;
  corBorda: string;
  desativado?: boolean;
  onRemover: () => void;
}) {
  const { t } = useTranslation();
  const mime = (arquivo.mime ?? '').toLowerCase();
  const icone: keyof typeof Ionicons.glyphMap = mime.startsWith('image/') ? 'image'
    : mime.startsWith('video/') ? 'videocam'
      : mime.startsWith('audio/') ? 'musical-notes' : 'document-text';
  return (
    <View style={[st.barra, { backgroundColor: corFundo, borderTopColor: corBorda }]}>
      <View style={st.faixa} />
      <Ionicons name={icone} size={22} color={cor} />
      <View style={{ flex: 1 }}>
        <Text style={[st.titulo, { color: corTexto }]} numberOfLines={1}>{t('chatGeral.prontoParaEnviar')}</Text>
        <Text style={[st.sub, { color: corSuave }]} numberOfLines={1}>
          {[arquivo.nome, formatarTamanho(arquivo.tamanho)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <TouchableOpacity onPress={onRemover} hitSlop={10} disabled={desativado}>
        <Ionicons name="close" size={20} color={corSuave} />
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  barra: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  faixa: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: '#2BB673' },
  titulo: { fontSize: 13, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 1 },
});
