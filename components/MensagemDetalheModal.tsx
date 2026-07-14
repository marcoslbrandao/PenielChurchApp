import React from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Image, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCampoTraduzido } from '../lib/useTraducao';

export type Mensagem = {
  id: string;
  titulo: string;
  resumo: string;
  conteudo: string;
  imagem_url: string | null;
  autor: string;
  data: string;
};

const LOCALE_POR_IDIOMA: Record<string, string> = { pt: 'pt-BR', en: 'en-GB', es: 'es-ES', fr: 'fr-FR' };

export default function MensagemDetalheModal({ mensagem, onClose }: {
  mensagem: Mensagem | null; onClose: () => void;
}) {
  const { i18n } = useTranslation();
  const titulo = useCampoTraduzido(mensagem?.titulo, 'mensagens', mensagem?.id, 'titulo');
  const resumo = useCampoTraduzido(mensagem?.resumo, 'mensagens', mensagem?.id, 'resumo');
  const conteudo = useCampoTraduzido(mensagem?.conteudo, 'mensagens', mensagem?.id, 'conteudo');
  if (!mensagem) return null;

  const locale = LOCALE_POR_IDIOMA[i18n.language] ?? 'pt-BR';
  const dataFormatada = new Date(`${mensagem.data}T00:00:00`).toLocaleDateString(locale, {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const paragrafos = conteudo.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  return (
    <Modal visible={!!mensagem} animationType="slide" onRequestClose={onClose}>
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.closeBtn}
            onPress={() => Share.share({ message: `${titulo}\n\n${resumo}\n\n📖 Peniel Church App` })}
          >
            <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {!!mensagem.imagem_url && (
            <Image source={{ uri: mensagem.imagem_url }} style={s.capa} resizeMode="cover" />
          )}
          <View style={s.corpo}>
            <Text style={s.titulo}>{titulo}</Text>
            <Text style={s.meta}>{mensagem.autor} · {dataFormatada}</Text>
            {paragrafos.map((p, i) => (
              <Text key={i} style={s.paragrafo}>{p}</Text>
            ))}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1740' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 55, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#1A1740', borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 20 },
  capa: { width: '100%', height: 220 },
  corpo: { padding: 20 },
  titulo: { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 30 },
  meta: { fontSize: 12, color: '#F5C842', fontWeight: '600', marginTop: 8, marginBottom: 18 },
  paragrafo: { fontSize: 16, color: 'rgba(255,255,255,0.85)', lineHeight: 26, marginBottom: 16 },
});
