import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import {
  useAudioRecorder, useAudioRecorderState, requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio';
import { OPCOES_GRAVACAO, AUDIO_MAX_SEGUNDOS, formatarTempo } from '../lib/chatAudio';

// Botão de microfone + barra de gravação do chat.
//
// Toque para começar, toque em enviar para mandar, lixeira para descartar —
// e não "segurar para gravar": segurar exige manter o dedo parado por um
// minuto, e é justamente o gesto que mais falha em quem tem menos
// intimidade com o celular.
//
// SÓ MONTAR QUANDO `binarioPodeGravarAudio()`: o hook cria o gravador nativo
// na montagem, e o pedido de microfone num binário sem a permissão fecha o app.
export default function GravadorAudio({
  cor, corTexto, corFundo, onComecar, onGravado, onGravandoMudou,
}: {
  cor: string;
  corTexto: string;
  corFundo: string;
  onComecar: () => void;
  onGravado: (uri: string, duracaoMs: number) => void;
  onGravandoMudou: (gravando: boolean) => void;
}) {
  const recorder = useAudioRecorder(OPCOES_GRAVACAO);
  const estado = useAudioRecorderState(recorder, 200);
  const [gravando, setGravando] = useState(false);
  const finalizando = useRef(false);
  const pulso = useRef(new Animated.Value(1)).current;

  useEffect(() => { onGravandoMudou(gravando); }, [gravando]);

  useEffect(() => {
    if (!gravando) return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 0.25, duration: 600, useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [gravando]);

  const devolverSaidaDeSom = () =>
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});

  const comecar = async () => {
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
    try {
      onComecar();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      finalizando.current = false;
      setGravando(true);
    } catch (e: any) {
      devolverSaidaDeSom();
      Alert.alert('Não foi possível gravar', e?.message ?? 'Tente de novo.');
    }
  };

  const terminar = async (enviar: boolean) => {
    if (finalizando.current) return;
    finalizando.current = true;
    const duracao = recorder.getStatus().durationMillis || estado.durationMillis;
    try { await recorder.stop(); } catch { /* já parado */ }
    setGravando(false);
    devolverSaidaDeSom();
    const uri = recorder.uri;
    if (!uri) return;
    // Menos de 1 s é quase sempre toque sem querer.
    if (!enviar || duracao < 1000) {
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      return;
    }
    onGravado(uri, Math.round(duracao));
  };

  // Chegou no limite: envia sozinho, como o WhatsApp faz.
  useEffect(() => {
    if (gravando && estado.durationMillis >= AUDIO_MAX_SEGUNDOS * 1000) terminar(true);
  }, [gravando, estado.durationMillis]);

  // Fechar o chat no meio de uma gravação descarta.
  useEffect(() => () => {
    if (!finalizando.current && recorder.isRecording) {
      recorder.stop().catch(() => {});
      devolverSaidaDeSom();
    }
  }, []);

  if (!gravando) {
    return (
      <TouchableOpacity
        style={[st.botaoRedondo, { backgroundColor: cor }]}
        onPress={comecar}
        accessibilityRole="button"
        accessibilityLabel="Gravar mensagem de voz"
      >
        <Ionicons name="mic" size={19} color="#fff" />
      </TouchableOpacity>
    );
  }

  return (
    <View style={[st.barra, { backgroundColor: corFundo }]}>
      <TouchableOpacity onPress={() => terminar(false)} hitSlop={10} accessibilityLabel="Descartar gravação">
        <Ionicons name="trash-outline" size={22} color="#C0392B" />
      </TouchableOpacity>
      <View style={st.meio}>
        <Animated.View style={[st.ponto, { opacity: pulso }]} />
        <Text style={[st.tempo, { color: corTexto }]}>{formatarTempo(estado.durationMillis / 1000)}</Text>
        <Text style={[st.rotulo, { color: corTexto }]} numberOfLines={1}>
          Gravando… máx. {formatarTempo(AUDIO_MAX_SEGUNDOS)}
        </Text>
      </View>
      <TouchableOpacity
        style={[st.botaoRedondo, { backgroundColor: cor }]}
        onPress={() => terminar(true)}
        accessibilityLabel="Enviar gravação"
      >
        <Ionicons name="send" size={17} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  botaoRedondo: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  barra: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 19, paddingLeft: 14 },
  meio: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ponto: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53935' },
  tempo: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rotulo: { fontSize: 12, opacity: 0.7, flexShrink: 1 },
});
