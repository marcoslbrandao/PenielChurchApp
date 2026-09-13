// supabase/functions/versiculo-notification/index.ts
// Manda o versículo do dia por push, uma vez por dia, às 7h do Reino Unido.
//
// Quem dispara é um cron do pg_cron (ver a migração
// 20260904090000_versiculos_no_banco.sql e a que agenda o job). O cron roda
// às 6h E às 7h UTC, e a própria função só age quando a hora britânica é 7 —
// assim o horário fica em 7h de Londres o ano inteiro, sem alguém precisar
// lembrar de mexer duas vezes por ano quando o horário de verão vira.
//
// O versículo vem da tabela `versiculos` pela função `versiculo_do_dia()`,
// a MESMA que o app usa. Não há segunda cópia da lista em lugar nenhum.
//
// Como ligar (uma vez só):
//   supabase functions deploy versiculo-notification

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chamadaAutorizada, respostaNaoAutorizado } from '../_shared/hook-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Título da notificação por idioma. O corpo é o próprio versículo, que já
// vem traduzido na tabela.
const TITULO: Record<string, string> = {
  pt: '📖 Versículo do dia',
  en: '📖 Verse of the day',
  es: '📖 Versículo del día',
  fr: '📖 Verset du jour',
};

Deno.serve(async (req) => {
  // Só o próprio Supabase (Database Webhook ou cron) chama esta função. Sem
  // este portão, qualquer um com a chave anônima do app disparava push para a
  // congregação inteira — ver supabase/functions/_shared/hook-auth.ts.
  if (!chamadaAutorizada(req)) return respostaNaoAutorizado();

  try {
    const url = new URL(req.url);
    // `?force=1` ignora a checagem de horário — só para teste manual.
    const forcar = url.searchParams.get('force') === '1';
    // `?dry=1` faz tudo MENOS enviar: devolve o versículo do dia e quantos
    // aparelhos receberiam. É assim que se confere a configuração sem mandar
    // push pra congregação inteira sem querer.
    const ensaio = url.searchParams.get('dry') === '1';

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (!forcar) {
      const { data: horaUK, error: horaErro } = await supabase.rpc('hora_do_reino_unido');
      if (horaErro) throw horaErro;
      if (Number(horaUK) !== 7) {
        return new Response(
          JSON.stringify({ message: `Fora de hora (${horaUK}h no Reino Unido). Nada enviado.` }),
          { status: 200 },
        );
      }
    }

    const { data: versiculo, error: vErro } = await supabase.rpc('versiculo_do_dia').single();
    if (vErro) throw vErro;
    if (!versiculo) {
      return new Response(JSON.stringify({ message: 'Nenhum versículo ativo cadastrado.' }), { status: 200 });
    }

    const { data: tokens, error: tErro } = await supabase.from('push_tokens').select('token, idioma');
    if (tErro) throw tErro;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum token de push encontrado.' }), { status: 200 });
    }

    // Mesma defesa do content-notifications: nunca dois pushes pro mesmo
    // aparelho numa chamada, mesmo com a constraint UNIQUE(token) no banco.
    const vistos = new Set<string>();
    const mensagens = [];
    for (const t of tokens as { token: string; idioma: string | null }[]) {
      if (vistos.has(t.token)) continue;
      vistos.add(t.token);
      const lang = (t.idioma === 'en' || t.idioma === 'es' || t.idioma === 'fr') ? t.idioma : 'pt';
      const texto = (versiculo as any)[lang] ?? (versiculo as any).pt;
      mensagens.push({
        to: t.token,
        title: TITULO[lang],
        body: `"${texto}" — ${(versiculo as any).ref}`,
        sound: 'default',
        data: { type: 'versiculo' },
      });
    }

    if (ensaio) {
      return new Response(JSON.stringify({
        dry_run: true,
        ref: (versiculo as any).ref,
        pt: (versiculo as any).pt,
        enviaria_para: mensagens.length,
        exemplo: mensagens[0] ?? null,
      }), { status: 200 });
    }

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

    return new Response(
      JSON.stringify({ success: true, ref: (versiculo as any).ref, enviados: mensagens.length, resultados }),
      { status: 200 },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
