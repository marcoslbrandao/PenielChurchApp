import React from 'react';
import { Text, Linking, Alert, type StyleProp, type TextStyle } from 'react-native';
import { separarLinks } from '../lib/links';

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
  const trechos = separarLinks(texto);
  if (!trechos.some(t => t.tipo === 'link')) return <Text style={style}>{texto}</Text>;

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
        t.tipo === 'texto' ? t.valor : (
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
