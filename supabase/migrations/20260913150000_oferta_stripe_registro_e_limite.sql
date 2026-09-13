-- ============================================================================
-- Oferta pelo Stripe: registro real da contribuição + freio contra abuso
-- (13 Set 2026)
--
-- DUAS COISAS QUE FALTAVAM
--
-- 1. NADA ERA GRAVADO. A tela dizia "Contribuição recebida" só porque a folha
--    do Stripe fechou sem erro. Não existia webhook, então o servidor nunca
--    confirmava nada e `offerings` só tinha lançamento digitado à mão pelo
--    admin. Quem ofertou pelo app não aparecia em lugar nenhum.
--
-- 2. O ENDPOINT ERA ABERTO. `create-payment-intent` aceita qualquer chamada e
--    a única validação do valor era `> 0`. O risco real não é a igreja perder
--    dinheiro — é card testing: fraudador usa endpoint aberto assim para
--    testar listas de cartões roubados, e o Stripe reage CONGELANDO OS
--    REPASSES da conta. Para uma igreja é o pior resultado possível.
--
-- Decisão do Marcos (13 Set): visitante SEM CONTA continua podendo ofertar —
-- exigir login espantaria quem chega de fora. Então a proteção é teto de
-- valor (£5.000), moeda travada e limite de tentativas por IP, e não login.
-- ============================================================================


-- ─── 1. `offerings` passa a receber o que veio pelo Stripe ─────────────────

-- Visitante sem conta pode ofertar, logo a oferta pode não ter dono. A policy
-- "Usuário vê suas próprias ofertas" (auth.uid() = user_id) simplesmente não
-- casa com linha de user_id nulo — ou seja, essas ficam visíveis só para o
-- admin, que é o que se quer.
alter table public.offerings alter column user_id drop not null;

-- `metodo` tinha um check fechado que não previa cartão pelo app.
alter table public.offerings drop constraint if exists offerings_metodo_check;
alter table public.offerings add constraint offerings_metodo_check
  check (metodo is null or metodo in ('sumup', 'pix', 'dinheiro', 'transferencia', 'stripe', 'outro'));

alter table public.offerings
  add column if not exists moeda text not null default 'gbp',
  add column if not exists stripe_payment_intent text;

-- A chave de idempotência do webhook: o Stripe reenvia o mesmo evento quando
-- não recebe 200, e sem isto a mesma oferta entraria duas ou três vezes.
create unique index if not exists offerings_stripe_payment_intent_key
  on public.offerings (stripe_payment_intent)
  where stripe_payment_intent is not null;


-- ─── 2. Freio de tentativas de pagamento ───────────────────────────────────
-- Uma linha por tentativa de criar cobrança. A função conta as da última hora
-- para o mesmo IP antes de falar com o Stripe. Não impede uma pessoa de
-- ofertar várias vezes num culto (o limite é folgado); impede o script que
-- dispara centenas de tentativas para peneirar cartões roubados.
create table if not exists public.payment_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  valor numeric(10, 2),
  created_at timestamptz not null default now()
);

create index if not exists payment_attempts_ip_created_idx
  on public.payment_attempts (ip, created_at desc);

-- RLS ligada e NENHUMA policy: ninguém com a chave do app lê ou escreve aqui.
-- A Edge Function usa service role, que passa por cima da RLS por definição.
alter table public.payment_attempts enable row level security;

-- Limpeza: a tabela só serve para a janela de 1 hora. Sem isto ela cresce
-- para sempre.
-- Desagenda antes de agendar para a migração poder ser rodada de novo sem
-- erro de job duplicado.
do $$
begin
  perform cron.unschedule('limpar-payment-attempts');
exception when others then null;
end $$;

select cron.schedule(
  'limpar-payment-attempts',
  '30 3 * * *',
  $$ delete from public.payment_attempts where created_at < now() - interval '2 days'; $$
);


-- ─── 3. Conferência ────────────────────────────────────────────────────────
-- Depois de uma oferta de teste de £1 pelo app:
--   select valor, moeda, metodo, user_id, stripe_payment_intent, created_at
--   from public.offerings where metodo = 'stripe'
--   order by created_at desc limit 5;
-- A linha só aparece se o webhook `stripe-webhook` estiver configurado no
-- painel do Stripe — ver supabase/functions/stripe-webhook/index.ts.
