// lib/salvarNaGaleria.ts
//
// Salvar no celular a foto ou o vídeo recebido no chat (pedido do Marcos,
// 16/11/2026, app 1.6.0). Baixa o arquivo para o cache e grava na galeria
// com o expo-media-library, pedindo só a permissão de GRAVAR (writeOnly):
// o app não lê a galeria da pessoa com isto.
import { Alert, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import i18n from './i18n';

const t = (k: string) => i18n.t(k);

function extensaoDe(url: string, tipo: 'foto' | 'video'): string {
  const limpo = url.split('?')[0].split('#')[0];
  const m = /\.([a-z0-9]{2,5})$/i.exec(limpo);
  if (m) return m[1].toLowerCase();
  return tipo === 'video' ? 'mp4' : 'jpg';
}

/** Baixa e salva na galeria. Mostra o resultado num Alert. */
export async function salvarNaGaleria(url: string, tipo: 'foto' | 'video'): Promise<boolean> {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) {
      Alert.alert(t('galeria.titulo'), t('galeria.semPermissao'), [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('galeria.abrirAjustes'), onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
      return false;
    }
    let local = url;
    if (/^https?:/i.test(url)) {
      const destino = `${FileSystem.cacheDirectory}salvar-${Date.now()}.${extensaoDe(url, tipo)}`;
      const r = await FileSystem.downloadAsync(url, destino);
      if (r.status < 200 || r.status >= 300) throw new Error(`http_${r.status}`);
      local = r.uri;
    }
    await MediaLibrary.saveToLibraryAsync(local);
    if (local !== url) FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
    Alert.alert(t('galeria.titulo'), tipo === 'video' ? t('galeria.videoSalvo') : t('galeria.fotoSalva'));
    return true;
  } catch (e) {
    console.log('salvarNaGaleria:', e);
    Alert.alert(t('galeria.titulo'), t('galeria.erro'));
    return false;
  }
}
