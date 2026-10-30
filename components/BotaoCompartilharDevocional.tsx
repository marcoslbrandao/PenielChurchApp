import React from 'react';
import { ActivityIndicator, NativeModules, Platform, Share, StyleSheet, Text, TouchableOpacity, TurboModuleRegistry } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { linhaCompartilharApp } from '../lib/appLinks';

// Botão "Compartilhar" do devocional aberto (Home, lista de Devocionais e
// devocional do grupo).
//
// Manda o devocional COMO A PESSOA ESTÁ VENDO — já traduzido — e o rodapé de
// download no MESMO idioma do texto. Detalhe: enquanto a tradução carrega (ou
// se ela falhar), `useCampoTraduzido` devolve o original em português; nesse
// caso o texto que sai é português, então o rodapé também sai em português,
// mesmo com o app em inglês. Por isso o idioma é decidido comparando o texto
// traduzido com o original, e não só pelo idioma do app.
//
// FOTO JUNTO (30/10/2026, pedido do Marcos): se o devocional tem `imagem_url`,
// a foto é baixada para o cache e vai junto com o texto.
//  - Binário com `react-native-share` (a partir do próximo build): foto +
//    legenda juntas no iPhone e no Android (WhatsApp, Instagram etc.).
//  - Binário atual (1.5.x, só OTA): o Share do iOS leva foto + texto; no
//    Android o Share do sistema não aceita foto, então sai só o texto.
//  - Sem foto, ou se o download falhar: só o texto, como antes.
type Devocional = {
  titulo: string; versiculo: string; referencia: string; texto: string;
  imagem_url?: string | null;
};

// Só existe no binário que já tiver o react-native-share. O require é tardio
// porque o módulo dá erro ao ser importado num binário sem ele.
function moduloShareNativo(): any | null {
  try {
    const nativo = (TurboModuleRegistry as any).get?.('RNShare') ?? NativeModules.RNShare;
    if (!nativo) return null;
    return require('react-native-share').default;
  } catch {
    return null;
  }
}

async function baixarFoto(url: string): Promise<string | null> {
  try {
    const nome = (url.split('?')[0].split('/').pop() || 'devocional.jpg').replace(/[^\w.-]/g, '_');
    const destino = `${FileSystem.cacheDirectory}compartilhar-${nome}`;
    const r = await FileSystem.downloadAsync(url, destino);
    return r.status >= 200 && r.status < 300 ? r.uri : null;
  } catch {
    return null;
  }
}

export default function BotaoCompartilharDevocional({
  original, traduzido, corFundo, corTexto,
}: {
  original: Devocional;
  traduzido: { titulo: string; versiculo: string; referencia: string; texto: string };
  corFundo: string;
  corTexto: string;
}) {
  const { t, i18n } = useTranslation();

  const [preparando, setPreparando] = React.useState(false);

  const compartilhar = async () => {
    if (preparando) return;
    const lang = i18n.language;
    const textoTraduzido = lang !== 'pt' && !!original.texto && traduzido.texto !== original.texto;
    const idioma = textoTraduzido ? lang : 'pt';
    const d = textoTraduzido ? traduzido : original;

    const partes = [
      d.titulo,
      d.versiculo ? `"${d.versiculo}"${d.referencia ? `\n— ${d.referencia}` : ''}` : d.referencia,
      d.texto,
      linhaCompartilharApp(idioma),
    ].filter(p => !!p && p.trim().length > 0);

    const mensagem = partes.join('\n\n');

    const foto = original.imagem_url
      ? await (async () => { setPreparando(true); try { return await baixarFoto(original.imagem_url!); } finally { setPreparando(false); } })()
      : null;

    if (foto) {
      const RNShare = moduloShareNativo();
      if (RNShare) {
        try {
          await RNShare.open({ url: foto, type: 'image/jpeg', message: mensagem, title: d.titulo, failOnCancel: false });
          return;
        } catch {
          // cai no Share do sistema
        }
      }
      if (Platform.OS === 'ios') {
        Share.share({ url: foto, message: mensagem, title: d.titulo }).catch(() => {});
        return;
      }
    }

    Share.share({ message: mensagem, title: d.titulo }).catch(() => {});
  };

  return (
    <TouchableOpacity
      style={[st.botao, { backgroundColor: corFundo }]}
      onPress={compartilhar}
      disabled={preparando}
      accessibilityRole="button"
      hitSlop={6}
    >
      {preparando
        ? <ActivityIndicator size="small" color={corTexto} />
        : <Ionicons name="share-outline" size={15} color={corTexto} />}
      <Text style={[st.texto, { color: corTexto }]}>{t('common.compartilhar')}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  botao: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginTop: 14,
  },
  texto: { fontSize: 13, fontWeight: '600' },
});
