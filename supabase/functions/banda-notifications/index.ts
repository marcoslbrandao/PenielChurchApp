// supabase/functions/banda-notifications/index.ts
//
// Push para a EQUIPE DA BANDA — e só para ela. Três origens, uma função:
//
//   • `cultos`  — quando um culto é PUBLICADO. Não quando é criado: o culto
//     tem rascunho, e avisar a banda de uma escala em montagem faria o aviso
//     chegar duas vezes (uma errada e uma certa), que é pior que não avisar.
//   • `ensaios` — ao ser criado. Ensaio não tem rascunho.
//   • `banda_chat_mensagens` — agrupado por bloco de conversa. Ver abaixo.
//
// DEPLOY
//   supabase functions deploy banda-notifications
//
// E TRÊS DATABASE WEBHOOKS no painel (Database → Webhooks), todos apontando
// para esta função, com o cabeçalho `x-peniel-hook: <PUSH_HOOK_SECRET>`:
//
//   | Tabela                 | Eventos         |
//   |------------------------|-----------------|
//   | cultos                 | INSERT, UPDATE  |
//   | ensaios                | INSERT          |
//   | banda_chat_mensagens   | INSERT          |
//
// O UPDATE em `cultos` é o que pega o rascunho virando publicado. A função
// compara `record` com `old_record` e ignora todo o resto — um webhook de
// UPDATE dispara a cada salvamento, e sem essa comparação um ajuste de
// horário reenviaria o aviso.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chamadaAutorizada, respostaNaoAutorizado } from '../_shared/hook-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const FUSO = 'Europe/London';

/** Janela de silêncio do chat, em minutos. Mexer aqui não exige publicar a
 *  função: a decisão em si mora em `banda_chat_deve_notificar`. */
const JANELA_CHAT_MIN = 20;

type Corpo = {
  type?: string;
  table?: string;
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown> | null;
};

function ok(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

/** Data de calendário em texto legível, lida da string — `new Date('2026-09-20')`
 *  é meia-noite UTC e viraria dia 19 em qualquer runtime a oeste de Londres. */
function dataBR(iso: unknown): string {
  const [a, m, d] = String(iso ?? '').split('-');
  return a && m && d ? `${d.slice(0, 2)}/${m}` : '';
}

/** O Expo recusa mais de 100 notificações por requisição e devolve 400 para o
 *  lote inteiro — o defeito que deixou a congregação sem push de aniversário. */
async function enviarEmLotes(mensagens: unknown[]) {
  const falhas: string[] = [];
  let enviados = 0;
  for (let i = 0; i < mensagens.length; i += 100) {
    const lote = mensagens.slice(i, i + 100);
    const r = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lote),
    });
    if (!r.ok) falhas.push(`lote ${i / 100}: ${r.status} ${(await r.text()).slice(0, 180)}`);
    else enviados += lote.length;
  }
  return { enviados, falhas };
}

Deno.serve(async (req) => {
  if (!chamadaAutorizada(req)) return respostaNaoAutorizado();

  try {
    const corpo = (await req.json().catch(() => ({}))) as Corpo;
    const tabela = corpo.table ?? '';
    const r = corpo.record ?? {};
    const anterior = corpo.old_record ?? null;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let titulo = '';
    let texto = '';
    let tipo: 'culto' | 'ensaio' | 'chat';
    let referencia: string | null = null;
    let excluir: string | null = null;
    // Para onde o toque leva. `lib/destinoNotificacao.ts` traduz isto em rota.
    let dados: Record<string, unknown> = {};

    // ── CULTO ────────────────────────────────────────────────────────────
    if (tabela === 'cultos') {
      const publicadoAgora = r.publicado === true;
      const publicadoAntes = anterior ? anterior.publicado === true : false;

      // Nasce publicado, ou o rascunho foi publicado. Qualquer outro update
      // (mudou o label, mudou a data, despublicou) não avisa ninguém.
      const virouPublico = publicadoAgora && !publicadoAntes;
      if (!virouPublico) {
        return ok({ message: 'culto sem mudança de publicação — nada enviado' });
      }

      tipo = 'culto';
      referencia = String(r.id ?? '');
      const quando = dataBR(r.date);
      titulo = '🎶 Escala do culto publicada';
      texto = `${String(r.label ?? 'Culto')}${quando ? ` · ${quando}` : ''}. Confira a sua escala na aba Banda.`;
      dados = { type: 'banda', origem: 'culto', id: referencia };

    // ── ENSAIO ───────────────────────────────────────────────────────────
    } else if (tabela === 'ensaios') {
      tipo = 'ensaio';
      referencia = String(r.id ?? '');
      const quando = dataBR(r.date);
      const hora = String(r.time ?? '').trim();
      const local = String(r.local ?? '').trim();
      const detalhe = [quando, hora, local].filter(Boolean).join(' · ');
      titulo = '🥁 Novo ensaio marcado';
      texto = `${String(r.label ?? 'Ensaio')}${detalhe ? ` · ${detalhe}` : ''}`;
      dados = { type: 'banda', origem: 'ensaio', id: referencia };

    // ── CHAT ─────────────────────────────────────────────────────────────
    } else if (tabela === 'banda_chat_mensagens') {
      const { data: deve, error: erroJanela } = await supabase
        .rpc('banda_chat_deve_notificar', { p_janela_min: JANELA_CHAT_MIN });
      if (erroJanela) throw erroJanela;

      if (deve !== true) {
        return ok({ message: `chat dentro da janela de ${JANELA_CHAT_MIN} min — nada enviado` });
      }

      tipo = 'chat';
      referencia = String(r.id ?? '');
      excluir = (r.autor_id as string) ?? null;
      const autor = String(r.autor_nome ?? 'Alguém').split(' ')[0];
      const msg = String(r.texto ?? '').slice(0, 120);
      titulo = `💬 ${autor} no chat da Banda`;
      texto = msg;
      dados = { type: 'banda', origem: 'chat' };

    } else {
      return ok({ message: `tabela não tratada: ${tabela}` });
    }

    // Reserva ANTES de enviar. Se o webhook disparar duas vezes — e dispara —
    // a segunda passagem do chat cai na janela e desiste. Para culto e ensaio,
    // a checagem de referência abaixo é o que impede o reenvio.
    if (tipo !== 'chat' && referencia) {
      const { data: jaFoi } = await supabase
        .from('banda_push_log')
        .select('id')
        .eq('tipo', tipo).eq('referencia', referencia)
        .maybeSingle();
      if (jaFoi) return ok({ message: `${tipo} ${referencia} já notificado` });
    }

    const { data: tokens, error: erroTokens } = await supabase
      .rpc('banda_tokens_para_push', { p_excluir: excluir });
    if (erroTokens) throw erroTokens;

    const lista = ((tokens ?? []) as { token: string }[]).map(t => t.token);
    if (lista.length === 0) {
      return ok({ message: 'nenhum token da banda' });
    }

    await supabase.from('banda_push_log').insert({ tipo, referencia });

    const mensagens = lista.map(token => ({
      to: token,
      title: titulo,
      body: texto,
      sound: 'default',
      data: dados,
    }));

    const { enviados, falhas } = await enviarEmLotes(mensagens);

    return ok({ success: true, tipo, tokens: lista.length, enviados, falhas });

  } catch (err: any) {
    console.error('banda-notifications:', err?.message);
    return ok({ error: err?.message ?? 'falhou' }, 500);
  }
});
