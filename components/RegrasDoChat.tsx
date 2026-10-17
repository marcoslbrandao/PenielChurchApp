// components/RegrasDoChat.tsx
//
// Regras da comunidade dos chats (17/10/2026). Aparece por cima do chat
// (Igreja, grupo ou Banda) na primeira vez que a pessoa abre um chat — e de
// novo se VERSAO_REGRAS subir. Sem aceitar, o chat fecha.
//
// Também é usada só para leitura (`somenteLeitura`), a partir do Perfil.
//
// Exigência da Apple (diretriz 1.2): termos que deixem claro que não há
// tolerância com conteúdo ofensivo ou com quem abusa, e como denunciar.

import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { EMAIL_MODERACAO } from '../lib/moderacao';

const ITENS = ['regra1', 'regra2', 'regra3', 'regra4', 'regra5', 'regra6'] as const;

export default function RegrasDoChat({
  visivel, cor, isDark, somenteLeitura, onAceitar, onRecusar,
}: {
  visivel: boolean;
  cor: string;
  isDark: boolean;
  somenteLeitura?: boolean;
  onAceitar: () => void;
  onRecusar: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bg = isDark ? '#1C1940' : '#FFFFFF';
  const texto = isDark ? '#F1EFFA' : '#1A1A2E';
  const suave = isDark ? '#A69FD6' : '#6B7280';

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onRecusar}>
      <View style={st.fundo}>
        <View style={[st.caixa, { backgroundColor: bg, marginTop: Math.max(insets.top, 20) + 10, marginBottom: Math.max(insets.bottom, 12) + 10 }]}>
          <View style={st.topo}>
            <Ionicons name="shield-checkmark-outline" size={26} color={cor} />
            <Text style={[st.titulo, { color: texto }]}>{t('moderacao.regrasTitulo')}</Text>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 6 }}>
            <Text style={[st.intro, { color: suave }]}>{t('moderacao.regrasIntro')}</Text>
            {ITENS.map(k => (
              <View key={k} style={st.linha}>
                <Ionicons name="checkmark-circle" size={17} color={cor} style={{ marginTop: 1 }} />
                <Text style={[st.item, { color: texto }]}>{t(`moderacao.${k}`)}</Text>
              </View>
            ))}
            <Text style={[st.intro, { color: suave, marginTop: 12 }]}>{t('moderacao.regrasConsequencia')}</Text>
            <TouchableOpacity onPress={() => Linking.openURL(`mailto:${EMAIL_MODERACAO}`)}>
              <Text style={[st.intro, { color: cor, marginTop: 8, fontWeight: '700' }]}>
                {t('moderacao.regrasContato', { email: EMAIL_MODERACAO })}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {somenteLeitura ? (
            <TouchableOpacity style={[st.botao, { backgroundColor: cor }]} onPress={onAceitar}>
              <Text style={st.botaoTexto}>{t('common.fechar')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={[st.botao, { backgroundColor: cor }]} onPress={onAceitar}>
                <Text style={st.botaoTexto}>{t('moderacao.regrasAceito')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.botaoSec} onPress={onRecusar}>
                <Text style={[st.botaoSecTexto, { color: suave }]}>{t('moderacao.regrasAgoraNao')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: 18 },
  caixa: { borderRadius: 18, padding: 20, maxHeight: '90%' },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  titulo: { fontSize: 18, fontWeight: '800', flex: 1 },
  intro: { fontSize: 13.5, lineHeight: 19 },
  linha: { flexDirection: 'row', gap: 8, marginTop: 10 },
  item: { fontSize: 14, lineHeight: 20, flex: 1 },
  botao: { marginTop: 16, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  botaoTexto: { color: '#fff', fontSize: 15, fontWeight: '800' },
  botaoSec: { paddingVertical: 12, alignItems: 'center' },
  botaoSecTexto: { fontSize: 14, fontWeight: '600' },
});
