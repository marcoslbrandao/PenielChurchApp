import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
});

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Mesmos limites da create-payment-intent (teto/piso por transacao).
const TETO = Number(Deno.env.get('OFERTA_TETO_GBP') ?? '5000');
const PISO = 1;
const TIPOS_VALIDOS = ['dizimo', 'oferta', 'missoes', 'outro'];

// O app no Android abre este checkout no navegador enquanto o Google Pay
// dentro do app espera a aprovacao do Google (precisa do numero de charity).
// Quem chama logado manda o token; ele vira user_id no metadata do
// PaymentIntent, que e o que o stripe-webhook le para gravar a oferta com dono.
async function usuarioDoToken(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token === SUPABASE_ANON_KEY) return null;
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data } = await admin.auth.getUser(token);
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Para onde o Stripe devolve a pessoa depois do pagamento. O site manda a
// propria pagina em `retorno`; so aceitamos enderecos da igreja (site novo de
// teste e dominio oficial). Sem `retorno` valido, volta para a Home oficial.
const RETORNO_PADRAO = 'https://penielchurch.org.uk/';
const ORIGENS_PERMITIDAS = [
  'https://penielchurch.org.uk',
  'https://www.penielchurch.org.uk',
  'https://marcoslbrandao.github.io',
];

function paginaDeRetorno(bruto: string | null | undefined): string {
  if (!bruto) return RETORNO_PADRAO;
  try {
    const u = new URL(bruto);
    if (!ORIGENS_PERMITIDAS.includes(u.origin)) return RETORNO_PADRAO;
    return `${u.origin}${u.pathname}`;
  } catch {
    return RETORNO_PADRAO;
  }
}

type Extra = { tipo?: string | null; userId?: string | null; origem?: string };

async function criarSessao(valor: number, moeda: string, retorno?: string | null, extra: Extra = {}) {
  const valorEmCentavos = Math.round(valor * 100);
  const tipo = TIPOS_VALIDOS.includes(extra.tipo ?? '') ? extra.tipo! : 'oferta';
  const origem = extra.origem ?? 'site_peniel_church';
  const pagina = paginaDeRetorno(retorno);
  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: moeda || 'gbp',
          product_data: { name: 'Dízimos & Ofertas — Peniel Church' },
          unit_amount: valorEmCentavos,
        },
        quantity: 1,
      },
    ],
    payment_method_types: ['card'],
    // Apple Pay e Google Pay aparecem automaticamente no Checkout hospedado
    // do Stripe quando habilitados na conta — não precisa listar aqui.
    success_url: `${pagina}?oferta=sucesso#oferta`,
    cancel_url: `${pagina}#oferta`,
    metadata: { origem },
    // O webhook escuta payment_intent.succeeded e le o metadata do
    // PaymentIntent, nao o da sessao — por isso vai aqui tambem.
    payment_intent_data: {
      metadata: { tipo, origem, user_id: extra.userId ?? '' },
    },
  });
}

// Dois modos:
// - GET (?valor=25): pensado pra ser chamado direto por um <a href> no
//   site (WordPress.com neutraliza <form> e não executa <script> em
//   blocos de conteúdo, então nada de fetch/JS aqui — só link puro).
//   Responde com um redirect 302 direto pro checkout do Stripe.
//   "Verify JWT" está desligado nesta função (Settings) pra permitir a
//   navegação direta sem headers de autenticação.
// - POST ({ valor, moeda }): modo programático (fetch/JS), responde com
//   { url } em JSON, pro chamador decidir o que fazer.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const valor = Number(url.searchParams.get('valor'));
      const moeda = url.searchParams.get('moeda') || 'gbp';
      const retorno = url.searchParams.get('retorno');

      if (!valor || valor < PISO || valor > TETO) {
        return new Response('Valor inválido', { status: 400, headers: corsHeaders });
      }

      const session = await criarSessao(valor, moeda, retorno);
      return Response.redirect(session.url!, 302);
    }

    const { valor, moeda, retorno, tipo, origem } = await req.json();

    if (!valor || valor < PISO || valor > TETO) {
      return new Response(
        JSON.stringify({ error: 'Valor inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = await usuarioDoToken(req);
    const session = await criarSessao(valor, moeda, retorno, {
      tipo,
      userId,
      origem: origem === 'app_android' ? 'app_android' : undefined,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro ao criar Checkout Session:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
