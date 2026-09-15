import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { apagarLinha } from '../lib/db';
import { useTheme } from '../lib/theme';

// Caderno do líder — anotações livres do grupo, datadas.
//
// Ferramenta de LÍDER, e por isso em português, igual ao GrupoAdminModal, ao
// ChamadaModal e ao FrequenciaModal. Quem abre isto lidera um grupo da Peniel.
//
// Só quem lidera ESTE grupo lê (a RLS de `grupo_caderno` não tem `is_admin()`,
// e é a única tabela do app assim). Cada um edita e apaga só o que escreveu.

type Anotacao = {
  id: string;
  data: string;
  titulo: string;
  texto: string;
  autor_id: string;
  autor_nome: string;
  updated_at: string;
};

function paletaCaderno(isDark: boolean) {
  return isDark ? {
    bg: '#1C1940', text: '#F1EFFA', textMuted: '#A69FD6', border: '#332D5C',
    inputBg: '#241F4D', placeholder: '#726A99', cardBg: '#241F4D',
  } : {
    bg: '#FFFFFF', text: '#1A1A2E', textMuted: '#6B7280', border: '#E5E0D8',
    inputBg: '#F7F4EE', placeholder: '#9CA3AF', cardBg: '#FAF8F4',
  };
}
type PaletaCaderno = ReturnType<typeof paletaCaderno>;

// As mesmas duas conversões do GrupoAdminModal, e pelo mesmo motivo: o líder
// digita DD/MM/AAAA e o Postgres quer AAAA-MM-DD. 31/02 não passa.
function dataBRparaISO(br: string): string {
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, d, mes, a] = m;
  const iso = `${a}-${mes}-${d}`;
  const teste = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(teste.getTime())) return '';
  if (teste.getUTCDate() !== Number(d) || teste.getUTCMonth() + 1 !== Number(mes)) return '';
  return iso;
}
function isoParaDataBR(iso: string): string {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
function hojeBR(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function dataPorExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const texto = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function CadernoModal({
  visible, grupo, grupoNome, cor, userId, onClose, onChanged,
}: {
  visible: boolean;
  grupo: string;
  grupoNome: string;
  cor: string;
  userId: string;
  onClose: () => void;
  /** Para a aba do grupo atualizar o contador de anotações. */
  onChanged?: () => void;
}) {
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [escrevendo, setEscrevendo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const listaRef = useRef<ScrollView>(null);

  const [data, setData] = useState(hojeBR());
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');

  const { isDark } = useTheme();
  const C = useMemo(() => paletaCaderno(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data: linhas } = await supabase
      .from('grupo_caderno')
      .select('id, data, titulo, texto, autor_id, autor_nome, updated_at')
      .eq('grupo', grupo)
      // Pela data da anotação, não pela de criação: quem anota na quinta o que
      // foi na quarta espera ver a anotação na posição da quarta.
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    setAnotacoes((linhas ?? []) as Anotacao[]);
    setLoading(false);
  }, [grupo]);

  useEffect(() => {
    if (!visible) {
      setEscrevendo(false); setEditando(null); setAberta(null);
      setData(hojeBR()); setTitulo(''); setTexto('');
      return;
    }
    carregar();
  }, [visible, carregar]);

  const limparFormulario = () => {
    setEscrevendo(false); setEditando(null);
    setData(hojeBR()); setTitulo(''); setTexto('');
  };

  const abrirParaEditar = (a: Anotacao) => {
    setEditando(a.id);
    setEscrevendo(true);
    // O formulário abre no TOPO da lista. Sem isto, tocar no lápis de uma
    // anotação de setembro lá embaixo não parecia fazer nada: o campo estava
    // aberto, fora da tela.
    listaRef.current?.scrollTo({ y: 0, animated: true });
    setData(isoParaDataBR(a.data));
    setTitulo(a.titulo);
    setTexto(a.texto);
  };

  const salvar = async () => {
    if (!titulo.trim() || !texto.trim()) {
      Alert.alert('Atenção', 'Preencha o título e o texto da anotação.'); return;
    }
    const iso = dataBRparaISO(data);
    if (!iso) { Alert.alert('Atenção', 'A data precisa estar no formato DD/MM/AAAA.'); return; }

    setSaving(true);
    const campos = { data: iso, titulo: titulo.trim(), texto: texto.trim() };
    // No insert, `autor_id` e `autor_nome` vão junto por clareza, mas quem
    // decide é o gatilho `grupo_caderno_forca_autor` no banco — é ele que
    // impede alguém de assinar uma anotação com o nome de outra pessoa.
    const { error } = editando
      ? await supabase.from('grupo_caderno').update(campos).eq('id', editando)
      : await supabase.from('grupo_caderno').insert({ ...campos, grupo, autor_id: userId, autor_nome: '' });
    setSaving(false);

    if (error) { Alert.alert('Erro', error.message); return; }
    limparFormulario();
    await carregar();
    onChanged?.();
  };

  const apagar = (a: Anotacao) => {
    Alert.alert('Apagar anotação', `Apagar "${a.titulo}"? Não dá para desfazer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar', style: 'destructive',
        onPress: async () => {
          if (await apagarLinha('grupo_caderno', a.id)) { await carregar(); onChanged?.(); }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '92%' }}>
          <View style={s.sheet}>
            <View style={s.header}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={s.title}>Caderno do líder</Text>
                <Text style={s.subtitle}>{grupoNome} · só quem lidera este grupo lê</Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {!escrevendo && (
              <TouchableOpacity style={[s.novaBtn, { backgroundColor: cor }]} onPress={() => setEscrevendo(true)}>
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={s.novaBtnTexto}>Nova anotação</Text>
              </TouchableOpacity>
            )}

            <ScrollView ref={listaRef} style={{ marginTop: 12 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {escrevendo && (
                <View style={[s.formulario, { borderLeftColor: cor }]}>
                  <Text style={s.formularioTitulo}>{editando ? 'Editando anotação' : 'Nova anotação'}</Text>

                  <Text style={s.campoLabel}>Data</Text>
                  <TextInput
                    style={s.campo} value={data} onChangeText={setData}
                    placeholder="DD/MM/AAAA" placeholderTextColor={C.placeholder}
                    keyboardType="numbers-and-punctuation"
                  />

                  <Text style={s.campoLabel}>Título</Text>
                  <TextInput
                    style={s.campo} value={titulo} onChangeText={setTitulo}
                    placeholder="Ex: Onde paramos em Romanos"
                    placeholderTextColor={C.placeholder} maxLength={120}
                  />

                  <Text style={s.campoLabel}>Anotação</Text>
                  <TextInput
                    style={[s.campo, s.campoTexto]} value={texto} onChangeText={setTexto}
                    placeholder="O que rendeu, o que ficou pendente, ideias para a próxima..."
                    placeholderTextColor={C.placeholder}
                    multiline maxLength={5000}
                  />

                  <View style={s.formularioAcoes}>
                    <TouchableOpacity style={s.cancelarBtn} onPress={limparFormulario}>
                      <Text style={s.cancelarTexto}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.salvarBtn, { backgroundColor: cor }, saving && { opacity: 0.7 }]}
                      onPress={salvar}
                      disabled={saving}
                    >
                      {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                        <Text style={s.salvarTexto}>{editando ? 'Salvar alterações' : 'Salvar'}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {loading ? (
                <ActivityIndicator color={cor} style={{ marginVertical: 40 }} />
              ) : anotacoes.length === 0 ? (
                <View style={s.vazio}>
                  <Ionicons name="book-outline" size={28} color={C.textMuted} />
                  <Text style={s.vazioTexto}>
                    Caderno em branco. A primeira anotação costuma ser a mais útil: onde a turma parou.
                  </Text>
                </View>
              ) : anotacoes.map(a => {
                const minha = a.autor_id === userId;
                const expandida = aberta === a.id;
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={s.card}
                    activeOpacity={0.85}
                    onPress={() => setAberta(expandida ? null : a.id)}
                  >
                    <View style={s.cardTop}>
                      <View style={[s.dataBadge, { backgroundColor: cor + '18' }]}>
                        <Text style={[s.dataTexto, { color: cor }]}>{dataPorExtenso(a.data)}</Text>
                      </View>
                      {minha && (
                        <View style={s.cardAcoes}>
                          <TouchableOpacity onPress={() => abrirParaEditar(a)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                            <Ionicons name="create-outline" size={16} color={C.textMuted} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => apagar(a)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                            <Ionicons name="trash-outline" size={16} color={C.textMuted} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    <Text style={s.cardTitulo}>{a.titulo}</Text>
                    <Text style={s.cardTexto} numberOfLines={expandida ? undefined : 2}>{a.texto}</Text>

                    {/* O nome só aparece quando a anotação é de outro líder —
                        no caderno de quem só lidera sozinho, "Marcos Brandão"
                        embaixo de toda anotação é ruído. */}
                    {!minha && <Text style={s.cardAutor}>{a.autor_nome}</Text>}
                  </TouchableOpacity>
                );
              })}

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function buildStyles(C: PaletaCaderno) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 26 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 11, color: C.textMuted, marginTop: 3 },
  novaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13 },
  novaBtnTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
  formulario: { backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderRadius: 12, padding: 12, marginBottom: 14 },
  formularioTitulo: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 10 },
  campoLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
  campo: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: C.text, backgroundColor: C.inputBg, marginBottom: 10 },
  campoTexto: { minHeight: 130, textAlignVertical: 'top', paddingTop: 10 },
  formularioAcoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 2 },
  cancelarBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  cancelarTexto: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  salvarBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, minWidth: 92, alignItems: 'center' },
  salvarTexto: { fontSize: 13, fontWeight: '700', color: '#fff' },
  card: { backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  dataBadge: { borderRadius: 14, paddingHorizontal: 9, paddingVertical: 3 },
  dataTexto: { fontSize: 10.5, fontWeight: '800' },
  cardAcoes: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitulo: { fontSize: 14.5, fontWeight: '700', color: C.text, marginBottom: 3 },
  cardTexto: { fontSize: 13, color: C.textMuted, lineHeight: 19 },
  cardAutor: { fontSize: 11, color: C.textMuted, marginTop: 8, fontStyle: 'italic' },
  vazio: { alignItems: 'center', gap: 10, paddingVertical: 34, paddingHorizontal: 20 },
  vazioTexto: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
}); }
