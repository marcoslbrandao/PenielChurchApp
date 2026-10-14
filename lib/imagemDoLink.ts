// Baixa a imagem de um link compartilhado (ex.: app da RTM, que manda só o
// endereço "…/image.jpg?…") para o cache do celular, no mesmo formato de um
// arquivo recebido pelo menu Compartilhar. Assim ela segue o caminho normal
// de foto: barra "Pronto para enviar", legenda e Enviar (14/10/2026).
//
// Só JS + expo-file-system (já no binário): chega por OTA.
// Qualquer falha (sem rede, não é imagem, grande demais, demorou) devolve
// null — quem chamou continua tratando como link de texto, como antes.
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';
import { extensaoDoLink } from './links';
import type { Compartilhado } from './chatGeral';

const LIMITE_MB = 25;
const TEMPO_MAX_MS = 20000;

const MIME_POR_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
};
const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
};

function tamanhoDaImagem(uri: string): Promise<{ largura: number | null; altura: number | null }> {
  return new Promise(resolve => {
    Image.getSize(uri, (w, h) => resolve({ largura: w, altura: h }), () => resolve({ largura: null, altura: null }));
  });
}

async function baixar(url: string): Promise<NonNullable<Compartilhado['arquivo']> | null> {
  if (!FileSystem.cacheDirectory) return null;
  const extLink = extensaoDoLink(url) ?? 'jpg';
  const destino = `${FileSystem.cacheDirectory}compartilhado-${Date.now()}.${extLink}`;
  const r = await FileSystem.downloadAsync(url, destino);
  if (r.status < 200 || r.status >= 300) return null;

  // O servidor manda o tipo verdadeiro; se não mandar, vale a extensão do link.
  const cabecalho = Object.entries(r.headers ?? {})
    .find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
  let mime = (r.mimeType || cabecalho || '').split(';')[0].trim().toLowerCase();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') mime = MIME_POR_EXT[extLink] ?? '';
  if (!EXT_POR_MIME[mime]) return null; // página de erro, HTML etc.

  const info = await FileSystem.getInfoAsync(r.uri);
  const tamanho = info.exists && 'size' in info ? info.size ?? null : null;
  if (!tamanho || tamanho > LIMITE_MB * 1024 * 1024) return null;

  const { largura, altura } = await tamanhoDaImagem(r.uri);
  return {
    uri: r.uri,
    nome: `imagem.${EXT_POR_MIME[mime]}`,
    mime,
    tamanho,
    largura,
    altura,
    duracaoMs: null,
  };
}

export async function baixarImagemDoLink(url: string): Promise<NonNullable<Compartilhado['arquivo']> | null> {
  try {
    return await Promise.race([
      baixar(url),
      new Promise<null>(resolve => setTimeout(() => resolve(null), TEMPO_MAX_MS)),
    ]);
  } catch {
    return null;
  }
}
