// components/MemesModal.tsx
//
// Memes do chat (12/11/2026): "Meus" (cada um os seus) e "Da igreja" (o admin
// monta o pacote). Tocar envia no chat; segurar apaga; "+" guarda da galeria.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, Image, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { listarMemes, salvarMeme, apagarMeme, type Meme } from '../lib/memes';

export default function MemesModal({ visivel, onFechar, onEscolher, userId, ehAdmin, cor }: {
  visivel: boolean; onFechar: () => void; onEscolher: (m: Meme) => void;
  userId: string; ehAdmin: boolean; cor: string;
}) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [aba, setAba] = useState<'meus' | 'igreja'>('meus');
  const [memes, setMemes] = useState<Meme[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setMemes(await listarMemes());
    setCarregando(false);
  }, []);
  useEffect(() => { if (visivel) carregar(); }, [visivel, carregar]);

  const lista = memes.filter(m => (aba === 'meus' ? m.dono === userId : m.dono === null));
  const lado = Math.floor((width - 16 * 2 - 8 * 3) / 4);
  const podeAdicionar = aba === 'meus' || ehAdmin;

  const adicionar = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true, selectionLimit: 10 });
    if (r.canceled || !r.assets?.length) return;
    setSalvando(true);
    let erro: string | null = null;
    for (const a of r.assets) {
      const res = await salvarMeme(a.uri, a.mimeType, userId, aba === 'igreja', { width: a.width, height: a.height });
      if (res !== 'ok') { erro = res; break; }
    }
    setSalvando(false);
    if (erro) Alert.alert(t('memes.titulo'), erro === 'limite' ? t('memes.limite') : erro);
    carregar();
  };

  const apagar = (m: Meme) => {
    if (m.dono === null && !ehAdmin) return;
    Alert.alert(t('memes.apagarTitulo'), undefined, [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('memes.apagar'), style: 'destructive', onPress: async () => { await apagarMeme(m); carregar(); } },
    ]);
  };

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <View style={st.fundo}>
        <View style={[st.folha, { backgroundColor: C.surface, paddingBottom: insets.bottom + 12 }]}>
          <View style={st.topo}>
            <Text style={[st.titulo, { color: C.text }]}>😄 {t('memes.titulo')}</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={10}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
          </View>
          <View style={st.abas}>
            {(['meus', 'igreja'] as const).map(a => (
              <TouchableOpacity key={a} onPress={() => setAba(a)} style={[st.aba, { borderColor: cor + '55', backgroundColor: aba === a ? cor : 'transparent' }]}>
                <Text style={{ color: aba === a ? '#fff' : C.text, fontWeight: '700', fontSize: 13 }}>{t(`memes.aba_${a}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {carregando ? <ActivityIndicator color={cor} style={{ marginVertical: 40 }} /> : (
            <FlatList
              data={podeAdicionar ? [{ id: '__novo' } as Meme, ...lista] : lista}
              keyExtractor={m => m.id}
              numColumns={4}
              columnWrapperStyle={{ gap: 8 }}
              contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
              style={{ maxHeight: 420 }}
              ListEmptyComponent={<Text style={[st.vazio, { color: C.textMuted }]}>{aba === 'meus' ? t('memes.vazioMeus') : t('memes.vazioIgreja')}</Text>}
              renderItem={({ item: m }) => m.id === '__novo' ? (
                <TouchableOpacity onPress={adicionar} disabled={salvando}
                  style={[st.celula, { width: lado, height: lado, borderColor: cor + '66', borderStyle: 'dashed', borderWidth: 1.5 }]}>
                  {salvando ? <ActivityIndicator color={cor} /> : <Ionicons name="add" size={28} color={cor} />}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => onEscolher(m)} onLongPress={() => apagar(m)} delayLongPress={350}
                  style={[st.celula, { width: lado, height: lado, backgroundColor: C.surfaceAlt }]}>
                  <Image source={{ uri: m.url }} style={{ width: lado, height: lado, borderRadius: 12 }} resizeMode="cover" />
                </TouchableOpacity>
              )}
            />
          )}
          {!carregando && lista.length === 0 && podeAdicionar && (
            <Text style={[st.dica, { color: C.textMuted }]}>{aba === 'meus' ? t('memes.vazioMeus') : t('memes.vazioIgreja')}</Text>
          )}
          <Text style={[st.dica, { color: C.textMuted }]}>{t('memes.dica')}</Text>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  folha: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 14 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  titulo: { fontSize: 17, fontWeight: '800' },
  abas: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  aba: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  celula: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  vazio: { textAlign: 'center', marginVertical: 30, fontSize: 13 },
  dica: { fontSize: 11.5, textAlign: 'center', marginTop: 6 },
});
