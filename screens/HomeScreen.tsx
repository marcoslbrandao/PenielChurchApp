import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Animated, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/useAuth';
import { useNotifications } from '../lib/useNotifications';
import { useBirthdays } from '../lib/useBirthdays';
import BirthdayBanner from '../components/BirthdayBanner';

// ─── Config ───────────────────────────────────────────────────────────────────
const YOUTUBE_LIVE_URL = 'https://www.youtube.com/@PenielChurchOfficial/streams';
const YOUTUBE_CHANNEL  = 'https://www.youtube.com/@PenielChurchOfficial';
const WHATSAPP_NUMBER  = '447540880456';
const YOUTUBE_API_KEY  = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY;
const CHANNEL_ID       = 'UCeipicy-AS_b66Asu65TBQQ';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function proximaData(diaSemana: number): { dia: number; mes: string } {
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const hoje = new Date();
  const diff = (diaSemana - hoje.getDay() + 7) % 7;
  const proxima = new Date(hoje);
  proxima.setDate(hoje.getDate() + diff);
  return { dia: proxima.getDate(), mes: MESES[proxima.getMonth()] };
}

// ─── Eventos recorrentes (0=Dom,1=Seg,...,6=Sáb) ─────────────────────────────
const eventosRecorrentes = [
  { id: 1, nome: 'Culto Dominical',    diaSemana: 0, horario: '18h', local: 'Abbey Square, Reading', tipo: 'presencial' },
  { id: 2, nome: 'Sala de Oração',     diaSemana: 3, horario: '21h', local: 'Zoom',                  tipo: 'online'     },
  { id: 3, nome: 'Estudo Bíblico',     diaSemana: 5, horario: '20h', local: 'Zoom',                  tipo: 'online'     },
  { id: 4, nome: 'Peniel Alive',       diaSemana: 6, horario: '19h', local: 'Nas casas',             tipo: 'jovens'     },
];

export default function HomeScreen({ navigation }: { navigation?: any }) {
  const { user, isLoggedIn } = useAuth();
  const { todayBirthdays } = useBirthdays();
  useNotifications(user?.id);

  // Animação pisca do botão LIVE
  const blink = useRef(new Animated.Value(1)).current;

  // ── Detecção automática de LIVE ───────────────────────────────────────────
  const [isLive, setIsLive] = useState(false);
  const [liveTitle, setLiveTitle] = useState('Peniel Church — YouTube');

  useEffect(() => {
    const checkLive = async () => {
      try {
        // Busca vídeos ao vivo do canal
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&eventType=live&type=video&key=${YOUTUBE_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          setIsLive(true);
          setLiveTitle(data.items[0].snippet.title);
        } else {
          // Fallback: busca vídeos recentes e verifica se é ao vivo
          const url2 = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&maxResults=1&order=date&type=video&key=${YOUTUBE_API_KEY}`;
          const res2 = await fetch(url2);
          const data2 = await res2.json();
          if (data2.items && data2.items.length > 0) {
            const snippet = data2.items[0].snippet;
            if (snippet.liveBroadcastContent === 'live') {
              setIsLive(true);
              setLiveTitle(snippet.title);
            } else {
              setIsLive(false);
            }
          } else {
            setIsLive(false);
          }
        }
      } catch {
        setIsLive(false);
      }
    };
    checkLive();
    // Verifica a cada 2 minutos
    const interval = setInterval(checkLive, 2 * 60 * 1000);
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

  const openYouTube = () => Linking.openURL(isLive ? YOUTUBE_LIVE_URL : YOUTUBE_CHANNEL);
  const openWhatsApp = (msg = '') => {
    const url = `https://wa.me/${WHATSAPP_NUMBER}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
    Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.'));
  };

  // Calcula datas dos próximos eventos
  const eventos = eventosRecorrentes.map(e => ({ ...e, ...proximaData(e.diaSemana) }));

  const tagStyle = (tipo: string) => ({
    bg: tipo === 'presencial' ? '#EEEDFE' : tipo === 'online' ? '#E1F5EE' : tipo === 'jovens' ? '#F3E8FF' : '#FEF6DC',
    text: tipo === 'presencial' ? '#534AB7' : tipo === 'online' ? '#085041' : tipo === 'jovens' ? '#6C3DE8' : '#633806',
    label: tipo === 'presencial' ? 'Presencial' : tipo === 'online' ? 'Online' : tipo === 'jovens' ? 'Jovens' : 'Casa',
  });

  return (
    <View style={styles.container}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerEsquerda}>
          <Image source={require('../assets/Peniel Logo.png')} style={styles.logo} />
          <View>
            <Text style={styles.headerSub}>Bem-vindo de volta</Text>
            <Text style={styles.headerTitulo}>Peniel Church</Text>
          </View>
        </View>
        <View style={styles.headerIcones}>
          <TouchableOpacity style={styles.iconeBtn} onPress={() => Alert.alert('Em breve', 'Busca disponível em breve!')}>
            <Ionicons name="search-outline" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconeBtn} onPress={() => Alert.alert('Notificações', 'Você está com as notificações ativadas!')}>
            <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.7)" />
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
          <Text style={styles.versiculoLabel}>Versículo do dia</Text>
          <Text style={styles.versiculoTexto}>
            "Porque eu sei os planos que tenho para vocês, planos de prosperidade e não de calamidade."
          </Text>
          <Text style={styles.versiculoRef}>Jeremias 29:11 - NVI</Text>
          <View style={styles.versiculoBtns}>
            <TouchableOpacity style={styles.versiculoBtn} onPress={() => {
              const { Share } = require('react-native');
              Share.share({ message: '"Porque eu sei os planos que tenho para vocês, planos de prosperidade e não de calamidade."\n\n— Jeremias 29:11 - NVI\n\n📖 Peniel Church App' });
            }}>
              <Ionicons name="share-outline" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.versiculoBtnTexto}>Compartilhar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.versiculoBtnDourado} onPress={() => Alert.alert('Salvo! 🔖', 'Versículo salvo nos seus favoritos.\n\nEm breve você poderá ver todos os versículos salvos no seu Perfil.')}>
              <Ionicons name="bookmark-outline" size={14} color="#F5C842" />
              <Text style={styles.versiculoBtnDouradoTexto}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Ao vivo ──────────────────────────────────────────────────────── */}
        <View style={styles.secaoHeader}>
          <Text style={styles.secaoTitulo}>Ao vivo agora</Text>
          {isLive ? (
            <Animated.View style={[styles.liveBadge, { opacity: blink }]}>
              <View style={styles.livePonto} />
              <Text style={styles.liveTexto}>LIVE</Text>
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
              {isLive ? 'Toque para assistir ao vivo' : 'Toque para ver nosso canal'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#8B83D4" />
        </TouchableOpacity>

        {/* ── Acesso rápido ─────────────────────────────────────────────────── */}
        <Text style={styles.secaoTitulo}>Acesso rápido</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation?.navigate('Bíblia')}>
            <Ionicons name="book-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>Bíblia</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation?.navigate('Agenda')}>
            <Ionicons name="calendar-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>Agenda</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => Linking.openURL('https://pay.sumup.com/b2c/Q54Q9ILX')}>
            <Ionicons name="heart-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>Oferta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => Alert.alert('Grupos', 'Em breve!\nFale conosco pelo WhatsApp.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'WhatsApp', onPress: () => openWhatsApp('Olá! Quero saber mais sobre os grupos da Peniel Church.') },
          ])}>
            <Ionicons name="people-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>Grupos</Text>
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
            <Text style={styles.aliveLabel}>Ministério de Jovens</Text>
            <Text style={styles.aliveTitle}>Peniel Alive</Text>
            <Text style={styles.aliveSub}>Eventos · Devocional · Comunidade</Text>
          </View>
          <View style={styles.aliveArrow}>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
          </View>
        </TouchableOpacity>

        {/* ── Próximos eventos ─────────────────────────────────────────────── */}
        <Text style={styles.secaoTitulo}>Próximos Eventos</Text>
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
                  <Text style={styles.eventoNome}>{ev.nome}</Text>
                  <Text style={styles.eventoMeta}>{ev.diaSemana === 0 ? 'Domingo' : ev.diaSemana === 3 ? 'Quarta' : ev.diaSemana === 5 ? 'Sexta' : 'Sábado'} · {ev.horario} · {ev.local}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F8FF' },
  header: { backgroundColor: '#1A1740', paddingTop: 55, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerEsquerda: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 19 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  headerTitulo: { fontSize: 18, fontWeight: '500', color: '#fff', marginTop: 2 },
  headerIcones: { flexDirection: 'row', gap: 10 },
  iconeBtn: { padding: 4 },
  scroll: { flex: 1, padding: 14 },
  // Versículo
  versiculo: { backgroundColor: '#1A1740', borderRadius: 16, padding: 20, marginBottom: 16 },
  versiculoLabel: { fontSize: 11, fontWeight: '500', color: '#F5C842', letterSpacing: 1, marginBottom: 8 },
  versiculoTexto: { fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 22, fontStyle: 'italic' },
  versiculoRef: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8 },
  versiculoBtns: { flexDirection: 'row', gap: 8, marginTop: 14 },
  versiculoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  versiculoBtnTexto: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  versiculoBtnDourado: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(245,200,66,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  versiculoBtnDouradoTexto: { fontSize: 12, color: '#F5C842' },
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
