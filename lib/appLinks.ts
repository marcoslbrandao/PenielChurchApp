import i18n from 'i18next';

// Links de download do app, usados no rodapé de textos compartilhados
// (devocional, versículo do dia, capítulo/versículos da Bíblia etc.) — assim
// quem recebe a mensagem consegue baixar o app também, não só ler o texto.
export const APP_STORE_URL = 'https://apps.apple.com/us/app/peniel-church-uk/id6776841788';

// Ainda não temos link público do Google Play — o app ainda está em teste
// fechado (faixa alpha). Enquanto for null, o rodapé diz "Em breve no Google
// Play". Quando sair pro público, colocar o link aqui: o texto compartilhado
// passa a trazer o link no lugar do "em breve", em todos os idiomas.
export const GOOGLE_PLAY_URL: string | null = null;

/**
 * Rodapé padrão dos textos compartilhados pelo app, com link de verdade.
 *
 * `idioma`: o idioma do TEXTO que está sendo compartilhado — o rodapé tem de
 * sair na mesma língua (um devocional em inglês não termina com "Baixe o
 * app"). Sem ele, usa o idioma atual do app.
 */
export function linhaCompartilharApp(idioma?: string): string {
  const lng = idioma ?? i18n.language;
  // URL não pode virar `https:&#x2F;&#x2F;` — o app já desliga o escape, mas
  // o rodapé não depende disso.
  const semEscape = { escapeValue: false };
  const linhas = [
    '📖 Peniel Church App',
    i18n.t('compartilharApp.baixe', { lng, url: APP_STORE_URL, interpolation: semEscape }),
    GOOGLE_PLAY_URL
      ? i18n.t('compartilharApp.googlePlay', { lng, url: GOOGLE_PLAY_URL, interpolation: semEscape })
      : i18n.t('compartilharApp.googlePlayEmBreve', { lng }),
  ];
  return linhas.join('\n');
}
