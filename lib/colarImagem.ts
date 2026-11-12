// lib/colarImagem.ts
//
// Copiar e colar imagem no chat (pedido do Marcos, 12/11/2026): copiar um
// meme/foto no WhatsApp (ou em qualquer app) e colar no chat da Peniel.
//
// Usa o expo-clipboard, que é nativo: só existe a partir do próximo build.
// Nos apps 1.5.0/1.5.3 (mesmo runtime, recebem este código por OTA) o módulo
// não existe e tudo aqui responde "não" — o botão Colar simplesmente não
// aparece.
//
// `hasImageAsync` só pergunta SE há imagem (não lê o conteúdo), então o iPhone
// não mostra o aviso "Permitir colar". O aviso só aparece no toque em Colar,
// quando a imagem é lida de verdade — como em qualquer app.
import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import type { Compartilhado } from './chatGeral';

const temModulo = !!requireOptionalNativeModule('ExpoClipboard');

function clipboard(): typeof import('expo-clipboard') | null {
  if (!temModulo) return null;
  try { return require('expo-clipboard'); } catch { return null; }
}

export const colarDisponivel = temModulo;

export async function temImagemParaColar(): Promise<boolean> {
  const c = clipboard();
  if (!c) return false;
  try { return await c.hasImageAsync(); } catch { return false; }
}

/** Lê a imagem copiada e grava num arquivo (JPEG) pronto para enviar. */
export async function colarImagem(): Promise<NonNullable<Compartilhado['arquivo']> | null> {
  const c = clipboard();
  if (!c) return null;
  try {
    const img = await c.getImageAsync({ format: 'jpeg', jpegQuality: 0.85 });
    if (!img?.data) return null;
    const base64 = img.data.replace(/^data:image\/\w+;base64,/, '');
    const nome = `colado-${Date.now()}.jpg`;
    const uri = `${FileSystem.cacheDirectory}${nome}`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    const info = await FileSystem.getInfoAsync(uri);
    return {
      uri,
      nome,
      mime: 'image/jpeg',
      tamanho: info.exists ? (info as any).size ?? null : null,
      largura: img.size?.width ?? null,
      altura: img.size?.height ?? null,
      duracaoMs: null,
    };
  } catch {
    return null;
  }
}
