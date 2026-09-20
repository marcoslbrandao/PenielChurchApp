// O que o BINÁRIO instalado sabe fazer — não o bundle de JS.
//
// Um OTA chega em todo celular com o mesmo runtimeVersion, inclusive nos que
// foram instalados antes de um recurso nativo existir. Gravar áudio é o caso:
// no iOS, pedir o microfone sem `NSMicrophoneUsageDescription` no Info.plist
// faz o sistema MATAR o app na hora. Então o botão de gravar só aparece quando
// o binário foi gerado com a permissão.
//
// Como saber: `ExponentConstants.manifest` é o app.json EMBUTIDO no binário
// no momento do build (não o do OTA, que é o que `Constants.expoConfig` mostra).
// Se o plugin do expo-audio estava com `microphonePermission` preenchido
// naquele build, o Info.plist/AndroidManifest também tem a permissão —
// os dois são mudados juntos (ver claude/chat-audio-e-links.md).
import { requireOptionalNativeModule } from 'expo';

type AppConfigEmbutido = { plugins?: (string | [string, Record<string, unknown>])[] };

function configEmbutida(): AppConfigEmbutido | null {
  try {
    const mod = requireOptionalNativeModule<{ manifest?: unknown }>('ExponentConstants');
    const bruto = mod?.manifest;
    if (!bruto) return null;
    // No Android vem como string JSON; no iOS, como objeto.
    return (typeof bruto === 'string' ? JSON.parse(bruto) : bruto) as AppConfigEmbutido;
  } catch {
    return null;
  }
}

let cache: boolean | null = null;

export function binarioPodeGravarAudio(): boolean {
  if (cache !== null) return cache;
  const plugins = configEmbutida()?.plugins ?? [];
  const audio = plugins.find(p => Array.isArray(p) && p[0] === 'expo-audio') as
    | [string, Record<string, unknown>]
    | undefined;
  const mic = audio?.[1]?.microphonePermission;
  cache = typeof mic === 'string' && mic.length > 0;
  return cache;
}
