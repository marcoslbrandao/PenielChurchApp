import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, StatusBar, Image, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import MensagemDetalheModal, { Mensagem } from '../components/MensagemDetalheModal';
import { useCampoTraduzido } from '../lib/useTraducao';

const LOCALE_POR_IDIOMA: Record<string, string> = { pt: 'pt-BR', en: 'en-GB', es: 'es-ES', fr: 'fr-FR' };

// Card de mensagem (blog) na lista — título e resumo traduzidos pro idioma do app.
function MensagemCard({ msg, onPress }: { msg: Mensagem; onPress: () => void }) {
  const { i18n } = useTranslation();
  const titulo = useCampoTraduzido(msg.titulo, 'mensagens', msg.id, 'titulo');
  const resumo = useCampoTraduzido(msg.resumo, 'mensagens', msg.id, 'resumo');
  const locale = LOCALE_POR_IDIOMA[i18n.language] ?? 'pt-BR';
  return (
    <TouchableOpacity style={s.mensagemCard} onPress={onPress} activeOpacity={0.85}>
      {!!msg.imagem_url && (
        <Image source={{ uri: msg.imagem_url }} style={s.mensagemThumb} resizeMode="cover" />
      )}
      <View style={s.mensagemInfo}>
        <Text style={s.mensagemData}>
          {new Date(`${msg.data}T00:00:00`).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
        <Text style={s.mensagemTitulo} numberOfLines={2}>{titulo}</Text>
        <Text style={s.mensagemResumo} numberOfLines={2}>{resumo}</Text>
      </View>
    </TouchableOpacity>
  );
}

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

type Tab = 'videos' | 'shorts' | 'avisos' | 'mensagens' | 'podcast' | 'social';
type Aviso = { id: string; titulo: string; texto: string; data: string; tipo: string; };
type Video = { id: string; title: string; thumbnail: string; publishedAt: string; videoId: string; isLive?: boolean; };
type Short = { id: string; titulo: string; url: string; plataforma: string; };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string, t: (key: string) => string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return t('midia.agora');
  if (diff < 3600) return `${Math.floor(diff / 60)} ${t('midia.minAtras')}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}${t('midia.hAtras')}`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}${t('midia.dAtras')}`;
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:shorts\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function tipoAvisoCor(tipo: string, t: (key: string) => string) {
  switch (tipo) {
    case 'urgente': return { bg: '#3D0A0A', border: '#C0392B', text: '#FF6B6B', label: t('midia.tipoUrgente') };
    case 'evento':  return { bg: '#0A1A3D', border: '#534AB7', text: '#8B83D4', label: t('midia.tipoEvento')  };
    case 'geral':   return { bg: '#0A2A1A', border: '#27AE60', text: '#2ECC71', label: t('midia.tipoGeral')   };
    default:        return { bg: C.surface, border: C.border,  text: C.textMuted, label: t('midia.tipoAviso') };
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MidiaScreen() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('videos');
  const [videos, setVideos] = useState<Video[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [shorts, setShorts] = useState<Short[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [mensagemAberta, setMensagemAberta] = useState<Mensagem | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [loadingAvisos, setLoadingAvisos] = useState(true);
  const [loadingShorts, setLoadingShorts] = useState(true);
  const [loadingMensagens, setLoadingMensagens] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Busca vídeos do YouTube ──────────────────────────────────────────────────
  const fetchVideos = useCallback(async () => {
    try {
      // Busca vídeos ao vivo primeiro
      const liveUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&eventType=live&type=video&maxResults=3&key=${YOUTUBE_API_KEY}`;
      const liveRes = await fetch(liveUrl);
      const liveData = await liveRes.json();

      // Busca últimos vídeos
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&maxResults=10&order=date&type=video&key=${YOUTUBE_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.items && data.items.length > 0) {
        // Combina lives (primeiro) + vídeos recentes
        const liveItems = liveData.items ?? [];
        const allItems = [...liveItems, ...data.items];
        // Remove duplicatas
        const seen = new Set();
        const unique = allItems.filter((item: any) => {
          const id = item.id.videoId;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        setVideos(unique.slice(0, 10).map((item: any) => ({
          id: item.id.videoId,
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url,
          publishedAt: item.snippet.publishedAt,
          isLive: item.snippet.liveBroadcastContent === 'live',
        })));
      } else {
        console.log('YouTube error:', JSON.stringify(data.error));
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

  // ── Busca shorts do Supabase ─────────────────────────────────────────────────
  const fetchShorts = useCallback(async () => {
    const { data } = await supabase
      .from('shorts_videos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setShorts(data as Short[]);
    setLoadingShorts(false);
    setRefreshing(false);
  }, []);

  // ── Busca mensagens (blog) do Supabase ───────────────────────────────────────
  const fetchMensagens = useCallback(async () => {
    const { data } = await supabase
      .from('mensagens')
      .select('id, titulo, resumo, conteudo, imagem_url, autor, data')
      .order('data', { ascending: false })
      .limit(30);
    if (data) setMensagens(data as Mensagem[]);
    setLoadingMensagens(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchVideos(); fetchAvisos(); fetchShorts(); fetchMensagens(); }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'videos') fetchVideos();
    if (activeTab === 'avisos') fetchAvisos();
    if (activeTab === 'shorts') fetchShorts();
    if (activeTab === 'mensagens') fetchMensagens();
  };

  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'videos',    icon: 'logo-youtube',         label: t('midia.tabVideos')     },
    { id: 'shorts',    icon: 'film-outline',          label: t('midia.tabShorts')     },
    { id: 'mensagens', icon: 'newspaper-outline',     label: t('midia.tabMensagens')  },
    { id: 'avisos',    icon: 'megaphone-outline',     label: t('midia.tabAvisos')     },
    { id: 'podcast',   icon: 'mic-outline',           label: t('midia.tabPodcast')    },
    { id: 'social',    icon: 'share-social-outline',  label: t('midia.tabSocial')     },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>{t('midia.titulo')}</Text>
          <Text style={s.headerSub}>Peniel Church</Text>
        </View>
        <TouchableOpacity style={s.ytBtn} onPress={() => Linking.openURL(YOUTUBE_CHANNEL_URL)}>
          <Ionicons name="logo-youtube" size={16} color="#FF0000" />
          <Text style={s.ytBtnText}>{t('midia.canal')}</Text>
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
          <Text style={s.sectionLabel}>{t('midia.ultimosVideos')}</Text>
          {loadingVideos ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={C.primary} size="large" />
              <Text style={s.loadingText}>{t('midia.carregandoVideos')}</Text>
            </View>
          ) : videos.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="logo-youtube" size={48} color={C.textDim} />
              <Text style={s.emptyTitle}>{t('midia.nenhumVideoEncontrado')}</Text>
              <Text style={s.emptySub}>{t('midia.verifiqueConexao')}</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => Linking.openURL(YOUTUBE_CHANNEL_URL)}>
                <Text style={s.emptyBtnText}>{t('midia.abrirCanalYoutube')}</Text>
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
                  {video.isLive && (
                    <View style={s.liveBadge}>
                      <View style={s.liveDot} />
                      <Text style={s.liveBadgeText}>{t('midia.aoVivo')}</Text>
                    </View>
                  )}
                </View>
                <View style={s.videoInfo}>
                  <Text style={s.videoTitle} numberOfLines={2}>{video.title}</Text>
                  <View style={s.videoMeta}>
                    <Ionicons name="time-outline" size={12} color={C.textMuted} />
                    <Text style={s.videoMetaText}>{timeAgo(video.publishedAt, t)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* ══ SHORTS ════════════════════════════════════════════════════════════ */}
      {activeTab === 'shorts' && (
        <ScrollView
          contentContainerStyle={s.tabContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
        >
          <Text style={s.sectionLabel}>{t('midia.videosCurtos')}</Text>
          {loadingShorts ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={C.primary} size="large" />
              <Text style={s.loadingText}>{t('midia.carregando')}</Text>
            </View>
          ) : shorts.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="film-outline" size={48} color={C.textDim} />
              <Text style={s.emptyTitle}>{t('midia.nenhumVideoCurtoAinda')}</Text>
              <Text style={s.emptySub}>{t('midia.devocionaisRapidosEmBreve')}</Text>
            </View>
          ) : (
            <View style={s.shortsGrid}>
              {shorts.map(short => {
                const ytId = short.plataforma === 'youtube' ? extractYoutubeId(short.url) : null;
                return (
                  <TouchableOpacity
                    key={short.id}
                    style={s.shortCard}
                    onPress={() => Linking.openURL(short.url)}
                    activeOpacity={0.85}
                  >
                    {ytId ? (
                      <Image source={{ uri: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` }} style={s.shortThumb} resizeMode="cover" />
                    ) : (
                      <View style={[s.shortThumb, s.shortThumbPlaceholder, {
                        backgroundColor: short.plataforma === 'instagram' ? '#E1306C22' : '#FF000022',
                      }]}>
                        <Ionicons
                          name={short.plataforma === 'instagram' ? 'logo-instagram' : 'logo-youtube'}
                          size={30}
                          color={short.plataforma === 'instagram' ? '#E1306C' : '#FF0000'}
                        />
                      </View>
                    )}
                    <View style={s.shortPlayOverlay}>
                      <Ionicons name="play-circle" size={30} color="rgba(255,255,255,0.9)" />
                    </View>
                    <View style={s.shortInfo}>
                      <Text style={s.shortTitle} numberOfLines={2}>{short.titulo}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* ══ MENSAGENS (blog) ═════════════════════════════════════════════════ */}
      {activeTab === 'mensagens' && (
        <ScrollView
          contentContainerStyle={s.tabContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
        >
          <Text style={s.sectionLabel}>{t('midia.mensagensTitulo')}</Text>
          {loadingMensagens ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={C.primary} size="large" />
              <Text style={s.loadingText}>{t('midia.carregando')}</Text>
            </View>
          ) : mensagens.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="newspaper-outline" size={48} color={C.textDim} />
              <Text style={s.emptyTitle}>{t('midia.nenhumaMensagemAinda')}</Text>
            </View>
          ) : (
            mensagens.map(msg => (
              <MensagemCard key={msg.id} msg={msg} onPress={() => setMensagemAberta(msg)} />
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
          <Text style={s.sectionLabel}>{t('midia.noticiasEAvisos')}</Text>
          {loadingAvisos ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : avisos.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="megaphone-outline" size={48} color={C.textDim} />
              <Text style={s.emptyTitle}>{t('midia.nenhumAvisoPublicadoAinda')}</Text>
              <Text style={s.emptySub}>{t('midia.avisosApareceraoAqui')}</Text>
            </View>
          ) : (
            avisos.map(aviso => {
              const cor = tipoAvisoCor(aviso.tipo, t);
              return (
                <View key={aviso.id} style={[s.avisoCard, { backgroundColor: cor.bg, borderColor: cor.border }]}>
                  <View style={s.avisoHeader}>
                    <Text style={[s.avisoTipo, { color: cor.text }]}>{cor.label}</Text>
                    <Text style={s.avisoData}>{timeAgo(aviso.data, t)}</Text>
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
            <Text style={s.podcastTitle}>{t('midia.podcastTitulo')}</Text>
            <Text style={s.podcastSub}>{t('midia.podcastSub')}</Text>
          </View>

          <Text style={s.sectionLabel}>{t('midia.oucaEm')}</Text>
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
              {t('midia.emBrevePodcast')}
            </Text>
          </View>
        </ScrollView>
      )}

      {/* ══ SOCIAL ════════════════════════════════════════════════════════════ */}
      {activeTab === 'social' && (
        <ScrollView contentContainerStyle={s.tabContent}>
          <Text style={s.sectionLabel}>{t('midia.nossasRedesSociais')}</Text>

          {[
            { nome: 'YouTube',   handle: '@PenielChurchOfficial',      icon: 'logo-youtube',   cor: '#FF0000', url: YOUTUBE_CHANNEL_URL,  desc: t('midia.descYoutube') },
            { nome: 'Instagram', handle: '@penielchurchofficial',       icon: 'logo-instagram', cor: '#E1306C', url: INSTAGRAM_URL,        desc: t('midia.descInstagram') },
            { nome: 'Facebook',  handle: 'penielchurchofficial',        icon: 'logo-facebook',  cor: '#1877F2', url: FACEBOOK_URL,         desc: t('midia.descFacebook') },
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
        </ScrollView>
      )}

      <MensagemDetalheModal mensagem={mensagemAberta} onClose={() => setMensagemAberta(null)} />
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
  shortsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  shortCard: { width: '48%', aspectRatio: 9 / 14, borderRadius: 14, overflow: 'hidden', backgroundColor: C.surface, marginBottom: 14, position: 'relative' },
  shortThumb: { width: '100%', height: '100%' },
  shortThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  shortPlayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  shortInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, backgroundColor: 'rgba(0,0,0,0.55)' },
  shortTitle: { fontSize: 12, fontWeight: '700', color: '#fff' },
  liveBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E84B1A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  videoInfo: { padding: 12 },
  videoTitle: { fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 20, marginBottom: 6 },
  videoMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  videoMetaText: { fontSize: 11, color: C.textMuted },
  // Avisos
  // Mensagens (blog)
  mensagemCard: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 14, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  mensagemThumb: { width: 96, height: '100%', minHeight: 96 },
  mensagemInfo: { flex: 1, padding: 12, gap: 3 },
  mensagemData: { fontSize: 10, color: C.textDim, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  mensagemTitulo: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 2 },
  mensagemResumo: { fontSize: 12, color: C.textMuted, lineHeight: 17, marginTop: 2 },
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
