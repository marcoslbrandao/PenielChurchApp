// Tradução automática de conteúdo digitado pelo admin (devocional, avisos,
// mensagens do blog, eventos da agenda) para o idioma escolhido pelo usuário.
// Diferente das strings fixas do app (que usam i18next), esse conteúdo vem
// do Supabase e é digitado em português — por isso passa pela Edge Function
// `translate-content`, que traduz via API externa e guarda em cache
// (tabela `content_translations`) para não traduzir o mesmo texto de novo.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabase';

// Cache em memória por sessão do app — evita re-chamar a função toda vez que
// um componente re-renderiza com o mesmo texto.
const memCache = new Map<string, string>();

function chaveCache(table: string, rowId: string, field: string, lang: string) {
  return `${table}:${rowId}:${field}:${lang}`;
}

/**
 * Traduz um campo de conteúdo para o idioma atual do app.
 * Enquanto a tradução carrega (ou se falhar), mostra o texto original em
 * português — nunca deixa o campo vazio.
 *
 * @param texto texto original em português (pode ser null/undefined)
 * @param table nome da tabela de origem (ex: 'devocionais', 'avisos')
 * @param rowId id da linha (usado como chave do cache)
 * @param field nome do campo (ex: 'titulo', 'texto')
 */
export function useCampoTraduzido(
  texto: string | null | undefined,
  table: string,
  rowId: string | null | undefined,
  field: string
): string {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const [traduzido, setTraduzido] = useState(texto ?? '');
  const ultimoTextoRef = useRef(texto);

  useEffect(() => {
    ultimoTextoRef.current = texto;

    if (!texto || !rowId || lang === 'pt') {
      setTraduzido(texto ?? '');
      return;
    }

    const chave = chaveCache(table, String(rowId), field, lang);
    const cacheado = memCache.get(chave);
    if (cacheado) { setTraduzido(cacheado); return; }

    setTraduzido(texto); // mostra o original enquanto a tradução carrega
    let cancelado = false;

    supabase.functions
      .invoke('translate-content', { body: { table, rowId: String(rowId), field, text: texto, lang } })
      .then(({ data, error }) => {
        if (cancelado || error || !data?.translated) return;
        memCache.set(chave, data.translated);
        if (ultimoTextoRef.current === texto) setTraduzido(data.translated);
      })
      .catch(() => { /* mantém o texto original em caso de erro de rede */ });

    return () => { cancelado = true; };
  }, [texto, table, rowId, field, lang]);

  return traduzido;
}
