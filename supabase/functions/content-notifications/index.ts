// supabase/functions/content-notifications/index.ts
// Disparado por um Database Webhook do Supabase sempre que uma linha nova é
// inserida em `avisos`, `devocionais`, `shorts_videos` ou `mensagens`.
// Manda push real via Expo.
//
// Segmentação:
// - `avisos`/`shorts_videos` com `grupo` preenchido (mulheres/homens/jovens/
//   estudo_biblico) → só quem está em `grupo_membros` daquele grupo (via
//   `members.profile_id`) E cuja conta não é `visitante` (role != 'visitante').
// - `avisos` sem grupo mas com `apenas_membros = true` → todo mundo com
//   conta cuja role não é `visitante` (ou seja, membro/líder/admin).
// - Qualquer outro caso sem grupo (avisos gerais, devocionais, mensagens,
//   shorts públicos da aba Mídia) → push geral pra todo mundo com token,
//   membro ou visitante — igual sempre foi.
//
// Como ligar (uma vez só, no Supabase Dashboard):
// 1. Deploy: supabase functions deploy content-notifications
// 2. Dashboard > Database > Webhooks > Create a new webhook
//    - Table: avisos          | Events: Insert | Type: Supabase Edge Functions
//      Edge Function: content-notifications
//    - Repita criando webhooks iguais para as tabelas: devocionais,
//      shorts_videos, mensagens

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chamadaAutorizada, respostaNaoAutorizado } from '../_shared/hook-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  // Só o próprio Supabase (Database Webhook ou cron) chama esta função. Sem
  // este portão, qualquer um com a chave anônima do app disparava push para a
  // congregação inteira — ver supabase/functions/_shared/hook-auth.ts.
  if (!chamadaAutorizada(req)) return respostaNaoAutorizado();

  try {
    const payload = await req.json();
    const table = payload.table as string;
    const record = payload.record as any;

    let titulo = '';
    let corpo = '';
    let tipo = '';

    if (table === 'avisos') {
      const tag = record.origem === 'material' ? '📎'
        : record.origem === 'evento' ? '📅'
        : record.origem === 'chat' ? '💬'
        : record.tipo === 'urgente' ? '🚨'
        : record.tipo === 'evento' ? '📅'
        : '📢';
      titulo = `${tag} ${record.titulo}`;
      corpo = String(record.texto ?? '').slice(0, 140);
      tipo = 'aviso';
    } else if (table === 'devocionais') {
      titulo = `📖 Novo devocional: ${record.titulo}`;
      corpo = `"${record.versiculo}" — ${record.referencia}`;
      tipo = 'devocional';
    } else if (table === 'shorts_videos') {
      titulo = record.grupo ? '🎬 Novo vídeo do grupo' : '🎬 Novo Short no Mídia';
      corpo = String(record.titulo ?? '').slice(0, 140);
      tipo = 'short';
    } else if (table === 'mensagens') {
      titulo = `📝 Nova mensagem: ${record.titulo}`;
      corpo = String(record.resumo ?? '').slice(0, 140);
      tipo = 'mensagem';
    } else {
      return new Response(JSON.stringify({ message: `Tabela ${table} não é tratada por esta função.` }), { status: 200 });
    }

    // Avisos "espelho": desde a migração 20260908230000, um devocional, short,
    // material, evento ou conversa no chat de um grupo cria automaticamente uma
    // linha em `avisos` — é assim que esse conteúdo aparece no sininho da Home
    // de quem é do grupo. Devocionais e shorts JÁ têm webhook próprio e já
    // mandaram o push; empurrar o espelho deles também faria a mesma coisa
    // chegar duas vezes no celular. Material, evento e chat não têm webhook
    // próprio, então nesses o espelho é justamente quem manda o push.
    if (table === 'avisos' && (record.origem === 'devocional' || record.origem === 'short')) {
      return new Response(
        JSON.stringify({ message: `Espelho de ${record.origem} — push já enviado pelo webhook da tabela de origem.` }),
        { status: 200 },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const grupo = record.grupo as string | null | undefined;
    const apenasMembros = table === 'avisos' && record.apenas_membros === true;

    let tokens: { token: string }[] | null = null;

    if (grupo) {
      // Só quem foi adicionado a esse grupo (pelo líder) recebe, e só se a
      // conta não for de visitante. Busca via grupo_membros ->
      // members.profile_id -> profiles.role -> push_tokens.user_id.
      const { data: membros, error: membrosError } = await supabase
        .from('grupo_membros')
        .select('members(profile_id)')
        .eq('grupo', grupo);
      if (membrosError) throw membrosError;

      const profileIds = [...new Set(
        (membros ?? [])
          .map((m: any) => m.members?.profile_id)
          .filter((id: string | null) => !!id)
      )];

      if (profileIds.length === 0) {
        return new Response(JSON.stringify({ message: `Ninguém com conta vinculada no grupo ${grupo} ainda.` }), { status: 200 });
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles').select('id').in('id', profileIds).neq('role', 'visitante');
      if (profilesError) throw profilesError;

      const memberProfileIds = (profilesData ?? []).map((p: any) => p.id);
      if (memberProfileIds.length === 0) {
        return new Response(JSON.stringify({ message: `Ninguém com conta de membro no grupo ${grupo} ainda.` }), { status: 200 });
      }

      const { data: tokensData, error: tokensError } = await supabase
        .from('push_tokens').select('token').in('user_id', memberProfileIds);
      if (tokensError) throw tokensError;
      tokens = tokensData;
    } else if (apenasMembros) {
      // Aviso geral (sem grupo) marcado como "só membros" — todo mundo com
      // conta cuja role não é visitante (membro, líder ou admin).
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles').select('id').neq('role', 'visitante');
      if (profilesError) throw profilesError;

      const memberIds = (profilesData ?? []).map((p: any) => p.id);
      if (memberIds.length === 0) {
        return new Response(JSON.stringify({ message: 'Nenhuma conta de membro encontrada.' }), { status: 200 });
      }

      const { data: tokensData, error: tokensError } = await supabase
        .from('push_tokens').select('token').in('user_id', memberIds);
      if (tokensError) throw tokensError;
      tokens = tokensData;
    } else {
      const { data: tokensData, error: tokensError } = await supabase.from('push_tokens').select('token');
      if (tokensError) throw tokensError;
      tokens = tokensData;
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum token de push encontrado.' }), { status: 200 });
    }

    // Defesa extra contra notificação duplicada: mesmo com a constraint
    // UNIQUE(token) no banco (migração 20260823120000), garante que nunca
    // manda 2 pushes pro mesmo token numa única chamada.
    const tokensUnicos = [...new Set(tokens.map((t: any) => t.token))];

    const mensagens = tokensUnicos.map((token: string) => ({
      to: token,
      title: titulo,
      body: corpo,
      sound: 'default',
      data: { type: tipo, grupo: grupo ?? null },
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

    return new Response(JSON.stringify({ success: true, enviados: tokensUnicos.length, resultados }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
