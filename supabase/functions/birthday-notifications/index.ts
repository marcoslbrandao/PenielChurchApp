// supabase/functions/birthday-notifications/index.ts
// Roda todo dia às 8h (UK time) e envia push para líderes com aniversariantes do dia

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const hoje = new Date();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');

    // 1. Busca aniversariantes de hoje
    const { data: membros, error: membrosError } = await supabase
      .from('members')
      .select('nome, sobrenome, data_nascimento')
      .not('data_nascimento', 'is', null);

    if (membrosError) throw membrosError;

    const aniversariantes = (membros ?? []).filter((m: any) => {
      const dob = new Date(m.data_nascimento);
      const dobMes = String(dob.getMonth() + 1).padStart(2, '0');
      const dobDia = String(dob.getDate()).padStart(2, '0');
      return dobMes === mes && dobDia === dia;
    });

    if (aniversariantes.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum aniversário hoje.' }), { status: 200 });
    }

    // 2. Busca tokens de push dos líderes e admins
    const { data: lideres, error: lideresError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('role', ['lider', 'admin']);

    if (lideresError) throw lideresError;

    const liderIds = (lideres ?? []).map((l: any) => l.id);

    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', liderIds);

    if (tokensError) throw tokensError;

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum token de líder encontrado.' }), { status: 200 });
    }

    // 3. Monta a mensagem
    const nomes = aniversariantes.map((m: any) => `${m.nome} ${m.sobrenome ?? ''}`).join(', ');
    const titulo = aniversariantes.length === 1
      ? `🎂 Aniversário hoje!`
      : `🎂 ${aniversariantes.length} aniversários hoje!`;
    const corpo = `${nomes} ${aniversariantes.length === 1 ? 'faz' : 'fazem'} aniversário hoje. Não esqueça de parabenizar! 🙏`;

    // 4. Envia push para todos os líderes
    const mensagens = tokens.map((t: any) => ({
      to: t.token,
      title: titulo,
      body: corpo,
      sound: 'default',
      data: { type: 'birthday', nomes },
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mensagens),
    });

    const result = await response.json();

    return new Response(JSON.stringify({
      success: true,
      aniversariantes: aniversariantes.length,
      tokensEnviados: tokens.length,
      result,
    }), { status: 200 });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});