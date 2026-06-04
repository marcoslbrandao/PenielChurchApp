import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, StatusBar, Image, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// ─── Config ───────────────────────────────────────────────────────────────────
const YOUTUBE_API_KEY = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
const CHANNEL_ID = 'UCeipicy-AS_b66Asu65TBQQ';
const CHANNEL_HANDLE = '@PenielChurchOfficial';
const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@PenielChurchOfficial/streams';
const INSTAGRAM_URL = 'https://www.instagram.com/penielchurchofficial/';
const FACEBOOK_URL = 'https://www.facebook.com/penielchurchofficial';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#0D0D0F', surface: '#18181B', surfaceHigh: '#242429',
  border: '#2A2A30', primary: '#7C4DFF', accent: '#F5C842',
  red: '#FF0000', redDim: '#3D0000', text: '#F1F1F3',
  textMuted: '#8A8A96', textDim: '#4A4A55',
  spotify: '#1DB954', green: '#27AE60',
};

type Tab = 'videos' | 'avisos' | 'podcast' | 'social';
type Aviso = { id: string; titulo: string; texto: string; data: string; tipo: string; };
type Video = { id: string; title: string; thumbnail: string; publishedAt: string; videoId: string; };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d atrás`;
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function tipoAvisoCor(tipo: string) {
  switch (tipo) {
    case 'urgente': return { bg: '#3D0A0A', border: '#C0392B', text: '#FF6B6B', label: '🚨 Urgente' };
    case 'evento':  return { bg: '#0A1A3D', border: '#534AB7', text: '#8B83D4', label: '📅 Evento'  };
    case 'geral':   return { bg: '#0A2A1A', border: '#27AE60', text: '#2ECC71', label: '📢 Geral'   };
    default:        return { bg: C.surface, border: C.border,  text: C.textMuted, label: '📌 Aviso' };
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MidiaScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('videos');
  const [videos, setVideos] = useState<Video[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [loadingAvisos, setLoadingAvisos] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Busca vídeos do YouTube ──────────────────────────────────────────────────
  const fetchVideos = useCallback(async () => {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&maxResults=10&order=date&type=video&key=${YOUTUBE_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.items && data.items.length > 0) {
        setVideos(data.items.map((item: any) => ({
          id: item.id.videoId,
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url,
          publishedAt: item.snippet.publishedAt,
        })));
      } else {
        console.log('YouTube API response:', JSON.stringify(data));
      }
    } catch (err) {
      console.log('YouTube fetch error:', err);
    }
    setLoadingVideos(false);
    setRefreshing(false);
  }, []);

  // ── Busca avisos do Supabase ─────────────────────────────────────────────────
  const fetchAvisos = useCallback(async () => {
    const { data } = await supabase
      .from('avisos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setAvisos(data as Aviso[]);
    setLoadingAvisos(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchVideos(); fetchAvisos(); }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'videos') fetchVideos();
    if (activeTab === 'avisos') fetchAvisos();
  };

  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'videos',  icon: 'logo-youtube',         label: 'Vídeos'   },
    { id: 'avisos',  icon: 'megaphone-outline',     label: 'Avisos'   },
    { id: 'podcast', icon: 'mic-outline',           label: 'Podcast'  },
    { id: 'social',  icon: 'share-social-outline',  label: 'Social'   },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Mídia</Text>
          <Text style={s.headerSub}>Peniel Church</Text>
        </View>
        <TouchableOpacity style={s.ytBtn} onPress={() => Linking.openURL(YOUTUBE_CHANNEL_URL)}>
          <Ionicons name="logo-youtube" size={16} color="#FF0000" />
          <Text style={s.ytBtnText}>Canal</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[s.tabItem, activeTab === tab.id && s.tabItemActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons name={tab.icon as any} size={17} color={activeTab === tab.id ? C.primary : C.textMuted} />
            <Text style={[s.tabLabel, activeTab === tab.id && s.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══ VÍDEOS ════════════════════════════════════════════════════════════ */}
      {activeTab === 'videos' && (
        <ScrollView
          contentContainerStyle={s.tabContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
        >
          <Text style={s.sectionLabel}>Últimos vídeos</Text>
          {loadingVideos ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={C.primary} size="large" />
              <Text style={s.loadingText}>Carregando vídeos...</Text>
            </View>
          ) : videos.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="logo-youtube" size={48} color={C.textDim} />
              <Text style={s.emptyTitle}>Nenhum vídeo encontrado</Text>
              <Text style={s.emptySub}>Verifique sua conexão ou acesse o canal</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => Linking.openURL(YOUTUBE_CHANNEL_URL)}>
                <Text style={s.emptyBtnText}>Abrir Canal YouTube</Text>
              </TouchableOpacity>
            </View>
          ) : (
            videos.map(video => (
              <TouchableOpacity
                key={video.id}
                style={s.videoCard}
                onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${video.videoId}`)}
                activeOpacity={0.8}
              >
                <View style={s.thumbWrap}>
                  <Image source={{ uri: video.thumbnail }} style={s.thumb} resizeMode="cover" />
                  <View style={s.playOverlay}>
                    <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
                  </View>
                </View>
                <View style={s.videoInfo}>
                  <Text style={s.videoTitle} numberOfLines={2}>{video.title}</Text>
                  <View style={s.videoMeta}>
                    <Ionicons name="time-outline" size={12} color={C.textMuted} />
                    <Text style={s.videoMetaText}>{timeAgo(video.publishedAt)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* ══ AVISOS ════════════════════════════════════════════════════════════ */}
      {activeTab === 'avisos' && (
        <ScrollView
          contentContainerStyle={s.tabContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
        >
          <Text style={s.sectionLabel}>Notícias e Avisos</Text>
          {loadingAvisos ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : avisos.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="megaphone-outline" size={48} color={C.textDim} />
              <Text style={s.emptyTitle}>Nenhum aviso publicado ainda</Text>
              <Text style={s.emptySub}>Os avisos da igreja aparecerão aqui</Text>
            </View>
          ) : (
            avisos.map(aviso => {
              const cor = tipoAvisoCor(aviso.tipo);
              return (
                <View key={aviso.id} style={[s.avisoCard, { backgroundColor: cor.bg, borderColor: cor.border }]}>
                  <View style={s.avisoHeader}>
                    <Text style={[s.avisoTipo, { color: cor.text }]}>{cor.label}</Text>
                    <Text style={s.avisoData}>{timeAgo(aviso.data)}</Text>
                  </View>
                  <Text style={s.avisoTitulo}>{aviso.titulo}</Text>
                  <Text style={s.avisoTexto}>{aviso.texto}</Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ══ PODCAST ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'podcast' && (
        <ScrollView contentContainerStyle={s.tabContent}>
          <View style={s.podcastHero}>
            <View style={s.podcastIcon}>
              <Ionicons name="mic" size={36} color={C.accent} />
            </View>
            <Text style={s.podcastTitle}>Peniel Church Podcast</Text>
            <Text style={s.podcastSub}>Mensagens, devocionais e muito mais</Text>
          </View>

          <Text style={s.sectionLabel}>Ouça em</Text>
          <View style={s.platformsGrid}>
            {[
              { nome: 'Spotify',       icon: 'musical-note',   cor: '#1DB954', url: 'https://spotify.com' },
              { nome: 'Apple Podcasts',icon: 'logo-apple',     cor: '#FC3C44', url: 'https://podcasts.apple.com' },
              { nome: 'YouTube',       icon: 'logo-youtube',   cor: '#FF0000', url: YOUTUBE_CHANNEL_URL },
              { nome: 'Google',        icon: 'logo-google',    cor: '#4285F4', url: 'https://podcasts.google.com' },
            ].map(p => (
              <TouchableOpacity
                key={p.nome}
                style={[s.platformCard, { borderColor: p.cor + '40' }]}
                onPress={() => Linking.openURL(p.url)}
              >
                <Ionicons name={p.icon as any} size={28} color={p.cor} />
                <Text style={s.platformNome}>{p.nome}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.podcastEmBreve}>
            <Ionicons name="time-outline" size={20} color={C.textMuted} />
            <Text style={s.podcastEmBreveText}>
              Em breve! O podcast da Peniel Church estará disponível nestas plataformas.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* ══ SOCIAL ════════════════════════════════════════════════════════════ */}
      {activeTab === 'social' && (
        <ScrollView contentContainerStyle={s.tabContent}>
          <Text style={s.sectionLabel}>Nossas redes sociais</Text>

          {[
            { nome: 'YouTube',   handle: '@PenielChurchOfficial',      icon: 'logo-youtube',   cor: '#FF0000', url: YOUTUBE_CHANNEL_URL,  desc: 'Cultos, pregações e devocionais' },
            { nome: 'Instagram', handle: '@penielchurchofficial',       icon: 'logo-instagram', cor: '#E1306C', url: INSTAGRAM_URL,        desc: 'Fotos e stories da igreja'       },
            { nome: 'Facebook',  handle: 'penielchurchofficial',        icon: 'logo-facebook',  cor: '#1877F2', url: FACEBOOK_URL,         desc: 'Comunidade e eventos'            },
          ].map(rede => (
            <TouchableOpacity
              key={rede.nome}
              style={s.socialCard}
              onPress={() => Linking.openURL(rede.url)}
              activeOpacity={0.8}
            >
              <View style={[s.socialIcon, { backgroundColor: rede.cor + '20' }]}>
                <Ionicons name={rede.icon as any} size={28} color={rede.cor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.socialNome}>{rede.nome}</Text>
                <Text style={s.socialHandle}>{rede.handle}</Text>
                <Text style={s.socialDesc}>{rede.desc}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={C.textMuted} />
            </TouchableOpacity>
          ))}

          <View style={s.socialDica}>
            <Ionicons name="heart" size={16} color="#E1306C" />
            <Text style={s.socialDicaText}>Siga-nos e ative as notificações para não perder nada!</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  headerSub: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  ytBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.redDim, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#FF000040' },
  ytBtnText: { fontSize: 12, fontWeight: '700', color: '#FF0000' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: C.primary },
  tabLabel: { fontSize: 9, color: C.textMuted, fontWeight: '500' },
  tabLabelActive: { color: C.primary, fontWeight: '700' },
  tabContent: { padding: 16, paddingBottom: 32 },
  sectionLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },
  loadingWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  loadingText: { fontSize: 13, color: C.textMuted },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textMuted },
  emptySub: { fontSize: 13, color: C.textDim, textAlign: 'center' },
  emptyBtn: { marginTop: 12, backgroundColor: C.redDim, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20, borderWidth: 1, borderColor: '#FF000040' },
  emptyBtnText: { fontSize: 13, fontWeight: '700', color: '#FF0000' },
  // Vídeos
  videoCard: { backgroundColor: C.surface, borderRadius: 14, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  thumbWrap: { position: 'relative' },
  thumb: { width: '100%', height: 190 },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  videoInfo: { padding: 12 },
  videoTitle: { fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 20, marginBottom: 6 },
  videoMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  videoMetaText: { fontSize: 11, color: C.textMuted },
  // Avisos
  avisoCard: { borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1 },
  avisoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  avisoTipo: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  avisoData: { fontSize: 11, color: C.textDim },
  avisoTitulo: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 6 },
  avisoTexto: { fontSize: 13, color: C.textMuted, lineHeight: 20 },
  // Podcast
  podcastHero: { alignItems: 'center', paddingVertical: 28, gap: 10, marginBottom: 8 },
  podcastIcon: { width: 80, height: 80, borderRadius: 20, backgroundColor: 'rgba(245,200,66,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(245,200,66,0.3)' },
  podcastTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  podcastSub: { fontSize: 13, color: C.textMuted },
  platformsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  platformCard: { width: '47%', backgroundColor: C.surface, borderRadius: 14, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1 },
  platformNome: { fontSize: 12, fontWeight: '600', color: C.text },
  podcastEmBreve: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  podcastEmBreveText: { flex: 1, fontSize: 13, color: C.textMuted, lineHeight: 20 },
  // Social
  socialCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  socialIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  socialNome: { fontSize: 15, fontWeight: '700', color: C.text },
  socialHandle: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  socialDesc: { fontSize: 11, color: C.textDim, marginTop: 2 },
  socialDica: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: C.border },
  socialDicaText: { flex: 1, fontSize: 13, color: C.textMuted },
});
