// Compartilhar um evento especial como CONVITE (pedido do Marcos, 23/10).
// Usado no destaque da Home e nos eventos especiais da Agenda.
//
// iPhone: vai a capa do evento (baixada para o cache) + o texto do convite —
// no WhatsApp chega a foto com a legenda.
// Android: o menu de compartilhar do React Native so leva texto; o link da
// capa vai no texto (o WhatsApp mostra a previa da imagem).
// So JS + expo-file-system (ja no binario): chega por OTA.
import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import i18n from 'i18next';
import { linhaCompartilharApp } from './appLinks';

export type ConviteEvento = {
  nome: string;
  quando?: string;        // "Domingo, 25 de outubro · 18h"
  local?: string | null;
  descricao?: string | null;
  link?: string | null;   // cta_url / Zoom / mapa
  imagemUrl?: string | null;
};

async function baixarCapa(url: string): Promise<string | null> {
  try {
    if (!FileSystem.cacheDirectory) return null;
    const ext = (url.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase().slice(0, 4);
    const destino = `${FileSystem.cacheDirectory}convite-${Date.now()}.${/^(jpg|jpeg|png|webp)$/.test(ext) ? ext : 'jpg'}`;
    const r = await FileSystem.downloadAsync(url, destino);
    return r.status >= 200 && r.status < 300 ? r.uri : null;
  } catch {
    return null;
  }
}

export function textoDoConvite(e: ConviteEvento, comLinkDaImagem = false): string {
  const t = (k: string) => i18n.t(k);
  const partes = [
    `📣 ${t('convite.titulo')}`,
    `*${e.nome}*`,
    [e.quando ? `📅 ${e.quando}` : '', e.local ? `📍 ${e.local}` : ''].filter(Boolean).join('\n'),
    e.descricao ?? '',
    e.link ? `🔗 ${e.link}` : '',
    comLinkDaImagem && e.imagemUrl ? e.imagemUrl : '',
    `${t('convite.voceEConvidado')} 🙏`,
    linhaCompartilharApp(),
  ];
  return partes.filter(p => !!p && p.trim().length > 0).join('\n\n');
}

export async function compartilharEvento(e: ConviteEvento): Promise<void> {
  try {
    if (Platform.OS === 'ios' && e.imagemUrl) {
      const arquivo = await baixarCapa(e.imagemUrl);
      if (arquivo) {
        await Share.share({ url: arquivo, message: textoDoConvite(e) });
        return;
      }
    }
    await Share.share({ message: textoDoConvite(e, Platform.OS !== 'ios'), title: e.nome });
  } catch {
    // A pessoa fechou o menu ou o aparelho recusou: nada a fazer.
  }
}
