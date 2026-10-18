// components/GrupoChatModal.tsx
//
// Chat de um grupo (Mulheres, Homens, Alive, Estudo Bíblico, Ministério
// Infantil). Desde 18/10/2026 é a MESMA tela do Chat da Igreja
// (ChatGeralModal), só apontando para as mensagens do grupo: reações com
// favoritos e "+", responder, "Reações e visualizações" (quem viu), prévia de
// links, foto/vídeo/arquivo/áudio, negrito, compartilhar com o chat aberto e
// a moderação (denunciar, bloquear, suspender). Pedido do Marcos: "quero que
// os chats tenham exatamente o mesmo padrão e funcionalidades".
//
// Quem entra e quem apaga continua decidido no banco (RLS de
// `grupo_chat_mensagens`): participantes do grupo; o autor apaga a própria
// mensagem e o admin apaga qualquer uma.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ChatGeralModal from './ChatGeralModal';
import { fonteGrupo } from '../lib/chatFonte';

export default function GrupoChatModal({
  visible, grupo, grupoNome, cor, userId, userNome, podeModerar, onClose,
}: {
  visible: boolean;
  grupo: string;
  grupoNome: string;
  cor: string;
  userId: string;
  userNome: string;
  /** Admin da igreja: apaga mensagem dos outros, vê denúncias e suspende. */
  podeModerar: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fonte = useMemo(() => fonteGrupo(t, grupo, grupoNome, cor), [t, grupo, grupoNome, cor]);
  return (
    <ChatGeralModal
      visible={visible}
      userId={userId}
      ehAdmin={podeModerar}
      onClose={onClose}
      fonte={fonte}
      autorNome={userNome}
    />
  );
}
