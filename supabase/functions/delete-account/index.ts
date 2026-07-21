// supabase/functions/delete-account/index.ts
// Deleta a conta do usuário autenticado (auth.users + dados relacionados).
// Chamado pelo app via `supabase.functions.invoke('delete-account')` — o
// Supabase Gateway já verifica o JWT antes de invocar (verify_jwt = true,
// padrão para funções sem entrada em config.toml), então aqui só precisamos
// identificar QUEM é o usuário dono do token.
//
// Exigido pela App Store (Guideline 5.1.1(v) — Data Collection and Storage):
// apps que permitem criar conta devem oferecer exclusão de conta dentro do
// próprio app, não só desativação.
//
// O que é apagado:
// - auth.users (a conta em si — feito com admin.deleteUser, só possível com
//   a service role key, nunca com o client do app)
// - profiles, saved_verses, prayer_requests, offerings, reading_history e
//   reading_plan: todas têm `on delete cascade` apontando pra profiles/
//   auth.users, então são apagadas automaticamente junto com o usuário
// - push_tokens: apagado explicitamente aqui porque essa tabela foi criada
//   fora do controle de versão (sem FK/cascade documentado)
//
// Como ligar (uma vez só):
//   supabase functions deploy delete-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado.' }), { status: 401 });
    }

    // Identifica o dono do token (cliente com anon key + o JWT do usuário)
    const supabaseAsUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseAsUser.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Sessão inválida.' }), { status: 401 });
    }
    const userId = userData.user.id;

    // Cliente com service role — única forma de apagar de auth.users
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Apaga tabelas sem cascade automático (criadas fora do controle de versão)
    await supabaseAdmin.from('push_tokens').delete().eq('user_id', userId);

    // Apaga a conta — profiles, saved_verses, prayer_requests, offerings,
    // reading_history e reading_plan caem junto via "on delete cascade"
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    console.error('Erro ao excluir conta:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Erro ao excluir conta.' }),
      { status: 500 }
    );
  }
});
