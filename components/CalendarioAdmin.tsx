// components/CalendarioAdmin.tsx
//
// Painel Admin › Agenda: categorias do calendário anual (11/11/2026).
// O admin muda nome, emoji e cor, esconde uma categoria e escolhe quem mais
// edita cada uma. As categorias Alive, Mulheres e Homens já são editadas
// pelos líderes desses grupos (group_leaders), sem precisar de nada aqui.
// As datas em si se editam na própria Agenda › Calendário.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, TextInput, FlatList, Switch, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { CategoriaCal, PALETA_CAL } from '../lib/calendario';
import { useNomeCategoria } from './CalendarioAnual';

type Editor = { categoria_id: string; profile_id: string; nome: string };
type Membro = { id: string; full_name: string | null };

const NOME_GRUPO: Record<string, string> = { jovens: 'Alive', mulheres: 'Mulheres', homens: 'Homens', estudo_biblico: 'Estudo Bíblico' };

export default function CalendarioAdmin({ C }: {
  C: { text: string; textMuted: string; textDim: string; surface?: string; card?: string; border: string; primary: string; danger: string };
}) {
  const { t } = useTranslation();
  const nomeCat = useNomeCategoria();
  const [cats, setCats] = useState<CategoriaCal[]>([]);
  const [editores, setEditores] = useState<Editor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<CategoriaCal | null>(null);
  const [nome, setNome] = useState('');
  const [emoji, setEmoji] = useState('');
  const [cor, setCor] = useState('');
  const [ativa, setAtiva] = useState(true);
  const [escolherPara, setEscolherPara] = useState<CategoriaCal | null>(null);
  const [busca, setBusca] = useState('');
  const [membros, setMembros] = useState<Membro[]>([]);

  const carregar = useCallback(async () => {
    const [c, e] = await Promise.all([
      supabase.from('calendario_categorias').select('*').order('ordem'),
      supabase.from('calendario_editores').select('categoria_id, profile_id, profiles(full_name)'),
    ]);
    setCats((c.data ?? []) as CategoriaCal[]);
    setEditores(((e.data ?? []) as any[]).map(r => ({
      categoria_id: r.categoria_id, profile_id: r.profile_id, nome: r.profiles?.full_name ?? '—',
    })));
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!escolherPara) return;
    const id = setTimeout(async () => {
      let q = supabase.from('profiles').select('id, full_name').neq('role', 'visitante').not('full_name', 'is', null).order('full_name').limit(100);
      if (busca.trim()) q = q.ilike('full_name', `%${busca.trim()}%`);
      const { data } = await q;
      setMembros((data ?? []) as Membro[]);
    }, 250);
    return () => clearTimeout(id);
  }, [busca, escolherPara]);

  const abrir = (c: CategoriaCal) => {
    setEditando(c); setNome(c.nome); setEmoji(c.emoji); setCor(c.cor); setAtiva(c.ativa);
  };

  const salvar = async () => {
    if (!editando || !nome.trim() || !emoji.trim()) return;
    const { error } = await supabase.from('calendario_categorias')
      .update({ nome: nome.trim(), emoji: emoji.trim(), cor, ativa }).eq('id', editando.id);
    if (error) return Alert.alert(t('common.erro'), error.message);
    setEditando(null); carregar();
  };

  const adicionarEditor = async (m: Membro) => {
    const c = escolherPara; setEscolherPara(null);
    if (!c) return;
    const { error } = await supabase.from('calendario_editores').insert({ categoria_id: c.id, profile_id: m.id });
    if (error && !String(error.message).includes('duplicate')) { Alert.alert(t('common.erro'), error.message); return; }
    carregar();
  };

  const removerEditor = (e: Editor) => {
    Alert.alert(t('calendario.removerEditorTitulo'), t('calendario.removerEditorTexto', { nome: e.nome }), [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('calendario.remover'), style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('calendario_editores').delete()
            .eq('categoria_id', e.categoria_id).eq('profile_id', e.profile_id);
          if (error) return Alert.alert(t('common.erro'), error.message);
          carregar();
        },
      },
    ]);
  };

  const fundo = C.surface ?? C.card ?? 'transparent';
  const fundoModal = fundo === 'transparent' ? '#fff' : fundo;

  return (
    <View style={[st.bloco, { backgroundColor: fundo, borderColor: C.border }]}>
      <View style={st.topo}>
        <Text style={{ fontSize: 18 }}>🗓️</Text>
        <Text style={[st.titulo, { color: C.text }]}>{t('calendario.adminTitulo')}</Text>
      </View>
      <Text style={[st.sub, { color: C.textMuted }]}>{t('calendario.adminExplica')}</Text>

      {carregando ? <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} /> : cats.map(c => {
        const extras = editores.filter(e => e.categoria_id === c.id);
        return (
          <View key={c.id} style={[st.cat, { borderColor: C.border, opacity: c.ativa ? 1 : 0.5 }]}>
            <View style={st.catTopo}>
              <View style={[st.bolinha, { backgroundColor: c.cor + '22' }]}><Text style={{ fontSize: 18 }}>{c.emoji}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[st.nome, { color: C.text }]}>{nomeCat(c)}{c.ativa ? '' : ` · ${t('calendario.oculta')}`}</Text>
                {!!c.grupo && <Text style={[st.miudo, { color: C.textMuted }]}>{t('calendario.liderDoGrupo', { grupo: NOME_GRUPO[c.grupo] ?? c.grupo })}</Text>}
              </View>
              <View style={[st.amostra, { backgroundColor: c.cor }]} />
              <TouchableOpacity onPress={() => abrir(c)} hitSlop={8}><Ionicons name="create-outline" size={20} color={C.primary} /></TouchableOpacity>
            </View>
            <View style={st.editores}>
              {extras.map(e => (
                <TouchableOpacity key={e.profile_id} onPress={() => removerEditor(e)} style={[st.pessoa, { borderColor: c.cor + '66' }]}>
                  <Text style={[st.miudo, { color: C.text }]} numberOfLines={1}>{e.nome}</Text>
                  <Ionicons name="close" size={13} color={C.textMuted} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => { setBusca(''); setEscolherPara(c); }} style={[st.pessoa, { borderColor: C.border }]}>
                <Ionicons name="person-add-outline" size={13} color={C.primary} />
                <Text style={[st.miudo, { color: C.primary, fontWeight: '700' }]}>{t('calendario.adicionarEditor')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {/* Editar categoria */}
      <Modal visible={!!editando} transparent animationType="fade" onRequestClose={() => setEditando(null)}>
        <View style={st.fundo}>
          <View style={[st.cartao, { backgroundColor: fundoModal }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[st.titulo, { color: C.text, marginBottom: 10 }]}>{t('calendario.editarCategoria')}</Text>
              <Text style={[st.rotulo, { color: C.textMuted }]}>{t('calendario.nome')}</Text>
              <TextInput style={[st.campo, { color: C.text, borderColor: C.border }]} value={nome} onChangeText={setNome} maxLength={40} />
              <Text style={[st.rotulo, { color: C.textMuted }]}>{t('calendario.emoji')}</Text>
              <TextInput style={[st.campo, { color: C.text, borderColor: C.border, fontSize: 22, width: 80, textAlign: 'center' }]} value={emoji} onChangeText={v => setEmoji(Array.from(v).slice(-2).join(''))} />
              <Text style={[st.rotulo, { color: C.textMuted }]}>{t('calendario.cor')}</Text>
              <View style={st.paleta}>
                {PALETA_CAL.map(p => (
                  <TouchableOpacity key={p} onPress={() => setCor(p)} style={[st.corOpcao, { backgroundColor: p }, cor === p && st.corSel]}>
                    {cor === p && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[st.catTopo, { marginTop: 12 }]}>
                <Text style={[st.nome, { color: C.text, flex: 1 }]}>{t('calendario.mostrar')}</Text>
                <Switch value={ativa} onValueChange={setAtiva} />
              </View>
              <View style={[st.previa, { backgroundColor: cor }]}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{emoji} {nome}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 14 }}>
                <TouchableOpacity onPress={() => setEditando(null)}><Text style={{ color: C.textMuted, fontWeight: '700' }}>{t('common.cancelar')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={salvar}><Text style={{ color: C.primary, fontWeight: '800' }}>{t('calendario.salvar')}</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Escolher editor */}
      <Modal visible={!!escolherPara} transparent animationType="fade" onRequestClose={() => setEscolherPara(null)}>
        <View style={st.fundo}>
          <View style={[st.cartao, { backgroundColor: fundoModal }]}>
            <Text style={[st.titulo, { color: C.text, marginBottom: 10 }]}>
              {t('calendario.quemEdita', { cat: escolherPara ? `${escolherPara.emoji} ${nomeCat(escolherPara)}` : '' })}
            </Text>
            <TextInput
              style={[st.campo, { color: C.text, borderColor: C.border }]}
              placeholder={t('conversas.buscarMembro')} placeholderTextColor={C.textDim}
              value={busca} onChangeText={setBusca} autoFocus
            />
            <FlatList
              style={{ maxHeight: 320 }} data={membros} keyExtractor={m => m.id} keyboardShouldPersistTaps="handled"
              renderItem={({ item: m }) => (
                <TouchableOpacity style={[st.linha, { borderColor: C.border }]} onPress={() => adicionarEditor(m)}>
                  <Text style={[st.nome, { color: C.text }]} numberOfLines={1}>{m.full_name}</Text>
                  <Ionicons name="add-circle-outline" size={20} color={C.primary} />
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setEscolherPara(null)} style={{ alignSelf: 'flex-end', padding: 10 }}>
              <Text style={{ color: C.textMuted, fontWeight: '700' }}>{t('common.cancelar')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  bloco: { marginTop: 20, borderRadius: 16, borderWidth: 1, padding: 16 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 6 },
  cat: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  catTopo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bolinha: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  amostra: { width: 18, height: 18, borderRadius: 9 },
  nome: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  miudo: { fontSize: 11.5 },
  editores: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginLeft: 46 },
  pessoa: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, maxWidth: 200 },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  cartao: { borderRadius: 18, padding: 18, maxHeight: '90%' },
  rotulo: { fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  campo: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 4 },
  paleta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  corOpcao: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  corSel: { borderWidth: 3, borderColor: 'rgba(0,0,0,0.25)' },
  previa: { marginTop: 12, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start' },
});
