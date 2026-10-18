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
import { useTranslation } from 'react-i18next';
import AnexoMensagem from './AnexoMensagem';
import { abrirMenuDeAnexo, apagarAnexo, legendaDoAnexo, type CamposAnexo, type TipoAnexo } from '../lib/chatAnexos';
import MenuMensagem, { type AcaoMenu } from './MenuMensagem';
import RegrasDoChat from './RegrasDoChat';
import { useFolgaDoTeclado } from '../lib/folgaDoTeclado';
import { registrarChatAberto } from '../lib/chatAberto';
import { enviarCompartilhado } from '../lib/chatAnexos';
import type { Compartilhado } from '../lib/chatGeral';
import AnexoPendente from './AnexoPendente';
import BotaoNegrito from './BotaoNegrito';
import EscolherEmoji from './EscolherEmoji';
import ChipsReacoes from './ChipsReacoes';
import { useEmojisFavoritos } from '../lib/emojisFavoritos';
import { useReacoesChat } from '../lib/reacoesChat';
import { alternarNegrito, semFormatacao } from '../lib/negrito';
import { useModeracaoChat, denunciarMensagem, barrarSeOfensivo, alternarSuspensao } from '../lib/moderacao';

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
  // Anexo (foto, vídeo, arquivo) — ver lib/chatAnexos.ts. `texto` leva a
  // legenda ou um rótulo ("📷 Foto"), para versões antigas do app.
  midia_tipo?: TipoAnexo | null;
  midia_path?: string | null;
  midia_nome?: string | null;
  midia_tamanho?: number | null;
  midia_mime?: string | null;
  midia_largura?: number | null;
  midia_altura?: number | null;
  midia_duracao_ms?: number | null;
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
  const { t } = useTranslation();
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  // Moderação (17/10/2026, diretriz 1.2 da Apple): menu ao segurar a
  // mensagem com Apagar, Denunciar, Bloquear e (admin) Suspender; Regras da
  // comunidade antes de entrar; filtro de palavras no envio.
  const [menuDe, setMenuDe] = useState<Mensagem | null>(null);
  // Negrito (18/10/2026): selecionar um trecho mostra o botão "B Negrito".
  const [selecao, setSelecao] = useState({ start: 0, end: 0 });
  const temSelecao = selecao.end !== selecao.start;
  const aplicarNegrito = () => {
    const r = alternarNegrito(texto, selecao);
    setTexto(r.texto);
    setSelecao({ start: r.cursor, end: r.cursor });
  };
  // Arquivo que chegou pelo Compartilhar com este chat aberto (18/10/2026).
  const [pendente, setPendente] = useState<Compartilhado['arquivo'] | null>(null);
  useEffect(() => {
    if (!visible) { setPendente(null); return; }
    return registrarChatAberto({
      destino: grupo,
      receber: c => {
        if (c.texto) setTexto(tx => (tx.trim() ? `${tx} ${c.texto}` : c.texto!));
        if (c.arquivo) setPendente(c.arquivo);
      },
    });
  }, [visible, grupo]);
  const mod = useModeracaoChat(userId, visible);
  // Reações com emoji, iguais às do Chat da Igreja (18/10/2026).
  const { porMensagem, reagir } = useReacoesChat({ tabela: 'grupo_chat_reacoes', grupo }, userId, visible);
  const { favoritos, registrarUso } = useEmojisFavoritos(userId);
  const [emojiPara, setEmojiPara] = useState<Mensagem | null>(null);
  const reagirEContar = async (m: Mensagem, e: string) => { if (await reagir(m.id, e)) registrarUso(e); };
  // O banco já esconde as mensagens de quem eu bloqueei; o filtro aqui só
  // faz sumir na hora, sem esperar recarregar.
  const visiveis = useMemo(() => mensagens.filter(m => !mod.bloqueados.has(m.autor_id)), [mensagens, mod.bloqueados]);

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
  // Android com edge-to-edge (app.json `edgeToEdgeEnabled`): o <Modal> também
  // desenha por baixo da barra de status e da barra de navegação do sistema.
  // Com respiro fixo, a barra de digitar/gravar ficava escondida atrás dos
  // botões do Android (11/10/2026). Agora os dois sistemas usam o inset real.
  const padTop = Platform.OS === 'ios' ? Math.max(insets.top, 20) : Math.max(insets.top, 12);

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

  const padBottom = tecladoAberto ? 0 : Math.max(insets.bottom, 10);
  // Android edge-to-edge: o sistema não encolhe a tela com o teclado; a folga
  // medida sobe a barra de digitar (ver lib/folgaDoTeclado.ts, 17/10/2026).
  const areaRef = useRef<View>(null);
  const folgaTeclado = useFolgaDoTeclado(areaRef, visible);
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

  const enviarPendente = async () => {
    if (!pendente || enviando) return;
    if (barrarSeOfensivo(texto, t)) return;
    setEnviando(true);
    try {
      await enviarCompartilhado({
        t, prefixo: grupo, autorId: userId, arquivo: pendente, texto,
        inserir: async (campos) => {
          const { data, error } = await supabase.from('grupo_chat_mensagens')
            .insert({ grupo, autor_id: userId, autor_nome: userNome, ...campos })
            .select().single();
          if (error) throw error;
          if (data) setMensagens(prev => (prev.some(m => m.id === (data as Mensagem).id) ? prev : [...prev, data as Mensagem]));
        },
      });
      setPendente(null);
      setTexto('');
    } catch (e: any) {
      Alert.alert(t('chatGeral.erroEnviar'), e?.message ?? t('chatGeral.erroEnviarTexto'));
    } finally {
      setEnviando(false);
    }
  };

  const enviar = async () => {
    if (pendente) { enviarPendente(); return; }
    const texto_ = texto.trim();
    if (!texto_ || enviando) return;
    if (barrarSeOfensivo(texto_, t)) return;
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

  const anexar = () => !barrarSeOfensivo(texto, t) && abrirMenuDeAnexo({
    t, prefixo: grupo, autorId: userId, legenda: texto,
    setEnviando: setEnviandoAnexo,
    limparLegenda: () => setTexto(''),
    inserir: async (campos: CamposAnexo) => {
      const { data, error } = await supabase.from('grupo_chat_mensagens')
        .insert({ grupo, autor_id: userId, autor_nome: userNome, ...campos })
        .select().single();
      if (error) throw error;
      if (data) setMensagens(prev => (prev.some(m => m.id === (data as Mensagem).id) ? prev : [...prev, data as Mensagem]));
    },
  }, `Chat — ${grupoNome}`);

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
          apagarAnexo(msg.midia_path);
        },
      },
    ]);
  };

  const acaoDoMenu = (msg: Mensagem, acao: AcaoMenu) => {
    if (acao === 'apagar') apagar(msg);
    else if (acao === 'denunciar') denunciarMensagem('grupo', msg.id, t);
    else if (acao === 'bloquear') mod.bloquear(msg.autor_id, msg.autor_nome, t);
    else if (acao === 'suspender') alternarSuspensao(msg.autor_id, msg.autor_nome, mod.suspensos.has(msg.autor_id), t, mod.recarregar);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* ref e folga na RAIZ, não num View em volta do KeyboardAvoidingView:
          o KAV do iPhone calcula a posição relativa ao pai. Com um View novo
          em volta, ele perdia a altura do cabeçalho e o teclado cobria a
          caixa de digitar no iPhone (18/10/2026). */}
      <View ref={areaRef} collapsable={false} style={[cs.safe, { paddingBottom: folgaTeclado }]}>
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
              data={visiveis}
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
                return (
                  <View>
                  <TouchableOpacity
                    activeOpacity={0.6}
                    onLongPress={() => setMenuDe(item)}
                    style={[cs.bubbleRow, minha && cs.bubbleRowMine]}
                  >
                    <View style={[cs.bubble, minha ? { backgroundColor: cor } : cs.bubbleOther]}>
                      {!minha && <Text style={[cs.autorNome, { color: cor }]}>{item.autor_nome}</Text>}
                      {item.midia_path ? (
                        <>
                          <AnexoMensagem
                            m={item}
                            id={item.id}
                            minha={minha}
                            corTexto={minha ? '#fff' : C.text}
                            corTrilho={minha ? 'rgba(255,255,255,0.35)' : C.bubbleOtherBorder}
                            corProgresso={minha ? '#fff' : cor}
                            corCartao={minha ? 'rgba(255,255,255,0.16)' : C.inputBg}
                            audioAtivo={audioAtivo === item.id}
                            onAtivarAudio={() => setAudioAtivo(item.id)}
                            onTerminarAudio={() => setAudioAtivo(a => (a === item.id ? null : a))}
                            onLongPress={() => setMenuDe(item)}
                          />
                          {!!legendaDoAnexo(item) && (
                            <TextoComLinks
                              texto={legendaDoAnexo(item)!}
                              style={[cs.bubbleText, { marginTop: 6 }, minha && { color: '#fff' }]}
                              corLink={minha ? '#fff' : cor}
                              onLongPress={() => setMenuDe(item)}
                            />
                          )}
                        </>
                      ) : item.audio_path ? (
                        <AudioMensagem
                          caminho={item.audio_path}
                          duracaoMs={item.audio_duracao_ms ?? null}
                          ativo={audioAtivo === item.id}
                          onAtivar={() => setAudioAtivo(item.id)}
                          onTerminar={() => setAudioAtivo(a => (a === item.id ? null : a))}
                          corTexto={minha ? '#fff' : C.text}
                          corTrilho={minha ? 'rgba(255,255,255,0.35)' : C.bubbleOtherBorder}
                          corProgresso={minha ? '#fff' : cor}
                          onLongPress={() => setMenuDe(item)}
                        />
                      ) : (
                        <TextoComLinks
                          texto={item.texto}
                          style={[cs.bubbleText, minha && { color: '#fff' }]}
                          corLink={minha ? '#fff' : cor}
                          onLongPress={() => setMenuDe(item)}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                  <ChipsReacoes
                    chips={porMensagem.get(item.id)}
                    minha={minha}
                    cor={cor}
                    corFundo={C.bubbleOtherBg}
                    corNumero={C.textMuted}
                    onTocar={e => reagirEContar(item, e)}
                  />
                  </View>
                );
              }}
            />
          )}

          {mod.souSuspenso ? (
            <View style={[cs.inputRow, { paddingBottom: 10 + padBottom, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="volume-mute-outline" size={16} color={C.textMuted} />
              <Text style={{ fontSize: 13, color: C.textMuted, marginLeft: 6, flexShrink: 1 }}>{t('moderacao.suspensoAviso')}</Text>
            </View>
          ) : (
          <>
          {pendente && (
            <AnexoPendente
              arquivo={pendente}
              cor={cor}
              corTexto={C.text}
              corSuave={C.textMuted}
              corFundo={C.inputBarBg}
              corBorda={C.inputBarBorder}
              desativado={enviando}
              onRemover={() => setPendente(null)}
            />
          )}
          {temSelecao && (
            <BotaoNegrito cor={cor} corTexto={C.text} corSuave={C.textMuted} corFundo={C.inputBarBg} corBorda={C.inputBarBorder} onPress={aplicarNegrito} />
          )}
          <View style={[cs.inputRow, { paddingBottom: 10 + padBottom }]}>
            {!gravando && (
              <TouchableOpacity onPress={anexar} style={cs.anexarBtn} disabled={enviandoAnexo || enviandoAudio} hitSlop={6}>
                {enviandoAnexo
                  ? <ActivityIndicator size="small" color={cor} />
                  : <Ionicons name="add-circle-outline" size={28} color={cor} />}
              </TouchableOpacity>
            )}
            {!gravando && (
            <TextInput
              style={cs.input}
              placeholder="Escreva uma mensagem..."
              placeholderTextColor={C.placeholder}
              value={texto}
              onChangeText={setTexto}
              onSelectionChange={e => setSelecao(e.nativeEvent.selection)}
              multiline
              maxLength={1000}
            />
            )}
            {enviandoAudio ? (
              <View style={[cs.sendBtn, { backgroundColor: cor, opacity: 0.6 }]}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : podeGravar && !pendente && (gravando || !texto.trim()) ? (
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
                style={[cs.sendBtn, { backgroundColor: cor, opacity: (pendente || texto.trim()) && !enviando ? 1 : 0.5 }]}
                onPress={enviar}
                disabled={(!pendente && !texto.trim()) || enviando}
              >
                {enviando ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={17} color="#fff" />}
              </TouchableOpacity>
            )}
          </View>
          </>
          )}
        </KeyboardAvoidingView>

        <MenuMensagem
          visivel={!!menuDe}
          autorNome={menuDe?.autor_nome ?? ''}
          minha={menuDe?.autor_id === userId}
          podeApagar={!!menuDe && (menuDe.autor_id === userId || podeModerar)}
          ehAdmin={podeModerar}
          autorSuspenso={!!menuDe && mod.suspensos.has(menuDe.autor_id)}
          corFundo={C.inputBarBg}
          corTexto={C.text}
          corBorda={C.inputBarBorder}
          onAcao={acao => menuDe && acaoDoMenu(menuDe, acao)}
          onFechar={() => setMenuDe(null)}
          favoritos={favoritos}
          onReagir={e => { const m = menuDe; if (m) reagirEContar(m, e); }}
          onMaisEmoji={() => { const m = menuDe; setTimeout(() => setEmojiPara(m), 350); }}
        />
        <EscolherEmoji
          visivel={!!emojiPara}
          isDark={isDark}
          cor={cor}
          onEscolher={e => { const m = emojiPara; setEmojiPara(null); if (m) reagirEContar(m, e); }}
          onFechar={() => setEmojiPara(null)}
        />
        <RegrasDoChat
          visivel={visible && mod.regrasAceitas === false}
          cor={cor}
          isDark={isDark}
          onAceitar={mod.aceitarRegras}
          onRecusar={onClose}
        />
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
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.inputBarBorder, backgroundColor: C.inputBarBg },
  input: { flex: 1, maxHeight: 100, backgroundColor: C.inputBg, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: C.text },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  anexarBtn: { height: 38, minWidth: 30, justifyContent: 'center', alignItems: 'center' },
}); }
