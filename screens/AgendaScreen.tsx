import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';

const eventosEspeciais = [
  {
    id: 1,
    nome: 'Camping Peniel 2026',
    data: '28 a 31 de Agosto',
    descricao: 'Inscricoes abertas! Nao perca esse momento incrivel.',
    cor: '#E84B1A',
  },
];

const eventos = [
  {
    id: 1,
    nome: 'Culto Dominical',
    diaSemana: 'Domingo',
    horario: '18h00',
    local: 'Abbey Square, Reading',
    tipo: 'presencial',
    descricao: 'Nosso culto semanal com louvor, palavra e comunhao.',
    dia: 10,
    mes: 'Mai',
    acao: null,
    meetingId: null,
    passcode: null,
  },
  {
    id: 2,
    nome: 'Sala de Oracao',
    diaSemana: 'Quarta-feira',
    horario: '21h00',
    local: 'Zoom',
    tipo: 'online',
    descricao: 'Reuniao de oracao e intercessao pelo Zoom.',
    dia: 13,
    mes: 'Mai',
    acao: 'https://us02web.zoom.us/j/89123221983?pwd=m6qRFHxC1Qaq6mETTzTrrYdwLXnG41.1',
    meetingId: '891 2322 1983',
    passcode: '532371',
  },
  {
    id: 3,
    nome: 'Estudo Biblico',
    diaSemana: 'Sexta-feira',
    horario: '20h00',
    local: 'Zoom',
    tipo: 'online',
    descricao: 'Estudo profundo da Palavra de Deus pelo Zoom.',
    dia: 15,
    mes: 'Mai',
    acao: 'https://us02web.zoom.us/j/88370473540?pwd=rWbKlHoav2d5Oxc8pOFaGby5pbdmwR.1',
    meetingId: '883 7047 3540',
    passcode: '547608',
  },
  {
    id: 4,
    nome: 'Reuniao de Jovens',
    diaSemana: 'Sabado',
    horario: '19h00',
    local: 'Nas casas',
    tipo: 'casa',
    descricao: 'Encontro dos jovens em celulas. Entre em contato para receber o endereco.',
    dia: 16,
    mes: 'Mai',
    acao: null,
    meetingId: null,
    passcode: null,
  },
];

export default function AgendaScreen() {
  const [filtro, setFiltro] = useState('todos');
  const [detalhesAbertos, setDetalhesAbertos] = useState<number[]>([]);

  const eventosFiltrados = filtro === 'todos'
    ? eventos
    : eventos.filter(e => e.tipo === filtro);

  const toggleDetalhes = (id: number) => {
    setDetalhesAbertos(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>semana atual</Text>
          <Text style={styles.headerTitulo}>Agenda</Text>
        </View>
        <TouchableOpacity style={styles.iconeBtn}>
          <Ionicons name="calendar-outline" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <View style={styles.filtrosContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filtrosRow}>
            {['todos', 'presencial', 'online', 'casa'].map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filtroPill, filtro === f && styles.filtroPillAtivo]}
                onPress={() => setFiltro(f)}
              >
                <Text style={[styles.filtroTexto, filtro === f && styles.filtroTextoAtivo]}>
                  {f === 'todos' ? 'Todos' : f === 'presencial' ? 'Presencial' : f === 'online' ? 'Online' : 'Nas casas'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>

        <Text style={styles.secaoTitulo}>Esta semana</Text>
        {eventosFiltrados.map((evento) => (
          <View key={evento.id} style={styles.eventoCard}>
            <View style={styles.eventoEsquerda}>
              <View style={styles.eventoData}>
                <Text style={styles.eventoDia}>{evento.dia}</Text>
                <Text style={styles.eventoMes}>{evento.mes}</Text>
              </View>
              <View style={[styles.eventoLinha, {
                backgroundColor: evento.tipo === 'presencial' ? '#534AB7' :
                  evento.tipo === 'online' ? '#1D9E75' : '#BA7517'
              }]} />
            </View>
            <View style={styles.eventoCorpo}>
              <View style={styles.eventoTop}>
                <Text style={styles.eventoNome}>{evento.nome}</Text>
                <View style={[styles.eventoTag, {
                  backgroundColor: evento.tipo === 'presencial' ? '#EEEDFE' :
                    evento.tipo === 'online' ? '#E1F5EE' : '#FEF6DC'
                }]}>
                  <Text style={[styles.eventoTagTexto, {
                    color: evento.tipo === 'presencial' ? '#534AB7' :
                      evento.tipo === 'online' ? '#085041' : '#633806'
                  }]}>
                    {evento.tipo === 'presencial' ? 'Presencial' :
                      evento.tipo === 'online' ? 'Online' : 'Casa'}
                  </Text>
                </View>
              </View>
              <View style={styles.eventoInfoRow}>
                <Ionicons name="time-outline" size={13} color="#8B83D4" />
                <Text style={styles.eventoInfoTexto}>{evento.diaSemana} - {evento.horario}</Text>
              </View>
              <View style={styles.eventoInfoRow}>
                <Ionicons name="location-outline" size={13} color="#8B83D4" />
                <Text style={styles.eventoInfoTexto}>{evento.local}</Text>
              </View>
              <Text style={styles.eventoDescricao}>{evento.descricao}</Text>

              {evento.tipo === 'online' && evento.acao && (
                <View style={styles.botoesRow}>
                  <TouchableOpacity
                    style={styles.btnZoom}
                    onPress={() => Linking.openURL(evento.acao)}
                  >
                    <Ionicons name="videocam-outline" size={14} color="#fff" />
                    <Text style={styles.btnZoomTexto}>Entrar no Zoom</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnDetalhes}
                    onPress={() => toggleDetalhes(evento.id)}
                  >
                    <Text style={styles.btnDetalhesTexto}>
                      {detalhesAbertos.includes(evento.id) ? 'Ocultar' : 'Ver detalhes'}
                    </Text>
                    <Ionicons
                      name={detalhesAbertos.includes(evento.id) ? 'chevron-up' : 'chevron-down'}
                      size={13}
                      color="#1D9E75"
                    />
                  </TouchableOpacity>
                </View>
              )}

              {evento.tipo === 'online' && detalhesAbertos.includes(evento.id) && (
                <View style={styles.zoomInfo}>
                  <Text style={styles.zoomLabel}>ID: {evento.meetingId}</Text>
                  <Text style={styles.zoomLabel}>Senha: {evento.passcode}</Text>
                </View>
              )}

              {evento.tipo === 'presencial' && (
                <TouchableOpacity style={styles.eventoBtn}>
                  <Ionicons name="map-outline" size={14} color="#534AB7" />
                  <Text style={styles.eventoBtnTexto}>Como chegar</Text>
                </TouchableOpacity>
              )}

              {evento.tipo === 'casa' && (
                <TouchableOpacity
                  style={styles.eventoBtn}
                  onPress={() => Linking.openURL('https://wa.me/message/penielchurch')}
                >
                  <Ionicons name="chatbubble-outline" size={14} color="#BA7517" />
                  <Text style={[styles.eventoBtnTexto, { color: '#BA7517' }]}>Entrar em contato</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        <View style={styles.especiaisTitulo}>
          <Ionicons name="star-outline" size={16} color="#E84B1A" />
          <Text style={styles.secaoTituloEspecial}>Eventos especiais</Text>
        </View>

        {eventosEspeciais.map((e) => (
          <TouchableOpacity key={e.id} style={styles.especialCard}>
            <View style={[styles.especialCorFaixa, { backgroundColor: e.cor }]} />
            <View style={styles.especialCorpo}>
              <Text style={styles.especialNome}>{e.nome}</Text>
              <View style={styles.eventoInfoRow}>
                <Ionicons name="calendar-outline" size={13} color="#8B83D4" />
                <Text style={styles.eventoInfoTexto}>{e.data}</Text>
              </View>
              <Text style={styles.eventoDescricao}>{e.descricao}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8B83D4" style={{ marginRight: 12 }} />
          </TouchableOpacity>
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
  filtrosContainer: { backgroundColor: '#1A1740', paddingBottom: 14, paddingHorizontal: 18 },
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
  eventoEsquerda: { alignItems: 'center', paddingTop: 14, paddingLeft: 12, paddingRight: 8, gap: 6 },
  eventoData: { backgroundColor: '#EEEDFE', borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  eventoDia: { fontSize: 16, fontWeight: '500', color: '#534AB7', lineHeight: 18 },
  eventoMes: { fontSize: 9, color: '#8B83D4', textTransform: 'uppercase' },
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
  zoomInfo: { backgroundColor: '#E1F5EE', borderRadius: 8, padding: 10, marginBottom: 8, gap: 4 },
  zoomLabel: { fontSize: 12, color: '#085041', fontWeight: '500' },
  eventoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventoBtnTexto: { fontSize: 12, fontWeight: '500', color: '#534AB7' },
  especialCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', marginBottom: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  especialCorFaixa: { width: 4, alignSelf: 'stretch' },
  especialCorpo: { flex: 1, padding: 14 },
  especialNome: { fontSize: 14, fontWeight: '500', color: '#1A1740', marginBottom: 6 },
});
