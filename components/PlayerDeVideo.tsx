// components/PlayerDeVideo.tsx
//
// Vídeo do chat tocando DENTRO do app (pedido do Marcos, 11/11/2026). Antes
// o toque abria o link no navegador/player do celular, fora do app.
//
// Usa o react-native-webview, que já está no binário (o mesmo do YouTube da
// Home): um <video> HTML5 em tela cheia, com os controles do próprio sistema.
// Assim funciona por atualização rápida, sem build. No próximo build dá para
// trocar por um player nativo (expo-video).

import React, { useMemo, useState } from 'react';
import { Modal, View, TouchableOpacity, ActivityIndicator, StyleSheet, StatusBar, Linking, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function htmlDoVideo(url: string) {
  const seguro = url.replace(/"/g, '&quot;');
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}
video{width:100%;height:100%;object-fit:contain;background:#000}</style></head>
<body><video src="${seguro}" controls autoplay playsinline webkit-playsinline preload="auto"></video>
<script>
  var v=document.querySelector('video');
  v.addEventListener('playing',function(){window.ReactNativeWebView.postMessage('tocando')});
  v.addEventListener('error',function(){window.ReactNativeWebView.postMessage('erro')});
</script></body></html>`;
}

export default function PlayerDeVideo({ url, onFechar }: { url: string | null; onFechar: () => void }) {
  const insets = useSafeAreaInsets();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const html = useMemo(() => (url ? htmlDoVideo(url) : ''), [url]);

  const fechar = () => { setCarregando(true); setErro(false); onFechar(); };

  return (
    <Modal visible={!!url} animationType="fade" onRequestClose={fechar} supportedOrientations={['portrait', 'landscape']}>
      <StatusBar barStyle="light-content" />
      <View style={st.fundo}>
        {!!url && (
          <WebView
            source={{ html, baseUrl: 'https://localhost' }}
            style={st.web}
            originWhitelist={['*']}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            javaScriptEnabled
            onMessage={e => {
              if (e.nativeEvent.data === 'tocando') setCarregando(false);
              if (e.nativeEvent.data === 'erro') { setCarregando(false); setErro(true); }
            }}
            onLoadEnd={() => setTimeout(() => setCarregando(false), 2500)}
          />
        )}
        {carregando && !erro && (
          <View style={st.centro} pointerEvents="none"><ActivityIndicator color="#fff" size="large" /></View>
        )}
        {erro && (
          <View style={st.centro}>
            <Text style={st.erroTexto}>Não foi possível tocar aqui.</Text>
            <TouchableOpacity style={st.botao} onPress={() => { if (url) Linking.openURL(url).catch(() => {}); }}>
              <Ionicons name="open-outline" size={16} color="#fff" />
              <Text style={st.botaoTexto}>Abrir no player do celular</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity style={[st.fechar, { top: insets.top + 10 }]} onPress={fechar} hitSlop={12} accessibilityLabel="Fechar vídeo">
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  centro: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 14 },
  fechar: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  erroTexto: { color: '#fff', fontSize: 15 },
  botao: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
  botaoTexto: { color: '#fff', fontWeight: '700' },
});
