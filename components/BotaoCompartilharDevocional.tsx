import React from 'react';
import { Share, StyleSheet, Text, TouchableOpacity } from 'react-native';
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
export default function BotaoCompartilharDevocional({
  original, traduzido, corFundo, corTexto,
}: {
  original: { titulo: string; versiculo: string; referencia: string; texto: string };
  traduzido: { titulo: string; versiculo: string; referencia: string; texto: string };
  corFundo: string;
  corTexto: string;
}) {
  const { t, i18n } = useTranslation();

  const compartilhar = () => {
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

    Share.share({ message: partes.join('\n\n'), title: d.titulo }).catch(() => {});
  };

  return (
    <TouchableOpacity
      style={[st.botao, { backgroundColor: corFundo }]}
      onPress={compartilhar}
      accessibilityRole="button"
      hitSlop={6}
    >
      <Ionicons name="share-outline" size={15} color={corTexto} />
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
