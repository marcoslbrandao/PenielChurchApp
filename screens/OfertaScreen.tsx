import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useState } from 'react';

const valores = [10, 25, 50, 100, 200];

const tipos = [
  { id: 'dizimo', nome: 'Dizimo', sub: '10% da renda' },
  { id: 'oferta', nome: 'Oferta', sub: 'Contribuicao livre' },
];

export default function OfertaScreen() {
  const [valorSelecionado, setValorSelecionado] = useState(10);
  const [tipoSelecionado, setTipoSelecionado] = useState('dizimo');
  const [recorrencia, setRecorrencia] = useState('mensal');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerSub}>contribua com a obra</Text>
        <Text style={styles.headerTitulo}>Oferta e Dizimo</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.valorCard}>
          <Text style={styles.valorLabel}>Valor da oferta</Text>
          <Text style={styles.valorDisplay}>
            {valorSelecionado > 0 ? '\u00A3 ' + valorSelecionado : '\u00A3 --'}
          </Text>
          <View style={styles.presetsGrid}>
            {valores.map((v) => (
              <TouchableOpacity
                key={v}
                style={[styles.presetBtn, valorSelecionado === v && styles.presetBtnAtivo]}
                onPress={() => setValorSelecionado(v)}
              >
                <Text style={styles.presetTexto}>{'\u00A3'}{v}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.presetBtn, valorSelecionado === 0 && styles.presetBtnAtivo]}
              onPress={() => setValorSelecionado(0)}
            >
              <Text style={styles.presetTexto}>Outro</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.secaoTitulo}>Tipo de contribuicao</Text>
        <View style={styles.tiposGrid}>
          {tipos.map((tipo) => (
            <TouchableOpacity
              key={tipo.id}
              style={[styles.tipoCard, tipoSelecionado === tipo.id && styles.tipoCardAtivo]}
              onPress={() => setTipoSelecionado(tipo.id)}
            >
              <Text style={[styles.tipoNome, tipoSelecionado === tipo.id && styles.tipoNomeAtivo]}>
                {tipo.nome}
              </Text>
              <Text style={styles.tipoSub}>{tipo.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.recorrenciaCard}>
          <View style={styles.recorrenciaTop}>
            <Text style={styles.recorrenciaTitulo}>Recorrencia</Text>
            <View style={styles.recorrenciaAbas}>
              <TouchableOpacity
                style={[styles.recorrenciaAba, recorrencia === 'mensal' && styles.recorrenciaAbaAtiva]}
                onPress={() => setRecorrencia('mensal')}
              >
                <Text style={[styles.recorrenciaAbaTexto, recorrencia === 'mensal' && styles.recorrenciaAbaTextoAtivo]}>
                  Mensal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.recorrenciaAba, recorrencia === 'unica' && styles.recorrenciaAbaAtiva]}
                onPress={() => setRecorrencia('unica')}
              >
                <Text style={[styles.recorrenciaAbaTexto, recorrencia === 'unica' && styles.recorrenciaAbaTextoAtivo]}>
                  Unica
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.recorrenciaDesc}>
            {recorrencia === 'mensal'
              ? 'Sua contribuicao sera debitada mensalmente. Pode cancelar a qualquer momento.'
              : 'Contribuicao unica, processada apenas uma vez com seguranca.'}
          </Text>
        </View>
        <View style={styles.resumoCard}>
          <View style={styles.resumoLinha}>
            <Text style={styles.resumoLabel}>Tipo</Text>
            <Text style={styles.resumoValor}>
              {tipos.find(t => t.id === tipoSelecionado)?.nome}
            </Text>
          </View>
          <View style={styles.resumoLinha}>
            <Text style={styles.resumoLabel}>Valor</Text>
            <Text style={styles.resumoValor}>
              {valorSelecionado > 0 ? '\u00A3 ' + valorSelecionado : 'A definir'}
            </Text>
          </View>
          <View style={[styles.resumoLinha, { borderBottomWidth: 0 }]}>
            <Text style={styles.resumoLabel}>Frequencia</Text>
            <Text style={styles.resumoValor}>
              {recorrencia === 'mensal' ? 'Todo mes' : 'Uma vez'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.btnContribuir}>
          <Text style={styles.btnContribuirTexto}>Contribuir com seguranca</Text>
        </TouchableOpacity>
        <Text style={styles.segurancaTexto}>
          Pagamento seguro via SumUp - SSL 256-bit
        </Text>
        <View style={styles.versiculoCard}>
          <Text style={styles.versiculoTexto}>
            Cada um deve dar segundo props no seu coracao, nao com tristeza ou por necessidade; porque Deus ama ao que da com alegria.
          </Text>
          <Text style={styles.versiculoRef}>2 Corintios 9:7</Text>
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
  valorCard: { backgroundColor: '#1A1740', margin: 14, borderRadius: 16, padding: 20 },
  valorLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 8 },
  valorDisplay: { fontSize: 42, fontWeight: '500', color: '#fff', textAlign: 'center', marginBottom: 20 },
  presetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  presetBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, minWidth: 70, alignItems: 'center' },
  presetBtnAtivo: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  presetTexto: { fontSize: 15, fontWeight: '500', color: '#fff' },
  secaoTitulo: { fontSize: 14, fontWeight: '500', color: '#1A1740', marginHorizontal: 14, marginBottom: 10 },
  tiposGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 14, marginBottom: 16 },
  tipoCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', padding: 14, width: '47%', gap: 5 },
  tipoCardAtivo: { borderWidth: 1.5, borderColor: '#534AB7', backgroundColor: '#EEEDFE' },
  tipoNome: { fontSize: 13, fontWeight: '500', color: '#1A1740' },
  tipoNomeAtivo: { color: '#534AB7' },
  tipoSub: { fontSize: 11, color: '#8B83D4' },
  recorrenciaCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', padding: 14, marginHorizontal: 14, marginBottom: 16 },
  recorrenciaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  recorrenciaTitulo: { fontSize: 13, fontWeight: '500', color: '#1A1740' },
  recorrenciaAbas: { flexDirection: 'row', backgroundColor: '#EEEDFE', borderRadius: 8, overflow: 'hidden' },
  recorrenciaAba: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  recorrenciaAbaAtiva: { backgroundColor: '#534AB7' },
  recorrenciaAbaTexto: { fontSize: 12, fontWeight: '500', color: '#8B83D4' },
  recorrenciaAbaTextoAtivo: { color: '#fff' },
  recorrenciaDesc: { fontSize: 12, color: '#8B83D4', lineHeight: 18 },
  resumoCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', marginHorizontal: 14, marginBottom: 16, overflow: 'hidden' },
  resumoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(83,74,183,0.08)' },
  resumoLabel: { fontSize: 13, color: '#8B83D4' },
  resumoValor: { fontSize: 13, fontWeight: '500', color: '#1A1740' },
  btnContribuir: { backgroundColor: '#534AB7', borderRadius: 14, marginHorizontal: 14, padding: 16, alignItems: 'center' },
  btnContribuirTexto: { fontSize: 15, fontWeight: '500', color: '#fff' },
  segurancaTexto: { fontSize: 11, color: '#8B83D4', textAlign: 'center', marginTop: 10, marginBottom: 16 },
  versiculoCard: { backgroundColor: '#1A1740', borderRadius: 16, marginHorizontal: 14, padding: 18 },
  versiculoTexto: { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 20, fontStyle: 'italic' },
  versiculoRef: { fontSize: 11, color: '#F5C842', marginTop: 8 },
});
