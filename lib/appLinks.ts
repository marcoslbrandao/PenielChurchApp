import i18n from 'i18next';

// Links de download do app, usados no rodapé de textos compartilhados
// (devocional, versículo do dia, capítulo/versículos da Bíblia etc.) — assim
// quem recebe a mensagem consegue baixar o app também, não só ler o texto.
export const APP_STORE_URL = 'https://apps.apple.com/app/id6776841788';
export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=org.uk.penielchurch.app';

// Link único (mesmo do QR code): no iPhone abre a App Store, no Android abre
// o Google Play, no computador mostra a página com os dois botões.
// Página: repositório marcoslbrandao/peniel-app (GitHub Pages).
export const APP_LINK_URL = 'https://app.penielchurch.org.uk';

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
    i18n.t('compartilharApp.baixeLink', { lng, url: APP_LINK_URL, interpolation: semEscape }),
  ];
  return linhas.join('\n');
}
