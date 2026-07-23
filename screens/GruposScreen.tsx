import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  StatusBar, ActivityIndicator, RefreshControl, Linking, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useCampoTraduzido } from '../lib/useTraducao';
import { useAuth } from '../lib/useAuth';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
  border: '#E5E0D8', primary: '#1A1740', text: '#1A1A2E',
  textMuted: '#6B7280', textDim: '#9CA3AF',
  danger: '#C0392B', success: '#27AE60',
  mulheres: '#D63A8A', mulheresDim: '#FCE4F3',
  homens: '#1A6FC4', homensDim: '#E3F0FC',
  // Mesmo lilás escuro do card "Peniel Alive" na Home
  jovens: '#4A1AA8', jovensDim: '#EDE4FB',
};

type Tab = 'mulheres' | 'homens' | 'jovens';

type GrupoEvento = {
  id: string;
  titulo: string;
  descricao: string;
  dataISO: string;
  horario: string;
  local: string;
  tipo: string;
};

type GrupoDevocional = {
  id: string;
  titulo: string;
  texto: string;
  versiculo: string;
  referencia: string;
  dataISO: string;
};

// ─── Config dos grupos ────────────────────────────────────────────────────────
function buildGrupos(t: (key: string) => string) {
  return {
    mulheres: {
      nome: t('grupos.mulheresNome'),
      subtitulo: t('grupos.mulheresSubtitulo'),
      icon: 'flower-outline' as const,
      cor: C.mulheres,
      corDim: C.mulheresDim,
      descricao: t('grupos.mulheresDescricao'),
      whatsapp: '447540880456',
      mensagemWA: 'Olá! Quero saber mais sobre o Grupo de Mulheres da Peniel Church.',
    },
    homens: {
      nome: t('grupos.homensNome'),
      subtitulo: t('grupos.homensSubtitulo'),
      icon: 'shield-outline' as const,
      cor: C.homens,
      corDim: C.homensDim,
      descricao: t('grupos.homensDescricao'),
      whatsapp: '447540880456',
      mensagemWA: 'Olá! Quero saber mais sobre o Grupo de Homens da Peniel Church.',
    },
    jovens: {
      nome: t('grupos.jovensNome'),
      subtitulo: t('grupos.jovensSubtitulo'),
      icon: 'flame-outline' as const,
      cor: C.jovens,
      corDim: C.jovensDim,
      descricao: t('grupos.jovensDescricao'),
      whatsapp: '447540880456',
      mensagemWA: 'Olá! Quero saber mais sobre o Peniel Alive.',
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const LOCALE_POR_IDIOMA: Record<string, string> = { pt: 'pt-BR', en: 'en-GB', es: 'es-ES', fr: 'fr-FR' };

function formatDataEvento(iso: string, lang: string = 'pt'): string {
  const locale = LOCALE_POR_IDIOMA[lang] ?? 'pt-BR';
  const d = new Date(`${iso}T00:00:00`);
  const texto = d.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'short' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
function formatDataDevocional(iso: string, lang: string = 'pt'): string {
  const locale = LOCALE_POR_IDIOMA[lang] ?? 'pt-BR';
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Card de evento do grupo — título e descrição (digitados pelo admin em
// português) traduzidos automaticamente pro idioma do app.
function GrupoEventoCard({ evento, tag }: {
  evento: GrupoEvento; tag: { bg: string; text: string; label: string };
}) {
  const { i18n } = useTranslation();
  const titulo = useCampoTraduzido(evento.titulo, 'grupo_eventos', evento.id, 'titulo');
  const descricao = useCampoTraduzido(evento.descricao, 'grupo_eventos', evento.id, 'descricao');
  const dataLabel = formatDataEvento(evento.dataISO, i18n.language);
  return (
    <View style={s.eventoCard}>
      <View style={s.eventoTop}>
        <Text style={s.eventoTitulo}>{titulo}</Text>
        <View style={[s.eventoTag, { backgroundColor: tag.bg }]}>
          <Text style={[s.eventoTagText, { color: tag.text }]}>{tag.label}</Text>
        </View>
      </View>
      <Text style={s.eventoDesc}>{descricao}</Text>
      <View style={s.eventoMeta}>
        <View style={s.eventoMetaItem}>
          <Ionicons name="calendar-outline" size={13} color={C.textMuted} />
          <Text style={s.eventoMetaText}>{dataLabel}</Text>
        </View>
        <View style={s.eventoMetaItem}>
          <Ionicons name="time-outline" size={13} color={C.textMuted} />
          <Text style={s.eventoMetaText}>{evento.horario}</Text>
        </View>
        <View style={s.eventoMetaItem}>
          <Ionicons name="location-outline" size={13} color={C.textMuted} />
          <Text style={s.eventoMetaText}>{evento.local}</Text>
        </View>
      </View>
    </View>
  );
}

// Card de devocional do grupo — título, referência, versículo e texto
// traduzidos automaticamente pro idioma do app.
function GrupoDevocionalCard({ dev, cor, isOpen, onToggle }: {
  dev: GrupoDevocional; cor: string; isOpen: boolean; onToggle: () => void;
}) {
  const { i18n } = useTranslation();
  const titulo = useCampoTraduzido(dev.titulo, 'devocionais', dev.id, 'titulo');
  const versiculo = useCampoTraduzido(dev.versiculo, 'devocionais', dev.id, 'versiculo');
  const referencia = useCampoTraduzido(dev.referencia, 'devocionais', dev.id, 'referencia');
  const texto = useCampoTraduzido(dev.texto, 'devocionais', dev.id, 'texto');
  const dataLabel = formatDataDevocional(dev.dataISO, i18n.language);
  return (
    <View style={[s.devCard, isOpen && { borderColor: cor }]}>
      <TouchableOpacity style={s.devHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={[s.devIcon, { backgroundColor: cor + '18' }]}>
          <Ionicons name="book" size={16} color={cor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.devTitulo}>{titulo}</Text>
          <Text style={s.devRef}>{referencia} · {dataLabel}</Text>
        </View>
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
      </TouchableOpacity>
      {isOpen && (
        <View style={s.devBody}>
          <View style={[s.versiculoBox, { borderLeftColor: cor }]}>
            <Text style={s.versiculoText}>"{versiculo}"</Text>
            <Text style={[s.versiculoRef, { color: cor }]}>{referencia}</Text>
          </View>
          <Text style={s.reflexaoText}>{texto}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Gestão de Participantes (só líder do grupo ou admin) ────────────────────
type Participante = { id: string; membro_id: string; nome: string; sobrenome: string };
type MembroBusca = { id: string; nome: string; sobrenome: string; telefone: string };

function GerenciarParticipantesModal({ visible, grupo, grupoNome, cor, onClose }: {
  visible: boolean; grupo: Tab; grupoNome: string; cor: string; onClose: () => void;
}) {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<MembroBusca[]>([]);
  const [buscando, setBuscando] = useState(false);

  const fetchParticipantes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('grupo_membros')
      .select('id, membro_id, members(nome, sobrenome)')
      .eq('grupo', grupo);
    setParticipantes(((data ?? []) as any[]).map(row => ({
      id: row.id,
      membro_id: row.membro_id,
      nome: row.members?.nome ?? '',
      sobrenome: row.members?.sobrenome ?? '',
    })).sort((a, b) => a.nome.localeCompare(b.nome)));
    setLoading(false);
  }, [grupo]);

  useEffect(() => {
    if (visible) { fetchParticipantes(); setQuery(''); setResultados([]); }
  }, [visible, fetchParticipantes]);

  useEffect(() => {
    if (query.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    const t = setTimeout(() => {
      supabase.from('members').select('id, nome, sobrenome, telefone')
        .or(`nome.ilike.%${query.trim()}%,sobrenome.ilike.%${query.trim()}%`)
        .limit(10)
        .then(({ data }) => {
          const jaAdicionados = new Set(participantes.map(p => p.membro_id));
          setResultados(((data ?? []) as MembroBusca[]).filter(m => !jaAdicionados.has(m.id)));
          setBuscando(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query, participantes]);

  const adicionar = async (membro: MembroBusca) => {
    const { error } = await supabase.from('grupo_membros').insert({ membro_id: membro.id, grupo });
    if (error) { Alert.alert('Erro', error.message); return; }
    setQuery(''); setResultados([]);
    fetchParticipantes();
  };

  const remover = (participante: Participante) => {
    Alert.alert('Remover do grupo', `Remover ${participante.nome} ${participante.sobrenome} do grupo ${grupoNome}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await supabase.from('grupo_membros').delete().eq('id', participante.id);
        fetchParticipantes();
      }},
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={gm.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '85%' }}>
          <View style={gm.sheet}>
            <View style={gm.header}>
              <Text style={gm.title}>Participantes — {grupoNome}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={gm.searchRow}>
              <Ionicons name="search-outline" size={16} color={C.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={gm.searchInput}
                placeholder="Buscar no diretório pra adicionar..."
                placeholderTextColor={C.textDim}
                value={query}
                onChangeText={setQuery}
              />
              {buscando && <ActivityIndicator size="small" color={cor} />}
            </View>

            {resultados.length > 0 && (
              <View style={gm.resultsBox}>
                {resultados.map(m => (
                  <TouchableOpacity key={m.id} style={gm.resultRow} onPress={() => adicionar(m)}>
                    <View style={{ flex: 1 }}>
                      <Text style={gm.resultNome}>{m.nome} {m.sobrenome}</Text>
                      {!!m.telefone && <Text style={gm.resultMeta}>{m.telefone}</Text>}
                    </View>
                    <Ionicons name="add-circle" size={22} color={cor} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={gm.listLabel}>No grupo ({participantes.length})</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
              {loading ? (
                <ActivityIndicator color={cor} style={{ marginVertical: 20 }} />
              ) : participantes.length === 0 ? (
                <Text style={gm.emptyText}>Ninguém adicionado ainda.</Text>
              ) : (
                participantes.map(p => (
                  <View key={p.id} style={gm.participanteRow}>
                    <Text style={gm.participanteNome}>{p.nome} {p.sobrenome}</Text>
                    <TouchableOpacity onPress={() => remover(p)}>
                      <Ionicons name="trash-outline" size={18} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
              <View style={{ height: 10 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const gm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '800', color: C.text, flex: 1, marginRight: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, height: 46, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 15, color: C.text },
  resultsBox: { marginTop: 8, marginBottom: 8, borderWidth: 1, borderColor: C.border, borderRadius: 10, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surfaceAlt },
  resultNome: { fontSize: 14, fontWeight: '600', color: C.text },
  resultMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  listLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingVertical: 20 },
  participanteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  participanteNome: { fontSize: 14, color: C.text },
});

// ─── Componente principal ─────────────────────────────────────────────────────
export default function GruposScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const GRUPOS = buildGrupos(t);
  const [activeTab, setActiveTab] = useState<Tab>('homens');
  const [expandedDev, setExpandedDev] = useState<string | null>(null);
  const [eventos, setEventos] = useState<GrupoEvento[]>([]);
  const [devocionais, setDevocionais] = useState<GrupoDevocional[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [gruposLiderados, setGruposLiderados] = useState<Tab[]>([]);
  const [participantesModalVisible, setParticipantesModalVisible] = useState(false);

  const grupo = GRUPOS[activeTab];
  const souLiderDesteGrupo = isAdmin || gruposLiderados.includes(activeTab);

  // Verifica se o usuário é admin ou líder de algum grupo, pra mostrar o
  // botão de gerenciar participantes só pra quem tem permissão.
  useEffect(() => {
    if (!user) { setIsAdmin(false); setGruposLiderados([]); return; }
    supabase.from('profiles').select('role').eq('id', user.id).single()
      .then(({ data }) => setIsAdmin(data?.role === 'admin'));
    supabase.from('group_leaders').select('grupo').eq('profile_id', user.id)
      .then(({ data }) => setGruposLiderados(((data ?? []) as { grupo: Tab }[]).map(r => r.grupo)));
  }, [user]);

  const fetchGrupoData = useCallback(async (tab: Tab, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const hoje = new Date().toISOString().slice(0, 10);
    const [{ data: eventosData }, { data: devData }] = await Promise.all([
      supabase.from('grupo_eventos').select('*').eq('grupo', tab).gte('data', hoje).order('data', { ascending: true }),
      supabase.from('devocionais').select('*').eq('grupo', tab).order('data', { ascending: false }).limit(5),
    ]);

    setEventos((eventosData ?? []).map((e: any) => ({
      id: e.id, titulo: e.titulo, descricao: e.descricao ?? '',
      dataISO: e.data, horario: e.horario, local: e.local, tipo: e.tipo,
    })));
    setDevocionais((devData ?? []).map((d: any) => ({
      id: d.id, titulo: d.titulo, texto: d.texto, versiculo: d.versiculo,
      referencia: d.referencia, dataISO: d.data,
    })));

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchGrupoData(activeTab); }, [activeTab, fetchGrupoData]);

  const openWhatsApp = () => {
    const url = `https://wa.me/${grupo.whatsapp}?text=${encodeURIComponent(grupo.mensagemWA)}`;
    Linking.openURL(url).catch(() => Alert.alert(t('common.erro'), t('grupos.erroWhatsapp')));
  };

  const tipoTag = (tipo: string) => {
    switch (tipo) {
      case 'presencial': return { bg: '#EEEDFE', text: '#534AB7', label: t('grupos.tagPresencial') };
      case 'online':     return { bg: '#E1F5EE', text: '#085041', label: t('grupos.tagOnline')     };
      case 'casa':       return { bg: '#FEF6DC', text: '#633806', label: t('grupos.tagCasa')        };
      default:           return { bg: '#F3F4F6', text: '#6B7280', label: tipo                       };
    }
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'homens',   label: t('grupos.tabHomens'),   icon: 'shield-outline'  },
    { id: 'mulheres', label: t('grupos.tabMulheres'), icon: 'flower-outline'  },
    { id: 'jovens',   label: t('grupos.tabAlive'),    icon: 'flame-outline'   },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>{t('grupos.titulo')}</Text>
          <Text style={s.headerSub}>Peniel Church</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {souLiderDesteGrupo && (
            <TouchableOpacity
              style={[s.waBtn, { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' }]}
              onPress={() => setParticipantesModalVisible(true)}
            >
              <Ionicons name="people-outline" size={16} color="#fff" />
              <Text style={[s.waBtnText, { color: '#fff' }]}>Participantes</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.waBtn, { backgroundColor: grupo.cor + '20', borderColor: grupo.cor + '40' }]} onPress={openWhatsApp}>
            <Ionicons name="logo-whatsapp" size={16} color={grupo.cor} />
            <Text style={[s.waBtnText, { color: grupo.cor }]}>{t('grupos.contato')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[s.tabItem, activeTab === tab.id && { borderBottomWidth: 2, borderBottomColor: GRUPOS[tab.id].cor }]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons name={tab.icon as any} size={17} color={activeTab === tab.id ? GRUPOS[tab.id].cor : C.textMuted} />
            <Text style={[s.tabLabel, activeTab === tab.id && { color: GRUPOS[tab.id].cor, fontWeight: '700' }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchGrupoData(activeTab, true)} tintColor={grupo.cor} />}
      >

        {/* Hero do grupo */}
        <View style={[s.heroCard, { backgroundColor: grupo.cor }]}>
          {activeTab === 'jovens' ? (
            <Image
              source={require('../assets/PenielAlive-Logo.jpg')}
              style={s.heroLogo}
              resizeMode="cover"
            />
          ) : (
            <View style={[s.heroIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name={grupo.icon} size={32} color="#fff" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.heroNome}>{grupo.nome}</Text>
            <Text style={s.heroSub}>{grupo.subtitulo}</Text>
          </View>
        </View>
        <View style={[s.descricaoCard, { borderLeftColor: grupo.cor }]}>
          <Text style={s.descricaoTexto}>{grupo.descricao}</Text>
        </View>

        {/* Eventos */}
        <Text style={s.sectionLabel}>{t('grupos.proximosEventos')}</Text>
        {loading ? (
          <ActivityIndicator color={grupo.cor} style={{ marginVertical: 20 }} />
        ) : eventos.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>{t('grupos.nenhumEventoAgendado')}</Text>
          </View>
        ) : (
          eventos.map(evento => (
            <GrupoEventoCard key={evento.id} evento={evento} tag={tipoTag(evento.tipo)} />
          ))
        )}

        {/* Devocionais */}
        <Text style={s.sectionLabel}>{t('grupos.devocionalGrupo')}</Text>
        {!loading && devocionais.length === 0 && (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>{t('grupos.nenhumDevocionalAinda')}</Text>
          </View>
        )}
        {devocionais.map(dev => (
          <GrupoDevocionalCard
            key={dev.id}
            dev={dev}
            cor={grupo.cor}
            isOpen={expandedDev === dev.id}
            onToggle={() => setExpandedDev(expandedDev === dev.id ? null : dev.id)}
          />
        ))}

        {/* Botão de contato */}
        <TouchableOpacity style={[s.contactBtn, { backgroundColor: grupo.cor }]} onPress={openWhatsApp}>
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          <Text style={s.contactBtnText}>{t('grupos.entrarContatoLider')}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      <GerenciarParticipantesModal
        visible={participantesModalVisible}
        grupo={activeTab}
        grupoNome={grupo.nome}
        cor={grupo.cor}
        onClose={() => setParticipantesModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: C.primary },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 },
  waBtnText: { fontSize: 12, fontWeight: '700' },
  tabBar: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabLabel: { fontSize: 11, color: C.textMuted, fontWeight: '500' },
  scroll: { padding: 16, paddingBottom: 32 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10, marginTop: 8 },
  // Hero
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 18, marginBottom: 0 },
  heroIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroLogo: { width: 56, height: 56, borderRadius: 14 },
  heroNome: { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  descricaoCard: { backgroundColor: C.surface, borderRadius: 0, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: 14, marginBottom: 20, borderLeftWidth: 3, borderWidth: 1, borderColor: C.border },
  descricaoTexto: { fontSize: 13, color: C.textMuted, lineHeight: 20 },
  // Eventos
  eventoCard: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  eventoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  eventoTitulo: { fontSize: 14, fontWeight: '700', color: C.text, flex: 1 },
  eventoTag: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  eventoTagText: { fontSize: 10, fontWeight: '600' },
  eventoDesc: { fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 10 },
  eventoMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  eventoMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventoMetaText: { fontSize: 11, color: C.textMuted },
  // Devocionais
  devCard: { backgroundColor: C.surface, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  devHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  devIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  devTitulo: { fontSize: 14, fontWeight: '700', color: C.text },
  devRef: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  devBody: { paddingHorizontal: 14, paddingBottom: 14 },
  versiculoBox: { borderLeftWidth: 3, paddingLeft: 12, marginBottom: 10 },
  versiculoText: { fontSize: 13, color: C.text, fontStyle: 'italic', lineHeight: 20 },
  versiculoRef: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  reflexaoText: { fontSize: 13, color: C.textMuted, lineHeight: 20 },
  // Contato
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  contactBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 13, color: C.textMuted },
});
