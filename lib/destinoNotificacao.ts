// Para onde vai o toque numa notificação.
//
// O push já viaja com `data` — quem monta esse objeto são as Edge Functions
// `content-notifications` (aviso, devocional, short, mensagem),
// `escala-notifications` e `versiculo-notification`. Até agora o app recebia
// esse `data` e jogava fora: o listener de toque em `useNotifications.ts` era
// um `console.log`. Este arquivo é a tradução de `data` para uma rota.
//
// POR QUE UMA FUNÇÃO PURA, E NÃO UM `navigate` SOLTO NO LISTENER
// Duas razões práticas. A primeira é o arranque a frio: quando o toque é o
// que ABRE o app, a resposta acontece antes de a navegação existir, então o
// destino precisa ficar guardado até `navigationRef.isReady()` — mesmo padrão
// que o deep link de redefinir senha já usa no App.tsx. A segunda é que a
// decisão depende do papel do usuário, que também chega depois; separar o
// cálculo do efeito deixa os dois esperarem sem duplicar regra.
//
// A GUARDA DE ACESSO EXISTE PORQUE A NOTIFICAÇÃO SOBREVIVE AO ACESSO
// O push de grupo só é enviado para quem é do grupo, mas ele fica no celular
// depois disso. A pessoa pode sair do grupo, perder o acesso de membro ou
// deslogar, e tocar num push de ontem. Sem guarda, o app tentaria abrir a aba
// Membros, que para ela nem existe (ver App.tsx: a aba é condicional) — e o
// React Navigation simplesmente não navega, sem erro nenhum. Por isso todo
// destino de membro cai no sininho da Home quando o acesso não está lá.

export type DadosNotificacao = {
  type?: string;
  grupo?: string | null;
  origem?: string | null;
  id?: string | null;
  // Link do aviso (`avisos.cta_url`, ex.: o Zoom). Com ele, o toque abre o
  // link direto em vez do sininho (26/10/2026).
  url?: string | null;
};

// `url` = abrir um link fora do app; senão é uma rota do app.
export type Destino = { nome: string; params?: any; url?: undefined } | { url: string; nome?: undefined; params?: undefined };

/** O sininho da Home — destino neutro e sempre acessível. */
const SININHO: Destino = { nome: 'MainTabs', params: { screen: 'Inicio', params: { abrirSininho: true } } };

function abaMembros(screen: string, params?: any): Destino {
  return { nome: 'MainTabs', params: { screen: 'Membros', params: { screen, params } } };
}

function abaPrincipal(screen: string, params?: any): Destino {
  return { nome: 'MainTabs', params: { screen, params } };
}

export function destinoDaNotificacao(
  dados: DadosNotificacao | undefined | null,
  acesso: { ehMembro: boolean; logado: boolean; ehAdmin?: boolean },
): Destino | null {
  if (!dados?.type) return null;
  const { type, grupo, origem } = dados;
  const podeMembros = acesso.logado && acesso.ehMembro;

  // Aviso com link (Zoom da Reunião de Oração / Estudo Bíblico, YouTube do
  // culto): "Toque para entrar" tem de entrar mesmo.
  if (dados.url) return { url: dados.url };

  // Conteúdo de grupo — aviso, devocional ou short com `grupo` preenchido.
  // Tudo mora na mesma tela (abas dentro de Grupos), então o grupo vai como
  // `grupoInicial` e só o chat pede um parâmetro a mais.
  if (grupo) {
    if (!podeMembros) return SININHO;
    return abaMembros('Grupos', { grupoInicial: grupo, abrirChat: origem === 'chat' || undefined });
  }

  switch (type) {
    case 'aviso':
      // Aviso geral vive no mural do sininho; não há tela dedicada a um
      // aviso só.
      return SININHO;
    case 'devocional':
      // Rota do Stack (modal), não aba — por isso não passa por abaPrincipal.
      return { nome: 'Devocionais' };
    case 'short':
    case 'mensagem':
      return abaPrincipal('Midia');
    case 'versiculo':
      // O versículo do dia é o bloco da própria Home.
      return abaPrincipal('Inicio');
    case 'escala':
      return podeMembros ? abaMembros('Escalas') : SININHO;
    case 'banda':
      // A aba Banda vive dentro da Área do Membro, como Grupos e Escalas —
      // por isso `abaMembros`, e por isso o gate: quem perdeu o acesso de
      // membro e toca num push de ontem cairia numa aba que não existe mais
      // para ele, e o React Navigation simplesmente não navegaria.
      if (!podeMembros) return SININHO;
      // Push do chat da Banda já abre o chat (26/10/2026). `Date.now()` para
      // dois toques seguidos não serem o mesmo valor e o efeito disparar.
      return abaMembros('Banda', origem === 'chat' ? { abrirChat: Date.now() } : undefined);
    case 'admin_contato':
    case 'admin_oracao':
    case 'admin_denuncia':
      // Push só do Admin (mensagem de Contato / pedido de oração): abre o
      // painel Admin já na aba certa.
      if (!acesso.logado || !acesso.ehAdmin) return SININHO;
      return abaMembros('Admin', { aba: type === 'admin_contato' ? 'contato' : type === 'admin_denuncia' ? 'denuncias' : 'oracao' });
    case 'chat_igreja':
      // Push do Chat da Igreja (19/10/2026): abre a Home e já abre a janela
      // do chat. Só membro tem o cartão; quem perdeu o acesso cai no sininho.
      return podeMembros ? abaPrincipal('Inicio', { abrirChatIgreja: Date.now() }) : SININHO;
    case 'aniversario_visitante':
      // Parabéns do próprio visitante: o cartão está na Home.
      return abaPrincipal('Inicio');
    case 'birthday':
      // Rota do Stack (modal), como Devocionais. A lista é servida pela RPC
      // `aniversariantes_do_mes`, que devolve vazio sem sessão — então quem
      // tocar num push antigo já deslogado veria uma tela em branco sem
      // explicação. O sininho é o destino honesto nesse caso.
      return acesso.logado ? { nome: 'Aniversariantes' } : SININHO;
    default:
      // Tipo novo que o app ainda não conhece (um binário antigo recebendo
      // push de um tipo criado depois): abrir o app e não fazer nada é
      // melhor que navegar para lugar errado.
      return null;
  }
}

/**
 * Toque num card do sininho (o mural de avisos). Só tem destino o aviso que
 * leva a algum lugar: com link, ou de um grupo. Aviso geral sem link já está
 * sendo lido ali mesmo — devolve null e o card não fica tocável.
 */
export function destinoDoAviso(
  aviso: { grupo?: string | null; origem?: string | null; cta_url?: string | null },
  acesso: { ehMembro: boolean; logado: boolean; ehAdmin?: boolean },
): Destino | null {
  if (aviso.cta_url) return { url: aviso.cta_url };
  if (!aviso.grupo) return null;
  if (!(acesso.logado && acesso.ehMembro)) return null;
  return destinoDaNotificacao({ type: 'aviso', grupo: aviso.grupo, origem: aviso.origem }, acesso);
}
