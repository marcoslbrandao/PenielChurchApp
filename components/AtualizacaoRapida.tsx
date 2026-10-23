import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Updates from 'expo-updates';
import { useTheme } from '../lib/theme';

// Atualizacao rapida (OTA / eas update), pedido do Marcos 23/10.
// Antes a pessoa precisava "abrir, esperar 5 segundos, fechar, duas vezes"
// para a melhoria aparecer. Agora, ao abrir o app (e ao voltar para ele, no
// maximo 1x a cada 30 min), o app procura uma atualizacao nova, baixa em
// segundo plano e mostra um aviso com "Atualizar agora": um toque e o app
// reinicia ja com a versao nova. "Depois" fecha; ela entra sozinha na
// proxima vez que o app for aberto do zero.
// Nao substitui o AvisoDeAtualizacao (versao nova na LOJA), que continua.
const INTERVALO_MS = 30 * 60 * 1000;

export default function AtualizacaoRapida() {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const [pronta, setPronta] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const ultima = useRef(0);
  const dispensada = useRef(false);

  const conferir = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) return;
    if (dispensada.current || Date.now() - ultima.current < INTERVALO_MS) return;
    ultima.current = Date.now();
    try {
      const r = await Updates.checkForUpdateAsync();
      if (!r.isAvailable) return;
      const f = await Updates.fetchUpdateAsync();
      if (f.isNew) setPronta(true);
    } catch {
      // Sem internet ou servidor fora: tenta de novo na proxima volta ao app.
    }
  }, []);

  useEffect(() => {
    conferir();
    const sub = AppState.addEventListener('change', e => { if (e === 'active') conferir(); });
    return () => sub.remove();
  }, [conferir]);

  const atualizar = async () => {
    setReiniciando(true);
    try { await Updates.reloadAsync(); } catch { setReiniciando(false); setPronta(false); }
  };
  const depois = () => { dispensada.current = true; setPronta(false); };

  if (!pronta) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={depois}>
      <View style={st.fundo}>
        <View style={[st.cartao, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[st.icone, { backgroundColor: C.bg }]}>
            <Ionicons name="refresh-circle-outline" size={34} color={C.icone} />
          </View>
          <Text style={[st.titulo, { color: C.text }]}>{t('atualizacaoRapida.titulo')}</Text>
          <Text style={[st.texto, { color: C.textMuted }]}>{t('atualizacaoRapida.texto')}</Text>
          <TouchableOpacity style={[st.botao, { backgroundColor: C.primary }]} onPress={atualizar} disabled={reiniciando} accessibilityRole="button">
            {reiniciando ? <ActivityIndicator color="#fff" /> : <Text style={[st.botaoTexto, { color: '#fff' }]}>{t('atualizacaoRapida.atualizar')}</Text>}
          </TouchableOpacity>
          {!reiniciando && (
            <TouchableOpacity style={st.botaoSecundario} onPress={depois} accessibilityRole="button" hitSlop={8}>
              <Text style={[st.botaoSecundarioTexto, { color: C.textMuted }]}>{t('atualizacaoRapida.depois')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  cartao: { width: '100%', maxWidth: 380, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center' },
  icone: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  titulo: { fontSize: 19, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  texto: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  botao: { alignSelf: 'stretch', borderRadius: 12, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  botaoTexto: { fontSize: 15, fontWeight: '800' },
  botaoSecundario: { marginTop: 14 },
  botaoSecundarioTexto: { fontSize: 14, fontWeight: '600' },
});
