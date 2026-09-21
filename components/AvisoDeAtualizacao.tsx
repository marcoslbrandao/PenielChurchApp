import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/theme';
import {
  verificarVersao, avisoFoiAdiado, adiarAviso, LINK_DA_LOJA, LINK_DA_LOJA_WEB, type SituacaoDaVersao,
} from '../lib/versaoDoApp';

// Confere a versão ao abrir o app e ao voltar para ele (no máximo 1x por
// hora). Ver lib/versaoDoApp.ts para as duas fontes.
//
// - 'disponivel' → cartão com "Atualizar agora" / "Agora não" (adia 3 dias).
// - 'obrigatoria' → tela cheia sem fechar. Só sai atualizando pela loja.
const INTERVALO_MS = 60 * 60 * 1000;

export default function AvisoDeAtualizacao() {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const [situacao, setSituacao] = useState<SituacaoDaVersao>({ tipo: 'ok' });
  const ultima = useRef(0);

  const conferir = useCallback(async () => {
    if (Date.now() - ultima.current < INTERVALO_MS) return;
    ultima.current = Date.now();
    const s = await verificarVersao();
    if (s.tipo === 'disponivel' && (await avisoFoiAdiado(s.nova))) {
      setSituacao({ tipo: 'ok' });
      return;
    }
    setSituacao(s);
  }, []);

  useEffect(() => {
    conferir();
    const sub = AppState.addEventListener('change', estado => {
      if (estado === 'active') conferir();
    });
    return () => sub.remove();
  }, [conferir]);

  const abrirLoja = async () => {
    try {
      await Linking.openURL(LINK_DA_LOJA);
    } catch {
      try { await Linking.openURL(LINK_DA_LOJA_WEB); } catch {
        Alert.alert(t('atualizacao.novaTitulo'), t('atualizacao.erroLoja'));
      }
    }
    // Quem foi para a loja volta com a versão nova (ou não): conferir de novo
    // na volta, sem esperar a hora.
    ultima.current = 0;
  };

  if (situacao.tipo === 'ok') return null;

  if (situacao.tipo === 'obrigatoria') {
    return (
      <Modal visible animationType="fade" onRequestClose={() => { /* não fecha */ }}>
        <View style={[st.cheia, { backgroundColor: C.primary }]}>
          <View style={[st.icone, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
            <Ionicons name="cloud-download-outline" size={40} color={C.accent} />
          </View>
          <Text style={[st.tituloCheia, { color: '#fff' }]}>{t('atualizacao.obrigatoriaTitulo')}</Text>
          <Text style={[st.textoCheia, { color: 'rgba(255,255,255,0.8)' }]}>
            {t('atualizacao.obrigatoriaTexto', { instalada: situacao.instalada, minima: situacao.minima })}
          </Text>
          <TouchableOpacity style={[st.botao, { backgroundColor: C.accent }]} onPress={abrirLoja} accessibilityRole="button">
            <Text style={[st.botaoTexto, { color: '#1A1740' }]}>{t('atualizacao.atualizar')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const fechar = () => {
    if (situacao.tipo === 'disponivel') adiarAviso(situacao.nova);
    setSituacao({ tipo: 'ok' });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={fechar}>
      <View style={st.fundo}>
        <View style={[st.cartao, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[st.icone, { backgroundColor: C.bg }]}>
            <Ionicons name="sparkles-outline" size={32} color={C.icone} />
          </View>
          <Text style={[st.titulo, { color: C.text }]}>{t('atualizacao.novaTitulo')}</Text>
          <Text style={[st.texto, { color: C.textMuted }]}>
            {t('atualizacao.novaTexto', { nova: situacao.nova, instalada: situacao.instalada })}
          </Text>
          <TouchableOpacity style={[st.botao, { backgroundColor: C.primary }]} onPress={abrirLoja} accessibilityRole="button">
            <Text style={[st.botaoTexto, { color: '#fff' }]}>{t('atualizacao.atualizar')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.botaoSecundario} onPress={fechar} accessibilityRole="button" hitSlop={8}>
            <Text style={[st.botaoSecundarioTexto, { color: C.textMuted }]}>{t('atualizacao.agoraNao')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  cartao: { width: '100%', maxWidth: 380, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center' },
  icone: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  titulo: { fontSize: 19, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  texto: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 22 },
  botao: { alignSelf: 'stretch', height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  botaoTexto: { fontSize: 16, fontWeight: '700' },
  botaoSecundario: { marginTop: 14, paddingVertical: 6 },
  botaoSecundarioTexto: { fontSize: 14, fontWeight: '600' },
  cheia: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, paddingTop: Platform.OS === 'ios' ? 60 : 32 },
  tituloCheia: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  textoCheia: { fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 32 },
});
