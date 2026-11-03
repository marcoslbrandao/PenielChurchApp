// Series de devocionais (03/11/2026). Cada devocional pode ter `serie_id` e
// `ordem_na_serie`; a serie (tabela `devocional_series`) tem titulo, capa e
// `total_devocionais`, usado no selo "N de total" e na barrinha de progresso.
// O titulo da serie e traduzido pela mesma translate-content dos devocionais.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useCampoTraduzido } from './useTraducao';

export type SerieDevocional = {
  id: string;
  titulo: string;
  descricao: string | null;
  imagem_url: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  ordem: number;
  ativa: boolean;
  total_devocionais?: number | null;
};

const cache = new Map<string, SerieDevocional>();

export function guardarSeries(lista: SerieDevocional[]) {
  lista.forEach(s => cache.set(s.id, s));
}

// select('*') de proposito: se a coluna total_devocionais ainda nao existir,
// a serie continua aparecendo (so sem o "de 12").
export function useSerie(serieId?: string | null) {
  const [serie, setSerie] = useState<SerieDevocional | null>(serieId ? cache.get(serieId) ?? null : null);
  useEffect(() => {
    if (!serieId) { setSerie(null); return; }
    const c = cache.get(serieId);
    if (c) { setSerie(c); return; }
    let vivo = true;
    supabase.from('devocional_series').select('*').eq('id', serieId).maybeSingle()
      .then(({ data }) => {
        if (data) cache.set(serieId, data as SerieDevocional);
        if (vivo) setSerie((data as SerieDevocional) ?? null);
      });
    return () => { vivo = false; };
  }, [serieId]);
  const titulo = useCampoTraduzido(serie?.titulo, 'devocional_series', serie?.id, 'titulo');
  return serie ? { ...serie, tituloTraduzido: titulo } : null;
}

// Data no padrao do app: DD/MM/AAAA. `data` vem do banco como AAAA-MM-DD.
export function dataBR(data?: string | null) {
  if (!data) return '';
  const [a, m, d] = data.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
