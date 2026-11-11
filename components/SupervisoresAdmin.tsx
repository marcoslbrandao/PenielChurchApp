// components/SupervisoresAdmin.tsx
//
// Painel Admin › Denúncias: Supervisores de proteção (11/11/2026).
// Pedido do Marcos: o admin marca quem são e troca quando alguém sai da
// igreja. Supervisor pode ler as conversas privadas PROTEGIDAS (adulto ↔
// menor), informando o motivo; cada leitura fica registrada aqui embaixo.
// Quem sai do papel perde o acesso na hora (a regra está no banco).

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, TextInput, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

type Sup = { user_id: string; nome: string; desde: string };
type Registro = { id: string; nomes: string | null; motivo: string; created_at: string; supervisor_id: string | null };
type Membro = { id: string; full_name: string | null };

function dataHora(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SupervisoresAdmin({ C }: {
  C: { text: string; textMuted: string; textDim: string; surface?: string; card?: string; border: string; primary: string; danger: string };
}) {
  const { t } = useTranslation();
  const [lista, setLista] = useState<Sup[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [escolher, setEscolher] = useState(false);
  const [busca, setBusca] = useState('');
  const [membros, setMembros] = useState<Membro[]>([]);

  const carregar = useCallback(async () => {
    const [s, r] = await Promise.all([
      supabase.rpc('supervisores_lista'),
      supabase.from('supervisao_registro').select('id, nomes, motivo, created_at, supervisor_id').order('created_at', { ascending: false }).limit(20),
    ]);
    setLista((s.data ?? []) as Sup[]);
    setRegistros((r.data ?? []) as Registro[]);
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!escolher) return;
    const id = setTimeout(async () => {
      let q = supabase.from('profiles').select('id, full_name').neq('role', 'visitante').not('full_name', 'is', null).order('full_name').limit(100);
      if (busca.trim()) q = q.ilike('full_name', `%${busca.trim()}%`);
      const { data } = await q;
      setMembros((data ?? []) as Membro[]);
    }, 250);
    return () => clearTimeout(id);
  }, [busca, escolher]);

  const adicionar = async (m: Membro) => {
    setEscolher(false);
    const { error } = await supabase.from('supervisores_protecao').insert({ user_id: m.id });
    if (error && !String(error.message).includes('duplicate')) { Alert.alert(t('common.erro'), error.message); return; }
    carregar();
  };

  const remover = (s: Sup) => {
    Alert.alert(t('supervisores.removerTitulo'), t('supervisores.removerTexto', { nome: s.nome }), [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('supervisores.remover'), style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('supervisores_protecao').delete().eq('user_id', s.user_id);
          if (error) { Alert.alert(t('common.erro'), error.message); return; }
          carregar();
        },
      },
    ]);
  };

  const nomeDoSupervisor = (id: string | null) => lista.find(s => s.user_id === id)?.nome ?? t('supervisores.exSupervisor');
  const fundo = C.surface ?? C.card ?? 'transparent';

  return (
    <View style={[st.bloco, { backgroundColor: fundo, borderColor: C.border }]}>
      <View style={st.topo}>
        <Ionicons name="shield-checkmark-outline" size={20} color={C.primary} />
        <Text style={[st.titulo, { color: C.text }]}>{t('supervisores.titulo')}</Text>
      </View>
      <Text style={[st.sub, { color: C.textMuted }]}>{t('supervisores.explica')}</Text>

      {carregando ? <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} /> : (
        <>
          {lista.length === 0 && <Text style={[st.sub, { color: C.textDim, marginTop: 10 }]}>{t('supervisores.nenhum')}</Text>}
          {lista.map(s => (
            <View key={s.user_id} style={[st.linha, { borderColor: C.border }]}>
              <Text style={[st.nome, { color: C.text }]} numberOfLines={1}>{s.nome}</Text>
              <TouchableOpacity onPress={() => remover(s)} hitSlop={8}>
                <Ionicons name="close-circle-outline" size={22} color={C.danger} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={[st.botao, { borderColor: C.primary }]} onPress={() => { setBusca(''); setEscolher(true); }}>
            <Ionicons name="add" size={18} color={C.primary} />
            <Text style={[st.botaoTexto, { color: C.primary }]}>{t('supervisores.adicionar')}</Text>
          </TouchableOpacity>

          <Text style={[st.secao, { color: C.textMuted }]}>{t('supervisores.registro')}</Text>
          {registros.length === 0 && <Text style={[st.sub, { color: C.textDim }]}>{t('supervisores.registroVazio')}</Text>}
          {registros.map(r => (
            <View key={r.id} style={[st.reg, { borderColor: C.border }]}>
              <Text style={[st.regTopo, { color: C.textMuted }]}>{dataHora(r.created_at)} · {nomeDoSupervisor(r.supervisor_id)}</Text>
              <Text style={[st.nome, { color: C.text }]}>{r.nomes ?? ''}</Text>
              <Text style={[st.sub, { color: C.textMuted }]}>{t('supervisores.motivo')}: {r.motivo}</Text>
            </View>
          ))}
        </>
      )}

      <Modal visible={escolher} transparent animationType="fade" onRequestClose={() => setEscolher(false)}>
        <View style={st.fundo}>
          <View style={[st.cartao, { backgroundColor: fundo === 'transparent' ? '#fff' : fundo }]}>
            <Text style={[st.titulo, { color: C.text, marginBottom: 10 }]}>{t('supervisores.adicionar')}</Text>
            <TextInput
              style={[st.campo, { color: C.text, borderColor: C.border }]}
              placeholder={t('conversas.buscarMembro')}
              placeholderTextColor={C.textDim}
              value={busca}
              onChangeText={setBusca}
              autoFocus
            />
            <FlatList
              style={{ maxHeight: 320 }}
              data={membros}
              keyExtractor={m => m.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: m }) => (
                <TouchableOpacity style={[st.linha, { borderColor: C.border }]} onPress={() => adicionar(m)}>
                  <Text style={[st.nome, { color: C.text }]} numberOfLines={1}>{m.full_name}</Text>
                  <Ionicons name="add-circle-outline" size={20} color={C.primary} />
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setEscolher(false)} style={{ alignSelf: 'flex-end', padding: 10 }}>
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
  sub: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  secao: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: 18, marginBottom: 4 },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  nome: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  botao: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 12, borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  botaoTexto: { fontWeight: '700', fontSize: 13 },
  reg: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  regTopo: { fontSize: 11, fontWeight: '700' },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  cartao: { borderRadius: 18, padding: 18 },
  campo: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 8 },
});
