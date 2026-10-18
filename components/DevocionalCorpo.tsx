import React, { useState } from 'react';
import { View, Text, StyleSheet, TextStyle, StyleProp } from 'react-native';
import { useTranslation } from 'react-i18next';
import { segmentarReferencias, RefBiblica } from '../lib/referenciasBiblicas';
import { livrosAT, livrosNT } from '../lib/bibliaLivros';
import { LeitorModal, versaoPadraoDoIdioma } from '../screens/BibleScreen';

const TODOS_LIVROS = [...livrosAT, ...livrosNT];

// Rotulos fixos do devocional (mesma ideia de blocos() no site), nos 4 idiomas
// do app. "Referências bíblicas" vem antes de "Referências" para casar inteiro.
const ROTULOS = /^(Refer[êe]ncias b[íi]blicas|Biblical references|Bible references|Referencias b[íi]blicas|R[ée]f[ée]rences bibliques|Refer[êe]ncias|References|Referencias|R[ée]f[ée]rences|Para refletir|For reflection|To reflect on|Para reflexionar|Pour r[ée]fl[ée]chir|Ora[çc][ãa]o|Prayer|Oraci[óo]n|Pri[èe]re|Aplica[çc][ãa]o|Application|Aplicaci[óo]n|Desafio|Challenge|Desaf[íi]o|D[ée]fi)\s*:?\s*/i;
const EH_REFERENCIAS = /^(refer|biblical|bible|r[ée]f)/i;

type Bloco = { tipo: 'h' | 'p'; texto: string };

function blocos(texto: string): Bloco[] {
  const saida: Bloco[] = [];
  for (const bruto of (texto ?? '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const linhas = bruto.split('\n').map(l => l.trim()).filter(Boolean);
    if (!linhas.length) continue;
    // "Referências\nbíblicas: ..." (quebrado em duas linhas) vira uma linha so.
    const primeira = linhas.join('\n').replace(/^(Refer[êe]ncias)\s*\n\s*(b[íi]blicas)/i, '$1 $2');
    const juntas = primeira.split('\n');
    const m = juntas[0].match(ROTULOS);
    if (m) {
      const rotulo = EH_REFERENCIAS.test(m[1]) ? `${m[1]}:` : m[1];
      saida.push({ tipo: 'h', texto: rotulo });
      const resto = [juntas[0].slice(m[0].length), ...juntas.slice(1)].join('\n').trim();
      if (resto) saida.push({ tipo: 'p', texto: resto });
    } else {
      saida.push({ tipo: 'p', texto: juntas.join('\n') });
    }
  }
  return saida;
}

// Corpo do devocional (referencia principal + texto) com os versiculos
// clicaveis: tocou, abre a Biblia por cima com o(s) versiculo(s) marcados;
// fechou, volta para o devocional. Usado na Home e na tela Devocionais.
export default function DevocionalCorpo({ referencia, texto, estiloReferencia, estiloTexto }: {
  referencia?: string; texto: string;
  estiloReferencia?: StyleProp<TextStyle>; estiloTexto?: StyleProp<TextStyle>;
}) {
  const { i18n } = useTranslation();
  const [refAberta, setRefAberta] = useState<RefBiblica | null>(null);

  const comLinks = (t: string) => segmentarReferencias(t).map((p, j) => p.ref ? (
    <Text key={j} style={s.refLink} onPress={() => setRefAberta(p.ref!)}>{p.texto}</Text>
  ) : p.texto);

  return (
    <View>
      {!!referencia && <Text style={estiloReferencia}>{comLinks(referencia)}</Text>}
      {blocos(texto).map((b, i) => b.tipo === 'h' ? (
        <Text key={i} style={s.rotulo}>{b.texto}</Text>
      ) : (
        <Text key={i} style={[estiloTexto, i > 0 && s.entre]}>{comLinks(b.texto)}</Text>
      ))}
      <LeitorModal
        livro={refAberta ? TODOS_LIVROS[refAberta.livro] ?? null : null}
        versao={versaoPadraoDoIdioma(i18n.language)}
        capInicial={refAberta?.capitulo}
        destaque={refAberta?.versos}
        onClose={() => setRefAberta(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  rotulo: {
    fontSize: 11, fontWeight: '800', color: '#F5C842', letterSpacing: 1,
    textTransform: 'uppercase', marginTop: 14, marginBottom: -4,
  },
  entre: { marginTop: 8 },
  refLink: {
    color: '#F5C842', fontWeight: '700',
    backgroundColor: 'rgba(245,200,66,0.14)',
    textDecorationLine: 'underline', textDecorationColor: 'rgba(245,200,66,0.5)',
  },
});
