// lib/biometria.ts
//
// Face ID / digital (Área do Pastor, 12/11/2026).
//
// O módulo nativo `expo-local-authentication` só existe no app 1.5.3 em
// diante. Um OTA chega também em quem ainda está no 1.5.0, e importar o
// módulo direto nesse binário derruba o app (requireNativeModule lança).
// Por isso: confere primeiro se o nativo existe e só então carrega o JS.
import { requireOptionalNativeModule } from 'expo';

type LA = typeof import('expo-local-authentication');

function modulo(): LA | null {
  if (!requireOptionalNativeModule('ExpoLocalAuthentication')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-local-authentication') as LA;
  } catch {
    return null;
  }
}

export type ResultadoBiometria = 'ok' | 'falhou' | 'sem_modulo' | 'sem_cadastro';

/**
 * Pede Face ID (ou digital / código do celular).
 * 'sem_modulo': app antigo, sem o recurso nativo (precisa atualizar na loja).
 * 'sem_cadastro': o celular não tem Face ID nem código configurado.
 */
export async function pedirBiometria(mensagem: string, cancelar: string): Promise<ResultadoBiometria> {
  const LA = modulo();
  if (!LA) return 'sem_modulo';
  try {
    const nivel = await LA.getEnrolledLevelAsync();
    if (nivel === LA.SecurityLevel.NONE) return 'sem_cadastro';
    const r = await LA.authenticateAsync({
      promptMessage: mensagem,
      cancelLabel: cancelar,
      disableDeviceFallback: false, // aceita o código do celular se o Face ID falhar
    });
    return r.success ? 'ok' : 'falhou';
  } catch {
    return 'falhou';
  }
}
