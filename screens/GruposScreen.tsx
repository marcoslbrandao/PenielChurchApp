import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, ActivityIndicator, RefreshControl, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
  border: '#E5E0D8', primary: '#1A1740', text: '#1A1A2E',
  textMuted: '#6B7280', textDim: '#9CA3AF',
  danger: '#C0392B', success: '#27AE60',
  mulheres: '#D63A8A', mulheresDim: '#FCE4F3',
  homens: '#1A6FC4', homensDim: '#E3F0FC',
  jovens: '#6C3DE8', jovensDim: '#EDE8FF',
};

type Tab = 'mulheres' | 'homens' | 'jovens';

type GrupoEvento = {
  id: string;
  titulo: string;
  descricao: string;
  data: string;
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
  data: string;
};

// ─── Config dos grupos ────────────────────────────────────────────────────────
const GRUPOS = {
  mulheres: {
    nome: 'Grupo de Mulheres',
    subtitulo: 'Mulheres de Fé',
    icon: 'flower-outline' as const,
    cor: C.mulheres,
    corDim: C.mulheresDim,
    descricao: 'Um espaço de comunhão, oração e crescimento para as mulheres da Peniel Church.',
    whatsapp: '447540880456',
    mensagemWA: 'Olá! Quero saber mais sobre o Grupo de Mulheres da Peniel Church.',
  },
  homens: {
    nome: 'Grupo de Homens',
    subtitulo: 'Homens de Propósito',
    icon: 'shield-outline' as const,
    cor: C.homens,
    corDim: C.homensDim,
    descricao: 'Um grupo para homens que desejam crescer na fé, no propósito e na liderança.',
    whatsapp: '447540880456',
    mensagemWA: 'Olá! Quero saber mais sobre o Grupo de Homens da Peniel Church.',
  },
  jovens: {
    nome: 'Peniel Alive',
    subtitulo: 'Ministério de Jovens',
    icon: 'flame-outline' as const,
    cor: C.jovens,
    corDim: C.jovensDim,
    descricao: 'O ministério de jovens da Peniel Church — cheio de vida, propósito e fé!',
    whatsapp: '447540880456',
    mensagemWA: 'Olá! Quero saber mais sobre o Peniel Alive.',
  },
};

// ─── Eventos mock (futuramente do Supabase) ───────────────────────────────────
const EVENTOS_MOCK: Record<Tab, GrupoEvento[]> = {
  mulheres: [
    { id: '1', titulo: 'Encontro de Mulheres', descricao: 'Tarde de oração e comunhão entre as mulheres da igreja.', data: 'Sábado, 21 Jun', horario: '16h00', local: 'Templo Principal', tipo: 'presencial' },
    { id: '2', titulo: 'Estudo Bíblico — Mulheres', descricao: 'Estudo sobre mulheres da Bíblia e seu papel no reino de Deus.', data: 'Quinta, 19 Jun', horario: '20h00', local: 'Zoom', tipo: 'online' },
  ],
  homens: [
    { id: '1', titulo: 'Café da Manhã dos Homens', descricao: 'Café, comunhão e palavra para os homens da igreja.', data: 'Sábado, 21 Jun', horario: '09h00', local: 'Sala de Reuniões', tipo: 'presencial' },
    { id: '2', titulo: 'Estudo — Homens de Deus', descricao: 'Estudo sobre liderança e propósito para os homens.', data: 'Terça, 17 Jun', horario: '20h00', local: 'Zoom', tipo: 'online' },
  ],
  jovens: [
    { id: '1', titulo: 'Peniel Alive — Sábado', descricao: 'Encontro semanal dos jovens com louvor, palavra e comunhão.', data: 'Sábado, 21 Jun', horario: '19h00', local: 'Nas casas', tipo: 'casa' },
    { id: '2', titulo: 'Ensaio da Banda', descricao: 'Ensaio do grupo de louvor dos jovens.', data: 'Sexta, 20 Jun', horario: '18h00', local: 'Templo Principal', tipo: 'presencial' },
  ],
};

const DEVOCIONAIS_MOCK: Record<Tab, GrupoDevocional[]> = {
  mulheres: [
    { id: '1', titulo: 'A Mulher que Perseverou', versiculo: 'A mulher virtuosa, quem a achará? O seu valor muito excede ao de rubis.', referencia: 'Provérbios 31:10', texto: 'Deus criou a mulher com um propósito único e especial. Seja qual for a temporada da sua vida, você tem valor imensurado aos olhos de Deus.', data: '10 Jun 2026' },
  ],
  homens: [
    { id: '1', titulo: 'Seja Forte e Corajoso', versiculo: 'Sede fortes e corajosos. Não temais, nem vos assusteis diante deles; porque o Senhor teu Deus é o que vai contigo.', referencia: 'Deuteronômio 31:6', texto: 'Todo homem enfrenta momentos de dúvida e fraqueza. Mas a Palavra de Deus nos chama a uma coragem que não vem de nós mesmos, mas do Senhor.', data: '10 Jun 2026' },
  ],
  jovens: [
    { id: '1', titulo: 'Jovem, Você Tem Propósito', versiculo: 'Não deixe ninguém desprezar a sua juventude, mas seja um exemplo para os fiéis.', referencia: '1 Timóteo 4:12', texto: 'A sua idade não é um obstáculo — é uma vantagem. Deus usa os jovens para transformar gerações. Não espere crescer para servir a Deus: comece agora!', data: '10 Jun 2026' },
  ],
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function GruposScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('mulheres');
  const [expandedDev, setExpandedDev] = useState<string | null>(null);

  const grupo = GRUPOS[activeTab];
  const eventos = EVENTOS_MOCK[activeTab];
  const devocionais = DEVOCIONAIS_MOCK[activeTab];

  const openWhatsApp = () => {
    const url = `https://wa.me/${grupo.whatsapp}?text=${encodeURIComponent(grupo.mensagemWA)}`;
    Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.'));
  };

  const tipoTag = (tipo: string) => {
    switch (tipo) {
      case 'presencial': return { bg: '#EEEDFE', text: '#534AB7', label: 'Presencial' };
      case 'online':     return { bg: '#E1F5EE', text: '#085041', label: 'Online'     };
      case 'casa':       return { bg: '#FEF6DC', text: '#633806', label: 'Nas casas'  };
      default:           return { bg: '#F3F4F6', text: '#6B7280', label: tipo         };
    }
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'mulheres', label: 'Mulheres', icon: 'flower-outline'  },
    { id: 'homens',   label: 'Homens',   icon: 'shield-outline'  },
    { id: 'jovens',   label: 'Alive',    icon: 'flame-outline'   },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Grupos</Text>
          <Text style={s.headerSub}>Peniel Church</Text>
        </View>
        <TouchableOpacity style={[s.waBtn, { backgroundColor: grupo.cor + '20', borderColor: grupo.cor + '40' }]} onPress={openWhatsApp}>
          <Ionicons name="logo-whatsapp" size={16} color={grupo.cor} />
          <Text style={[s.waBtnText, { color: grupo.cor }]}>Contacto</Text>
        </TouchableOpacity>
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

      <ScrollView contentContainerStyle={s.scroll}>

        {/* Hero do grupo */}
        <View style={[s.heroCard, { backgroundColor: grupo.cor }]}>
          <View style={[s.heroIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name={grupo.icon} size={32} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heroNome}>{grupo.nome}</Text>
            <Text style={s.heroSub}>{grupo.subtitulo}</Text>
          </View>
        </View>
        <View style={[s.descricaoCard, { borderLeftColor: grupo.cor }]}>
          <Text style={s.descricaoTexto}>{grupo.descricao}</Text>
        </View>

        {/* Eventos */}
        <Text style={s.sectionLabel}>📅 Próximos Eventos</Text>
        {eventos.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>Nenhum evento agendado</Text>
          </View>
        ) : (
          eventos.map(evento => {
            const tag = tipoTag(evento.tipo);
            return (
              <View key={evento.id} style={s.eventoCard}>
                <View style={s.eventoTop}>
                  <Text style={s.eventoTitulo}>{evento.titulo}</Text>
                  <View style={[s.eventoTag, { backgroundColor: tag.bg }]}>
                    <Text style={[s.eventoTagText, { color: tag.text }]}>{tag.label}</Text>
                  </View>
                </View>
                <Text style={s.eventoDesc}>{evento.descricao}</Text>
                <View style={s.eventoMeta}>
                  <View style={s.eventoMetaItem}>
                    <Ionicons name="calendar-outline" size={13} color={C.textMuted} />
                    <Text style={s.eventoMetaText}>{evento.data}</Text>
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
          })
        )}

        {/* Devocionais */}
        <Text style={s.sectionLabel}>📖 Devocional do Grupo</Text>
        {devocionais.map(dev => {
          const isOpen = expandedDev === dev.id;
          return (
            <View key={dev.id} style={[s.devCard, isOpen && { borderColor: grupo.cor }]}>
              <TouchableOpacity style={s.devHeader} onPress={() => setExpandedDev(isOpen ? null : dev.id)} activeOpacity={0.8}>
                <View style={[s.devIcon, { backgroundColor: grupo.cor + '18' }]}>
                  <Ionicons name="book" size={16} color={grupo.cor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.devTitulo}>{dev.titulo}</Text>
                  <Text style={s.devRef}>{dev.referencia} · {dev.data}</Text>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
              </TouchableOpacity>
              {isOpen && (
                <View style={s.devBody}>
                  <View style={[s.versiculoBox, { borderLeftColor: grupo.cor }]}>
                    <Text style={s.versiculoText}>"{dev.versiculo}"</Text>
                    <Text style={[s.versiculoRef, { color: grupo.cor }]}>{dev.referencia}</Text>
                  </View>
                  <Text style={s.reflexaoText}>{dev.texto}</Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Botão de contacto */}
        <TouchableOpacity style={[s.contactBtn, { backgroundColor: grupo.cor }]} onPress={openWhatsApp}>
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          <Text style={s.contactBtnText}>Entrar em contacto com o líder</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
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
  // Contacto
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  contactBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 13, color: C.textMuted },
});
