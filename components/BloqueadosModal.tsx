// components/BloqueadosModal.tsx
//
// Perfil › Pessoas bloqueadas (17/10/2026). Quem a pessoa bloqueou nos
// chats, com "Desbloquear". O bloqueio é feito segurando uma mensagem no
// chat (ver lib/moderacao.ts).

import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

type Bloqueado = { user_id: string; nome: string; desde: string };

export default function BloqueadosModal({ visivel, isDark, onFechar }: {
  visivel: boolean; isDark: boolean; onFechar: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [lista, setLista] = useState<Bloqueado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const bg = isDark ? '#1C1940' : '#FFFFFF';
  const texto = isDark ? '#F1EFFA' : '#1A1A2E';
  const suave = isDark ? '#A69FD6' : '#6B7280';
  const borda = isDark ? '#332D5C' : '#E5E0D8';

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase.rpc('meus_bloqueados');
    setLista((data ?? []) as Bloqueado[]);
    setCarregando(false);
  }, []);

  useEffect(() => { if (visivel) carregar(); }, [visivel, carregar]);

  const desbloquear = async (b: Bloqueado) => {
    const { data: sess } = await supabase.auth.getUser();
    const { error } = await supabase.from('usuarios_bloqueados').delete()
      .eq('bloqueador_id', sess.user?.id ?? '').eq('bloqueado_id', b.user_id);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    setLista(prev => prev.filter(x => x.user_id !== b.user_id));
  };

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <View style={st.fundo}>
        <View style={[st.folha, { backgroundColor: bg, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={st.topo}>
            <Text style={[st.titulo, { color: texto }]}>{t('moderacao.bloqueadosPerfil')}</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={10}>
              <Ionicons name="close" size={24} color={suave} />
            </TouchableOpacity>
          </View>
          {carregando ? (
            <ActivityIndicator style={{ marginVertical: 30 }} color={suave} />
          ) : lista.length === 0 ? (
            <Text style={[st.vazio, { color: suave }]}>{t('moderacao.bloqueadosVazio')}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              {lista.map(b => (
                <View key={b.user_id} style={[st.linha, { borderTopColor: borda }]}>
                  <Ionicons name="ban-outline" size={18} color={suave} />
                  <Text style={[st.nome, { color: texto }]} numberOfLines={1}>{b.nome}</Text>
                  <TouchableOpacity onPress={() => desbloquear(b)} style={[st.botao, { borderColor: borda }]}>
                    <Text style={[st.botaoTexto, { color: texto }]}>{t('moderacao.desbloquear')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  folha: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  titulo: { fontSize: 18, fontWeight: '800' },
  vazio: { fontSize: 14, textAlign: 'center', marginVertical: 30 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  nome: { flex: 1, fontSize: 15, fontWeight: '600' },
  botao: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  botaoTexto: { fontSize: 13, fontWeight: '700' },
});
