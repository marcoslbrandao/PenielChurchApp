// components/ThumbCultoView.tsx
//
// Prévia ao vivo da thumb do culto da semana (canvas numa WebView — ver
// lib/thumbCulto.ts). O pai chama `ref.current.exportar()` para receber o
// JPEG 1280x720 em base64 na hora de salvar.

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { htmlThumbCulto, DadosThumb } from '../lib/thumbCulto';

export type ThumbCultoRef = { exportar: () => Promise<string> };

const ThumbCultoView = forwardRef<ThumbCultoRef, { dados: DadosThumb; onFotoFalhou?: () => void }>(
  function ThumbCultoView({ dados, onFotoFalhou }, ref) {
    const web = useRef<WebView>(null);
    const [pronto, setPronto] = useState(false);
    const espera = useRef<{ ok: (b: string) => void; erro: (e: Error) => void } | null>(null);
    const html = useMemo(() => htmlThumbCulto(), []);

    // Redesenha a cada mudança (a WebView ignora até as fontes carregarem e
    // desenha o último pedido assim que ficar pronta).
    useEffect(() => {
      web.current?.injectJavaScript(`desenhar(${JSON.stringify(dados)}); true;`);
    }, [dados, pronto]);

    useImperativeHandle(ref, () => ({
      exportar: () => new Promise<string>((ok, erro) => {
        espera.current = { ok, erro };
        web.current?.injectJavaScript(`desenhar(${JSON.stringify(dados)}); exportar(); true;`);
        setTimeout(() => {
          if (espera.current) { espera.current.erro(new Error('A thumb demorou para ficar pronta. Tente de novo.')); espera.current = null; }
        }, 15000);
      }),
    }), [dados]);

    return (
      <View style={st.caixa}>
        <WebView
          ref={web}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://penielchurch.org.uk' }}
          style={st.web}
          scrollEnabled={false}
          javaScriptEnabled
          onMessage={(e) => {
            let m: any = null;
            try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
            if (m.tipo === 'pronto') setPronto(true);
            else if (m.tipo === 'erroFoto') onFotoFalhou?.();
            else if (m.tipo === 'jpeg' && espera.current) { espera.current.ok(m.base64); espera.current = null; }
            else if (m.tipo === 'erroExportar' && espera.current) { espera.current.erro(new Error(m.msg)); espera.current = null; }
          }}
        />
        {!pronto && (
          <View style={st.carregando} pointerEvents="none">
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>
    );
  },
);

export default ThumbCultoView;

const st = StyleSheet.create({
  caixa: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1A1740' },
  web: { flex: 1, backgroundColor: '#1A1740' },
  carregando: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
