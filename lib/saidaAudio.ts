// Por onde sai o som das mensagens de voz: alto-falante ou ouvido (pedido do
// Marcos, 11/10/2026 — "como no WhatsApp").
//
// O WhatsApp troca sozinho quando o celular encosta no rosto (sensor de
// proximidade). Esse sensor precisa de módulo nativo, que só entra num build
// novo; por enquanto a troca é por um botão na bolha do áudio que está
// tocando. A escolha vale para a sessão do app inteira (todos os chats) e
// volta para o alto-falante quando o app é aberto de novo.
//
// COMO CADA SISTEMA FAZ
// • iOS: categoria `playAndRecord` SEM a opção defaultToSpeaker toca pelo
//   receptor (o alto-falante de ligação). No expo-audio isso é
//   `allowsRecording: true`. Não liga o microfone — só muda a rota.
// • Android: `shouldRouteThroughEarpiece` (modo de comunicação, viva-voz
//   desligado).
// Outras telas que tocam som (metrônomo, tradução, Kids) chamam
// setAudioModeAsync sem estas opções, o que já devolve o alto-falante.
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';

export type Saida = 'altofalante' | 'ouvido';

let saidaAtual: Saida = 'altofalante';
const ouvintes = new Set<(s: Saida) => void>();

/** Aplica a rota escolhida. Chamar antes de tocar e sempre que trocar. */
export async function aplicarSaida(): Promise<void> {
  const ouvido = saidaAtual === 'ouvido';
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: ouvido && Platform.OS === 'ios',
    shouldRouteThroughEarpiece: ouvido && Platform.OS === 'android',
  }).catch(() => {});
}

export function alternarSaida(): void {
  saidaAtual = saidaAtual === 'altofalante' ? 'ouvido' : 'altofalante';
  ouvintes.forEach(f => f(saidaAtual));
  aplicarSaida();
}

export function useSaidaAudio(): Saida {
  const [s, setS] = useState<Saida>(saidaAtual);
  useEffect(() => {
    ouvintes.add(setS);
    return () => { ouvintes.delete(setS); };
  }, []);
  return s;
}
