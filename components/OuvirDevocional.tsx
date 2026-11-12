// components/OuvirDevocional.tsx
//
// "Ouvir o devocional" (pedido do Marcos, 11/11/2026): para quem não pode ler
// — trabalhando, dirigindo. Toca no idioma do app (voz neural gerada pela
// função `devocional-audio`, ou o áudio gravado pelo pastor, em português).
// Continua tocando com a tela apagada (app 1.5.3) e aparece na tela de
// bloqueio quando o app permite.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { supabase } from '../lib/supabase';
import { formatarTempo } from '../lib/chatAudio';
import { aplicarSaida, sensorDeProximidade } from '../lib/saidaAudio';

const VELOCIDADES = [1, 1.25, 1.5, 0.85];

// Só um devocional tocando por vez no app inteiro.
let tocandoAgora: AudioPlayer | null = null;

async function pedirAudio(devocionalId: string, lang: string, soVerificar: boolean) {
  const { data, error } = await supabase.functions.invoke('devocional-audio', {
    body: { devocional_id: devocionalId, lang, so_verificar: soVerificar },
  });
  if (error) {
    let corpo: any = null;
    try { corpo = await (error as any)?.context?.json?.(); } catch { /* sem corpo */ }
    return { disponivel: !!corpo?.disponivel, erro: corpo?.error ?? 'erro' } as { disponivel: boolean; url?: string; erro?: string };
  }
  return data as { disponivel: boolean; url?: string; proprio?: boolean; erro?: string };
}

export default function OuvirDevocional({ devocionalId, titulo, cor = '#F5C842', corTexto = '#fff' }: {
  devocionalId: string; titulo: string; cor?: string; corTexto?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = ['pt', 'en', 'es', 'fr'].includes(i18n.language) ? i18n.language : 'pt';
  const [disponivel, setDisponivel] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [total, setTotal] = useState(0);
  const [vel, setVel] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const player = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    let vivo = true;
    pedirAudio(devocionalId, lang, true).then(r => { if (vivo) setDisponivel(!!r?.disponivel); });
    return () => { vivo = false; };
  }, [devocionalId, lang]);

  const soltar = () => {
    const p = player.current;
    player.current = null;
    if (p) {
      try { (p as any).setActiveForLockScreen?.(false); } catch { /* app antigo */ }
      try { p.pause(); p.remove(); } catch { /* já liberado */ }
      if (tocandoAgora === p) tocandoAgora = null;
    }
    setTocando(false);
  };
  useEffect(() => () => soltar(), []);

  // Sensor de proximidade enquanto o devocional toca (pedido do Marcos,
  // 12/11/2026): encostar o celular no rosto apaga a tela e passa o som para
  // o ouvido, para ouvir no ônibus sem fone. Afastar volta ao alto-falante.
  // Só no app 1.5.3 em diante; no antigo o módulo não existe e nada muda.
  useEffect(() => {
    if (!tocando) return;
    sensorDeProximidade(true, { soSensor: true }).then(() => aplicarSaida({ soSensor: true }));
    return () => { sensorDeProximidade(false); };
  }, [tocando]);
  useEffect(() => { soltar(); setAtual(0); setTotal(0); }, [lang]);

  const alternar = async () => {
    const p = player.current;
    if (p) {
      if (p.playing) { p.pause(); setTocando(false); } else { p.play(); setTocando(true); }
      return;
    }
    setErro(null);
    setPreparando(true);
    const r = await pedirAudio(devocionalId, lang, false);
    if (!r?.url) {
      setPreparando(false);
      setErro(r?.erro === 'traducao_indisponivel' ? t('devocionais.audioSemTraducao') : t('devocionais.audioErro'));
      return;
    }
    try {
      // Mesmo modo de áudio do chat (silencioso, tela apagada); com o
      // sensor longe do rosto, sai pelo alto-falante.
      await aplicarSaida({ soSensor: true });
      if (tocandoAgora) { try { tocandoAgora.pause(); } catch { /* */ } }
      const novo = createAudioPlayer({ uri: r.url }, { updateInterval: 500 });
      player.current = novo;
      tocandoAgora = novo;
      novo.setPlaybackRate(VELOCIDADES[vel]);
      novo.addListener('playbackStatusUpdate', st => {
        if (player.current !== novo) return;
        if (st.duration > 0) setTotal(st.duration);
        setAtual(st.currentTime);
        if (st.isLoaded) setPreparando(false);
        if (st.didJustFinish) { soltar(); setAtual(0); }
      });
      try { (novo as any).setActiveForLockScreen?.(true, { title: titulo, artist: 'Peniel Church' }); } catch { /* app antigo */ }
      novo.play();
      setTocando(true);
    } catch {
      setPreparando(false);
      setErro(t('devocionais.audioErro'));
      soltar();
    }
  };

  const pular = (s: number) => {
    const p = player.current;
    if (!p) return;
    p.seekTo(Math.max(0, Math.min((total || 0) - 1, atual + s)));
  };
  const trocarVel = () => {
    const n = (vel + 1) % VELOCIDADES.length;
    setVel(n);
    player.current?.setPlaybackRate(VELOCIDADES[n]);
  };

  if (!disponivel) return null;
  const progresso = total > 0 ? Math.min(1, atual / total) : 0;

  return (
    <View style={[st.caixa, { backgroundColor: cor + '1F', borderColor: cor + '55' }]}>
      <View style={st.linha}>
        <TouchableOpacity onPress={alternar} style={[st.play, { backgroundColor: cor }]} disabled={preparando && !player.current}>
          {preparando ? <ActivityIndicator color="#1A1740" /> : <Ionicons name={tocando ? 'pause' : 'play'} size={20} color="#1A1740" />}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[st.rotulo, { color: corTexto }]}>
            🎧 {preparando && !player.current ? t('devocionais.audioPreparando') : t('devocionais.ouvir')}
          </Text>
          <View style={[st.trilho, { backgroundColor: corTexto + '33' }]}>
            <View style={[st.cheio, { width: `${progresso * 100}%`, backgroundColor: cor }]} />
          </View>
          <Text style={[st.tempo, { color: corTexto + 'AA' }]}>
            {formatarTempo(atual)}{total > 0 ? ` / ${formatarTempo(total)}` : ''}
          </Text>
        </View>
        {!!player.current && (
          <>
            <TouchableOpacity onPress={() => pular(-15)} hitSlop={6}><Ionicons name="play-back" size={18} color={corTexto} /></TouchableOpacity>
            <TouchableOpacity onPress={() => pular(15)} hitSlop={6}><Ionicons name="play-forward" size={18} color={corTexto} /></TouchableOpacity>
          </>
        )}
        <TouchableOpacity onPress={trocarVel} style={[st.vel, { borderColor: corTexto + '55' }]}>
          <Text style={{ color: corTexto, fontWeight: '800', fontSize: 11 }}>{VELOCIDADES[vel]}x</Text>
        </TouchableOpacity>
      </View>
      {!!erro && <Text style={[st.tempo, { color: '#FF8A80', marginTop: 6 }]}>{erro}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  caixa: { borderRadius: 14, borderWidth: 1, padding: 10, marginTop: 12 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rotulo: { fontSize: 13, fontWeight: '700', marginBottom: 5 },
  trilho: { height: 4, borderRadius: 2, overflow: 'hidden' },
  cheio: { height: 4, borderRadius: 2 },
  tempo: { fontSize: 11, marginTop: 3 },
  vel: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
});
