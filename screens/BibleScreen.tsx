import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Share, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { getVersiculoDoDia, parseReferencia, getTextoVersiculo, getReferenciaVersiculo, getVersaoVersiculo } from '../lib/versiculoDoDia';
import { livrosAT, livrosNT, Livro } from '../lib/bibliaLivros';

// ─── Versões com API IDs ──────────────────────────────────────────────────────
// Fonte: abibliadigital.com.br. Francês removido — sem fonte gratuita confiável
// disponível no momento. Esta API oferece no total 3 versões em português,
// 2 em inglês e 1 em espanhol — é o máximo possível sem contratar outra fonte.
const versoes = [
  { sigla: 'NVI', nome: 'Nova Versão Internacional',    idioma: '🇧🇷 Português', apiId: 'nvi' },
  { sigla: 'ARA', nome: 'Almeida Revista e Atualizada', idioma: '🇧🇷 Português', apiId: 'ra'  },
  { sigla: 'ACF', nome: 'Almeida Corrigida Fiel',       idioma: '🇧🇷 Português', apiId: 'acf' },
  { sigla: 'KJV', nome: 'King James Version',           idioma: '🇬🇧 English',   apiId: 'kjv' },
  { sigla: 'BBE', nome: 'Bible in Basic English',       idioma: '🇬🇧 English',   apiId: 'bbe' },
  { sigla: 'RVR', nome: 'Reina Valera',                 idioma: '🇪🇸 Español',   apiId: 'rvr' },
];

const VERSICULO_DIA_RAW = getVersiculoDoDia();

// Resolve o livro e capítulo do versículo do dia, para o botão "Ler capítulo inteiro".
function resolverLivroDoVersiculo(): { livro: Livro; capitulo: number } | null {
  const parsed = parseReferencia(VERSICULO_DIA_RAW.ref);
  if (!parsed) return null;
  const livro = [...livrosAT, ...livrosNT].find(l => l.pt === parsed.livroNome);
  if (!livro) return null;
  return { livro, capitulo: parsed.capitulo };
}
const LIVRO_VERSICULO_DIA = resolverLivroDoVersiculo();

// ─── Plano de leitura: 30 dias com os Salmos ─────────────────────────────────
// Cada posição é o número do Salmo lido naquele dia do plano.
const PLANO_SALMOS = [
  1, 8, 15, 16, 19, 23, 24, 27, 32, 34,
  37, 42, 46, 51, 62, 63, 67, 71, 84, 90,
  91, 100, 103, 116, 119, 121, 127, 130, 139, 150,
];

type Verso = { book_name: string; chapter: number; verse: number; text: string };
type LangKey = 'pt' | 'en' | 'es' | 'fr';

function getLangKey(apiId: string): LangKey {
  if (apiId === 'kjv' || apiId === 'bbe') return 'en';
  if (apiId === 'rvr') return 'es';
  return 'pt';
}
function nomeLivro(livro: Livro, langKey: LangKey): string { return livro[langKey]; }

// A API indexa os livros por abreviação em pt ou en — nem toda versão aceita as
// duas, então tentamos a abreviação "nativa" da versão e caímos para a outra em
// caso de falha (ver buscarCapitulo).
function abreviaturasParaTentar(livro: Livro, apiId: string): string[] {
  return apiId === 'kjv' || apiId === 'bbe' ? [livro.apiEn, livro.apiPt] : [livro.apiPt, livro.apiEn];
}

// ─── Leitor Modal ─────────────────────────────────────────────────────────────
function LeitorModal({ livro, versao, capInicial, onClose }: {
  livro: Livro | null; versao: typeof versoes[0]; capInicial?: number; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [capitulo, setCapitulo] = useState(capInicial ?? 1);
  const [versos, setVersos] = useState<Verso[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const langKey = getLangKey(versao.apiId);
  const nomeExibido = livro ? nomeLivro(livro, langKey) : '';

  const buscarCapitulo = async (cap: number) => {
    if (!livro) return;
    setLoading(true);
    setError('');
    setVersos([]);
    try {
      const token = process.env.EXPO_PUBLIC_BIBLE_API_TOKEN;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      // Tenta a abreviação "nativa" da versão primeiro (pt para nvi/ra, en para
      // kjv); se não encontrar, tenta a outra abreviação antes de desistir.
      let data: any = null;
      for (const abbrev of abreviaturasParaTentar(livro, versao.apiId)) {
        const url = `https://www.abibliadigital.com.br/api/verses/${versao.apiId}/${abbrev}/${cap}`;
        const res = await fetch(url, { headers });
        data = await res.json();
        if (!data?.error && data?.verses?.length > 0) break;
      }
      if (!data || data.error || !data.verses || data.verses.length === 0) {
        setError(t('biblia.capituloNaoEncontrado'));
      } else {
        setVersos(data.verses.map((v: any) => ({
          book_name: data.book?.name ?? nomeExibido,
          chapter: data.chapter?.number ?? cap,
          verse: v.number,
          text: v.text,
        })));
      }
    } catch {
      setError(t('biblia.semConexao'));
    }
    setLoading(false);
  };

  // Carrega o capítulo inicial (ou o 1º) ao abrir ou trocar de livro
  useEffect(() => {
    if (livro) {
      const cap = capInicial ?? 1;
      setCapitulo(cap);
      setVersos([]);
      setError('');
      buscarCapitulo(cap);
    }
  }, [livro?.slug, versao.apiId, capInicial]);

  const mudarCap = (cap: number) => {
    if (!livro || cap < 1 || cap > livro.caps) return;
    setCapitulo(cap);
    buscarCapitulo(cap);
  };

  if (!livro) return null;

  return (
    <Modal visible={!!livro} animationType="slide" onRequestClose={onClose}>
      <View style={lr.container}>
        {/* Header */}
        <View style={lr.header}>
          <TouchableOpacity onPress={onClose} style={lr.closeBtn}>
            <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={lr.headerTitle}>{nomeExibido}</Text>
            <Text style={lr.headerSub}>{t('biblia.capitulo')} {capitulo} · {versao.sigla}</Text>
          </View>
          <TouchableOpacity onPress={() => {
            const texto = versos.map(v => `${v.verse}. ${v.text.trim()}`).join('\n');
            Share.share({ message: `${nomeExibido} ${capitulo}\n\n${texto}\n\n— ${versao.sigla}` });
          }} style={lr.closeBtn}>
            <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Navegação de capítulos */}
        <View style={lr.capNav}>
          <TouchableOpacity style={[lr.capBtn, capitulo <= 1 && lr.capBtnDisabled]} onPress={() => mudarCap(capitulo - 1)}>
            <Ionicons name="chevron-back" size={18} color={capitulo <= 1 ? 'rgba(255,255,255,0.2)' : '#F5C842'} />
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={lr.capScroll}>
            {Array.from({ length: livro.caps }, (_, i) => i + 1).map(cap => (
              <TouchableOpacity
                key={cap}
                style={[lr.capNum, cap === capitulo && lr.capNumAtivo]}
                onPress={() => mudarCap(cap)}
              >
                <Text style={[lr.capNumText, cap === capitulo && lr.capNumTextAtivo]}>{cap}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={[lr.capBtn, capitulo >= livro.caps && lr.capBtnDisabled]} onPress={() => mudarCap(capitulo + 1)}>
            <Ionicons name="chevron-forward" size={18} color={capitulo >= livro.caps ? 'rgba(255,255,255,0.2)' : '#F5C842'} />
          </TouchableOpacity>
        </View>

        {/* Conteúdo */}
        <ScrollView contentContainerStyle={lr.scroll}>
          {loading && (
            <View style={lr.loadingWrap}>
              <ActivityIndicator color="#F5C842" size="large" />
              <Text style={lr.loadingText}>{t('midia.carregando')}</Text>
            </View>
          )}
          {!!error && (
            <View style={lr.errorWrap}>
              <Ionicons name="alert-circle-outline" size={32} color="rgba(255,255,255,0.4)" />
              <Text style={lr.errorText}>{error}</Text>
              <TouchableOpacity style={lr.retryBtn} onPress={() => buscarCapitulo(capitulo)}>
                <Text style={lr.retryBtnText}>{t('biblia.tentarNovamente')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {!loading && !error && versos.map(v => (
            <View key={v.verse} style={lr.versoRow}>
              <Text style={lr.versoNum}>{v.verse}</Text>
              <Text style={lr.versoText}>{v.text.trim()}</Text>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const lr = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1740' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 55, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#1A1740', borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.1)' },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 11, color: '#F5C842', marginTop: 2 },
  capNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#241F5E', paddingVertical: 8 },
  capBtn: { paddingHorizontal: 12 },
  capBtnDisabled: { opacity: 0.3 },
  capScroll: { flexDirection: 'row', gap: 4, paddingHorizontal: 4 },
  capNum: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  capNumAtivo: { backgroundColor: '#F5C842' },
  capNumText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  capNumTextAtivo: { color: '#1A1740', fontWeight: '800' },
  scroll: { padding: 20 },
  loadingWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  loadingText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  errorWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  errorText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  retryBtn: { backgroundColor: 'rgba(245,200,66,0.2)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 8 },
  retryBtnText: { color: '#F5C842', fontWeight: '600' },
  versoRow: { flexDirection: 'row', marginBottom: 12, gap: 10 },
  versoNum: { fontSize: 11, color: '#F5C842', fontWeight: '700', width: 22, paddingTop: 2 },
  versoText: { flex: 1, fontSize: 17, color: 'rgba(255,255,255,0.9)', lineHeight: 28 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BibleScreen() {
  const { t, i18n } = useTranslation();
  const { user, isLoggedIn } = useAuth();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<'AT' | 'NT'>('AT');
  const [versaoSelecionada, setVersaoSelecionada] = useState(versoes[0]);
  const [modalVersoes, setModalVersoes] = useState(false);
  const [livroAberto, setLivroAberto] = useState<Livro | null>(null);
  const [capAbertura, setCapAbertura] = useState<number | undefined>(undefined);

  // Abre um capítulo específico quando chega via navegação (ex: botão "Ler
  // capítulo inteiro" do versículo do dia na Home).
  useEffect(() => {
    const { livroSlug, capitulo } = route.params ?? {};
    if (!livroSlug) return;
    const livro = [...livrosAT, ...livrosNT].find(l => l.slug === livroSlug);
    if (livro) {
      setCapAbertura(typeof capitulo === 'number' ? capitulo : 1);
      setLivroAberto(livro);
    }
    navigation.setParams({ livroSlug: undefined, capitulo: undefined });
  }, [route.params]);

  const abrirCapituloDoVersiculoDoDia = () => {
    if (!LIVRO_VERSICULO_DIA) return;
    setCapAbertura(LIVRO_VERSICULO_DIA.capitulo);
    setLivroAberto(LIVRO_VERSICULO_DIA.livro);
  };
  const [salvandoVersiculo, setSalvandoVersiculo] = useState(false);

  // ── Plano de leitura ──────────────────────────────────────────────────────
  const [diaPlano, setDiaPlano] = useState<number | null>(null);
  const salmoLivro = livrosAT.find(l => l.slug === 'psalms') ?? null;

  useEffect(() => {
    if (!user) { setDiaPlano(null); return; }
    (async () => {
      try {
        const { data } = await supabase
          .from('reading_plan_progress')
          .select('dia_atual')
          .eq('user_id', user.id)
          .maybeSingle();
        if (data) {
          setDiaPlano(data.dia_atual);
        } else {
          await supabase.from('reading_plan_progress').insert({ user_id: user.id, dia_atual: 1 });
          setDiaPlano(1);
        }
      } catch {
        setDiaPlano(null);
      }
    })();
  }, [user?.id]);

  const abrirLeituraDoPlano = (dia: number) => {
    if (!salmoLivro || dia < 1 || dia > PLANO_SALMOS.length) return;
    setCapAbertura(PLANO_SALMOS[dia - 1]);
    setLivroAberto(salmoLivro);
  };

  const marcarLeituraDeHoje = async () => {
    if (!isLoggedIn || !user) {
      Alert.alert(t('biblia.facaLogin'), t('biblia.entreParaAcompanharPlano'));
      return;
    }
    if (diaPlano === null || diaPlano > PLANO_SALMOS.length) return;
    const proximoDia = diaPlano + 1;
    const { error } = await supabase
      .from('reading_plan_progress')
      .update({ dia_atual: proximoDia, atualizado_em: new Date().toISOString() })
      .eq('user_id', user.id);
    if (!error) setDiaPlano(proximoDia);
  };

  const reiniciarPlano = async () => {
    if (!user) return;
    const { error } = await supabase
      .from('reading_plan_progress')
      .update({ dia_atual: 1, atualizado_em: new Date().toISOString() })
      .eq('user_id', user.id);
    if (!error) setDiaPlano(1);
  };

  const livros = aba === 'AT' ? livrosAT : livrosNT;
  const langKey = getLangKey(versaoSelecionada.apiId);
  const livrosFiltrados = busca
    ? [...livrosAT, ...livrosNT].filter(l => l[langKey].toLowerCase().includes(busca.toLowerCase()))
    : livros;

  const idiomas = [...new Set(versoes.map(v => v.idioma))];

  // Versículo do dia no idioma atual do app (Perfil > Idioma).
  const versiculoTexto = getTextoVersiculo(VERSICULO_DIA_RAW, i18n.language);
  const versiculoRef = getReferenciaVersiculo(VERSICULO_DIA_RAW, i18n.language);
  const versiculoVersaoIdioma = getVersaoVersiculo(i18n.language);

  const partilharVersiculo = async () => {
    await Share.share({
      message: `${versiculoTexto}\n\n— ${versiculoRef} (${versiculoVersaoIdioma})\n\n📖 Peniel Church App`,
    });
  };

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

  return (
    <View style={styles.container}>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerSub}>{t('biblia.leituraEEstudo')}</Text>
            <Text style={styles.headerTitulo}>{t('biblia.titulo')}</Text>
          </View>
          <TouchableOpacity style={styles.versaoBadge} onPress={() => setModalVersoes(true)}>
            <Text style={styles.bandeiraBadge}>{versaoSelecionada.idioma.split(' ')[0]}</Text>
            <Text style={styles.versaoTexto}>{versaoSelecionada.sigla}</Text>
            <Ionicons name="chevron-down" size={12} color="#F5C842" />
          </TouchableOpacity>
        </View>
        <View style={styles.busca}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.buscaInput}
            placeholder={t('biblia.buscarLivro')}
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={busca}
            onChangeText={setBusca}
          />
          {!!busca && (
            <TouchableOpacity onPress={() => setBusca('')}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Modal versões */}
      <Modal visible={modalVersoes} transparent animationType="slide" onRequestClose={() => setModalVersoes(false)}>
        <TouchableOpacity style={styles.modalFundo} activeOpacity={1} onPress={() => setModalVersoes(false)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>{t('biblia.escolherVersao')}</Text>
              <TouchableOpacity onPress={() => setModalVersoes(false)}>
                <Ionicons name="close" size={22} color="#1A1740" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {idiomas.map((idioma) => (
                <View key={idioma}>
                  <Text style={styles.idiomaLabel}>{idioma}</Text>
                  {versoes.filter(v => v.idioma === idioma).map((versao) => (
                    <TouchableOpacity
                      key={versao.sigla}
                      style={[styles.versaoItem, versaoSelecionada.sigla === versao.sigla && styles.versaoItemAtivo]}
                      onPress={() => { setVersaoSelecionada(versao); setModalVersoes(false); }}
                    >
                      <View style={styles.versaoItemEsquerda}>
                        <Text style={styles.bandeira}>{versao.idioma.split(' ')[0]}</Text>
                        <View style={styles.versaoItemInfo}>
                          <Text style={[styles.versaoItemSigla, versaoSelecionada.sigla === versao.sigla && styles.versaoItemSiglaAtiva]}>
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
          <Text style={styles.versiculoLabel}>{t('home.versiculoDoDia')}</Text>
          <Text style={styles.versiculoTexto}>{versiculoTexto}</Text>
          <View style={styles.versiculoRefRow}>
            <Text style={styles.versiculoRef}>{versiculoRef} • {versiculoVersaoIdioma}</Text>
            {!!LIVRO_VERSICULO_DIA && (
              <TouchableOpacity style={styles.versiculoLerCapBtn} onPress={abrirCapituloDoVersiculoDoDia}>
                <Text style={styles.versiculoLerCapTexto}>{t('home.lerCapituloInteiro')}</Text>
                <Ionicons name="chevron-forward" size={12} color="#F5C842" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.versiculoBtns}>
            <TouchableOpacity style={styles.versiculoBtn} onPress={partilharVersiculo}>
              <Ionicons name="share-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.versiculoBtnTexto}>{t('common.compartilhar')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.versiculoBtn} onPress={handleSalvarVersiculo} disabled={salvandoVersiculo}>
              <Ionicons name="bookmark-outline" size={13} color="#F5C842" />
              <Text style={[styles.versiculoBtnTexto, { color: '#F5C842' }]}>{salvandoVersiculo ? t('common.salvando') : t('common.salvar')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Plano de leitura */}
        <View style={styles.planoCard}>
          {diaPlano !== null && diaPlano > PLANO_SALMOS.length ? (
            <>
              <View style={styles.planoTopo}>
                <View>
                  <Text style={styles.planoTitulo}>{t('biblia.planoTitulo')}</Text>
                  <Text style={styles.planoDia}>{t('biblia.planoConcluido')}</Text>
                </View>
                <Ionicons name="trophy-outline" size={20} color="#F5C842" />
              </View>
              <TouchableOpacity style={styles.planoReiniciarBtn} onPress={reiniciarPlano}>
                <Ionicons name="refresh" size={14} color="#1A1740" />
                <Text style={styles.planoReiniciarTexto}>{t('biblia.reiniciarPlano')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.planoTopo}>
                <View>
                  <Text style={styles.planoTitulo}>{t('biblia.planoTitulo')}</Text>
                  <Text style={styles.planoDia}>
                    {diaPlano === null ? t('biblia.facaLoginParaAcompanhar') : t('biblia.diaXdeY', { dia: diaPlano, total: PLANO_SALMOS.length })}
                  </Text>
                </View>
                <Ionicons name="book-outline" size={20} color="rgba(255,255,255,0.4)" />
              </View>
              <View style={styles.progressoBarra}>
                <View style={[styles.progressoFill, { width: `${((diaPlano ?? 1) - 1) / PLANO_SALMOS.length * 100}%` }]} />
              </View>
              <View style={styles.planoLeituras}>
                {[diaPlano !== null && diaPlano > 1 ? diaPlano - 1 : null, diaPlano ?? 1]
                  .filter((d): d is number => d !== null)
                  .map((dia, idx, arr) => (
                    <TouchableOpacity
                      key={dia}
                      style={[styles.leituraItem, idx === arr.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() => abrirLeituraDoPlano(dia)}
                    >
                      <View style={[styles.check, dia < (diaPlano ?? 1) && styles.checkFeito]}>
                        {dia < (diaPlano ?? 1)
                          ? <Ionicons name="checkmark" size={12} color="#fff" />
                          : <Ionicons name="ellipse-outline" size={12} color="#534AB7" />}
                      </View>
                      <Text style={[styles.leituraTexto, dia === diaPlano && { color: '#534AB7', fontWeight: '500' }]}>
                        {t('biblia.salmo')} {PLANO_SALMOS[dia - 1]}{dia === diaPlano ? t('biblia.hojeSufixo') : ''}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
                    </TouchableOpacity>
                  ))}
              </View>
              <TouchableOpacity style={styles.planoMarcarBtn} onPress={marcarLeituraDeHoje}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#1A1740" />
                <Text style={styles.planoMarcarTexto}>{t('biblia.marcarLeituraHoje')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Abas AT / NT */}
        <View style={styles.abasContainer}>
          {!busca && (
            <View style={styles.abas}>
              <TouchableOpacity style={[styles.aba, aba === 'AT' && styles.abaAtiva]} onPress={() => setAba('AT')}>
                <Text style={[styles.abaTexto, aba === 'AT' && styles.abaTextoAtivo]}>
                  {t('biblia.antigoTestamento')} ({livrosAT.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.aba, aba === 'NT' && styles.abaAtiva]} onPress={() => setAba('NT')}>
                <Text style={[styles.abaTexto, aba === 'NT' && styles.abaTextoAtivo]}>
                  {t('biblia.novoTestamento')} ({livrosNT.length})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {busca && (
            <Text style={styles.buscaResultado}>
              {livrosFiltrados.length} {livrosFiltrados.length !== 1 ? t('biblia.resultados') : t('biblia.resultado')} {t('biblia.para')} "{busca}"
            </Text>
          )}

          <View style={styles.livrosGrid}>
            {livrosFiltrados.map((livro, index) => (
              <TouchableOpacity
                key={index}
                style={styles.livroBtn}
                onPress={() => { setCapAbertura(undefined); setLivroAberto(livro); }}
                activeOpacity={0.7}
              >
                <Text style={styles.livroNome}>{nomeLivro(livro, langKey)}</Text>
                <Text style={styles.livroCaps}>{livro.caps} {t('biblia.capAbrev')}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Leitor interno */}
      <LeitorModal
        livro={livroAberto}
        versao={versaoSelecionada}
        capInicial={capAbertura}
        onClose={() => { setLivroAberto(null); setCapAbertura(undefined); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F8FF' },
  header: { backgroundColor: '#1A1740', paddingTop: 55, paddingBottom: 16, paddingHorizontal: 18 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  headerTitulo: { fontSize: 18, fontWeight: '500', color: '#fff', marginTop: 2 },
  versaoBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(245,200,66,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  bandeiraBadge: { fontSize: 16 },
  versaoTexto: { fontSize: 12, fontWeight: '500', color: '#F5C842' },
  busca: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)' },
  buscaInput: { flex: 1, fontSize: 13, color: '#fff' },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitulo: { fontSize: 16, fontWeight: '500', color: '#1A1740' },
  idiomaLabel: { fontSize: 11, fontWeight: '500', color: '#8B83D4', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  versaoItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, marginBottom: 6, backgroundColor: '#F9F8FF' },
  versaoItemAtivo: { backgroundColor: '#EEEDFE' },
  versaoItemEsquerda: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  bandeira: { fontSize: 26 },
  versaoItemInfo: { flex: 1 },
  versaoItemSigla: { fontSize: 14, fontWeight: '500', color: '#1A1740' },
  versaoItemSiglaAtiva: { color: '#534AB7' },
  versaoItemNome: { fontSize: 12, color: '#8B83D4', marginTop: 2 },
  versiculo: { backgroundColor: '#1A1740', margin: 14, borderRadius: 16, padding: 18 },
  versiculoLabel: { fontSize: 10, fontWeight: '500', color: '#F5C842', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  versiculoTexto: { fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 22, fontStyle: 'italic' },
  versiculoRef: { fontSize: 12, color: 'rgba(255,255,255,0.4)', flexShrink: 1 },
  versiculoRefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  versiculoLerCapBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  versiculoLerCapTexto: { fontSize: 11, fontWeight: '600', color: '#F5C842' },
  versiculoBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  versiculoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  versiculoBtnTexto: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  planoCard: { backgroundColor: '#2D2880', marginHorizontal: 14, borderRadius: 16, marginBottom: 14 },
  planoTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  planoTitulo: { fontSize: 14, fontWeight: '500', color: '#fff' },
  planoDia: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  progressoBarra: { height: 3, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 14 },
  progressoFill: { height: 3, backgroundColor: '#F5C842', width: '27%', borderRadius: 2 },
  planoLeituras: { padding: 14 },
  leituraItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#534AB7', alignItems: 'center', justifyContent: 'center' },
  checkFeito: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  leituraTexto: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  planoMarcarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F5C842', borderRadius: 12, paddingVertical: 12, marginHorizontal: 14, marginBottom: 14 },
  planoMarcarTexto: { fontSize: 13, fontWeight: '700', color: '#1A1740' },
  planoReiniciarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F5C842', borderRadius: 12, paddingVertical: 12, marginHorizontal: 14, marginBottom: 14 },
  planoReiniciarTexto: { fontSize: 13, fontWeight: '700', color: '#1A1740' },
  abasContainer: { paddingHorizontal: 14 },
  abas: { flexDirection: 'row', backgroundColor: '#EEEDFE', borderRadius: 10, overflow: 'hidden', marginBottom: 12 },
  aba: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  abaAtiva: { backgroundColor: '#534AB7' },
  abaTexto: { fontSize: 11, fontWeight: '500', color: '#8B83D4' },
  abaTextoAtivo: { color: '#fff' },
  buscaResultado: { fontSize: 12, color: '#8B83D4', marginBottom: 10 },
  livrosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  livroBtn: { backgroundColor: '#fff', borderRadius: 10, padding: 10, borderWidth: 0.5, borderColor: 'rgba(83,74,183,0.13)', width: '31%', alignItems: 'center' },
  livroNome: { fontSize: 12, fontWeight: '500', color: '#1A1740', textAlign: 'center' },
  livroCaps: { fontSize: 10, color: '#8B83D4', marginTop: 3 },
});
