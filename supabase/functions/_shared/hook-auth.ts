// supabase/functions/_shared/hook-auth.ts
//
// Portão das funções que só devem ser chamadas PELO PRÓPRIO SUPABASE — um
// Database Webhook ou um cron. Nenhuma delas tem motivo para aceitar uma
// chamada vinda de um celular ou de um navegador.
//
// POR QUE ISTO EXISTE
// `content-notifications` recebe `{ table, record }` no corpo e dispara push
// com service role. Sem este portão, qualquer pessoa com a chave anônima do
// app — que sai de um .ipa em minutos — mandava uma notificação para a
// congregação inteira, com o texto que quisesse, com a cara do app da igreja.
// Isso furava por fora a regra de produto de que só admin e líder de grupo
// criam notificação: a regra estava certa no banco (RLS de `avisos`) e a
// função de push passava por cima dela.
//
// COMO AUTORIZA (qualquer um dos dois basta)
// 1. Cabeçalho `x-peniel-hook` igual ao segredo `PUSH_HOOK_SECRET`.
// 2. `Authorization: Bearer <SERVICE_ROLE_KEY>` — é o que os crons e webhooks
//    criados pelo painel do Supabase já costumam mandar. Aceitar isso evita
//    que a função pare de funcionar antes de o segredo ser configurado.
//
// A chave ANÔNIMA não autoriza nada aqui, de propósito: é ela que está no
// bundle do app.
//
// Configurar (uma vez):
//   supabase secrets set PUSH_HOOK_SECRET="$(openssl rand -hex 32)"
// e acrescentar o cabeçalho `x-peniel-hook: <mesmo valor>` em cada Database
// Webhook (avisos, devocionais, shorts_videos, mensagens) e em cada cron que
// chama estas funções.

function comparaEmTempoConstante(a: string, b: string): boolean {
  // Comparar com `===` vaza, pelo tempo de resposta, quantos caracteres do
  // início bateram — dá para descobrir o segredo caractere a caractere.
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export function chamadaAutorizada(req: Request): boolean {
  const segredo = Deno.env.get('PUSH_HOOK_SECRET') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Enquanto o segredo NÃO estiver configurado, a função continua atendendo
  // como sempre atendeu. Isso é de propósito: se o portão passasse a valer no
  // instante do deploy, as notificações da igreja parariam de sair até alguém
  // acrescentar o cabeçalho em cada webhook — e ninguém perceberia na hora,
  // porque push que não sai não dá erro em lugar nenhum. Assim a ordem é:
  // publicar o código (nada muda) → criar o segredo e pôr o cabeçalho nos
  // webhooks e crons → a partir daí o portão está de pé. Enquanto isso, o
  // aviso abaixo fica nos logs da função.
  if (!segredo) {
    console.warn('PUSH_HOOK_SECRET não configurado — função aberta. Ver supabase/functions/_shared/hook-auth.ts');
    return true;
  }

  const cabecalho = req.headers.get('x-peniel-hook') ?? '';
  if (segredo && cabecalho && comparaEmTempoConstante(cabecalho, segredo)) return true;

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (serviceKey && token && comparaEmTempoConstante(token, serviceKey)) return true;

  return false;
}

export function respostaNaoAutorizado(): Response {
  // Resposta seca de propósito: não confirma se a função existe, o que ela
  // faz, nem por que recusou.
  return new Response(JSON.stringify({ error: 'Não autorizado.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
