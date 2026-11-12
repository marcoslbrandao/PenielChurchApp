// lib/memes.ts
//
// Memes / figurinhas do chat (12/11/2026). Regras no banco
// (20261112170000_memes_do_chat.sql): cada um vê os seus e o pacote da
// igreja (que o admin monta). Arquivos no bucket privado `memes`.
//
// Enviar um meme = baixar a imagem para o celular e mandar como uma foto
// comum do chat (passa pela mesma moderação de sempre).
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { prepararImagem, formatoDaImagem } from './chatGeral';

export type Meme = { id: string; dono: string | null; path: string; largura: number | null; altura: number | null; url?: string };

const BUCKET = 'memes';
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

/** Meus memes + os da igreja, já com link para mostrar (vale 1 h). */
export async function listarMemes(): Promise<Meme[]> {
  const { data, error } = await supabase.from('memes').select('id, dono, path, largura, altura').order('created_at', { ascending: false }).limit(400);
  if (error || !data?.length) return [];
  const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(data.map(m => m.path), 3600);
  const porPath = new Map((urls ?? []).map(u => [u.path, u.signedUrl]));
  return (data as Meme[]).map(m => ({ ...m, url: porPath.get(m.path) ?? undefined })).filter(m => !!m.url);
}

/**
 * Guarda uma imagem do celular como meme.
 * `daIgreja`: vai para o pacote da igreja (só o admin consegue).
 */
export async function salvarMeme(uriLocal: string, mimeType: string | null | undefined, userId: string, daIgreja = false,
  tamanho?: { width?: number | null; height?: number | null }): Promise<string> {
  try {
    const img = await prepararImagem(uriLocal, mimeType);
    const { ext, contentType } = formatoDaImagem(img.mimeType, img.uri);
    const caminho = `${daIgreja ? 'igreja' : userId}/${uuid()}.${ext === 'heic' ? 'jpg' : ext}`;
    const { data: sessao } = await supabase.auth.getSession();
    const token = sessao.session?.access_token;
    if (!token) return 'Sessão expirada. Entre de novo.';
    const r = await FileSystem.uploadAsync(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminho}`, img.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { Authorization: `Bearer ${token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, 'Content-Type': contentType, 'x-upsert': 'false' },
    });
    if (r.status < 200 || r.status >= 300) return 'Não foi possível guardar a imagem.';
    const { error } = await supabase.from('memes').insert({
      dono: daIgreja ? null : userId, path: caminho,
      largura: img.width ?? tamanho?.width ?? null, altura: img.height ?? tamanho?.height ?? null,
    });
    if (error) {
      await supabase.storage.from(BUCKET).remove([caminho]);
      return error.message?.includes('limite_memes') ? 'limite' : (error.message || 'erro');
    }
    return 'ok';
  } catch (e: any) {
    return e?.message ?? 'erro';
  }
}

/** "Salvar como meme" a partir de uma foto do chat (URL assinada). */
export async function salvarMemeDeUrl(url: string, userId: string): Promise<string> {
  try {
    const ext = (url.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase();
    const destino = `${FileSystem.cacheDirectory}meme-${Date.now()}.${['png', 'webp', 'gif', 'jpg', 'jpeg'].includes(ext) ? ext : 'jpg'}`;
    const d = await FileSystem.downloadAsync(url, destino);
    const r = await salvarMeme(d.uri, d.headers?.['Content-Type'] ?? d.headers?.['content-type'] ?? null, userId);
    FileSystem.deleteAsync(d.uri, { idempotent: true }).catch(() => {});
    return r;
  } catch (e: any) {
    return e?.message ?? 'erro';
  }
}

export async function apagarMeme(m: Meme): Promise<string> {
  await supabase.storage.from(BUCKET).remove([m.path]);
  const { error } = await supabase.from('memes').delete().eq('id', m.id);
  return error ? (error.message || 'erro') : 'ok';
}

/** Baixa o meme para o celular, pronto para ir no chat como foto. */
export async function memeParaEnviar(m: Meme): Promise<{ uri: string; mimeType: string; width: number | null; height: number | null } | null> {
  if (!m.url) return null;
  const ext = (m.path.split('.').pop() ?? 'jpg').toLowerCase();
  try {
    const d = await FileSystem.downloadAsync(m.url, `${FileSystem.cacheDirectory}meme-envio-${m.id}.${ext}`);
    const { contentType } = formatoDaImagem(null, d.uri);
    return { uri: d.uri, mimeType: contentType, width: m.largura, height: m.altura };
  } catch {
    return null;
  }
}
