import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useCampoTraduzido } from '../lib/useTraducao';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Tela "Devocionais" — mostra só UM destino por vez, não tudo junto:
// - aberta pela Home (sem parâmetro) → só os devocionais Geral (grupo NULL).
// - aberta de dentro de um grupo (com `route.params.grupo`) → só os
//   devocionais daquele grupo específico.
// A RLS de `devocionais` já garante que só vem o que a conta tem acesso
// (15ª rodada: Geral ficou público pra todo mundo, logado ou não; grupo
// continua exigindo login + acesso ao grupo) — o filtro de `grupo` aqui é
// só pra não misturar os destinos na mesma lista (antes vinha tudo junto:
// Geral + todos os grupos da pessoa, o que o Marcos não queria).
type Devocional = {
  id: string;
  titulo: string;
  versiculo: string;
  referencia: string;
  texto: string;
  data: string;
  grupo: string | null;
};

const GRUPO_LABEL_KEY: Record<string, string> = {
  homens: 'grupos.tabHomens',
  mulheres: 'grupos.tabMulheres',
  jovens: 'grupos.tabAlive',
  estudo_biblico: 'grupos.tabEstudoBiblico',
};

function DevocionalItem({ dev, aberto, onToggle }: { dev: Devocional; aberto: boolean; onToggle: () => void }) {
  const { i18n } = useTranslation();
  const titulo = useCampoTraduzido(dev.titulo, 'devocionais', dev.id, 'titulo');
  const versiculo = useCampoTraduzido(dev.versiculo, 'devocionais', dev.id, 'versiculo');
  const referencia = useCampoTraduzido(dev.referencia, 'devocionais', dev.id, 'referencia');
  const texto = useCampoTraduzido(dev.texto, 'devocionais', dev.id, 'texto');
  const locale = i18n.language === 'pt' ? 'pt-BR' : i18n.language;
  const dataLabel = new Date(dev.data).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onToggle}>
      <View style={styles.cardHeader}>
        <View style={styles.icone}>
          <Ionicons name="book" size={16} color="#F5C842" />
        </View>
        <View style={{ flex: 1 }}>
          {/* Destino não aparece mais aqui — a tela inteira já é sempre de
              um destino só (Geral ou o grupo escolhido), ver header. */}
          <Text style={styles.data}>{dataLabel}</Text>
          <Text style={styles.titulo}>{titulo}</Text>
        </View>
        <Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color="rgba(255,255,255,0.4)" />
      </View>
      {aberto && (
        <View style={styles.body}>
          <Text style={styles.versiculo}>"{versiculo}"</Text>
          <Text style={styles.referencia}>{referencia}</Text>
          <Text style={styles.texto}>{texto}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function DevocionaisScreen({ navigation, route }: { navigation?: any; route?: any }) {
  const { t } = useTranslation();
  // Sem `route.params.grupo` → Geral (grupo IS NULL, o que aparece na Home).
  // Com `route.params.grupo` (ex.: 'homens') → só os devocionais daquele
  // grupo, aberto a partir da tela do grupo (GruposScreen).
  const grupoFiltro: string | null = route?.params?.grupo ?? null;
  const [devocionais, setDevocionais] = useState<Devocional[]>([]);
  const [loading, setLoading] = useState(true);
  const [abertoId, setAbertoId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    let query = supabase
      .from('devocionais')
      .select('id, titulo, versiculo, referencia, texto, data, grupo')
      .order('data', { ascending: false });
    query = grupoFiltro ? query.eq('grupo', grupoFiltro) : query.is('grupo', null);
    query.then(({ data }) => {
      setDevocionais((data as Devocional[]) ?? []);
      setLoading(false);
    });
  }, [grupoFiltro]);

  const subtitulo = grupoFiltro ? t(GRUPO_LABEL_KEY[grupoFiltro] ?? grupoFiltro) : t('devocionais.geral');

  // `paddingTop` fixo em 55 dava um respiro engraçado em aparelho sem
  // entalhe e apertava o título contra o relógio nos iPhone mais novos. A
  // área segura é a medida real do aparelho.
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.headerTitulo}>{t('devocionais.titulo')}</Text>
          <Text style={styles.headerSubtitulo}>{subtitulo}</Text>
        </View>
        {navigation && (
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#F5C842" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {devocionais.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={40} color="rgba(255,255,255,0.25)" />
              <Text style={styles.emptyTexto}>{t('devocionais.nenhumDevocional')}</Text>
            </View>
          ) : (
            devocionais.map(dev => (
              <DevocionalItem
                key={dev.id}
                dev={dev}
                aberto={abertoId === dev.id}
                onToggle={() => setAbertoId(abertoId === dev.id ? null : dev.id)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0B22' },
  header: {
    backgroundColor: '#1A1740', paddingBottom: 16, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitulo: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSubtitulo: { fontSize: 12, color: '#F5C842', marginTop: 2, fontWeight: '600' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 18, paddingBottom: 40 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyTexto: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center' },
  card: {
    backgroundColor: '#241D5C', borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(245,200,66,0.2)',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icone: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(245,200,66,0.15)', alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { fontSize: 10, fontWeight: '700', color: '#F5C842', textTransform: 'uppercase', letterSpacing: 0.5 },
  data: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  titulo: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 2 },
  body: { marginTop: 14, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.1)' },
  versiculo: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', lineHeight: 20 },
  referencia: { fontSize: 11, fontWeight: '700', color: '#F5C842', marginTop: 6 },
  texto: { fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 20, marginTop: 10 },
});
