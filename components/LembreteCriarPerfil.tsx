import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../lib/useAuth';

// Lembrete "Crie seu perfil" para quem usa o app SEM conta (decisão do Marcos,
// 16/10/2026). O app continua aberto para todos — Bíblia, mensagens, avisos —
// mas de vez em quando lembramos o que a pessoa ganha criando o perfil.
//
// QUANDO APARECE
//   * só para quem não está logado;
//   * nunca na primeira vez que a pessoa abre o app (ela acabou de chegar);
//   * a partir da 2ª abertura, e depois no máximo a cada DIAS_ENTRE dias;
//   * alguns segundos depois da Home abrir, para não cobrir o conteúdo logo
//     de cara.
// Fica guardado no aparelho (AsyncStorage). Se falhar, simplesmente não mostra.
const CHAVE_ABERTURAS = 'lembretePerfil:aberturas';
const CHAVE_ULTIMO = 'lembretePerfil:ultimo';
const DIAS_ENTRE = 5;
const ATRASO_MS = 6000;

export default function LembreteCriarPerfil({ onCriar }: { onCriar: () => void }) {
  const { t } = useTranslation();
  const { isLoggedIn, loading } = useAuth();
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (loading || isLoggedIn) { setVisivel(false); return; }
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const aberturas = Number((await AsyncStorage.getItem(CHAVE_ABERTURAS)) ?? '0') + 1;
        await AsyncStorage.setItem(CHAVE_ABERTURAS, String(aberturas));
        if (aberturas < 2) return;
        const ultimo = Number((await AsyncStorage.getItem(CHAVE_ULTIMO)) ?? '0');
        if (Date.now() - ultimo < DIAS_ENTRE * 24 * 60 * 60 * 1000) return;
        timer = setTimeout(async () => {
          if (cancelado) return;
          setVisivel(true);
          try { await AsyncStorage.setItem(CHAVE_ULTIMO, String(Date.now())); } catch {}
        }, ATRASO_MS);
      } catch {
        // Sem armazenamento, sem lembrete.
      }
    })();
    return () => { cancelado = true; if (timer) clearTimeout(timer); };
  }, [loading, isLoggedIn]);

  const vantagens: { icone: React.ComponentProps<typeof Ionicons>['name']; texto: string }[] = [
    { icone: 'bookmark-outline', texto: t('lembretePerfil.vantagemVersiculos') },
    { icone: 'book-outline', texto: t('lembretePerfil.vantagemPlano') },
    { icone: 'heart-outline', texto: t('lembretePerfil.vantagemOracao') },
    { icone: 'notifications-outline', texto: t('lembretePerfil.vantagemAvisos') },
    { icone: 'gift-outline', texto: t('lembretePerfil.vantagemAniversario') },
  ];

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={() => setVisivel(false)}>
      <View style={s.fundo}>
        <View style={s.cartao}>
          <View style={s.icone}>
            <Ionicons name="person-add" size={30} color="#F5C842" />
          </View>
          <Text style={s.titulo}>{t('lembretePerfil.titulo')}</Text>
          <Text style={s.texto}>{t('lembretePerfil.texto')}</Text>

          <View style={s.lista}>
            {vantagens.map(v => (
              <View key={v.texto} style={s.item}>
                <Ionicons name={v.icone} size={18} color="#A898FF" />
                <Text style={s.itemTexto}>{v.texto}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={s.botao}
            activeOpacity={0.85}
            onPress={() => { setVisivel(false); onCriar(); }}
          >
            <Text style={s.botaoTexto}>{t('lembretePerfil.criar')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secundario} onPress={() => setVisivel(false)} hitSlop={8}>
            <Text style={s.secundarioTexto}>{t('lembretePerfil.agoraNao')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(10,8,30,0.72)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  cartao: { width: '100%', maxWidth: 380, backgroundColor: '#1C1940', borderRadius: 22, borderWidth: 1, borderColor: '#332D5C', paddingHorizontal: 24, paddingTop: 26, paddingBottom: 16, alignItems: 'center' },
  icone: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(245,200,66,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  titulo: { fontSize: 21, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 8 },
  texto: { fontSize: 14.5, color: 'rgba(255,255,255,0.72)', textAlign: 'center', lineHeight: 21, marginBottom: 16 },
  lista: { width: '100%', marginBottom: 20, gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemTexto: { flex: 1, fontSize: 14.5, color: 'rgba(255,255,255,0.88)', lineHeight: 20 },
  botao: { width: '100%', backgroundColor: '#7B61FF', borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  botaoTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secundario: { paddingVertical: 14, paddingHorizontal: 20 },
  secundarioTexto: { fontSize: 15, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
});
