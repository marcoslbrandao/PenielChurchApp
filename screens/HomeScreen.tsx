import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Animated, PanResponder, Linking, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { useNotifications } from '../lib/useNotifications';
import { useBirthdays } from '../lib/useBirthdays';
import { getUltimaVisita, marcarComoVistoAgora, getIdsDispensados, dispensarAviso } from '../lib/notificacoesLidas';
import { linhaCompartilharApp } from '../lib/appLinks';
import BirthdayBanner from '../components/BirthdayBanner';
import MensagemDetalheModal, { Mensagem } from '../components/MensagemDetalheModal';
import { livrosAT, livrosNT, Livro } from '../lib/bibliaLivros';
import { useVersiculoDoDia, parseReferencia, getTextoVersiculo, getReferenciaVersiculo, getVersaoVersiculo } from '../lib/versiculoDoDia';
import { useCampoTraduzido } from '../lib/useTraducao';
import { useTheme } from '../lib/theme';
import { useAcesso } from '../lib/acesso';
import { WebView } from 'react-native-webview';
import { extractYoutubeId, youtubeThumbnail } from '../lib/youtube';

// Paleta local — só os elementos "claros" da Home (cards brancos: live,
// acesso rápido, eventos, especial) precisam trocar no escuro. Os blocos já
// escuros (header, versículo, mensagem, devocional) funcionam nos dois
// temas sem mudar, então ficam com cor fixa.
function paletaHome(isDark: boolean) {
  return isDark ? {
    bg: '#0E0B22',
    cardBg: '#1C1940',
    cardBorder: '#332D5C',
    textPrimary: '#F1EFFA',
    textMuted: '#A69FD6',
    accentText: '#A69FD6',
    eventoDataBg: '#2A2560',
  } : {
    bg: '#F9F8FF',
    cardBg: '#FFFFFF',
    cardBorder: 'rgba(83,74,183,0.13)',
    textPrimary: '#1A1740',
    textMuted: '#8B83D4',
    accentText: '#534AB7',
    eventoDataBg: '#EEEDFE',
  };
}
type PaletaHome = ReturnType<typeof paletaHome>;

// ─── Config ───────────────────────────────────────────────────────────────────
const YOUTUBE_LIVE_URL = 'https://www.youtube.com/@PenielChurchOfficial/streams';
const YOUTUBE_CHANNEL  = 'https://www.youtube.com/@PenielChurchOfficial';
const WHATSAPP_NUMBER  = '447540880456';
const YOUTUBE_API_KEY  = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
const CHANNEL_ID       = 'UCeipicy-AS_b66Asu65TBQQ';


// Resolve o livro (com slug) e capítulo do versículo do dia, para permitir
// abrir o capítulo inteiro na Bíblia a partir da Home.
function resolverLivroDoVersiculo(ref: string): { slug: string; capitulo: number } | null {
  const parsed = parseReferencia(ref);
  if (!parsed) return null;
  const livro = [...livrosAT, ...livrosNT].find(l => l.pt === parsed.livroNome);
  if (!livro) return null;
  return { slug: livro.slug, capitulo: parsed.capitulo };
}

// ─── Busca ────────────────────────────────────────────────────────────────────
type AvisoResult = { id: string; titulo: string; texto: string; data: string; tipo: string };

// Linha de resultado de aviso na busca — título traduzido pro idioma do app.
function AvisoResultRow({ aviso, onPress }: { aviso: AvisoResult; onPress: () => void }) {
  const titulo = useCampoTraduzido(aviso.titulo, 'avisos', aviso.id, 'titulo');
  return (
    <TouchableOpacity style={sm.resultRow} onPress={onPress}>
      <Ionicons name="megaphone-outline" size={16} color="#F5C842" />
      <Text style={sm.resultText} numberOfLines={1}>{titulo}</Text>
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
    </TouchableOpacity>
  );
}

const LOCALE_POR_IDIOMA: Record<string, string> = { pt: 'pt-BR', en: 'en-GB', es: 'es-ES', fr: 'fr-FR' };

// Envolve um item de lista com gesto de arrastar-pra-esquerda-e-soltar-pra-
// apagar. Feito só com PanResponder + Animated (API nativa do React Native)
// de propósito — react-native-gesture-handler daria uma experiência mais
// fluida, mas é um módulo nativo: instalar ele exigiria gerar uma build nova
// na loja (não dá só com `eas update`), quebrando o fluxo rápido de OTA que
// o app usa hoje. Isso aqui já publica na hora.
const SWIPE_LIMIAR = -80;
function SwipeParaRemover({ onRemover, children }: { onRemover: () => void; children: React.ReactNode }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) translateX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < SWIPE_LIMIAR) {
          Animated.timing(translateX, { toValue: -500, duration: 180, useNativeDriver: true }).start(onRemover);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        }
      },
    })
  ).current;

  return (
    <View style={sm.swipeWrap}>
      <View style={sm.swipeDeleteBg}>
        <Ionicons name="trash-outline" size={18} color="#fff" />
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

// Card de aviso no modal de notificações — título e texto traduzidos pro idioma do app.
function NotifAvisoCard({ aviso, onRemover }: { aviso: AvisoResult; onRemover: () => void }) {
  const { i18n } = useTranslation();
  const titulo = useCampoTraduzido(aviso.titulo, 'avisos', aviso.id, 'titulo');
  const texto = useCampoTraduzido(aviso.texto, 'avisos', aviso.id, 'texto');
  const locale = LOCALE_POR_IDIOMA[i18n.language] ?? 'pt-BR';
  return (
    <SwipeParaRemover onRemover={onRemover}>
      <View style={sm.notifCard}>
        <View style={sm.notifIcone}>
          <Ionicons name="megaphone-outline" size={16} color="#F5C842" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sm.notifTitulo}>{titulo}</Text>
          <Text style={sm.notifTexto} numberOfLines={3}>{texto}</Text>
          <Text style={sm.notifData}>{new Date(aviso.data).toLocaleDateString(locale, { day: '2-digit', month: 'short' })}</Text>
        </View>
        <TouchableOpacity
          style={sm.notifExcluirBtn}
          onPress={onRemover}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.45)" />
        </TouchableOpacity>
      </View>
    </SwipeParaRemover>
  );
}

function SearchModal({ visible, onClose, navigation }: {
  visible: boolean; onClose: () => void; navigation?: any;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [avisos, setAvisos] = useState<AvisoResult[]>([]);
  const [loadingAvisos, setLoadingAvisos] = useState(false);
  const [avisoAberto, setAvisoAberto] = useState<AvisoResult | null>(null);

  useEffect(() => { if (!visible) { setQuery(''); setAvisos([]); setAvisoAberto(null); } }, [visible]);

  useEffect(() => {
    if (query.trim().length < 2) { setAvisos([]); return; }
    setLoadingAvisos(true);
    const t = setTimeout(() => {
      supabase.from('avisos').select('*')
        .or(`titulo.ilike.%${query.trim()}%,texto.ilike.%${query.trim()}%`)
        .limit(10)
        .then(({ data }) => { setAvisos((data as AvisoResult[]) ?? []); setLoadingAvisos(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const langKey = 'pt' as const;
  const livrosEncontrados = query.trim().length >= 2
    ? [...livrosAT, ...livrosNT].filter(l => l[langKey].toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  const abrirLivro = (livro: Livro) => {
    onClose();
    navigation?.navigate('Biblia');
  };

  const avisoAbertoTitulo = useCampoTraduzido(avisoAberto?.titulo, 'avisos', avisoAberto?.id, 'titulo');
  const avisoAbertoTexto = useCampoTraduzido(avisoAberto?.texto, 'avisos', avisoAberto?.id, 'texto');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={sm.overlay}>
        <View style={sm.sheet}>
          <View style={sm.searchRow}>
            <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.5)" />
            <TextInput
              style={sm.input}
              placeholder={t('home.buscarPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            <TouchableOpacity onPress={onClose}>
              <Text style={sm.cancelar}>{t('common.cancelar')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ marginTop: 14 }} keyboardShouldPersistTaps="handled">
            {query.trim().length < 2 ? (
              <Text style={sm.hint}>{t('home.digiteDuasLetras')}</Text>
            ) : (
              <>
                {livrosEncontrados.length > 0 && (
                  <>
                    <Text style={sm.sectionTitle}>{t('tabs.biblia')}</Text>
                    {livrosEncontrados.map(l => (
                      <TouchableOpacity key={l.slug} style={sm.resultRow} onPress={() => abrirLivro(l)}>
                        <Ionicons name="book-outline" size={16} color="#F5C842" />
                        <Text style={sm.resultText}>{l.pt}</Text>
                        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
                      </TouchableOpacity>
                    ))}
                  </>
                )}

                <Text style={sm.sectionTitle}>{t('home.avisosSectionTitle')}</Text>
                {loadingAvisos ? (
                  <ActivityIndicator color="#F5C842" style={{ marginVertical: 16 }} />
                ) : avisos.length === 0 ? (
                  <Text style={sm.hint}>{t('home.nenhumAvisoEncontrado')}</Text>
                ) : (
                  avisos.map(a => (
                    <AvisoResultRow key={a.id} aviso={a} onPress={() => setAvisoAberto(a)} />
                  ))
                )}

                {livrosEncontrados.length === 0 && avisos.length === 0 && !loadingAvisos && (
                  <Text style={[sm.hint, { marginTop: 20 }]}>{t('home.nadaEncontradoPara', { query })}</Text>
                )}
              </>
            )}
            <View style={{ height: 30 }} />
          </ScrollView>

          {avisoAberto && (
            <View style={sm.avisoOverlay}>
              <View style={sm.avisoCard}>
                <View style={sm.avisoHeader}>
                  <Text style={sm.avisoTitulo}>{avisoAbertoTitulo}</Text>
                  <TouchableOpacity onPress={() => setAvisoAberto(null)}>
                    <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                </View>
                <ScrollView>
                  <Text style={sm.avisoTexto}>{avisoAbertoTexto}</Text>
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const sm = StyleSheet.create({
  swipeHint: { fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginBottom: 10 },
  swipeWrap: { marginBottom: 10, borderRadius: 12, overflow: 'hidden' },
  swipeDeleteBg: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 70, backgroundColor: '#C0392B', alignItems: 'center', justifyContent: 'center' },
  // Opaco de propósito (não translúcido como antes): esse card fica em cima
  // do fundo vermelho de "remover" que aparece ao arrastar — se fosse
  // translúcido, o vermelho vazaria por trás mesmo sem arrastar nada.
  notifCard: { flexDirection: 'row', gap: 12, backgroundColor: '#242052', borderRadius: 12, padding: 14 },
  notifIcone: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(245,200,66,0.15)', alignItems: 'center', justifyContent: 'center' },
  notifTitulo: { fontSize: 14, fontWeight: '700', color: '#fff' },
  notifTexto: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4, lineHeight: 18 },
  notifData: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6 },
  notifExcluirBtn: { alignSelf: 'flex-start', padding: 4 },
  overlay: { flex: 1, backgroundColor: '#1A1740', paddingTop: 55 },
  sheet: { flex: 1, paddingHorizontal: 18 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 14, height: 46 },
  input: { flex: 1, fontSize: 15, color: '#fff' },
  cancelar: { fontSize: 13, color: '#F5C842', fontWeight: '600', marginLeft: 4 },
  hint: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8 },
  resultText: { flex: 1, fontSize: 14, color: '#fff' },
  avisoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  avisoCard: { backgroundColor: '#241D5C', borderRadius: 16, padding: 18, maxHeight: '70%', width: '100%' },
  avisoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  avisoTitulo: { fontSize: 16, fontWeight: '700', color: '#fff', flex: 1, marginRight: 10 },
  avisoTexto: { fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 21 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Meses abreviados por idioma do app, para a data dos eventos recorrentes.
const MESES_ABREV: Record<string, string[]> = {
  pt: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  es: ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'],
  fr: ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'],
};
function proximaData(diaSemana: number, lang: string = 'pt'): { dia: number; mes: string } {
  const MESES = MESES_ABREV[lang] ?? MESES_ABREV.pt;
  const hoje = new Date();
  const diff = (diaSemana - hoje.getDay() + 7) % 7;
  const proxima = new Date(hoje);
  proxima.setDate(hoje.getDate() + diff);
  return { dia: proxima.getDate(), mes: MESES[proxima.getMonth()] };
}

// ─── Eventos recorrentes (0=Dom,1=Seg,...,6=Sáb) ─────────────────────────────
// "nome"/"local" com sufixo Key são traduzidos via i18n (chaves em home.*);
// endereços e nomes próprios (Zoom, Abbey Square, Peniel Alive) ficam iguais
// em qualquer idioma.
const eventosRecorrentes = [
  { id: 1, nomeKey: 'eventoCultoDominical', diaSemana: 0, horario: '18h', local: 'Abbey Square, Reading', tipo: 'presencial' },
  { id: 2, nomeKey: 'eventoSalaDeOracao',    diaSemana: 3, horario: '21h', local: 'Zoom',                  tipo: 'online'     },
  { id: 3, nomeKey: 'eventoEstudoBiblico',   diaSemana: 5, horario: '20h', local: 'Zoom',                  tipo: 'online'     },
  { id: 4, nome: 'Peniel Alive',             diaSemana: 6, horario: '19h', localKey: 'localNasCasas',      tipo: 'jovens'     },
];

// ─── Aviso em destaque na Home ────────────────────────────────────────────────
// Avisos sempre existiram, mas só no sininho e na busca — quem não abrisse o
// sininho nunca via. Marcado como destaque no Admin, o aviso sobe pro topo da
// Home, antes do versículo, que é o primeiro lugar onde o olho cai ao abrir.
// Cada pessoa pode fechar no X: usa o MESMO mecanismo do sininho
// (`dispensarAviso`), então fechar aqui também some de lá, e vice-versa —
// é o mesmo aviso, não faria sentido ter dois estados de "já vi isso".
type AvisoDestaque = { id: string; titulo: string; texto: string; tipo: string };

function AvisoDestaqueCard({ aviso, onDispensar }: { aviso: AvisoDestaque; onDispensar: () => void }) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paletaHome(isDark), [isDark]);
  const styles = useMemo(() => buildStyles(C), [C]);
  const titulo = useCampoTraduzido(aviso.titulo, 'avisos', aviso.id, 'titulo');
  const texto = useCampoTraduzido(aviso.texto, 'avisos', aviso.id, 'texto');

  return (
    <View style={styles.avisoDestaqueCard}>
      <View style={styles.avisoDestaqueTopo}>
        <Ionicons name="megaphone" size={15} color="#E84B1A" />
        <Text style={styles.avisoDestaqueLabel}>{t('home.avisoImportante')}</Text>
        <TouchableOpacity onPress={onDispensar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={18} color={C.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.avisoDestaqueTitulo}>{titulo}</Text>
      {!!texto && <Text style={styles.avisoDestaqueTexto}>{texto}</Text>}
    </View>
  );
}

// ─── Short em destaque na Home ────────────────────────────────────────────────
// Card largo com a miniatura do vídeo. A miniatura do YouTube é montada só a
// partir do id (sem API, sem chave, sem cota — ver lib/youtube.ts). Instagram
// não permite isso, então cai num card sem imagem, com o ícone da plataforma.
type ShortDestaque = { id: string; titulo: string; url: string; plataforma: string };

function ShortDestaqueCard({ short }: { short: ShortDestaque }) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paletaHome(isDark), [isDark]);
  const styles = useMemo(() => buildStyles(C), [C]);
  const titulo = useCampoTraduzido(short.titulo, 'shorts_videos', short.id, 'titulo');
  const ytId = short.plataforma === 'youtube' ? extractYoutubeId(short.url) : null;

  // A WebView só é montada depois do toque. Deixar o iframe do YouTube
  // carregando toda vez que alguém abre a Home custa rede e bateria de graça
  // — a esmagadora maioria das aberturas não vai tocar o vídeo.
  const [tocando, setTocando] = useState(false);

  // playsinline=1 (+ allowsInlineMediaPlayback na WebView) é o que impede o
  // iOS de sequestrar o vídeo pro player nativo em tela cheia. rel=0 limita
  // os vídeos sugeridos no fim aos do próprio canal.
  const embedUrl = ytId
    ? `https://www.youtube.com/embed/${ytId}?playsinline=1&autoplay=1&rel=0&modestbranding=1`
    : null;

  return (
    <>
      <Text style={styles.secaoTitulo}>{t('home.videoEmDestaque')}</Text>

      {tocando && embedUrl ? (
        <View style={styles.shortPlayerCard}>
          <View style={styles.shortPlayer}>
            <WebView
              source={{ uri: embedUrl }}
              style={{ flex: 1, backgroundColor: '#000' }}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo
            />
          </View>
          <View style={styles.shortPlayerRodape}>
            <Text style={[styles.shortTitulo, { flex: 1 }]} numberOfLines={1}>{titulo}</Text>
            <TouchableOpacity onPress={() => setTocando(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={C.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.shortCard}
          activeOpacity={0.85}
          // Sem id do YouTube (short de Instagram, ou link digitado errado) não
          // há player pra embutir — aí o comportamento antigo, abrir fora.
          onPress={() => (embedUrl ? setTocando(true) : Linking.openURL(short.url))}
        >
          {ytId ? (
            <View style={styles.shortThumbWrap}>
              <Image source={{ uri: youtubeThumbnail(ytId) }} style={styles.shortThumb} resizeMode="cover" />
              <View style={styles.shortPlay}>
                <Ionicons name="play" size={22} color="#fff" />
              </View>
            </View>
          ) : (
            <View style={[styles.shortThumbWrap, styles.shortThumbVazia]}>
              <Ionicons
                name={short.plataforma === 'instagram' ? 'logo-instagram' : 'logo-youtube'}
                size={34}
                color={short.plataforma === 'instagram' ? '#E1306C' : '#FF0000'}
              />
            </View>
          )}
          <View style={styles.shortInfo}>
            <Text style={styles.shortTitulo} numberOfLines={2}>{titulo}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons
                name={short.plataforma === 'instagram' ? 'logo-instagram' : 'logo-youtube'}
                size={13}
                color={C.textMuted}
              />
              <Text style={styles.eventoMetaTexto}>{t('home.tocarParaAssistir')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} style={{ marginRight: 12 }} />
        </TouchableOpacity>
      )}
    </>
  );
}

// ─── Destaque na Home ─────────────────────────────────────────────────────────
// O card grande de chamada de ação da Home. Antes era um bloco fixo escrito à
// mão no JSX (Camping Peniel 2026, com data e link no código), o que fazia a
// Home ignorar completamente a Agenda — apagar o evento no Admin não tirava
// nada daqui. Agora ele vem da própria tabela `agenda_eventos`: o evento
// marcado como "Destaque na Home" no Painel Admin aparece neste card, e
// desmarcar tira da Home sem apagar nada da Agenda.
type DestaqueHome = {
  id: string; nome: string; descricao: string | null; cor: string | null;
  data: string | null; recorrente: boolean; dia_semana: number | null;
  horario: string; cta_texto: string | null; cta_url: string | null;
};

function DestaqueHomeCard({ evento, onAbrirAgenda }: { evento: DestaqueHome; onAbrirAgenda: () => void }) {
  const { t, i18n } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paletaHome(isDark), [isDark]);
  const styles = useMemo(() => buildStyles(C), [C]);
  // Nome e descrição são digitados em português pelo admin — traduzidos aqui
  // pelo mesmo mecanismo já usado na Agenda e no card de Devocional.
  const nome = useCampoTraduzido(evento.nome, 'agenda_eventos', evento.id, 'nome');
  const descricao = useCampoTraduzido(evento.descricao ?? '', 'agenda_eventos', evento.id, 'descricao');
  const ctaTexto = useCampoTraduzido(evento.cta_texto ?? '', 'agenda_eventos', evento.id, 'cta_texto');
  const cor = evento.cor ?? '#E84B1A';

  // Evento com data marcada mostra a data cheia; recorrente mostra a próxima
  // ocorrência (mesma conta da lista de "Próximos eventos" logo acima).
  const MESES_LONGOS = t('agenda.mesesLongos', { returnObjects: true }) as string[];
  const DE = t('agenda.dataDe');
  let dataLabel = evento.horario;
  if (!evento.recorrente && evento.data) {
    const d = new Date(`${evento.data}T12:00:00`);
    const dataStr = `${d.getDate()} ${DE} ${MESES_LONGOS[d.getMonth()]} ${DE} ${d.getFullYear()}`;
    dataLabel = evento.horario ? `${dataStr} · ${evento.horario}` : dataStr;
  } else if (evento.recorrente && evento.dia_semana !== null) {
    const prox = proximaData(evento.dia_semana, i18n.language);
    dataLabel = `${prox.dia} ${prox.mes} · ${evento.horario}`;
  }

  // Sem link cadastrado, tocar no card leva pra Agenda em vez de não fazer nada.
  const abrir = () => { if (evento.cta_url) Linking.openURL(evento.cta_url); else onAbrirAgenda(); };

  return (
    <TouchableOpacity style={styles.especialCard} activeOpacity={0.85} onPress={abrir}>
      <View style={[styles.especialCorFaixa, { backgroundColor: cor }]} />
      <View style={styles.especialCorpo}>
        <Text style={styles.especialNome}>{nome}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="calendar-outline" size={13} color={C.textMuted} />
          <Text style={styles.eventoMetaTexto}>{dataLabel}</Text>
        </View>
        {!!descricao && <Text style={styles.especialDesc}>{descricao}</Text>}
        {!!ctaTexto && (
          <View style={[styles.especialCta, { backgroundColor: cor }]}>
            <Text style={styles.especialCtaTexto}>{ctaTexto}</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.textMuted} style={{ marginRight: 12 }} />
    </TouchableOpacity>
  );
}

export default function HomeScreen({ navigation }: { navigation?: any }) {
  const { t, i18n } = useTranslation();
  const { user, isLoggedIn } = useAuth();
  const { ehMembro, carregando: carregandoPapel } = useAcesso();
  const { isDark } = useTheme();
  const C = useMemo(() => paletaHome(isDark), [isDark]);
  const styles = useMemo(() => buildStyles(C), [C]);

  // A aba "Membros" só existe pra quem é membro (ver App.tsx). Os atalhos da
  // Home que apontavam direto pra ela ficariam mortos para todo mundo — agora
  // levam ao caminho certo: login pra quem não tem conta, ativação de membro
  // pra quem tem conta mas ainda não é membro.
  const abrirAreaMembro = (params?: any) => {
    // Enquanto o papel não chega do servidor, `ehMembro` é false — e sem esta
    // guarda um membro que tocasse em "Grupos" nos primeiros segundos depois
    // de abrir o app era mandado para a tela de "digite seu código de convite".
    if (carregandoPapel) return;
    if (ehMembro) { navigation?.navigate('Membros', params); return; }
    navigation?.navigate(isLoggedIn ? 'AtivarMembro' : 'Auth');
  };
  const { todayBirthdays } = useBirthdays();
  useNotifications(user?.id);

  // Animação pisca do botão LIVE
  const blink = useRef(new Animated.Value(1)).current;

  // ── Detecção automática de LIVE ───────────────────────────────────────────
  const [isLive, setIsLive] = useState(false);
  const [liveTitle, setLiveTitle] = useState('Peniel Church — YouTube');

  useEffect(() => {
    // Verifica se o canal está ao vivo sem gastar cota da YouTube Data API:
    // a URL /channel/{id}/live redireciona automaticamente para o vídeo ao
    // vivo (watch?v=...) quando há uma transmissão ativa. Isso é só uma
    // página do YouTube, sem chave de API nem limite de cota — importante
    // porque a busca via API (googleapis.com/youtube/v3/search) custa 100
    // unidades por chamada, e com essa verificação rodando a cada poucos
    // minutos em vários celulares ao mesmo tempo (ex: todo mundo abrindo o
    // app durante o culto), a cota diária gratuita (10.000 unidades) estoura
    // muito rápido — foi o que provavelmente já estava acontecendo antes.
    // Espelha o isLive fora do state do React, pra decidir a cadência do
    // fallback abaixo sem cair em closure desatualizada (o efeito só roda
    // uma vez, então "isLive" capturado no useEffect nunca mudaria).
    let estaAoVivo = false;

    const checkLiveSemCota = async (): Promise<boolean> => {
      try {
        const res = await fetch(`https://www.youtube.com/channel/${CHANNEL_ID}/live`, {
          redirect: 'follow',
          headers: {
            // Sem isso, o YouTube às vezes responde com a página de aviso de
            // cookies (comum pra usuários na UE/Reino Unido) em vez de
            // redirecionar direto pro vídeo — então o app lê "não está ao
            // vivo" mesmo com a transmissão rolando. Esse cookie de consentimento
            // já pré-aceito evita essa página intermediária.
            Cookie: 'CONSENT=YES+cb.20210328-17-p0.en+FX+119; SOCS=CAI',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        const finalUrl = res.url ?? '';
        const match = finalUrl.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
        if (!match) { estaAoVivo = false; setIsLive(false); return true; }
        const videoId = match[1];
        estaAoVivo = true;
        setIsLive(true);
        try {
          const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
          const oembed = await oembedRes.json();
          if (oembed?.title) setLiveTitle(oembed.title);
        } catch {
          // Sem título disponível — mantém o título genérico, sem problema.
        }
        return true;
      } catch {
        return false; // Falha de rede/parse — deixa o fallback decidir.
      }
    };

    // Fallback via YouTube Data API — usado (a) se a checagem gratuita falhar
    // (ex: YouTube mudou a página), ou (b) periodicamente como rede de
    // segurança, caso a checagem gratuita esteja dizendo "não está ao vivo"
    // de forma equivocada. Gasta cota, então roda bem menos vezes.
    const checkLiveComApi = async () => {
      try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&eventType=live&type=video&key=${YOUTUBE_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          estaAoVivo = true;
          setIsLive(true);
          setLiveTitle(data.items[0].snippet.title);
        }
      } catch {
        // Silencioso — se ambos os métodos falharem, mantém o último estado.
      }
    };

    let ciclo = 0;
    const checkLive = async () => {
      ciclo++;
      const ok = await checkLiveSemCota();
      if (!ok) {
        // A checagem gratuita falhou de vez (erro de rede/parse) — usa a API.
        await checkLiveComApi();
      } else {
        // Confirma com a API de tempos em tempos, como rede de segurança.
        // Enquanto o app acha que NÃO está ao vivo, confirma mais rápido
        // (a cada ~4,5min) — é quando um falso-negativo realmente importa,
        // porque senão o botão fica "Off" por até 15min mesmo com a live no ar.
        // Já ao vivo, confirma menos (a cada ~15min) só pra manter o título em dia.
        const intervaloCiclos = estaAoVivo ? 10 : 3;
        if (ciclo % intervaloCiclos === 0) {
          await checkLiveComApi();
        }
      }
    };

    checkLive();
    // Verifica a cada 90 segundos — o método principal não gasta cota, então
    // dá pra checar com mais frequência sem risco.
    const interval = setInterval(checkLive, 90 * 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!isLive) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isLive]);

  const [searchVisible, setSearchVisible] = useState(false);

  // ── Tradução ao vivo do culto (Azure Speech, ver traducao_ao_vivo) ────────
  // Só mostra o botão de entrada quando há uma sessão ativa — o serviço no
  // Mac mini marca `ativa = true`/`false` no início/fim do culto com tradução.
  const [traducaoAtiva, setTraducaoAtiva] = useState(false);
  useEffect(() => {
    let ativo = true;
    supabase.from('traducao_ao_vivo').select('ativa').eq('id', 1).maybeSingle().then(({ data }) => {
      if (ativo) setTraducaoAtiva(!!data?.ativa);
    });
    const canal = supabase
      .channel('traducao-status-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'traducao_ao_vivo' }, (payload) => {
        setTraducaoAtiva(!!(payload.new as { ativa?: boolean } | null)?.ativa);
      })
      .subscribe();
    return () => { ativo = false; supabase.removeChannel(canal); };
  }, []);

  // ── Devocional em destaque (publicado pelo Admin) ─────────────────────────
  const [devocional, setDevocional] = useState<{ id: string; titulo: string; versiculo: string; referencia: string; texto: string } | null>(null);
  const [devocionalAberto, setDevocionalAberto] = useState(false);
  const devocionalTituloTraduzido = useCampoTraduzido(devocional?.titulo, 'devocionais', devocional?.id, 'titulo');
  const devocionalVersiculoTraduzido = useCampoTraduzido(devocional?.versiculo, 'devocionais', devocional?.id, 'versiculo');
  const devocionalReferenciaTraduzida = useCampoTraduzido(devocional?.referencia, 'devocionais', devocional?.id, 'referencia');
  const devocionalTextoTraduzido = useCampoTraduzido(devocional?.texto, 'devocionais', devocional?.id, 'texto');

  // useFocusEffect (não useEffect simples) — assim o card sempre mostra o
  // devocional mais recente ao voltar pra Home, mesmo se o admin publicou um
  // novo enquanto a aba já estava montada (a Home não desmonta ao trocar de
  // aba, então um useEffect com [] só rodaria de novo se o app reabrisse).
  useFocusEffect(
    useCallback(() => {
      supabase
        .from('devocionais')
        .select('id, titulo, versiculo, referencia, texto')
        .is('grupo', null)
        .order('data', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => { setDevocional((data as any) ?? null); });
    }, [])
  );

  // ── Mensagem de domingo em destaque (blog) ────────────────────────────────
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [mensagemAberta, setMensagemAberta] = useState(false);
  const mensagemTituloTraduzido = useCampoTraduzido(mensagem?.titulo, 'mensagens', mensagem?.id, 'titulo');
  const mensagemResumoTraduzido = useCampoTraduzido(mensagem?.resumo, 'mensagens', mensagem?.id, 'resumo');

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('mensagens')
        .select('id, titulo, resumo, conteudo, imagem_url, autor, data')
        .order('data', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => { setMensagem((data as Mensagem) ?? null); });
    }, [])
  );

  // ── Aviso em destaque na Home ─────────────────────────────────────────────
  // Depois de achar o aviso, ainda filtra pelos dispensados: se a pessoa já
  // fechou esse aviso (aqui ou no sininho), ele não volta.
  const [avisoDestaque, setAvisoDestaque] = useState<AvisoDestaque | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelado = false;
      (async () => {
        const { data } = await supabase
          .from('avisos')
          .select('id, titulo, texto, tipo')
          .eq('destaque_home', true)
          .limit(1)
          .maybeSingle();
        if (cancelado) return;
        if (!data) { setAvisoDestaque(null); return; }
        const dispensados = await getIdsDispensados(user?.id);
        if (cancelado) return;
        setAvisoDestaque(dispensados.includes((data as any).id) ? null : (data as AvisoDestaque));
      })();
      return () => { cancelado = true; };
    }, [user?.id])
  );

  const dispensarAvisoDestaque = async () => {
    if (!avisoDestaque) return;
    const id = avisoDestaque.id;
    setAvisoDestaque(null); // some na hora; a gravação vai atrás
    await dispensarAviso(id, user?.id);
  };

  // ── Short em destaque na Home ─────────────────────────────────────────────
  const [shortDestaque, setShortDestaque] = useState<ShortDestaque | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('shorts_videos')
        .select('id, titulo, url, plataforma')
        .eq('destaque_home', true)
        .limit(1)
        .maybeSingle()
        .then(({ data }) => { setShortDestaque((data as ShortDestaque) ?? null); });
    }, [])
  );

  // ── Evento em destaque na Home (vindo da Agenda) ──────────────────────────
  // useFocusEffect (não useEffect) pelo mesmo motivo do Devocional: a Home não
  // desmonta ao trocar de aba, então sem isso trocar o destaque no Admin só
  // apareceria depois de fechar e reabrir o app.
  const [destaque, setDestaque] = useState<DestaqueHome | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('agenda_eventos')
        .select('id, nome, descricao, cor, data, recorrente, dia_semana, horario, cta_texto, cta_url')
        .eq('destaque_home', true)
        .limit(1)
        .maybeSingle()
        .then(({ data }) => { setDestaque((data as DestaqueHome) ?? null); });
    }, [])
  );

  // ── Notificações (sininho) ────────────────────────────────────────────────
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [notifAvisos, setNotifAvisos] = useState<AvisoResult[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifDismissedIds, setNotifDismissedIds] = useState<string[]>([]);
  const [notifNaoLidas, setNotifNaoLidas] = useState(0);

  // Sem filtro de grupo aqui de propósito: a RLS de `avisos` já mistura os
  // avisos gerais com os do(s) grupo(s) de que o usuário é membro/líder —
  // aparecem juntos no sininho, mas só quem tem acesso ao grupo vê os dele.
  // "Não lida" é contado localmente (AsyncStorage) comparando com a última
  // vez que o sininho foi aberto — não existe coluna "lida" no banco porque
  // avisos são um mural compartilhado, não uma caixa de entrada por usuário.
  useEffect(() => {
    (async () => {
      const [dismissed, ultimaVisita, { data }] = await Promise.all([
        getIdsDispensados(user?.id),
        getUltimaVisita(),
        supabase.from('avisos').select('*').order('created_at', { ascending: false }).limit(10),
      ]);
      setNotifDismissedIds(dismissed);
      const lista = ((data as AvisoResult[]) ?? []).filter(a => !dismissed.includes(a.id));
      setNotifAvisos(lista);
      const naoLidas = ultimaVisita
        ? lista.filter(a => new Date(a.data).getTime() > new Date(ultimaVisita).getTime()).length
        : lista.length;
      setNotifNaoLidas(naoLidas);
    })();
  }, [user?.id]);

  const abrirNotificacoes = () => {
    setNotifModalVisible(true);
    setNotifLoading(true);
    supabase.from('avisos').select('*').order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => {
        const lista = ((data as AvisoResult[]) ?? []).filter(a => !notifDismissedIds.includes(a.id));
        setNotifAvisos(lista);
        setNotifLoading(false);
        setNotifNaoLidas(0);
        marcarComoVistoAgora();
      });
  };

  // dispensarAviso salva no Supabase (por conta, permanente entre
  // reinstalações) quando a pessoa está logada, além de local — ver
  // lib/notificacoesLidas.ts.
  const removerNotificacao = async (id: string) => {
    setNotifAvisos(prev => prev.filter(a => a.id !== id));
    const novos = await dispensarAviso(id, user?.id);
    setNotifDismissedIds(novos);
  };

  const openYouTube = () => Linking.openURL(isLive ? YOUTUBE_LIVE_URL : YOUTUBE_CHANNEL);
  const openWhatsApp = (msg = '') => {
    const url = `https://wa.me/${WHATSAPP_NUMBER}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
    Linking.openURL(url).catch(() => Alert.alert(t('common.erro'), t('grupos.erroWhatsapp')));
  };

  // Versículo do dia no idioma atual do app (Perfil > Idioma).
  // Hook, não constante de módulo: a tela monta uma vez só e o app fica
  // dias aberto em segundo plano — como constante, quem não fecha o app
  // continuaria vendo o versículo de ontem.
  const VERSICULO_DIA_RAW = useVersiculoDoDia();
  const LIVRO_VERSICULO_DIA = useMemo(() => resolverLivroDoVersiculo(VERSICULO_DIA_RAW.ref), [VERSICULO_DIA_RAW.ref]);
  const versiculoTexto = getTextoVersiculo(VERSICULO_DIA_RAW, i18n.language);
  const versiculoRef = getReferenciaVersiculo(VERSICULO_DIA_RAW, i18n.language);
  const versiculoVersaoIdioma = getVersaoVersiculo(i18n.language);

  const [salvandoVersiculo, setSalvandoVersiculo] = useState(false);
  const handleSalvarVersiculo = async () => {
    if (!isLoggedIn || !user) {
      Alert.alert(t('biblia.facaLogin'), t('biblia.entreParaSalvarVersiculos'));
      return;
    }
    setSalvandoVersiculo(true);
    const { error } = await supabase.from('saved_verses').upsert(
      { user_id: user.id, texto: versiculoTexto, referencia: versiculoRef, versao: versiculoVersaoIdioma },
      { onConflict: 'user_id,referencia,versao' }
    );
    setSalvandoVersiculo(false);
    if (error) { Alert.alert(t('biblia.erroAoSalvar'), error.message); return; }
    Alert.alert(t('biblia.salvoTitulo'), t('biblia.salvoMsg'));
  };

  // Calcula datas dos próximos eventos
  const eventos = eventosRecorrentes.map(e => ({
    ...e, ...proximaData(e.diaSemana, i18n.language),
    hoje: e.diaSemana === new Date().getDay(),
  }));

  const tagStyle = (tipo: string) => ({
    bg: tipo === 'presencial' ? '#EEEDFE' : tipo === 'online' ? '#E1F5EE' : tipo === 'jovens' ? '#F3E8FF' : '#FEF6DC',
    text: tipo === 'presencial' ? '#534AB7' : tipo === 'online' ? '#085041' : tipo === 'jovens' ? '#6C3DE8' : '#633806',
    label: tipo === 'presencial' ? t('grupos.tagPresencial') : tipo === 'online' ? t('grupos.tagOnline') : tipo === 'jovens' ? t('home.tagJovens') : t('grupos.tagCasa'),
  });

  return (
    <View style={styles.container}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerEsquerda}>
          <Image source={require('../assets/peniel-logo.png')} style={styles.logo} />
          <View>
            <Text style={styles.headerSub}>{t('home.bemVindo')}</Text>
            <Text style={styles.headerTitulo}>{t('home.nomeIgreja')}</Text>
          </View>
        </View>
        <View style={styles.headerIcones}>
          <TouchableOpacity style={styles.iconeBtn} onPress={() => setSearchVisible(true)}>
            <Ionicons name="search-outline" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconeBtn} onPress={abrirNotificacoes}>
            <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.7)" />
            {notifNaoLidas > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{notifNaoLidas > 9 ? '9+' : notifNaoLidas}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>

        {/* ── Aviso importante (marcado no Admin) ──────────────────────────── */}
        {avisoDestaque && (
          <AvisoDestaqueCard aviso={avisoDestaque} onDispensar={dispensarAvisoDestaque} />
        )}

        {/* ── Banner aniversário ───────────────────────────────────────────── */}
        {isLoggedIn && todayBirthdays.length > 0 && (
          <BirthdayBanner birthdays={todayBirthdays} />
        )}

        {/* ── Versículo do dia ─────────────────────────────────────────────── */}
        <View style={styles.versiculo}>
          <Text style={styles.versiculoLabel}>{t('home.versiculoDoDia')}</Text>
          <Text style={styles.versiculoTexto}>"{versiculoTexto}"</Text>
          <View style={styles.versiculoRefRow}>
            <Text style={styles.versiculoRef}>{versiculoRef} - {versiculoVersaoIdioma}</Text>
            {!!LIVRO_VERSICULO_DIA && (
              <TouchableOpacity
                style={styles.versiculoLerCapBtn}
                onPress={() => navigation?.navigate('Biblia', { livroSlug: LIVRO_VERSICULO_DIA.slug, capitulo: LIVRO_VERSICULO_DIA.capitulo })}
              >
                <Text style={styles.versiculoLerCapTexto}>{t('home.lerCapituloInteiro')}</Text>
                <Ionicons name="chevron-forward" size={12} color="#F5C842" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.versiculoBtns}>
            <TouchableOpacity style={styles.versiculoBtn} onPress={() => {
              const { Share } = require('react-native');
              Share.share({ message: `"${versiculoTexto}"\n\n— ${versiculoRef} - ${versiculoVersaoIdioma}\n\n${linhaCompartilharApp()}` });
            }}>
              <Ionicons name="share-outline" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.versiculoBtnTexto}>{t('common.compartilhar')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.versiculoBtnDourado} onPress={handleSalvarVersiculo} disabled={salvandoVersiculo}>
              <Ionicons name="bookmark-outline" size={14} color="#F5C842" />
              <Text style={styles.versiculoBtnDouradoTexto}>{salvandoVersiculo ? t('common.salvando') : t('common.salvar')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Mensagem de domingo em destaque (blog) ──────────────────────── */}
        {mensagem && (
          <TouchableOpacity
            style={styles.mensagemCard}
            activeOpacity={0.9}
            onPress={() => setMensagemAberta(true)}
          >
            {!!mensagem.imagem_url && (
              <Image source={{ uri: mensagem.imagem_url }} style={styles.mensagemImagem} resizeMode="cover" />
            )}
            <View style={styles.mensagemCorpo}>
              <Text style={styles.mensagemLabel}>{t('home.mensagemDeDomingo')}</Text>
              <Text style={styles.mensagemTitulo}>{mensagemTituloTraduzido}</Text>
              <Text style={styles.mensagemResumo} numberOfLines={2}>{mensagemResumoTraduzido}</Text>
              <View style={styles.mensagemLerMais}>
                <Text style={styles.mensagemLerMaisTexto}>{t('home.lerMensagemCompleta')}</Text>
                <Ionicons name="arrow-forward" size={14} color="#F5C842" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Devocional em destaque ───────────────────────────────────────── */}
        {devocional && (
          <TouchableOpacity
            style={styles.devocionalCard}
            activeOpacity={0.85}
            onPress={() => setDevocionalAberto(!devocionalAberto)}
          >
            <View style={styles.devocionalHeader}>
              <View style={styles.devocionalIcone}>
                <Ionicons name="book" size={16} color="#F5C842" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.devocionalLabel}>{t('home.devocional')}</Text>
                <Text style={styles.devocionalTitulo}>{devocionalTituloTraduzido}</Text>
              </View>
              <Ionicons name={devocionalAberto ? 'chevron-up' : 'chevron-down'} size={18} color="rgba(255,255,255,0.4)" />
            </View>
            {devocionalAberto && (
              <View style={styles.devocionalBody}>
                <Text style={styles.devocionalVersiculo}>"{devocionalVersiculoTraduzido}"</Text>
                <Text style={styles.devocionalRef}>{devocionalReferenciaTraduzida}</Text>
                <Text style={styles.devocionalTexto}>{devocionalTextoTraduzido}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.verTodosDevocionais}
          activeOpacity={0.7}
          onPress={() => navigation?.navigate('Devocionais')}
        >
          <Text style={styles.verTodosDevocionaisTexto}>{t('home.verTodosDevocionais')}</Text>
          <Ionicons name="arrow-forward" size={14} color="#F5C842" />
        </TouchableOpacity>

        {/* ── Tradução ao vivo (só aparece com sessão ativa) ─────────────────── */}
        {/* Texto fixo em inglês de propósito (não usa t()): quem procura esse botão é
            justamente quem não fala português, então precisa ler em inglês mesmo
            que o app esteja em pt-BR. */}
        {traducaoAtiva && (
          <TouchableOpacity
            style={styles.verTraducaoAoVivo}
            activeOpacity={0.85}
            onPress={() => navigation?.navigate('TraducaoAoVivo')}
          >
            <Ionicons name="headset" size={16} color="#fff" />
            <Text style={styles.verTraducaoAoVivoTexto}>Live translation available</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </TouchableOpacity>
        )}

        {/* ── Ao vivo ──────────────────────────────────────────────────────── */}
        <View style={styles.secaoHeader}>
          <Text style={styles.secaoTitulo}>{t('home.aoVivoAgora')}</Text>
          {isLive ? (
            <Animated.View style={[styles.liveBadge, { opacity: blink }]}>
              <View style={styles.livePonto} />
              <Text style={styles.liveTexto}>{t('home.live')}</Text>
            </Animated.View>
          ) : (
            <View style={[styles.liveBadge, { backgroundColor: '#555' }]}>
              <Text style={[styles.liveTexto, { color: '#ccc' }]}>OFF</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={[styles.liveCard, isLive && styles.liveCardAtivo]} onPress={openYouTube} activeOpacity={0.8}>
          <View style={[styles.liveThumb, isLive && { backgroundColor: '#C0392B' }]}>
            <Ionicons name="logo-youtube" size={28} color={isLive ? '#fff' : '#E84B1A'} />
          </View>
          <View style={styles.liveInfo}>
            <Text style={styles.liveNome}>
              {isLive ? `🔴 ${liveTitle}` : 'Peniel Church — YouTube'}
            </Text>
            <Text style={styles.liveMeta}>
              {isLive ? t('home.tocarParaAssistir') : t('home.tocarParaVerCanal')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </TouchableOpacity>

        {/* ── Short em destaque (marcado no Admin) ─────────────────────────── */}
        {shortDestaque && <ShortDestaqueCard short={shortDestaque} />}

        {/* ── Acesso rápido ─────────────────────────────────────────────────── */}
        <Text style={styles.secaoTitulo}>{t('home.acessoRapido')}</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation?.navigate('Biblia')}>
            <Ionicons name="book-outline" size={22} color={C.accentText} />
            <Text style={styles.quickTexto}>{t('home.quickBiblia')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation?.navigate('Agenda')}>
            <Ionicons name="calendar-outline" size={22} color={C.accentText} />
            <Text style={styles.quickTexto}>{t('home.quickAgenda')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation?.navigate('Oferta')}>
            <Ionicons name="heart-outline" size={22} color={C.accentText} />
            <Text style={styles.quickTexto}>{t('home.quickOferta')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => abrirAreaMembro({ screen: 'Grupos' })}>
            <Ionicons name="people-outline" size={22} color={C.accentText} />
            <Text style={styles.quickTexto}>{t('home.quickGrupos')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Card Peniel Alive ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.aliveCard}
          activeOpacity={0.85}
          onPress={() => abrirAreaMembro({ screen: 'Grupos', params: { grupoInicial: 'jovens' } })}
        >
          <Image
            source={require('../assets/PenielAlive-Logo.png')}
            style={styles.aliveImage}
            resizeMode="cover"
          />
          <View style={styles.aliveInfo}>
            <Text style={styles.aliveLabel}>{t('home.ministerioJovens')}</Text>
            <Text style={styles.aliveTitle}>Peniel Alive</Text>
            <Text style={styles.aliveSub}>{t('home.eventosDevocionalComunidade')}</Text>
          </View>
          <View style={styles.aliveArrow}>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
          </View>
        </TouchableOpacity>

        {/* ── Próximos eventos ─────────────────────────────────────────────── */}
        <Text style={styles.secaoTitulo}>{t('home.proximosEventos')}</Text>
        <View style={styles.card}>
          {eventos.map((ev, idx) => {
            const tag = tagStyle(ev.tipo);
            return (
              <View key={ev.id} style={[styles.eventoRow, idx === eventos.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.eventoData, ev.hoje && styles.eventoDataHoje]}>
                  <Text style={[styles.eventoDia, ev.hoje && styles.eventoDiaHoje]}>{ev.dia}</Text>
                  <Text style={[styles.eventoMes, ev.hoje && styles.eventoMesHoje]}>{ev.mes}</Text>
                </View>
                <View style={styles.eventoInfo}>
                  <View style={styles.eventoNomeRow}>
                    {ev.hoje && (
                      <View style={styles.hojeBadge}>
                        <Text style={styles.hojeBadgeText}>{t('agenda.hoje')}</Text>
                      </View>
                    )}
                    <Text style={styles.eventoNome} numberOfLines={1}>{ev.nomeKey ? t(`home.${ev.nomeKey}`) : ev.nome}</Text>
                  </View>
                  <Text style={styles.eventoMeta}>{ev.diaSemana === 0 ? t('home.diaDomingo') : ev.diaSemana === 3 ? t('home.diaQuarta') : ev.diaSemana === 5 ? t('home.diaSexta') : t('home.diaSabado')} · {ev.horario} · {ev.localKey ? t(`home.${ev.localKey}`) : ev.local}</Text>
                </View>
                <View style={[styles.eventoTag, { backgroundColor: tag.bg }]}>
                  <Text style={[styles.eventoTagTexto, { color: tag.text }]}>{tag.label}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Evento em destaque (marcado no Admin, some quando desmarcado) ─ */}
        {destaque && (
          <DestaqueHomeCard
            evento={destaque}
            onAbrirAgenda={() => navigation?.navigate('Agenda')}
          />
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      <SearchModal visible={searchVisible} onClose={() => setSearchVisible(false)} navigation={navigation} />

      {/* ── Notificações (sininho) ─────────────────────────────────────────── */}
      <Modal visible={notifModalVisible} animationType="slide" transparent onRequestClose={() => setNotifModalVisible(false)}>
        <View style={sm.overlay}>
          <View style={sm.sheet}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>{t('home.notificacoes')}</Text>
              <TouchableOpacity onPress={() => setNotifModalVisible(false)}>
                <Text style={sm.cancelar}>{t('common.fechar')}</Text>
              </TouchableOpacity>
            </View>
            {notifLoading ? (
              <ActivityIndicator color="#F5C842" style={{ marginTop: 20 }} />
            ) : notifAvisos.length === 0 ? (
              <Text style={sm.hint}>{t('home.nenhumAvisoAinda')}</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={sm.swipeHint}>{t('home.deslizeRemover')}</Text>
                {notifAvisos.map(a => (
                  <NotifAvisoCard key={a.id} aviso={a} onRemover={() => removerNotificacao(a.id)} />
                ))}
                <View style={{ height: 30 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <MensagemDetalheModal mensagem={mensagemAberta ? mensagem : null} onClose={() => setMensagemAberta(false)} />
    </View>
  );
}

function buildStyles(C: PaletaHome) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: '#1A1740', paddingTop: 55, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerEsquerda: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logo: { width: 48, height: 48, borderRadius: 24 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  headerTitulo: { fontSize: 18, fontWeight: '500', color: '#fff', marginTop: 2 },
  headerIcones: { flexDirection: 'row', gap: 10 },
  iconeBtn: { padding: 4, position: 'relative' },
  notifBadge: { position: 'absolute', top: -2, right: -4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: '#E84B1A', borderWidth: 1, borderColor: '#1A1740', alignItems: 'center', justifyContent: 'center' },
  notifBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  scroll: { flex: 1, padding: 14 },
  // Versículo
  versiculo: { backgroundColor: '#1A1740', borderRadius: 16, padding: 20, marginBottom: 16 },
  versiculoLabel: { fontSize: 11, fontWeight: '500', color: '#F5C842', letterSpacing: 1, marginBottom: 8 },
  versiculoTexto: { fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 22, fontStyle: 'italic' },
  versiculoRef: { fontSize: 12, color: 'rgba(255,255,255,0.4)', flexShrink: 1 },
  versiculoRefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  versiculoLerCapBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  versiculoLerCapTexto: { fontSize: 11, fontWeight: '600', color: '#F5C842' },
  versiculoBtns: { flexDirection: 'row', gap: 8, marginTop: 14 },
  versiculoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  versiculoBtnTexto: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  versiculoBtnDourado: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(245,200,66,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  versiculoBtnDouradoTexto: { fontSize: 12, color: '#F5C842' },
  mensagemCard: { backgroundColor: '#1A1740', borderRadius: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(245,200,66,0.25)' },
  mensagemImagem: { width: '100%', height: 150 },
  mensagemCorpo: { padding: 16 },
  mensagemLabel: { fontSize: 10, fontWeight: '700', color: '#F5C842', textTransform: 'uppercase', letterSpacing: 1 },
  mensagemTitulo: { fontSize: 16, fontWeight: '800', color: '#fff', marginTop: 4 },
  mensagemResumo: { fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 19, marginTop: 6 },
  mensagemLerMais: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  mensagemLerMaisTexto: { fontSize: 12, fontWeight: '700', color: '#F5C842' },
  devocionalCard: { backgroundColor: '#241D5C', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(245,200,66,0.2)' },
  devocionalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  devocionalIcone: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(245,200,66,0.15)', alignItems: 'center', justifyContent: 'center' },
  devocionalLabel: { fontSize: 10, fontWeight: '700', color: '#F5C842', textTransform: 'uppercase', letterSpacing: 1 },
  devocionalTitulo: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 2 },
  devocionalBody: { marginTop: 14, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.1)' },
  devocionalVersiculo: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', lineHeight: 20 },
  devocionalRef: { fontSize: 11, fontWeight: '700', color: '#F5C842', marginTop: 6 },
  devocionalTexto: { fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 20, marginTop: 10 },
  verTodosDevocionais: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: -4, marginBottom: 16, alignSelf: 'center',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(245,200,66,0.14)', borderWidth: 1, borderColor: 'rgba(245,200,66,0.4)',
  },
  verTodosDevocionaisTexto: { fontSize: 14, fontWeight: '700', color: '#F5C842' },
  verTraducaoAoVivo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginBottom: 16, alignSelf: 'center',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#E84B1A',
  },
  verTraducaoAoVivoTexto: { fontSize: 14, fontWeight: '700', color: '#fff' },
  // Live
  secaoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  secaoTitulo: { fontSize: 14, fontWeight: '500', color: C.textPrimary, marginBottom: 10 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E84B1A', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  livePonto: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveTexto: { fontSize: 10, fontWeight: '700', color: '#fff' },
  liveCard: { backgroundColor: C.cardBg, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, borderWidth: 0.5, borderColor: C.cardBorder },
  liveCardAtivo: { borderColor: '#E84B1A', borderWidth: 1.5 },
  liveThumb: { width: 56, height: 42, backgroundColor: '#1A1740', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  liveInfo: { flex: 1 },
  liveNome: { fontSize: 13, fontWeight: '500', color: C.textPrimary },
  liveMeta: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  // Quick grid
  quickGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickBtn: { flex: 1, backgroundColor: C.cardBg, borderRadius: 12, padding: 12, alignItems: 'center', gap: 5, borderWidth: 0.5, borderColor: C.cardBorder },
  quickTexto: { fontSize: 10, fontWeight: '500', color: C.accentText },
  // Peniel Alive card
  aliveCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E0A4A', borderRadius: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#4A1AA8' },
  aliveImage: { width: 70, height: 70 },
  aliveInfo: { flex: 1, paddingHorizontal: 12 },
  aliveLabel: { fontSize: 10, color: 'rgba(200,200,200,0.6)', textTransform: 'uppercase', letterSpacing: 1 },
  aliveTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginTop: 1 },
  aliveSub: { fontSize: 11, color: '#E8A87C', marginTop: 3 },
  aliveArrow: { paddingRight: 14 },
  // Eventos
  card: { backgroundColor: C.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: C.cardBorder, marginBottom: 16, overflow: 'hidden' },
  eventoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 0.5, borderBottomColor: C.cardBorder },
  eventoData: { backgroundColor: C.eventoDataBg, borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  eventoDataHoje: { backgroundColor: '#F5C842' },
  eventoDia: { fontSize: 16, fontWeight: '500', color: C.accentText, lineHeight: 18 },
  eventoDiaHoje: { color: '#1A1740', fontWeight: '800' },
  eventoMes: { fontSize: 9, color: C.textMuted, textTransform: 'uppercase' },
  eventoMesHoje: { color: '#1A1740' },
  eventoInfo: { flex: 1 },
  eventoNomeRow: { flexDirection: 'row', alignItems: 'center' },
  hojeBadge: { backgroundColor: '#F5C842', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginRight: 6 },
  hojeBadgeText: { fontSize: 9, fontWeight: '800', color: '#1A1740' },
  eventoNome: { fontSize: 13, fontWeight: '500', color: C.textPrimary, flexShrink: 1 },
  eventoMeta: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  eventoTag: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  eventoTagTexto: { fontSize: 10, fontWeight: '500' },
  // Especial
  especialCard: { backgroundColor: C.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: C.cardBorder, marginBottom: 16, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  especialCorFaixa: { width: 4, alignSelf: 'stretch' },
  especialCorpo: { flex: 1, padding: 14, gap: 4 },
  especialNome: { fontSize: 14, fontWeight: '600', color: C.textPrimary },
  especialDesc: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  especialCta: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  // Aviso em destaque (topo da Home)
  avisoDestaqueCard: { backgroundColor: C.cardBg, borderRadius: 16, borderWidth: 1, borderColor: '#E84B1A55', padding: 14, marginBottom: 16 },
  avisoDestaqueTopo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  avisoDestaqueLabel: { flex: 1, fontSize: 10, fontWeight: '800', color: '#E84B1A', textTransform: 'uppercase', letterSpacing: 1 },
  avisoDestaqueTitulo: { fontSize: 15, fontWeight: '700', color: C.textPrimary },
  avisoDestaqueTexto: { fontSize: 13, color: C.textMuted, marginTop: 4, lineHeight: 19 },
  // Short em destaque
  shortCard: { backgroundColor: C.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: C.cardBorder, marginBottom: 16, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  shortThumbWrap: { width: 108, height: 84, backgroundColor: C.eventoDataBg },
  shortThumb: { width: '100%', height: '100%' },
  shortThumbVazia: { alignItems: 'center', justifyContent: 'center' },
  shortPlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.32)' },
  shortInfo: { flex: 1, padding: 12, gap: 4 },
  shortTitulo: { fontSize: 14, fontWeight: '600', color: C.textPrimary },
  shortPlayerCard: { backgroundColor: C.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: C.cardBorder, marginBottom: 16, overflow: 'hidden' },
  shortPlayer: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  shortPlayerRodape: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  especialCtaTexto: { fontSize: 12, fontWeight: '700', color: '#fff' },
  eventoMetaTexto: { fontSize: 12, color: C.textMuted },
}); }
