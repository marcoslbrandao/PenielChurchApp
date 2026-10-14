// Anexos nos chats dos GRUPOS e da BANDA (14/10/2026) — mesma lógica do Chat
// da Igreja (lib/chatGeral.ts): foto/GIF, vídeo de até 5 min e arquivo (áudio
// baixado, PDF, Word, Excel...).
//
// Onde fica: bucket PRIVADO `chat-audio` (o mesmo da mensagem de voz), caminho
// `<grupo>/<autor>/<uuid>.<ext>` — ou `banda/<autor>/...` na Banda. As policies
// do Storage desse bucket já decidem quem lê pela primeira pasta, então a foto
// de um grupo só abre para quem é do grupo. Ver a migração
// 20261014120000_anexos_chat_grupos_banda.sql.
//
// Versões antigas do app só conhecem `texto`: por isso toda mensagem com anexo
// grava em `texto` a legenda ou um rótulo ("📷 Foto", "🎬 Vídeo", "📎 nome").
// Quem não atualizou vê o rótulo; quem atualizou vê o anexo.
//
// Limpeza: a Edge Function `limpar-audios-chat` (RPC chat_audios_orfaos) apaga
// o arquivo quando a mensagem some.
import { Alert, Keyboard, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import type { TFunction } from 'i18next';
import { supabase } from './supabase';
import { BUCKET_AUDIO } from './chatAudio';
import {
  formatoDaImagem, prepararImagem, formatoDoArquivo, binarioTemSeletorDeArquivos,
  escolherArquivo, tamanhoLocal, VIDEO_MAX_SEGUNDOS, VIDEO_MAX_MB, ARQUIVO_MAX_MB,
  type ArquivoEscolhido,
} from './chatGeral';

export type TipoAnexo = 'imagem' | 'video' | 'arquivo';

/** Colunas de anexo em `grupo_chat_mensagens` e `banda_chat_mensagens`. */
export type CamposAnexo = {
  texto: string;
  midia_tipo: TipoAnexo;
  midia_path: string;
  midia_nome: string | null;
  midia_tamanho: number | null;
  midia_mime: string | null;
  midia_largura: number | null;
  midia_altura: number | null;
  midia_duracao_ms: number | null;
};

export type MensagemComAnexo = {
  texto: string;
  midia_tipo?: TipoAnexo | null;
  midia_path?: string | null;
  midia_nome?: string | null;
  midia_tamanho?: number | null;
  midia_mime?: string | null;
  midia_largura?: number | null;
  midia_altura?: number | null;
  midia_duracao_ms?: number | null;
};

export const TEXTO_FOTO = '📷 Foto';
export const TEXTO_VIDEO = '🎬 Vídeo';

function rotuloPadrao(tipo: TipoAnexo, nome?: string | null, mime?: string | null): string {
  if (tipo === 'imagem') return TEXTO_FOTO;
  if (tipo === 'video') return TEXTO_VIDEO;
  return `${(mime ?? '').startsWith('audio/') ? '🎵' : '📎'} ${nome ?? 'Arquivo'}`;
}

/** Legenda escrita pela pessoa, ou null quando `texto` é só o rótulo padrão. */
export function legendaDoAnexo(m: MensagemComAnexo): string | null {
  if (!m.midia_tipo) return m.texto;
  const tx = (m.texto ?? '').trim();
  if (!tx || tx === rotuloPadrao(m.midia_tipo, m.midia_nome, m.midia_mime)) return null;
  return tx;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Sobe o arquivo para `chat-audio` e devolve o caminho. */
async function subir(
  prefixo: string, autorId: string, uri: string, ext: string, contentType: string, apagarLocal: boolean,
): Promise<string> {
  const caminho = `${prefixo}/${autorId}/${uuid()}.${ext}`;
  if (uri.startsWith('file://')) {
    // Envio direto do arquivo, sem carregar tudo na memória (ver chatGeral).
    const { data: sessao } = await supabase.auth.getSession();
    const token = sessao.session?.access_token;
    if (!token) throw new Error('Sessão expirada. Entre de novo.');
    const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET_AUDIO}/${caminho}`;
    const r = await FileSystem.uploadAsync(url, uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
    });
    if (r.status < 200 || r.status >= 300) {
      let msg = `Falha no envio (${r.status})`;
      try { msg = JSON.parse(r.body)?.message ?? msg; } catch { /* corpo não é JSON */ }
      throw new Error(msg);
    }
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const { error } = await supabase.storage
      .from(BUCKET_AUDIO)
      .upload(caminho, decode(base64), { contentType, upsert: false });
    if (error) throw error;
  }
  if (apagarLocal) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  return caminho;
}

/** Melhor esforço: se falhar, a limpeza diária remove o órfão. */
async function apagarUpload(caminho: string) {
  await supabase.storage.from(BUCKET_AUDIO).remove([caminho]).then(() => {}, () => {});
}

type Opcoes = {
  t: TFunction;
  /** Primeira pasta do caminho: o grupo (`mulheres`, `jovens`...) ou `banda`. */
  prefixo: string;
  autorId: string;
  /** O que está escrito no campo — vai como legenda. */
  legenda: string;
  setEnviando: (v: boolean) => void;
  /** Grava a linha da mensagem. Se lançar erro, o upload é apagado. */
  inserir: (campos: CamposAnexo) => Promise<void>;
  /** Chamado depois de enviar com legenda, para limpar o campo. */
  limparLegenda: () => void;
};

async function finalizar(o: Opcoes, montar: () => Promise<Omit<CamposAnexo, 'texto'>>) {
  o.setEnviando(true);
  let caminho: string | null = null;
  try {
    const campos = await montar();
    caminho = campos.midia_path;
    const legenda = o.legenda.trim();
    await o.inserir({ ...campos, texto: legenda || rotuloPadrao(campos.midia_tipo, campos.midia_nome, campos.midia_mime) });
    if (legenda) o.limparLegenda();
  } catch (e: any) {
    if (caminho) apagarUpload(caminho);
    Alert.alert(o.t('chatGeral.erroEnviar'), e?.message ?? o.t('chatGeral.erroEnviarTexto'));
  } finally {
    o.setEnviando(false);
  }
}

async function enviarImagem(o: Opcoes, a: ImagePicker.ImagePickerAsset) {
  await finalizar(o, async () => {
    const img = await prepararImagem(a.uri, a.mimeType);
    const { ext, contentType } = formatoDaImagem(img.mimeType, img.uri);
    const midia_path = await subir(o.prefixo, o.autorId, img.uri, ext, contentType, false);
    return {
      midia_tipo: 'imagem', midia_path, midia_nome: null, midia_tamanho: null, midia_mime: contentType,
      midia_largura: img.width ?? a.width ?? null, midia_altura: img.height ?? a.height ?? null, midia_duracao_ms: null,
    };
  });
}

async function enviarVideo(o: Opcoes, a: ImagePicker.ImagePickerAsset) {
  const duracaoMs = Math.round(a.duration ?? 0);
  if (duracaoMs > VIDEO_MAX_SEGUNDOS * 1000 + 4000) {
    Alert.alert(o.t('chatGeral.videoLongoTitulo'), o.t('chatGeral.videoLongo'));
    return;
  }
  const tamanho = a.fileSize ?? (await tamanhoLocal(a.uri));
  if (tamanho && tamanho > VIDEO_MAX_MB * 1024 * 1024) {
    Alert.alert(o.t('chatGeral.arquivoGrandeTitulo'), o.t('chatGeral.arquivoGrande', { mb: VIDEO_MAX_MB }));
    return;
  }
  const doUri = a.uri.split('?')[0].split('.').pop()?.toLowerCase();
  const ehMov = doUri === 'mov' || (a.mimeType ?? '').includes('quicktime');
  const contentType = ehMov ? 'video/quicktime' : 'video/mp4';
  await finalizar(o, async () => ({
    midia_tipo: 'video',
    midia_path: await subir(o.prefixo, o.autorId, a.uri, ehMov ? 'mov' : 'mp4', contentType, false),
    midia_nome: null, midia_tamanho: tamanho ?? null, midia_mime: contentType,
    midia_largura: a.width || null, midia_altura: a.height || null,
    midia_duracao_ms: Math.min(VIDEO_MAX_SEGUNDOS * 1000 + 5000, Math.max(1, duracaoMs || 1)),
  }));
}

async function enviarDocumento(o: Opcoes, arq: ArquivoEscolhido) {
  const formato = formatoDoArquivo(arq.nome, arq.mime);
  if (!formato) {
    Alert.alert(o.t('chatGeral.formatoNaoAceitoTitulo'), o.t('chatGeral.formatoNaoAceito'));
    return;
  }
  const tamanho = arq.tamanho ?? (await tamanhoLocal(arq.uri));
  if (!tamanho) { Alert.alert(o.t('chatGeral.erroEnviar'), o.t('chatGeral.erroEnviarTexto')); return; }
  if (tamanho > ARQUIVO_MAX_MB * 1024 * 1024) {
    Alert.alert(o.t('chatGeral.arquivoGrandeTitulo'), o.t('chatGeral.arquivoGrande', { mb: ARQUIVO_MAX_MB }));
    return;
  }
  await finalizar(o, async () => ({
    midia_tipo: 'arquivo',
    midia_path: await subir(o.prefixo, o.autorId, arq.uri, formato.ext, formato.contentType, true),
    midia_nome: arq.nome.slice(0, 200), midia_tamanho: tamanho, midia_mime: formato.contentType,
    midia_largura: null, midia_altura: null, midia_duracao_ms: null,
  }));
}

/** O menu do 📎: galeria (foto/vídeo), câmera e — nos binários 1.5.0+ — arquivo. */
export function abrirMenuDeAnexo(o: Opcoes, titulo: string) {
  Keyboard.dismiss();
  const galeria = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
      videoMaxDuration: VIDEO_MAX_SEGUNDOS,
    });
    const a = !r.canceled ? r.assets?.[0] : undefined;
    if (!a) return;
    if (a.type === 'video') enviarVideo(o, a); else enviarImagem(o, a);
  };
  const camera = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) {
      Alert.alert(o.t('chatGeral.permissaoCamera'), undefined, [
        { text: o.t('common.cancelar'), style: 'cancel' },
        { text: o.t('perfil.abrirAjustes'), onPress: () => { Linking.openSettings().catch(() => {}); } },
      ]);
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets?.[0]) enviarImagem(o, r.assets[0]);
  };
  const arquivo = async () => {
    try {
      const arq = await escolherArquivo();
      if (arq) enviarDocumento(o, arq);
    } catch (e: any) {
      Alert.alert(o.t('chatGeral.erroEnviar'), e?.message ?? o.t('chatGeral.erroEnviarTexto'));
    }
  };
  Alert.alert(titulo, undefined, [
    { text: o.t('chatGeral.galeria'), onPress: galeria },
    { text: o.t('chatGeral.camera'), onPress: camera },
    ...(binarioTemSeletorDeArquivos() ? [{ text: o.t('chatGeral.arquivoOpcao'), onPress: arquivo }] : []),
    { text: o.t('common.cancelar'), style: 'cancel' as const },
  ]);
}

/** Apaga o arquivo do anexo junto com a mensagem (melhor esforço). */
export function apagarAnexo(caminho?: string | null) {
  if (caminho) apagarUpload(caminho);
}
