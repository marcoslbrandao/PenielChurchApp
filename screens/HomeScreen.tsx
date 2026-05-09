import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerEsquerda}>
          <Image source={require('../assets/Peniel Logo.png')} style={styles.logo} />
          <View>
            <Text style={styles.headerSub}>Bem-vindo de volta</Text>
            <Text style={styles.headerTitulo}>Peniel Church</Text>
          </View>
        </View>
        <View style={styles.headerIcones}>
          <TouchableOpacity style={styles.iconeBtn}>
            <Ionicons name="search-outline" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconeBtn}>
            <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        <View style={styles.versiculo}>
          <Text style={styles.versiculoLabel}>Versiculo do dia</Text>
          <Text style={styles.versiculoTexto}>
            Porque eu sei os planos que tenho para voces, planos de prosperidade e nao de calamidade.
          </Text>
          <Text style={styles.versiculoRef}>Jeremias 29:11 - NVI</Text>
          <View style={styles.versiculoBtns}>
            <TouchableOpacity style={styles.versiculoBtn}>
              <Ionicons name="share-outline" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.versiculoBtnTexto}>Partilhar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.versiculoBtnDourado}>
              <Ionicons name="bookmark-outline" size={14} color="#F5C842" />
              <Text style={styles.versiculoBtnDouradoTexto}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.secaoHeader}>
          <Text style={styles.secaoTitulo}>Ao vivo agora</Text>
          <View style={styles.liveBadge}>
            <View style={styles.livePonto} />
            <Text style={styles.liveTexto}>LIVE</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.liveCard}>
          <View style={styles.liveThumb}>
            <Ionicons name="play-circle-outline" size={32} color="#E84B1A" />
          </View>
          <View style={styles.liveInfo}>
            <Text style={styles.liveNome}>Culto Dominical</Text>
            <Text style={styles.liveMeta}>Pr. Marcos Brandao - Domingo 18h</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#8B83D4" />
        </TouchableOpacity>
        <Text style={styles.secaoTitulo}>Acesso rapido</Text>
        <View style={styles.quickGrid}>
          <TouchableOpacity style={styles.quickBtn}>
            <Ionicons name="book-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>Biblia</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn}>
            <Ionicons name="calendar-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>Agenda</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn}>
            <Ionicons name="heart-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>Oferta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn}>
            <Ionicons name="people-outline" size={22} color="#534AB7" />
            <Text style={styles.quickTexto}>Grupos</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.secaoTitulo}>Proximos eventos</Text>
        <View style={styles.card}>
          <View style={styles.eventoRow}>
            <View style={styles.eventoData}>
              <Text style={styles.eventoDia}>11</Text>
              <Text style={styles.eventoMes}>Mai</Text>
            </View>
            <View style={styles.eventoInfo}>
              <Text style={styles.eventoNome}>Culto Dominical</Text>
              <Text style={styles.eventoMeta}>Domingo - 18h - Abbey Square</Text>
            </View>
            <View style={styles.tagPresencial}>
              <Text style={styles.tagPresencialTexto}>Presencial</Text>
            </View>
          </View>
          <View style={styles.eventoRow}>
            <View style={styles.eventoData}>
              <Text style={styles.eventoDia}>13</Text>
              <Text style={styles.eventoMes}>Mai</Text>
            </View>
            <View style={styles.eventoInfo}>
              <Text style={styles.eventoNome}>Sala de Oracao</Text>
              <Text style={styles.eventoMeta}>Quarta - 21h - Zoom</Text>
            </View>
            <View style={styles.tagOnline}>
              <Text style={styles.tagOnlineTexto}>Online</Text>
            </View>
          </View>
          <View style={styles.eventoRow}>
            <View style={styles.eventoData}>
              <Text style={styles.eventoDia}>15</Text>
              <Text style={styles.eventoMes}>Mai</Text>
            </View>
            <View style={styles.eventoInfo}>
              <Text style={styles.eventoNome}>Estudo Biblico</Text>
              <Text style={styles.eventoMeta}>Sexta - 20h - Zoom</Text>
            </View>
            <View style={styles.tagOnline}>
              <Text style={styles.tagOnlineTexto}>Online</Text>
            </View>
          </View>
          <View style={[styles.eventoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.eventoData}>
              <Text style={styles.eventoDia}>16</Text>
              <Text style={styles.eventoMes}>Mai</Text>
            </View>
            <View style={styles.eventoInfo}>
              <Text style={styles.eventoNome}>Reuniao de Jovens</Text>
              <Text style={styles.eventoMeta}>Sabado - 19h - Nas casas</Text>
            </View>
            <View style={styles.tagCasa}>
              <Text style={styles.tagCasaTexto}>Casa</Text>
            </View>
          </View>
        </View>
        <View style={{ height: 20 }} />
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
  versiculo: { backgroundColor: '#1A1740', borderRadius: 16, padding: 20, marginBottom: 16 },
  versiculoLabel: { fontSize: 11, fontWeight: '500', color: '#F5C842', letterSpacing: 1, marginBottom: 8 },
  versiculoTexto: { fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 22, fontStyle: 'italic' },
  versiculoRef: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8 },
  versiculoBtns: { flexDirection: 'row', gap: 8, marginTop: 14 },
  versiculoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  versiculoBtnTexto: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  versiculoBtnDourado: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(245,200,66,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  versiculoBtnDouradoTexto: { fontSize: 12, color: '#F5C842' },
  secaoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  secaoTitulo: { fontSize: 14, fontWeight: '500', color: '#1A1740', marginBottom: 10 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E84B1A', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  livePonto: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveTexto: { fontSize: 10, fontWeight: '500', color: '#fff' },
  liveCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)' },
  liveThumb: { width: 56, height: 42, backgroundColor: '#1A1740', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  liveInfo: { flex: 1 },
  liveNome: { fontSize: 13, fontWeight: '500', color: '#1A1740' },
  liveMeta: { fontSize: 11, color: '#8B83D4', marginTop: 2 },
  quickGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', gap: 5, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)' },
  quickTexto: { fontSize: 10, fontWeight: '500', color: '#534AB7' },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', marginBottom: 16, overflow: 'hidden' },
  eventoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(83,74,183,0.08)' },
  eventoData: { backgroundColor: '#EEEDFE', borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  eventoDia: { fontSize: 16, fontWeight: '500', color: '#534AB7', lineHeight: 18 },
  eventoMes: { fontSize: 9, color: '#8B83D4', textTransform: 'uppercase' },
  eventoInfo: { flex: 1 },
  eventoNome: { fontSize: 13, fontWeight: '500', color: '#1A1740' },
  eventoMeta: { fontSize: 11, color: '#8B83D4', marginTop: 2 },
  tagPresencial: { backgroundColor: '#EEEDFE', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tagPresencialTexto: { fontSize: 10, fontWeight: '500', color: '#534AB7' },
  tagOnline: { backgroundColor: '#E1F5EE', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tagOnlineTexto: { fontSize: 10, fontWeight: '500', color: '#085041' },
  tagCasa: { backgroundColor: '#FEF6DC', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tagCasaTexto: { fontSize: 10, fontWeight: '500', color: '#633806' },
});
