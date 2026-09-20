// supabase/functions/limpar-audios-chat/index.ts
//
// Apaga do Storage os áudios do chat cuja mensagem já não existe.
//
// O áudio segue a mensagem: a regra de quanto tempo a conversa fica guardada
// continua morando num lugar só — o cron `limpar-chat-grupos-antigo`, que
// apaga as mensagens com mais de 14 dias. Esta função só varre o que ficou
// órfão depois disso (e também o que o autor ou o líder apagou, e o upload de
// um envio que falhou no meio).
//
// Por que uma Edge Function e não SQL puro no cron: o Supabase não deixa
// apagar direto de `storage.objects` ("Direct deletion from storage tables is
// not allowed") — a linha sumiria e o arquivo ficaria no disco. Só a API do
// Storage apaga os dois.
//
// CRON: 30 3 * * *  (meia hora depois da limpeza das mensagens, às 3h UTC)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chamadaAutorizada, respostaNaoAutorizado } from '../_shared/hook-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'chat-audio';
const LOTE = 500;
const MAX_LOTES = 20;

Deno.serve(async (req) => {
  if (!chamadaAutorizada(req)) return respostaNaoAutorizado();

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let removidos = 0;

  for (let i = 0; i < MAX_LOTES; i++) {
    const { data, error } = await sb.rpc('chat_audios_orfaos', { p_limite: LOTE });
    if (error) {
      console.error('chat_audios_orfaos falhou:', error.message);
      return new Response(JSON.stringify({ ok: false, erro: error.message, removidos }), { status: 500 });
    }
    const caminhos = ((data ?? []) as { caminho: string }[]).map(r => r.caminho);
    if (caminhos.length === 0) break;

    const { error: errRemove } = await sb.storage.from(BUCKET).remove(caminhos);
    if (errRemove) {
      console.error('remove falhou:', errRemove.message);
      return new Response(JSON.stringify({ ok: false, erro: errRemove.message, removidos }), { status: 500 });
    }
    removidos += caminhos.length;
    if (caminhos.length < LOTE) break;
  }

  console.log(`limpar-audios-chat: ${removidos} arquivo(s) removido(s)`);
  return new Response(JSON.stringify({ ok: true, removidos }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
