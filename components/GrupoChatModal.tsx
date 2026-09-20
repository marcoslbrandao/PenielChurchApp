import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Modal, ActivityIndicator, Alert, StatusBar, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { apagarLinha } from '../lib/db';
import { useTheme } from '../lib/theme';
import TextoComLinks from './TextoComLinks';
import AudioMensagem from './AudioMensagem';
import GravadorAudio from './GravadorAudio';
import { binarioPodeGravarAudio } from '../lib/recursosNativos';
import { enviarAudio, apagarAudio, TEXTO_DO_AUDIO } from '../lib/chatAudio';

function paletaChat(isDark: boolean) {
  return isDark ? {
    bg: '#0E0B22',
    bubbleOtherBg: '#1C1940',
    bubbleOtherBorder: '#332D5C',
    text: '#F1EFFA',
    textMuted: '#A69FD6',
    inputBg: '#241F4D',
    inputBarBg: '#1C1940',
    inputBarBorder: '#332D5C',
    emptyIcon: '#4A4478',
    placeholder: '#726A99',
  } : {
    bg: '#F7F4EE',
    bubbleOtherBg: '#FFFFFF',
    bubbleOtherBorder: '#E5E0D8',
    text: '#1A1A2E',
    textMuted: '#9CA3AF',
    inputBg: '#F0EDE8',
    inputBarBg: '#FFFFFF',
    inputBarBorder: '#E5E0D8',
    emptyIcon: '#C9C4E8',
    placeholder: '#9CA3AF',
  };
}
type PaletaChat = ReturnType<typeof paletaChat>;

type Mensagem = {
  id: string;
  grupo: string;
  autor_id: string;
  autor_nome: string;
  texto: string;
  // Mensagem de voz: caminho no bucket `chat-audio`. Nesses casos `texto`
  // é só o rótulo TEXTO_DO_AUDIO, para versões antigas do app.
  audio_path?: string | null;
  audio_duracao_ms?: number | null;
  created_at: string;
};

// Chat em tempo real de um grupo (Mulheres/Homens/Jovens). Só abre pra quem
// já tem acesso ao grupo (RLS de `grupo_chat_mensagens` garante isso de
// qualquer forma, mesmo se alguém tentar chamar isso fora do fluxo normal).
export default function GrupoChatModal({
  visible, grupo, grupoNome, cor, userId, userNome, podeModerar, onClose,
}: {
  visible: boolean;
  grupo: string;
  grupoNome: string;
  cor: string;
  userId: string;
  userNome: string;
  podeModerar: boolean;
  onClose: () => void;
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const listRef = useRef<FlatList>(null);
  // Um áudio tocando por vez na conversa inteira.
  const [audioAtivo, setAudioAtivo] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const podeGravar = useMemo(() => binarioPodeGravarAudio(), []);

  const { isDark } = useTheme();
  // Dentro de um <Modal> do React Native, o <SafeAreaView> mede a view NATIVA
  // do modal e volta com inset 0 no iOS — era por isso que o cabeçalho ficava
  // atrás do relógio e a barra de digitar sumia sob a faixa inferior. O hook
  // useSafeAreaInsets() vem do contexto React, que atravessa o modal, então é
  // confiável aqui: aplicamos o respiro à mão.
  //
  // No Android o modal já começa abaixo da barra de status, então somar o
  // inset ali criaria um vão; o padding fixo basta.
  const insets = useSafeAreaInsets();
  const padTop = Platform.OS === 'ios' ? Math.max(insets.top, 20) : 12;

  // Com o teclado aberto, o KeyboardAvoidingView já empurra a barra pra cima —
  // manter o respiro da faixa inferior aí deixaria um vão vazio de uns 34px
  // entre a barra e o teclado. Só aplicamos esse respiro com o teclado fechado.
  const [tecladoAberto, setTecladoAberto] = useState(false);
  useEffect(() => {
    const mostrar = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const esconder = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(mostrar, () => setTecladoAberto(true));
    const s2 = Keyboard.addListener(esconder, () => setTecladoAberto(false));
    return () => { s1.remove(); s2.remove(); };
  }, []);

  const padBottom = tecladoAberto
    ? 0
    : (Platform.OS === 'ios' ? Math.max(insets.bottom, 10) : 10);
  const C = useMemo(() => paletaChat(isDark), [isDark]);
  const cs = useMemo(() => buildStyles(C), [C]);

  const fetchMensagens = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('grupo_chat_mensagens')
      .select('*')
      .eq('grupo', grupo)
      // Ordem DESC + reverse: `limit` corta pelo começo da ordenação, então
      // pedir ascendente traria as 300 mensagens mais ANTIGAS do grupo e a
      // conversa pararia no meio depois que ele passasse de 300 mensagens.
      .order('created_at', { ascending: false })
      .limit(300);
    if (!error) setMensagens(((data ?? []) as Mensagem[]).reverse());
    setLoading(false);
  }, [grupo]);

  useEffect(() => {
    if (!visible) return;
    fetchMensagens();

    const channel = supabase
      .channel(`grupo_chat_${grupo}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'grupo_chat_mensagens', filter: `grupo=eq.${grupo}` },
        (payload) => {
          const nova = payload.new as Mensagem;
          setMensagens(prev => (prev.some(m => m.id === nova.id) ? prev : [...prev, nova]));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'grupo_chat_mensagens', filter: `grupo=eq.${grupo}` },
        (payload) => {
          const removida = payload.old as { id: string };
          setMensagens(prev => prev.filter(m => m.id !== removida.id));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [visible, grupo, fetchMensagens]);

  const enviar = async () => {
    const texto_ = texto.trim();
    if (!texto_ || enviando) return;
    setEnviando(true);
    const { error } = await supabase.from('grupo_chat_mensagens').insert({
      grupo, autor_id: userId, autor_nome: userNome, texto: texto_,
    });
    setEnviando(false);
    if (error) { Alert.alert('Erro', error.message); return; }
    setTexto('');
  };

  const enviarGravacao = async (uri: string, duracaoMs: number) => {
    setEnviandoAudio(true);
    try {
      const caminho = await enviarAudio(uri, grupo, userId);
      const { error } = await supabase.from('grupo_chat_mensagens').insert({
        grupo, autor_id: userId, autor_nome: userNome, texto: TEXTO_DO_AUDIO,
        audio_path: caminho, audio_duracao_ms: duracaoMs,
      });
      if (error) { apagarAudio(caminho); throw error; }
    } catch (e: any) {
      Alert.alert('Não foi possível enviar o áudio', e?.message ?? 'Verifique a internet e tente de novo.');
    } finally {
      setEnviandoAudio(false);
    }
  };

  // Fechar o chat para o áudio que estiver tocando.
  useEffect(() => { if (!visible) setAudioAtivo(null); }, [visible]);

  const apagar = (msg: Mensagem) => {
    if (msg.autor_id !== userId && !podeModerar) return;
    Alert.alert('Apagar mensagem', 'Remover esta mensagem do chat?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar', style: 'destructive', onPress: async () => {
          setMensagens(prev => prev.filter(m => m.id !== msg.id));
          await apagarLinha('grupo_chat_mensagens', msg.id);
          if (msg.audio_path) apagarAudio(msg.audio_path);
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={cs.safe}>
        <StatusBar barStyle="light-content" />
        <View style={[cs.header, { backgroundColor: cor, paddingTop: padTop + 10 }]}>
          <TouchableOpacity onPress={onClose} style={cs.headerBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={cs.headerTitle} numberOfLines={1}>Chat — {grupoNome}</Text>
            <Text style={cs.headerSub}>Só participantes do grupo veem</Text>
          </View>
          <Ionicons name="chatbubbles-outline" size={20} color="rgba(255,255,255,0.7)" />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {loading ? (
            <ActivityIndicator color={cor} style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              ref={listRef}
              data={mensagens}
              keyExtractor={m => m.id}
              contentContainerStyle={cs.list}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              ListEmptyComponent={
                <View style={cs.emptyWrap}>
                  <Ionicons name="chatbubble-ellipses-outline" size={40} color={C.emptyIcon} />
                  <Text style={cs.emptyText}>Nenhuma mensagem ainda.{'\n'}Comece a conversa!</Text>
                </View>
              }
              renderItem={({ item }) => {
                const minha = item.autor_id === userId;
                const podeApagar = minha || podeModerar;
                return (
                  <TouchableOpacity
                    activeOpacity={podeApagar ? 0.6 : 1}
                    onLongPress={() => podeApagar && apagar(item)}
                    style={[cs.bubbleRow, minha && cs.bubbleRowMine]}
                  >
                    <View style={[cs.bubble, minha ? { backgroundColor: cor } : cs.bubbleOther]}>
                      {!minha && <Text style={[cs.autorNome, { color: cor }]}>{item.autor_nome}</Text>}
                      {item.audio_path ? (
                        <AudioMensagem
                          caminho={item.audio_path}
                          duracaoMs={item.audio_duracao_ms ?? null}
                          ativo={audioAtivo === item.id}
                          onAtivar={() => setAudioAtivo(item.id)}
                          onTerminar={() => setAudioAtivo(a => (a === item.id ? null : a))}
                          corTexto={minha ? '#fff' : C.text}
                          corTrilho={minha ? 'rgba(255,255,255,0.35)' : C.bubbleOtherBorder}
                          corProgresso={minha ? '#fff' : cor}
                          onLongPress={podeApagar ? () => apagar(item) : undefined}
                        />
                      ) : (
                        <TextoComLinks
                          texto={item.texto}
                          style={[cs.bubbleText, minha && { color: '#fff' }]}
                          corLink={minha ? '#fff' : cor}
                          onLongPress={podeApagar ? () => apagar(item) : undefined}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <View style={[cs.inputRow, { paddingBottom: 10 + padBottom }]}>
            {!gravando && (
            <TextInput
              style={cs.input}
              placeholder="Escreva uma mensagem..."
              placeholderTextColor={C.placeholder}
              value={texto}
              onChangeText={setTexto}
              multiline
              maxLength={1000}
            />
            )}
            {enviandoAudio ? (
              <View style={[cs.sendBtn, { backgroundColor: cor, opacity: 0.6 }]}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : podeGravar && (gravando || !texto.trim()) ? (
              // Campo vazio: o botão vira microfone, como no WhatsApp.
              <GravadorAudio
                cor={cor}
                corTexto={C.text}
                corFundo={C.inputBg}
                onComecar={() => { setAudioAtivo(null); Keyboard.dismiss(); }}
                onGravado={enviarGravacao}
                onGravandoMudou={setGravando}
              />
            ) : (
              <TouchableOpacity
                style={[cs.sendBtn, { backgroundColor: cor, opacity: texto.trim() && !enviando ? 1 : 0.5 }]}
                onPress={enviar}
                disabled={!texto.trim() || enviando}
              >
                {enviando ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={17} color="#fff" />}
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function buildStyles(C: PaletaChat) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  // paddingTop é aplicado em linha, a partir do inset real do aparelho.
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 14 },
  headerBtn: { padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  list: { padding: 14, paddingBottom: 6, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12 },
  bubbleOther: { backgroundColor: C.bubbleOtherBg, borderWidth: 1, borderColor: C.bubbleOtherBorder },
  autorNome: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  bubbleText: { fontSize: 14, color: C.text, lineHeight: 19 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: C.inputBarBorder, backgroundColor: C.inputBarBg },
  input: { flex: 1, maxHeight: 100, backgroundColor: C.inputBg, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: C.text },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
}); }
