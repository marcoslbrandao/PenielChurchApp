import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, RefreshControl, Modal, Alert,
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
  danger: '#DC2626', dangerBg: '#FEE2E2',
};

type Indisponivel = { id: string; data: string };

// Data de calendario LOCAL (nao `toISOString`, que converte pra UTC e no
// horario de verao britanico joga a meia-noite pro dia anterior).
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatarDDMMAAAA(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
// Ate onde o voluntario pode marcar: fim do 2o mes seguinte (em outubro, 31/12).
// O banco confere a mesma janela na policy de insert.
function limiteDaJanela(): string {
  const h = new Date();
  return isoLocal(new Date(h.getFullYear(), h.getMonth() + 3, 0));
}
function gradeDoMes(ano: number, mes: number): (string | null)[][] {
  const primeiro = new Date(ano, mes, 1).getDay();
  const dias = new Date(ano, mes + 1, 0).getDate();
  const celulas: (string | null)[] = Array(primeiro).fill(null);
  for (let d = 1; d <= dias; d++) celulas.push(isoLocal(new Date(ano, mes, d)));
  while (celulas.length % 7) celulas.push(null);
  const linhas: (string | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) linhas.push(celulas.slice(i, i + 7));
  return linhas;
}

// ─── Dias em que nao posso servir ─────────────────────────────────────────────
// Pedido do Marcos (16/10): o voluntario marca ANTES os dias em que nao vai
// estar, pra escala sair certa e nao ter troca depois de pronta. O gerador do
// Admin pula esses dias e o "Ver e editar escala" avisa o lider.
function IndisponibilidadeEscalaModal({ visible, onClose, marcados, designadosEm, onAlternar }: {
  visible: boolean; onClose: () => void;
  marcados: Indisponivel[];
  designadosEm: Record<string, string>; // data -> area em que ja estou escalado
  onAlternar: (dia: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const hoje = new Date();
  const [offset, setOffset] = useState(0); // 0 = mes atual, ate 2
  useEffect(() => { if (visible) setOffset(0); }, [visible]);
  const ano = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1).getFullYear();
  const mes = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1).getMonth();
  const semanas = useMemo(() => gradeDoMes(ano, mes), [ano, mes]);
  const hojeISO = isoLocal(hoje);
  const limite = limiteDaJanela();
  const set = new Set(marcados.map(m => m.data));
  const nomeMes = new Date(ano, mes, 1).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
  // Domingo primeiro, igual a grade.
  const letras = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 9, 18 + i).toLocaleDateString(i18n.language, { weekday: 'narrow' }));
  const meusDias = marcados.filter(m => m.data >= hojeISO).sort((a, b) => a.data.localeCompare(b.data));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={md.overlay}>
        <View style={md.sheet}>
          <View style={md.header}>
            <Text style={md.title}>{t('escalas.indisponivelTitulo')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
          </View>
          <Text style={md.explicacao}>{t('escalas.indisponivelDesc', { ate: formatarDDMMAAAA(limite) })}</Text>

          <View style={md.mesRow}>
            <TouchableOpacity onPress={() => setOffset(o => Math.max(0, o - 1))} disabled={offset === 0} hitSlop={10}>
              <Ionicons name="chevron-back" size={20} color={offset === 0 ? C.border : C.textMuted} />
            </TouchableOpacity>
            <Text style={md.mesTexto}>{nomeMes}</Text>
            <TouchableOpacity onPress={() => setOffset(o => Math.min(2, o + 1))} disabled={offset === 2} hitSlop={10}>
              <Ionicons name="chevron-forward" size={20} color={offset === 2 ? C.border : C.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={md.semana}>
            {letras.map((l, i) => <Text key={i} style={[md.letra, i === 0 && { color: C.accent }]}>{l}</Text>)}
          </View>

          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            {semanas.map((semana, si) => (
              <View key={si} style={md.semana}>
                {semana.map((dia, i) => {
                  if (!dia) return <View key={`v${i}`} style={md.celula} />;
                  const fora = dia < hojeISO || dia > limite;
                  const marcado = set.has(dia);
                  const domingo = i === 0;
                  return (
                    <TouchableOpacity
                      key={dia}
                      disabled={fora}
                      onPress={() => onAlternar(dia)}
                      activeOpacity={0.7}
                      style={[md.celula, marcado && md.celulaMarcada, fora && { opacity: 0.3 }]}
                    >
                      <Text style={[md.num, domingo && md.numDomingo, marcado && md.numMarcado, dia === hojeISO && { textDecorationLine: 'underline' }]}>
                        {Number(dia.slice(8))}
                      </Text>
                      {designadosEm[dia] && <View style={md.pontoEscalado} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            <Text style={md.legenda}>{t('escalas.indisponivelLegenda')}</Text>

            <Text style={md.listaTitulo}>{t('escalas.indisponivelMeusDias')}</Text>
            {meusDias.length === 0 ? (
              <Text style={md.vazio}>{t('escalas.indisponivelNenhum')}</Text>
            ) : meusDias.map(m => (
              <View key={m.id} style={md.listaRow}>
                <Text style={md.listaData}>{formatarDDMMAAAA(m.data)} · {formatDataLonga(m.data, i18n.language)}</Text>
                <TouchableOpacity onPress={() => onAlternar(m.data)} hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={20} color={C.danger} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ height: 16 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type Designacao = {
  id: string;
  data: string;
  area_id: string;
  membro_id: string;
  escala_areas: { nome: string } | null;
  members: { nome: string; sobrenome: string } | null;
};

function formatDataLonga(iso: string, lng = 'pt-BR'): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(lng, { weekday: 'long', day: '2-digit', month: 'long' });
}

export default function EscalasScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<'minha' | 'geral'>('minha');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [meuMembroId, setMeuMembroId] = useState<string | null | undefined>(undefined); // undefined = ainda carregando
  const [designacoes, setDesignacoes] = useState<Designacao[]>([]);
  const [souVoluntario, setSouVoluntario] = useState(false);
  const [indisponiveis, setIndisponiveis] = useState<Indisponivel[]>([]);
  const [indModalVisible, setIndModalVisible] = useState(false);

  const fetchDados = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const hoje = new Date().toISOString().slice(0, 10);

    // A consulta antiga trazia os nomes por embed (`members(nome, sobrenome)`),
    // e esse embed passa pela RLS de `members` — que desde 8/9 Set só abre
    // para o admin e para o próprio registro da pessoa. Resultado: a "Escala
    // Geral" carregava as datas e as áreas com a coluna da pessoa EM BRANCO,
    // sem erro nenhum. A RPC devolve só o nome, com a permissão checada
    // dentro dela (mesmo padrão de `participantes_do_grupo`).
    const [{ data: meuMembro }, { data: desigs }] = await Promise.all([
      supabase.from('members').select('id').eq('profile_id', user.id).maybeSingle(),
      supabase.rpc('escala_proximas_designacoes'),
    ]);

    setMeuMembroId(meuMembro?.id ?? null);
    if (meuMembro?.id) {
      const hojeLocal = isoLocal(new Date());
      const [{ data: vol }, { data: ind }] = await Promise.all([
        supabase.from('escala_area_voluntarios').select('id').eq('membro_id', meuMembro.id).limit(1),
        supabase.from('escala_indisponibilidade').select('id, data').eq('membro_id', meuMembro.id).gte('data', hojeLocal).order('data'),
      ]);
      setSouVoluntario((vol ?? []).length > 0);
      setIndisponiveis((ind ?? []) as Indisponivel[]);
    }
    setDesignacoes(((desigs ?? []) as any[]).map(d => ({
      id: d.id,
      data: d.data,
      area_id: d.area_id,
      membro_id: d.membro_id,
      escala_areas: { nome: d.area_nome },
      members: { nome: d.nome, sobrenome: d.sobrenome },
    })) as any);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { fetchDados(); }, [fetchDados]);

  const onRefresh = () => { setRefreshing(true); fetchDados(); };

  const minhasDesignacoes = designacoes.filter(d => d.membro_id === meuMembroId);
  const designadosEm: Record<string, string> = {};
  minhasDesignacoes.forEach(d => { designadosEm[d.data] = d.escala_areas?.nome ?? ''; });

  // Otimista: muda na tela na hora e desfaz se o banco recusar.
  const alternarDia = async (dia: string) => {
    if (!meuMembroId) return;
    const existente = indisponiveis.find(i => i.data === dia);
    const anterior = indisponiveis;
    if (existente) {
      setIndisponiveis(indisponiveis.filter(i => i.id !== existente.id));
      const { error } = await supabase.from('escala_indisponibilidade').delete().eq('id', existente.id);
      if (error) { setIndisponiveis(anterior); Alert.alert(t('common.erro'), error.message); }
      return;
    }
    const temp = { id: `tmp-${dia}`, data: dia };
    setIndisponiveis([...indisponiveis, temp]);
    const { data, error } = await supabase.from('escala_indisponibilidade')
      .insert({ membro_id: meuMembroId, data: dia }).select('id, data').single();
    if (error) { setIndisponiveis(anterior); Alert.alert(t('common.erro'), error.message); return; }
    setIndisponiveis(prev => prev.map(i => (i.id === temp.id ? (data as Indisponivel) : i)));
    // Ja estava escalado nesse dia: marcar nao tira da escala, o lider troca.
    if (designadosEm[dia]) {
      Alert.alert(
        t('escalas.indisponivelJaEscaladoTitulo'),
        t('escalas.indisponivelJaEscaladoMsg', { data: formatarDDMMAAAA(dia), area: designadosEm[dia] }),
      );
    }
  };

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
        {tab === 'minha' && meuMembroId && souVoluntario && (
          <TouchableOpacity style={s.indCard} onPress={() => setIndModalVisible(true)} activeOpacity={0.8}>
            <View style={[s.cardIcon, { backgroundColor: C.danger, margin: 0, marginRight: 12 }]}>
              <Ionicons name="calendar-clear-outline" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardData}>{t('escalas.indisponivelBotao')}</Text>
              <Text style={s.indSub}>
                {indisponiveis.length === 0
                  ? t('escalas.indisponivelBotaoVazio')
                  : t('escalas.indisponivelBotaoN', { count: indisponiveis.length })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.textDim} />
          </TouchableOpacity>
        )}
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
      <IndisponibilidadeEscalaModal
        visible={indModalVisible}
        onClose={() => setIndModalVisible(false)}
        marcados={indisponiveis}
        designadosEm={designadosEm}
        onAlternar={alternarDia}
      />
    </SafeAreaView>
  );
}

const md = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, maxHeight: '92%', flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', color: C.text, flex: 1, marginRight: 10 },
  explicacao: { fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 14 },
  mesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  mesTexto: { fontSize: 15, fontWeight: '700', color: C.text, textTransform: 'capitalize' },
  semana: { flexDirection: 'row' },
  letra: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: C.textDim, marginBottom: 6, textTransform: 'uppercase' },
  celula: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: 1 },
  celulaMarcada: { backgroundColor: C.dangerBg, borderWidth: 1, borderColor: C.danger },
  num: { fontSize: 14, color: C.text },
  numDomingo: { fontWeight: '800', color: C.primary },
  numMarcado: { color: C.danger, fontWeight: '800' },
  pontoEscalado: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent, marginTop: 3 },
  legenda: { fontSize: 11, color: C.textDim, marginTop: 10, lineHeight: 16 },
  listaTitulo: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 18, marginBottom: 6 },
  listaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  listaData: { fontSize: 13, color: C.text, textTransform: 'capitalize', flex: 1, marginRight: 8 },
  vazio: { fontSize: 12, color: C.textDim, marginTop: 4 },
});

const s = StyleSheet.create({
  indCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.danger + '55', padding: 12, marginBottom: 16 },
  indSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
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
