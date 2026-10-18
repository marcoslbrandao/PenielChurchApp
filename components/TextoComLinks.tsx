import React, { useState } from 'react';
import { Text, Linking, Alert, Image, Pressable, type StyleProp, type TextStyle } from 'react-native';
import { separarLinks, soLinkDeImagem } from '../lib/links';
import { separarNegrito } from '../lib/negrito';

// Texto de mensagem com os links clicáveis (sublinhados, na cor pedida).
// Instagram, YouTube, Spotify, WhatsApp etc. abrem direto no app da pessoa
// quando ele está instalado — o sistema faz isso sozinho a partir do https://
// (universal links / app links). Sem o app, abre no navegador.
export default function TextoComLinks({
  texto, style, corLink, onLongPress,
}: {
  texto: string;
  style?: StyleProp<TextStyle>;
  // Sem cor: o link herda a cor do texto e se distingue só pelo sublinhado.
  corLink?: string;
  // Repassado aos links para que segurar em cima de um link continue fazendo
  // o que segurar na bolha faz (apagar a mensagem), em vez de nada.
  onLongPress?: () => void;
}) {
  // Mensagem que é SÓ um link de imagem (ex.: colado do app da RTM): mostra a
  // imagem. Se ela não carregar, volta a mostrar o link (14/10/2026).
  const urlImagem = soLinkDeImagem(texto);
  const [imagemFalhou, setImagemFalhou] = useState(false);
  if (urlImagem && !imagemFalhou) {
    return <ImagemDoLink url={urlImagem} onLongPress={onLongPress} onErro={() => setImagemFalhou(true)} />;
  }

  const trechos = separarLinks(texto);
  // *negrito* no padrão do WhatsApp (18/10/2026, lib/negrito.ts). Só no texto
  // comum: um link nunca é cortado ao meio por causa de um asterisco.
  const comNegrito = (valor: string, chave: string | number) => {
    const partes = separarNegrito(valor);
    if (!partes.some(p => p.negrito)) return valor;
    return partes.map((p, j) => (p.negrito
      ? <Text key={`${chave}-${j}`} style={{ fontWeight: '700' }}>{p.texto}</Text>
      : p.texto));
  };
  if (!trechos.some(t => t.tipo === 'link')) return <Text style={style}>{comNegrito(texto, 0)}</Text>;

  const abrir = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Não foi possível abrir o link', url);
    }
  };

  return (
    <Text style={style}>
      {trechos.map((t, i) =>
        t.tipo === 'texto' ? <React.Fragment key={i}>{comNegrito(t.valor, i)}</React.Fragment> : (
          <Text
            key={i}
            style={corLink ? { color: corLink, textDecorationLine: 'underline' } : { textDecorationLine: 'underline' }}
            onPress={() => abrir(t.url)}
            onLongPress={onLongPress}
            suppressHighlighting={false}
          >
            {t.valor}
          </Text>
        ),
      )}
    </Text>
  );
}

const LARGURA = 230;

function ImagemDoLink({ url, onLongPress, onErro }: { url: string; onLongPress?: () => void; onErro: () => void }) {
  // Quadrada até saber o tamanho real; depois respeita a proporção (limitada).
  const [proporcao, setProporcao] = useState(1);
  return (
    <Pressable
      onPress={() => { Linking.openURL(url).catch(() => {}); }}
      onLongPress={onLongPress}
      style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.2)' }}
    >
      <Image
        source={{ uri: url }}
        style={{ width: LARGURA, height: LARGURA / proporcao }}
        resizeMode="cover"
        onLoad={e => {
          const { width, height } = e.nativeEvent.source ?? {};
          if (width && height) setProporcao(Math.min(2, Math.max(0.6, width / height)));
        }}
        onError={onErro}
      />
    </Pressable>
  );
}
