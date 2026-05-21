import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, StatusBar, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#0D0D0F',
  surface: '#18181B',
  surfaceHigh: '#242429',
  border: '#2A2A30',
  primary: '#1A3A5C',
  accent: '#F5C842',
  red: '#FF0000',
  redDim: '#3D0000',
  text: '#F1F1F3',
  textMuted: '#8A8A96',
  textDim: '#4A4A55',
  spotify: '#1DB954',
  spotifyDim: '#0D5C28',
};

// ─── Types ────────────────────────────────────────────────────────────────────
type VideoItem = {
  id: string;
  title: string;
  speaker: string;
  date: string;
  duration: string;
  youtubeId: string;
  thumbnail: string;
  category: 'devocional' | 'pregacao' | 'louvor';
};

type PodcastEpisode = {
  id: string;
  title: string;
  description: string;
  date: string;
  duration: string;
  number: number;
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const VIDEOS: VideoItem[] = [
  {
    id: '1',
    title: 'Devocional — A Paz que Excede',
    speaker: 'Pr. Marcos Brandão',
    date: '12 Mai 2024',
    duration: '8:24',
    youtubeId: 'dQw4w9WgXcQ',
    thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    category: 'devocional',
  },
  {
    id: '2',
    title: 'Devocional — Confie no Senhor',
    speaker: 'Pr. Marcos Brandão',
    date: '05 Mai 2024',
    duration: '6:10',
    youtubeId: 'dQw4w9WgXcQ',
    thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    category: 'devocional',
  },
  {
    id: '3',
    title: 'Pregação — Filipenses 4:13',
    speaker: 'Pr. Marcos Brandão',
    date: '28 Abr 2024',
    duration: '42:15',
    youtubeId: 'dQw4w9WgXcQ',
    thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    category: 'pregacao',
  },
  {
    id: '4',
    title: 'Devocional — Renovação pela Palavra',
    speaker: 'Pr. Marcos Brandão',
    date: '21 Abr 2024',
    duration: '9:47',
    youtubeId: 'dQw4w9WgXcQ',
    thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    category: 'devocional',
  },
];

const PODCAST_EPISODES: PodcastEpisode[] = [
  {
    id: '1', number: 3,
    title: 'Como ouvir a voz de Deus no dia a dia',
    description: 'Neste episódio falamos sobre discernimento espiritual e como cultivar sensibilidade ao Espírito Santo.',
    date: 'Em breve', duration: '~35 min',
  },
  {
    id: '2', number: 2,
    title: 'Fé que move montanhas',
    description: 'Uma conversa profunda sobre o que é fé bíblica e como ela transforma nossa vida prática.',
    date: 'Em breve', duration: '~40 min',
  },
  {
    id: '3', number: 1,
    title: 'O começo — quem somos e por que existimos',
    description: 'Episódio piloto da Peniel Church. Conheça a visão e missão da nossa igreja.',
    date: 'Em breve', duration: '~25 min',
  },
];

const CATEGORY_LABEL: Record<VideoItem['category'], string> = {
  devocional: 'Devocional',
  pregacao: 'Pregação',
  louvor: 'Louvor',
};

const CATEGORY_COLOR: Record<VideoItem['category'], string> = {
  devocional: '#7C4DFF',
  pregacao: C.accent,
  louvor: C.spotify,
};

// ─── Component ────────────────────────────────────────────────────────────────
type Tab = 'videos' | 'podcast';

export default function MidiaScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('videos');
  const [filter, setFilter] = useState<VideoItem['category'] | 'todos'>('todos');

  const openYoutube = (id: string) => {
    Linking.openURL(`https://www.youtube.com/watch?v=${id}`)
      .catch(() => Linking.openURL(`vnd.youtube:${id}`));
  };

  const openYoutubeChannel = () => {
    Linking.openURL('https://www.youtube.com/@penielchurch');
  };

  const filteredVideos = filter === 'todos'
    ? VIDEOS
    : VIDEOS.filter(v => v.category === filter);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Mídia</Text>
          <Text style={s.headerSub}>Peniel Church</Text>
        </View>
        <TouchableOpacity style={s.ytBtn} onPress={openYoutubeChannel}>
          <Ionicons name="logo-youtube" size={16} color={C.red} />
          <Text style={s.ytBtnText}>Canal</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === 'videos' && s.tabBtnActive]}
          onPress={() => setActiveTab('videos')}
        >
          <Ionicons name="play-circle-outline" size={18} color={activeTab === 'videos' ? C.red : C.textMuted} />
          <Text style={[s.tabBtnText, activeTab === 'videos' && { color: C.red }]}>Vídeos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === 'podcast' && s.tabBtnActive]}
          onPress={() => setActiveTab('podcast')}
        >
          <Ionicons name="mic-outline" size={18} color={activeTab === 'podcast' ? C.accent : C.textMuted} />
          <Text style={[s.tabBtnText, activeTab === 'podcast' && { color: C.accent }]}>Podcast</Text>
          <View style={s.comingBadge}>
            <Text style={s.comingBadgeText}>Em breve</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ══ VÍDEOS ════════════════════════════════════════════════════════════ */}
      {activeTab === 'videos' && (
        <View style={{ flex: 1 }}>
          {/* Filter pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterContent}>
            {(['todos', 'devocional', 'pregacao', 'louvor'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterPill, filter === f && s.filterPillActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[s.filterPillText, filter === f && s.filterPillTextActive]}>
                  {f === 'todos' ? 'Todos' : CATEGORY_LABEL[f]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView contentContainerStyle={s.videoList}>
            {filteredVideos.map(video => (
              <TouchableOpacity
                key={video.id}
                style={s.videoCard}
                onPress={() => openYoutube(video.youtubeId)}
                activeOpacity={0.8}
              >
                {/* Thumbnail */}
                <View style={s.thumbWrap}>
                  <Image
                    source={{ uri: video.thumbnail }}
                    style={s.thumb}
                    resizeMode="cover"
                  />
                  {/* Play overlay */}
                  <View style={s.playOverlay}>
                    <View style={s.playCircle}>
                      <Ionicons name="play" size={20} color="#fff" />
                    </View>
                  </View>
                  {/* Duration badge */}
                  <View style={s.durationBadge}>
                    <Text style={s.durationText}>{video.duration}</Text>
                  </View>
                </View>

                {/* Info */}
                <View style={s.videoInfo}>
                  {/* Category badge */}
                  <View style={[s.catBadge, { backgroundColor: CATEGORY_COLOR[video.category] + '22' }]}>
                    <Text style={[s.catBadgeText, { color: CATEGORY_COLOR[video.category] }]}>
                      {CATEGORY_LABEL[video.category]}
                    </Text>
                  </View>
                  <Text style={s.videoTitle} numberOfLines={2}>{video.title}</Text>
                  <View style={s.videoMeta}>
                    <Ionicons name="person-outline" size={12} color={C.textMuted} />
                    <Text style={s.videoMetaText}>{video.speaker}</Text>
                    <Text style={s.videoDot}>·</Text>
                    <Ionicons name="calendar-outline" size={12} color={C.textMuted} />
                    <Text style={s.videoMetaText}>{video.date}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {filteredVideos.length === 0 && (
              <View style={s.empty}>
                <Ionicons name="videocam-outline" size={40} color={C.textDim} />
                <Text style={s.emptyText}>Nenhum vídeo nessa categoria ainda</Text>
              </View>
            )}

            {/* YouTube CTA */}
            <TouchableOpacity style={s.ytCta} onPress={openYoutubeChannel} activeOpacity={0.85}>
              <Ionicons name="logo-youtube" size={22} color={C.red} />
              <View style={{ flex: 1 }}>
                <Text style={s.ytCtaTitle}>Ver todos no YouTube</Text>
                <Text style={s.ytCtaSub}>Inscreva-se no canal da Peniel Church</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* ══ PODCAST ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'podcast' && (
        <ScrollView contentContainerStyle={s.podcastList}>
          {/* Coming soon banner */}
          <View style={s.podcastBanner}>
            <View style={s.podcastBannerIcon}>
              <Ionicons name="mic" size={32} color={C.accent} />
            </View>
            <Text style={s.podcastBannerTitle}>Podcast Peniel — Em Breve</Text>
            <Text style={s.podcastBannerSub}>
              Episódios com pregações, devocionais e conversas sobre fé.
              Estaremos em breve no Spotify, Apple Podcasts e YouTube.
            </Text>
            {/* Platform pills */}
            <View style={s.platformRow}>
              {[
                { icon: 'logo-youtube', label: 'YouTube', color: C.red },
                { icon: 'musical-notes-outline', label: 'Spotify', color: C.spotify },
                { icon: 'phone-portrait-outline', label: 'Apple Podcasts', color: '#B150E2' },
              ].map(p => (
                <View key={p.label} style={s.platformPill}>
                  <Ionicons name={p.icon as any} size={14} color={p.color} />
                  <Text style={[s.platformPillText, { color: p.color }]}>{p.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Episode list preview */}
          <Text style={s.sectionLabel}>Episódios planejados</Text>
          {PODCAST_EPISODES.map((ep, idx) => (
            <View key={ep.id} style={s.episodeCard}>
              <View style={s.epNumBadge}>
                <Text style={s.epNum}>#{ep.number}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.epTitle}>{ep.title}</Text>
                <Text style={s.epDesc} numberOfLines={2}>{ep.description}</Text>
                <View style={s.epMeta}>
                  <Ionicons name="time-outline" size={12} color={C.textDim} />
                  <Text style={s.epMetaText}>{ep.duration}</Text>
                  <Text style={s.videoDot}>·</Text>
                  <Text style={[s.epMetaText, { color: C.accent }]}>{ep.date}</Text>
                </View>
              </View>
              <View style={s.epPlayBtn}>
                <Ionicons name="lock-closed-outline" size={16} color={C.textDim} />
              </View>
            </View>
          ))}

          {/* Notify CTA */}
          <View style={s.notifyCta}>
            <Ionicons name="notifications-outline" size={20} color={C.accent} />
            <Text style={s.notifyCtaText}>
              Ative as notificações no Perfil para ser avisado quando o podcast estrear!
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  headerSub: { fontSize: 11, color: C.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1.5 },
  ytBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.redDim, paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1, borderColor: C.red + '40',
  },
  ytBtnText: { fontSize: 13, color: C.red, fontWeight: '700' },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: C.red },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  comingBadge: { backgroundColor: C.accent + '22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  comingBadgeText: { fontSize: 9, color: C.accent, fontWeight: '700', textTransform: 'uppercase' },

  // Filter
  filterScroll: { maxHeight: 52 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  filterPillActive: { backgroundColor: C.red + '20', borderColor: C.red },
  filterPillText: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
  filterPillTextActive: { color: C.red, fontWeight: '700' },

  // Videos
  videoList: { padding: 16, gap: 16, paddingBottom: 32 },
  videoCard: {
    backgroundColor: C.surface, borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: C.border,
  },
  thumbWrap: { width: '100%', height: 190, backgroundColor: C.surfaceHigh },
  thumb: { width: '100%', height: '100%' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  playCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center',
    paddingLeft: 3,
  },
  durationBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  durationText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  videoInfo: { padding: 12, gap: 6 },
  catBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  catBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  videoTitle: { fontSize: 15, fontWeight: '700', color: C.text, lineHeight: 22 },
  videoMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  videoMetaText: { fontSize: 12, color: C.textMuted },
  videoDot: { color: C.textDim, fontSize: 12 },

  // YouTube CTA
  ytCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.redDim, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: C.red + '30', marginTop: 4,
  },
  ytCtaTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  ytCtaSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 14, color: C.textMuted },

  // Podcast
  podcastList: { padding: 16, paddingBottom: 40 },
  podcastBanner: {
    backgroundColor: C.surface, borderRadius: 16,
    padding: 20, alignItems: 'center',
    borderWidth: 1, borderColor: C.border, marginBottom: 24,
  },
  podcastBannerIcon: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: C.accent + '18',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  podcastBannerTitle: { fontSize: 18, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 8 },
  podcastBannerSub: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  platformRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  platformPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.surfaceHigh, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: C.border,
  },
  platformPillText: { fontSize: 12, fontWeight: '600' },
  sectionLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  episodeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: C.surface, borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  epNumBadge: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: C.accent + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  epNum: { fontSize: 12, fontWeight: '800', color: C.accent },
  epTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 },
  epDesc: { fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 6 },
  epMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  epMetaText: { fontSize: 11, color: C.textDim },
  epPlayBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  notifyCta: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.accent + '12', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: C.accent + '30', marginTop: 8,
  },
  notifyCtaText: { flex: 1, fontSize: 13, color: C.textMuted, lineHeight: 20 },
});
