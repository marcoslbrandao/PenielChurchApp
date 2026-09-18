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
};

export type Destino = { nome: string; params?: any };

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
  acesso: { ehMembro: boolean; logado: boolean },
): Destino | null {
  if (!dados?.type) return null;
  const { type, grupo, origem } = dados;
  const podeMembros = acesso.logado && acesso.ehMembro;

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
      return podeMembros ? abaMembros('Banda') : SININHO;
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
