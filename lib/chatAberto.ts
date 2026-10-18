// lib/chatAberto.ts
//
// Qual chat está aberto na tela agora (18/10/2026).
//
// POR QUE ISTO EXISTE
// Com o Chat da Igreja aberto, o membro ia ao app da RTM, tocava em
// Compartilhar › Peniel e… nada. A folha "Enviar para" é um <Modal>, e no
// iPhone um Modal não aparece por cima de OUTRO Modal já aberto (o chat):
// ela só surgia depois de fechar o chat. Pedido do Marcos: se já houver um
// chat aberto, o que foi compartilhado entra direto NELE, sem perguntar.
//
// Cada chat (Igreja, grupo, Banda) se registra aqui enquanto está na tela;
// o RecebeCompartilhamento pergunta `chatAberto()` antes de abrir a folha.

import type { Compartilhado } from './chatGeral';

export type ChatAberto = {
  /** 'igreja', 'banda' ou o id do grupo ('homens', 'infantil'...). */
  destino: string;
  receber: (c: Compartilhado) => void;
};

let atual: ChatAberto | null = null;

/** Registra o chat que acabou de abrir. Devolve a função que o tira (só tira
 *  se ainda for ele: ao trocar de chat, o novo pode ter se registrado antes
 *  do antigo sair). */
export function registrarChatAberto(chat: ChatAberto): () => void {
  atual = chat;
  return () => { if (atual === chat) atual = null; };
}

export function chatAberto(): ChatAberto | null {
  return atual;
}
