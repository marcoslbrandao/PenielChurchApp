// components/MenuMensagem.tsx
//
// Menu que abre ao segurar uma mensagem no chat de um grupo ou da Banda
// (17/10/2026). O Chat da Igreja tem o próprio menu (com reações), com os
// mesmos itens de moderação.
//
// Itens:
//   • Apagar     → a própria mensagem, ou qualquer uma se for admin
//   • Denunciar  → mensagem dos outros (vai para o Admin, com push)
//   • Bloquear   → some com as mensagens da pessoa para mim
//   • Suspender  → só admin: a pessoa não escreve em nenhum chat
//
// Não é um Alert de propósito: o Alert do Android mostra no máximo 3 botões.

import React from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export type AcaoMenu = 'apagar' | 'denunciar' | 'bloquear' | 'suspender';

export default function MenuMensagem({
  visivel, autorNome, minha, podeApagar, ehAdmin, autorSuspenso,
  corFundo, corTexto, corBorda, onAcao, onFechar,
}: {
  visivel: boolean;
  autorNome: string;
  minha: boolean;
  podeApagar: boolean;
  ehAdmin: boolean;
  autorSuspenso: boolean;
  corFundo: string;
  corTexto: string;
  corBorda: string;
  onAcao: (acao: AcaoMenu) => void;
  onFechar: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const Item = ({ icone, texto, cor, acao }: {
    icone: keyof typeof Ionicons.glyphMap; texto: string; cor: string; acao: AcaoMenu;
  }) => (
    <TouchableOpacity
      style={[st.item, { borderTopColor: corBorda }]}
      onPress={() => {
        onFechar();
        // Espera o menu fechar: um Alert aberto junto com o fechamento do
        // Modal some no iPhone.
        setTimeout(() => onAcao(acao), 350);
      }}
    >
      <Ionicons name={icone} size={20} color={cor} />
      <Text style={[st.itemTexto, { color: cor }]}>{texto}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onFechar}>
      <Pressable style={st.fundo} onPress={onFechar}>
        <Pressable style={[st.folha, { backgroundColor: corFundo, paddingBottom: Math.max(insets.bottom, 12) }]} onPress={() => {}}>
          <Text style={[st.titulo, { color: corTexto }]} numberOfLines={1}>
            {minha ? t('moderacao.suaMensagem') : t('moderacao.mensagemDe', { nome: autorNome })}
          </Text>
          {podeApagar && <Item icone="trash-outline" texto={t('moderacao.apagar')} cor="#E84B1A" acao="apagar" />}
          {!minha && <Item icone="flag-outline" texto={t('moderacao.denunciar')} cor={corTexto} acao="denunciar" />}
          {!minha && <Item icone="ban-outline" texto={t('moderacao.bloquearNome', { nome: autorNome })} cor={corTexto} acao="bloquear" />}
          {ehAdmin && !minha && (
            <Item
              icone={autorSuspenso ? 'volume-high-outline' : 'volume-mute-outline'}
              texto={autorSuspenso ? t('moderacao.liberarNome', { nome: autorNome }) : t('moderacao.suspenderNome', { nome: autorNome })}
              cor={corTexto}
              acao="suspender"
            />
          )}
          <TouchableOpacity style={[st.item, { borderTopColor: corBorda, justifyContent: 'center' }]} onPress={onFechar}>
            <Text style={[st.itemTexto, { color: corTexto, opacity: 0.6 }]}>{t('common.cancelar')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  folha: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 14 },
  titulo: { fontSize: 13, fontWeight: '700', opacity: 0.7, paddingHorizontal: 20, paddingBottom: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 15, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 50 },
  itemTexto: { fontSize: 15, fontWeight: '600' },
});
