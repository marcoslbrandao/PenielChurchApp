// lib/materiais.ts
//
// Material dos grupos — por link (o jeito antigo) ou guardado no Drive da
// igreja (Edge Function `materiais-drive`). Ver claude/materiais-dos-grupos-no-drive.md
//
// Para o Drive, o app nunca recebe o link do Google: pede à função uma URL
// assinada por 10 minutos e abre no navegador do celular, onde o PDF aparece
// com o botão de compartilhar/salvar do próprio sistema.

import { Linking } from 'react-native';
import { supabase } from './supabase';

export type Material = {
  id: string;
  titulo: string;
  url: string;
  created_at?: string;
  drive_id?: string | null;
  mime_type?: string | null;
  tamanho?: number | null;
};

// Pede à função para olhar a pasta do grupo no Drive. Devolve true se algo
// mudou (arquivo novo, removido ou renomeado) — aí vale recarregar a lista.
// Falha aqui nunca é erro na tela: a lista do banco continua valendo.
export async function sincronizarMateriais(grupo: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('materiais-drive', {
      body: { acao: 'sincronizar', grupo },
    });
    if (error || !data) return false;
    return (data.novos ?? 0) + (data.removidos ?? 0) + (data.alterados ?? 0) > 0;
  } catch {
    return false;
  }
}

// Lança erro se não conseguir abrir; a tela mostra o alerta.
export async function abrirMaterial(m: Pick<Material, 'id' | 'url' | 'drive_id'>): Promise<void> {
  if (!m.drive_id) {
    await Linking.openURL(m.url);
    return;
  }
  const { data, error } = await supabase.functions.invoke('materiais-drive', {
    body: { acao: 'link', arquivo_id: m.id },
  });
  if (error || !data?.url) throw new Error('sem link');
  await Linking.openURL(data.url);
}

// Só para material do Drive: tira do app e manda o arquivo para a lixeira do
// Drive. Apagar só a linha não adianta — a próxima sincronização traria de volta.
export async function removerMaterialDoDrive(id: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('materiais-drive', {
    body: { acao: 'remover', arquivo_id: id },
  });
  return !error && !!data?.ok;
}

export function iconeDoMaterial(m: Pick<Material, 'drive_id' | 'mime_type'>): string {
  const t = m.mime_type ?? '';
  if (!m.drive_id) return 'link-outline';
  if (t === 'application/pdf') return 'document-text-outline';
  if (t.startsWith('image/')) return 'image-outline';
  if (t.startsWith('audio/')) return 'musical-notes-outline';
  if (t.startsWith('video/')) return 'videocam-outline';
  if (t.includes('presentation') || t.includes('powerpoint')) return 'easel-outline';
  if (t.includes('spreadsheet') || t.includes('excel')) return 'grid-outline';
  return 'document-outline';
}

export function tamanhoLegivel(bytes?: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
