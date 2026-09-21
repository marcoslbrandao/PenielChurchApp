// Aviso de "versão nova na loja" e bloqueio de versão obrigatória.
//
// Duas fontes, com papéis diferentes:
//
// 1. App Store (só iPhone), AUTOMÁTICO: `itunes.apple.com/lookup` devolve a
//    versão publicada. Se for maior que a instalada, o app mostra um aviso que
//    dá para fechar. A Apple demora algumas horas (até ~1 dia) para essa
//    consulta enxergar uma versão recém-aprovada — normal.
//    No Android não existe consulta pública equivalente; a API oficial
//    (in-app updates) é nativa e precisaria de um build novo.
//
// 2. `app_versao.versao_minima` (Supabase), MANUAL, iPhone e Android: quem
//    está abaixo dela vê uma tela sem botão de fechar. Para correções que não
//    podem esperar a pessoa querer atualizar.
//
// A versão instalada vem de `versaoDoBinario()` — a do app da loja, não a do
// OTA (que mostraria a versão nova para quem ainda não atualizou).
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { versaoDoBinario } from './recursosNativos';

const BUNDLE_ID = 'org.uk.penielchurch.app';
const APPLE_ID = '6776841788';

// `itms-apps://` abre direto no app da App Store; `market://` no Play Store.
export const LINK_DA_LOJA = Platform.select({
  ios: `itms-apps://apps.apple.com/app/id${APPLE_ID}`,
  android: `market://details?id=${BUNDLE_ID}`,
  default: '',
});
export const LINK_DA_LOJA_WEB = Platform.select({
  ios: `https://apps.apple.com/app/id${APPLE_ID}`,
  android: `https://play.google.com/store/apps/details?id=${BUNDLE_ID}`,
  default: '',
});

/** -1 se a < b, 0 se iguais, 1 se a > b. "1.10.0" > "1.9.3". */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function comTempoLimite<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]).catch(() => null);
}

/** Versão publicada na App Store, ou null se não deu para saber. */
async function versaoNaAppStore(): Promise<string | null> {
  // A loja do Reino Unido primeiro (é onde a igreja está); a dos EUA de
  // reserva, caso a ficha não esteja disponível no GB. O `_` fura o cache da
  // CDN da Apple, que às vezes devolve a versão anterior por horas.
  for (const pais of ['gb', 'us']) {
    const url = `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&country=${pais}&_=${Date.now()}`;
    const r = await comTempoLimite(fetch(url).then(res => (res.ok ? res.json() : null)), 8000);
    const v = r?.results?.[0]?.version;
    if (typeof v === 'string' && /^\d+(\.\d+)*$/.test(v)) return v;
  }
  return null;
}

async function versaoMinima(): Promise<string | null> {
  const r = await comTempoLimite(
    Promise.resolve(
      supabase.from('app_versao').select('versao_minima').eq('plataforma', Platform.OS).maybeSingle(),
    ),
    8000,
  );
  const v = (r as any)?.data?.versao_minima;
  return typeof v === 'string' ? v : null;
}

export type SituacaoDaVersao =
  | { tipo: 'ok' }
  | { tipo: 'obrigatoria'; instalada: string; minima: string }
  | { tipo: 'disponivel'; instalada: string; nova: string };

// Qualquer falha (sem internet, loja fora, tabela ainda não criada) cai em
// 'ok': na dúvida, NUNCA bloquear o app de ninguém.
export async function verificarVersao(): Promise<SituacaoDaVersao> {
  const instalada = versaoDoBinario();
  if (!instalada || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return { tipo: 'ok' };

  const [minima, naLoja] = await Promise.all([
    versaoMinima(),
    Platform.OS === 'ios' ? versaoNaAppStore() : Promise.resolve(null),
  ]);

  if (minima && compararVersoes(instalada, minima) < 0) {
    return { tipo: 'obrigatoria', instalada, minima };
  }
  if (naLoja && compararVersoes(instalada, naLoja) < 0) {
    return { tipo: 'disponivel', instalada, nova: naLoja };
  }
  return { tipo: 'ok' };
}

// "Agora não" vale por 3 dias para aquela versão. Uma versão mais nova
// ainda aparece na hora.
const CHAVE_ADIADO = 'versao_aviso_adiado';
const ADIAR_MS = 3 * 24 * 3600 * 1000;

export async function avisoFoiAdiado(versao: string): Promise<boolean> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_ADIADO);
    if (!bruto) return false;
    const { versao: v, ate } = JSON.parse(bruto);
    return v === versao && typeof ate === 'number' && ate > Date.now();
  } catch {
    return false;
  }
}

export async function adiarAviso(versao: string) {
  try {
    await AsyncStorage.setItem(CHAVE_ADIADO, JSON.stringify({ versao, ate: Date.now() + ADIAR_MS }));
  } catch { /* sem armazenamento: o aviso só volta na próxima abertura */ }
}
