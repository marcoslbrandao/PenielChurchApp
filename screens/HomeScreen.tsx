import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Animated, Linking, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { useNotifications } from '../lib/useNotifications';
import { useBirthdays } from '../lib/useBirthdays';
import BirthdayBanner from '../components/BirthdayBanner';
import MensagemDetalheModal, { Mensagem } from '../components/MensagemDetalheModal';
import { livrosAT, livrosNT, Livro } from '../lib/bibliaLivros';
import { getVersiculoDoDia, parseReferencia, getTextoVersiculo, getReferenciaVersiculo, getVersaoVersiculo } from '../lib/versiculoDoDia';
import { useCampoTraduzido } from '../lib/useTraducao';

// ─── Config ───────────────────────────────────────────────────────────────────
const YOUTUBE_LIVE_URL = 'https://www.youtube.com/@PenielChurchOfficial/streams';
const YOUTUBE_CHANNEL  = 'https://www.youtube.com/@PenielChurchOfficial';
const WHATSAPP_NUMBER  = '447540880456';
const YOUTUBE_API_KEY  = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
const CHANNEL_ID       = 'UCeipicy-AS_b66Asu65TBQQ';

const VERSICULO_DIA_RAW = getVersiculoDoDia();

// Resolve o livro (com slug) e capítulo do versículo do dia, para permitir
// abrir o capítulo inteiro na Bíblia a partir da Home.
function resolverLivroDoVersiculo(): { slug: string; capitulo: number } | null {
  const parsed = parseReferencia(VERSICULO_DIA_RAW.ref);
  if (!parsed) return null;
  const livro = [...livrosAT, ...livrosNT].find(l => l.pt === parsed.livroNome);
  if (!livro) return null;
  return { slug: livro.slug, capitulo: parsed.capitulo };
}
const LIVRO_VERSICULO_DIA = resolverLivroDoVersiculo();

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

// Card de aviso no modal de notificações — título e texto traduzidos pro idioma do app.
function NotifAvisoCard({ aviso }: { aviso: AvisoResult }) {
  const { i18n } = useTranslation();
  const titulo = useCampoTraduzido(aviso.titulo, 'avisos', aviso.id, 'titulo');
  const texto = useCampoTraduzido(aviso.texto, 'avisos', aviso.id, 'texto');
  const locale = LOCALE_POR_IDIOMA[i18n.language] ?? 'pt-BR';
  return (
    <View style={styles.notifCard}>
      <View style={styles.notifIcone}>
        <Ionicons name="megaphone-outline" size={16} color="#F5C842" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.notifTitulo}>{titulo}</Text>
        <Text style={styles.notifTexto} numberOfLines={3}>{texto}</Text>
        <Text style={styles.notifData}>{new Date(aviso.data).toLocaleDateString(locale, { day: '2-digit', month: 'short' })}</Text>
      </View>
    </View>
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

export default function HomeScreen({ navigation }: { navigation?: any }) {
  const { t, i18n } = useTranslation();
  const { user, isLoggedIn } = useAuth();
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
    const checkLiveSemCota = async (): Promise<boolean> => {
      try {
        const res = await fetch(`https://www.youtube.com/channel/${CHANNEL_ID}/live`, { redirect: 'follow' });
        const finalUrl = res.url ?? '';
        const match = finalUrl.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
        if (!match) { setIsLive(false); return true; }
        const videoId = match[1];
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
      } else if (ciclo % 10 === 0) {
        // A cada ~15min, confirma com a API mesmo se a checagem gratuita
        // disse "não está ao vivo" — protege contra falso-negativo sem
        // gastar cota o tempo todo.
        await checkLiveComApi();
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

  // ── Devocional em destaque (publicado pelo Admin) ─────────────────────────
  const [devocional, setDevocional] = useState<{ id: string; titulo: string; versiculo: string; referencia: string; texto: string } | null>(null);
  const [devocionalAberto, setDevocionalAberto] = useState(false);
  const devocionalTituloTraduzido = useCampoTraduzido(devocional?.titulo, 'devocionais', devocional?.id, 'titulo');
  const devocionalVersiculoTraduzido = useCampoTraduzido(devocional?.versiculo, 'devocionais', devocional?.id, 'versiculo');
  const devocionalReferenciaTraduzida = useCampoTraduzido(devocional?.referencia, 'devocionais', devocional?.id, 'referencia');
  const devocionalTextoTraduzido = useCampoTraduzido(devocional?.texto, 'devocionais', devocional?.id, 'texto');

  useEffect(() => {
    supabase
      .from('devocionais')
      .select('id, titulo, versiculo, referencia, texto')
      .is('grupo', null)
      .order('data', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setDevocional(data as any); });
  }, []);

  // ── Mensagem de domingo em destaque (blog) ────────────────────────────────
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [mensagemAberta, setMensagemAberta] = useState(false);
  const mensagemTituloTraduzido = useCampoTraduzido(mensagem?.titulo, 'mensagens', mensagem?.id, 'titulo');
  const mensagemResumoTraduzido = useCampoTraduzido(mensagem?.resumo, 'mensagens', mensagem?.id, 'resumo');

  useEffect(() => {
    supabase
      .from('mensagens')
      .select('id, titulo, resumo, conteudo, imagem_url, autor, data')
      .order('data', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setMensagem(data as Mensagem); });
  }, []);

  // ── Notificações (sininho) ────────────────────────────────────────────────
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [notifAvisos, setNotifAvisos] = useState<AvisoResult[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const temNotificacaoRecente = notifAvisos.some(a => {
    const dias = (Date.now() - new Date(a.data).getTime()) / (1000 * 60 * 60 * 24);
    return dias <= 7;
  });

  useEffect(() => {
    supabase.from('avisos').select('*').order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setNotifAvisos(data as AvisoResult[]); });
  }, []);

  const abrirNotificacoes = () => {
    setNotifModalVisible(true);
    setNotifLoading(true);
    supabase.from('avisos').select('*').order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setNotifAvisos(data as AvisoResult[]); setNotifLoading(false); });
  };

  const openYouTube = () => Linking.openURL(isLive ? YOUTUBE_LIVE_URL : YOUTUBE_CHANNEL);
  const openWhatsApp = (msg = '') => {
    const url = `https://wa.me/${WHATSAPP_NUMBER}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
    Linking.openURL(url).catch(() => Alert.alert(t('common.erro'), t('grupos.erroWhatsapp')));
  };

  // Versículo do dia no idioma atual do app (Perfil > Idioma).
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
  const eventos = eventosRecorrentes.map(e => ({ ...e, ...proximaData(e.diaSemana, i18n.language) }));

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
            {temNotificacaoRecente && <View style={styles.notifDot} />}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>

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
              Share.share({ message: `"${versiculoTexto}"\n\n— ${versiculoRef} - ${versiculoVersaoIdioma}\n\n📖 Peniel Church App` });
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
          <Ionicons name="chevron-forward" size={18} color="#8B83D4" />
        </TouchableOpacity>

        {/* ── Acesso rápido ─────────────────────────────────────────────────── */}
        <Text style={styles.secaoTitulo}>{t('home.acessoRapido')}</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation?.navigate('Biblia')}>
            <Ionicons name="book-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>{t('home.quickBiblia')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation?.navigate('Agenda')}>
            <Ionicons name="calendar-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>{t('home.quickAgenda')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation?.navigate('Oferta')}>
            <Ionicons name="heart-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>{t('home.quickOferta')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => Alert.alert(t('home.quickGrupos'), t('home.quickGruposEmBreveMsg'), [
            { text: t('common.cancelar'), style: 'cancel' },
            { text: 'WhatsApp', onPress: () => openWhatsApp(t('home.quickGruposWhatsappMsg')) },
          ])}>
            <Ionicons name="people-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>{t('home.quickGrupos')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Card Peniel Alive ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.aliveCard}
          activeOpacity={0.85}
          onPress={() => navigation?.navigate('Membros')}
        >
          <Image
            source={require('../assets/PenielAlive-Logo.jpg')}
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
                <View style={styles.eventoData}>
                  <Text style={styles.eventoDia}>{ev.dia}</Text>
                  <Text style={styles.eventoMes}>{ev.mes}</Text>
                </View>
                <View style={styles.eventoInfo}>
                  <Text style={styles.eventoNome}>{ev.nomeKey ? t(`home.${ev.nomeKey}`) : ev.nome}</Text>
                  <Text style={styles.eventoMeta}>{ev.diaSemana === 0 ? t('home.diaDomingo') : ev.diaSemana === 3 ? t('home.diaQuarta') : ev.diaSemana === 5 ? t('home.diaSexta') : t('home.diaSabado')} · {ev.horario} · {ev.localKey ? t(`home.${ev.localKey}`) : ev.local}</Text>
                </View>
                <View style={[styles.eventoTag, { backgroundColor: tag.bg }]}>
                  <Text style={[styles.eventoTagTexto, { color: tag.text }]}>{tag.label}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Evento especial ───────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.especialCard} activeOpacity={0.85}
          onPress={() => Linking.openURL('https://www.penielchurch.org.uk/event-details/peniel-camping-2026')}>
          <View style={[styles.especialCorFaixa, { backgroundColor: '#E84B1A' }]} />
          <View style={styles.especialCorpo}>
            <Text style={styles.especialNome}>⛺ Camping Peniel 2026</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="calendar-outline" size={13} color="#8B83D4" />
              <Text style={styles.eventoMetaTexto}>28 a 31 de Agosto 2026</Text>
            </View>
            <Text style={styles.especialDesc}>Inscrições abertas! Toque para se inscrever.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#8B83D4" style={{ marginRight: 12 }} />
        </TouchableOpacity>

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
                {notifAvisos.map(a => (<NotifAvisoCard key={a.id} aviso={a} />))}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F8FF' },
  header: { backgroundColor: '#1A1740', paddingTop: 55, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerEsquerda: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logo: { width: 48, height: 48, borderRadius: 24 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  headerTitulo: { fontSize: 18, fontWeight: '500', color: '#fff', marginTop: 2 },
  headerIcones: { flexDirection: 'row', gap: 10 },
  iconeBtn: { padding: 4, position: 'relative' },
  notifDot: { position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E84B1A', borderWidth: 1, borderColor: '#1A1740' },
  notifCard: { flexDirection: 'row', gap: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, marginBottom: 10 },
  notifIcone: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(245,200,66,0.15)', alignItems: 'center', justifyContent: 'center' },
  notifTitulo: { fontSize: 14, fontWeight: '700', color: '#fff' },
  notifTexto: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4, lineHeight: 18 },
  notifData: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6 },
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
  // Live
  secaoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  secaoTitulo: { fontSize: 14, fontWeight: '500', color: '#1A1740', marginBottom: 10 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E84B1A', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  livePonto: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveTexto: { fontSize: 10, fontWeight: '700', color: '#fff' },
  liveCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)' },
  liveCardAtivo: { borderColor: '#E84B1A', borderWidth: 1.5 },
  liveThumb: { width: 56, height: 42, backgroundColor: '#1A1740', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  liveInfo: { flex: 1 },
  liveNome: { fontSize: 13, fontWeight: '500', color: '#1A1740' },
  liveMeta: { fontSize: 11, color: '#8B83D4', marginTop: 2 },
  // Quick grid
  quickGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', gap: 5, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)' },
  quickTexto: { fontSize: 10, fontWeight: '500', color: '#534AB7' },
  // Peniel Alive card
  aliveCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E0A4A', borderRadius: 16, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#4A1AA8' },
  aliveImage: { width: 70, height: 70 },
  aliveInfo: { flex: 1, paddingHorizontal: 12 },
  aliveLabel: { fontSize: 10, color: 'rgba(200,200,200,0.6)', textTransform: 'uppercase', letterSpacing: 1 },
  aliveTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginTop: 1 },
  aliveSub: { fontSize: 11, color: '#E8A87C', marginTop: 3 },
  aliveArrow: { paddingRight: 14 },
  // Eventos
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', marginBottom: 16, overflow: 'hidden' },
  eventoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(83,74,183,0.08)' },
  eventoData: { backgroundColor: '#EEEDFE', borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  eventoDia: { fontSize: 16, fontWeight: '500', color: '#534AB7', lineHeight: 18 },
  eventoMes: { fontSize: 9, color: '#8B83D4', textTransform: 'uppercase' },
  eventoInfo: { flex: 1 },
  eventoNome: { fontSize: 13, fontWeight: '500', color: '#1A1740' },
  eventoMeta: { fontSize: 11, color: '#8B83D4', marginTop: 2 },
  eventoTag: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  eventoTagTexto: { fontSize: 10, fontWeight: '500' },
  // Especial
  especialCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', marginBottom: 16, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  especialCorFaixa: { width: 4, alignSelf: 'stretch' },
  especialCorpo: { flex: 1, padding: 14, gap: 4 },
  especialNome: { fontSize: 14, fontWeight: '600', color: '#1A1740' },
  especialDesc: { fontSize: 12, color: '#8B83D4', marginTop: 2 },
  eventoMetaTexto: { fontSize: 12, color: '#8B83D4' },
});
