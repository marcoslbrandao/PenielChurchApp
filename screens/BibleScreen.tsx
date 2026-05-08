import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';

const versoes = [
  { sigla: 'NVI', nome: 'Nova Versão Internacional', idioma: '🇧🇷 Português' },
  { sigla: 'ARC', nome: 'Almeida Revista e Corrigida', idioma: '🇧🇷 Português' },
  { sigla: 'NVT', nome: 'Nova Versão Transformadora', idioma: '🇧🇷 Português' },
  { sigla: 'NIV', nome: 'New International Version', idioma: '🇬🇧 English' },
  { sigla: 'KJV', nome: 'King James Version', idioma: '🇬🇧 English' },
  { sigla: 'NLT', nome: 'New Living Translation', idioma: '🇬🇧 English' },
  { sigla: 'RVR', nome: 'Reina Valera Revisada', idioma: '🇪🇸 Español' },
  { sigla: 'NVI-ES', nome: 'Nueva Versión Internacional', idioma: '🇪🇸 Español' },
  { sigla: 'LSG', nome: 'Louis Segond', idioma: '🇫🇷 Français' },
  { sigla: 'BDS', nome: 'Bible du Semeur', idioma: '🇫🇷 Français' },
];

const livrosAT = [
  { nome: 'Gênesis', caps: 50 },
  { nome: 'Êxodo', caps: 40 },
  { nome: 'Levítico', caps: 27 },
  { nome: 'Números', caps: 36 },
  { nome: 'Deuteronômio', caps: 34 },
  { nome: 'Josué', caps: 24 },
  { nome: 'Juízes', caps: 21 },
  { nome: 'Rute', caps: 4 },
  { nome: '1 Samuel', caps: 31 },
  { nome: '2 Samuel', caps: 24 },
  { nome: '1 Reis', caps: 22 },
  { nome: '2 Reis', caps: 25 },
  { nome: 'Salmos', caps: 150 },
  { nome: 'Provérbios', caps: 31 },
  { nome: 'Eclesiastes', caps: 12 },
  { nome: 'Isaías', caps: 66 },
  { nome: 'Jeremias', caps: 52 },
  { nome: 'Ezequiel', caps: 48 },
  { nome: 'Daniel', caps: 12 },
];

const livrosNT = [
  { nome: 'Mateus', caps: 28 },
  { nome: 'Marcos', caps: 16 },
  { nome: 'Lucas', caps: 24 },
  { nome: 'João', caps: 21 },
  { nome: 'Atos', caps: 28 },
  { nome: 'Romanos', caps: 16 },
  { nome: '1 Coríntios', caps: 16 },
  { nome: '2 Coríntios', caps: 13 },
  { nome: 'Gálatas', caps: 6 },
  { nome: 'Efésios', caps: 6 },
  { nome: 'Filipenses', caps: 4 },
  { nome: 'Colossenses', caps: 4 },
  { nome: '1 Tessalonicenses', caps: 5 },
  { nome: 'Hebreus', caps: 13 },
  { nome: 'Tiago', caps: 5 },
  { nome: '1 Pedro', caps: 5 },
  { nome: '2 Pedro', caps: 3 },
  { nome: '1 João', caps: 5 },
  { nome: 'Apocalipse', caps: 22 },
];

export default function BibleScreen() {
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<'AT' | 'NT'>('AT');
  const [versaoSelecionada, setVersaoSelecionada] = useState(versoes[0]);
  const [modalVisivel, setModalVisivel] = useState(false);

  const livros = aba === 'AT' ? livrosAT : livrosNT;
  const livrosFiltrados = livros.filter(l =>
    l.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const idiomas = [...new Set(versoes.map(v => v.idioma))];

  return (
    <View style={styles.container}>

      {/* Cabeçalho */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerSub}>leitura e estudo</Text>
            <Text style={styles.headerTitulo}>Bíblia</Text>
          </View>
          <TouchableOpacity
            style={styles.versaoBadge}
            onPress={() => setModalVisivel(true)}
          >
            <Text style={styles.bandeiraBadge}>
              {versaoSelecionada.idioma.split(' ')[0]}
            </Text>
            <Text style={styles.versaoTexto}>{versaoSelecionada.sigla}</Text>
            <Ionicons name="chevron-down" size={12} color="#F5C842" />
          </TouchableOpacity>
        </View>
        <View style={styles.busca}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.buscaInput}
            placeholder="Buscar livro ou versículo..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={busca}
            onChangeText={setBusca}
          />
        </View>
      </View>

      {/* Modal de versões */}
      <Modal
        visible={modalVisivel}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisivel(false)}
      >
        <TouchableOpacity
          style={styles.modalFundo}
          activeOpacity={1}
          onPress={() => setModalVisivel(false)}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Escolher versão</Text>
              <TouchableOpacity onPress={() => setModalVisivel(false)}>
                <Ionicons name="close" size={22} color="#1A1740" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {idiomas.map((idioma) => (
                <View key={idioma}>
                  <Text style={styles.idiomaLabel}>
                    {idioma}
                  </Text>
                  {versoes
                    .filter(v => v.idioma === idioma)
                    .map((versao) => (
                      <TouchableOpacity
                        key={versao.sigla}
                        style={[
                          styles.versaoItem,
                          versaoSelecionada.sigla === versao.sigla && styles.versaoItemAtivo,
                        ]}
                        onPress={() => {
                          setVersaoSelecionada(versao);
                          setModalVisivel(false);
                        }}
                      >
                        <View style={styles.versaoItemEsquerda}>
                          <Text style={styles.bandeira}>
                            {versao.idioma.split(' ')[0]}
                          </Text>
                          <View style={styles.versaoItemInfo}>
                            <Text style={[
                              styles.versaoItemSigla,
                              versaoSelecionada.sigla === versao.sigla && styles.versaoItemSiglaAtiva,
                            ]}>
                              {versao.sigla}
                            </Text>
                            <Text style={styles.versaoItemNome}>{versao.nome}</Text>
                          </View>
                        </View>
                        {versaoSelecionada.sigla === versao.sigla && (
                          <Ionicons name="checkmark-circle" size={20} color="#534AB7" />
                        )}
                      </TouchableOpacity>
                    ))}
                </View>
              ))}
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Versículo do dia */}
        <View style={styles.versiculo}>
          <Text style={styles.versiculoLabel}>Versículo do dia</Text>
          <Text style={styles.versiculoTexto}>
            "Porque eu sei os planos que tenho para vocês, planos de prosperidade e não de calamidade."
          </Text>
          <Text style={styles.versiculoRef}>Jeremias 29:11 • {versaoSelecionada.sigla}</Text>
          <View style={styles.versiculoBtns}>
            <TouchableOpacity style={styles.versiculoBtn}>
              <Ionicons name="share-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.versiculoBtnTexto}>Partilhar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.versiculoBtn}>
              <Ionicons name="sunny-outline" size={13} color="#F5C842" />
              <Text style={[styles.versiculoBtnTexto, { color: '#F5C842' }]}>Destacar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.versiculoBtn}>
              <Ionicons name="create-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.versiculoBtnTexto}>Nota</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Plano de leitura */}
        <View style={styles.planoCard}>
          <View style={styles.planoTopo}>
            <View>
              <Text style={styles.planoTitulo}>Plano: 30 dias com os Salmos</Text>
              <Text style={styles.planoDia}>Dia 8 de 30</Text>
            </View>
            <Ionicons name="book-outline" size={20} color="rgba(255,255,255,0.4)" />
          </View>
          <View style={styles.progressoBarra}>
            <View style={styles.progressoFill} />
          </View>
          <View style={styles.planoLeituras}>
            <View style={styles.leituraItem}>
              <View style={[styles.check, styles.checkFeito]}>
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
              <Text style={styles.leituraTexto}>Salmo 23</Text>
              <Text style={styles.leituraTempo}>3 min</Text>
            </View>
            <View style={styles.leituraItem}>
              <View style={[styles.check, styles.checkFeito]}>
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
              <Text style={styles.leituraTexto}>Salmo 24</Text>
              <Text style={styles.leituraTempo}>2 min</Text>
            </View>
            <View style={[styles.leituraItem, { borderBottomWidth: 0 }]}>
              <View style={styles.check}>
                <Ionicons name="ellipse-outline" size={12} color="#534AB7" />
              </View>
              <Text style={[styles.leituraTexto, { color: '#534AB7', fontWeight: '500' }]}>
                Salmo 25 — hoje
              </Text>
              <Text style={[styles.leituraTempo, { color: '#534AB7' }]}>4 min</Text>
            </View>
          </View>
        </View>

        {/* Abas AT / NT */}
        <View style={styles.abasContainer}>
          <View style={styles.abas}>
            <TouchableOpacity
              style={[styles.aba, aba === 'AT' && styles.abaAtiva]}
              onPress={() => setAba('AT')}
            >
              <Text style={[styles.abaTexto, aba === 'AT' && styles.abaTextoAtivo]}>
                Antigo Testamento
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.aba, aba === 'NT' && styles.abaAtiva]}
              onPress={() => setAba('NT')}
            >
              <Text style={[styles.abaTexto, aba === 'NT' && styles.abaTextoAtivo]}>
                Novo Testamento
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.livrosGrid}>
            {livrosFiltrados.map((livro, index) => (
              <TouchableOpacity key={index} style={styles.livroBtn}>
                <Text style={styles.livroNome}>{livro.nome}</Text>
                <Text style={styles.livroCaps}>{livro.caps} cap.</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F8FF' },
  header: {
    backgroundColor: '#1A1740',
    paddingTop: 55,
    paddingBottom: 16,
    paddingHorizontal: 18,
  },
  headerTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  headerTitulo: { fontSize: 18, fontWeight: '500', color: '#fff', marginTop: 2 },
  versaoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(245,200,66,0.2)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  bandeiraBadge: { fontSize: 16 },
  versaoTexto: { fontSize: 12, fontWeight: '500', color: '#F5C842' },
  busca: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)',
  },
  buscaInput: { flex: 1, fontSize: 13, color: '#fff' },
  modalFundo: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 20, maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  modalTitulo: { fontSize: 16, fontWeight: '500', color: '#1A1740' },
  idiomaLabel: {
    fontSize: 11, fontWeight: '500', color: '#8B83D4',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 16, marginBottom: 8,
  },
  versaoItem: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14, borderRadius: 12, marginBottom: 6,
    backgroundColor: '#F9F8FF',
  },
  versaoItemAtivo: { backgroundColor: '#EEEDFE' },
  versaoItemEsquerda: {
    flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1,
  },
  bandeira: { fontSize: 26 },
  versaoItemInfo: { flex: 1 },
  versaoItemSigla: { fontSize: 14, fontWeight: '500', color: '#1A1740' },
  versaoItemSiglaAtiva: { color: '#534AB7' },
  versaoItemNome: { fontSize: 12, color: '#8B83D4', marginTop: 2 },
  versiculo: {
    backgroundColor: '#1A1740',
    margin: 14, borderRadius: 16, padding: 18,
  },
  versiculoLabel: {
    fontSize: 10, fontWeight: '500', color: '#F5C842',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  },
  versiculoTexto: {
    fontSize: 14, color: 'rgba(255,255,255,0.9)',
    lineHeight: 22, fontStyle: 'italic',
  },
  versiculoRef: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 6 },
  versiculoBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  versiculoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  versiculoBtnTexto: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  planoCard: {
    backgroundColor: '#2D2880',
    marginHorizontal: 14, borderRadius: 16, marginBottom: 14,
  },
  planoTopo: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 14,
  },
  planoTitulo: { fontSize: 14, fontWeight: '500', color: '#fff' },
  planoDia: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  progressoBarra: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 14,
  },
  progressoFill: {
    height: 3, backgroundColor: '#F5C842', width: '27%', borderRadius: 2,
  },
  planoLeituras: { padding: 14 },
  leituraItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  check: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: '#534AB7',
    alignItems: 'center', justifyContent: 'center',
  },
  checkFeito: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  leituraTexto: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  leituraTempo: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  abasContainer: { paddingHorizontal: 14 },
  abas: {
    flexDirection: 'row', backgroundColor: '#EEEDFE',
    borderRadius: 10, overflow: 'hidden', marginBottom: 12,
  },
  aba: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  abaAtiva: { backgroundColor: '#534AB7' },
  abaTexto: { fontSize: 12, fontWeight: '500', color: '#8B83D4' },
  abaTextoAtivo: { color: '#fff' },
  livrosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  livroBtn: {
    backgroundColor: '#fff', borderRadius: 10, padding: 10,
    borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)',
    width: '31%', alignItems: 'center',
  },
  livroNome: { fontSize: 12, fontWeight: '500', color: '#1A1740', textAlign: 'center' },
  livroCaps: { fontSize: 10, color: '#8B83D4', marginTop: 3 },
});