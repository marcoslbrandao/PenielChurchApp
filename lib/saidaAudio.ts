// Por onde sai o som das mensagens de voz: alto-falante ou ouvido (pedido do
// Marcos, 11/10/2026 — "como no WhatsApp").
//
// Duas formas de ir para o ouvido:
// • Botão na bolha do áudio que está tocando (escolha manual). Vale para a
//   sessão do app inteira (todos os chats) e volta para o alto-falante quando
//   o app é aberto de novo.
// • Sensor de proximidade (build 1.5.3, módulo local `modules/proximidade`):
//   enquanto um áudio toca, encostar o celular no rosto apaga a tela e passa o
//   som para o ouvido; afastar volta para a escolha manual. Como no WhatsApp.
//   Em binário antigo o módulo não existe e só o botão funciona.
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
import Proximidade from '../modules/proximidade';

export type Saida = 'altofalante' | 'ouvido';

let saidaManual: Saida = 'altofalante';
let pertoDoRosto = false;
const ouvintes = new Set<(s: Saida) => void>();

function saidaEfetiva(): Saida {
  return pertoDoRosto ? 'ouvido' : saidaManual;
}

function avisar() {
  const s = saidaEfetiva();
  ouvintes.forEach(f => f(s));
}

/** Aplica a rota escolhida. Chamar antes de tocar e sempre que trocar. */
export async function aplicarSaida(): Promise<void> {
  const ouvido = saidaEfetiva() === 'ouvido';
  await setAudioModeAsync({
    playsInSilentMode: true,
    // Áudio do chat continua se a pessoa apagar a tela (UIBackgroundModes
    // audio, build 1.5.3).
    shouldPlayInBackground: true,
    allowsRecording: ouvido && Platform.OS === 'ios',
    shouldRouteThroughEarpiece: ouvido && Platform.OS === 'android',
  }).catch(() => {});
}

export function alternarSaida(): void {
  saidaManual = saidaManual === 'altofalante' ? 'ouvido' : 'altofalante';
  avisar();
  aplicarSaida();
}

let assinatura: { remove(): void } | null = null;

/** Liga o sensor de proximidade enquanto um áudio toca; desliga ao parar. */
export async function sensorDeProximidade(ligar: boolean): Promise<void> {
  if (!Proximidade) return;
  try {
    if (ligar) {
      if (!assinatura) {
        assinatura = Proximidade.addListener('onMudou', ({ perto }) => {
          if (perto === pertoDoRosto) return;
          pertoDoRosto = perto;
          avisar();
          aplicarSaida();
        });
      }
      await Proximidade.ativar(true);
    } else {
      assinatura?.remove();
      assinatura = null;
      await Proximidade.ativar(false);
      if (pertoDoRosto) {
        pertoDoRosto = false;
        avisar();
        aplicarSaida();
      }
    }
  } catch { /* sem sensor: fica só o botão */ }
}

export function useSaidaAudio(): Saida {
  const [s, setS] = useState<Saida>(saidaEfetiva());
  useEffect(() => {
    ouvintes.add(setS);
    return () => { ouvintes.delete(setS); };
  }, []);
  return s;
}
