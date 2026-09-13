// Tradução ao vivo do culto — tela do app (v2, integrada ao repo real em 24 Ago 2026)
//
// Segue o mesmo padrão visual/estrutural de DevocionaisScreen.tsx (também um
// modal registrado em App.tsx): paleta escura fixa, header com botão de
// fechar, corpo em ScrollView. Não usa o hook useTheme()/paletaHome() das
// telas de abas principais — mantém consistência com o outro modal simples.
//
// Áudio: usa `expo-audio` (não `expo-av`, que foi removido — o projeto está
// no Expo SDK 54). O player, a fila e a assinatura do canal de áudio vivem
// em `lib/traducaoAoVivoAudio.ts` — um serviço "singleton" fora do ciclo de
// vida dessa tela, de propósito: assim o áudio CONTINUA tocando se a pessoa
// fechar essa tela (modal) e for olhar a Bíblia, fazer uma oferta, etc. Só
// para de verdade quando volta aqui e aperta "Stop" — nunca sozinho ao sair
// da tela. Testado e confirmado funcionando (25/08) — a fila toca em
// sequência sem travar, com legenda em inglês acompanhando.
//
// Textos fixos em inglês de propósito (não usam t()), igual ao botão da Home
// que abre essa tela: quem procura essa tela é justamente quem não fala
// português, então precisa ler em inglês mesmo com o app em pt-BR.
//
// O que essa tela faz:
// 1. Verifica se existe uma sessão de tradução ativa agora (tabela
//    traducao_ao_vivo) e assina mudanças em tempo real nela.
// 2. Quando o usuário toca em "Listen to translation", chama
//    `traducaoAudioService.iniciar()`, que assina o canal de broadcast
//    "traducao-audio" e toca cada trecho de áudio traduzido em fila, na
//    ordem em que chegam. Essa tela só reflete o estado atual do serviço
//    (ouvindo / legenda) — não é dona do player.

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { traducaoAudioService } from '../lib/traducaoAoVivoAudio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Waveform decorativa (tipo equalizer de estúdio, espelhada no centro) ──
// Puramente visual — não reage ao áudio de verdade (não temos acesso fácil
// à forma de onda em tempo real via expo-audio, e adicionar uma lib nova de
// gráfico/SVG pra isso exigiria outro build nativo). Cada barrinha é fina,
// centralizada, e cresce simetricamente pra cima E pra baixo (scaleY a
// partir do centro) — é isso que dá o efeito de onda espelhada tipo
// equalizer de estúdio, com uma linha de base brilhante cruzando no meio.
// Timing levemente aleatório entre barras pra não ficar sincronizado/robótico.
const NUM_BARRAS = 28;

// Gradiente roxo → rosa → laranja → dourado (combina com o header #1A1740
// e reaproveita as cores da marca #E84B1A / #F5C842 na ponta).
const PARADAS_GRADIENTE: [number, number, number][] = [
  [124, 58, 237], // #7C3AED roxo
  [236, 72, 153], // #EC4899 rosa
  [232, 75, 26], // #E84B1A laranja (marca)
  [245, 200, 66], // #F5C842 dourado (marca)
];

function corDoGradiente(t: number) {
  const posicao = t * (PARADAS_GRADIENTE.length - 1);
  const indice = Math.min(Math.floor(posicao), PARADAS_GRADIENTE.length - 2);
  const fracao = posicao - indice;
  const [r1, g1, b1] = PARADAS_GRADIENTE[indice];
  const [r2, g2, b2] = PARADAS_GRADIENTE[indice + 1];
  const r = Math.round(r1 + (r2 - r1) * fracao);
  const g = Math.round(g1 + (g2 - g1) * fracao);
  const b = Math.round(b1 + (b2 - b1) * fracao);
  return `rgb(${r}, ${g}, ${b})`;
}

const CORES_BARRAS = Array.from({ length: NUM_BARRAS }, (_, i) => corDoGradiente(i / (NUM_BARRAS - 1)));

function DigitalEqualizer() {
  const barras = useRef(CORES_BARRAS.map(() => new Animated.Value(0.12))).current;

  useEffect(() => {
    const loops = barras.map((barra) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(barra, {
            toValue: 0.3 + Math.random() * 0.7,
            duration: 300 + Math.random() * 300,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(barra, {
            toValue: 0.08 + Math.random() * 0.22,
            duration: 300 + Math.random() * 300,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      )
    );

    const timers = loops.map((loop, i) => setTimeout(() => loop.start(), i * 45));

    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((loop) => loop.stop());
    };
  }, [barras]);

  return (
    <View style={styles.equalizer} pointerEvents="none">
      <View style={styles.equalizerLinhaBase} />
      {barras.map((barra, i) => (
        <Animated.View
          key={i}
          style={[
            styles.equalizerBarra,
            {
              backgroundColor: CORES_BARRAS[i],
              shadowColor: CORES_BARRAS[i],
              transform: [{ scaleY: barra }],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function TraducaoAoVivoScreen({ navigation }: { navigation?: any }) {
  const [sessaoAtiva, setSessaoAtiva] = useState(false);

  // Não é state local — reflete o serviço singleton (lib/traducaoAoVivoAudio),
  // que continua tocando mesmo quando essa tela desmonta. `forceUpdate` só
  // existe pra re-renderizar quando o serviço avisa que algo mudou.
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  useEffect(() => traducaoAudioService.assinar(forceUpdate), []);
  const ouvindo = traducaoAudioService.ouvindo;
  const legendaAtual = traducaoAudioService.legendaAtual;

  // Descobre (e acompanha em tempo real) se existe tradução ativa agora.
  useEffect(() => {
    let ativo = true;

    const carregarStatus = async () => {
      const { data } = await supabase
        .from('traducao_ao_vivo')
        .select('ativa')
        .eq('id', 1)
        .maybeSingle();
      if (ativo) setSessaoAtiva(!!data?.ativa);
    };
    carregarStatus();

    const canalStatus = supabase
      .channel('traducao-status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'traducao_ao_vivo' },
        (payload) => {
          const nova = payload.new as { ativa?: boolean } | null;
          setSessaoAtiva(!!nova?.ativa);
        }
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canalStatus);
    };
  }, []);

  const iniciarEscuta = useCallback(() => {
    traducaoAudioService.iniciar();
  }, []);

  const pararEscuta = useCallback(() => {
    traducaoAudioService.parar();
  }, []);

  // De propósito: SEM cleanup parando o áudio ao desmontar essa tela. É
  // exatamente isso que deixa a tradução continuar tocando quando a pessoa
  // fecha esse modal e vai olhar outra aba — ver comentário do topo do
  // arquivo e de lib/traducaoAoVivoAudio.ts.

  // `paddingTop` fixo em 55 dava um respiro engraçado em aparelho sem
  // entalhe e apertava o título contra o relógio nos iPhone mais novos. A
  // área segura é a medida real do aparelho.
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.headerTitulo}>Live Translation</Text>
        </View>
        {navigation && (
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>
        {!sessaoAtiva && (
          <View style={styles.empty}>
            <Ionicons name="headset-outline" size={40} color="rgba(255,255,255,0.25)" />
            <Text style={styles.semSessao}>No live translation right now.</Text>
          </View>
        )}

        {sessaoAtiva && (
          <>
            <DigitalEqualizer />

            <Text style={styles.ativa}>Live translation available now — Portuguese → English</Text>

            <TouchableOpacity
              style={[styles.botao, ouvindo && styles.botaoAtivo]}
              onPress={ouvindo ? pararEscuta : iniciarEscuta}
            >
              {ouvindo && <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />}
              <Text style={[styles.botaoTexto, ouvindo && styles.botaoTextoAtivo]}>
                {ouvindo ? 'Stop' : 'Listen to translation'}
              </Text>
            </TouchableOpacity>

            {ouvindo && legendaAtual ? (
              <Text style={styles.legenda}>{legendaAtual}</Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0B22' },
  header: {
    backgroundColor: '#1A1740', paddingBottom: 16, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitulo: { fontSize: 18, fontWeight: '700', color: '#fff' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  semSessao: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center' },
  equalizer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3, height: 90, marginBottom: 28, position: 'relative',
  },
  equalizerLinhaBase: {
    position: 'absolute', left: 8, right: 8, height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  equalizerBarra: {
    width: 4, height: 84, borderRadius: 2,
    shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  ativa: { fontSize: 15, color: '#4ADE80', textAlign: 'center', marginBottom: 24, paddingHorizontal: 12, fontWeight: '600' },
  botao: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F5C842',
  },
  botaoAtivo: { backgroundColor: '#E84B1A' },
  botaoTexto: { color: '#1A1740', fontWeight: '700', fontSize: 16 },
  botaoTextoAtivo: { color: '#fff' },
  legenda: { marginTop: 24, fontSize: 16, color: '#fff', textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 16, lineHeight: 22 },
});
