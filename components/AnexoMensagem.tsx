import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, Pressable, TouchableOpacity, ActivityIndicator, Alert, Linking, Modal, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AudioMensagem from './AudioMensagem';
import { urlDoAudio, formatarTempo } from '../lib/chatAudio';
import { formatarTamanho } from '../lib/chatGeral';
import type { MensagemComAnexo } from '../lib/chatAnexos';

// Bolha do anexo nos chats dos grupos e da Banda (bucket `chat-audio`).
// Mesmo visual do Chat da Igreja: foto (toque abre em tela cheia), vídeo
// (toque abre no player do celular), áudio anexado (nome + player) e
// documento (cartão com ícone, nome e tamanho).
export default function AnexoMensagem({
  m, id, minha, corTexto, corTrilho, corProgresso, corCartao, audioAtivo, onAtivarAudio, onTerminarAudio, onLongPress,
}: {
  m: MensagemComAnexo;
  id: string;
  minha: boolean;
  corTexto: string;
  corTrilho: string;
  corProgresso: string;
  /** Fundo do cartão de documento. */
  corCartao: string;
  audioAtivo: boolean;
  onAtivarAudio: () => void;
  onTerminarAudio: () => void;
  onLongPress?: () => void;
}) {
  const { t } = useTranslation();
  if (!m.midia_path || !m.midia_tipo) return null;
  const caminho = m.midia_path;

  if (m.midia_tipo === 'imagem') {
    return <Foto caminho={caminho} largura={m.midia_largura ?? null} altura={m.midia_altura ?? null} onLongPress={onLongPress} />;
  }
  if (m.midia_tipo === 'video') {
    return (
      <Video caminho={caminho} largura={m.midia_largura ?? null} altura={m.midia_altura ?? null}
        duracaoMs={m.midia_duracao_ms ?? null} onLongPress={onLongPress} erroTexto={t('chatGeral.abrirErro')} />
    );
  }
  const ehAudio = (m.midia_mime ?? '').startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg)$/i.test(caminho);
  if (ehAudio) {
    return (
      <View key={id} style={{ gap: 4 }}>
        <View style={st.audioNome}>
          <Ionicons name="musical-notes" size={13} color={corProgresso} />
          <Text style={[st.audioNomeTexto, { color: corTexto }]} numberOfLines={2}>{m.midia_nome}</Text>
        </View>
        <AudioMensagem
          caminho={caminho}
          duracaoMs={m.midia_duracao_ms ?? null}
          ativo={audioAtivo}
          onAtivar={onAtivarAudio}
          onTerminar={onTerminarAudio}
          corTexto={corTexto}
          corTrilho={corTrilho}
          corProgresso={corProgresso}
          onLongPress={onLongPress}
        />
      </View>
    );
  }
  return (
    <Documento caminho={caminho} nome={m.midia_nome ?? t('chatGeral.arquivo')} tamanho={m.midia_tamanho ?? null}
      minha={minha} corTexto={corTexto} corCartao={corCartao} onLongPress={onLongPress} erroTexto={t('chatGeral.abrirErro')} />
  );
}

async function abrir(caminho: string, erroTexto: string) {
  try {
    await Linking.openURL(await urlDoAudio(caminho));
  } catch {
    Alert.alert(erroTexto);
  }
}

function Foto({ caminho, largura, altura, onLongPress }: {
  caminho: string; largura: number | null; altura: number | null; onLongPress?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [cheia, setCheia] = useState(false);
  useEffect(() => {
    let vivo = true;
    urlDoAudio(caminho).then(u => { if (vivo) setUrl(u); }, () => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [caminho]);
  const W = 220;
  const H = Math.max(110, Math.min(300, Math.round(W * (largura && altura ? altura / largura : 0.75))));
  return (
    <>
      <Pressable onPress={() => { if (url) setCheia(true); }} onLongPress={onLongPress} delayLongPress={300}>
        <View style={[st.midia, { width: W, height: H }]}>
          {url ? <Image source={{ uri: url }} style={{ width: W, height: H }} resizeMode="cover" />
            : erro ? <Ionicons name="image-outline" size={30} color="rgba(255,255,255,0.6)" />
            : <ActivityIndicator color="#fff" />}
        </View>
      </Pressable>
      <Modal visible={cheia} transparent animationType="fade" onRequestClose={() => setCheia(false)}>
        <Pressable style={st.cheiaFundo} onPress={() => setCheia(false)}>
          {url && <Image source={{ uri: url }} style={st.cheiaImg} resizeMode="contain" />}
          <View style={st.cheiaFechar}><Ionicons name="close" size={28} color="#fff" /></View>
        </Pressable>
      </Modal>
    </>
  );
}

function Video({ caminho, largura, altura, duracaoMs, onLongPress, erroTexto }: {
  caminho: string; largura: number | null; altura: number | null; duracaoMs: number | null;
  onLongPress?: () => void; erroTexto: string;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const W = 220;
  const H = Math.max(130, Math.min(280, Math.round(W * (largura && altura ? altura / largura : 0.5625))));
  return (
    <Pressable
      onPress={async () => { if (abrindo) return; setAbrindo(true); await abrir(caminho, erroTexto); setAbrindo(false); }}
      onLongPress={onLongPress}
      delayLongPress={300}
    >
      <View style={[st.midia, st.video, { width: W, height: H }]}>
        <View style={st.play}>
          {abrindo ? <ActivityIndicator color="#fff" /> : <Ionicons name="play" size={26} color="#fff" style={{ marginLeft: 3 }} />}
        </View>
        {!!duracaoMs && (
          <View style={st.tempo}>
            <Ionicons name="videocam" size={11} color="#fff" />
            <Text style={st.tempoTexto}>{formatarTempo(duracaoMs / 1000)}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function Documento({ caminho, nome, tamanho, minha, corTexto, corCartao, onLongPress, erroTexto }: {
  caminho: string; nome: string; tamanho: number | null; minha: boolean; corTexto: string; corCartao: string;
  onLongPress?: () => void; erroTexto: string;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const ext = (caminho.split('.').pop() ?? '').toLowerCase();
  const icone: { nome: keyof typeof Ionicons.glyphMap; cor: string } =
    ext === 'pdf' ? { nome: 'document-text', cor: '#E5322D' } :
    ext === 'doc' || ext === 'docx' ? { nome: 'document-text', cor: '#2B579A' } :
    ext === 'xls' || ext === 'xlsx' ? { nome: 'grid', cor: '#217346' } :
    ext === 'ppt' || ext === 'pptx' ? { nome: 'easel', cor: '#D24726' } :
    ext === 'zip' ? { nome: 'archive', cor: '#8C8799' } :
    { nome: 'document', cor: '#8C8799' };
  return (
    <TouchableOpacity
      onPress={async () => { if (abrindo) return; setAbrindo(true); await abrir(caminho, erroTexto); setAbrindo(false); }}
      onLongPress={onLongPress}
      delayLongPress={300}
      activeOpacity={0.85}
      style={[st.doc, { backgroundColor: corCartao }]}
    >
      <View style={[st.docIcone, { backgroundColor: minha ? '#fff' : 'transparent' }]}>
        <Ionicons name={icone.nome} size={26} color={icone.cor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[st.docNome, { color: corTexto }]} numberOfLines={2}>{nome}</Text>
        <Text style={[st.docSub, { color: corTexto, opacity: 0.7 }]}>
          {[ext.toUpperCase(), formatarTamanho(tamanho)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {abrindo ? <ActivityIndicator size="small" color={corTexto} /> : <Ionicons name="open-outline" size={17} color={corTexto} style={{ opacity: 0.7 }} />}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  midia: { borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  video: { backgroundColor: '#14112E' },
  play: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center' },
  tempo: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  tempoTexto: { color: '#fff', fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 10, width: 230, marginTop: 2 },
  docIcone: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  docNome: { fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
  docSub: { fontSize: 11.5, marginTop: 2 },
  audioNome: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 220 },
  audioNomeTexto: { fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  cheiaFundo: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  cheiaImg: { width: '100%', height: '100%' },
  cheiaFechar: { position: 'absolute', top: 56, right: 18 },
});
