// components/CapaDoVideo.tsx
//
// Capa dos vídeos do chat (pedido do Marcos, 12/11/2026): mostra um quadro do
// próprio vídeo em vez da capa verde.
//
// O binário não tem módulo nativo de miniatura, então isto usa a WebView que
// já está no app: um <video> invisível carrega só o começo do arquivo, pula
// para 0,5 s e desenha esse quadro num <canvas>. O canvas aparece por cima da
// capa colorida; se algo falhar, a capa colorida continua.
//
// Quando o servidor permite (CORS), o quadro também volta como JPEG pequeno e
// fica guardado na memória: rolar o chat não baixa o vídeo de novo.
//
// 16/11/2026 (app 1.6.0): a WebView não resolvia a capa verde. No iPhone ela
// não carrega vídeo sem toque, e no Android não abre o .mov/HEVC gravado no
// iPhone. Agora o quadro sai do módulo nativo expo-video-thumbnails, que lê
// o próprio arquivo (também os vídeos antigos). A WebView ficou só de reserva,
// se o módulo falhar.
import React, { useEffect, useMemo, useState } from 'react';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Image, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const guardadas = new Map<string, string>();

function htmlDaCapa(url: string, cruzado: boolean) {
  const seguro = url.replace(/"/g, '&quot;');
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}
canvas{position:fixed;inset:0;width:100%;height:100%;opacity:0;transition:opacity .25s}
video{position:fixed;width:1px;height:1px;opacity:0}</style></head><body>
<canvas></canvas>
<video ${cruzado ? 'crossorigin="anonymous"' : ''} muted playsinline webkit-playsinline preload="auto" src="${seguro}"></video>
<script>
var v=document.querySelector('video'),c=document.querySelector('canvas'),feito=false;
function avisa(m){try{window.ReactNativeWebView.postMessage(m)}catch(e){}}
function desenha(){
  if(feito||!v.videoWidth)return;feito=true;
  var W=c.clientWidth*2,H=c.clientHeight*2;c.width=W;c.height=H;
  var s=Math.max(W/v.videoWidth,H/v.videoHeight),w=v.videoWidth*s,h=v.videoHeight*s;
  c.getContext('2d').drawImage(v,(W-w)/2,(H-h)/2,w,h);c.style.opacity=1;
  try{avisa('img:'+c.toDataURL('image/jpeg',0.7))}catch(e){avisa('ok')}
  v.removeAttribute('src');v.load();
}
v.addEventListener('loadedmetadata',function(){try{v.currentTime=Math.min(0.5,(v.duration||1)/2)}catch(e){}});
v.addEventListener('seeked',desenha);
v.addEventListener('loadeddata',function(){setTimeout(desenha,400)});
v.addEventListener('error',function(){avisa('erro')});
</script></body></html>`;
}

export default function CapaDoVideo({ chave, url }: { chave: string; url: string | null }) {
  const [imagem, setImagem] = useState<string | null>(() => guardadas.get(chave) ?? null);
  // Primeiro tenta com CORS (permite guardar o JPEG). Se o vídeo não carregar
  // assim, tenta sem: o quadro aparece, só não fica guardado.
  const [cruzado, setCruzado] = useState(true);
  const [desistiu, setDesistiu] = useState(false);
  // 'nativo' → tentando o expo-video-thumbnails; 'web' → reserva (WebView).
  const [modo, setModo] = useState<'nativo' | 'web'>('nativo');
  const html = useMemo(() => (url ? htmlDaCapa(url, cruzado) : ''), [url, cruzado]);

  useEffect(() => {
    if (imagem || !url || modo !== 'nativo') return;
    let vivo = true;
    VideoThumbnails.getThumbnailAsync(url, { time: 500, quality: 0.6 })
      .then(r => { if (vivo && r?.uri) { guardadas.set(chave, r.uri); setImagem(r.uri); } })
      .catch(() => { if (vivo) setModo('web'); });
    return () => { vivo = false; };
  }, [url, chave, imagem, modo]);

  if (imagem) return <Image source={{ uri: imagem }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  if (!url || desistiu || modo === 'nativo') return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <WebView
        key={cruzado ? 'c' : 's'}
        source={{ html }}
        originWhitelist={['*']}
        style={{ backgroundColor: 'transparent' }}
        containerStyle={{ backgroundColor: 'transparent' }}
        scrollEnabled={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        onMessage={e => {
          const m = e.nativeEvent.data;
          if (m.startsWith('img:')) { const d = m.slice(4); guardadas.set(chave, d); setImagem(d); }
          else if (m === 'erro') { if (cruzado) setCruzado(false); else setDesistiu(true); }
        }}
      />
    </View>
  );
}
