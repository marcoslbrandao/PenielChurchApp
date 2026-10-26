// supabase/functions/stripe-webhook/index.ts
//
// O lado do SERVIDOR confirmando o pagamento. Até 13 Set 2026 isto não
// existia: a tela de Oferta dizia "Contribuição recebida" só porque a folha
// do Stripe fechou sem erro no celular, e nada era gravado em `offerings`.
// Ou seja, a igreja não tinha registro nenhum de quem contribuiu pelo app, e
// bastava um problema entre o celular e o Stripe para a contribuição sumir
// sem ninguém notar.
//
// Esta função escuta o Stripe e grava a oferta QUANDO O PAGAMENTO REALMENTE
// ENTROU — não quando o app achou que entrou.
//
// COMO LIGAR (uma vez):
// 1. supabase functions deploy stripe-webhook --no-verify-jwt
//    (o Stripe não manda JWT nenhum; quem autentica aqui é a assinatura)
// 2. Painel do Stripe > Developers > Webhooks > Add endpoint
//    URL:    https://<projeto>.supabase.co/functions/v1/stripe-webhook
//    Evento: payment_intent.succeeded
// 3. Copiar o "Signing secret" (whsec_...) e:
//    supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_..."
//
// A assinatura é o que torna este endpoint seguro estando aberto: sem a
// chave de assinatura ninguém consegue forjar um evento e inventar uma
// oferta que nunca aconteceu.

import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
});

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (!WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET não configurado — evento recusado.');
    return new Response('Webhook não configurado', { status: 500 });
  }

  const assinatura = req.headers.get('stripe-signature');
  if (!assinatura) return new Response('Sem assinatura', { status: 400 });

  // Precisa do corpo CRU, byte a byte: qualquer reserialização (um
  // `JSON.parse` seguido de `stringify`, por exemplo) muda o texto e a
  // assinatura deixa de bater.
  const corpoCru = await req.text();

  let evento: Stripe.Event;
  try {
    // `constructEventAsync`, não `constructEvent`: no Deno a verificação usa
    // WebCrypto, que é assíncrona. A versão síncrona lança erro aqui.
    evento = await stripe.webhooks.constructEventAsync(corpoCru, assinatura, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Assinatura inválida:', err);
    return new Response('Assinatura inválida', { status: 400 });
  }

  if (evento.type !== 'payment_intent.succeeded') {
    // 200 de propósito: evento que não interessa não é erro, e devolver erro
    // faria o Stripe reenviar para sempre.
    return new Response(JSON.stringify({ ignorado: evento.type }), { status: 200 });
  }

  const pi = evento.data.object as Stripe.PaymentIntent;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let userId: string | null = pi.metadata?.user_id || null;
  const tipo = pi.metadata?.tipo || 'oferta';

  // Quem pagou. Pelo app logado vem o user_id; pelo LINK do Stripe (QR code
  // da live, site) nao vem nada — entao guardamos o nome e o e-mail que a
  // pessoa digitou na pagina do Stripe e, se o e-mail for de uma conta do
  // app, ligamos a oferta a ela. Sem isto o relatorio so mostrava
  // "Membro removido".
  let paganteNome: string | null = null;
  let paganteEmail: string | null = pi.receipt_email ?? null;
  try {
    if (pi.latest_charge) {
      const charge = typeof pi.latest_charge === 'string'
        ? await stripe.charges.retrieve(pi.latest_charge)
        : pi.latest_charge;
      paganteNome = charge.billing_details?.name ?? null;
      paganteEmail = charge.billing_details?.email ?? charge.receipt_email ?? paganteEmail;
    }
  } catch (err) {
    console.error('Nao deu para ler o pagante no Stripe:', err);
  }
  if (!userId && paganteEmail) {
    const { data: conta } = await admin.rpc('perfil_por_email', { p_email: paganteEmail });
    if (conta) userId = conta as string;
  }

  const { error } = await admin.from('offerings').insert({
    user_id: userId,
    valor: (pi.amount_received ?? pi.amount) / 100,
    moeda: pi.currency,
    tipo,
    metodo: 'stripe',
    data: new Date(pi.created * 1000).toISOString().slice(0, 10),
    stripe_payment_intent: pi.id,
    pagante_nome: paganteNome,
    pagante_email: paganteEmail,
  });

  if (error) {
    // 23505 = violação de índice único. É o Stripe reenviando um evento que
    // já foi gravado (ele reenvia até receber 200) — não é problema, e
    // responder erro faria ele reenviar de novo, para sempre.
    // Aproveita o reenvio para completar quem pagou nas ofertas antigas que
    // ficaram sem nome (Stripe > Eventos > Reenviar).
    if ((error as { code?: string }).code === '23505') {
      const { data: antiga } = await admin.from('offerings')
        .select('id, user_id, pagante_nome, pagante_email')
        .eq('stripe_payment_intent', pi.id).maybeSingle();
      if (antiga) {
        const completar: Record<string, string> = {};
        if (!antiga.user_id && userId) completar.user_id = userId;
        if (!antiga.pagante_nome && paganteNome) completar.pagante_nome = paganteNome;
        if (!antiga.pagante_email && paganteEmail) completar.pagante_email = paganteEmail;
        if (Object.keys(completar).length) {
          await admin.from('offerings').update(completar).eq('id', antiga.id);
        }
      }
      return new Response(JSON.stringify({ duplicado: pi.id }), { status: 200 });
    }
    console.error('Falha ao gravar a oferta:', error, 'payment_intent:', pi.id);
    // 500 aqui é o certo: o Stripe tenta de novo, e a oferta não se perde.
    return new Response('Falha ao gravar', { status: 500 });
  }

  return new Response(JSON.stringify({ gravado: pi.id }), { status: 200 });
});
