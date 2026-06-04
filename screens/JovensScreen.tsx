import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, StatusBar, Linking, Image,
  ActivityIndicator, RefreshControl, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/useAuth';
import { supabase } from '../lib/supabase';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#0A0A14',
  surface: '#13131F',
  surfaceHigh: '#1C1C2E',
  border: '#252538',
  primary: '#6C3DE8',       // roxo jovem
  primaryDim: '#2D1870',
  secondary: '#E84B3D',     // vermelho vibrante
  secondaryDim: '#3D0D09',
  accent: '#F5C842',
  accentDim: '#3D3009',
  green: '#1DB954',
  greenDim: '#0D3D1E',
  text: '#F0F0FA',
  textMuted: '#8A8A9E',
  textDim: '#3A3A55',
};

type Tab = 'eventos' | 'devocional' | 'chat' | 'louvor';

// ─── Types ────────────────────────────────────────────────────────────────────
type Evento = {
  id: string; title: string; date: string; dayNum: string;
  month: string; day: string; time: string; local: string;
  type: 'encontro' | 'retiro' | 'culto' | 'outro';
  description: string; membersOnly: boolean;
};

type Devocional = {
  id: string; title: string; versiculo: string; referencia: string;
  reflexao: string; autor: string; date: string;
};

type ChatMsg = {
  id: string; author: string; text: string; time: string; mine: boolean;
};

type MusicaJovem = {
  id: string; title: string; artist: string; youtubeId: string; spotifyId: string;
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const EVENTOS: Evento[] = [
  {
    id: '1', title: 'Encontro de Jovens', dayNum: '18', month: 'Mai',
    day: 'Sáb', date: '2024-05-18', time: '18:00',
    local: 'Templo Principal', type: 'encontro',
    description: 'Noite de louvor, palavra e comunhão para todos os jovens!',
    membersOnly: false,
  },
  {
    id: '2', title: 'Retiro Jovem 2024', dayNum: '14', month: 'Jun',
    day: 'Sex', date: '2024-06-14', time: '08:00',
    local: 'Sítio Recanto da Paz', type: 'retiro',
    description: 'Fim de semana de renovação espiritual. Vagas limitadas!',
    membersOnly: false,
  },
  {
    id: '3', title: 'Reunião de Líderes Jovens', dayNum: '25', month: 'Mai',
    day: 'Sáb', date: '2024-05-25', time: '10:00',
    local: 'Sala de Reuniões', type: 'outro',
    description: 'Planejamento do segundo semestre.',
    membersOnly: true,
  },
];

const DEVOCIONAIS: Devocional[] = []; // carregado do Supabase

const CHAT_INIT: ChatMsg[] = [
  { id: '1', author: 'Lucas', text: 'Galera, alguém vai no encontro de sábado? 🙌', time: '15:00', mine: false },
  { id: '2', author: 'Bianca', text: 'Sim! Tô animada demais!', time: '15:02', mine: false },
  { id: '3', author: 'Você', text: 'Eu também vou! Nos vemos lá 🔥', time: '15:05', mine: true },
  { id: '4', author: 'Rafael', text: 'O retiro de junho ainda tem vagas?', time: '15:10', mine: false },
];

const MUSICAS: MusicaJovem[] = [
  { id: '1', title: 'Mesmo Sem Entender', artist: 'Fernandinho', youtubeId: 'abc123', spotifyId: 'xyz789' },
  { id: '2', title: 'Lugar Secreto', artist: 'Gabriela Rocha', youtubeId: 'def456', spotifyId: 'uvw012' },
  { id: '3', title: 'Nada Além do Sangue', artist: 'Ministério Zoe', youtubeId: 'ghi789', spotifyId: 'rst345' },
  { id: '4', title: 'Te Agradeço', artist: 'Elevation Worship', youtubeId: 'jkl012', spotifyId: 'opq678' },
  { id: '5', title: 'Ressuscita-me', artist: 'Aline Barros', youtubeId: 'mno345', spotifyId: 'lmn901' },
];

const EVENT_TYPE_COLOR: Record<Evento['type'], string> = {
  encontro: C.primary, retiro: C.secondary, culto: C.green, outro: C.accent,
};
const EVENT_TYPE_LABEL: Record<Evento['type'], string> = {
  encontro: 'Encontro', retiro: 'Retiro', culto: 'Culto', outro: 'Outro',
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function JovensScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('eventos');
  const [expandedDev, setExpandedDev] = useState<string | null>('1');
  const [chatMsg, setChatMsg] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>(CHAT_INIT);
  const { isLoggedIn } = useAuth();
  const isMember = isLoggedIn;

  // ── Devocionais do Supabase ────────────────────────────────────────────────
  const [devocionais, setDevocionais] = useState<Devocional[]>([]);
  const [loadingDev, setLoadingDev] = useState(true);
  const [refreshingDev, setRefreshingDev] = useState(false);

  const fetchDevocionais = useCallback(async () => {
    const { data } = await supabase
      .from('devocionais')
      .select('*')
      .order('data', { ascending: false })
      .limit(10);
    if (data) {
      setDevocionais(data.map((d: any) => ({
        id: d.id,
        title: d.titulo,
        versiculo: d.versiculo,
        referencia: d.referencia,
        reflexao: d.texto,
        autor: d.autor ?? 'Peniel Church',
        date: new Date(d.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }),
      })));
    }
    setLoadingDev(false);
    setRefreshingDev(false);
  }, []);

  useEffect(() => { fetchDevocionais(); }, [fetchDevocionais]);
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = () => {
    if (!chatMsg.trim()) return;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    setMessages(prev => [...prev, {
      id: String(Date.now()), author: 'Você',
      text: chatMsg.trim(), time, mine: true,
    }]);
    setChatMsg('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const openLink = (url: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  const TABS: { id: Tab; icon: string; label: string; private?: boolean }[] = [
    { id: 'eventos', icon: 'calendar-outline', label: 'Eventos' },
    { id: 'devocional', icon: 'book-outline', label: 'Devocional' },
    { id: 'chat', icon: 'chatbubbles-outline', label: 'Chat', private: true },
    { id: 'louvor', icon: 'musical-notes-outline', label: 'Louvor' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image
            source={require('../assets/PenielAlive-Logo.jpg')}
            style={{ width: 42, height: 42, borderRadius: 21 }}
            resizeMode="cover"
          />
          <View>
            <Text style={s.headerTitle}>Alive</Text>
            <Text style={s.headerSub}>Ministério de Jovens</Text>
          </View>
        </View>
        <View style={s.headerBadge}>
          <Text style={s.headerBadgeText}>🔥 {EVENTOS.filter(e => !e.membersOnly).length} eventos</Text>
        </View>
      </View>

      {/* ── Hero banner ──────────────────────────────────────────────────────── */}
      <View style={s.hero}>
        <Text style={s.heroVerse}>"Que ninguém te despreze por seres jovem."</Text>
        <Text style={s.heroRef}>1 Timóteo 4:12</Text>
      </View>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <View style={s.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[s.tabItem, activeTab === tab.id && s.tabItemActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons
              name={tab.icon as any} size={17}
              color={activeTab === tab.id ? C.primary : C.textMuted}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={[s.tabLabel, activeTab === tab.id && s.tabLabelActive]}>
                {tab.label}
              </Text>
              {tab.private && !isMember && (
                <Ionicons name="lock-closed" size={8} color={C.textDim} />
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══ EVENTOS ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'eventos' && (
        <ScrollView contentContainerStyle={s.tabContent}>
          <Text style={s.sectionLabel}>Próximos Eventos</Text>
          {EVENTOS.map(ev => (
            <View key={ev.id} style={[s.eventoCard, { borderLeftColor: EVENT_TYPE_COLOR[ev.type] }]}>
              {/* Date block */}
              <View style={[s.eventoDate, { backgroundColor: EVENT_TYPE_COLOR[ev.type] + '20' }]}>
                <Text style={[s.eventoDayNum, { color: EVENT_TYPE_COLOR[ev.type] }]}>{ev.dayNum}</Text>
                <Text style={[s.eventoMonth, { color: EVENT_TYPE_COLOR[ev.type] }]}>{ev.month}</Text>
              </View>

              {/* Info */}
              <View style={{ flex: 1 }}>
                <View style={s.eventoTitleRow}>
                  <Text style={s.eventoTitle}>{ev.title}</Text>
                  {ev.membersOnly && (
                    <View style={s.membersBadge}>
                      <Ionicons name="lock-closed-outline" size={10} color={C.accent} />
                      <Text style={s.membersBadgeText}>Membros</Text>
                    </View>
                  )}
                </View>
                <Text style={s.eventoDesc} numberOfLines={2}>{ev.description}</Text>
                <View style={s.eventoMeta}>
                  <Ionicons name="time-outline" size={12} color={C.textMuted} />
                  <Text style={s.eventoMetaText}>{ev.day}, {ev.time}</Text>
                  <Text style={s.dot}>·</Text>
                  <Ionicons name="location-outline" size={12} color={C.textMuted} />
                  <Text style={s.eventoMetaText}>{ev.local}</Text>
                </View>
              </View>

              {/* Type badge */}
              <View style={[s.typeBadge, { backgroundColor: EVENT_TYPE_COLOR[ev.type] + '20' }]}>
                <Text style={[s.typeBadgeText, { color: EVENT_TYPE_COLOR[ev.type] }]}>
                  {EVENT_TYPE_LABEL[ev.type]}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ══ DEVOCIONAL ════════════════════════════════════════════════════════ */}
      {activeTab === 'devocional' && (
        <ScrollView
          contentContainerStyle={s.tabContent}
          refreshControl={<RefreshControl refreshing={refreshingDev} onRefresh={() => { setRefreshingDev(true); fetchDevocionais(); }} />}
        >
          <Text style={s.sectionLabel}>Devocionais da Semana</Text>

          {loadingDev ? (
            <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
              <ActivityIndicator color={C.primary} />
              <Text style={{ color: C.textMuted, fontSize: 13 }}>Carregando...</Text>
            </View>
          ) : devocionais.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
              <Ionicons name="book-outline" size={40} color={C.textDim} />
              <Text style={{ color: C.textMuted, fontSize: 14 }}>Nenhum devocional publicado ainda</Text>
            </View>
          ) : (
            devocionais.map(dev => {
              const isOpen = expandedDev === dev.id;
              return (
                <View key={dev.id} style={[s.devCard, isOpen && s.devCardOpen]}>
                  <TouchableOpacity
                    style={s.devHeader}
                    onPress={() => setExpandedDev(isOpen ? null : dev.id)}
                    activeOpacity={0.8}
                  >
                    <View style={s.devBibleIcon}>
                      <Ionicons name="book" size={18} color={C.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.devTitle}>{dev.title}</Text>
                      <Text style={s.devRef}>{dev.referencia} · {dev.date}</Text>
                    </View>
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={s.devBody}>
                      <View style={s.versiculoBox}>
                        <Text style={s.versiculoText}>"{dev.versiculo}"</Text>
                        <Text style={s.versiculoRef}>{dev.referencia}</Text>
                      </View>
                      <Text style={s.reflexaoText}>{dev.reflexao}</Text>
                      <View style={s.devAutorRow}>
                        <Ionicons name="person-circle-outline" size={16} color={C.textMuted} />
                        <Text style={s.devAutor}>{dev.autor}</Text>
                        <TouchableOpacity
                          style={{ marginLeft: 'auto' }}
                          onPress={() => Share.share({ message: `${dev.title}\n\n"${dev.versiculo}"\n— ${dev.referencia}\n\n${dev.reflexao}\n\nPeniel Church App` })}
                        >
                          <Ionicons name="share-outline" size={16} color={C.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ══ CHAT ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'chat' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}
        >
          {/* Member gate banner */}
          {!isMember && (
            <View style={s.memberGate}>
              <Ionicons name="lock-closed-outline" size={16} color={C.accent} />
              <Text style={s.memberGateText}>
                Entre na Área do Membro para participar do chat
              </Text>
            </View>
          )}

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={s.chatContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.map(m => (
              <View key={m.id} style={[s.bubble, m.mine && s.bubbleMine]}>
                {!m.mine && <Text style={s.bubbleAuthor}>{m.author}</Text>}
                <Text style={[s.bubbleText, m.mine && s.bubbleTextMine]}>{m.text}</Text>
                <Text style={[s.bubbleTime, m.mine && s.bubbleTimeMine]}>{m.time}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={s.chatInputRow}>
            <TextInput
              style={[s.chatField, !isMember && { opacity: 0.4 }]}
              placeholder={isMember ? 'Mensagem...' : 'Apenas membros podem enviar mensagens'}
              placeholderTextColor={C.textDim}
              value={chatMsg}
              onChangeText={setChatMsg}
              returnKeyType="send"
              onSubmitEditing={isMember ? sendMessage : undefined}
              editable={isMember}
            />
            <TouchableOpacity
              style={[s.sendBtn, !isMember && { opacity: 0.4 }]}
              onPress={isMember ? sendMessage : undefined}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ══ LOUVOR ════════════════════════════════════════════════════════════ */}
      {activeTab === 'louvor' && (
        <ScrollView contentContainerStyle={s.tabContent}>
          <Text style={s.sectionLabel}>Playlist dos Jovens</Text>

          {/* Spotify banner */}
          <TouchableOpacity
            style={s.spotifyBanner}
            onPress={() => openLink('https://open.spotify.com')}
            activeOpacity={0.85}
          >
            <Ionicons name="musical-notes" size={24} color={C.green} />
            <View style={{ flex: 1 }}>
              <Text style={s.spotifyBannerTitle}>Playlist no Spotify</Text>
              <Text style={s.spotifyBannerSub}>Ouça as músicas que tocamos nos encontros</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
          </TouchableOpacity>

          {/* Music list */}
          {MUSICAS.map((music, idx) => (
            <View key={music.id} style={s.musicCard}>
              <View style={s.musicNum}>
                <Text style={s.musicNumText}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.musicTitle}>{music.title}</Text>
                <Text style={s.musicArtist}>{music.artist}</Text>
              </View>
              <View style={s.musicLinks}>
                <TouchableOpacity
                  style={[s.musicLinkBtn, { backgroundColor: C.secondaryDim }]}
                  onPress={() => openLink(`https://youtube.com/watch?v=${music.youtubeId}`)}
                >
                  <Ionicons name="logo-youtube" size={15} color={C.secondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.musicLinkBtn, { backgroundColor: C.greenDim }]}
                  onPress={() => openLink(`https://open.spotify.com/track/${music.spotifyId}`)}
                >
                  <Ionicons name="musical-note" size={15} color={C.green} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  headerSub: { fontSize: 11, color: C.primary, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 },
  headerBadge: { backgroundColor: C.primary + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.primary + '40' },
  headerBadgeText: { fontSize: 12, color: C.primary, fontWeight: '700' },

  hero: {
    backgroundColor: C.primaryDim, paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  heroVerse: { fontSize: 14, color: C.text, fontStyle: 'italic', lineHeight: 22 },
  heroRef: { fontSize: 12, color: C.primary, fontWeight: '700', marginTop: 4 },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: C.primary },
  tabLabel: { fontSize: 9, color: C.textMuted, fontWeight: '500' },
  tabLabelActive: { color: C.primary, fontWeight: '700' },

  tabContent: { padding: 16, paddingBottom: 32 },
  sectionLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  dot: { color: C.textDim, fontSize: 12 },

  // Eventos
  eventoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: C.surface, borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 3,
  },
  eventoDate: { width: 46, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  eventoDayNum: { fontSize: 22, fontWeight: '800', lineHeight: 24 },
  eventoMonth: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  eventoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  eventoTitle: { fontSize: 14, fontWeight: '700', color: C.text, flex: 1 },
  eventoDesc: { fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 6 },
  eventoMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eventoMetaText: { fontSize: 11, color: C.textMuted },
  membersBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.accentDim, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  membersBadgeText: { fontSize: 9, color: C.accent, fontWeight: '700' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  typeBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  // Devocional
  devCard: { backgroundColor: C.surface, borderRadius: 14, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  devCardOpen: { borderColor: C.primary },
  devHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  devBibleIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: C.primaryDim, alignItems: 'center', justifyContent: 'center' },
  devTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  devRef: { fontSize: 11, color: C.primary, marginTop: 2, fontWeight: '600' },
  devBody: { borderTopWidth: 1, borderTopColor: C.border, padding: 16, backgroundColor: C.surfaceHigh },
  versiculoBox: { backgroundColor: C.primaryDim, borderRadius: 10, padding: 14, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: C.primary },
  versiculoText: { fontSize: 14, color: C.text, fontStyle: 'italic', lineHeight: 22 },
  versiculoRef: { fontSize: 12, color: C.primary, fontWeight: '700', marginTop: 8 },
  reflexaoText: { fontSize: 14, color: C.textMuted, lineHeight: 22, marginBottom: 14 },
  devAutorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  devAutor: { fontSize: 12, color: C.textMuted, fontWeight: '600' },

  // Chat
  memberGate: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.accentDim, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  memberGateText: { fontSize: 13, color: C.accent, flex: 1 },
  chatContent: { padding: 16, paddingBottom: 8 },
  bubble: {
    alignSelf: 'flex-start', maxWidth: '80%',
    backgroundColor: C.surface, borderRadius: 12, borderBottomLeftRadius: 4,
    padding: 10, marginBottom: 10, borderWidth: 1, borderColor: C.border,
  },
  bubbleMine: {
    alignSelf: 'flex-end', backgroundColor: C.primaryDim,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 4, borderColor: C.primary,
  },
  bubbleAuthor: { fontSize: 11, color: C.primary, fontWeight: '700', marginBottom: 4 },
  bubbleText: { fontSize: 14, color: C.text, lineHeight: 20 },
  bubbleTextMine: { color: '#E0D0FF' },
  bubbleTime: { fontSize: 10, color: C.textDim, marginTop: 4, textAlign: 'right' },
  bubbleTimeMine: { color: 'rgba(180,160,255,0.6)' },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface,
  },
  chatField: {
    flex: 1, height: 42, backgroundColor: C.surfaceHigh,
    borderRadius: 21, paddingHorizontal: 16, fontSize: 14, color: C.text,
    borderWidth: 1, borderColor: C.border,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },

  // Louvor
  spotifyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.greenDim, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.green + '30', marginBottom: 16,
  },
  spotifyBannerTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  spotifyBannerSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  musicCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: C.border,
  },
  musicNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.primaryDim, alignItems: 'center', justifyContent: 'center' },
  musicNumText: { fontSize: 12, fontWeight: '800', color: C.primary },
  musicTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  musicArtist: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  musicLinks: { flexDirection: 'row', gap: 8 },
  musicLinkBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
