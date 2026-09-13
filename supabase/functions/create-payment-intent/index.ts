// supabase/functions/create-payment-intent/index.ts
//
// Cria a cobrança da tela de Oferta. Fica ABERTA de propósito: a decisão de
// produto (13 Set 2026) é que visitante sem conta possa contribuir. Por isso
// a proteção não é login — é teto de valor, moeda travada, tipo validado e
// limite de tentativas por IP.
//
// O QUE ISTO EVITA
// Endpoint de pagamento aberto e sem teto é a isca clássica do card testing:
// fraudador dispara centenas de cobranças pequenas para descobrir quais
// cartões de uma lista roubada ainda funcionam. O prejuízo para a igreja não
// é o dinheiro — é o Stripe reagir CONGELANDO OS REPASSES da conta.
//
// Quem está logado tem o id anexado ao metadata do PaymentIntent, e é assim
// que a oferta aparece com dono em `offerings` quando o `stripe-webhook`
// confirmar o pagamento. Visitante gera oferta sem dono, o que é esperado.

import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
});

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Teto por transação, em libras. Escolhido pelo Marcos em 13 Set: precisa
// caber um dízimo grande (já houve um de £1.200) e ainda assim limitar o
// estrago de um abuso. Dá para mudar sem mexer no código, pelo segredo
// `OFERTA_TETO_GBP`.
const TETO = Number(Deno.env.get('OFERTA_TETO_GBP') ?? '5000');
const PISO = 1;

// Tentativas por IP na última hora. Folgado para uma pessoa que oferta
// algumas vezes num culto; apertado para um script.
const LIMITE_POR_HORA = 10;

const TIPOS_VALIDOS = ['dizimo', 'oferta', 'missoes', 'outro'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { valor, tipo, moeda } = await req.json();

    // ─── Validação do valor ──────────────────────────────────────────────
    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum < PISO) {
      return json({ error: `Valor mínimo: £${PISO}.` }, 400);
    }
    if (valorNum > TETO) {
      // Mensagem específica de propósito: quem tem uma contribuição grande
      // legítima precisa saber o que fazer, e não ficar olhando um erro seco.
      return json({ error: `Para contribuições acima de £${TETO}, fale com a secretaria da igreja.` }, 400);
    }

    // Centavos inteiros. `Math.round` no float já era o certo; o que faltava
    // era garantir que o que chega é número e não, por exemplo, "10e9".
    const valorEmCentavos = Math.round(valorNum * 100);

    // ─── Moeda e tipo não vêm mais do cliente sem conferência ────────────
    const moedaFinal = String(moeda ?? 'gbp').toLowerCase();
    if (moedaFinal !== 'gbp') {
      return json({ error: 'Moeda não suportada.' }, 400);
    }
    const tipoFinal = TIPOS_VALIDOS.includes(String(tipo)) ? String(tipo) : 'oferta';

    // ─── Freio por IP ────────────────────────────────────────────────────
    // `x-forwarded-for` pode vir com vários IPs encadeados; o primeiro é o
    // cliente. Sem cabeçalho nenhum, cai num balde único — o que é rígido de
    // propósito: chamada sem IP identificável é justamente a suspeita.
    const ip = (req.headers.get('x-forwarded-for') ?? 'desconhecido').split(',')[0].trim();
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error: erroContagem } = await admin
      .from('payment_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', umaHoraAtras);

    if (erroContagem) {
      // Se o freio quebrar, a oferta NÃO passa. Um freio que falha aberto não
      // é freio — e a tela sabe mostrar um erro.
      console.error('Falha ao consultar payment_attempts:', erroContagem);
      return json({ error: 'Não foi possível iniciar o pagamento agora. Tente de novo em instantes.' }, 503);
    }

    if ((count ?? 0) >= LIMITE_POR_HORA) {
      console.warn(`Limite por hora atingido pelo IP ${ip} (${count} tentativas).`);
      return json({ error: 'Muitas tentativas seguidas. Tente novamente mais tarde.' }, 429);
    }

    await admin.from('payment_attempts').insert({ ip, valor: valorNum });

    // ─── Quem está logado ganha dono na oferta ───────────────────────────
    // O app manda a chave anônima no Authorization quando ninguém está
    // logado — por isso não basta "tem header", tem que ser um token de
    // usuário de verdade. Falhar aqui não bloqueia nada: só significa
    // contribuição de visitante.
    let userId: string | null = null;
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (token && token !== SUPABASE_ANON_KEY) {
      const { data } = await admin.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: valorEmCentavos,
      currency: moedaFinal,
      automatic_payment_methods: { enabled: true },
      metadata: {
        tipo: tipoFinal,
        origem: 'app_peniel_church',
        // O webhook lê isto para gravar a oferta com dono. String vazia em
        // vez de null porque metadata do Stripe só aceita string.
        user_id: userId ?? '',
      },
    });

    return json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    // O erro do Stripe NÃO volta para o cliente: ele conta em qual modo a
    // chave está, qual objeto existe e qual não existe. Foi exatamente uma
    // mensagem dessas que expôs o problema de chave de teste em produção —
    // útil no log, não na tela de quem está ofertando.
    console.error('Erro ao criar Payment Intent:', error);
    return json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.' }, 500);
  }
});
