import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { apagarLinha } from '../lib/db';
import { useTheme } from '../lib/theme';

// A aula em si — o que a TURMA usa enquanto o Zoom está aberto. Por isso,
// diferente do ChamadaModal e do FrequenciaModal (painéis de líder, em
// português como o GrupoAdminModal), tudo aqui passa por t() nos 4 idiomas.

export type EncontroAula = {
  id: string;
  titulo: string;
  descricao: string;
  dataISO: string;
  horario: string;
  local: string;
  tipo: string;
  linkOnline: string | null;
  roteiro: string | null;
};

type Pergunta = {
  id: string; autor_id: string; autor_nome: string; texto: string;
  resposta: string | null; respondida: boolean; created_at: string;
};
type Material = { id: string; titulo: string; url: string };

function paletaAula(isDark: boolean) {
  return isDark ? {
    bg: '#1C1940', text: '#F1EFFA', textMuted: '#A69FD6', border: '#332D5C',
    inputBg: '#241F4D', placeholder: '#726A99', cardBg: '#241F4D',
  } : {
    bg: '#FFFFFF', text: '#1A1A2E', textMuted: '#6B7280', border: '#E5E0D8',
    inputBg: '#F7F4EE', placeholder: '#9CA3AF', cardBg: '#FAF8F4',
  };
}
type PaletaAula = ReturnType<typeof paletaAula>;

type Aba = 'aula' | 'perguntas' | 'notas';

export default function EncontroAulaModal({
  visible, encontro, cor, userId, userNome, podeModerar, mostrarPerguntas, onClose,
}: {
  visible: boolean;
  encontro: EncontroAula | null;
  cor: string;
  userId: string;
  userNome: string;
  podeModerar: boolean;
  // A fila de perguntas é ligada por grupo em `grupo_config`. Sem ela, o
  // modal continua valendo pelo roteiro, pelo material e pelas anotações.
  mostrarPerguntas: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [aba, setAba] = useState<Aba>('aula');

  const [materiais, setMateriais] = useState<Material[]>([]);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [curtidas, setCurtidas] = useState<Record<string, number>>({});
  const [minhasCurtidas, setMinhasCurtidas] = useState<Set<string>>(new Set());
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const [respostaTexto, setRespostaTexto] = useState('');
  const [nota, setNota] = useState('');
  const [notaSalva, setNotaSalva] = useState(true);
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [loading, setLoading] = useState(true);

  const { isDark } = useTheme();
  const C = useMemo(() => paletaAula(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const carregarPerguntas = useCallback(async (eventoId: string) => {
    const { data } = await supabase
      .from('grupo_encontro_perguntas')
      .select('*')
      .eq('evento_id', eventoId)
      .order('created_at', { ascending: true });
    const lista = (data ?? []) as Pergunta[];
    setPerguntas(lista);

    if (lista.length === 0) { setCurtidas({}); setMinhasCurtidas(new Set()); return; }
    const { data: curtidasData } = await supabase
      .from('grupo_pergunta_curtidas')
      .select('pergunta_id, profile_id')
      .in('pergunta_id', lista.map(p => p.id));
    const contagem: Record<string, number> = {};
    const minhas = new Set<string>();
    (curtidasData ?? []).forEach((c: any) => {
      contagem[c.pergunta_id] = (contagem[c.pergunta_id] ?? 0) + 1;
      if (c.profile_id === userId) minhas.add(c.pergunta_id);
    });
    setCurtidas(contagem);
    setMinhasCurtidas(minhas);
  }, [userId]);

  useEffect(() => {
    if (!visible || !encontro) {
      setAba('aula'); setTexto(''); setRespondendo(null); setRespostaTexto('');
      return;
    }
    let vivo = true;
    (async () => {
      setLoading(true);
      const [{ data: materiaisData }, { data: notaData }] = await Promise.all([
        supabase.from('grupo_arquivos').select('id, titulo, url').eq('evento_id', encontro.id).order('created_at'),
        supabase.from('grupo_encontro_notas').select('texto').eq('evento_id', encontro.id).eq('profile_id', userId).maybeSingle(),
      ]);
      if (!vivo) return;
      setMateriais((materiaisData ?? []) as Material[]);
      setNota(notaData?.texto ?? '');
      setNotaSalva(true);
      await carregarPerguntas(encontro.id);
      if (vivo) setLoading(false);
    })();

    // A pergunta tem que chegar na tela do líder enquanto ele está falando.
    const canal = supabase
      .channel(`encontro_perguntas_${encontro.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'grupo_encontro_perguntas', filter: `evento_id=eq.${encontro.id}` },
        () => { carregarPerguntas(encontro.id); })
      .subscribe();

    return () => { vivo = false; supabase.removeChannel(canal); };
  }, [visible, encontro?.id, userId, carregarPerguntas]);

  const abrirLink = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert(t('common.erro'), t('grupos.aula.erroAbrirLink')));
  };

  const perguntar = async () => {
    if (!encontro || !texto.trim()) return;
    setEnviando(true);
    const { error } = await supabase.from('grupo_encontro_perguntas').insert({
      evento_id: encontro.id,
      autor_id: userId,
      autor_nome: userNome || t('grupos.aula.alguem'),
      texto: texto.trim(),
    });
    setEnviando(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    setTexto('');
    carregarPerguntas(encontro.id);
  };

  const curtir = async (perguntaId: string) => {
    const jaCurti = minhasCurtidas.has(perguntaId);
    // Otimista, com rollback só desta linha se o banco recusar.
    setMinhasCurtidas(atual => {
      const copia = new Set(atual);
      if (jaCurti) copia.delete(perguntaId); else copia.add(perguntaId);
      return copia;
    });
    setCurtidas(atual => ({ ...atual, [perguntaId]: (atual[perguntaId] ?? 0) + (jaCurti ? -1 : 1) }));

    const { error } = jaCurti
      ? await supabase.from('grupo_pergunta_curtidas').delete().eq('pergunta_id', perguntaId).eq('profile_id', userId)
      : await supabase.from('grupo_pergunta_curtidas').insert({ pergunta_id: perguntaId, profile_id: userId });

    if (error && encontro) carregarPerguntas(encontro.id);
  };

  const salvarResposta = async (perguntaId: string) => {
    if (!respostaTexto.trim()) return;
    const { error } = await supabase
      .from('grupo_encontro_perguntas')
      .update({ resposta: respostaTexto.trim(), respondida: true })
      .eq('id', perguntaId);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    setRespondendo(null); setRespostaTexto('');
    if (encontro) carregarPerguntas(encontro.id);
  };

  const apagarPergunta = (p: Pergunta) => {
    Alert.alert(t('grupos.aula.apagarPerguntaTitulo'), t('grupos.aula.apagarPerguntaMsg'), [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('common.remover'), style: 'destructive',
        onPress: async () => {
          const ok = await apagarLinha('grupo_encontro_perguntas', p.id);
          if (ok && encontro) carregarPerguntas(encontro.id);
        },
      },
    ]);
  };

  const salvarNota = async () => {
    if (!encontro) return;
    setSalvandoNota(true);
    const { error } = await supabase
      .from('grupo_encontro_notas')
      .upsert({ evento_id: encontro.id, profile_id: userId, texto: nota, updated_at: new Date().toISOString() },
        { onConflict: 'evento_id,profile_id' });
    setSalvandoNota(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    setNotaSalva(true);
  };

  if (!encontro) return null;

  const ABAS: { id: Aba; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'aula', label: t('grupos.aula.abaAula'), icon: 'book-outline' },
    ...(mostrarPerguntas
      ? [{ id: 'perguntas' as Aba, label: t('grupos.aula.abaPerguntas'), icon: 'help-circle-outline' as const }]
      : []),
    { id: 'notas', label: t('grupos.aula.abaNotas'), icon: 'create-outline' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '92%' }}>
          <View style={s.sheet}>
            <View style={s.header}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={s.title} numberOfLines={2}>{encontro.titulo}</Text>
                <Text style={s.subtitle}>{encontro.horario} · {encontro.local}</Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {encontro.linkOnline ? (
              <TouchableOpacity style={[s.zoomBtn, { backgroundColor: cor }]} onPress={() => abrirLink(encontro.linkOnline!)}>
                <Ionicons name="videocam" size={18} color="#fff" />
                <Text style={s.zoomBtnTexto}>{t('grupos.aula.entrar')}</Text>
              </TouchableOpacity>
            ) : null}

            <View style={s.tabBar}>
              {ABAS.map(a => (
                <TouchableOpacity
                  key={a.id}
                  style={[s.tabItem, aba === a.id && { borderBottomWidth: 2, borderBottomColor: cor }]}
                  onPress={() => setAba(a.id)}
                >
                  <Ionicons name={a.icon} size={16} color={aba === a.id ? cor : C.textMuted} />
                  <Text style={[s.tabLabel, aba === a.id && { color: cor, fontWeight: '700' }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading ? (
              <ActivityIndicator color={cor} style={{ marginVertical: 40 }} />
            ) : (
              <ScrollView style={{ marginTop: 14 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {aba === 'aula' && (
                  <>
                    {encontro.descricao ? <Text style={s.corpo}>{encontro.descricao}</Text> : null}

                    <Text style={s.secaoLabel}>{t('grupos.aula.roteiro')}</Text>
                    {encontro.roteiro ? (
                      <View style={[s.card, { borderLeftColor: cor, borderLeftWidth: 3 }]}>
                        <Text style={s.corpo}>{encontro.roteiro}</Text>
                      </View>
                    ) : (
                      <Text style={s.vazio}>{t('grupos.aula.semRoteiro')}</Text>
                    )}

                    <Text style={s.secaoLabel}>{t('grupos.aula.material')}</Text>
                    {materiais.length === 0 ? (
                      <Text style={s.vazio}>{t('grupos.aula.semMaterial')}</Text>
                    ) : materiais.map(m => (
                      <TouchableOpacity key={m.id} style={s.material} activeOpacity={0.8} onPress={() => abrirLink(m.url)}>
                        <View style={[s.materialIcon, { backgroundColor: cor + '18' }]}>
                          <Ionicons name="document-text-outline" size={17} color={cor} />
                        </View>
                        <Text style={s.materialTitulo} numberOfLines={1}>{m.titulo}</Text>
                        <Ionicons name="open-outline" size={16} color={C.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </>
                )}

                {aba === 'perguntas' && mostrarPerguntas && (
                  <>
                    <View style={s.perguntarRow}>
                      <TextInput
                        style={s.perguntarInput}
                        placeholder={t('grupos.aula.perguntaPlaceholder')}
                        placeholderTextColor={C.placeholder}
                        value={texto}
                        onChangeText={setTexto}
                        multiline
                        maxLength={500}
                      />
                      <TouchableOpacity
                        style={[s.perguntarBtn, { backgroundColor: cor }, (!texto.trim() || enviando) && { opacity: 0.5 }]}
                        onPress={perguntar}
                        disabled={!texto.trim() || enviando}
                      >
                        {enviando ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={16} color="#fff" />}
                      </TouchableOpacity>
                    </View>

                    {perguntas.length === 0 ? (
                      <Text style={s.vazio}>{t('grupos.aula.semPerguntas')}</Text>
                    ) : perguntas.map(p => {
                      const curti = minhasCurtidas.has(p.id);
                      return (
                        <View key={p.id} style={[s.card, p.respondida && { borderColor: cor + '55' }]}>
                          <View style={s.perguntaTop}>
                            <Text style={s.perguntaAutor}>{p.autor_nome}</Text>
                            {(p.autor_id === userId || podeModerar) && (
                              <TouchableOpacity onPress={() => apagarPergunta(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Ionicons name="trash-outline" size={14} color={C.textMuted} />
                              </TouchableOpacity>
                            )}
                          </View>
                          <Text style={s.corpo}>{p.texto}</Text>

                          {p.resposta ? (
                            <View style={[s.resposta, { borderLeftColor: cor }]}>
                              <Text style={s.respostaLabel}>{t('grupos.aula.resposta')}</Text>
                              <Text style={s.corpo}>{p.resposta}</Text>
                            </View>
                          ) : null}

                          <View style={s.perguntaAcoes}>
                            <TouchableOpacity style={s.curtirBtn} onPress={() => curtir(p.id)}>
                              <Ionicons name={curti ? 'heart' : 'heart-outline'} size={15} color={curti ? cor : C.textMuted} />
                              <Text style={[s.curtirTexto, curti && { color: cor, fontWeight: '700' }]}>
                                {curtidas[p.id] ?? 0}
                              </Text>
                            </TouchableOpacity>
                            {podeModerar && (
                              <TouchableOpacity onPress={() => {
                                setRespondendo(respondendo === p.id ? null : p.id);
                                setRespostaTexto(p.resposta ?? '');
                              }}>
                                <Text style={[s.responderTexto, { color: cor }]}>
                                  {p.resposta ? t('grupos.aula.editarResposta') : t('grupos.aula.responder')}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>

                          {respondendo === p.id && (
                            <View style={{ marginTop: 8 }}>
                              <TextInput
                                style={s.respostaInput}
                                placeholder={t('grupos.aula.respostaPlaceholder')}
                                placeholderTextColor={C.placeholder}
                                value={respostaTexto}
                                onChangeText={setRespostaTexto}
                                multiline
                                maxLength={1000}
                              />
                              <TouchableOpacity
                                style={[s.salvarRespostaBtn, { backgroundColor: cor }]}
                                onPress={() => salvarResposta(p.id)}
                              >
                                <Text style={s.salvarRespostaTexto}>{t('common.salvar')}</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </>
                )}

                {aba === 'notas' && (
                  <>
                    <Text style={s.vazio}>{t('grupos.aula.notasPrivadas')}</Text>
                    <TextInput
                      style={s.notaInput}
                      placeholder={t('grupos.aula.notasPlaceholder')}
                      placeholderTextColor={C.placeholder}
                      value={nota}
                      onChangeText={txt => { setNota(txt); setNotaSalva(false); }}
                      multiline
                      maxLength={10000}
                    />
                    <TouchableOpacity
                      style={[s.salvarNotaBtn, { backgroundColor: cor }, (notaSalva || salvandoNota) && { opacity: 0.5 }]}
                      onPress={salvarNota}
                      disabled={notaSalva || salvandoNota}
                    >
                      {salvandoNota ? <ActivityIndicator color="#fff" size="small" /> : (
                        <>
                          <Ionicons name={notaSalva ? 'checkmark' : 'save-outline'} size={16} color="#fff" />
                          <Text style={s.salvarNotaTexto}>
                            {notaSalva ? t('grupos.aula.notasSalvas') : t('common.salvar')}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                <View style={{ height: 24 }} />
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function buildStyles(C: PaletaAula) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 26 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 11, color: C.textMuted, marginTop: 3 },
  zoomBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13, marginBottom: 12 },
  zoomBtnTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8 },
  tabLabel: { fontSize: 11, color: C.textMuted, fontWeight: '500' },
  secaoLabel: { fontSize: 12, fontWeight: '700', color: C.textMuted, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  corpo: { fontSize: 14, color: C.text, lineHeight: 21 },
  vazio: { fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 6 },
  card: { backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  material: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 10, marginBottom: 8 },
  materialIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  materialTitulo: { flex: 1, fontSize: 13, fontWeight: '600', color: C.text },
  perguntarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  perguntarInput: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, color: C.text, backgroundColor: C.inputBg, maxHeight: 110 },
  perguntarBtn: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  perguntaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  perguntaAutor: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  resposta: { borderLeftWidth: 3, paddingLeft: 10, marginTop: 10 },
  respostaLabel: { fontSize: 10, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  perguntaAcoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  curtirBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  curtirTexto: { fontSize: 12, color: C.textMuted },
  responderTexto: { fontSize: 12, fontWeight: '700' },
  respostaInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: C.text, backgroundColor: C.inputBg, minHeight: 60, textAlignVertical: 'top' },
  salvarRespostaBtn: { alignSelf: 'flex-end', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: 8 },
  salvarRespostaTexto: { fontSize: 12, fontWeight: '700', color: '#fff' },
  notaInput: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: C.text, backgroundColor: C.inputBg, minHeight: 180, textAlignVertical: 'top', marginTop: 6 },
  salvarNotaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13, marginTop: 12 },
  salvarNotaTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
}); }
