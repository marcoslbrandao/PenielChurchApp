import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Share, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';

// ─── Versões com API IDs ──────────────────────────────────────────────────────
// bible-api.com suporta: almeida, kjv, rv1960, lsg
const versoes = [
  { sigla: 'Almeida', nome: 'Almeida Rev. e Corrigida', idioma: '🇧🇷 Português', apiId: 'almeida' },
  { sigla: 'KJV',     nome: 'King James Version',        idioma: '🇬🇧 English',   apiId: 'kjv'     },
  { sigla: 'RV1960',  nome: 'Reina Valera 1960',          idioma: '🇪🇸 Español',   apiId: 'rv1960'  },
  { sigla: 'LSG',     nome: 'Louis Segond',               idioma: '🇫🇷 Français',  apiId: 'lsg'     },
];

// ─── Livros (multilíngue) ────────────────────────────────────────────────────
const livrosAT: Livro[] = [
  { slug: 'genesis',         caps: 50,  pt: 'Gênesis',       en: 'Genesis',         es: 'Génesis',       fr: 'Genèse'        },
  { slug: 'exodus',          caps: 40,  pt: 'Êxodo',         en: 'Exodus',          es: 'Éxodo',         fr: 'Exode'         },
  { slug: 'leviticus',       caps: 27,  pt: 'Levítico',      en: 'Leviticus',       es: 'Levítico',      fr: 'Lévitique'     },
  { slug: 'numbers',         caps: 36,  pt: 'Números',       en: 'Numbers',         es: 'Números',       fr: 'Nombres'       },
  { slug: 'deuteronomy',     caps: 34,  pt: 'Deuteronômio',  en: 'Deuteronomy',     es: 'Deuteronomio',  fr: 'Deutéronome'   },
  { slug: 'joshua',          caps: 24,  pt: 'Josué',         en: 'Joshua',          es: 'Josué',         fr: 'Josué'         },
  { slug: 'judges',          caps: 21,  pt: 'Juízes',        en: 'Judges',          es: 'Jueces',        fr: 'Juges'         },
  { slug: 'ruth',            caps: 4,   pt: 'Rute',          en: 'Ruth',            es: 'Rut',           fr: 'Ruth'          },
  { slug: '1+samuel',        caps: 31,  pt: '1 Samuel',      en: '1 Samuel',        es: '1 Samuel',      fr: '1 Samuel'      },
  { slug: '2+samuel',        caps: 24,  pt: '2 Samuel',      en: '2 Samuel',        es: '2 Samuel',      fr: '2 Samuel'      },
  { slug: '1+kings',         caps: 22,  pt: '1 Reis',        en: '1 Kings',         es: '1 Reyes',       fr: '1 Rois'        },
  { slug: '2+kings',         caps: 25,  pt: '2 Reis',        en: '2 Kings',         es: '2 Reyes',       fr: '2 Rois'        },
  { slug: '1+chronicles',    caps: 29,  pt: '1 Crônicas',    en: '1 Chronicles',    es: '1 Crónicas',    fr: '1 Chroniques'  },
  { slug: '2+chronicles',    caps: 36,  pt: '2 Crônicas',    en: '2 Chronicles',    es: '2 Crónicas',    fr: '2 Chroniques'  },
  { slug: 'ezra',            caps: 10,  pt: 'Esdras',        en: 'Ezra',            es: 'Esdras',        fr: 'Esdras'        },
  { slug: 'nehemiah',        caps: 13,  pt: 'Neemias',       en: 'Nehemiah',        es: 'Nehemías',      fr: 'Néhémie'       },
  { slug: 'esther',          caps: 10,  pt: 'Ester',         en: 'Esther',          es: 'Ester',         fr: 'Esther'        },
  { slug: 'job',             caps: 42,  pt: 'Jó',            en: 'Job',             es: 'Job',           fr: 'Job'           },
  { slug: 'psalms',          caps: 150, pt: 'Salmos',        en: 'Psalms',          es: 'Salmos',        fr: 'Psaumes'       },
  { slug: 'proverbs',        caps: 31,  pt: 'Provérbios',    en: 'Proverbs',        es: 'Proverbios',    fr: 'Proverbes'     },
  { slug: 'ecclesiastes',    caps: 12,  pt: 'Eclesiastes',   en: 'Ecclesiastes',    es: 'Eclesiastés',   fr: 'Ecclésiaste'   },
  { slug: 'song+of+solomon', caps: 8,   pt: 'Cantares',      en: 'Song of Solomon', es: 'Cantares',      fr: 'Cantique'      },
  { slug: 'isaiah',          caps: 66,  pt: 'Isaías',        en: 'Isaiah',          es: 'Isaías',        fr: 'Ésaïe'         },
  { slug: 'jeremiah',        caps: 52,  pt: 'Jeremias',      en: 'Jeremiah',        es: 'Jeremías',      fr: 'Jérémie'       },
  { slug: 'lamentations',    caps: 5,   pt: 'Lamentações',   en: 'Lamentations',    es: 'Lamentaciones', fr: 'Lamentations'  },
  { slug: 'ezekiel',         caps: 48,  pt: 'Ezequiel',      en: 'Ezekiel',         es: 'Ezequiel',      fr: 'Ézéchiel'      },
  { slug: 'daniel',          caps: 12,  pt: 'Daniel',        en: 'Daniel',          es: 'Daniel',        fr: 'Daniel'        },
  { slug: 'hosea',           caps: 14,  pt: 'Oséias',        en: 'Hosea',           es: 'Oseas',         fr: 'Osée'          },
  { slug: 'joel',            caps: 3,   pt: 'Joel',          en: 'Joel',            es: 'Joel',          fr: 'Joël'          },
  { slug: 'amos',            caps: 9,   pt: 'Amós',          en: 'Amos',            es: 'Amós',          fr: 'Amos'          },
  { slug: 'jonah',           caps: 4,   pt: 'Jonas',         en: 'Jonah',           es: 'Jonás',         fr: 'Jonas'         },
  { slug: 'micah',           caps: 7,   pt: 'Miquéias',      en: 'Micah',           es: 'Miqueas',       fr: 'Michée'        },
  { slug: 'habakkuk',        caps: 3,   pt: 'Habacuque',     en: 'Habakkuk',        es: 'Habacuc',       fr: 'Habacuc'       },
  { slug: 'malachi',         caps: 4,   pt: 'Malaquias',     en: 'Malachi',         es: 'Malaquías',     fr: 'Malachie'      },
];

const livrosNT: Livro[] = [
  { slug: 'matthew',         caps: 28, pt: 'Mateus',            en: 'Matthew',         es: 'Mateo',            fr: 'Matthieu'         },
  { slug: 'mark',            caps: 16, pt: 'Marcos',            en: 'Mark',            es: 'Marcos',           fr: 'Marc'             },
  { slug: 'luke',            caps: 24, pt: 'Lucas',             en: 'Luke',            es: 'Lucas',            fr: 'Luc'              },
  { slug: 'john',            caps: 21, pt: 'João',              en: 'John',            es: 'Juan',             fr: 'Jean'             },
  { slug: 'acts',            caps: 28, pt: 'Atos',              en: 'Acts',            es: 'Hechos',           fr: 'Actes'            },
  { slug: 'romans',          caps: 16, pt: 'Romanos',           en: 'Romans',          es: 'Romanos',          fr: 'Romains'          },
  { slug: '1+corinthians',   caps: 16, pt: '1 Coríntios',       en: '1 Corinthians',   es: '1 Corintios',      fr: '1 Corinthiens'    },
  { slug: '2+corinthians',   caps: 13, pt: '2 Coríntios',       en: '2 Corinthians',   es: '2 Corintios',      fr: '2 Corinthiens'    },
  { slug: 'galatians',       caps: 6,  pt: 'Gálatas',           en: 'Galatians',       es: 'Gálatas',          fr: 'Galates'          },
  { slug: 'ephesians',       caps: 6,  pt: 'Efésios',           en: 'Ephesians',       es: 'Efesios',          fr: 'Éphésiens'        },
  { slug: 'philippians',     caps: 4,  pt: 'Filipenses',        en: 'Philippians',     es: 'Filipenses',       fr: 'Philippiens'      },
  { slug: 'colossians',      caps: 4,  pt: 'Colossenses',       en: 'Colossians',      es: 'Colosenses',       fr: 'Colossiens'       },
  { slug: '1+thessalonians', caps: 5,  pt: '1 Tessalonicenses', en: '1 Thessalonians', es: '1 Tesalonicenses', fr: '1 Thessaloniciens'},
  { slug: '2+thessalonians', caps: 3,  pt: '2 Tessalonicenses', en: '2 Thessalonians', es: '2 Tesalonicenses', fr: '2 Thessaloniciens'},
  { slug: '1+timothy',       caps: 6,  pt: '1 Timóteo',         en: '1 Timothy',       es: '1 Timoteo',        fr: '1 Timothée'       },
  { slug: '2+timothy',       caps: 4,  pt: '2 Timóteo',         en: '2 Timothy',       es: '2 Timoteo',        fr: '2 Timothée'       },
  { slug: 'titus',           caps: 3,  pt: 'Tito',              en: 'Titus',           es: 'Tito',             fr: 'Tite'             },
  { slug: 'philemon',        caps: 1,  pt: 'Filemom',           en: 'Philemon',        es: 'Filemón',          fr: 'Philémon'         },
  { slug: 'hebrews',         caps: 13, pt: 'Hebreus',           en: 'Hebrews',         es: 'Hebreos',          fr: 'Hébreux'          },
  { slug: 'james',           caps: 5,  pt: 'Tiago',             en: 'James',           es: 'Santiago',         fr: 'Jacques'          },
  { slug: '1+peter',         caps: 5,  pt: '1 Pedro',           en: '1 Peter',         es: '1 Pedro',          fr: '1 Pierre'         },
  { slug: '2+peter',         caps: 3,  pt: '2 Pedro',           en: '2 Peter',         es: '2 Pedro',          fr: '2 Pierre'         },
  { slug: '1+john',          caps: 5,  pt: '1 João',            en: '1 John',          es: '1 Juan',           fr: '1 Jean'           },
  { slug: '2+john',          caps: 1,  pt: '2 João',            en: '2 John',          es: '2 Juan',           fr: '2 Jean'           },
  { slug: '3+john',          caps: 1,  pt: '3 João',            en: '3 John',          es: '3 Juan',           fr: '3 Jean'           },
  { slug: 'jude',            caps: 1,  pt: 'Judas',             en: 'Jude',            es: 'Judas',            fr: 'Jude'             },
  { slug: 'revelation',      caps: 22, pt: 'Apocalipse',        en: 'Revelation',      es: 'Apocalipsis',      fr: 'Apocalypse'       },
];

const VERSICULO_DIA = {
  texto: '"Porque eu sei os planos que tenho para vocês, planos de prosperidade e não de calamidade, planos de dar a vocês esperança e um futuro."',
  ref: 'Jeremias 29:11',
};

type Verso = { book_name: string; chapter: number; verse: number; text: string };
type Livro = { slug: string; caps: number; pt: string; en: string; es: string; fr: string };
type LangKey = 'pt' | 'en' | 'es' | 'fr';

function getLangKey(apiId: string): LangKey {
  if (apiId === 'kjv') return 'en';
  if (apiId === 'rv1960') return 'es';
  if (apiId === 'lsg') return 'fr';
  return 'pt';
}
function nomeLivro(livro: Livro, langKey: LangKey): string { return livro[langKey]; }

// ─── Leitor Modal ─────────────────────────────────────────────────────────────
function LeitorModal({ livro, versao, onClose }: {
  livro: Livro | null; versao: typeof versoes[0]; onClose: () => void;
}) {
  const [capitulo, setCapitulo] = useState(1);
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
      const url = `https://bible-api.com/${livro.slug}+${cap}?translation=${versao.apiId}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) { setError('Capítulo não encontrado nesta versão.'); }
      else { setVersos(data.verses ?? []); }
    } catch {
      setError('Sem conexão. Verifique sua internet.');
    }
    setLoading(false);
  };

  // Carrega ao abrir e ao trocar capítulo
  const [loaded, setLoaded] = useState(false);
  if (livro && !loaded) { setLoaded(true); buscarCapitulo(1); }

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
            <Text style={lr.headerSub}>Chapter {capitulo} · {versao.sigla}</Text>
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
              <Text style={lr.loadingText}>Carregando...</Text>
            </View>
          )}
          {!!error && (
            <View style={lr.errorWrap}>
              <Ionicons name="alert-circle-outline" size={32} color="rgba(255,255,255,0.4)" />
              <Text style={lr.errorText}>{error}</Text>
              <TouchableOpacity style={lr.retryBtn} onPress={() => buscarCapitulo(capitulo)}>
                <Text style={lr.retryBtnText}>Tentar novamente</Text>
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
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<'AT' | 'NT'>('AT');
  const [versaoSelecionada, setVersaoSelecionada] = useState(versoes[0]);
  const [modalVersoes, setModalVersoes] = useState(false);
  const [livroAberto, setLivroAberto] = useState<Livro | null>(null);

  const livros = aba === 'AT' ? livrosAT : livrosNT;
  const langKey = getLangKey(versaoSelecionada.apiId);
  const livrosFiltrados = busca
    ? [...livrosAT, ...livrosNT].filter(l => l[langKey].toLowerCase().includes(busca.toLowerCase()))
    : livros;

  const idiomas = [...new Set(versoes.map(v => v.idioma))];

  const partilharVersiculo = async () => {
    await Share.share({
      message: `${VERSICULO_DIA.texto}\n\n— ${VERSICULO_DIA.ref} (${versaoSelecionada.sigla})\n\n📖 Peniel Church App`,
    });
  };

  return (
    <View style={styles.container}>
      {/* Cabeçalho */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerSub}>leitura e estudo</Text>
            <Text style={styles.headerTitulo}>Bíblia</Text>
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
            placeholder="Buscar livro..."
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
              <Text style={styles.modalTitulo}>Escolher versão</Text>
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
          <Text style={styles.versiculoLabel}>Versículo do dia</Text>
          <Text style={styles.versiculoTexto}>{VERSICULO_DIA.texto}</Text>
          <Text style={styles.versiculoRef}>{VERSICULO_DIA.ref} • {versaoSelecionada.sigla}</Text>
          <View style={styles.versiculoBtns}>
            <TouchableOpacity style={styles.versiculoBtn} onPress={partilharVersiculo}>
              <Ionicons name="share-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.versiculoBtnTexto}>Partilhar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.versiculoBtn} onPress={() => Alert.alert('Salvo! 🔖', 'Versículo salvo nos seus favoritos.')}>
              <Ionicons name="bookmark-outline" size={13} color="#F5C842" />
              <Text style={[styles.versiculoBtnTexto, { color: '#F5C842' }]}>Salvar</Text>
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
            {[
              { texto: 'Salmo 23', feito: true,  slug: 'psalms', cap: 23 },
              { texto: 'Salmo 24', feito: true,  slug: 'psalms', cap: 24 },
              { texto: 'Salmo 25 — hoje', feito: false, slug: 'psalms', cap: 25 },
            ].map((leitura, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.leituraItem, idx === 2 && { borderBottomWidth: 0 }]}
                onPress={() => setLivroAberto(livrosAT.find(l => l.slug === 'psalms') ?? null)}
              >
                <View style={[styles.check, leitura.feito && styles.checkFeito]}>
                  {leitura.feito
                    ? <Ionicons name="checkmark" size={12} color="#fff" />
                    : <Ionicons name="ellipse-outline" size={12} color="#534AB7" />}
                </View>
                <Text style={[styles.leituraTexto, !leitura.feito && { color: '#534AB7', fontWeight: '500' }]}>
                  {leitura.texto}
                </Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Abas AT / NT */}
        <View style={styles.abasContainer}>
          {!busca && (
            <View style={styles.abas}>
              <TouchableOpacity style={[styles.aba, aba === 'AT' && styles.abaAtiva]} onPress={() => setAba('AT')}>
                <Text style={[styles.abaTexto, aba === 'AT' && styles.abaTextoAtivo]}>
                  Antigo Testamento ({livrosAT.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.aba, aba === 'NT' && styles.abaAtiva]} onPress={() => setAba('NT')}>
                <Text style={[styles.abaTexto, aba === 'NT' && styles.abaTextoAtivo]}>
                  Novo Testamento ({livrosNT.length})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {busca && (
            <Text style={styles.buscaResultado}>
              {livrosFiltrados.length} resultado{livrosFiltrados.length !== 1 ? 's' : ''} para "{busca}"
            </Text>
          )}

          <View style={styles.livrosGrid}>
            {livrosFiltrados.map((livro, index) => (
              <TouchableOpacity
                key={index}
                style={styles.livroBtn}
                onPress={() => setLivroAberto(livro)}
                activeOpacity={0.7}
              >
                <Text style={styles.livroNome}>{nomeLivro(livro, langKey)}</Text>
                <Text style={styles.livroCaps}>{livro.caps} cap.</Text>
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
        onClose={() => setLivroAberto(null)}
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
  versiculoRef: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 6 },
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
