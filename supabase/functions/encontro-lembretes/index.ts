// supabase/functions/encontro-lembretes/index.ts
//
// Lembrete de encontro de grupo: push ~30 minutos antes de começar, com o
// link do Zoom junto. Stateless, disparada por cron — o mesmo arranjo de
// birthday-notifications e escala-notifications.
//
// CRON: */15 * * * *  (a cada 15 minutos)
// A janela procurada é de 20 a 40 minutos antes do início — 20 minutos de
// largura para um cron de 15 em 15, de propósito. A sobreposição garante que
// nenhum encontro caia entre duas passagens; quem impede o envio duplicado é
// `lembrete_enviado_em`, gravado logo depois do push.
//
// FUSO: a igreja é no Reino Unido e o encontro é marcado em hora de Londres.
// Em vez de fazer conta de offset (que muda duas vezes por ano), comparamos
// RELÓGIO DE PAREDE com RELÓGIO DE PAREDE: "agora em Londres" vira
// AAAA-MM-DD HH:MM, o encontro já é AAAA-MM-DD + HH:MM, e a diferença sai em
// minutos. Só quebraria num encontro marcado para a 1h da manhã do domingo em
// que o relógio muda, e não existe estudo bíblico à 1h da manhã.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chamadaAutorizada, respostaNaoAutorizado } from '../_shared/hook-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const FUSO = 'Europe/London';

const JANELA_MIN = 20;
const JANELA_MAX = 40;

const NOME_DO_GRUPO: Record<string, string> = {
  mulheres: 'Grupo de Mulheres',
  homens: 'Grupo de Homens',
  jovens: 'Peniel Alive',
  estudo_biblico: 'Estudo Bíblico',
};

/** Relógio de parede de Londres agora, em partes numéricas. */
function agoraEmLondres() {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const p = (tipo: string) => Number(partes.find(x => x.type === tipo)!.value);
  // `hour` com hour12:false devolve 24 à meia-noite em alguns runtimes.
  return { ano: p('year'), mes: p('month'), dia: p('day'), hora: p('hour') % 24, minuto: p('minute') };
}

/** Minutos absolutos de um relógio de parede, para subtrair de outro igual. */
function minutosDeParede(ano: number, mes: number, dia: number, hora: number, minuto: number) {
  return Date.UTC(ano, mes - 1, dia, hora, minuto) / 60000;
}

function dataISO(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  if (!chamadaAutorizada(req)) return respostaNaoAutorizado();

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const agora = agoraEmLondres();
    const agoraMin = minutosDeParede(agora.ano, agora.mes, agora.dia, agora.hora, agora.minuto);

    // Hoje e amanhã: a janela de 40 minutos pode atravessar a meia-noite.
    const amanha = new Date(Date.UTC(agora.ano, agora.mes - 1, agora.dia + 1));
    const diasAlvo = [
      dataISO(agora.ano, agora.mes, agora.dia),
      dataISO(amanha.getUTCFullYear(), amanha.getUTCMonth() + 1, amanha.getUTCDate()),
    ];

    const { data: eventos, error: eventosError } = await supabase
      .from('grupo_eventos')
      .select('id, grupo, titulo, data, horario, hora_inicio, local, link_online')
      .in('data', diasAlvo)
      .not('hora_inicio', 'is', null)
      .is('lembrete_enviado_em', null);

    if (eventosError) throw eventosError;

    const naJanela = (eventos ?? []).filter((e: any) => {
      const [a, m, d] = String(e.data).split('-').map(Number);
      const [h, min] = String(e.hora_inicio).split(':').map(Number);
      const faltam = minutosDeParede(a, m, d, h, min) - agoraMin;
      return faltam >= JANELA_MIN && faltam < JANELA_MAX;
    });

    if (naJanela.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum encontro na janela de lembrete.' }), { status: 200 });
    }

    const mensagens: any[] = [];
    const avisados: string[] = [];

    for (const evento of naJanela) {
      // Participantes daquele grupo que têm conta no app.
      const { data: membros, error: membrosError } = await supabase
        .from('grupo_membros')
        .select('members(profile_id)')
        .eq('grupo', evento.grupo);
      if (membrosError) throw membrosError;

      const profileIds = [...new Set(
        (membros ?? []).map((g: any) => g.members?.profile_id).filter(Boolean),
      )];

      // O líder pode não estar em `grupo_membros` — ele lidera, não participa.
      const { data: lideres } = await supabase
        .from('group_leaders')
        .select('profile_id')
        .eq('grupo', evento.grupo);
      (lideres ?? []).forEach((l: any) => {
        if (l.profile_id && !profileIds.includes(l.profile_id)) profileIds.push(l.profile_id);
      });

      if (profileIds.length === 0) { avisados.push(evento.id); continue; }

      const { data: tokens, error: tokensError } = await supabase
        .from('push_tokens')
        .select('token')
        .in('user_id', profileIds);
      if (tokensError) throw tokensError;

      const nomeGrupo = NOME_DO_GRUPO[evento.grupo] ?? evento.grupo;
      const onde = evento.link_online ? 'Toque para entrar.' : `Onde: ${evento.local}.`;

      (tokens ?? []).forEach((t: any) => {
        mensagens.push({
          to: t.token,
          title: `⏰ ${evento.titulo} começa em 30 min`,
          body: `${nomeGrupo} · ${evento.horario}. ${onde}`,
          sound: 'default',
          data: { type: 'encontro', grupo: evento.grupo, id: evento.id },
        });
      });

      avisados.push(evento.id);
    }

    // O Expo aceita no máximo 100 notificações por requisição e devolve 400
    // acima disso. Um grupo grande (ou dois encontros na mesma janela) passa
    // desse teto com facilidade, e como a falha impede o carimbo, o lembrete
    // simplesmente nunca sairia — tentaria de novo a cada 15 minutos até a
    // janela fechar.
    for (let i = 0; i < mensagens.length; i += 100) {
      const lote = mensagens.slice(i, i + 100);
      const resposta = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lote),
      });
      // Se o Expo recusar, NÃO carimbamos: o próximo passe do cron ainda está
      // dentro da janela de 20 minutos e tenta de novo.
      if (!resposta.ok) {
        const detalhe = await resposta.text();
        return new Response(JSON.stringify({ error: 'Expo recusou o envio', lote: i / 100, detalhe }), { status: 502 });
      }
    }

    // Carimba mesmo quando ninguém tinha token: o encontro foi processado, e
    // sem o carimbo ele voltaria a ser candidato a cada 15 minutos até passar.
    if (avisados.length > 0) {
      const { error: carimboError } = await supabase
        .from('grupo_eventos')
        .update({ lembrete_enviado_em: new Date().toISOString() })
        .in('id', avisados);
      if (carimboError) throw carimboError;
    }

    return new Response(JSON.stringify({
      success: true,
      encontros: naJanela.length,
      notificacoesEnviadas: mensagens.length,
    }), { status: 200 });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
