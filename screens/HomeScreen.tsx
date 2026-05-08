import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerSub}>Bem-vindo de volta</Text>
        <Text style={styles.headerTitulo}>Peniel Church</Text>
      </View>
      <ScrollView style={styles.scroll}>
        <View style={styles.versiculo}>
          <Text style={styles.versiculoLabel}>Versiculo do dia</Text>
          <Text style={styles.versiculoTexto}>
            Porque eu sei os planos que tenho para voces, planos de prosperidade e nao de calamidade.
          </Text>
          <Text style={styles.versiculoRef}>Jeremias 29:11 - NVI</Text>
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
          </View>
          <View style={styles.eventoRow}>
            <View style={styles.eventoData}>
              <Text style={styles.eventoDia}>14</Text>
              <Text style={styles.eventoMes}>Mai</Text>
            </View>
            <View style={styles.eventoInfo}>
              <Text style={styles.eventoNome}>Sala de Oracao</Text>
              <Text style={styles.eventoMeta}>Quarta - 21h - Zoom</Text>
            </View>
          </View>
          <View style={styles.eventoRow}>
            <View style={styles.eventoData}>
              <Text style={styles.eventoDia}>16</Text>
              <Text style={styles.eventoMes}>Mai</Text>
            </View>
            <View style={styles.eventoInfo}>
              <Text style={styles.eventoNome}>Estudo Biblico</Text>
              <Text style={styles.eventoMeta}>Sexta - 20h - Zoom</Text>
            </View>
          </View>
          <View style={styles.eventoRow}>
            <View style={styles.eventoData}>
              <Text style={styles.eventoDia}>17</Text>
              <Text style={styles.eventoMes}>Mai</Text>
            </View>
            <View style={styles.eventoInfo}>
              <Text style={styles.eventoNome}>Reuniao de Jovens</Text>
              <Text style={styles.eventoMeta}>Sabado - 19h - Nas casas</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F8FF' },
  header: { backgroundColor: '#1A1740', paddingTop: 55, paddingBottom: 16, paddingHorizontal: 18 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  headerTitulo: { fontSize: 18, fontWeight: '500', color: '#fff', marginTop: 2 },
  scroll: { flex: 1, padding: 14 },
  versiculo: { backgroundColor: '#1A1740', borderRadius: 16, padding: 20, marginBottom: 16 },
  versiculoLabel: { fontSize: 11, fontWeight: '500', color: '#F5C842', marginBottom: 8 },
  versiculoTexto: { fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 22, fontStyle: 'italic' },
  versiculoRef: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8 },
  secaoTitulo: { fontSize: 14, fontWeight: '500', color: '#1A1740', marginBottom: 10 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', marginBottom: 16, overflow: 'hidden' },
  eventoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(83,74,183,0.08)' },
  eventoData: { backgroundColor: '#EEEDFE', borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  eventoDia: { fontSize: 16, fontWeight: '500', color: '#534AB7', lineHeight: 18 },
  eventoMes: { fontSize: 9, color: '#8B83D4', textTransform: 'uppercase' },
  eventoInfo: { flex: 1 },
  eventoNome: { fontSize: 13, fontWeight: '500', color: '#1A1740' },
  eventoMeta: { fontSize: 11, color: '#8B83D4', marginTop: 2 },
});
