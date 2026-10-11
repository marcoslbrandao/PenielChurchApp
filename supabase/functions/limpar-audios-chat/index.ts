// supabase/functions/limpar-audios-chat/index.ts
//
// Apaga do Storage os arquivos dos chats cuja mensagem já não existe:
//   • bucket `chat-audio`  → áudios do chat dos grupos (RPC chat_audios_orfaos)
//   • bucket `chat-geral`  → fotos, áudios e vídeos do Chat da Igreja
//                            (RPC chat_geral_midias_orfas, desde 11/10/2026)
//
// O arquivo segue a mensagem: a regra de quanto tempo a conversa fica guardada
// continua morando num lugar só — os crons que apagam as mensagens
// (`limpar-chat-grupos-antigo`, 14 dias; `limpar-chat-geral`, 15 dias). Esta
// função só varre o que ficou órfão depois disso (e também o que o autor ou o
// líder/admin apagou, e o upload de um envio que falhou no meio).
//
// Por que uma Edge Function e não SQL puro no cron: o Supabase não deixa
// apagar direto de `storage.objects` ("Direct deletion from storage tables is
// not allowed") — a linha sumiria e o arquivo ficaria no disco. Só a API do
// Storage apaga os dois.
//
// CRON: 30 3 * * *  (depois das limpezas das mensagens, às 3h e 3h15 UTC)

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chamadaAutorizada, respostaNaoAutorizado } from '../_shared/hook-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOTE = 500;
const MAX_LOTES = 20;

const ALVOS = [
  { bucket: 'chat-audio', rpc: 'chat_audios_orfaos' },
  { bucket: 'chat-geral', rpc: 'chat_geral_midias_orfas' },
];

async function limpar(sb: SupabaseClient, bucket: string, rpc: string) {
  let removidos = 0;
  for (let i = 0; i < MAX_LOTES; i++) {
    const { data, error } = await sb.rpc(rpc, { p_limite: LOTE });
    if (error) return { bucket, ok: false, erro: `${rpc}: ${error.message}`, removidos };
    const caminhos = ((data ?? []) as { caminho: string }[]).map(r => r.caminho);
    if (caminhos.length === 0) break;

    const { error: errRemove } = await sb.storage.from(bucket).remove(caminhos);
    if (errRemove) return { bucket, ok: false, erro: `remove: ${errRemove.message}`, removidos };
    removidos += caminhos.length;
    if (caminhos.length < LOTE) break;
  }
  return { bucket, ok: true, removidos };
}

Deno.serve(async (req) => {
  if (!chamadaAutorizada(req)) return respostaNaoAutorizado();

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // Um bucket com problema não impede a limpeza do outro.
  const resultados = [];
  for (const alvo of ALVOS) {
    const r = await limpar(sb, alvo.bucket, alvo.rpc);
    if (!r.ok) console.error(`limpar-audios-chat [${alvo.bucket}]:`, r.erro);
    resultados.push(r);
  }

  const ok = resultados.every(r => r.ok);
  const removidos = resultados.reduce((s, r) => s + r.removidos, 0);
  console.log(`limpar-audios-chat: ${removidos} arquivo(s) removido(s)`, JSON.stringify(resultados));
  return new Response(JSON.stringify({ ok, removidos, resultados }), {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
});
