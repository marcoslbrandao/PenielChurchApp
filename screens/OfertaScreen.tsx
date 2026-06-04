import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────
const SUMUP_URL = 'https://pay.sumup.com/b2c/Q54Q9ILX';

const valores = [10, 25, 50, 100, 200];

const tipos = [
  { id: 'dizimo', nome: 'Dízimo', sub: '10% da renda', icone: 'star-outline' },
  { id: 'oferta', nome: 'Oferta', sub: 'Contribuição livre', icone: 'heart-outline' },
  { id: 'missoes', nome: 'Missões', sub: 'Apoio missionário', icone: 'earth-outline' },
  { id: 'construcao', nome: 'Construção', sub: 'Obra da igreja', icone: 'home-outline' },
];

export default function OfertaScreen() {
  const [valorSelecionado, setValorSelecionado] = useState(25);
  const [tipoSelecionado, setTipoSelecionado] = useState('dizimo');
  const [recorrencia, setRecorrencia] = useState('unica');

  const handleContribuir = () => {
    Alert.alert(
      'Contribuir com Segurança',
      `Você será redirecionado para o pagamento seguro via SumUp.\n\nValor: £${valorSelecionado > 0 ? valorSelecionado : '—'}\nTipo: ${tipos.find(t => t.id === tipoSelecionado)?.nome}\nFrequência: ${recorrencia === 'mensal' ? 'Mensal' : 'Única'}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: '💳 Ir para pagamento', onPress: () => Linking.openURL(SUMUP_URL) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerSub}>contribua com a obra</Text>
        <Text style={styles.headerTitulo}>Oferta e Dízimo</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Valor ─────────────────────────────────────────────────────────── */}
        <View style={styles.valorCard}>
          <Text style={styles.valorLabel}>Valor da oferta</Text>
          <Text style={styles.valorDisplay}>
            {valorSelecionado > 0 ? '£ ' + valorSelecionado : '£ --'}
          </Text>
          <View style={styles.presetsGrid}>
            {valores.map((v) => (
              <TouchableOpacity
                key={v}
                style={[styles.presetBtn, valorSelecionado === v && styles.presetBtnAtivo]}
                onPress={() => setValorSelecionado(v)}
              >
                <Text style={[styles.presetTexto, valorSelecionado === v && styles.presetTextoAtivo]}>
                  £{v}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.presetBtn, valorSelecionado === 0 && styles.presetBtnAtivo]}
              onPress={() => setValorSelecionado(0)}
            >
              <Text style={[styles.presetTexto, valorSelecionado === 0 && styles.presetTextoAtivo]}>
                Outro
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Tipo ──────────────────────────────────────────────────────────── */}
        <Text style={styles.secaoTitulo}>Tipo de contribuição</Text>
        <View style={styles.tiposGrid}>
          {tipos.map((tipo) => (
            <TouchableOpacity
              key={tipo.id}
              style={[styles.tipoCard, tipoSelecionado === tipo.id && styles.tipoCardAtivo]}
              onPress={() => setTipoSelecionado(tipo.id)}
            >
              <Ionicons
                name={tipo.icone as any}
                size={20}
                color={tipoSelecionado === tipo.id ? '#534AB7' : '#8B83D4'}
              />
              <Text style={[styles.tipoNome, tipoSelecionado === tipo.id && styles.tipoNomeAtivo]}>
                {tipo.nome}
              </Text>
              <Text style={styles.tipoSub}>{tipo.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Recorrência ───────────────────────────────────────────────────── */}
        <View style={styles.recorrenciaCard}>
          <View style={styles.recorrenciaTop}>
            <Text style={styles.recorrenciaTitulo}>Frequência</Text>
            <View style={styles.recorrenciaAbas}>
              <TouchableOpacity
                style={[styles.recorrenciaAba, recorrencia === 'unica' && styles.recorrenciaAbaAtiva]}
                onPress={() => setRecorrencia('unica')}
              >
                <Text style={[styles.recorrenciaAbaTexto, recorrencia === 'unica' && styles.recorrenciaAbaTextoAtivo]}>
                  Única
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.recorrenciaAba, recorrencia === 'mensal' && styles.recorrenciaAbaAtiva]}
                onPress={() => setRecorrencia('mensal')}
              >
                <Text style={[styles.recorrenciaAbaTexto, recorrencia === 'mensal' && styles.recorrenciaAbaTextoAtivo]}>
                  Mensal
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.recorrenciaDesc}>
            {recorrencia === 'mensal'
              ? 'Sua contribuição será debitada mensalmente. Pode cancelar a qualquer momento.'
              : 'Contribuição única, processada apenas uma vez com segurança.'}
          </Text>
        </View>

        {/* ── Resumo ────────────────────────────────────────────────────────── */}
        <View style={styles.resumoCard}>
          <View style={styles.resumoLinha}>
            <Text style={styles.resumoLabel}>Tipo</Text>
            <Text style={styles.resumoValor}>{tipos.find(t => t.id === tipoSelecionado)?.nome}</Text>
          </View>
          <View style={styles.resumoLinha}>
            <Text style={styles.resumoLabel}>Valor</Text>
            <Text style={[styles.resumoValor, { color: '#534AB7', fontWeight: '700' }]}>
              {valorSelecionado > 0 ? '£ ' + valorSelecionado : 'A definir'}
            </Text>
          </View>
          <View style={[styles.resumoLinha, { borderBottomWidth: 0 }]}>
            <Text style={styles.resumoLabel}>Frequência</Text>
            <Text style={styles.resumoValor}>{recorrencia === 'mensal' ? 'Todo mês' : 'Uma vez'}</Text>
          </View>
        </View>

        {/* ── Botão contribuir ──────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.btnContribuir} onPress={handleContribuir} activeOpacity={0.85}>
          <Ionicons name="card-outline" size={20} color="#fff" />
          <Text style={styles.btnContribuirTexto}>Contribuir com Segurança</Text>
        </TouchableOpacity>

        {/* ── Selos de segurança ────────────────────────────────────────────── */}
        <View style={styles.selosRow}>
          <View style={styles.selo}>
            <Ionicons name="lock-closed-outline" size={14} color="#8B83D4" />
            <Text style={styles.seloTexto}>SSL 256-bit</Text>
          </View>
          <View style={styles.selo}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#8B83D4" />
            <Text style={styles.seloTexto}>SumUp Seguro</Text>
          </View>
          <View style={styles.selo}>
            <Ionicons name="card-outline" size={14} color="#8B83D4" />
            <Text style={styles.seloTexto}>Visa / Mastercard</Text>
          </View>
        </View>

        {/* ── Versículo ─────────────────────────────────────────────────────── */}
        <View style={styles.versiculoCard}>
          <Text style={styles.versiculoTexto}>
            "Cada um deve dar segundo propôs no seu coração, não com tristeza ou por necessidade; porque Deus ama ao que dá com alegria."
          </Text>
          <Text style={styles.versiculoRef}>2 Coríntios 9:7</Text>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F8FF' },
  header: { backgroundColor: '#1A1740', paddingTop: 55, paddingBottom: 16, paddingHorizontal: 18 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  headerTitulo: { fontSize: 18, fontWeight: '500', color: '#fff', marginTop: 2 },
  // Valor
  valorCard: { backgroundColor: '#1A1740', margin: 14, borderRadius: 16, padding: 20 },
  valorLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 8 },
  valorDisplay: { fontSize: 48, fontWeight: '700', color: '#F5C842', textAlign: 'center', marginBottom: 20 },
  presetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  presetBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, minWidth: 70, alignItems: 'center' },
  presetBtnAtivo: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  presetTexto: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.7)' },
  presetTextoAtivo: { color: '#fff', fontWeight: '700' },
  // Tipos
  secaoTitulo: { fontSize: 14, fontWeight: '500', color: '#1A1740', marginHorizontal: 14, marginBottom: 10 },
  tiposGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 14, marginBottom: 16 },
  tipoCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', padding: 14, width: '47%', gap: 5 },
  tipoCardAtivo: { borderWidth: 1.5, borderColor: '#534AB7', backgroundColor: '#EEEDFE' },
  tipoNome: { fontSize: 13, fontWeight: '500', color: '#1A1740' },
  tipoNomeAtivo: { color: '#534AB7' },
  tipoSub: { fontSize: 11, color: '#8B83D4' },
  // Recorrência
  recorrenciaCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', padding: 14, marginHorizontal: 14, marginBottom: 16 },
  recorrenciaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  recorrenciaTitulo: { fontSize: 13, fontWeight: '500', color: '#1A1740' },
  recorrenciaAbas: { flexDirection: 'row', backgroundColor: '#EEEDFE', borderRadius: 8, overflow: 'hidden' },
  recorrenciaAba: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  recorrenciaAbaAtiva: { backgroundColor: '#534AB7' },
  recorrenciaAbaTexto: { fontSize: 12, fontWeight: '500', color: '#8B83D4' },
  recorrenciaAbaTextoAtivo: { color: '#fff' },
  recorrenciaDesc: { fontSize: 12, color: '#8B83D4', lineHeight: 18 },
  // Resumo
  resumoCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', marginHorizontal: 14, marginBottom: 16, overflow: 'hidden' },
  resumoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(83,74,183,0.08)' },
  resumoLabel: { fontSize: 13, color: '#8B83D4' },
  resumoValor: { fontSize: 13, fontWeight: '500', color: '#1A1740' },
  // Botão
  btnContribuir: { backgroundColor: '#534AB7', borderRadius: 14, marginHorizontal: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  btnContribuirTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
  // Selos
  selosRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12, marginBottom: 16 },
  selo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  seloTexto: { fontSize: 11, color: '#8B83D4' },
  // Versículo
  versiculoCard: { backgroundColor: '#1A1740', borderRadius: 16, marginHorizontal: 14, padding: 18 },
  versiculoTexto: { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 20, fontStyle: 'italic' },
  versiculoRef: { fontSize: 11, color: '#F5C842', marginTop: 8 },
});
