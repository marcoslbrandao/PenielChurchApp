// supabase/functions/escala-notifications/index.ts
// Roda todo dia e envia push para quem está escalado daqui a 2 dias.
// Mesmo padrão do birthday-notifications: função stateless, disparada por
// um cron externo (configurar o mesmo jeito que já foi feito pra
// birthday-notifications/content-notifications).

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

    // Texto do Marcos (24/10): "Graca e paz, Fulano! Lembrando que neste
    // domingo (01/11), voce serve na Cantina. Que Deus te abencoe!"
    // - uma mensagem por PESSOA (quem serve em 2 areas recebe uma so);
    // - artigo certo por area (na Cantina, no Ministerio Infantil, nos Diaconos);
    // - dia certo: domingo -> "neste domingo"; outro dia (Virada, quinta
    //   31/12) -> "na quinta-feira".
    const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const diaSemana = new Date(`${dataAlvo}T12:00:00Z`).getUTCDay();
    const quando = diaSemana === 0 ? `neste domingo (${dataFormatada})` : `na ${DIAS[diaSemana]} (${dataFormatada})`;
    const comArtigo = (area: string) => {
      const a = area.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (a.startsWith('diacono')) return `nos ${area}`;
      if (a.startsWith('ministerio')) return `no ${area}`;
      return `na ${area}`;
    };

    const porPessoa = new Map<string, { nome: string; areas: string[] }>();
    comConta.forEach((d: any) => {
      const id = d.members.profile_id;
      const p = porPessoa.get(id) ?? { nome: String(d.members.nome ?? '').trim().split(/\s+/)[0] ?? '', areas: [] };
      const area = d.escala_areas?.nome;
      if (area && !p.areas.includes(area)) p.areas.push(area);
      porPessoa.set(id, p);
    });

    // 3. Uma mensagem por token (uma pessoa pode ter mais de um aparelho)
    const mensagens: any[] = [];
    porPessoa.forEach((p, profileId) => {
      const tokens = tokensPorUsuario.get(profileId) ?? [];
      const areas = p.areas.sort((x, y) => x.localeCompare(y)).map(comArtigo).join(' e ') || 'na sua área';
      const saudacao = p.nome ? `Graça e paz, ${p.nome}!` : 'Graça e paz!';
      tokens.forEach(token => {
        mensagens.push({
          to: token,
          title: '📋 Lembrete da escala',
          body: `${saudacao} Lembrando que ${quando}, você serve ${areas}. Que Deus te abençoe! 🙏`,
          sound: 'default',
          data: { type: 'escala', data: dataAlvo },
        });
      });
    });

    if (mensagens.length === 0) {
      return new Response(JSON.stringify({ message: 'Ninguém com token de push para notificar.' }), { status: 200 });
    }

    // O Expo recusa mais de 100 notificações por requisição e devolve 400 para
    // o lote INTEIRO — ninguém recebe. Mesmo defeito que já derrubou o push de
    // aniversário; aqui fatiado em lotes de 100 (corrigido em 28/09/2026).
    const falhas: string[] = [];
    let enviadas = 0;
    for (let i = 0; i < mensagens.length; i += 100) {
      const lote = mensagens.slice(i, i + 100);
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lote),
      });
      if (!response.ok) falhas.push(`lote ${i / 100}: ${response.status} ${(await response.text()).slice(0, 180)}`);
      else enviadas += lote.length;
    }

    return new Response(JSON.stringify({
      success: falhas.length === 0,
      designacoes: comConta.length,
      notificacoesEnviadas: enviadas,
      falhas,
    }), { status: 200 });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
