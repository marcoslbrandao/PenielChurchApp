import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { buscarResumo, quandoCurto, type ResumoChat } from '../lib/chatGeral';
import ChatGeralModal from './ChatGeralModal';

// Card do Chat da Igreja na Home: última mensagem, hora e contador de não
// lidas. Só é montado para MEMBROS (a Home decide); mesmo que fosse montado
// para um visitante, a RLS devolveria vazio.
export default function ChatGeralCard({
  userId, ehAdmin, cores,
}: {
  userId: string;
  ehAdmin: boolean;
  cores: { cardBg: string; cardBorder: string; textPrimary: string; textMuted: string };
}) {
  const { t } = useTranslation();
  const [resumo, setResumo] = useState<ResumoChat | null>(null);
  const [aberto, setAberto] = useState(false);

  const atualizar = useCallback(() => { buscarResumo().then(r => { if (r) setResumo(r); }); }, []);

  useFocusEffect(useCallback(() => { atualizar(); }, [atualizar]));

  // Mensagem nova (ou apagada) enquanto a Home está aberta: atualiza o card.
  useEffect(() => {
    const canal = supabase
      .channel('chat_geral_home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_geral_mensagens' }, () => atualizar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [atualizar]);

  const naoLidas = resumo?.nao_lidas ?? 0;
  const previa = (() => {
    if (!resumo?.ultima_em) return t('chatGeral.cardVazio');
    const conteudo =
      resumo.ultima_tipo === 'imagem' ? (resumo.ultima_texto ? `${t('chatGeral.foto')} · ${resumo.ultima_texto}` : t('chatGeral.foto')) :
      resumo.ultima_tipo === 'audio' ? t('chatGeral.audio') :
      resumo.ultima_tipo === 'video' ? t('chatGeral.video') :
      (resumo.ultima_texto ?? '');
    return `${resumo.ultima_autor ?? ''}: ${conteudo.replace(/\s+/g, ' ')}`;
  })();

  return (
    <>
      <TouchableOpacity
        style={[s.card, { backgroundColor: cores.cardBg, borderColor: naoLidas > 0 ? '#6A55E0' : cores.cardBorder }]}
        activeOpacity={0.85}
        onPress={() => setAberto(true)}
      >
        <View style={s.icone}>
          <Ionicons name="chatbubbles" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.linhaTopo}>
            <Text style={[s.titulo, { color: cores.textPrimary }]} numberOfLines={1}>{t('chatGeral.titulo')}</Text>
            {!!resumo?.ultima_em && (
              <Text style={[s.hora, { color: naoLidas > 0 ? '#6A55E0' : cores.textMuted }]}>{quandoCurto(resumo.ultima_em)}</Text>
            )}
          </View>
          <View style={s.linhaTopo}>
            <Text
              style={[s.previa, { color: cores.textMuted }, naoLidas > 0 && { color: cores.textPrimary, fontWeight: '600' }]}
              numberOfLines={1}
            >
              {previa}
            </Text>
            {naoLidas > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeTexto}>{naoLidas > 99 ? '99+' : naoLidas}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>

      <ChatGeralModal
        visible={aberto}
        userId={userId}
        ehAdmin={ehAdmin}
        onClose={() => { setAberto(false); atualizar(); }}
      />
    </>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 16 },
  icone: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#6A55E0', alignItems: 'center', justifyContent: 'center' },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { flex: 1, fontSize: 15.5, fontWeight: '800' },
  hora: { fontSize: 11.5, fontWeight: '600' },
  previa: { flex: 1, fontSize: 13, marginTop: 3 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#6A55E0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginTop: 3 },
  badgeTexto: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
});
