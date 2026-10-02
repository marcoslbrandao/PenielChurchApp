import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useTheme } from '../lib/theme';
import { paletaBanda, type BandaColors } from '../lib/temaBanda';

// ─── Metrônomo ───────────────────────────────────────────────────────────────
// Abre já no BPM da música que o músico estava olhando, que é o ponto: hoje ele
// larga o app, abre um metrônomo qualquer e digita o número na mão.
//
// Sobre a precisão: `setInterval` acumula erro — a cada batida o JavaScript
// chega um pouco atrasado, e num andamento de 4 minutos o clique já saiu do
// lugar. Aqui cada batida é agendada a partir de um instante ABSOLUTO
// (`inicioRef` + n × intervalo), então o atraso de uma batida não empurra as
// seguintes. É a mesma ideia de um relógio que corrige a hora em vez de contar
// segundos.

// O metrônomo usa a mesma paleta da aba Banda, que segue o tema do app.
// Só existem dois temas, então os estilos de cada um são montados uma vez e
// ficam guardados aqui — a paleta em si é barata e sai do `paletaBanda`.
const estilos: { light?: ReturnType<typeof buildM>; dark?: ReturnType<typeof buildM> } = {};
function useTemaMetronomo() {
  const { isDark } = useTheme();
  return useMemo(() => {
    const chave = isDark ? 'dark' : 'light';
    const C = paletaBanda(isDark);
    if (!estilos[chave]) estilos[chave] = buildM(C);
    return { C, m: estilos[chave]! };
  }, [isDark]);
}

const BPM_MIN = 30;
const BPM_MAX = 300;
const COMPASSOS = [2, 3, 4, 6] as const;

export default function MetronomoModal({ visible, onClose, bpmInicial, titulo }: {
  visible: boolean;
  onClose: () => void;
  bpmInicial?: number | null;
  titulo?: string;
}) {
  const { C, m } = useTemaMetronomo();
  const { t } = useTranslation();
  const [bpm, setBpm] = useState(100);
  const [compasso, setCompasso] = useState<number>(4);
  const [tocando, setTocando] = useState(false);
  const [tempoAtual, setTempoAtual] = useState(0);

  // Três players por som, usados em rodízio. `seekTo` é assíncrono e um player
  // que acabou de tocar pode não estar pronto pra tocar de novo; num andamento
  // rápido isso vira clique mudo ou intermitente. Alternando, cada player tem
  // tempo de sobra pra voltar ao começo antes da próxima vez.
  const fortesRef = useRef<AudioPlayer[]>([]);
  const fracosRef = useRef<AudioPlayer[]>([]);
  const rodizioRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Instante ABSOLUTO da próxima batida. Cada agendamento parte do alvo
  // anterior, não do "agora", então o atraso de uma batida não empurra as
  // seguintes — é o que impede a deriva de um `setInterval` comum.
  const proximaRef = useRef(0);
  const batidaRef = useRef(0);
  // O laço de agendamento lê BPM e compasso destas refs: se lesse do state,
  // mexer no andamento com o metrônomo ligado só valeria na próxima vez que o
  // efeito rodasse — e ele não roda a cada batida.
  const bpmRef = useRef(bpm);
  const compassoRef = useRef(compasso);
  const toquesRef = useRef<number[]>([]);

  const pulso = useRef(new Animated.Value(0)).current;

  // Mudar o andamento reancora a contagem: sem isto, as batidas já acumuladas
  // no ritmo antigo eram multiplicadas pelo intervalo novo, e subir de 60 pra
  // 120 depois de 10 segundos jogava o alvo 4,5 s pro passado — rajada de
  // cliques. No sentido inverso, dava 11 segundos de silêncio.
  // Mudar o andamento reancora a próxima batida e recria o timer pendente. Sem
  // recriar, o timer antigo continuava marcado pro alvo do BPM velho e, ao
  // disparar, encontrava vários alvos novos já vencidos de uma vez — três ou
  // quatro cliques colados.
  useEffect(() => {
    bpmRef.current = bpm;
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    const intervalo = 60000 / bpm;
    proximaRef.current = Date.now() + intervalo;
    timerRef.current = setTimeout(() => agendarRef.current(), intervalo);
  }, [bpm]);
  useEffect(() => { compassoRef.current = compasso; }, [compasso]);

  // Abre no BPM da música. Só quando o modal abre — mexer no andamento depois
  // não pode ser desfeito por um re-render.
  useEffect(() => {
    if (!visible) return;
    const inicial = Math.round(bpmInicial ?? 0);
    // Sem `else`, uma música sem BPM cadastrado abriria mostrando o andamento
    // da música anterior — e o músico assumiria que era o dela.
    setBpm(inicial >= BPM_MIN && inicial <= BPM_MAX ? inicial : 100);
    toquesRef.current = [];
  }, [visible, bpmInicial]);

  // Carrega os dois cliques uma vez. `playsInSilentMode` porque músico ensaia
  // com o telefone no silencioso e não entenderia o silêncio como escolha dele.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        if (!vivo) return;
        fortesRef.current = [0, 1, 2].map(() => createAudioPlayer(require('../assets/metronome-forte.wav')));
        fracosRef.current = [0, 1, 2].map(() => createAudioPlayer(require('../assets/metronome-fraco.wav')));
      } catch {
        // Sem áudio o metrônomo ainda serve: o círculo continua pulsando no
        // tempo certo, então dá pra usar no olho.
      }
    })();
    return () => {
      vivo = false;
      [...fortesRef.current, ...fracosRef.current].forEach(pl => {
        try { pl.remove(); } catch { /* já liberado */ }
      });
      fortesRef.current = [];
      fracosRef.current = [];
    };
  }, []);

  const bater = useCallback((primeiroTempo: boolean) => {
    const pool = primeiroTempo ? fortesRef.current : fracosRef.current;
    const player = pool.length ? pool[rodizioRef.current % pool.length] : null;
    rodizioRef.current += 1;
    try {
      if (player) { player.seekTo(0); player.play(); }
    } catch {
      // Um clique perdido não pode derrubar o laço inteiro.
    }
    pulso.setValue(1);
    Animated.timing(pulso, { toValue: 0, duration: 120, useNativeDriver: true }).start();
  }, [pulso]);

  const parar = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setTocando(false);
    setTempoAtual(0);
    batidaRef.current = 0;
  }, []);

  // Guardado numa ref pra que o efeito do BPM consiga reagendar sem depender da
  // ordem de criação dos callbacks.
  const agendarRef = useRef<() => void>(() => {});

  const agendar = useCallback(() => {
    const n = batidaRef.current;
    const tempoNoCompasso = n % compassoRef.current;
    bater(tempoNoCompasso === 0);
    setTempoAtual(tempoNoCompasso);
    batidaRef.current = n + 1;

    const intervalo = 60000 / bpmRef.current;
    // O próximo alvo parte do alvo anterior (corrige a deriva), mas nunca pode
    // cair a menos de meia batida daqui. Esse piso é o que torna a rajada
    // estruturalmente impossível: se o app ficou minutos em segundo plano com
    // os timers suspensos, o metrônomo volta no tempo certo em vez de disparar
    // uma saraivada de cliques tentando recuperar o atraso.
    proximaRef.current = Math.max(proximaRef.current + intervalo, Date.now() + intervalo * 0.5);
    timerRef.current = setTimeout(() => agendarRef.current(), proximaRef.current - Date.now());
  }, [bater]);

  useEffect(() => { agendarRef.current = agendar; }, [agendar]);

  const comecar = useCallback(() => {
    batidaRef.current = 0;
    proximaRef.current = Date.now();
    setTocando(true);
    agendar();
  }, [agendar]);

  // Fechar o modal (ou desmontar) tem que calar o metrônomo — senão ele
  // continuaria batendo por trás da tela.
  useEffect(() => { if (!visible) parar(); }, [visible, parar]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Tap BPM: a média dos intervalos entre os últimos toques. Uma pausa longa
  // recomeça a contagem, senão o primeiro toque depois do café estragaria a média.
  const tapBpm = () => {
    const agora = Date.now();
    const toques = toquesRef.current;
    if (toques.length && agora - toques[toques.length - 1] > 2500) toques.length = 0;
    toques.push(agora);
    if (toques.length > 5) toques.shift();
    if (toques.length < 2) return;

    const intervalos = toques.slice(1).map((v, i) => v - toques[i]);
    const media = intervalos.reduce((a, b) => a + b, 0) / intervalos.length;
    const novo = Math.round(60000 / media);
    if (novo >= BPM_MIN && novo <= BPM_MAX) setBpm(novo);
  };

  const ajustar = (delta: number) =>
    setBpm(v => Math.min(BPM_MAX, Math.max(BPM_MIN, v + delta)));

  const escala = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <View style={{ flex: 1 }}>
              <Text style={m.titulo}>{t('banda.metronomo')}</Text>
              {!!titulo && <Text style={m.subtitulo} numberOfLines={1}>{titulo}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Marcadores do compasso */}
          <View style={m.tempos}>
            {Array.from({ length: compasso }).map((_, i) => (
              <View
                key={i}
                style={[
                  m.tempo,
                  i === 0 && m.tempoForte,
                  tocando && i === tempoAtual && m.tempoAtivo,
                ]}
              />
            ))}
          </View>

          {/* BPM */}
          <View style={m.bpmRow}>
            <TouchableOpacity style={m.bpmBtn} onPress={() => ajustar(-1)} onLongPress={() => ajustar(-10)}>
              <Ionicons name="remove" size={22} color={C.text} />
            </TouchableOpacity>
            <Animated.View style={[m.bpmCirculo, { transform: [{ scale: escala }] }]}>
              <Text style={m.bpmValor}>{bpm}</Text>
              <Text style={m.bpmLabel}>BPM</Text>
            </Animated.View>
            <TouchableOpacity style={m.bpmBtn} onPress={() => ajustar(1)} onLongPress={() => ajustar(10)}>
              <Ionicons name="add" size={22} color={C.text} />
            </TouchableOpacity>
          </View>
          <Text style={m.dicaBotoes}>{t('banda.metronomoDicaBotoes')}</Text>

          {/* Compasso */}
          <View style={m.compassoRow}>
            {COMPASSOS.map(c => (
              <TouchableOpacity
                key={c}
                style={[m.compassoPill, compasso === c && m.compassoPillAtivo]}
                onPress={() => setCompasso(c)}
              >
                <Text style={[m.compassoTexto, compasso === c && m.compassoTextoAtivo]}>{c}/4</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Controles */}
          <View style={m.controles}>
            <TouchableOpacity style={m.tapBtn} onPress={tapBpm} activeOpacity={0.7}>
              <Ionicons name="hand-left-outline" size={17} color={C.text} />
              <Text style={m.tapTexto}>{t('banda.tapBpm')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.playBtn, tocando && m.playBtnAtivo]}
              onPress={() => (tocando ? parar() : comecar())}
              activeOpacity={0.85}
            >
              <Ionicons name={tocando ? 'stop' : 'play'} size={26} color={tocando ? C.onStop : C.onPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={m.dicaTap}>{t('banda.tapBpmDica')}</Text>
        </View>
      </View>
    </Modal>
  );
}

const buildM = (C: BandaColors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: C.overlay },
  sheet: { flexShrink: 1, backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  titulo: { fontSize: 18, fontWeight: '800', color: C.text },
  subtitulo: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  tempos: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 22 },
  tempo: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border },
  tempoForte: { borderColor: C.textDim },
  tempoAtivo: { backgroundColor: C.primary, borderColor: C.primary },
  bpmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 26 },
  bpmBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  bpmCirculo: { width: 132, height: 132, borderRadius: 66, backgroundColor: C.primaryDim, borderWidth: 2, borderColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  bpmValor: { fontSize: 44, fontWeight: '800', color: C.onPrimaryDim, letterSpacing: -1 },
  bpmLabel: { fontSize: 11, color: C.onPrimaryDim, fontWeight: '700', letterSpacing: 1.5, marginTop: -2 },
  dicaBotoes: { fontSize: 10.5, color: C.textDim, textAlign: 'center', marginTop: 12 },
  compassoRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 20 },
  compassoPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border },
  compassoPillAtivo: { backgroundColor: C.primaryDim, borderColor: C.primary },
  compassoTexto: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  compassoTextoAtivo: { color: C.onPrimaryDim },
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 26 },
  tapBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, height: 52, borderRadius: 14, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border },
  tapTexto: { fontSize: 14, fontWeight: '700', color: C.text },
  playBtn: { width: 66, height: 66, borderRadius: 33, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  playBtnAtivo: { backgroundColor: C.stop },
  dicaTap: { fontSize: 10.5, color: C.textDim, textAlign: 'center', marginTop: 14 },
});
