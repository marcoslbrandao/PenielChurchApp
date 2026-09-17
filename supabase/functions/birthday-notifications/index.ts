// supabase/functions/birthday-notifications/index.ts
//
// Push de aniversário, em dois envios com públicos diferentes:
//
//   • VÉSPERA → só a liderança (admin e líderes de grupo). Serve para
//     preparar: ligar, escrever o cartão, avisar o grupo. Chegar no próprio
//     dia já é tarde para tudo isso.
//   • DIA     → a igreja (todo mundo que não é visitante), como sempre foi.
//
// CRON: `0 6,7 * * *` (UTC). Duas horas de propósito — Londres é UTC+0 no
// inverno e UTC+1 no verão, e um cron de hora fixa muda de horário local
// duas vezes por ano. A função confere a hora de Londres e só trabalha às
// 7h; na outra passagem devolve "fora de hora". É o mesmo arranjo do
// `versiculo-do-dia`. Ver `crons-do-supabase-inventario.md`, armadilha 1.
//
// O QUE MUDOU NESTA VERSÃO (17/09)
//   1. Véspera para a liderança (não existia).
//   2. Lote de 100 no Expo. A versão anterior mandava tudo numa requisição
//      só; o Expo recusa acima de 100 e a congregação inteira ficava sem o
//      push — silenciosamente, porque ninguém lia o retorno.
//   3. Data lida da string, não com `new Date`. `new Date('1990-05-12')` é
//      meia-noite UTC e `getDate()` devolve o dia no fuso do servidor: em
//      qualquer runtime a oeste de Londres, todo aniversário do dia 1º saía
//      no dia errado.
//   4. Guarda contra envio repetido (`aniversario_push_log`). Um retry do
//      cron mandava o mesmo "🎂 Aniversário hoje!" duas vezes.
//   5. Crianças entram. É o motivo de metade disto existir — a criança
//      cadastrada pelo pai em "Meu Cadastro" agora tem aniversário no app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chamadaAutorizada, respostaNaoAutorizado } from '../_shared/hook-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const FUSO = 'Europe/London';
const HORA_DE_ENVIO = 7;

type Alvo = { tipo: 'vespera' | 'dia'; dia: number; mes: number; dataISO: string };

/** Data de hoje em Londres, em partes de calendário. */
function hojeEmLondres() {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const p = (tipo: string) => Number(partes.find(x => x.type === tipo)!.value);
  return { ano: p('year'), mes: p('month'), dia: p('day'), hora: p('hour') % 24 };
}

function dataISO(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Dia e mês de uma data de nascimento, lidos da string 'AAAA-MM-DD'. */
function diaEMes(nascimento: string): { dia: number; mes: number } | null {
  const [, m, d] = String(nascimento).split('-');
  const mes = Number(m), dia = Number(d?.slice(0, 2));
  if (!mes || !dia) return null;
  return { dia, mes };
}

function nomeCompleto(m: { nome: string; sobrenome: string | null }) {
  return `${m.nome}${m.sobrenome ? ` ${m.sobrenome}` : ''}`.trim();
}

/** O Expo recusa mais de 100 notificações por requisição. */
async function enviarEmLotes(mensagens: unknown[]): Promise<{ enviados: number; falhas: string[] }> {
  const falhas: string[] = [];
  let enviados = 0;
  for (let i = 0; i < mensagens.length; i += 100) {
    const lote = mensagens.slice(i, i + 100);
    const r = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lote),
    });
    if (!r.ok) falhas.push(`lote ${i / 100}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    else enviados += lote.length;
  }
  return { enviados, falhas };
}

Deno.serve(async (req) => {
  if (!chamadaAutorizada(req)) return respostaNaoAutorizado();

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const hoje = hojeEmLondres();

    if (hoje.hora !== HORA_DE_ENVIO) {
      return new Response(
        JSON.stringify({ message: `Fora de hora (${hoje.hora}h no Reino Unido). Nada enviado.` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Amanhã em calendário — `Date.UTC` com dia+1 vira o mês e o ano sozinho.
    const amanha = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + 1));
    const alvos: Alvo[] = [
      { tipo: 'dia', dia: hoje.dia, mes: hoje.mes, dataISO: dataISO(hoje.ano, hoje.mes, hoje.dia) },
      {
        tipo: 'vespera',
        dia: amanha.getUTCDate(),
        mes: amanha.getUTCMonth() + 1,
        dataISO: dataISO(amanha.getUTCFullYear(), amanha.getUTCMonth() + 1, amanha.getUTCDate()),
      },
    ];

    // Uma leitura só do diretório serve aos dois envios.
    const { data: pessoas, error: pessoasErro } = await supabase
      .from('members')
      .select('nome, sobrenome, data_nascimento, responsavel_id, mostrar_aniversario')
      .not('data_nascimento', 'is', null);
    if (pessoasErro) throw pessoasErro;

    const visiveis = (pessoas ?? []).filter((m: any) => m.mostrar_aniversario !== false);
    const resultado: Record<string, unknown> = {};

    for (const alvo of alvos) {
      const aniversariantes = visiveis.filter((m: any) => {
        const dm = diaEMes(m.data_nascimento);
        return dm && dm.dia === alvo.dia && dm.mes === alvo.mes;
      });

      if (aniversariantes.length === 0) {
        resultado[alvo.tipo] = 'ninguém';
        continue;
      }

      // Reserva ANTES de enviar. Se a linha já existe, este envio já
      // aconteceu — um retry do cron, um teste manual, um segundo job criado
      // por engano. Gravar depois do push deixaria a janela aberta
      // exatamente no caso que a guarda existe para cobrir.
      const { error: logErro } = await supabase
        .from('aniversario_push_log')
        .insert({ data: alvo.dataISO, tipo: alvo.tipo, enviados: 0 });
      if (logErro) {
        resultado[alvo.tipo] = `já enviado hoje (${logErro.code ?? 'conflito'})`;
        continue;
      }

      // Quem recebe. Na véspera, só a liderança: admin por `profiles.role`,
      // e líder de grupo por `group_leaders` — que é onde a liderança de
      // verdade mora desde a migração 20260908203000. `profiles.role =
      // 'lider'` virou etiqueta e não serve para decidir isto.
      let destinatarios: string[];
      if (alvo.tipo === 'vespera') {
        const [{ data: admins }, { data: lideres }] = await Promise.all([
          supabase.from('profiles').select('id').eq('role', 'admin'),
          supabase.from('group_leaders').select('profile_id'),
        ]);
        destinatarios = [...new Set([
          ...(admins ?? []).map((p: any) => p.id),
          ...(lideres ?? []).map((l: any) => l.profile_id).filter(Boolean),
        ])];
      } else {
        const { data: membros } = await supabase
          .from('profiles').select('id').neq('role', 'visitante');
        destinatarios = (membros ?? []).map((p: any) => p.id);
      }

      if (destinatarios.length === 0) {
        resultado[alvo.tipo] = 'ninguém para receber';
        continue;
      }

      const { data: tokens } = await supabase
        .from('push_tokens').select('token').in('user_id', destinatarios);
      if (!tokens || tokens.length === 0) {
        resultado[alvo.tipo] = 'sem tokens';
        continue;
      }

      const nomes = aniversariantes.map(nomeCompleto).join(', ');
      const quantos = aniversariantes.length;
      const titulo = alvo.tipo === 'vespera'
        ? (quantos === 1 ? '🎁 Aniversário amanhã' : `🎁 ${quantos} aniversários amanhã`)
        : (quantos === 1 ? '🎂 Aniversário hoje!' : `🎂 ${quantos} aniversários hoje!`);
      const corpo = alvo.tipo === 'vespera'
        ? `${nomes} ${quantos === 1 ? 'faz' : 'fazem'} aniversário amanhã. Dá tempo de preparar o cumprimento.`
        : `${nomes} ${quantos === 1 ? 'faz' : 'fazem'} aniversário hoje. Não esqueça de parabenizar! 🙏`;

      const mensagens = tokens.map((t: any) => ({
        to: t.token,
        title: titulo,
        body: corpo,
        sound: 'default',
        // Quem traduz isto em rota é `lib/destinoNotificacao.ts`, pelo
        // `type` — não por um nome de tela no payload. Mandar o nome da rota
        // daqui amarraria a Edge Function à navegação do app: renomear a tela
        // quebraria push já entregue, que fica no celular por dias.
        data: { type: 'birthday', quando: alvo.tipo, nomes },
      }));

      const { enviados, falhas } = await enviarEmLotes(mensagens);

      await supabase
        .from('aniversario_push_log')
        .update({ enviados })
        .eq('data', alvo.dataISO).eq('tipo', alvo.tipo);

      resultado[alvo.tipo] = { aniversariantes: quantos, tokens: tokens.length, enviados, falhas };
    }

    return new Response(JSON.stringify({ success: true, ...resultado }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
