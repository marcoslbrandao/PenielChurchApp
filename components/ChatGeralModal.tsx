import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Image, Pressable,
  KeyboardAvoidingView, Platform, Modal, ActivityIndicator, Alert, StatusBar, Keyboard, Linking, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { apagarLinha } from '../lib/db';
import { useTheme } from '../lib/theme';
import { separarLinks, soLinkDeImagem } from '../lib/links';
import { extractYoutubeId, youtubeThumbnail } from '../lib/youtube';
import { binarioPodeGravarAudio } from '../lib/recursosNativos';
import TextoComLinks from './TextoComLinks';
import AudioMensagem from './AudioMensagem';
import GravadorAudio from './GravadorAudio';
import {
  type MensagemGeral, type Reacao, REACOES,
  enviarArquivo, formatoDaImagem, urlDaMidia, urlGuardada, preCarregarUrls, apagarMidia,
  marcarComoLido, horaCurta, chaveDoDia, rotuloDoDia,
  VIDEO_MAX_SEGUNDOS, VIDEO_MAX_MB, ARQUIVO_MAX_MB,
  formatoDoArquivo, anexoEhAudio, formatarTamanho, binarioTemSeletorDeArquivos, escolherArquivo, tamanhoLocal,
  prepararImagem, type ArquivoEscolhido, type Compartilhado,
} from '../lib/chatGeral';
import { formatarTempo, duracaoDoAudio } from '../lib/chatAudio';
import RegrasDoChat from './RegrasDoChat';
import { useFolgaDoTeclado } from '../lib/folgaDoTeclado';
import { useModeracaoChat, denunciarMensagem, barrarSeOfensivo } from '../lib/moderacao';

// ─── Chat da Igreja ──────────────────────────────────────────────────────────
// O chat geral dos membros, aberto pelo card da Home. Funciona como o WhatsApp:
// texto e emoji (teclado do celular), fotos/memes/GIFs, vídeos de até 2 min,
// anexos (áudio baixado, PDF, documentos — 13/10/2026), mensagem de voz,
// links com prévia (YouTube com miniatura), reações, responder e apagar.
//
// Quem pode o quê é decidido no BANCO (migração 20261011090000): só membros
// leem e escrevem; o autor apaga a própria mensagem; o Admin apaga qualquer
// uma, vê denúncias e silencia. Esta tela só reflete isso.

const COR = '#6A55E0';

function paletaChat(isDark: boolean) {
  return isDark ? {
    bg: '#0E0B22', bubbleOtherBg: '#1C1940', bubbleOtherBorder: '#332D5C',
    text: '#F1EFFA', textMuted: '#A69FD6', inputBg: '#241F4D', inputBarBg: '#1C1940',
    inputBarBorder: '#332D5C', emptyIcon: '#4A4478', placeholder: '#726A99',
    sheetBg: '#1C1940', chipBg: '#241F4D', diaBg: 'rgba(255,255,255,0.08)',
  } : {
    bg: '#F7F4EE', bubbleOtherBg: '#FFFFFF', bubbleOtherBorder: '#E5E0D8',
    text: '#1A1A2E', textMuted: '#8C8799', inputBg: '#F0EDE8', inputBarBg: '#FFFFFF',
    inputBarBorder: '#E5E0D8', emptyIcon: '#C9C4E8', placeholder: '#9CA3AF',
    sheetBg: '#FFFFFF', chipBg: '#F0EDE8', diaBg: 'rgba(26,26,46,0.07)',
  };
}
type PaletaChat = ReturnType<typeof paletaChat>;

type Linha =
  | { tipo: 'dia'; id: string; rotulo: string }
  | { tipo: 'msg'; id: string; msg: MensagemGeral };

// Foto/vídeo/arquivo que vai subir: vem da galeria, do seletor de arquivos ou
// do menu Compartilhar do celular (components/RecebeCompartilhamento.tsx).
type MidiaLocal = {
  uri: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  fileSize?: number | null;
};

export default function ChatGeralModal({
  visible, userId, ehAdmin, onClose, compartilhado, onCompartilhadoUsado,
}: {
  visible: boolean;
  userId: string;
  ehAdmin: boolean;
  onClose: () => void;
  /** Veio de outro app pelo menu Compartilhar: fica pronto para enviar. */
  compartilhado?: Compartilhado | null;
  /** Avisado quando o conteúdo compartilhado já foi aplicado à tela. */
  onCompartilhadoUsado?: () => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paletaChat(isDark), [isDark]);
  const cs = useMemo(() => buildStyles(C), [C]);

  const [mensagens, setMensagens] = useState<MensagemGeral[]>([]);
  const [reacoes, setReacoes] = useState<Reacao[]>([]);
  const [denuncias, setDenuncias] = useState<Record<string, number>>({});
  const [silenciados, setSilenciados] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [respondendo, setRespondendo] = useState<MensagemGeral | null>(null);
  const [menuDe, setMenuDe] = useState<MensagemGeral | null>(null);
  // "Reações e visualizações" de uma mensagem (16/10/2026).
  const [infoDe, setInfoDe] = useState<MensagemGeral | null>(null);
  const abrirInfo = (m: MensagemGeral) => {
    setMenuDe(null);
    // Espera o menu fechar: dois Modals trocando juntos travam no iPhone.
    setTimeout(() => setInfoDe(m), 350);
  };
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);
  const [audioAtivo, setAudioAtivo] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const podeGravar = useMemo(() => binarioPodeGravarAudio(), []);
  const podeAnexarArquivo = useMemo(() => binarioTemSeletorDeArquivos(), []);
  const inputRef = useRef<TextInput>(null);

  const euSilenciado = silenciados.has(userId);
  // Moderação (17/10/2026, diretriz 1.2 da Apple): Denunciar e Bloquear
  // voltaram ao menu, Regras da comunidade antes de entrar, filtro de
  // palavras no envio. Silenciar = suspender de TODOS os chats.
  const mod = useModeracaoChat(userId, visible);
  // Arquivo recebido pelo menu Compartilhar, esperando o toque em Enviar.
  const [pendente, setPendente] = useState<Compartilhado['arquivo'] | null>(null);
  const mostrarMic = podeGravar && !pendente && (gravando || !texto.trim());

  useEffect(() => {
    if (!visible || !compartilhado) return;
    if (compartilhado.texto) setTexto(tx => (tx.trim() ? `${tx} ${compartilhado.texto}` : compartilhado.texto!));
    setPendente(compartilhado.arquivo ?? null);
    onCompartilhadoUsado?.();
  }, [visible, compartilhado]);

  // Safe area à mão dentro do <Modal> (ver GrupoChatModal: o SafeAreaView
  // mede a view nativa do modal e volta 0 no iOS).
  const insets = useSafeAreaInsets();
  // Android com edge-to-edge (app.json `edgeToEdgeEnabled`): o <Modal> também
  // desenha por baixo da barra de status e da barra de navegação do sistema.
  // Com respiro fixo, a barra de digitar/gravar ficava escondida atrás dos
  // botões do Android (11/10/2026). Agora os dois sistemas usam o inset real.
  const padTop = Platform.OS === 'ios' ? Math.max(insets.top, 20) : Math.max(insets.top, 12);
  const [tecladoAberto, setTecladoAberto] = useState(false);
  useEffect(() => {
    const mostrar = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const esconder = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(mostrar, () => setTecladoAberto(true));
    const s2 = Keyboard.addListener(esconder, () => setTecladoAberto(false));
    return () => { s1.remove(); s2.remove(); };
  }, []);
  const padBottom = tecladoAberto ? 0 : Math.max(insets.bottom, 10);
  // Android edge-to-edge: ver lib/folgaDoTeclado.ts (17/10/2026).
  const areaRef = useRef<View>(null);
  const folgaTeclado = useFolgaDoTeclado(areaRef, visible);

  // ── Carregar ──────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    const [msgs, reac, sil] = await Promise.all([
      supabase.from('chat_geral_mensagens').select('*')
        // DESC + reverse: `limit` corta pelo começo da ordenação.
        .order('created_at', { ascending: false }).limit(500),
      supabase.from('chat_geral_reacoes').select('mensagem_id, user_id, emoji').limit(5000),
      supabase.from('chat_geral_silenciados').select('user_id'),
    ]);
    const lista = ((msgs.data ?? []) as MensagemGeral[]).reverse();
    setMensagens(lista);
    setReacoes((reac.data ?? []) as Reacao[]);
    setSilenciados(new Set(((sil.data ?? []) as { user_id: string }[]).map(r => r.user_id)));
    if (ehAdmin) {
      const { data } = await supabase.from('chat_denuncias').select('mensagem_id').eq('chat', 'geral').eq('status', 'aberta');
      const cont: Record<string, number> = {};
      for (const d of (data ?? []) as { mensagem_id: string }[]) cont[d.mensagem_id] = (cont[d.mensagem_id] ?? 0) + 1;
      setDenuncias(cont);
    }
    // As fotos da conversa pedem as URLs de uma vez, não uma por bolha.
    const fotos = lista.filter(m => m.tipo === 'imagem' && m.midia_path).map(m => m.midia_path as string);
    await preCarregarUrls(fotos.slice(-60)).catch(() => {});
    setLoading(false);
    marcarComoLido();
  }, [ehAdmin]);

  useEffect(() => {
    if (!visible) return;
    carregar();

    const canal = supabase
      .channel('chat_geral')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_geral_mensagens' }, (payload) => {
        const nova = payload.new as MensagemGeral;
        setMensagens(prev => (prev.some(m => m.id === nova.id) ? prev : [...prev, nova]));
        marcarComoLido();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_geral_mensagens' }, (payload) => {
        const id = (payload.old as { id: string }).id;
        setMensagens(prev => prev.filter(m => m.id !== id));
        setReacoes(prev => prev.filter(r => r.mensagem_id !== id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_geral_reacoes' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as Partial<Reacao>;
          setReacoes(prev => prev.filter(r => !(r.mensagem_id === old.mensagem_id && r.user_id === old.user_id)));
        } else {
          const r = payload.new as Reacao;
          setReacoes(prev => [...prev.filter(x => !(x.mensagem_id === r.mensagem_id && x.user_id === r.user_id)), r]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [visible, carregar]);

  const fechar = () => {
    setAudioAtivo(null);
    setPendente(null);
    setRespondendo(null);
    setMenuDe(null);
    marcarComoLido().finally(onClose);
  };

  // ── Linhas da lista (invertida: a mais nova fica embaixo) ─────────────────
  const linhas = useMemo<Linha[]>(() => {
    const asc: Linha[] = [];
    let diaAnterior = '';
    for (const m of mensagens) {
      if (mod.bloqueados.has(m.autor_id)) continue;
      const dia = chaveDoDia(m.created_at);
      if (dia !== diaAnterior) {
        asc.push({ tipo: 'dia', id: 'dia-' + dia, rotulo: rotuloDoDia(m.created_at, t('chatGeral.hoje'), t('chatGeral.ontem')) });
        diaAnterior = dia;
      }
      asc.push({ tipo: 'msg', id: m.id, msg: m });
    }
    return asc.reverse();
  }, [mensagens, t, mod.bloqueados]);

  const porId = useMemo(() => {
    const mapa = new Map<string, MensagemGeral>();
    for (const m of mensagens) mapa.set(m.id, m);
    return mapa;
  }, [mensagens]);

  const reacoesPorMsg = useMemo(() => {
    const mapa = new Map<string, { emoji: string; n: number; minha: boolean }[]>();
    for (const r of reacoes) {
      const lista = mapa.get(r.mensagem_id) ?? [];
      const item = lista.find(x => x.emoji === r.emoji);
      if (item) { item.n++; item.minha = item.minha || r.user_id === userId; }
      else lista.push({ emoji: r.emoji, n: 1, minha: r.user_id === userId });
      mapa.set(r.mensagem_id, lista);
    }
    return mapa;
  }, [reacoes, userId]);

  // ── Enviar ────────────────────────────────────────────────────────────────
  const inserir = async (linha: Partial<MensagemGeral>) => {
    const { data, error } = await supabase
      .from('chat_geral_mensagens')
      .insert({ ...linha, resposta_a: respondendo?.id ?? null })
      .select('*')
      .single();
    if (error) throw error;
    const nova = data as MensagemGeral;
    setMensagens(prev => (prev.some(m => m.id === nova.id) ? prev : [...prev, nova]));
    setRespondendo(null);
  };

  const enviarTexto = async () => {
    const tx = texto.trim();
    if (!tx || enviando) return;
    if (barrarSeOfensivo(tx, t)) return;
    setEnviando(true);
    try {
      await inserir({ tipo: 'texto', texto: tx });
      setTexto('');
    } catch (e: any) {
      Alert.alert(t('chatGeral.erroEnviar'), e?.message ?? t('chatGeral.erroEnviarTexto'));
    } finally {
      setEnviando(false);
    }
  };

  const enviarImagem = async (asset: MidiaLocal): Promise<boolean> => {
    setEnviando(true);
    let caminho: string | null = null;
    try {
      // HEIC do iPhone vira JPEG (o Android não mostra HEIC).
      const img = await prepararImagem(asset.uri, asset.mimeType);
      const { ext, contentType } = formatoDaImagem(img.mimeType, img.uri);
      caminho = await enviarArquivo(img.uri, userId, ext, contentType);
      // O que estiver escrito no campo vai junto, como legenda.
      const legenda = texto.trim();
      await inserir({
        tipo: 'imagem', texto: legenda, midia_path: caminho,
        midia_largura: img.width ?? asset.width ?? null, midia_altura: img.height ?? asset.height ?? null,
      });
      if (legenda) setTexto('');
      return true;
    } catch (e: any) {
      if (caminho) apagarMidia(caminho);
      Alert.alert(t('chatGeral.erroEnviar'), e?.message ?? t('chatGeral.erroEnviarTexto'));
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const erroDeEnvio = (e: any) =>
    Alert.alert(t('chatGeral.erroEnviar'), e?.message ?? t('chatGeral.erroEnviarTexto'));

  // Vídeo da galeria: até 5 minutos e 50 MB (limite do Supabase). No iPhone o
  // sistema converte para H.264 em qualidade média (~480p), que toca em
  // qualquer celular: 5 min ficam em ~20–30 MB. 720p estourava os 50 MB.
  const enviarVideo = async (asset: MidiaLocal): Promise<boolean> => {
    const duracaoMs = Math.round(asset.duration ?? 0);
    if (duracaoMs > VIDEO_MAX_SEGUNDOS * 1000 + 4000) {
      Alert.alert(t('chatGeral.videoLongoTitulo'), t('chatGeral.videoLongo'));
      return false;
    }
    const tamanho = asset.fileSize ?? (await tamanhoLocal(asset.uri));
    if (tamanho && tamanho > VIDEO_MAX_MB * 1024 * 1024) {
      Alert.alert(t('chatGeral.arquivoGrandeTitulo'), t('chatGeral.arquivoGrande', { mb: VIDEO_MAX_MB }));
      return false;
    }
    const doUri = asset.uri.split('?')[0].split('.').pop()?.toLowerCase();
    const ehMov = doUri === 'mov' || (asset.mimeType ?? '').includes('quicktime');
    setEnviando(true);
    let caminho: string | null = null;
    try {
      caminho = await enviarArquivo(asset.uri, userId, ehMov ? 'mov' : 'mp4', ehMov ? 'video/quicktime' : 'video/mp4');
      const legenda = texto.trim();
      await inserir({
        tipo: 'video', texto: legenda, midia_path: caminho,
        midia_largura: asset.width || null, midia_altura: asset.height || null,
        duracao_ms: Math.min(VIDEO_MAX_SEGUNDOS * 1000 + 5000, Math.max(1, duracaoMs || 1)),
      });
      if (legenda) setTexto('');
      return true;
    } catch (e: any) {
      if (caminho) apagarMidia(caminho);
      erroDeEnvio(e);
      return false;
    } finally {
      setEnviando(false);
    }
  };

  // Anexo: áudio baixado (mp3 do Presenter Diário etc.), PDF, Word, Excel...
  const enviarDocumento = async (arq: ArquivoEscolhido, apagarLocal: boolean): Promise<boolean> => {
    const formato = formatoDoArquivo(arq.nome, arq.mime);
    if (!formato) {
      Alert.alert(t('chatGeral.formatoNaoAceitoTitulo'), t('chatGeral.formatoNaoAceito'));
      return false;
    }
    const tamanho = arq.tamanho ?? (await tamanhoLocal(arq.uri));
    if (!tamanho) { erroDeEnvio(null); return false; }
    if (tamanho > ARQUIVO_MAX_MB * 1024 * 1024) {
      Alert.alert(t('chatGeral.arquivoGrandeTitulo'), t('chatGeral.arquivoGrande', { mb: ARQUIVO_MAX_MB }));
      return false;
    }
    setEnviando(true);
    let caminho: string | null = null;
    try {
      // Áudio: mede antes de subir (o arquivo local pode ser apagado no envio).
      const duracao = formato.contentType.startsWith('audio/') ? await duracaoDoAudio(arq.uri) : null;
      caminho = await enviarArquivo(arq.uri, userId, formato.ext, formato.contentType, apagarLocal);
      const legenda = texto.trim();
      await inserir({
        tipo: 'arquivo', texto: legenda, midia_path: caminho,
        midia_nome: arq.nome.slice(0, 200), midia_tamanho: tamanho, midia_mime: formato.contentType,
        duracao_ms: duracao,
      });
      if (legenda) setTexto('');
      return true;
    } catch (e: any) {
      if (caminho) apagarMidia(caminho);
      erroDeEnvio(e);
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const anexarArquivo = async () => {
    let arq;
    try {
      arq = await escolherArquivo();
    } catch (e: any) {
      erroDeEnvio(e);
      return;
    }
    if (arq) enviarDocumento(arq, true);
  };

  // Envia o que chegou pelo menu Compartilhar (o texto do campo vai de legenda).
  const enviarPendente = async () => {
    const a = pendente;
    if (!a || enviando) return;
    if (barrarSeOfensivo(texto, t)) return;
    const mime = (a.mime ?? '').toLowerCase();
    const midia: MidiaLocal = {
      uri: a.uri, mimeType: a.mime, width: a.largura, height: a.altura,
      duration: a.duracaoMs, fileSize: a.tamanho,
    };
    const ok = /^image\/(jpeg|jpg|png|gif|webp|heic|heif)$/.test(mime)
      ? await enviarImagem(midia)
      : mime.startsWith('video/')
        ? await enviarVideo(midia)
        : await enviarDocumento({ uri: a.uri, nome: a.nome, tamanho: a.tamanho, mime: a.mime }, false);
    if (ok) setPendente(null);
  };

  const escolherDaGaleria = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
      videoMaxDuration: VIDEO_MAX_SEGUNDOS,
    });
    const a = !r.canceled ? r.assets?.[0] : undefined;
    if (!a) return;
    if (a.type === 'video') enviarVideo(a); else enviarImagem(a);
  };

  const tirarFoto = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) {
      Alert.alert(t('chatGeral.permissaoCamera'), undefined, [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('perfil.abrirAjustes'), onPress: () => { Linking.openSettings().catch(() => {}); } },
      ]);
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets?.[0]) enviarImagem(r.assets[0]);
  };

  const anexar = () => {
    Keyboard.dismiss();
    if (barrarSeOfensivo(texto, t)) return;
    Alert.alert(t('chatGeral.titulo'), undefined, [
      { text: t('chatGeral.galeria'), onPress: escolherDaGaleria },
      { text: t('chatGeral.camera'), onPress: tirarFoto },
      // Só nos binários com o seletor de arquivos (1.5.0+).
      ...(podeAnexarArquivo ? [{ text: t('chatGeral.arquivoOpcao'), onPress: anexarArquivo }] : []),
      { text: t('common.cancelar'), style: 'cancel' as const },
    ]);
  };

  const enviarGravacao = async (uri: string, duracaoMs: number) => {
    setEnviando(true);
    let caminho: string | null = null;
    try {
      caminho = await enviarArquivo(uri, userId, 'm4a', 'audio/mp4', true);
      await inserir({ tipo: 'audio', texto: '', midia_path: caminho, duracao_ms: Math.max(1, Math.round(duracaoMs)) });
    } catch (e: any) {
      if (caminho) apagarMidia(caminho);
      Alert.alert(t('chatGeral.erroEnviar'), e?.message ?? t('chatGeral.erroEnviarTexto'));
    } finally {
      setEnviando(false);
    }
  };

  // ── Ações do menu (segurar a mensagem) ────────────────────────────────────
  const reagir = async (msg: MensagemGeral, emoji: string) => {
    setMenuDe(null);
    const minha = reacoes.find(r => r.mensagem_id === msg.id && r.user_id === userId);
    if (minha?.emoji === emoji) {
      setReacoes(prev => prev.filter(r => !(r.mensagem_id === msg.id && r.user_id === userId)));
      await supabase.from('chat_geral_reacoes').delete().eq('mensagem_id', msg.id).eq('user_id', userId);
    } else {
      setReacoes(prev => [...prev.filter(r => !(r.mensagem_id === msg.id && r.user_id === userId)), { mensagem_id: msg.id, user_id: userId, emoji }]);
      await supabase.from('chat_geral_reacoes').upsert({ mensagem_id: msg.id, user_id: userId, emoji }, { onConflict: 'mensagem_id,user_id' });
    }
  };

  const responder = (msg: MensagemGeral) => {
    setMenuDe(null);
    setRespondendo(msg);
    setTimeout(() => inputRef.current?.focus(), 250);
  };

  const apagar = (msg: MensagemGeral) => {
    setMenuDe(null);
    Alert.alert(t('chatGeral.apagarTitulo'), t('chatGeral.apagarTexto'), [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('chatGeral.apagar'), style: 'destructive', onPress: async () => {
          const ok = await apagarLinha('chat_geral_mensagens', msg.id);
          if (!ok) return;
          setMensagens(prev => prev.filter(m => m.id !== msg.id));
          if (msg.midia_path) apagarMidia(msg.midia_path);
        },
      },
    ]);
  };

  const denunciar = (msg: MensagemGeral) => {
    setMenuDe(null);
    // Espera o menu fechar: Alert junto com o fechamento do Modal some no iPhone.
    setTimeout(() => denunciarMensagem('geral', msg.id, t), 350);
  };

  const bloquear = (msg: MensagemGeral) => {
    setMenuDe(null);
    setTimeout(() => mod.bloquear(msg.autor_id, msg.autor_nome, t), 350);
  };

  const alternarSilencio = (msg: MensagemGeral) => {
    setMenuDe(null);
    const nome = msg.autor_nome;
    if (silenciados.has(msg.autor_id)) {
      supabase.from('chat_geral_silenciados').delete().eq('user_id', msg.autor_id).then(({ error }) => {
        if (error) { Alert.alert(t('common.erro'), error.message); return; }
        setSilenciados(prev => { const n = new Set(prev); n.delete(msg.autor_id); return n; });
      });
      return;
    }
    Alert.alert(t('moderacao.suspenderTitulo'), t('moderacao.suspenderTexto', { nome }), [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('moderacao.suspender'), style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('chat_geral_silenciados').insert({ user_id: msg.autor_id });
          if (error) { Alert.alert(t('common.erro'), error.message); return; }
          setSilenciados(prev => new Set(prev).add(msg.autor_id));
        },
      },
    ]);
  };

  // ── Resumo de uma mensagem (citação da resposta) ──────────────────────────
  const resumo = (m: MensagemGeral) => {
    if (m.tipo === 'imagem') return m.texto ? `${t('chatGeral.foto')} · ${m.texto}` : t('chatGeral.foto');
    if (m.tipo === 'audio') return t('chatGeral.audio');
    if (m.tipo === 'video') return m.texto ? `${t('chatGeral.video')} · ${m.texto}` : t('chatGeral.video');
    if (m.tipo === 'arquivo') return `${anexoEhAudio(m) ? '🎵' : '📎'} ${m.midia_nome ?? t('chatGeral.arquivo')}`;
    return m.texto;
  };

  // ── Bolha ─────────────────────────────────────────────────────────────────
  const renderMensagem = (m: MensagemGeral) => {
    const minha = m.autor_id === userId;
    const corTexto = minha ? '#fff' : C.text;
    const original = m.resposta_a ? porId.get(m.resposta_a) : null;
    const chips = reacoesPorMsg.get(m.id) ?? [];
    const nDen = denuncias[m.id] ?? 0;
    // Foto e vídeo ocupam a bolha toda (sem o respiro do texto).
    const ehFoto = m.tipo === 'imagem' || (m.tipo === 'video' && !!m.midia_path);

    return (
      <View style={[cs.bubbleRow, minha && cs.bubbleRowMine]}>
        <View style={{ maxWidth: '80%', alignItems: minha ? 'flex-end' : 'flex-start' }}>
          <Pressable
            onLongPress={() => { Keyboard.dismiss(); setMenuDe(m); }}
            delayLongPress={300}
            style={[cs.bubble, minha ? { backgroundColor: COR } : cs.bubbleOther, ehFoto && cs.bubbleFoto]}
          >
            {!minha && (
              <Text style={[cs.autorNome, ehFoto && { paddingHorizontal: 8, paddingTop: 4 }]}>
                {m.autor_nome}
              </Text>
            )}

            {m.resposta_a && (
              <View style={[cs.citacao, { backgroundColor: minha ? 'rgba(255,255,255,0.18)' : C.chipBg }, ehFoto && { margin: 4 }]}>
                <Text style={[cs.citacaoNome, { color: minha ? '#fff' : COR }]} numberOfLines={1}>
                  {original ? (original.autor_id === userId ? t('chatGeral.voce') : original.autor_nome) : t('chatGeral.mensagemAnterior')}
                </Text>
                {original && (
                  <Text style={[cs.citacaoTexto, { color: minha ? 'rgba(255,255,255,0.85)' : C.textMuted }]} numberOfLines={2}>
                    {resumo(original)}
                  </Text>
                )}
              </View>
            )}

            {m.tipo === 'imagem' && m.midia_path ? (
              <FotoDaMensagem
                caminho={m.midia_path}
                largura={m.midia_largura}
                altura={m.midia_altura}
                onAbrir={url => setFotoAberta(url)}
                onLongPress={() => setMenuDe(m)}
              />
            ) : m.tipo === 'audio' && m.midia_path ? (
              <AudioMensagem
                caminho={m.midia_path}
                duracaoMs={m.duracao_ms}
                ativo={audioAtivo === m.id}
                onAtivar={() => setAudioAtivo(m.id)}
                onTerminar={() => setAudioAtivo(a => (a === m.id ? null : a))}
                corTexto={corTexto}
                corTrilho={minha ? 'rgba(255,255,255,0.35)' : C.bubbleOtherBorder}
                corProgresso={minha ? '#fff' : COR}
                onLongPress={() => setMenuDe(m)}
                obterUrl={urlDaMidia}
              />
            ) : m.tipo === 'video' && m.midia_path ? (
              <VideoDaMensagem
                caminho={m.midia_path}
                largura={m.midia_largura}
                altura={m.midia_altura}
                duracaoMs={m.duracao_ms}
                onLongPress={() => setMenuDe(m)}
                erroTexto={t('chatGeral.abrirErro')}
              />
            ) : m.tipo === 'arquivo' && m.midia_path && anexoEhAudio(m) ? (
              <View style={{ gap: 4 }}>
                <View style={st.anexoAudioNome}>
                  <Ionicons name="musical-notes" size={13} color={minha ? 'rgba(255,255,255,0.85)' : COR} />
                  <Text style={[st.anexoAudioTexto, { color: corTexto }]} numberOfLines={2}>{m.midia_nome}</Text>
                </View>
                <AudioMensagem
                  caminho={m.midia_path}
                  duracaoMs={m.duracao_ms}
                  ativo={audioAtivo === m.id}
                  onAtivar={() => setAudioAtivo(m.id)}
                  onTerminar={() => setAudioAtivo(a => (a === m.id ? null : a))}
                  corTexto={corTexto}
                  corTrilho={minha ? 'rgba(255,255,255,0.35)' : C.bubbleOtherBorder}
                  corProgresso={minha ? '#fff' : COR}
                  onLongPress={() => setMenuDe(m)}
                  obterUrl={urlDaMidia}
                />
              </View>
            ) : m.tipo === 'arquivo' && m.midia_path ? (
              <ArquivoDaMensagem
                caminho={m.midia_path}
                nome={m.midia_nome ?? t('chatGeral.arquivo')}
                tamanho={m.midia_tamanho ?? null}
                minha={minha}
                C={C}
                onLongPress={() => setMenuDe(m)}
                erroTexto={t('chatGeral.abrirErro')}
              />
            ) : m.tipo === 'video' ? (
              <Text style={[cs.bubbleText, { color: corTexto }]}>{t('chatGeral.video')}</Text>
            ) : null}

            {!!m.texto && (
              <View style={ehFoto ? { paddingHorizontal: 8, paddingTop: 6 } : undefined}>
                <TextoComLinks
                  texto={m.texto}
                  style={[cs.bubbleText, { color: corTexto }]}
                  corLink={minha ? '#fff' : COR}
                  onLongPress={() => setMenuDe(m)}
                />
              </View>
            )}
            {m.tipo === 'texto' && !soLinkDeImagem(m.texto) && <PreviaLink texto={m.texto} minha={minha} C={C} />}

            <Text style={[cs.hora, { color: minha ? 'rgba(255,255,255,0.7)' : C.textMuted }, ehFoto && { paddingHorizontal: 8, paddingBottom: 4 }]}>
              {horaCurta(m.created_at)}
            </Text>
          </Pressable>

          {(chips.length > 0 || (ehAdmin && nDen > 0)) && (
            <View style={[cs.chips, minha && { justifyContent: 'flex-end' }]}>
              {chips.map(c => (
                <TouchableOpacity
                  key={c.emoji}
                  onPress={() => reagir(m, c.emoji)}
                  onLongPress={() => setInfoDe(m)}
                  delayLongPress={300}
                  style={[cs.chip, { backgroundColor: C.chipBg }, c.minha && { borderColor: COR }]}
                >
                  <Text style={cs.chipEmoji}>{c.emoji}</Text>
                  {c.n > 1 && <Text style={[cs.chipN, { color: C.textMuted }]}>{c.n}</Text>}
                </TouchableOpacity>
              ))}
              {ehAdmin && nDen > 0 && (
                <View style={[cs.chip, { backgroundColor: 'rgba(232,75,26,0.14)', borderColor: '#E84B1A' }]}>
                  <Ionicons name="flag" size={11} color="#E84B1A" />
                  <Text style={[cs.chipN, { color: '#E84B1A' }]}>{t('chatGeral.denuncias', { n: nDen })}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  const podeApagar = (m: MensagemGeral) => m.autor_id === userId || ehAdmin;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={fechar}>
      <View style={cs.safe}>
        <StatusBar barStyle="light-content" />
        <View style={[cs.header, { paddingTop: padTop + 10 }]}>
          <TouchableOpacity onPress={fechar} style={cs.headerBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={cs.headerTitle} numberOfLines={1}>{t('chatGeral.titulo')}</Text>
            <Text style={cs.headerSub} numberOfLines={1}>{t('chatGeral.subtitulo')}</Text>
          </View>
          <TouchableOpacity onPress={() => Alert.alert(t('chatGeral.titulo'), t('chatGeral.aviso15dias'))} hitSlop={10} style={cs.headerBtn}>
            <Ionicons name="information-circle-outline" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>

        <View ref={areaRef} collapsable={false} style={{ flex: 1, paddingBottom: folgaTeclado }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {loading ? (
            <View style={{ flex: 1 }}><ActivityIndicator color={COR} style={{ marginTop: 30 }} /></View>
          ) : linhas.length === 0 ? (
            <View style={cs.emptyWrap}>
              <Ionicons name="chatbubbles-outline" size={44} color={C.emptyIcon} />
              <Text style={cs.emptyText}>{t('chatGeral.vazio')}</Text>
              <Text style={[cs.emptyText, { fontSize: 12, marginTop: 6 }]}>{t('chatGeral.aviso15dias')}</Text>
            </View>
          ) : (
            <FlatList
              inverted
              data={linhas}
              keyExtractor={l => l.id}
              contentContainerStyle={cs.list}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={
                <View style={cs.aviso}>
                  <Ionicons name="time-outline" size={13} color={C.textMuted} />
                  <Text style={cs.avisoTexto}>{t('chatGeral.aviso15dias')}</Text>
                </View>
              }
              renderItem={({ item }) => item.tipo === 'dia' ? (
                <View style={cs.diaWrap}>
                  <Text style={[cs.dia, { backgroundColor: C.diaBg }]}>{item.rotulo}</Text>
                </View>
              ) : renderMensagem(item.msg)}
            />
          )}

          {pendente && (
            <View style={cs.respondendoBar}>
              <View style={[cs.respondendoFaixa, { backgroundColor: '#2BB673' }]} />
              <Ionicons
                name={(pendente.mime ?? '').startsWith('image/') ? 'image' : (pendente.mime ?? '').startsWith('video/') ? 'videocam' : (pendente.mime ?? '').startsWith('audio/') ? 'musical-notes' : 'document-text'}
                size={22}
                color={COR}
              />
              <View style={{ flex: 1 }}>
                <Text style={cs.respondendoNome} numberOfLines={1}>{t('chatGeral.prontoParaEnviar')}</Text>
                <Text style={cs.respondendoTexto} numberOfLines={1}>
                  {[pendente.nome, formatarTamanho(pendente.tamanho)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPendente(null)} hitSlop={10} disabled={enviando}>
                <Ionicons name="close" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {respondendo && (
            <View style={cs.respondendoBar}>
              <View style={cs.respondendoFaixa} />
              <View style={{ flex: 1 }}>
                <Text style={cs.respondendoNome} numberOfLines={1}>
                  {t('chatGeral.respondendoA', { nome: respondendo.autor_id === userId ? t('chatGeral.voce') : respondendo.autor_nome })}
                </Text>
                <Text style={cs.respondendoTexto} numberOfLines={1}>{resumo(respondendo)}</Text>
              </View>
              <TouchableOpacity onPress={() => setRespondendo(null)} hitSlop={10}>
                <Ionicons name="close" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {euSilenciado ? (
            <View style={[cs.inputRow, { paddingBottom: 10 + padBottom, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="volume-mute-outline" size={16} color={C.textMuted} />
              <Text style={cs.silenciadoTexto}>{t('moderacao.suspensoAviso')}</Text>
            </View>
          ) : (
            <View style={[cs.inputRow, { paddingBottom: 10 + padBottom }]}>
              {!gravando && (
                <TouchableOpacity onPress={anexar} style={cs.anexarBtn} disabled={enviando} hitSlop={6}>
                  <Ionicons name="add-circle-outline" size={28} color={COR} />
                </TouchableOpacity>
              )}
              {!gravando && (
                <TextInput
                  ref={inputRef}
                  style={cs.input}
                  placeholder={t('chatGeral.placeholder')}
                  placeholderTextColor={C.placeholder}
                  value={texto}
                  onChangeText={setTexto}
                  multiline
                  maxLength={2000}
                />
              )}
              {/* Campo vazio: o botão vira microfone, como no WhatsApp. O
                  gravador fica SEMPRE montado (só escondido) — montar e
                  desmontar a cada letra criava e liberava o gravador nativo
                  a cada toque, e foi no desmonte que o app fechava. */}
              {podeGravar && (
                <View style={(mostrarMic && !enviando) ? (gravando ? cs.gravadorAberto : undefined) : { display: 'none' }}>
                  <GravadorAudio
                    cor={COR}
                    corTexto={C.text}
                    corFundo={C.inputBg}
                    onComecar={() => { setAudioAtivo(null); Keyboard.dismiss(); }}
                    onGravado={enviarGravacao}
                    onGravandoMudou={setGravando}
                  />
                </View>
              )}
              {enviando ? (
                <View style={[cs.sendBtn, { opacity: 0.6 }]}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : mostrarMic ? null : (
                <TouchableOpacity
                  style={[cs.sendBtn, { opacity: pendente || texto.trim() ? 1 : 0.5 }]}
                  onPress={pendente ? enviarPendente : enviarTexto}
                  disabled={!pendente && !texto.trim()}
                >
                  <Ionicons name="send" size={17} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </KeyboardAvoidingView>
        </View>

        {/* ── Menu ao segurar a mensagem ─────────────────────────────────── */}
        <Modal visible={!!menuDe} transparent animationType="fade" onRequestClose={() => setMenuDe(null)}>
          <Pressable style={cs.menuFundo} onPress={() => setMenuDe(null)}>
            {menuDe && (
              <Pressable style={cs.menu} onPress={() => {}}>
                <View style={cs.menuReacoes}>
                  {REACOES.map(e => (
                    <TouchableOpacity key={e} onPress={() => reagir(menuDe, e)} style={cs.menuReacao}>
                      <Text style={{ fontSize: 28 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {!euSilenciado && (
                  <ItemMenu icone="arrow-undo-outline" texto={t('chatGeral.responder')} cor={C.text} onPress={() => responder(menuDe)} />
                )}
                <ItemMenu
                  icone="information-circle-outline"
                  texto={menuDe.autor_id === userId || ehAdmin ? t('chatGeral.info') : t('chatGeral.infoReacoes')}
                  cor={C.text}
                  onPress={() => abrirInfo(menuDe)}
                />
                {podeApagar(menuDe) && (
                  <ItemMenu icone="trash-outline" texto={t('chatGeral.apagar')} cor="#E84B1A" onPress={() => apagar(menuDe)} />
                )}
                {/* Denunciar e Bloquear voltaram (17/10/2026): exigência da
                    diretriz 1.2 da Apple. Apagar continua só autor e admin. */}
                {menuDe.autor_id !== userId && (
                  <ItemMenu icone="flag-outline" texto={t('moderacao.denunciar')} cor={C.text} onPress={() => denunciar(menuDe)} />
                )}
                {menuDe.autor_id !== userId && (
                  <ItemMenu icone="ban-outline" texto={t('moderacao.bloquearNome', { nome: menuDe.autor_nome })} cor={C.text} onPress={() => bloquear(menuDe)} />
                )}
                {ehAdmin && menuDe.autor_id !== userId && (
                  <ItemMenu
                    icone={silenciados.has(menuDe.autor_id) ? 'volume-high-outline' : 'volume-mute-outline'}
                    texto={silenciados.has(menuDe.autor_id)
                      ? t('moderacao.liberarNome', { nome: menuDe.autor_nome })
                      : t('moderacao.suspenderNome', { nome: menuDe.autor_nome })}
                    cor={C.text}
                    onPress={() => alternarSilencio(menuDe)}
                  />
                )}
              </Pressable>
            )}
          </Pressable>
        </Modal>

        {/* ── Reações e visualizações ────────────────────────────────────── */}
        <InfoDaMensagem
          mensagem={infoDe}
          verVistos={!!infoDe && (infoDe.autor_id === userId || ehAdmin)}
          C={C}
          cs={cs}
          onFechar={() => setInfoDe(null)}
        />

        <RegrasDoChat
          visivel={visible && mod.regrasAceitas === false}
          cor={COR}
          isDark={isDark}
          onAceitar={mod.aceitarRegras}
          onRecusar={fechar}
        />

        {/* ── Foto em tela cheia ─────────────────────────────────────────── */}
        <Modal visible={!!fotoAberta} transparent animationType="fade" onRequestClose={() => setFotoAberta(null)}>
          <Pressable style={cs.fotoFundo} onPress={() => setFotoAberta(null)}>
            {fotoAberta && <Image source={{ uri: fotoAberta }} style={cs.fotoCheia} resizeMode="contain" />}
            <View style={[cs.fotoFechar, { top: padTop + 6 }]}>
              <Ionicons name="close" size={28} color="#fff" />
            </View>
          </Pressable>
        </Modal>
      </View>
    </Modal>
  );
}

// ─── Peças ───────────────────────────────────────────────────────────────────
type LinhaInfo = { tipo: 'reacao' | 'visto'; user_id: string; nome: string; emoji: string | null };

// Quem reagiu (todo membro vê) e quem viu (só o autor e o Admin; o banco
// confere de novo em chat_geral_info_mensagem). "Viu" = abriu o Chat da
// Igreja depois que a mensagem foi enviada.
function InfoDaMensagem({ mensagem, verVistos, C, cs, onFechar }: {
  mensagem: MensagemGeral | null; verVistos: boolean;
  C: ReturnType<typeof paletaChat>; cs: ReturnType<typeof buildStyles>; onFechar: () => void;
}) {
  const { t } = useTranslation();
  const [linhas, setLinhas] = useState<LinhaInfo[] | null>(null);

  useEffect(() => {
    if (!mensagem) return;
    let vivo = true;
    setLinhas(null);
    supabase.rpc('chat_geral_info_mensagem', { p_mensagem: mensagem.id }).then(({ data, error }) => {
      if (vivo) setLinhas(error ? [] : ((data ?? []) as LinhaInfo[]));
    });
    return () => { vivo = false; };
  }, [mensagem?.id]);

  const reacoes = (linhas ?? []).filter(l => l.tipo === 'reacao');
  const vistos = (linhas ?? []).filter(l => l.tipo === 'visto');

  const Pessoa = ({ l }: { l: LinhaInfo }) => (
    <View style={st.infoLinha}>
      <View style={[st.infoAvatar, { backgroundColor: C.chipBg }]}>
        <Text style={[st.infoInicial, { color: COR }]}>{(l.nome.trim()[0] ?? '?').toUpperCase()}</Text>
      </View>
      <Text style={[st.infoNome, { color: C.text }]} numberOfLines={1}>{l.nome}</Text>
      {l.emoji ? <Text style={{ fontSize: 22 }}>{l.emoji}</Text> : <Ionicons name="checkmark-done" size={18} color={COR} />}
    </View>
  );

  return (
    <Modal visible={!!mensagem} transparent animationType="slide" onRequestClose={onFechar}>
      <Pressable style={cs.menuFundo} onPress={onFechar}>
        <Pressable style={[cs.menu, { maxHeight: '75%', paddingHorizontal: 18 }]} onPress={() => {}}>
          {linhas === null ? (
            <ActivityIndicator color={COR} style={{ marginVertical: 30 }} />
          ) : (
            <ScrollView>
              <Text style={[st.infoTitulo, { color: C.text }]}>
                {t('chatGeral.reacoesTitulo')}{reacoes.length ? ` · ${reacoes.length}` : ''}
              </Text>
              {reacoes.length
                ? reacoes.map(l => <Pessoa key={`r${l.user_id}`} l={l} />)
                : <Text style={[st.infoVazio, { color: C.textMuted }]}>{t('chatGeral.ninguemReagiu')}</Text>}

              {verVistos && (
                <>
                  <Text style={[st.infoTitulo, { color: C.text, marginTop: 18 }]}>
                    {t('chatGeral.vistoPor')}{vistos.length ? ` · ${vistos.length}` : ''}
                  </Text>
                  <Text style={[st.infoExplica, { color: C.textMuted }]}>{t('chatGeral.vistoExplica')}</Text>
                  {vistos.length
                    ? vistos.map(l => <Pessoa key={`v${l.user_id}`} l={l} />)
                    : <Text style={[st.infoVazio, { color: C.textMuted }]}>{t('chatGeral.ninguemViu')}</Text>}
                </>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ItemMenu({ icone, texto, cor, onPress }: { icone: keyof typeof Ionicons.glyphMap; texto: string; cor: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={st.menuItem}>
      <Ionicons name={icone} size={20} color={cor} />
      <Text style={[st.menuItemTexto, { color: cor }]}>{texto}</Text>
    </TouchableOpacity>
  );
}

function FotoDaMensagem({
  caminho, largura, altura, onAbrir, onLongPress,
}: {
  caminho: string; largura: number | null; altura: number | null;
  onAbrir: (url: string) => void; onLongPress: () => void;
}) {
  const [url, setUrl] = useState<string | null>(() => urlGuardada(caminho));
  const [erro, setErro] = useState(false);
  useEffect(() => {
    if (url) return;
    let vivo = true;
    urlDaMidia(caminho).then(u => { if (vivo) setUrl(u); }, () => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [caminho, url]);

  const W = 230;
  const proporcao = largura && altura ? altura / largura : 0.75;
  const H = Math.max(110, Math.min(320, Math.round(W * proporcao)));

  return (
    <Pressable onPress={() => { if (url) onAbrir(url); }} onLongPress={onLongPress} delayLongPress={300}>
      <View style={[st.foto, { width: W, height: H }]}>
        {url ? (
          <Image source={{ uri: url }} style={{ width: W, height: H }} resizeMode="cover" />
        ) : erro ? (
          <Ionicons name="image-outline" size={30} color="rgba(255,255,255,0.6)" />
        ) : (
          <ActivityIndicator color="#fff" />
        )}
      </View>
    </Pressable>
  );
}

// Vídeo: um quadro escuro com play e a duração. O toque abre o vídeo no
// player do próprio celular (link assinado de 1 hora) — não precisa de módulo
// nativo novo, então funciona também nos binários antigos via OTA.
async function abrirMidia(caminho: string, erroTexto: string) {
  try {
    const url = await urlDaMidia(caminho);
    await Linking.openURL(url);
  } catch {
    Alert.alert(erroTexto);
  }
}

function VideoDaMensagem({
  caminho, largura, altura, duracaoMs, onLongPress, erroTexto,
}: {
  caminho: string; largura: number | null; altura: number | null; duracaoMs: number | null;
  onLongPress: () => void; erroTexto: string;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const W = 230;
  const proporcao = largura && altura ? altura / largura : 0.5625;
  const H = Math.max(130, Math.min(300, Math.round(W * proporcao)));
  const abrir = async () => {
    if (abrindo) return;
    setAbrindo(true);
    await abrirMidia(caminho, erroTexto);
    setAbrindo(false);
  };
  return (
    <Pressable onPress={abrir} onLongPress={onLongPress} delayLongPress={300}>
      <View style={[st.foto, st.video, { width: W, height: H }]}>
        <View style={st.videoPlay}>
          {abrindo ? <ActivityIndicator color="#fff" /> : <Ionicons name="play" size={26} color="#fff" style={{ marginLeft: 3 }} />}
        </View>
        {!!duracaoMs && (
          <View style={st.videoTempo}>
            <Ionicons name="videocam" size={11} color="#fff" />
            <Text style={st.videoTempoTexto}>{formatarTempo(duracaoMs / 1000)}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// Anexo que não é áudio (PDF, Word, Excel...): cartão com ícone, nome e
// tamanho. O toque abre no visualizador do celular.
function ArquivoDaMensagem({
  caminho, nome, tamanho, minha, C, onLongPress, erroTexto,
}: {
  caminho: string; nome: string; tamanho: number | null; minha: boolean; C: PaletaChat;
  onLongPress: () => void; erroTexto: string;
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
  const fundo = minha ? 'rgba(255,255,255,0.16)' : C.chipBg;
  const corTexto = minha ? '#fff' : C.text;
  const corSub = minha ? 'rgba(255,255,255,0.75)' : C.textMuted;
  const abrir = async () => {
    if (abrindo) return;
    setAbrindo(true);
    await abrirMidia(caminho, erroTexto);
    setAbrindo(false);
  };
  return (
    <TouchableOpacity onPress={abrir} onLongPress={onLongPress} delayLongPress={300} activeOpacity={0.85}
      style={[st.anexo, { backgroundColor: fundo }]}>
      <View style={[st.anexoIcone, { backgroundColor: minha ? '#fff' : 'transparent' }]}>
        <Ionicons name={icone.nome} size={26} color={icone.cor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[st.anexoNome, { color: corTexto }]} numberOfLines={2}>{nome}</Text>
        <Text style={[st.anexoSub, { color: corSub }]}>
          {[ext.toUpperCase(), formatarTamanho(tamanho)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {abrindo
        ? <ActivityIndicator size="small" color={corTexto} />
        : <Ionicons name="open-outline" size={17} color={corSub} />}
    </TouchableOpacity>
  );
}

// Prévia do PRIMEIRO link da mensagem. YouTube mostra a miniatura (endereço
// montado, sem API nem cota). Instagram, TikTok e o resto bloqueiam a leitura
// da página pelo app, então mostram um cartão com o ícone e o nome do site — o
// toque abre no app da pessoa quando ele está instalado.
function PreviaLink({ texto, minha, C }: { texto: string; minha: boolean; C: PaletaChat }) {
  const url = useMemo(() => {
    const link = separarLinks(texto).find(tr => tr.tipo === 'link');
    return link && link.tipo === 'link' ? link.url : null;
  }, [texto]);
  if (!url) return null;
  const abrir = () => { Linking.openURL(url).catch(() => {}); };
  const yt = extractYoutubeId(url);
  const fundo = minha ? 'rgba(255,255,255,0.16)' : C.chipBg;
  const corTexto = minha ? '#fff' : C.text;

  if (yt) {
    return (
      <TouchableOpacity onPress={abrir} activeOpacity={0.85} style={[st.previa, { backgroundColor: fundo }]}>
        <View>
          <Image source={{ uri: youtubeThumbnail(yt) }} style={st.previaThumb} resizeMode="cover" />
          <View style={st.previaPlay}><Ionicons name="play" size={22} color="#fff" /></View>
        </View>
        <View style={st.previaRodape}>
          <Ionicons name="logo-youtube" size={15} color="#FF0000" />
          <Text style={[st.previaSite, { color: corTexto }]}>YouTube</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const host = url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].replace(/^www\./i, '').toLowerCase();
  const icone: { nome: keyof typeof Ionicons.glyphMap; cor: string; site: string } =
    /instagram|instagr\.am/.test(host) ? { nome: 'logo-instagram', cor: '#E1306C', site: 'Instagram' } :
    /tiktok/.test(host) ? { nome: 'logo-tiktok', cor: corTexto, site: 'TikTok' } :
    /facebook|fb\.watch/.test(host) ? { nome: 'logo-facebook', cor: '#1877F2', site: 'Facebook' } :
    /spotify/.test(host) ? { nome: 'musical-notes', cor: '#1DB954', site: 'Spotify' } :
    /whatsapp|wa\.me/.test(host) ? { nome: 'logo-whatsapp', cor: '#25D366', site: 'WhatsApp' } :
    /(^|\.)x\.com$|twitter/.test(host) ? { nome: 'logo-twitter', cor: corTexto, site: 'X' } :
    { nome: 'link-outline', cor: corTexto, site: host };

  return (
    <TouchableOpacity onPress={abrir} activeOpacity={0.85} style={[st.previa, st.previaLinha, { backgroundColor: fundo }]}>
      <Ionicons name={icone.nome} size={20} color={icone.cor} />
      <Text style={[st.previaSite, { color: corTexto, flex: 1 }]} numberOfLines={1}>{icone.site}</Text>
      <Ionicons name="open-outline" size={15} color={minha ? 'rgba(255,255,255,0.8)' : C.textMuted} />
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  infoTitulo: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  infoExplica: { fontSize: 12.5, marginBottom: 6 },
  infoVazio: { fontSize: 14, paddingVertical: 8 },
  infoLinha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  infoAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  infoInicial: { fontSize: 15, fontWeight: '800' },
  infoNome: { flex: 1, fontSize: 15, fontWeight: '600' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20 },
  menuItemTexto: { fontSize: 16, fontWeight: '600' },
  foto: { borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  previa: { marginTop: 8, borderRadius: 10, overflow: 'hidden', width: 230 },
  previaLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  previaThumb: { width: 230, height: 129 },
  previaPlay: { position: 'absolute', top: 44, left: 94, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  previaRodape: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 10 },
  previaSite: { fontSize: 13, fontWeight: '600' },
  video: { backgroundColor: '#14112E' },
  videoPlay: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center' },
  videoTempo: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  videoTempoTexto: { color: '#fff', fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  anexo: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 10, width: 240, marginTop: 2 },
  anexoIcone: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  anexoNome: { fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
  anexoSub: { fontSize: 11.5, marginTop: 2 },
  anexoAudioNome: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 230 },
  anexoAudioTexto: { fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
});

function buildStyles(C: PaletaChat) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 14, backgroundColor: COR },
  headerBtn: { padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  list: { padding: 12, paddingTop: 6, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 8 },
  emptyText: { fontSize: 13.5, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
  aviso: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 20 },
  avisoTexto: { fontSize: 11.5, color: C.textMuted, textAlign: 'center', flexShrink: 1 },
  diaWrap: { alignItems: 'center', marginVertical: 8 },
  dia: { fontSize: 11.5, fontWeight: '700', color: C.textMuted, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 10, overflow: 'hidden' },
  bubbleRow: { flexDirection: 'row', marginBottom: 6 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { borderRadius: 16, paddingVertical: 7, paddingHorizontal: 11 },
  bubbleFoto: { padding: 3 },
  bubbleOther: { backgroundColor: C.bubbleOtherBg, borderWidth: 1, borderColor: C.bubbleOtherBorder },
  autorNome: { fontSize: 11.5, fontWeight: '700', marginBottom: 2, color: COR },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  hora: { fontSize: 10, alignSelf: 'flex-end', marginTop: 3 },
  citacao: { borderLeftWidth: 3, borderLeftColor: COR, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 5 },
  citacaoNome: { fontSize: 11.5, fontWeight: '700' },
  citacaoTexto: { fontSize: 12.5, marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4, marginBottom: 2, paddingHorizontal: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 7, paddingVertical: 2 },
  chipEmoji: { fontSize: 14 },
  chipN: { fontSize: 11.5, fontWeight: '700' },
  respondendoBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.inputBarBg, borderTopWidth: 1, borderTopColor: C.inputBarBorder },
  respondendoFaixa: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: COR },
  respondendoNome: { fontSize: 12.5, fontWeight: '700', color: COR },
  respondendoTexto: { fontSize: 12.5, color: C.textMuted, marginTop: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.inputBarBorder, backgroundColor: C.inputBarBg },
  anexarBtn: { height: 38, justifyContent: 'center' },
  // Linha, e não coluna: a barra do gravador tem `flex: 1` e, dentro de uma
  // coluna sem altura, ficava com altura ZERO — o play, o tempo e o regravar
  // sumiam (11/10/2026). Como linha, o flex vale para a largura.
  gravadorAberto: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, maxHeight: 110, backgroundColor: C.inputBg, borderRadius: 19, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, fontSize: 15, color: C.text },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: COR },
  silenciadoTexto: { fontSize: 13, color: C.textMuted, marginLeft: 6, flexShrink: 1 },
  menuFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  menu: { backgroundColor: C.sheetBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 14, paddingBottom: 34 },
  menuReacoes: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.inputBarBorder, marginBottom: 4 },
  menuReacao: { padding: 6 },
  fotoFundo: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  fotoCheia: { width: '100%', height: '100%' },
  fotoFechar: { position: 'absolute', right: 18 },
}); }
