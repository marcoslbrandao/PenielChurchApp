// Chat da Igreja — o chat geral dos membros (ver migração 20261011090000).
//
// Arquivos (foto, GIF, áudio e, no próximo build, vídeo) ficam no bucket
// PRIVADO `chat-geral`, caminho `<autor>/<uuid>.<ext>`. Quem não é membro não
// consegue nem a URL assinada (policy do Storage usa `is_membro()`).
//
// Guardado por 15 dias: o cron `limpar-chat-geral` apaga as mensagens e a
// Edge Function `limpar-audios-chat` apaga os arquivos que ficaram órfãos.
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export const BUCKET_CHAT_GERAL = 'chat-geral';
export const DIAS_GUARDADOS = 15;
export const VIDEO_MAX_SEGUNDOS = 120;
export const REACOES = ['👍', '❤️', '😂', '🙏', '😮', '😢'];

export type TipoMensagem = 'texto' | 'imagem' | 'audio' | 'video';

export type MensagemGeral = {
  id: string;
  autor_id: string;
  autor_nome: string;
  tipo: TipoMensagem;
  texto: string;
  midia_path: string | null;
  midia_largura: number | null;
  midia_altura: number | null;
  duracao_ms: number | null;
  resposta_a: string | null;
  created_at: string;
};

export type Reacao = { mensagem_id: string; user_id: string; emoji: string };

export type ResumoChat = {
  nao_lidas: number;
  ultima_autor: string | null;
  ultima_tipo: TipoMensagem | null;
  ultima_texto: string | null;
  ultima_em: string | null;
};

function uuid() {
  // Suficiente para nome de arquivo; não é segredo nenhum.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Extensão e content-type de uma imagem escolhida na galeria/câmera. */
export function formatoDaImagem(mimeType?: string | null, uri?: string): { ext: string; contentType: string } {
  const m = (mimeType ?? '').toLowerCase();
  const doUri = (uri ?? '').split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (m.includes('gif') || doUri === 'gif') return { ext: 'gif', contentType: 'image/gif' };
  if (m.includes('png') || doUri === 'png') return { ext: 'png', contentType: 'image/png' };
  if (m.includes('webp') || doUri === 'webp') return { ext: 'webp', contentType: 'image/webp' };
  return { ext: 'jpg', contentType: 'image/jpeg' };
}

/** Sobe o arquivo e devolve o caminho no bucket. Apaga o arquivo local se `apagarLocal`. */
export async function enviarArquivo(
  uri: string, autorId: string, ext: string, contentType: string, apagarLocal = false,
): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const caminho = `${autorId}/${uuid()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET_CHAT_GERAL)
    .upload(caminho, decode(base64), { contentType, upsert: false });
  if (error) throw error;
  if (apagarLocal) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  return caminho;
}

const urlsAssinadas = new Map<string, { url: string; expira: number }>();

export async function urlDaMidia(caminho: string): Promise<string> {
  const guardada = urlsAssinadas.get(caminho);
  if (guardada && guardada.expira > Date.now() + 60_000) return guardada.url;
  const { data, error } = await supabase.storage.from(BUCKET_CHAT_GERAL).createSignedUrl(caminho, 3600);
  if (error || !data?.signedUrl) throw error ?? new Error('Arquivo indisponível');
  urlsAssinadas.set(caminho, { url: data.signedUrl, expira: Date.now() + 3600_000 });
  return data.signedUrl;
}

/** Pede de uma vez as URLs das fotos que vão aparecer na tela. */
export async function preCarregarUrls(caminhos: string[]): Promise<void> {
  const faltam = caminhos.filter(c => {
    const g = urlsAssinadas.get(c);
    return !g || g.expira <= Date.now() + 60_000;
  });
  if (faltam.length === 0) return;
  const { data } = await supabase.storage.from(BUCKET_CHAT_GERAL).createSignedUrls(faltam, 3600);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) {
      urlsAssinadas.set(item.path, { url: item.signedUrl, expira: Date.now() + 3600_000 });
    }
  }
}

export function urlGuardada(caminho: string): string | null {
  const g = urlsAssinadas.get(caminho);
  return g && g.expira > Date.now() + 60_000 ? g.url : null;
}

/** Melhor esforço: se falhar, a limpeza diária remove o órfão. */
export async function apagarMidia(caminho: string) {
  urlsAssinadas.delete(caminho);
  await supabase.storage.from(BUCKET_CHAT_GERAL).remove([caminho]).then(() => {}, () => {});
}

export async function buscarResumo(): Promise<ResumoChat | null> {
  const { data, error } = await supabase.rpc('chat_geral_resumo');
  if (error) return null;
  const linha = (Array.isArray(data) ? data[0] : data) as ResumoChat | undefined;
  return linha ?? null;
}

export async function marcarComoLido(): Promise<void> {
  await supabase.rpc('chat_geral_marcar_lido').then(() => {}, () => {});
}

// ─── Datas (manual: o Hermes não respeita bem as opções do Intl) ─────────────
const dois = (n: number) => String(n).padStart(2, '0');

export function horaCurta(iso: string): string {
  const d = new Date(iso);
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** Chave do dia (local do aparelho), para separar a conversa por dia. */
export function chaveDoDia(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** "Hoje", "Ontem" ou DD/MM/AAAA — padrão de datas do app. */
export function rotuloDoDia(iso: string, hoje: string, ontem: string): string {
  const agora = new Date();
  const chave = chaveDoDia(iso);
  if (chave === chaveDoDia(agora.toISOString())) return hoje;
  const antes = new Date(agora.getTime() - 86400_000);
  if (chave === chaveDoDia(antes.toISOString())) return ontem;
  const d = new Date(iso);
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Hora se for hoje; senão DD/MM. Para o card da Home. */
export function quandoCurto(iso: string): string {
  const agora = new Date();
  if (chaveDoDia(iso) === chaveDoDia(agora.toISOString())) return horaCurta(iso);
  const d = new Date(iso);
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
}
