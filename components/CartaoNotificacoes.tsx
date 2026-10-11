import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { deveMostrarCartaoPush, adiarCartaoPush, ativarNotificacoesComAjuda } from '../lib/useNotifications';

// Cartão discreto da Home: "Notificações desligadas · Ativar".
// Regra de quando aparece em `deveMostrarCartaoPush()` (lib/useNotifications).
export default function CartaoNotificacoes({
  userId, cores,
}: {
  userId?: string;
  cores: { cardBg: string; cardBorder: string; textPrimary: string; textMuted: string };
}) {
  const { t } = useTranslation();
  const [mostrar, setMostrar] = useState(false);

  const conferir = useCallback(() => {
    if (!userId) { setMostrar(false); return; }
    deveMostrarCartaoPush().then(setMostrar).catch(() => setMostrar(false));
  }, [userId]);

  // Ao voltar para a Home e ao voltar dos Ajustes do celular.
  useFocusEffect(useCallback(() => { conferir(); }, [conferir]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => { if (e === 'active') conferir(); });
    return () => sub.remove();
  }, [conferir]);

  if (!mostrar) return null;

  const ativar = async () => {
    await ativarNotificacoesComAjuda(userId);
    conferir();
  };
  const fechar = async () => {
    setMostrar(false);
    await adiarCartaoPush();
  };

  return (
    <View style={[s.cartao, { backgroundColor: cores.cardBg, borderColor: cores.cardBorder }]}>
      <View style={s.icone}>
        <Ionicons name="notifications-off-outline" size={18} color="#D99A00" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.titulo, { color: cores.textPrimary }]}>{t('notificacoes.cartaoDesligadas')}</Text>
        <Text style={[s.texto, { color: cores.textMuted }]} numberOfLines={2}>{t('notificacoes.cartaoTexto')}</Text>
      </View>
      <TouchableOpacity style={s.botao} onPress={ativar} activeOpacity={0.85}>
        <Text style={s.botaoTexto}>{t('notificacoes.cartaoAtivar')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={fechar} hitSlop={10} style={s.fechar}>
        <Ionicons name="close" size={16} color={cores.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  cartao: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, paddingVertical: 11, paddingLeft: 12, paddingRight: 8, marginBottom: 14 },
  icone: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(217,154,0,0.14)', alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 13.5, fontWeight: '700' },
  texto: { fontSize: 12, marginTop: 1, lineHeight: 16 },
  botao: { backgroundColor: '#7B61FF', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  botaoTexto: { color: '#fff', fontSize: 13, fontWeight: '700' },
  fechar: { padding: 4 },
});
