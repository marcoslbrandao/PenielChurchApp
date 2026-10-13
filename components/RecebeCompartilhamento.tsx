import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useShareIntent } from 'expo-share-intent';
import { useAuth } from '../lib/useAuth';
import { useAcesso } from '../lib/acesso';
import type { Compartilhado } from '../lib/chatGeral';
import ChatGeralModal from './ChatGeralModal';

// ─── "Compartilhar → Peniel Church" (13/10/2026) ─────────────────────────────
// No app da RTM (ou em Arquivos, Fotos, Safari, WhatsApp...), o membro toca em
// Compartilhar, escolhe "Peniel Church" e cai direto no Chat da Igreja com o
// arquivo pronto para enviar. Link/texto entra no campo de digitar.
//
// Por baixo é o `expo-share-intent` (Share Extension no iOS, intent filter no
// Android — ver o plugin no app.json). Ele é NATIVO: este arquivo só é
// carregado pelo App.tsx quando o binário tem o módulo (1.5.0+). Num binário
// antigo que recebeu o OTA, importar isto fecharia o app.
//
// Só membros: o chat é só de membros (RLS no banco). Visitante ou quem não
// entrou recebe um aviso, em vez de abrir um chat que ele não pode usar.
export default function RecebeCompartilhamento({ irParaLogin }: { irParaLogin: () => void }) {
  const { t } = useTranslation();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({ resetOnBackground: true });
  const { user } = useAuth();
  const { ehMembro, ehAdmin, carregando } = useAcesso();
  const [conteudo, setConteudo] = useState<Compartilhado | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    // Espera a sessão e o papel: no arranque a frio eles chegam depois.
    if (!hasShareIntent || carregando) return;

    const f = shareIntent.files?.[0];
    const novo: Compartilhado = f
      ? {
          arquivo: {
            uri: f.path,
            nome: f.fileName || 'arquivo',
            mime: f.mimeType || null,
            tamanho: f.size ?? null,
            largura: f.width ?? null,
            altura: f.height ?? null,
            duracaoMs: f.duration ?? null,
          },
        }
      : { texto: (shareIntent.text || shareIntent.webUrl || '').trim() || null };
    // Limpa o pedido no módulo nativo (o arquivo continua no cache do app).
    resetShareIntent();

    if (!novo.arquivo && !novo.texto) return;
    if (!user) {
      Alert.alert(t('chatGeral.compartilharTitulo'), t('chatGeral.compartilharEntrar'), [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('chatGeral.entrar'), onPress: irParaLogin },
      ]);
      return;
    }
    if (!ehMembro) {
      Alert.alert(t('chatGeral.compartilharTitulo'), t('chatGeral.compartilharSoMembros'));
      return;
    }
    setConteudo(novo);
    setAberto(true);
  }, [hasShareIntent, carregando, user, ehMembro]);

  if (!user || !ehMembro) return null;
  return (
    <ChatGeralModal
      visible={aberto}
      userId={user.id}
      ehAdmin={ehAdmin}
      onClose={() => { setAberto(false); setConteudo(null); }}
      compartilhado={conteudo}
      onCompartilhadoUsado={() => setConteudo(null)}
    />
  );
}
