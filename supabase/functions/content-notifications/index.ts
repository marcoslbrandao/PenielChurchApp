// supabase/functions/content-notifications/index.ts
// Disparado por um Database Webhook do Supabase sempre que uma linha nova é
// inserida em `avisos` ou `devocionais` (grupo geral). Manda push real para
// todos os membros com notificações ativas (tabela push_tokens).
//
// Como ligar (uma vez só, no Supabase Dashboard):
// 1. Deploy: supabase functions deploy content-notifications
// 2. Dashboard > Database > Webhooks > Create a new webhook
//    - Table: avisos   | Events: Insert | Type: Supabase Edge Functions
//      Edge Function: content-notifications
//    - Repita criando um segundo webhook igual para a tabela: devocionais
//      (esse dispara para toda inserção; o código abaixo ignora devocionais
//      de grupo específico e só notifica os gerais, grupo = null)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const table = payload.table as string;
    const record = payload.record as any;

    let titulo = '';
    let corpo = '';
    let tipo = '';

    if (table === 'avisos') {
      const tag = record.tipo === 'urgente' ? '🚨' : record.tipo === 'evento' ? '📅' : '📢';
      titulo = `${tag} ${record.titulo}`;
      corpo = String(record.texto ?? '').slice(0, 140);
      tipo = 'aviso';
    } else if (table === 'devocionais') {
      // Só notifica devocionais gerais (Home) — devocionais de grupo específico
      // (mulheres/homens/jovens) não disparam push para todo mundo.
      if (record.grupo) {
        return new Response(JSON.stringify({ message: 'Devocional de grupo específico, sem push geral.' }), { status: 200 });
      }
      titulo = `📖 Novo devocional: ${record.titulo}`;
      corpo = `"${record.versiculo}" — ${record.referencia}`;
      tipo = 'devocional';
    } else {
      return new Response(JSON.stringify({ message: `Tabela ${table} não é tratada por esta função.` }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: tokens, error: tokensError } = await supabase.from('push_tokens').select('token');
    if (tokensError) throw tokensError;

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum token de push encontrado.' }), { status: 200 });
    }

    const mensagens = tokens.map((t: any) => ({
      to: t.token,
      title: titulo,
      body: corpo,
      sound: 'default',
      data: { type: tipo },
    }));

    // Expo aceita no máximo 100 mensagens por request — quebra em lotes.
    const lotes = [];
    for (let i = 0; i < mensagens.length; i += 100) lotes.push(mensagens.slice(i, i + 100));

    const resultados = [];
    for (const lote of lotes) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lote),
      });
      resultados.push(await response.json());
    }

    return new Response(JSON.stringify({ success: true, enviados: tokens.length, resultados }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
