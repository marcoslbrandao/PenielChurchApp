import React, { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import {
  useAudioRecorder, useAudioRecorderState, requestRecordingPermissionsAsync, setAudioModeAsync,
  createAudioPlayer, type AudioPlayer,
} from 'expo-audio';
import { OPCOES_GRAVACAO, AUDIO_MAX_SEGUNDOS, formatarTempo } from '../lib/chatAudio';

// Botão de microfone + barra de gravação dos chats (grupos, Banda, Igreja).
//
// Três fases (pedido do Marcos, 11/10/2026 — antes não dava para parar e ouvir):
//   1. parado     → só o botão do microfone.
//   2. gravando   → 🗑 descartar · onda do áudio ao vivo + tempo · ■ parar e ouvir · ➤ enviar já.
//   3. revisando  → 🗑 apagar · ▶ ouvir (a onda gravada vai colorindo) · 🎤 regravar · ➤ enviar.
//
// A onda vem do `metering` do gravador (nível em dB, ligado em
// OPCOES_GRAVACAO.isMeteringEnabled) — no lugar do ponto vermelho piscando,
// que não mostrava se o microfone estava mesmo captando (pedido de 11/10).
//
// Toque para começar, e não "segurar para gravar": segurar exige manter o dedo
// parado por um minuto, e é o gesto que mais falha em quem tem menos
// intimidade com o celular.
//
// SÓ MONTAR QUANDO `binarioPodeGravarAudio()`: o hook cria o gravador nativo
// na montagem, e o pedido de microfone num binário sem a permissão fecha o app.
type Fase = 'parado' | 'gravando' | 'revisando';

export default function GravadorAudio({
  cor, corIcone = '#fff', corTexto, corFundo, tamanho = 38, onComecar, onGravado, onGravandoMudou,
}: {
  cor: string;
  /** Cor do ícone sobre `cor`. Branco nos grupos; a Banda usa `onPrimary`. */
  corIcone?: string;
  /** Diâmetro dos botões redondos — para casar com o botão de enviar da tela. */
  tamanho?: number;
  corTexto: string;
  corFundo: string;
  onComecar: () => void;
  onGravado: (uri: string, duracaoMs: number) => void;
  /** true enquanto grava OU revisa: o pai esconde o campo de texto. */
  onGravandoMudou: (gravando: boolean) => void;
}) {
  const recorder = useAudioRecorder(OPCOES_GRAVACAO);
  const estado = useAudioRecorderState(recorder, 200);
  const [fase, setFase] = useState<Fase>('parado');
  const faseRef = useRef<Fase>('parado');
  const ocupado = useRef(false);
  const pulso = useRef(new Animated.Value(1)).current;

  // Revisão: a gravação pronta e o player que toca o arquivo local.
  const gravacao = useRef<{ uri: string; duracao: number } | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const [tocando, setTocando] = useState(false);
  const [posicao, setPosicao] = useState(0);

  // Níveis do microfone, de 0 a 1, um por leitura (~10 por segundo).
  const niveis = useRef<number[]>([]);
  const [, setTique] = useState(0);
  useEffect(() => {
    if (fase !== 'gravando') return;
    const db = estado.metering;
    // -55 dB ou menos é silêncio; 0 dB é o máximo. Piso de 0,08 para a
    // onda nunca sumir de vez (silêncio aparece como risquinho).
    const n = typeof db === 'number' && isFinite(db) ? Math.min(1, Math.max(0.08, (db + 55) / 55)) : 0.08;
    niveis.current.push(n);
    setTique(x => x + 1);
  }, [estado.durationMillis, estado.metering, fase]);

  useEffect(() => {
    faseRef.current = fase;
    onGravandoMudou(fase !== 'parado');
  }, [fase]);

  useEffect(() => {
    if (fase !== 'gravando') return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 0.25, duration: 600, useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [fase]);

  const devolverSaidaDeSom = () =>
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});

  const apagarArquivo = (uri: string) => { FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); };

  const soltarPlayer = () => {
    const p = playerRef.current;
    playerRef.current = null;
    if (p) { try { p.pause(); p.remove(); } catch { /* já liberado */ } }
    setTocando(false);
  };

  // ── Gravar ────────────────────────────────────────────────────────────────
  const comecar = async () => {
    if (ocupado.current) return;
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Microfone bloqueado',
        'Para mandar áudio, libere o microfone para o Peniel Church nos Ajustes do celular.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    ocupado.current = true;
    try {
      onComecar();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      niveis.current = [];
      recorder.record();
      setFase('gravando');
    } catch (e: any) {
      devolverSaidaDeSom();
      Alert.alert('Não foi possível gravar', e?.message ?? 'Tente de novo.');
    } finally {
      ocupado.current = false;
    }
  };

  /** Para o gravador e devolve o arquivo (ou null se curto demais / falhou). */
  const pararGravador = async (): Promise<{ uri: string; duracao: number } | null> => {
    let duracao = estado.durationMillis;
    try { duracao = recorder.getStatus().durationMillis || duracao; } catch { /* segue */ }
    try { await recorder.stop(); } catch { /* já parado */ }
    devolverSaidaDeSom();
    let uri: string | null = null;
    try { uri = recorder.uri; } catch { /* segue */ }
    if (!uri) return null;
    // Menos de 1 s é quase sempre toque sem querer.
    if (duracao < 1000) { apagarArquivo(uri); return null; }
    return { uri, duracao: Math.round(duracao) };
  };

  const descartarGravando = async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    const g = await pararGravador();
    if (g) apagarArquivo(g.uri);
    setFase('parado');
    ocupado.current = false;
  };

  const pararParaOuvir = async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    const g = await pararGravador();
    gravacao.current = g;
    setPosicao(0);
    setFase(g ? 'revisando' : 'parado');
    ocupado.current = false;
  };

  const enviarGravando = async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    const g = await pararGravador();
    setFase('parado');
    ocupado.current = false;
    if (g) onGravado(g.uri, g.duracao);
  };

  // Chegou no limite: para e vai para a revisão (a pessoa decide se envia).
  useEffect(() => {
    if (fase === 'gravando' && estado.durationMillis >= AUDIO_MAX_SEGUNDOS * 1000) pararParaOuvir();
  }, [fase, estado.durationMillis]);

  // ── Revisar ───────────────────────────────────────────────────────────────
  const alternarOuvir = async () => {
    const g = gravacao.current;
    if (!g) return;
    const p = playerRef.current;
    if (p) {
      if (p.playing) { p.pause(); setTocando(false); } else { p.play(); setTocando(true); }
      return;
    }
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const novo = createAudioPlayer({ uri: g.uri }, { updateInterval: 200 });
      playerRef.current = novo;
      novo.addListener('playbackStatusUpdate', st => {
        if (playerRef.current !== novo) return;
        setPosicao(st.currentTime);
        if (st.didJustFinish) {
          setTocando(false);
          setPosicao(0);
          try { novo.seekTo(0); novo.pause(); } catch { /* segue */ }
        }
      });
      novo.play();
      setTocando(true);
    } catch {
      soltarPlayer();
      Alert.alert('Não foi possível tocar', 'Tente de novo.');
    }
  };

  const apagarRevisao = () => {
    soltarPlayer();
    if (gravacao.current) apagarArquivo(gravacao.current.uri);
    gravacao.current = null;
    setFase('parado');
  };

  const regravar = () => {
    apagarRevisao();
    comecar();
  };

  const enviarRevisao = () => {
    const g = gravacao.current;
    soltarPlayer();
    gravacao.current = null;
    setFase('parado');
    if (g) onGravado(g.uri, g.duracao);
  };

  // ── Sair da tela no meio ──────────────────────────────────────────────────
  // NÃO perguntar ao `recorder` se está gravando: o `useAudioRecorder` declara
  // o efeito dele ANTES deste, e no desmonte o React limpa na ordem de
  // declaração — aqui o gravador nativo já foi liberado, e ler uma
  // propriedade dele lança erro (que em produção FECHA O APP; foi o que
  // acontecia ao digitar a primeira letra no chat, 11/10/2026). A fase vem
  // da nossa ref, e tudo vai em try.
  useEffect(() => () => {
    if (faseRef.current === 'gravando') {
      try { recorder.stop().catch(() => {}); } catch { /* já liberado */ }
      devolverSaidaDeSom();
    }
    const p = playerRef.current;
    playerRef.current = null;
    if (p) { try { p.pause(); p.remove(); } catch { /* já liberado */ } }
    if (gravacao.current) apagarArquivo(gravacao.current.uri);
  }, []);

  const redondo = { width: tamanho, height: tamanho, borderRadius: tamanho / 2 };

  if (fase === 'parado') {
    return (
      <TouchableOpacity
        style={[st.botaoRedondo, redondo, { backgroundColor: cor }]}
        onPress={comecar}
        accessibilityRole="button"
        accessibilityLabel="Gravar mensagem de voz"
      >
        <Ionicons name="mic" size={19} color={corIcone} />
      </TouchableOpacity>
    );
  }

  if (fase === 'gravando') {
    return (
      <View style={[st.barra, { backgroundColor: corFundo }]}>
        <TouchableOpacity onPress={descartarGravando} hitSlop={8} style={st.lixeira} accessibilityLabel="Descartar gravação">
          <Ionicons name="trash" size={18} color="#E53935" />
        </TouchableOpacity>
        <Onda niveis={niveis.current} cor="#E53935" corApagada={corTexto} progresso={1} aoVivo />
        <Text style={[st.tempo, { color: corTexto }]}>{formatarTempo(estado.durationMillis / 1000)}</Text>
        <TouchableOpacity
          onPress={pararParaOuvir}
          hitSlop={8}
          style={[st.botaoRedondo, redondo, st.botaoContorno, { borderColor: cor }]}
          accessibilityLabel="Parar e ouvir antes de enviar"
        >
          <Ionicons name="stop" size={16} color={cor} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.botaoRedondo, redondo, { backgroundColor: cor }]}
          onPress={enviarGravando}
          accessibilityLabel="Enviar gravação"
        >
          <Ionicons name="send" size={17} color={corIcone} />
        </TouchableOpacity>
      </View>
    );
  }

  // Revisando
  const total = (gravacao.current?.duracao ?? 0) / 1000;
  const progresso = total > 0 ? Math.min(1, posicao / total) : 0;
  return (
    <View style={[st.barra, { backgroundColor: corFundo }]}>
      <TouchableOpacity onPress={apagarRevisao} hitSlop={8} style={st.lixeira} accessibilityLabel="Apagar gravação">
        <Ionicons name="trash" size={18} color="#E53935" />
      </TouchableOpacity>
      <TouchableOpacity onPress={alternarOuvir} hitSlop={8} accessibilityLabel={tocando ? 'Pausar' : 'Ouvir gravação'}>
        <Ionicons name={tocando ? 'pause' : 'play'} size={24} color={cor} />
      </TouchableOpacity>
      <Onda niveis={niveis.current} cor={cor} corApagada={corTexto} progresso={tocando || posicao > 0 ? progresso : 0} />
      <Text style={[st.tempoPequeno, { color: corTexto }]}>
        {formatarTempo(tocando || posicao > 0 ? posicao : total)}
      </Text>
      <TouchableOpacity onPress={regravar} hitSlop={8} accessibilityLabel="Regravar">
        <Ionicons name="mic-outline" size={22} color={corTexto} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[st.botaoRedondo, redondo, { backgroundColor: cor }]}
        onPress={enviarRevisao}
        accessibilityLabel="Enviar gravação"
      >
        <Ionicons name="send" size={17} color={corIcone} />
      </TouchableOpacity>
    </View>
  );
}

// ─── A onda ─────────────────────────────────────────────────────────────────
// Ao vivo: as leituras mais recentes, entrando pela direita.
// Na revisão: a gravação inteira resumida na largura disponível, e as barras
// já tocadas ficam na cor do chat (como o WhatsApp).
const BARRA = 3;
const ESPACO = 2;
const ALTURA = 26;

function Onda({
  niveis, cor, corApagada, progresso, aoVivo = false,
}: {
  niveis: number[]; cor: string; corApagada: string; progresso: number; aoVivo?: boolean;
}) {
  const [largura, setLargura] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setLargura(e.nativeEvent.layout.width);
  const cabem = Math.max(1, Math.floor((largura + ESPACO) / (BARRA + ESPACO)));

  let barras: number[];
  if (aoVivo) {
    barras = niveis.slice(-cabem);
  } else if (niveis.length <= cabem) {
    barras = niveis;
  } else {
    // Resume: o pico de cada fatia, para as falas não sumirem na média.
    barras = [];
    const passo = niveis.length / cabem;
    for (let i = 0; i < cabem; i++) {
      const fatia = niveis.slice(Math.floor(i * passo), Math.max(Math.floor((i + 1) * passo), Math.floor(i * passo) + 1));
      barras.push(Math.max(...fatia));
    }
  }
  const tocadas = Math.round(barras.length * progresso);

  return (
    <View style={st.onda} onLayout={onLayout}>
      {barras.map((n, i) => (
        <View
          key={i}
          style={{
            width: BARRA,
            height: Math.max(3, Math.round(n * ALTURA)),
            borderRadius: BARRA / 2,
            marginRight: ESPACO,
            backgroundColor: aoVivo || i < tocadas ? cor : corApagada,
            opacity: aoVivo || i < tocadas ? 1 : 0.35,
          }}
        />
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  botaoRedondo: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  botaoContorno: { borderWidth: 2, backgroundColor: 'transparent' },
  barra: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, paddingLeft: 6 },
  lixeira: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(229,57,53,0.14)', alignItems: 'center', justifyContent: 'center' },
  onda: { flex: 1, height: ALTURA, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  meio: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  revisaoMeio: { flex: 1, gap: 4 },
  ponto: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53935' },
  tempo: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tempoPequeno: { fontSize: 11, fontVariant: ['tabular-nums'] },
  trilho: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progresso: { height: 4, borderRadius: 2 },
  rotulo: { fontSize: 12, opacity: 0.7, flexShrink: 1 },
});
