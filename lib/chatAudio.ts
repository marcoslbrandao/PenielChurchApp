// Mensagens de voz do chat dos grupos.
//
// Arquivo no bucket PRIVADO `chat-audio`, caminho `<grupo>/<autor>/<uuid>.m4a`.
// A primeira pasta é o grupo porque é ela que a policy do Storage usa para
// decidir quem lê (`tem_acesso_grupo`) — a mesma regra das mensagens.
//
// Tocar pede uma URL assinada de 1 hora: o link sozinho não serve para quem
// não é do grupo, e expira.
//
// Limpeza: o arquivo segue a mensagem. Quando a linha some (limpeza diária de
// 14 dias, autor apagando, líder moderando), a Edge Function
// `limpar-audios-chat` remove o arquivo órfão na passada seguinte.
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { RecordingPresets, type RecordingOptions } from 'expo-audio';
import { supabase } from './supabase';

export const BUCKET_AUDIO = 'chat-audio';
export const AUDIO_MAX_SEGUNDOS = 5 * 60;
// Texto gravado junto com o áudio. Quem ainda roda uma versão do app que não
// conhece áudio (e os pushes/prévias) vê isso em vez de uma bolha vazia.
export const TEXTO_DO_AUDIO = '🎤 Mensagem de voz';

// Voz não precisa de estéreo 128 kbps: mono 64 kbps em AAC dá ~0,5 MB por
// minuto, com qualidade de sobra para fala.
export const OPCOES_GRAVACAO: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  sampleRate: 44100,
};

function uuid() {
  // Suficiente para nome de arquivo; não é segredo nenhum.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function enviarAudio(uri: string, grupo: string, autorId: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const caminho = `${grupo}/${autorId}/${uuid()}.m4a`;
  const { error } = await supabase.storage
    .from(BUCKET_AUDIO)
    .upload(caminho, decode(base64), { contentType: 'audio/mp4', upsert: false });
  if (error) throw error;
  // O arquivo local da gravação não serve para mais nada.
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  return caminho;
}

const urlsAssinadas = new Map<string, { url: string; expira: number }>();

export async function urlDoAudio(caminho: string): Promise<string> {
  const guardada = urlsAssinadas.get(caminho);
  if (guardada && guardada.expira > Date.now() + 60_000) return guardada.url;
  const { data, error } = await supabase.storage.from(BUCKET_AUDIO).createSignedUrl(caminho, 3600);
  if (error || !data?.signedUrl) throw error ?? new Error('Áudio indisponível');
  urlsAssinadas.set(caminho, { url: data.signedUrl, expira: Date.now() + 3600_000 });
  return data.signedUrl;
}

/** Melhor esforço: se falhar, a limpeza diária remove o órfão. */
export async function apagarAudio(caminho: string) {
  urlsAssinadas.delete(caminho);
  await supabase.storage.from(BUCKET_AUDIO).remove([caminho]).then(() => {}, () => {});
}

export function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
