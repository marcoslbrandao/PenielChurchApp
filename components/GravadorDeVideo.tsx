// components/GravadorDeVideo.tsx
//
// Câmera própria para gravar o vídeo dos Shorts (12/11/2026). A câmera do
// sistema (ImagePicker) grava no formato "IFrame" de edição, perto de 30 Mbps:
// 18 segundos já passavam de 50 MB. Aqui o expo-camera (app 1.5.3) grava em
// 720p H.264 a 2,5 Mbps: cerca de 19 MB por minuto, com qualidade boa para o
// YouTube. Só deve ser montado quando o módulo nativo ExpoCamera existe (o
// ShortsDoGrupo confere antes de carregar este arquivo).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

const BITRATE = 2_500_000;
const p2 = (n: number) => String(n).padStart(2, '0');

export default function GravadorDeVideo({ visivel, maxSegundos, onFechar, onGravado }: {
  visivel: boolean;
  maxSegundos: number;
  onFechar: () => void;
  onGravado: (v: { uri: string; duracao: number }) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView | null>(null);
  const [permCam, pedirCam] = useCameraPermissions();
  const [permMic, pedirMic] = useMicrophonePermissions();
  const [frente, setFrente] = useState(false);
  const [pronta, setPronta] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [seg, setSeg] = useState(0);
  const inicio = useRef(0);

  useEffect(() => {
    if (!visivel) { setGravando(false); setSeg(0); setPronta(false); return; }
    (async () => {
      const c = permCam?.granted ? permCam : await pedirCam();
      const m = permMic?.granted ? permMic : await pedirMic();
      if (!c?.granted || !m?.granted) {
        Alert.alert(t('shorts.titulo'), t('shorts.semCamera'));
        onFechar();
      }
    })();
  }, [visivel]);

  useEffect(() => {
    if (!gravando) return;
    const id = setInterval(() => setSeg(Math.floor((Date.now() - inicio.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [gravando]);

  const gravar = async () => {
    if (!camera.current || !pronta) return;
    inicio.current = Date.now();
    setSeg(0);
    setGravando(true);
    try {
      const r = await camera.current.recordAsync({
        maxDuration: maxSegundos,
        // No iPhone o bitrate só vale com o codec informado.
        ...(Platform.OS === 'ios' ? { codec: 'avc1' as const } : {}),
      });
      const duracao = Math.round((Date.now() - inicio.current) / 1000);
      setGravando(false);
      if (r?.uri) onGravado({ uri: r.uri, duracao });
    } catch (e: any) {
      setGravando(false);
      Alert.alert(t('shorts.titulo'), String(e?.message ?? t('shorts.erroEnvio')));
    }
  };
  const parar = () => { camera.current?.stopRecording(); };

  const liberado = !!permCam?.granted && !!permMic?.granted;

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={() => { if (!gravando) onFechar(); }}>
      <View style={s.tela}>
        {liberado ? (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            mode="video"
            facing={frente ? 'front' : 'back'}
            videoQuality="720p"
            videoBitrate={BITRATE}
            onCameraReady={() => setPronta(true)}
          />
        ) : (
          <ActivityIndicator color="#fff" style={{ marginTop: 120 }} />
        )}

        <View style={[s.topo, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={s.btnRedondo} onPress={onFechar} disabled={gravando}>
            <Ionicons name="close" size={24} color={gravando ? 'rgba(255,255,255,0.3)' : '#fff'} />
          </TouchableOpacity>
          <View style={[s.tempo, gravando && { backgroundColor: '#E53935' }]}>
            <Text style={s.tempoTexto}>
              {Math.floor(seg / 60)}:{p2(seg % 60)} / {Math.floor(maxSegundos / 60)}:{p2(maxSegundos % 60)}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={[s.base, { paddingBottom: insets.bottom + 24 }]}>
          <View style={{ width: 52 }} />
          <TouchableOpacity
            style={s.gatilhoFora}
            onPress={gravando ? parar : gravar}
            disabled={!pronta}
            accessibilityLabel={gravando ? t('shorts.pararGravacao') : t('shorts.gravar')}
          >
            <View style={gravando ? s.gatilhoParar : s.gatilhoGravar} />
          </TouchableOpacity>
          <TouchableOpacity style={s.btnRedondo} onPress={() => setFrente(f => !f)} disabled={gravando} accessibilityLabel={t('shorts.virarCamera')}>
            <Ionicons name="camera-reverse-outline" size={26} color={gravando ? 'rgba(255,255,255,0.3)' : '#fff'} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#000' },
  topo: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  btnRedondo: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  tempo: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)' },
  tempoTexto: { color: '#fff', fontWeight: '700', fontVariant: ['tabular-nums'] },
  base: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 },
  gatilhoFora: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  gatilhoGravar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E53935' },
  gatilhoParar: { width: 30, height: 30, borderRadius: 6, backgroundColor: '#E53935' },
});
