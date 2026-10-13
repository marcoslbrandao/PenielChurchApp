// Chat da Igreja — o chat geral dos membros (ver migração 20261011090000).
//
// Arquivos (foto, GIF, áudio, vídeo e anexos) ficam no bucket
// PRIVADO `chat-geral`, caminho `<autor>/<uuid>.<ext>`. Quem não é membro não
// consegue nem a URL assinada (policy do Storage usa `is_membro()`).
//
// Guardado por 15 dias: o cron `limpar-chat-geral` apaga as mensagens e a
// Edge Function `limpar-audios-chat` apaga os arquivos que ficaram órfãos.
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { requireOptionalNativeModule } from 'expo';
import { supabase } from './supabase';

export const BUCKET_CHAT_GERAL = 'chat-geral';
export const DIAS_GUARDADOS = 15;
export const VIDEO_MAX_SEGUNDOS = 120;
/** Limite do bucket `chat-geral` (40 MB) — vale para o vídeo. */
export const VIDEO_MAX_MB = 40;
/** Anexos (tipo `arquivo`): a constraint do banco aceita até 25 MB. */
export const ARQUIVO_MAX_MB = 25;
export const REACOES = ['👍', '❤️', '😂', '🙏', '😮', '😢'];

export type TipoMensagem = 'texto' | 'imagem' | 'audio' | 'video' | 'arquivo';

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
  /** Só no tipo `arquivo`: nome original, tamanho em bytes e content-type. */
  midia_nome?: string | null;
  midia_tamanho?: number | null;
  midia_mime?: string | null;
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

// ─── Anexos (tipo `arquivo`) ─────────────────────────────────────────────────
// Áudio baixado (ex.: o Presenter Diário da RTM, em mp3), PDF e documentos.
// A lista tem que bater com a constraint `chat_geral_mensagens_conteudo_check`
// e com o `allowed_mime_types` do bucket (migração 20261013200000).
const FORMATOS_ARQUIVO: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  zip: 'application/zip',
};
const EXT_DO_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/mp4': 'm4a',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/aac': 'aac', 'audio/ogg': 'ogg',
  'application/x-zip-compressed': 'zip',
};

/** Extensão e content-type de um anexo, ou null se o formato não é aceito. */
export function formatoDoArquivo(nome: string, mimeType?: string | null): { ext: string; contentType: string } | null {
  const m = (mimeType ?? '').toLowerCase();
  let ext = nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : '';
  if (!FORMATOS_ARQUIVO[ext]) {
    ext = EXT_DO_MIME[m] ?? Object.keys(FORMATOS_ARQUIVO).find(k => FORMATOS_ARQUIVO[k] === m) ?? '';
  }
  if (!FORMATOS_ARQUIVO[ext]) return null;
  return { ext, contentType: FORMATOS_ARQUIVO[ext] };
}

/** Anexo que é áudio: a bolha mostra o player em vez do cartão. */
export function anexoEhAudio(m: Pick<MensagemGeral, 'midia_mime' | 'midia_path'>): boolean {
  if ((m.midia_mime ?? '').startsWith('audio/')) return true;
  return /\.(mp3|m4a|wav|aac|ogg)$/i.test(m.midia_path ?? '');
}

export function formatarTamanho(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.0', '')} MB`;
}

export type ArquivoEscolhido = { uri: string; nome: string; tamanho: number | null; mime: string | null };

/**
 * O seletor de arquivos (`expo-document-picker`) é NATIVO: só existe nos
 * binários gerados a partir da 1.5.0. Um OTA chega também nos celulares com
 * o binário antigo — lá a opção "Arquivo" fica escondida, em vez de fechar o
 * app (mesma ideia do `binarioPodeGravarAudio`).
 */
export function binarioTemSeletorDeArquivos(): boolean {
  try { return !!requireOptionalNativeModule('ExpoDocumentPicker'); } catch { return false; }
}

export async function escolherArquivo(): Promise<ArquivoEscolhido | null> {
  // require tardio: importar no topo chamaria o módulo nativo ao abrir o app.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, nome: a.name || 'arquivo', tamanho: a.size ?? null, mime: a.mimeType ?? null };
}

/** Tamanho do arquivo local, quando o seletor não informou. */
export async function tamanhoLocal(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof (info as { size?: number }).size === 'number' ? (info as { size: number }).size : null;
  } catch { return null; }
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
