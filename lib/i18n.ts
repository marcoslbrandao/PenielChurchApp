import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

import pt from '../locales/pt.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';

export const IDIOMAS = [
  { codigo: 'pt', label: 'Português (Brasil)', bandeira: '🇧🇷' },
  { codigo: 'en', label: 'English (UK)', bandeira: '🇬🇧' },
  { codigo: 'es', label: 'Español', bandeira: '🇪🇸' },
  { codigo: 'fr', label: 'Français', bandeira: '🇫🇷' },
] as const;

const STORAGE_KEY = 'peniel_idioma';

// Sempre abre em Português na primeira instalação, independente do idioma
// configurado no aparelho — depois disso, respeita o que o usuário escolher
// manualmente em Perfil > Idioma (ver carregarIdiomaSalvo).
function idiomaPadrao(): string {
  return 'pt';
}

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    pt: { translation: pt },
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
  },
  lng: idiomaPadrao(),
  fallbackLng: 'pt',
  interpolation: { escapeValue: false },
});

/** Carrega o idioma salvo pelo usuário (se houver) — chamar uma vez ao abrir o app. */
export async function carregarIdiomaSalvo() {
  try {
    const salvo = await AsyncStorage.getItem(STORAGE_KEY);
    if (salvo && IDIOMAS.some(i => i.codigo === salvo)) {
      await i18n.changeLanguage(salvo);
    }
  } catch {
    // sem storage disponível, segue com o idioma detectado do aparelho
  }
}

/** Troca o idioma do app e lembra a escolha pra próxima vez que abrir. */
export async function trocarIdioma(codigo: string) {
  await i18n.changeLanguage(codigo);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, codigo);
  } catch {
    // não bloqueia a troca de idioma se o storage falhar
  }
  // As notificações (devocional, versículo do dia) saem no idioma gravado em
  // push_tokens.idioma. Antes isso só era gravado ao registrar o token, na
  // abertura do app — quem trocava de idioma continuava recebendo push na
  // língua antiga até fechar e abrir o app.
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      await supabase.from('push_tokens').update({ idioma: codigo }).eq('user_id', data.user.id);
    }
  } catch {
    // sem rede: o idioma é regravado no próximo registro do token
  }
}

export default i18n;
