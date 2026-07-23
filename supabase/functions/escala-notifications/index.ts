// supabase/functions/escala-notifications/index.ts
// Roda todo dia e envia push para quem está escalado daqui a 2 dias.
// Mesmo padrão do birthday-notifications: função stateless, disparada por
// um cron externo (configurar o mesmo jeito que já foi feito pra
// birthday-notifications/content-notifications).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Data alvo: daqui a 2 dias
    const alvo = new Date();
    alvo.setDate(alvo.getDate() + 2);
    const dataAlvo = alvo.toISOString().slice(0, 10);

    // 1. Busca quem está escalado nessa data, com o nome da área e o vínculo
    //    de conta de login (profile_id) de cada voluntário.
    const { data: designacoes, error: designacoesError } = await supabase
      .from('escala_designacoes')
      .select('data, escala_areas(nome), members(nome, sobrenome, profile_id)')
      .eq('data', dataAlvo);

    if (designacoesError) throw designacoesError;

    const comConta = (designacoes ?? []).filter((d: any) => d.members?.profile_id);

    if (comConta.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhuma designação com conta vinculada para essa data.' }), { status: 200 });
    }

    // 2. Busca os push tokens de quem vai ser notificado
    const profileIds = [...new Set(comConta.map((d: any) => d.members.profile_id))];
    const { data: tokensData, error: tokensError } = await supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', profileIds);

    if (tokensError) throw tokensError;

    if (!tokensData || tokensData.length === 0) {
      return new Response(JSON.stringify({ message: 'Ninguém com token de push para notificar.' }), { status: 200 });
    }

    const tokensPorUsuario = new Map<string, string[]>();
    tokensData.forEach((t: any) => {
      const lista = tokensPorUsuario.get(t.user_id) ?? [];
      lista.push(t.token);
      tokensPorUsuario.set(t.user_id, lista);
    });

    const dataFormatada = `${dataAlvo.slice(8, 10)}/${dataAlvo.slice(5, 7)}`;

    // 3. Monta uma mensagem por token (uma pessoa pode ter mais de um device)
    const mensagens: any[] = [];
    comConta.forEach((d: any) => {
      const tokens = tokensPorUsuario.get(d.members.profile_id) ?? [];
      const areaNome = d.escala_areas?.nome ?? 'sua área';
      tokens.forEach(token => {
        mensagens.push({
          to: token,
          title: '📋 Você está na escala!',
          body: `Você serve em ${areaNome} neste domingo (${dataFormatada}). Não esqueça!`,
          sound: 'default',
          data: { type: 'escala', area: areaNome, data: dataAlvo },
        });
      });
    });

    if (mensagens.length === 0) {
      return new Response(JSON.stringify({ message: 'Ninguém com token de push para notificar.' }), { status: 200 });
    }

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mensagens),
    });
    const result = await response.json();

    return new Response(JSON.stringify({
      success: true,
      designacoes: comConta.length,
      notificacoesEnviadas: mensagens.length,
      result,
    }), { status: 200 });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
