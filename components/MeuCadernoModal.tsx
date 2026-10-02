import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

// Meu caderno — o caderno PESSOAL de cada participante, um por grupo (02 Out 2026).
//
// Só a própria pessoa lê: nem o líder nem o Admin (RLS de
// `grupo_caderno_pessoal`, sem is_admin()). Junta, em ordem de data, duas
// coisas que a pessoa escreveu:
//   • anotações livres (`grupo_caderno_pessoal`);
//   • as anotações que ela fez dentro de cada aula (`grupo_encontro_notas`).
// As duas podem ser editadas e apagadas daqui.
//
// Diferente do caderno do líder (só português), este é de todo participante,
// então segue o idioma do app.

type Item = {
  tipo: 'livre' | 'aula';
  id: string;          // id da anotação livre, ou evento_id da aula
  data: string;        // AAAA-MM-DD
  titulo: string;
  texto: string;
};

function paleta(isDark: boolean) {
  return isDark ? {
    bg: '#1C1940', text: '#F1EFFA', textMuted: '#A69FD6', border: '#332D5C',
    inputBg: '#241F4D', placeholder: '#726A99', cardBg: '#241F4D',
  } : {
    bg: '#FFFFFF', text: '#1A1A2E', textMuted: '#6B7280', border: '#E5E0D8',
    inputBg: '#F7F4EE', placeholder: '#9CA3AF', cardBg: '#FAF8F4',
  };
}
type Paleta = ReturnType<typeof paleta>;

export default function MeuCadernoModal({
  visible, grupo, grupoNome, cor, userId, onClose, onChanged,
}: {
  visible: boolean;
  grupo: string;
  grupoNome: string;
  cor: string;
  userId: string;
  onClose: () => void;
  /** Para a aba do grupo atualizar o contador. */
  onChanged?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [escrevendo, setEscrevendo] = useState(false);
  const [editando, setEditando] = useState<Item | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const listaRef = useRef<ScrollView>(null);

  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const dataLegivel = useCallback((iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    const txt = d.toLocaleDateString(i18n.language || 'pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }, [i18n.language]);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: livres }, { data: daAula }] = await Promise.all([
      supabase.from('grupo_caderno_pessoal')
        .select('id, data, titulo, texto')
        .eq('grupo', grupo)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300),
      // O filtro por profile_id é redundante com a RLS ("só quem escreveu"),
      // mas deixa a intenção explícita. O !inner amarra a anotação ao grupo.
      supabase.from('grupo_encontro_notas')
        .select('evento_id, texto, grupo_eventos!inner(grupo, data, titulo)')
        .eq('profile_id', userId)
        .eq('grupo_eventos.grupo', grupo)
        .neq('texto', ''),
    ]);
    const lista: Item[] = [
      ...(livres ?? []).map((l: any) => ({ tipo: 'livre' as const, id: l.id, data: l.data, titulo: l.titulo ?? '', texto: l.texto })),
      ...(daAula ?? []).filter((n: any) => (n.texto ?? '').trim()).map((n: any) => ({
        tipo: 'aula' as const, id: n.evento_id, data: n.grupo_eventos?.data, titulo: n.grupo_eventos?.titulo ?? '', texto: n.texto,
      })),
    ];
    lista.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
    setItens(lista);
    setLoading(false);
  }, [grupo, userId]);

  useEffect(() => {
    if (!visible) {
      setEscrevendo(false); setEditando(null); setAberta(null); setTitulo(''); setTexto('');
      return;
    }
    carregar();
  }, [visible, carregar]);

  const limpar = () => { setEscrevendo(false); setEditando(null); setTitulo(''); setTexto(''); };

  const editar = (item: Item) => {
    setEditando(item); setEscrevendo(true);
    setTitulo(item.tipo === 'livre' ? item.titulo : '');
    setTexto(item.texto);
    listaRef.current?.scrollTo({ y: 0, animated: true });
  };

  const salvar = async () => {
    if (!texto.trim()) { Alert.alert(t('common.erro'), t('grupos.meuCaderno.textoObrigatorio')); return; }
    setSaving(true);
    let error: any = null;
    if (editando?.tipo === 'aula') {
      ({ error } = await supabase.from('grupo_encontro_notas')
        .update({ texto: texto.trim(), updated_at: new Date().toISOString() })
        .eq('evento_id', editando.id).eq('profile_id', userId));
    } else if (editando) {
      ({ error } = await supabase.from('grupo_caderno_pessoal')
        .update({ titulo: titulo.trim(), texto: texto.trim() }).eq('id', editando.id));
    } else {
      // profile_id e data vêm do banco (gatilho e default).
      ({ error } = await supabase.from('grupo_caderno_pessoal')
        .insert({ grupo, titulo: titulo.trim(), texto: texto.trim() }));
    }
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    limpar();
    await carregar();
    onChanged?.();
  };

  const apagar = (item: Item) => {
    Alert.alert(t('grupos.meuCaderno.apagarTitulo'), t('grupos.meuCaderno.apagarMsg'), [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('common.remover'), style: 'destructive',
        onPress: async () => {
          const { error } = item.tipo === 'aula'
            ? await supabase.from('grupo_encontro_notas').delete().eq('evento_id', item.id).eq('profile_id', userId)
            : await supabase.from('grupo_caderno_pessoal').delete().eq('id', item.id);
          if (error) { Alert.alert(t('common.erro'), error.message); return; }
          await carregar(); onChanged?.();
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
                <Text style={s.title}>{t('grupos.meuCaderno.abrir')}</Text>
                <View style={s.privadoLinha}>
                  <Ionicons name="lock-closed" size={11} color={C.textMuted} />
                  <Text style={s.subtitle}>{grupoNome} · {t('grupos.meuCaderno.privado')}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {!escrevendo && (
              <TouchableOpacity style={[s.novaBtn, { backgroundColor: cor }]} onPress={() => setEscrevendo(true)}>
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={s.novaBtnTexto}>{t('grupos.meuCaderno.nova')}</Text>
              </TouchableOpacity>
            )}

            <ScrollView ref={listaRef} style={{ marginTop: 12, flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {escrevendo && (
                <View style={[s.formulario, { borderLeftColor: cor }]}>
                  <Text style={s.formularioTitulo}>
                    {editando?.tipo === 'aula'
                      ? `${t('grupos.meuCaderno.daAula')} · ${editando.titulo}`
                      : editando ? t('grupos.meuCaderno.editando') : t('grupos.meuCaderno.nova')}
                  </Text>

                  {editando?.tipo !== 'aula' && (
                    <>
                      <Text style={s.campoLabel}>{t('grupos.meuCaderno.campoTitulo')}</Text>
                      <TextInput
                        style={s.campo} value={titulo} onChangeText={setTitulo}
                        placeholder={t('grupos.meuCaderno.placeholderTitulo')}
                        placeholderTextColor={C.placeholder} maxLength={120}
                      />
                    </>
                  )}

                  <Text style={s.campoLabel}>{t('grupos.meuCaderno.campoTexto')}</Text>
                  <TextInput
                    style={[s.campo, s.campoTexto]} value={texto} onChangeText={setTexto}
                    placeholder={t('grupos.meuCaderno.placeholderTexto')}
                    placeholderTextColor={C.placeholder}
                    multiline maxLength={10000}
                  />

                  <View style={s.formularioAcoes}>
                    <TouchableOpacity style={s.cancelarBtn} onPress={limpar}>
                      <Text style={s.cancelarTexto}>{t('common.cancelar')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.salvarBtn, { backgroundColor: cor }, saving && { opacity: 0.7 }]}
                      onPress={salvar} disabled={saving}
                    >
                      {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                        <Text style={s.salvarTexto}>{t('common.salvar')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {loading ? (
                <ActivityIndicator color={cor} style={{ marginVertical: 40 }} />
              ) : itens.length === 0 ? (
                <View style={s.vazio}>
                  <Ionicons name="journal-outline" size={28} color={C.textMuted} />
                  <Text style={s.vazioTexto}>{t('grupos.meuCaderno.vazioLongo')}</Text>
                </View>
              ) : itens.map(item => {
                const chave = `${item.tipo}-${item.id}`;
                const expandida = aberta === chave;
                return (
                  <TouchableOpacity key={chave} style={s.card} activeOpacity={0.85} onPress={() => setAberta(expandida ? null : chave)}>
                    <View style={s.cardTop}>
                      <View style={s.badges}>
                        <View style={[s.badge, { backgroundColor: cor + '18' }]}>
                          <Text style={[s.badgeTexto, { color: cor }]}>{dataLegivel(item.data)}</Text>
                        </View>
                        {item.tipo === 'aula' && (
                          <View style={[s.badge, { backgroundColor: C.inputBg }]}>
                            <Text style={[s.badgeTexto, { color: C.textMuted }]}>{t('grupos.meuCaderno.daAula')}</Text>
                          </View>
                        )}
                      </View>
                      <View style={s.cardAcoes}>
                        <TouchableOpacity onPress={() => editar(item)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                          <Ionicons name="create-outline" size={16} color={C.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => apagar(item)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                          <Ionicons name="trash-outline" size={16} color={C.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {!!item.titulo && <Text style={s.cardTitulo}>{item.titulo}</Text>}
                    <Text style={s.cardTexto} numberOfLines={expandida ? undefined : 3}>{item.texto}</Text>
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

function buildStyles(C: Paleta) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { flexShrink: 1, backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: C.text },
  privadoLinha: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  subtitle: { fontSize: 11, color: C.textMuted },
  novaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13 },
  novaBtnTexto: { fontSize: 15, fontWeight: '700', color: '#fff' },
  formulario: { backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderRadius: 12, padding: 12, marginBottom: 14 },
  formularioTitulo: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 10 },
  campoLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
  campo: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: C.text, backgroundColor: C.inputBg, marginBottom: 10 },
  campoTexto: { minHeight: 140, textAlignVertical: 'top', paddingTop: 10 },
  formularioAcoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 2 },
  cancelarBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  cancelarTexto: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  salvarBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, minWidth: 92, alignItems: 'center' },
  salvarTexto: { fontSize: 13, fontWeight: '700', color: '#fff' },
  card: { backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  badge: { borderRadius: 14, paddingHorizontal: 9, paddingVertical: 3 },
  badgeTexto: { fontSize: 10.5, fontWeight: '800' },
  cardAcoes: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitulo: { fontSize: 14.5, fontWeight: '700', color: C.text, marginBottom: 3 },
  cardTexto: { fontSize: 13, color: C.textMuted, lineHeight: 19 },
  vazio: { alignItems: 'center', gap: 10, paddingVertical: 34, paddingHorizontal: 20 },
  vazioTexto: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
}); }
