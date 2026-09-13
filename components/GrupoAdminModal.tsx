import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import type { TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

type Secao = 'aviso' | 'encontro' | 'devocional' | 'short' | 'material';

function paletaGrupoAdmin(isDark: boolean) {
  return isDark ? {
    bg: '#1C1940',
    text: '#F1EFFA',
    textMuted: '#A69FD6',
    border: '#332D5C',
    inputBg: '#241F4D',
    placeholder: '#726A99',
  } : {
    bg: '#FFFFFF',
    text: '#1A1A2E',
    textMuted: '#6B7280',
    border: '#E5E0D8',
    inputBg: '#F7F4EE',
    placeholder: '#9CA3AF',
  };
}
type PaletaGrupoAdmin = ReturnType<typeof paletaGrupoAdmin>;

// DD/MM/AAAA → AAAA-MM-DD, devolvendo '' quando não é data de verdade.
// Valida o calendário (31/02 não passa) remontando a data e conferindo se o
// Date concorda — sem isso o Postgres é quem recusaria, com uma mensagem que
// a pessoa não entende.
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

// AAAA-MM-DD → DD/MM/AAAA, para recarregar a data no formulário de edição.
function isoParaDataBR(iso: string): string {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Painel de admin de um grupo específico — só pro líder daquele grupo (ou
// admin geral). Publica direto em `avisos` / `devocionais` / `shorts_videos`
// com `grupo` preenchido, então a RLS já garante que só quem foi adicionado
// ao grupo enxerga o que for postado aqui (e o push de aviso vai só pra
// eles também — ver supabase/functions/content-notifications).
export type EncontroParaEditar = {
  id: string; titulo: string; descricao: string; dataISO: string;
  horario: string; local: string; tipo: 'presencial' | 'online' | 'casa';
};

export default function GrupoAdminModal({ visible, grupo, grupoNome, cor, onClose, onSaved, encontroParaEditar }: {
  visible: boolean;
  grupo: string;
  grupoNome: string;
  cor: string;
  onClose: () => void;
  onSaved?: () => void;
  // Quando vem preenchido, o modal abre direto na aba Encontro com os campos
  // carregados e o botão vira "Salvar alterações". É o caminho de quem errou
  // a data e precisa consertar — antes só dava para apagar e refazer.
  encontroParaEditar?: EncontroParaEditar | null;
}) {
  const [secao, setSecao] = useState<Secao>('aviso');

  const [avisoTitulo, setAvisoTitulo] = useState('');
  const [avisoTexto, setAvisoTexto] = useState('');
  const [avisoTipo, setAvisoTipo] = useState<'geral' | 'evento' | 'urgente'>('geral');

  const [devTitulo, setDevTitulo] = useState('');
  const [devVersiculo, setDevVersiculo] = useState('');
  const [devReferencia, setDevReferencia] = useState('');
  const [devTexto, setDevTexto] = useState('');

  const [shortTitulo, setShortTitulo] = useState('');
  const [shortUrl, setShortUrl] = useState('');
  const [shortPlataforma, setShortPlataforma] = useState<'youtube' | 'instagram'>('youtube');

  const [materialTitulo, setMaterialTitulo] = useState('');
  const [materialUrl, setMaterialUrl] = useState('');

  const [encTitulo, setEncTitulo] = useState('');
  const [encDescricao, setEncDescricao] = useState('');
  const [encData, setEncData] = useState('');
  const [encHorario, setEncHorario] = useState('');
  const [encLocal, setEncLocal] = useState('');
  const [encTipo, setEncTipo] = useState<'presencial' | 'online' | 'casa'>('presencial');

  const [saving, setSaving] = useState(false);

  const { isDark } = useTheme();
  const C = useMemo(() => paletaGrupoAdmin(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  useEffect(() => {
    if (!visible) {
      setSecao('aviso');
      setAvisoTitulo(''); setAvisoTexto(''); setAvisoTipo('geral');
      setDevTitulo(''); setDevVersiculo(''); setDevReferencia(''); setDevTexto('');
      setShortTitulo(''); setShortUrl(''); setShortPlataforma('youtube');
      setMaterialTitulo(''); setMaterialUrl('');
      setEncTitulo(''); setEncDescricao(''); setEncData(''); setEncHorario(''); setEncLocal(''); setEncTipo('presencial');
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !encontroParaEditar) return;
    const e = encontroParaEditar;
    setSecao('encontro');
    setEncTitulo(e.titulo);
    setEncDescricao(e.descricao ?? '');
    setEncData(isoParaDataBR(e.dataISO));
    setEncHorario(e.horario);
    setEncLocal(e.local);
    setEncTipo(e.tipo);
  }, [visible, encontroParaEditar?.id]);

  const publicarAviso = async () => {
    if (!avisoTitulo.trim() || !avisoTexto.trim()) { Alert.alert('Atenção', 'Preencha o título e o texto do aviso.'); return; }
    setSaving(true);
    const { error } = await supabase.from('avisos').insert({
      titulo: avisoTitulo.trim(), texto: avisoTexto.trim(), tipo: avisoTipo, data: new Date().toISOString(), grupo,
    });
    setSaving(false);
    if (error) { Alert.alert('Erro', error.message); return; }
    Alert.alert('Enviado', `Notificação publicada só pro grupo ${grupoNome}.`);
    setAvisoTitulo(''); setAvisoTexto('');
    onSaved?.();
  };

  const publicarDevocional = async () => {
    if (!devTitulo.trim() || !devVersiculo.trim() || !devReferencia.trim() || !devTexto.trim()) {
      Alert.alert('Atenção', 'Preencha todos os campos do devocional.'); return;
    }
    setSaving(true);
    const { error } = await supabase.from('devocionais').insert({
      titulo: devTitulo.trim(), versiculo: devVersiculo.trim(), referencia: devReferencia.trim(),
      texto: devTexto.trim(), autor: 'Peniel Church', data: new Date().toISOString(), grupo,
    });
    setSaving(false);
    if (error) { Alert.alert('Erro', error.message); return; }
    Alert.alert('Publicado', `Devocional publicado pro grupo ${grupoNome}.`);
    setDevTitulo(''); setDevVersiculo(''); setDevReferencia(''); setDevTexto('');
    onSaved?.();
  };

  const publicarShort = async () => {
    if (!shortTitulo.trim() || !shortUrl.trim()) { Alert.alert('Atenção', 'Preencha o título e o link do vídeo.'); return; }
    setSaving(true);
    const { error } = await supabase.from('shorts_videos').insert({
      titulo: shortTitulo.trim(), url: shortUrl.trim(), plataforma: shortPlataforma, grupo,
    });
    setSaving(false);
    if (error) { Alert.alert('Erro', error.message); return; }
    Alert.alert('Publicado', `Short publicado pro grupo ${grupoNome}.`);
    setShortTitulo(''); setShortUrl('');
    onSaved?.();
  };

  const publicarMaterial = async () => {
    if (!materialTitulo.trim() || !materialUrl.trim()) { Alert.alert('Atenção', 'Preencha o título e o link do material.'); return; }
    setSaving(true);
    const { error } = await supabase.from('grupo_arquivos').insert({
      titulo: materialTitulo.trim(), url: materialUrl.trim(), grupo,
    });
    setSaving(false);
    if (error) { Alert.alert('Erro', error.message); return; }
    Alert.alert('Publicado', `Material publicado pro grupo ${grupoNome}.`);
    setMaterialTitulo(''); setMaterialUrl('');
    onSaved?.();
  };

  // "Próximos Eventos" é a PRIMEIRA seção de toda aba de grupo, e ficava
  // permanentemente vazia: `grupo_eventos` só era lida, não havia insert em
  // tela nenhuma do app. O gatilho `evento_grupo_no_mural` (migração
  // 20260908230000) já existia esperando por este insert — ele espelha o
  // encontro em `avisos` com `grupo` preenchido, e é assim que o push sai
  // para quem é do grupo, e só para quem é do grupo.
  const publicarEncontro = async () => {
    if (!encTitulo.trim() || !encData.trim() || !encHorario.trim() || !encLocal.trim()) {
      Alert.alert('Atenção', 'Preencha título, data, horário e local do encontro.'); return;
    }
    const iso = dataBRparaISO(encData);
    if (!iso) { Alert.alert('Atenção', 'A data precisa estar no formato DD/MM/AAAA.'); return; }

    const campos = {
      titulo: encTitulo.trim(),
      descricao: encDescricao.trim() || null,
      data: iso,
      horario: encHorario.trim(),
      local: encLocal.trim(),
      tipo: encTipo,
      grupo,
    };

    setSaving(true);
    // Editando: `update`, e NÃO um insert seguido de delete. O gatilho
    // `evento_grupo_no_mural` dispara no insert — refazer a linha mandaria um
    // push novo a cada correção de horário, e o grupo receberia "Novo
    // encontro" três vezes pelo mesmo encontro.
    const { error } = encontroParaEditar
      ? await supabase.from('grupo_eventos').update(campos).eq('id', encontroParaEditar.id)
      : await supabase.from('grupo_eventos').insert(campos);
    setSaving(false);
    if (error) { Alert.alert('Erro', error.message); return; }
    Alert.alert(
      encontroParaEditar ? 'Salvo' : 'Publicado',
      encontroParaEditar
        ? 'Encontro atualizado. O grupo não recebe notificação nova por uma correção.'
        : `Encontro publicado pro grupo ${grupoNome}.`,
    );
    setEncTitulo(''); setEncDescricao(''); setEncData(''); setEncHorario(''); setEncLocal('');
    onSaved?.();
    if (encontroParaEditar) onClose();
  };

  const SECOES: { id: Secao; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'aviso', label: 'Aviso', icon: 'megaphone-outline' },
    { id: 'encontro', label: 'Encontro', icon: 'calendar-outline' },
    { id: 'devocional', label: 'Devocional', icon: 'book-outline' },
    { id: 'short', label: 'Short', icon: 'film-outline' },
    { id: 'material', label: 'Material', icon: 'document-text-outline' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '90%' }}>
          <View style={s.sheet}>
            <View style={s.header}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={s.title}>Admin do Grupo</Text>
                <Text style={s.subtitle}>{grupoNome} · só quem está no grupo vê o que você postar aqui</Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={s.tabBar}>
              {SECOES.map(sec => (
                <TouchableOpacity
                  key={sec.id}
                  style={[s.tabItem, secao === sec.id && { borderBottomWidth: 2, borderBottomColor: cor }]}
                  onPress={() => setSecao(sec.id)}
                >
                  <Ionicons name={sec.icon} size={16} color={secao === sec.id ? cor : C.textMuted} />
                  <Text style={[s.tabLabel, secao === sec.id && { color: cor, fontWeight: '700' }]}>{sec.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 14 }}>
              {secao === 'aviso' && (
                <>
                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>Tipo</Text>
                    <View style={s.pillsRow}>
                      {(['geral', 'evento', 'urgente'] as const).map(tp => (
                        <TouchableOpacity key={tp} style={[s.pill, avisoTipo === tp && { backgroundColor: cor + '22', borderColor: cor }]} onPress={() => setAvisoTipo(tp)}>
                          <Text style={[s.pillText, avisoTipo === tp && { color: cor, fontWeight: '700' }]}>
                            {tp === 'geral' ? '📢 Geral' : tp === 'evento' ? '📅 Evento' : '🚨 Urgente'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <Field s={s} C={C} label="Título" value={avisoTitulo} onChangeText={setAvisoTitulo} placeholder="Ex: Encontro de sábado adiado" />
                  <Field s={s} C={C} label="Texto" value={avisoTexto} onChangeText={setAvisoTexto} placeholder="Detalhes do aviso..." multiline height={100} />
                  <Text style={s.hint}>Quem está no grupo {grupoNome} recebe push na hora. Mais ninguém vê esse aviso.</Text>
                  <SaveBtn s={s} cor={cor} saving={saving} onPress={publicarAviso} label="Enviar aviso ao grupo" icon="megaphone-outline" />
                </>
              )}

              {secao === 'encontro' && (
                <>
                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>Tipo</Text>
                    <View style={s.pillsRow}>
                      {(['presencial', 'online', 'casa'] as const).map(tp => (
                        <TouchableOpacity key={tp} style={[s.pill, encTipo === tp && { backgroundColor: cor + '22', borderColor: cor }]} onPress={() => setEncTipo(tp)}>
                          <Text style={[s.pillText, encTipo === tp && { color: cor, fontWeight: '700' }]}>
                            {tp === 'presencial' ? '⛪ Na igreja' : tp === 'online' ? '💻 Online' : '🏠 Em casa'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <Field s={s} C={C} label="Título" value={encTitulo} onChangeText={setEncTitulo} placeholder="Ex: Café da manhã das mulheres" />
                  <Field s={s} C={C} label="Data" value={encData} onChangeText={setEncData} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" />
                  <Field s={s} C={C} label="Horário" value={encHorario} onChangeText={setEncHorario} placeholder="Ex: 10h às 12h" />
                  <Field
                    s={s} C={C} label="Local" value={encLocal} onChangeText={setEncLocal}
                    placeholder={encTipo === 'online' ? 'Ex: link do Zoom' : encTipo === 'casa' ? 'Ex: casa da Ana — Reading' : 'Ex: Salão da igreja'}
                  />
                  <Field s={s} C={C} label="Descrição (opcional)" value={encDescricao} onChangeText={setEncDescricao} placeholder="Detalhes, o que levar..." multiline height={90} />
                  <Text style={s.hint}>
                    {encontroParaEditar
                      ? 'Correção de encontro já publicado: o grupo não recebe notificação de novo.'
                      : `Aparece em "Próximos Eventos" da aba ${grupoNome} e some sozinho depois que a data passa. Quem está no grupo recebe push.`}
                  </Text>
                  <SaveBtn s={s} cor={cor} saving={saving} onPress={publicarEncontro} label={encontroParaEditar ? 'Salvar alterações' : 'Publicar encontro'} icon="calendar-outline" />
                </>
              )}

              {secao === 'devocional' && (
                <>
                  <Field s={s} C={C} label="Título" value={devTitulo} onChangeText={setDevTitulo} placeholder="Ex: Confiando no tempo de Deus" />
                  <Field s={s} C={C} label="Versículo" value={devVersiculo} onChangeText={setDevVersiculo} placeholder='Ex: "Tudo posso naquele que me fortalece."' multiline height={70} />
                  <Field s={s} C={C} label="Referência" value={devReferencia} onChangeText={setDevReferencia} placeholder="Ex: Filipenses 4:13" />
                  <Field s={s} C={C} label="Reflexão" value={devTexto} onChangeText={setDevTexto} placeholder="Escreva a reflexão do devocional..." multiline height={110} />
                  <SaveBtn s={s} cor={cor} saving={saving} onPress={publicarDevocional} label="Publicar devocional" icon="book-outline" />
                </>
              )}

              {secao === 'short' && (
                <>
                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>Plataforma</Text>
                    <View style={s.pillsRow}>
                      {(['youtube', 'instagram'] as const).map(p => (
                        <TouchableOpacity key={p} style={[s.pill, shortPlataforma === p && { backgroundColor: cor + '22', borderColor: cor }]} onPress={() => setShortPlataforma(p)}>
                          <Text style={[s.pillText, shortPlataforma === p && { color: cor, fontWeight: '700' }]}>
                            {p === 'youtube' ? '▶️ YouTube Shorts' : '📸 Instagram Reels'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <Field s={s} C={C} label="Título" value={shortTitulo} onChangeText={setShortTitulo} placeholder="Ex: 1 minuto de fé" />
                  <Field
                    s={s} C={C}
                    label="Link do vídeo" value={shortUrl} onChangeText={setShortUrl}
                    placeholder={shortPlataforma === 'youtube' ? 'https://youtube.com/shorts/...' : 'https://instagram.com/reel/...'}
                    autoCapitalize="none"
                  />
                  <SaveBtn s={s} cor={cor} saving={saving} onPress={publicarShort} label="Publicar short" icon="film-outline" />
                </>
              )}

              {secao === 'material' && (
                <>
                  <Field s={s} C={C} label="Título" value={materialTitulo} onChangeText={setMaterialTitulo} placeholder="Ex: Apostila da aula 3 (PDF)" />
                  <Field
                    s={s} C={C}
                    label="Link" value={materialUrl} onChangeText={setMaterialUrl}
                    placeholder="Cole aqui o link do PDF (Google Drive, WeTransfer...)"
                    autoCapitalize="none"
                  />
                  <Text style={s.hint}>Sobe o arquivo em qualquer lugar (Drive, WeTransfer etc.) e cola o link de acesso aqui. Só quem está no grupo {grupoNome} consegue ver.</Text>
                  <SaveBtn s={s} cor={cor} saving={saving} onPress={publicarMaterial} label="Publicar material" icon="document-text-outline" />
                </>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Field({ s, C, label, value, onChangeText, placeholder, multiline, height, autoCapitalize, keyboardType }: {
  s: ReturnType<typeof buildStyles>; C: PaletaGrupoAdmin;
  label: string; value: string; onChangeText: (t: string) => void; placeholder: string;
  multiline?: boolean; height?: number; autoCapitalize?: 'none' | 'sentences';
  keyboardType?: TextInputProps['keyboardType'];
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.fieldInput, multiline ? { height, textAlignVertical: 'top', paddingTop: 10 } : null]}
        placeholder={placeholder} placeholderTextColor={C.placeholder}
        value={value} onChangeText={onChangeText} multiline={multiline} autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function SaveBtn({ s, cor, saving, onPress, label, icon }: {
  s: ReturnType<typeof buildStyles>; cor: string; saving: boolean; onPress: () => void; label: string; icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <TouchableOpacity style={[s.saveBtn, { backgroundColor: cor }, saving && { opacity: 0.7 }]} onPress={onPress} disabled={saving}>
      {saving ? <ActivityIndicator color="#fff" /> : (
        <><Ionicons name={icon} size={18} color="#fff" /><Text style={s.saveBtnText}>{label}</Text></>
      )}
    </TouchableOpacity>
  );
}

function buildStyles(C: PaletaGrupoAdmin) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 11, color: C.textMuted, marginTop: 3 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  // Empilhado (ícone em cima) porque com cinco abas o rótulo ao lado do
  // ícone não cabe num celular estreito e quebra a linha.
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8 },
  tabLabel: { fontSize: 11, color: C.textMuted, fontWeight: '500' },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: C.text, backgroundColor: C.inputBg },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.inputBg },
  pillText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  hint: { fontSize: 11, color: C.textMuted, marginBottom: 10, marginTop: -6, lineHeight: 16 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 4 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
}); }
