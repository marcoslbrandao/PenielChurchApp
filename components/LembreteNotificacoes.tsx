import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ativarNotificacoesComAjuda } from '../lib/useNotifications';

// Lembrete de notificações logo depois do cadastro (visitante e membro).
//
// POR QUE UMA TELA NOSSA ANTES DA PERGUNTA DO SISTEMA
// O iPhone (e o Android 13+) só mostra "Permitir notificações?" UMA vez. Se a
// pergunta aparece do nada e a pessoa recusa, daí em diante só pelos Ajustes.
// Aqui ela primeiro entende para que serve, e só quem toca em "Ativar" vê a
// pergunta do sistema. Quem toca em "Agora não" continua vendo o cartão
// discreto da Home até ativar.
export default function LembreteNotificacoes({
  visible, userId, onFechar,
}: {
  visible: boolean;
  userId?: string;
  onFechar: () => void;
}) {
  const { t } = useTranslation();
  const [ocupado, setOcupado] = useState(false);

  const ativar = async () => {
    setOcupado(true);
    try {
      await ativarNotificacoesComAjuda(userId);
    } finally {
      setOcupado(false);
      onFechar();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFechar}>
      <View style={s.fundo}>
        <View style={s.cartao}>
          <View style={s.icone}>
            <Ionicons name="notifications" size={34} color="#F5C842" />
          </View>
          <Text style={s.titulo}>{t('notificacoes.lembreteTitulo')}</Text>
          <Text style={s.texto}>{t('notificacoes.lembreteTexto')}</Text>

          <TouchableOpacity style={s.botao} onPress={ativar} disabled={ocupado} activeOpacity={0.85}>
            {ocupado
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.botaoTexto}>{t('notificacoes.ativar')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.secundario} onPress={onFechar} disabled={ocupado} hitSlop={8}>
            <Text style={s.secundarioTexto}>{t('notificacoes.agoraNao')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(10,8,30,0.72)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  cartao: { width: '100%', maxWidth: 380, backgroundColor: '#1C1940', borderRadius: 22, borderWidth: 1, borderColor: '#332D5C', paddingHorizontal: 24, paddingTop: 28, paddingBottom: 18, alignItems: 'center' },
  icone: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(245,200,66,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  titulo: { fontSize: 21, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 8 },
  texto: { fontSize: 15, color: 'rgba(255,255,255,0.72)', textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  botao: { width: '100%', backgroundColor: '#7B61FF', borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  botaoTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secundario: { paddingVertical: 14, paddingHorizontal: 20 },
  secundarioTexto: { fontSize: 15, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
});
