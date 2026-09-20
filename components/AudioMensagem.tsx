import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { urlDoAudio, formatarTempo } from '../lib/chatAudio';

// Bolha de mensagem de voz: play/pausa, barra de progresso e tempo.
//
// Um áudio por vez no chat inteiro: quem controla é o pai, pelo `ativo`.
// Tocar outro áudio desliga este (ativo vira false → pausa e solta o player).
// O player só é criado no primeiro toque — criar um por mensagem ao abrir o
// chat baixaria todos os áudios da conversa sem ninguém pedir.
export default function AudioMensagem({
  caminho, duracaoMs, ativo, onAtivar, onTerminar, corTexto, corTrilho, corProgresso, onLongPress,
}: {
  caminho: string;
  duracaoMs: number | null;
  ativo: boolean;
  onAtivar: () => void;
  onTerminar: () => void;
  corTexto: string;
  corTrilho: string;
  corProgresso: string;
  onLongPress?: () => void;
}) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [total, setTotal] = useState((duracaoMs ?? 0) / 1000);
  const [erro, setErro] = useState(false);

  const soltar = () => {
    const p = playerRef.current;
    playerRef.current = null;
    if (p) { try { p.pause(); p.remove(); } catch { /* já liberado */ } }
    setTocando(false);
  };

  // Outro áudio começou (ou o chat fechou): para este.
  useEffect(() => { if (!ativo) soltar(); }, [ativo]);
  useEffect(() => () => soltar(), []);

  const alternar = async () => {
    const p = playerRef.current;
    if (p) {
      if (p.playing) { p.pause(); setTocando(false); } else { p.play(); setTocando(true); }
      return;
    }
    setErro(false);
    setCarregando(true);
    onAtivar();
    try {
      // Sem `playsInSilentMode`, no iPhone com a chave de silêncio ligada o
      // áudio "toca" mudo e parece defeito. `allowsRecording: false` devolve a
      // saída para o alto-falante depois de uma gravação (senão vai pro fone
      // de ouvido, baixinho).
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const url = await urlDoAudio(caminho);
      const novo = createAudioPlayer({ uri: url }, { updateInterval: 250 });
      playerRef.current = novo;
      novo.addListener('playbackStatusUpdate', st => {
        if (playerRef.current !== novo) return;
        if (st.duration > 0) setTotal(st.duration);
        setAtual(st.currentTime);
        if (st.isLoaded) setCarregando(false);
        if (st.didJustFinish) {
          soltar();
          setAtual(0);
          onTerminar();
        }
      });
      novo.play();
      setTocando(true);
    } catch {
      setCarregando(false);
      setErro(true);
      soltar();
    }
  };

  const progresso = total > 0 ? Math.min(1, atual / total) : 0;
  const icone = erro ? 'alert-circle' : tocando ? 'pause' : 'play';

  return (
    <TouchableOpacity
      style={st.linha}
      onPress={alternar}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={tocando ? 'Pausar mensagem de voz' : 'Tocar mensagem de voz'}
    >
      <View style={[st.botao, { borderColor: corTexto }]}>
        {carregando && tocando
          ? <ActivityIndicator size="small" color={corTexto} />
          : <Ionicons name={icone} size={18} color={corTexto} style={icone === 'play' ? { marginLeft: 2 } : undefined} />}
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={[st.trilho, { backgroundColor: corTrilho }]}>
          <View style={[st.progresso, { width: `${progresso * 100}%`, backgroundColor: corProgresso }]} />
        </View>
        <Text style={[st.tempo, { color: corTexto }]}>
          {erro ? 'Não foi possível tocar. Toque para tentar de novo.'
            : formatarTempo(tocando || atual > 0 ? atual : total)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200, paddingVertical: 2 },
  botao: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  trilho: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progresso: { height: 4, borderRadius: 2 },
  tempo: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
