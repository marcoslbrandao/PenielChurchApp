import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useCampoTraduzido } from '../lib/useTraducao';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Calcula a próxima data de um evento recorrente pelo dia da semana
function proximaData(diaSemana: number, meses: string[]): { dia: number; mes: string; dataISO: string } {
  const hoje = new Date();
  const diff = (diaSemana - hoje.getDay() + 7) % 7;
  const proxima = new Date(hoje);
  proxima.setDate(hoje.getDate() + diff);
  return {
    dia: proxima.getDate(),
    mes: meses[proxima.getMonth()],
    dataISO: proxima.toISOString(),
  };
}

function formatDataEspecifica(dataStr: string, meses: string[], mesesLongos: string[], dataDe: string): { dia: number; mes: string; dataISO: string; label: string } {
  const d = new Date(`${dataStr}T00:00:00`);
  return {
    dia: d.getDate(),
    mes: meses[d.getMonth()],
    dataISO: d.toISOString(),
    label: `${d.getDate()} ${dataDe} ${mesesLongos[d.getMonth()]} ${dataDe} ${d.getFullYear()}`,
  };
}

type EventoDB = {
  id: string; nome: string; tipo: string; recorrente: boolean; dia_semana: number | null;
  data: string | null; horario: string; local: string; descricao: string | null;
  link_zoom: string | null; meeting_id: string | null; passcode: string | null;
  map_url: string | null; especial: boolean; cor: string | null;
};

type EventoUI = {
  id: string; nome: string; diaSemanaLabel: string; horario: string; local: string;
  tipo: string; descricao: string; acao: string | null; meetingId: string | null;
  passcode: string | null; mapUrl: string | null;
  dia: number; mes: string; dataISO: string;
};

// Card de um evento da agenda — nome e descrição (digitados pelo admin em
// português) são traduzidos automaticamente pro idioma do app.
function EventoCard({ evento, hoje, aberto, onToggleDetalhes, onAbrirZoom, onAbrirMapa, onAbrirWhatsApp, t }: {
  evento: EventoUI; hoje: boolean; aberto: boolean;
  onToggleDetalhes: () => void; onAbrirZoom: () => void; onAbrirMapa: () => void; onAbrirWhatsApp: () => void;
  t: (key: string, opts?: any) => string;
}) {
  const nome = useCampoTraduzido(evento.nome, 'agenda_eventos', evento.id, 'nome');
  const descricao = useCampoTraduzido(evento.descricao, 'agenda_eventos', evento.id, 'descricao');

  return (
    <View style={[styles.eventoCard, hoje && styles.eventoCardHoje]}>
      {hoje && (
        <View style={styles.hojeBadge}>
          <Text style={styles.hojeBadgeText}>{t('agenda.hoje')}</Text>
        </View>
      )}

      <View style={styles.eventoEsquerda}>
        <View style={[styles.eventoData, hoje && styles.eventoDataHoje]}>
          <Text style={[styles.eventoDia, hoje && styles.eventoDiaHoje]}>
            {evento.dia}
          </Text>
          <Text style={[styles.eventoMes, hoje && styles.eventoMesHoje]}>
            {evento.mes}
          </Text>
        </View>
        <View style={[styles.eventoLinha, {
          backgroundColor: evento.tipo === 'presencial' ? '#534AB7' :
            evento.tipo === 'online' ? '#1D9E75' : '#BA7517'
        }]} />
      </View>

      <View style={styles.eventoCorpo}>
        <View style={styles.eventoTop}>
          <Text style={styles.eventoNome}>{nome}</Text>
          <View style={[styles.eventoTag, {
            backgroundColor: evento.tipo === 'presencial' ? '#EEEDFE' :
              evento.tipo === 'online' ? '#E1F5EE' : '#FEF6DC'
          }]}>
            <Text style={[styles.eventoTagTexto, {
              color: evento.tipo === 'presencial' ? '#534AB7' :
                evento.tipo === 'online' ? '#085041' : '#633806'
            }]}>
              {evento.tipo === 'presencial' ? t('agenda.presencial') :
                evento.tipo === 'online' ? t('agenda.online') : t('agenda.casa')}
            </Text>
          </View>
        </View>

        <View style={styles.eventoInfoRow}>
          <Ionicons name="time-outline" size={13} color="#8B83D4" />
          <Text style={styles.eventoInfoTexto}>{evento.diaSemanaLabel} · {evento.horario}</Text>
        </View>
        <View style={styles.eventoInfoRow}>
          <Ionicons name="location-outline" size={13} color="#8B83D4" />
          <Text style={styles.eventoInfoTexto}>{evento.local}</Text>
        </View>
        <Text style={styles.eventoDescricao}>{descricao}</Text>

        {/* Botões Online */}
        {evento.tipo === 'online' && evento.acao && (
          <View style={styles.botoesRow}>
            <TouchableOpacity
              style={styles.btnZoom}
              onPress={onAbrirZoom}
            >
              <Ionicons name="videocam-outline" size={14} color="#fff" />
              <Text style={styles.btnZoomTexto}>{t('agenda.entrarZoom')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnDetalhes}
              onPress={onToggleDetalhes}
            >
              <Text style={styles.btnDetalhesTexto}>
                {aberto ? t('agenda.ocultar') : t('agenda.verDetalhes')}
              </Text>
              <Ionicons
                name={aberto ? 'chevron-up' : 'chevron-down'}
                size={13} color="#1D9E75"
              />
            </TouchableOpacity>
          </View>
        )}

        {evento.tipo === 'online' && aberto && (
          <View style={styles.zoomInfo}>
            <View style={styles.zoomRow}>
              <Ionicons name="grid-outline" size={13} color="#085041" />
              <Text style={styles.zoomLabel}>{t('agenda.idLabel')}: {evento.meetingId}</Text>
              <TouchableOpacity onPress={() => Alert.alert(t('agenda.idCopiado'), evento.meetingId!)}>
                <Ionicons name="copy-outline" size={13} color="#1D9E75" />
              </TouchableOpacity>
            </View>
            <View style={styles.zoomRow}>
              <Ionicons name="key-outline" size={13} color="#085041" />
              <Text style={styles.zoomLabel}>{t('agenda.senhaLabel')}: {evento.passcode}</Text>
              <TouchableOpacity onPress={() => Alert.alert(t('agenda.senhaCopiada'), evento.passcode!)}>
                <Ionicons name="copy-outline" size={13} color="#1D9E75" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Botão Presencial */}
        {evento.tipo === 'presencial' && evento.mapUrl && (
          <TouchableOpacity
            style={styles.eventoBtn}
            onPress={onAbrirMapa}
          >
            <Ionicons name="map-outline" size={14} color="#534AB7" />
            <Text style={styles.eventoBtnTexto}>{t('agenda.comoChegar')}</Text>
          </TouchableOpacity>
        )}

        {/* Botão Casa */}
        {evento.tipo === 'casa' && (
          <TouchableOpacity style={styles.eventoBtn} onPress={onAbrirWhatsApp}>
            <Ionicons name="logo-whatsapp" size={14} color="#BA7517" />
            <Text style={[styles.eventoBtnTexto, { color: '#BA7517' }]}>
              {t('agenda.entrarContato')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Card de evento especial — nome e descrição também traduzidos.
function EventoEspecialCard({ evento }: { evento: { id: string; nome: string; descricao: string; cor: string; data: string } }) {
  const nome = useCampoTraduzido(evento.nome, 'agenda_eventos', evento.id, 'nome');
  const descricao = useCampoTraduzido(evento.descricao, 'agenda_eventos', evento.id, 'descricao');
  return (
    <TouchableOpacity style={styles.especialCard}>
      <View style={[styles.especialCorFaixa, { backgroundColor: evento.cor }]} />
      <View style={styles.especialCorpo}>
        <Text style={styles.especialNome}>{nome}</Text>
        <View style={styles.eventoInfoRow}>
          <Ionicons name="calendar-outline" size={13} color="#8B83D4" />
          <Text style={styles.eventoInfoTexto}>{evento.data}</Text>
        </View>
        <Text style={styles.eventoDescricao}>{descricao}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#8B83D4" style={{ marginRight: 12 }} />
    </TouchableOpacity>
  );
}

export default function AgendaScreen() {
  const { t } = useTranslation();
  const MESES = t('agenda.meses', { returnObjects: true }) as string[];
  const MESES_LONGOS = t('agenda.mesesLongos', { returnObjects: true }) as string[];
  const DIAS_SEMANA = t('agenda.diasSemana', { returnObjects: true }) as string[];
  const DATA_DE = t('agenda.dataDe');

  const [filtro, setFiltro] = useState('todos');
  const [detalhesAbertos, setDetalhesAbertos] = useState<string[]>([]);
  const [eventosDB, setEventosDB] = useState<EventoDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEventos = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const { data } = await supabase.from('agenda_eventos').select('*').order('created_at', { ascending: true });
    if (data) setEventosDB(data as EventoDB[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchEventos(); }, [fetchEventos]);

  const eventosNormais = eventosDB.filter(e => !e.especial);
  const eventosEspeciaisDB = eventosDB.filter(e => e.especial);

  // Calcula datas dinamicamente (recorrente = próxima ocorrência; senão, a data cadastrada)
  const eventosComData: EventoUI[] = eventosNormais.map(e => {
    const dt = e.recorrente && e.dia_semana !== null
      ? proximaData(e.dia_semana, MESES)
      : e.data ? formatDataEspecifica(e.data, MESES, MESES_LONGOS, DATA_DE) : { dia: 0, mes: '', dataISO: '' };
    return {
      id: e.id, nome: e.nome, tipo: e.tipo, horario: e.horario, local: e.local,
      descricao: e.descricao ?? '', acao: e.link_zoom, meetingId: e.meeting_id,
      passcode: e.passcode, mapUrl: e.map_url,
      diaSemanaLabel: e.recorrente && e.dia_semana !== null ? DIAS_SEMANA[e.dia_semana] : '',
      dia: dt.dia, mes: dt.mes, dataISO: dt.dataISO,
    };
  });

  const eventosEspeciais = eventosEspeciaisDB.map(e => ({
    id: e.id, nome: e.nome, descricao: e.descricao ?? '', cor: e.cor ?? '#E84B1A',
    data: e.data ? formatDataEspecifica(e.data, MESES, MESES_LONGOS, DATA_DE).label : '',
  }));

  const eventosFiltrados = filtro === 'todos'
    ? eventosComData
    : eventosComData.filter(e => e.tipo === filtro);

  const toggleDetalhes = (id: string) => {
    setDetalhesAbertos(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const abrirZoom = (url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert(t('common.erro'), t('agenda.erroZoom'))
    );
  };

  const abrirMapa = (url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert(t('common.erro'), t('agenda.erroMapa'))
    );
  };

  const abrirWhatsApp = () => {
    Linking.openURL('https://wa.me/447123456789').catch(() =>
      Alert.alert(t('common.erro'), t('agenda.erroWhatsapp'))
    );
  };

  // Verifica se o evento é hoje
  const isHoje = (dataISO: string) => {
    const hoje = new Date();
    const data = new Date(dataISO);
    return data.getDate() === hoje.getDate() &&
      data.getMonth() === hoje.getMonth() &&
      data.getFullYear() === hoje.getFullYear();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>{t('agenda.semanaAtual')}</Text>
          <Text style={styles.headerTitulo}>{t('agenda.titulo')}</Text>
        </View>
        <TouchableOpacity style={styles.iconeBtn}>
          <Ionicons name="calendar-outline" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <View style={styles.filtrosContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtrosScrollContent}>
          <View style={styles.filtrosRow}>
            {['todos', 'presencial', 'online', 'casa'].map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filtroPill, filtro === f && styles.filtroPillAtivo]}
                onPress={() => setFiltro(f)}
              >
                <Text style={[styles.filtroTexto, filtro === f && styles.filtroTextoAtivo]}>
                  {f === 'todos' ? t('agenda.todos') : f === 'presencial' ? t('agenda.presencial') : f === 'online' ? t('agenda.online') : t('agenda.casa')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchEventos(true)} tintColor="#534AB7" />}
      >
        <Text style={styles.secaoTitulo}>{t('agenda.estaSemana')}</Text>

        {loading ? (
          <ActivityIndicator color="#534AB7" style={{ marginVertical: 24 }} />
        ) : eventosFiltrados.length === 0 ? (
          <Text style={{ fontSize: 13, color: '#8B83D4', marginBottom: 16 }}>{t('agenda.nenhumEventoEncontrado')}</Text>
        ) : null}

        {!loading && eventosFiltrados.map((evento) => (
          <EventoCard
            key={evento.id}
            evento={evento}
            hoje={isHoje(evento.dataISO)}
            aberto={detalhesAbertos.includes(evento.id)}
            onToggleDetalhes={() => toggleDetalhes(evento.id)}
            onAbrirZoom={() => evento.acao && abrirZoom(evento.acao)}
            onAbrirMapa={() => evento.mapUrl && abrirMapa(evento.mapUrl)}
            onAbrirWhatsApp={abrirWhatsApp}
            t={t}
          />
        ))}

        {/* Eventos especiais */}
        {!loading && eventosEspeciais.length > 0 && (
          <View style={styles.especiaisTitulo}>
            <Ionicons name="star-outline" size={16} color="#E84B1A" />
            <Text style={styles.secaoTituloEspecial}>{t('agenda.eventosEspeciais')}</Text>
          </View>
        )}

        {eventosEspeciais.map((e) => (
          <EventoEspecialCard key={e.id} evento={e} />
        ))}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F8FF' },
  header: { backgroundColor: '#1A1740', paddingTop: 55, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  headerTitulo: { fontSize: 18, fontWeight: '500', color: '#fff', marginTop: 2 },
  iconeBtn: { padding: 4 },
  filtrosContainer: { backgroundColor: '#1A1740', paddingBottom: 14 },
  filtrosScrollContent: { paddingHorizontal: 18 },
  filtrosRow: { flexDirection: 'row', gap: 8 },
  filtroPill: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)' },
  filtroPillAtivo: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  filtroTexto: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  filtroTextoAtivo: { color: '#fff' },
  scroll: { flex: 1, padding: 14 },
  secaoTitulo: { fontSize: 14, fontWeight: '500', color: '#1A1740', marginBottom: 12 },
  secaoTituloEspecial: { fontSize: 14, fontWeight: '500', color: '#E84B1A' },
  especiaisTitulo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, marginTop: 8 },
  eventoCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', marginBottom: 12, flexDirection: 'row', overflow: 'hidden' },
  eventoCardHoje: { borderColor: '#F5C842', borderWidth: 1.5 },
  hojeBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#F5C842', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, zIndex: 1 },
  hojeBadgeText: { fontSize: 9, fontWeight: '800', color: '#1A1740' },
  eventoEsquerda: { alignItems: 'center', paddingTop: 14, paddingLeft: 12, paddingRight: 8, gap: 6 },
  eventoData: { backgroundColor: '#EEEDFE', borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  eventoDataHoje: { backgroundColor: '#F5C842' },
  eventoDia: { fontSize: 16, fontWeight: '500', color: '#534AB7', lineHeight: 18 },
  eventoDiaHoje: { color: '#1A1740', fontWeight: '800' },
  eventoMes: { fontSize: 9, color: '#8B83D4', textTransform: 'uppercase' },
  eventoMesHoje: { color: '#1A1740' },
  eventoLinha: { width: 2, flex: 1, borderRadius: 2, marginBottom: 14 },
  eventoCorpo: { flex: 1, padding: 14 },
  eventoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  eventoNome: { fontSize: 14, fontWeight: '500', color: '#1A1740', flex: 1 },
  eventoTag: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  eventoTagTexto: { fontSize: 10, fontWeight: '500' },
  eventoInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  eventoInfoTexto: { fontSize: 12, color: '#8B83D4' },
  eventoDescricao: { fontSize: 12, color: '#8B83D4', lineHeight: 18, marginTop: 6, marginBottom: 10 },
  botoesRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  btnZoom: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1D9E75', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  btnZoomTexto: { fontSize: 12, fontWeight: '500', color: '#fff' },
  btnDetalhes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnDetalhesTexto: { fontSize: 12, fontWeight: '500', color: '#1D9E75' },
  zoomInfo: { backgroundColor: '#E1F5EE', borderRadius: 8, padding: 10, marginBottom: 8, gap: 6 },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoomLabel: { fontSize: 12, color: '#085041', fontWeight: '500', flex: 1 },
  eventoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventoBtnTexto: { fontSize: 12, fontWeight: '500', color: '#534AB7' },
  especialCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', marginBottom: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  especialCorFaixa: { width: 4, alignSelf: 'stretch' },
  especialCorpo: { flex: 1, padding: 14 },
  especialNome: { fontSize: 14, fontWeight: '500', color: '#1A1740', marginBottom: 6 },
});
