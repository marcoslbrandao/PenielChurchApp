// components/PlayerDeVideo.tsx
//
// Vídeo do chat (e da fila de Shorts) tocando DENTRO do app.
// • 11/11/2026: primeira versão, com um <video> HTML numa WebView (dava para
//   mandar por OTA).
// • 16/11/2026 (app 1.6.0): player nativo do expo-video. Abre mais rápido,
//   toca o .mov/HEVC do iPhone também no Android, tem tela cheia de verdade e,
//   no iPhone, Picture-in-Picture. Botão "Salvar" grava o vídeo na galeria.
import React, { useState } from 'react';
import { Modal, View, TouchableOpacity, ActivityIndicator, StyleSheet, StatusBar, Linking, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { salvarNaGaleria } from '../lib/salvarNaGaleria';

function Tocador({ url }: { url: string }) {
  const { t } = useTranslation();
  const player = useVideoPlayer(url, p => { p.loop = false; p.play(); });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  return (
    <>
      <VideoView
        player={player}
        style={st.video}
        contentFit="contain"
        nativeControls
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture={Platform.OS === 'ios'}
      />
      {(status === 'loading' || status === 'idle') && (
        <View style={st.centro} pointerEvents="none"><ActivityIndicator color="#fff" size="large" /></View>
      )}
      {status === 'error' && (
        <View style={st.centro}>
          <Text style={st.erroTexto}>{t('player.naoTocou')}</Text>
          <TouchableOpacity style={st.botao} onPress={() => Linking.openURL(url).catch(() => {})}>
            <Ionicons name="open-outline" size={16} color="#fff" />
            <Text style={st.botaoTexto}>{t('player.abrirFora')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

export default function PlayerDeVideo({ url, onFechar, podeSalvar = true }: {
  url: string | null; onFechar: () => void; podeSalvar?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!url || salvando) return;
    setSalvando(true);
    await salvarNaGaleria(url, 'video');
    setSalvando(false);
  };

  return (
    <Modal visible={!!url} animationType="fade" onRequestClose={onFechar} supportedOrientations={['portrait', 'landscape']}>
      <StatusBar barStyle="light-content" />
      <View style={st.fundo}>
        {!!url && <Tocador key={url} url={url} />}
        <TouchableOpacity style={[st.redondo, { top: insets.top + 10, left: 14 }]} onPress={onFechar} hitSlop={12} accessibilityLabel={t('player.fechar')}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        {podeSalvar && !!url && (
          <TouchableOpacity style={[st.redondo, { top: insets.top + 10, right: 14 }]} onPress={salvar} hitSlop={12}
            accessibilityLabel={t('galeria.titulo')} disabled={salvando}>
            {salvando ? <ActivityIndicator color="#fff" /> : <Ionicons name="download-outline" size={22} color="#fff" />}
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1, backgroundColor: '#000' },
  centro: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 14 },
  redondo: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  erroTexto: { color: '#fff', fontSize: 15 },
  botao: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
  botaoTexto: { color: '#fff', fontWeight: '700' },
});
