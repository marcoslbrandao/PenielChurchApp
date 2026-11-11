// supabase/functions/evento-pagamento/index.ts
//
// Cobrança de uma parcela de inscrição em evento (Retiro Peniel 2027 e outros),
// pedido do Marcos em 11/11/2026 — pagamento LIVRE: a pessoa paga o valor
// que quiser, quando quiser, até quitar.
//
// Diferente da Oferta, aqui EXIGE login: o pagamento é sempre de uma
// inscrição, e só o próprio responsável paga a sua. O valor é conferido com
// o saldo no banco (nunca maior que o que falta).
//
// iPhone: devolve { clientSecret } para a PaymentSheet (Apple Pay/cartão).
// Android: devolve { url } do Checkout do Stripe (Google Pay/cartão), como a
//          Oferta faz até sair a aprovação do Google Pay no app.
//
// Quem grava o pagamento é o stripe-webhook (metadata.tipo = 'evento'),
// quando o dinheiro realmente entra — não o app.

import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-12-18.acacia' });
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RETORNO = 'https://penielchurch.org.uk/';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const { data: u } = await admin.auth.getUser(token);
    const userId = u?.user?.id;
    if (!userId) return json({ error: 'Entre na sua conta para pagar.' }, 401);

    const { inscricao_id, valor, plataforma } = await req.json();
    const valorNum = Math.round(Number(valor) * 100) / 100;
    if (!Number.isFinite(valorNum) || valorNum < 1) return json({ error: 'Valor mínimo: £1.' }, 400);

    const { data: insc, error: erroInsc } = await admin
      .from('inscricoes')
      .select('id, responsavel_id, status, evento_id, agenda_eventos(nome)')
      .eq('id', inscricao_id)
      .maybeSingle();
    if (erroInsc || !insc || insc.responsavel_id !== userId) return json({ error: 'Inscrição não encontrada.' }, 404);
    if (insc.status !== 'confirmada') {
      return json({ error: insc.status === 'espera'
        ? 'Sua inscrição está na lista de espera. O pagamento abre quando a vaga for confirmada.'
        : 'Esta inscrição foi cancelada.' }, 400);
    }

    const { data: saldo, error: erroSaldo } = await admin.rpc('inscricao_saldo', { p_inscricao: insc.id });
    if (erroSaldo) throw erroSaldo;
    const falta = Number(saldo ?? 0);
    if (falta <= 0) return json({ error: 'Esta inscrição já está quitada. 🎉' }, 400);
    if (valorNum > falta) return json({ error: `O valor é maior do que falta (£${falta.toFixed(2)}).` }, 400);

    const nomeEvento = (insc as any).agenda_eventos?.nome ?? 'Evento';
    const metadata = {
      tipo: 'evento',
      inscricao_id: insc.id,
      evento_id: insc.evento_id,
      user_id: userId,
      origem: 'app_peniel_church',
    };
    const centavos = Math.round(valorNum * 100);

    if (plataforma === 'android') {
      const sessao = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: { currency: 'gbp', product_data: { name: `${nomeEvento} — inscrição` }, unit_amount: centavos },
          quantity: 1,
        }],
        payment_method_types: ['card'],
        success_url: `${RETORNO}?evento=pago`,
        cancel_url: RETORNO,
        metadata,
        payment_intent_data: { metadata, description: `${nomeEvento} — inscrição` },
      });
      return json({ url: sessao.url });
    }

    const pi = await stripe.paymentIntents.create({
      amount: centavos,
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      description: `${nomeEvento} — inscrição`,
      metadata,
    });
    return json({ clientSecret: pi.client_secret });
  } catch (e) {
    console.error('evento-pagamento:', e);
    return json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.' }, 500);
  }
});
