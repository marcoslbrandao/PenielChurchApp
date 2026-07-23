import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';

const C = {
  bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
  border: '#E5E0D8', primary: '#1A1740', accent: '#C8960A',
  text: '#1A1A2E', textMuted: '#6B7280', textDim: '#9CA3AF',
};

type Designacao = {
  id: string;
  data: string;
  area_id: string;
  membro_id: string;
  escala_areas: { nome: string } | null;
  members: { nome: string; sobrenome: string } | null;
};

function formatDataLonga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

export default function EscalasScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<'minha' | 'geral'>('minha');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [meuMembroId, setMeuMembroId] = useState<string | null | undefined>(undefined); // undefined = ainda carregando
  const [designacoes, setDesignacoes] = useState<Designacao[]>([]);

  const fetchDados = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const hoje = new Date().toISOString().slice(0, 10);

    const [{ data: meuMembro }, { data: desigs }] = await Promise.all([
      supabase.from('members').select('id').eq('profile_id', user.id).maybeSingle(),
      supabase
        .from('escala_designacoes')
        .select('id, data, area_id, membro_id, escala_areas(nome), members(nome, sobrenome)')
        .gte('data', hoje)
        .order('data', { ascending: true }),
    ]);

    setMeuMembroId(meuMembro?.id ?? null);
    setDesignacoes((desigs as any) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { fetchDados(); }, [fetchDados]);

  const onRefresh = () => { setRefreshing(true); fetchDados(); };

  const minhasDesignacoes = designacoes.filter(d => d.membro_id === meuMembroId);

  const porData = designacoes.reduce((acc: Record<string, Designacao[]>, d) => {
    (acc[d.data] ??= []).push(d);
    return acc;
  }, {});
  const datasOrdenadas = Object.keys(porData).sort();

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />
      <View style={s.header}>
        <Text style={s.headerTitle}>{t('escalas.titulo')}</Text>
      </View>

      <View style={s.tabs}>
        <TouchableOpacity style={[s.tabBtn, tab === 'minha' && s.tabBtnActive]} onPress={() => setTab('minha')}>
          <Text style={[s.tabBtnText, tab === 'minha' && s.tabBtnTextActive]}>{t('escalas.minhaEscala')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, tab === 'geral' && s.tabBtnActive]} onPress={() => setTab('geral')}>
          <Text style={[s.tabBtnText, tab === 'geral' && s.tabBtnTextActive]}>{t('escalas.escalaGeral')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {tab === 'minha' ? (
          meuMembroId === null ? (
            <View style={s.emptyCard}>
              <Ionicons name="link-outline" size={28} color={C.textDim} />
              <Text style={s.emptyTitle}>{t('escalas.semVinculoTitulo')}</Text>
              <Text style={s.emptyMsg}>{t('escalas.semVinculoMsg')}</Text>
            </View>
          ) : minhasDesignacoes.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="calendar-outline" size={28} color={C.textDim} />
              <Text style={s.emptyMsg}>{t('escalas.semDesignacoesMinha')}</Text>
            </View>
          ) : (
            minhasDesignacoes.map(d => (
              <View key={d.id} style={s.card}>
                <View style={s.cardIcon}>
                  <Ionicons name="calendar" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardData}>{formatDataLonga(d.data)}</Text>
                  <Text style={s.cardArea}>{d.escala_areas?.nome ?? ''}</Text>
                </View>
              </View>
            ))
          )
        ) : datasOrdenadas.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="calendar-outline" size={28} color={C.textDim} />
            <Text style={s.emptyMsg}>{t('escalas.semDesignacoesGeral')}</Text>
          </View>
        ) : (
          datasOrdenadas.map(data => (
            <View key={data} style={s.dataGroup}>
              <Text style={s.dataGroupTitle}>{formatDataLonga(data)}</Text>
              <View style={s.card}>
                {porData[data].map((d, idx) => (
                  <View key={d.id} style={[s.areaRow, idx > 0 && s.areaRowBorder]}>
                    <Text style={s.areaRowNome}>{d.escala_areas?.nome ?? ''}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.areaRowPessoa}>{d.members ? `${d.members.nome} ${d.members.sobrenome ?? ''}` : ''}</Text>
                      {d.membro_id === meuMembroId && (
                        <View style={s.voceBadge}><Text style={s.voceBadgeText}>{t('escalas.voceBadge')}</Text></View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: C.surfaceAlt, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  tabBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  tabBtnTextActive: { color: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  emptyCard: { alignItems: 'center', gap: 8, padding: 30, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginTop: 20 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'center' },
  emptyMsg: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12, overflow: 'hidden' },
  cardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', margin: 12 },
  cardData: { fontSize: 15, fontWeight: '700', color: C.text, textTransform: 'capitalize' },
  cardArea: { fontSize: 13, color: C.accent, fontWeight: '600', marginTop: 2 },
  dataGroup: { marginBottom: 16 },
  dataGroupTitle: { fontSize: 13, fontWeight: '700', color: C.text, textTransform: 'capitalize', marginBottom: 8, marginLeft: 4 },
  areaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  areaRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  areaRowNome: { fontSize: 13, color: C.textMuted, fontWeight: '600', flex: 1 },
  areaRowPessoa: { fontSize: 14, color: C.text, fontWeight: '600' },
  voceBadge: { backgroundColor: C.accent + '22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  voceBadgeText: { fontSize: 10, fontWeight: '800', color: C.accent },
});
