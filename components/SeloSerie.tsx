// Selo de serie do devocional (03/11/2026, pedido do Marcos: deixar evidente
// na capa que o devocional faz parte de uma serie).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const OURO = '#F5C842';
const TINTA = '#1A1740';

export function textoOrdem(t: (k: string, o?: any) => string, ordem?: number | null, total?: number | null) {
  if (!ordem) return '';
  return total ? t('devocionais.nDeTotal', { n: ordem, total }) : `#${ordem}`;
}

// Os dois selos por cima da foto: "Serie · Nome" a esquerda e "1 de 12" a direita.
export function SeloSerieSobreFoto({ titulo, ordem, total }: { titulo: string; ordem?: number | null; total?: number | null }) {
  const { t } = useTranslation();
  const ordemTxt = textoOrdem(t, ordem, total);
  return (
    <>
      <View style={[s.pill, s.esquerda]}>
        <Ionicons name="library" size={11} color={TINTA} />
        <Text style={s.pillTexto} numberOfLines={1}>{t('devocionais.serie')} · {titulo}</Text>
      </View>
      {!!ordemTxt && (
        <View style={[s.pill, s.direita]}>
          <Text style={s.pillTexto}>{ordemTxt}</Text>
        </View>
      )}
    </>
  );
}

// Versao em linha, para devocional sem foto.
export function SeloSerieLinha({ titulo, ordem, total }: { titulo: string; ordem?: number | null; total?: number | null }) {
  const { t } = useTranslation();
  const ordemTxt = textoOrdem(t, ordem, total);
  return (
    <View style={s.linha}>
      <View style={s.pill}>
        <Ionicons name="library" size={11} color={TINTA} />
        <Text style={s.pillTexto} numberOfLines={1}>{t('devocionais.serie')} · {titulo}</Text>
      </View>
      {!!ordemTxt && <Text style={s.ordemLinha}>{ordemTxt}</Text>}
    </View>
  );
}

// Barrinha de progresso: um traco por devocional da serie, preenchido ate o atual.
export function ProgressoSerie({ ordem, total }: { ordem?: number | null; total?: number | null }) {
  if (!ordem || !total || total < 2 || total > 40) return null;
  return (
    <View style={s.progresso}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.traco, { backgroundColor: i < ordem ? OURO : 'rgba(255,255,255,0.18)' }]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '70%',
    backgroundColor: OURO, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  esquerda: { position: 'absolute', top: 12, left: 12 },
  direita: { position: 'absolute', top: 12, right: 12 },
  pillTexto: { fontSize: 11, fontWeight: '800', color: TINTA },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  ordemLinha: { fontSize: 11, fontWeight: '700', color: OURO },
  progresso: { flexDirection: 'row', gap: 3, marginTop: 8 },
  traco: { flex: 1, height: 4, borderRadius: 2 },
});
