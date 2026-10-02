// supabase/functions/materiais-drive/index.ts
//
// Material dos grupos guardado no Google Drive da IGREJA (25 Set 2026).
//
// O PROBLEMA QUE ISTO RESOLVE
// O Material do grupo era só um link colado. A professora colava o link do
// Drive pessoal dela e cada aluno esbarrava no "Solicitar acesso" do Google.
//
// COMO FUNCIONA
// Pasta "Peniel App - Materiais" no Meu Drive de penielchurchlondon@gmail.com,
// com uma subpasta por grupo. A pasta NUNCA é compartilhada com os alunos nem
// com "qualquer pessoa com o link": quem lê o Drive é só esta função, com a
// autorização da conta da igreja (refresh token OAuth). Quem pode ver o quê
// continua sendo a RLS de `grupo_arquivos` — a mesma regra de sempre.
//
//   • Sincronizar: lista a subpasta do grupo e espelha em `grupo_arquivos`
//     (linha nova = arquivo novo, linha some = arquivo saiu da pasta, título
//     acompanha o nome no Drive). A linha nova dispara o "Novo material" de
//     sempre, pelo gatilho `material_grupo_no_mural`.
//   • Link: o app pede, com o JWT da pessoa; se a RLS deixa ela ler a linha,
//     devolve uma URL desta função assinada por 10 minutos.
//   • Baixar (GET ?t=...): confere a assinatura e entrega o arquivo vindo do
//     Drive. O link do Drive nunca chega no celular.
//   • Remover: líder apaga pelo app → a linha sai (RLS decide se pode) e o
//     arquivo vai para a LIXEIRA do Drive (recuperável por 30 dias). Sem
//     mandar para a lixeira, a próxima sincronização traria o arquivo de volta.
//
// POR QUE verify_jwt = false (config.toml)
// O download é aberto no navegador do celular por `Linking.openURL`, que não
// manda cabeçalho de autorização. As outras ações conferem o JWT aqui dentro.
//
// SEGREDOS: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
//           DRIVE_PASTA_RAIZ  (ver claude/materiais-dos-grupos-no-drive.md)
// CRON:     */10 * * * *  {"acao":"sincronizar_todos"} — é o que faz o push de
//           "Novo material" sair mesmo que ninguém abra a aba do grupo.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chamadaAutorizada, respostaNaoAutorizado } from '../_shared/hook-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const PASTA_RAIZ = Deno.env.get('DRIVE_PASTA_RAIZ') ?? '';

// Nome da subpasta de cada grupo no Drive. Só é usado para ACHAR (ou criar) a
// pasta na primeira vez; depois vale o id guardado em `grupo_drive_pastas`, e
// renomear a pasta no Drive não quebra nada.
const PASTAS: Record<string, string> = {
  estudo_biblico: 'Estudo Bíblico',
  homens: 'Grupo de Homens',
  mulheres: 'Mulheres',
  jovens: 'Jovens',
  infantil: 'Peniel Kids',
};

const PASTA_MIME = 'application/vnd.google-apps.folder';
const LINK_VALIDADE_S = 10 * 60;
// Muita gente abrindo a aba ao mesmo tempo não pode virar muita chamada ao
// Drive: dentro deste intervalo a sincronização pedida pelo app é pulada.
const SINCRONIA_MIN_S = 60;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ─── Google ──────────────────────────────────────────────────────────────────

let tokenCache: { valor: string; expira: number } | null = null;

async function tokenGoogle(): Promise<string> {
  if (tokenCache && tokenCache.expira > Date.now() + 60_000) return tokenCache.valor;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      refresh_token: Deno.env.get('GOOGLE_REFRESH_TOKEN') ?? '',
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    // `invalid_grant` aqui = a autorização da conta da igreja caiu (senha
    // trocada, acesso revogado, app voltou para "Teste"). Refazer o passo do
    // OAuth Playground e gravar o GOOGLE_REFRESH_TOKEN novo.
    throw new Error(`token Google recusado: ${d.error ?? r.status}`);
  }
  tokenCache = { valor: d.access_token, expira: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return tokenCache.valor;
}

async function drive(caminho: string, init: RequestInit = {}): Promise<Response> {
  const token = await tokenGoogle();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(`https://www.googleapis.com/drive/v3${caminho}`, { ...init, headers });
}

async function driveJson(caminho: string, init: RequestInit = {}): Promise<any> {
  const r = await drive(caminho, init);
  if (!r.ok) throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// Aspas simples e barra invertida precisam de escape dentro do `q` do Drive.
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

type ArquivoDrive = {
  id: string; name: string; mimeType: string; size?: string; webViewLink: string;
};

async function pastaDoGrupo(sb: SupabaseClient, grupo: string): Promise<string> {
  const { data } = await sb.from('grupo_drive_pastas').select('pasta_id').eq('grupo', grupo).maybeSingle();
  if (data?.pasta_id) return data.pasta_id;

  const nome = PASTAS[grupo];
  const busca = await driveJson('/files?' + new URLSearchParams({
    q: `'${q(PASTA_RAIZ)}' in parents and name = '${q(nome)}' and mimeType = '${PASTA_MIME}' and trashed = false`,
    fields: 'files(id)',
    pageSize: '1',
  }));
  let id: string | undefined = busca.files?.[0]?.id;
  if (!id) {
    const criada = await driveJson('/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nome, mimeType: PASTA_MIME, parents: [PASTA_RAIZ] }),
    });
    id = criada.id as string;
  }
  await sb.from('grupo_drive_pastas').upsert({ grupo, pasta_id: id });
  return id;
}

async function listarPasta(pastaId: string): Promise<ArquivoDrive[]> {
  const todos: ArquivoDrive[] = [];
  let pagina: string | undefined;
  do {
    const params = new URLSearchParams({
      // Só os arquivos soltos na pasta do grupo. Subpasta é ignorada de
      // propósito: a regra "a pasta é o grupo" precisa continuar simples.
      q: `'${q(pastaId)}' in parents and trashed = false and mimeType != '${PASTA_MIME}'`,
      fields: 'nextPageToken, files(id, name, mimeType, size, webViewLink)',
      pageSize: '200',
      orderBy: 'createdTime',
    });
    if (pagina) params.set('pageToken', pagina);
    const d = await driveJson('/files?' + params);
    todos.push(...(d.files ?? []));
    pagina = d.nextPageToken;
  } while (pagina);
  return todos;
}

const semExtensao = (nome: string) => nome.replace(/\.[A-Za-z0-9]{2,5}$/, '').trim() || nome;

async function sincronizar(sb: SupabaseClient, grupo: string, forcar: boolean) {
  if (!forcar) {
    const { data } = await sb.from('grupo_drive_pastas').select('sincronizado_em').eq('grupo', grupo).maybeSingle();
    const ultima = data?.sincronizado_em ? new Date(data.sincronizado_em).getTime() : 0;
    if (Date.now() - ultima < SINCRONIA_MIN_S * 1000) return { pulado: true, novos: 0, removidos: 0, alterados: 0 };
  }

  const pastaId = await pastaDoGrupo(sb, grupo);
  // Se a listagem falhar, `listarPasta` lança e NADA é apagado. Apagar a
  // partir de uma lista vazia por erro sumiria com o material do grupo inteiro.
  const arquivos = await listarPasta(pastaId);

  const { data: linhas, error } = await sb
    .from('grupo_arquivos')
    .select('id, drive_id, drive_nome')
    .eq('grupo', grupo)
    .not('drive_id', 'is', null);
  if (error) throw new Error(error.message);

  const noBanco = new Map((linhas ?? []).map((l: any) => [l.drive_id as string, l]));
  const noDrive = new Set(arquivos.map(a => a.id));

  const novos = arquivos.filter(a => !noBanco.has(a.id)).map(a => ({
    grupo,
    titulo: semExtensao(a.name),
    url: a.webViewLink,
    drive_id: a.id,
    drive_nome: a.name,
    mime_type: a.mimeType,
    tamanho: a.size ? Number(a.size) : null,
  }));
  if (novos.length) {
    // ON CONFLICT DO NOTHING: duas sincronizações ao mesmo tempo (dois
    // celulares abrindo a aba) não duplicam a linha nem o push.
    const { error: e } = await sb.from('grupo_arquivos').upsert(novos, { onConflict: 'drive_id', ignoreDuplicates: true });
    if (e) throw new Error(e.message);
  }

  const sairam = (linhas ?? []).filter((l: any) => !noDrive.has(l.drive_id)).map((l: any) => l.id);
  if (sairam.length) {
    const { error: e } = await sb.from('grupo_arquivos').delete().in('id', sairam);
    if (e) throw new Error(e.message);
  }

  let alterados = 0;
  for (const a of arquivos) {
    const l: any = noBanco.get(a.id);
    if (l && l.drive_nome !== a.name) {
      await sb.from('grupo_arquivos')
        .update({ titulo: semExtensao(a.name), drive_nome: a.name, mime_type: a.mimeType, tamanho: a.size ? Number(a.size) : null })
        .eq('id', l.id);
      alterados++;
    }
  }

  await sb.from('grupo_drive_pastas').update({ sincronizado_em: new Date().toISOString() }).eq('grupo', grupo);
  return { pulado: false, novos: novos.length, removidos: sairam.length, alterados };
}

// ─── Link assinado ───────────────────────────────────────────────────────────

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(texto: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(texto))));
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function criarToken(arquivoId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + LINK_VALIDADE_S;
  const carga = `${arquivoId}.${exp}`;
  return `${carga}.${await hmac(carga)}`;
}

async function lerToken(t: string): Promise<string | null> {
  const [id, exp, assinatura] = t.split('.');
  if (!id || !exp || !assinatura) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  if (!iguais(assinatura, await hmac(`${id}.${exp}`))) return null;
  return id;
}

// Documento nativo do Google não tem "o arquivo" para baixar: sai em PDF.
const EXPORTA_PDF = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
]);

async function entregarArquivo(arquivoId: string): Promise<Response> {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: linha } = await sb
    .from('grupo_arquivos').select('drive_id, drive_nome, mime_type').eq('id', arquivoId).maybeSingle();
  if (!linha?.drive_id) return new Response('Material não encontrado.', { status: 404, headers: cors });

  const exporta = EXPORTA_PDF.has(linha.mime_type ?? '');
  const r = exporta
    ? await drive(`/files/${encodeURIComponent(linha.drive_id)}/export?mimeType=application/pdf`)
    : await drive(`/files/${encodeURIComponent(linha.drive_id)}?alt=media`);
  if (!r.ok || !r.body) {
    console.error('download falhou', r.status, (await r.text()).slice(0, 300));
    return new Response('Não foi possível abrir o material agora.', { status: 502, headers: cors });
  }

  let nome = linha.drive_nome ?? 'material';
  if (exporta && !/\.pdf$/i.test(nome)) nome += '.pdf';
  const headers = new Headers({
    ...cors,
    'Content-Type': exporta ? 'application/pdf' : (r.headers.get('content-type') ?? linha.mime_type ?? 'application/octet-stream'),
    // inline: o PDF abre direto no navegador do celular, com o botão de
    // compartilhar/salvar do próprio sistema.
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nome)}`,
    'Cache-Control': 'private, no-store',
  });
  const tamanho = r.headers.get('content-length');
  if (tamanho) headers.set('Content-Length', tamanho);
  return new Response(r.body, { status: 200, headers });
}

// ─── Entrada ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (req.method === 'GET') {
      const t = new URL(req.url).searchParams.get('t') ?? '';
      const id = await lerToken(t);
      if (!id) return new Response('Link expirado. Volte ao app e toque no material de novo.', { status: 403, headers: cors });
      return await entregarArquivo(id);
    }
    if (req.method !== 'POST') return json({ error: 'Método não suportado.' }, 405);

    if (!PASTA_RAIZ) return json({ error: 'DRIVE_PASTA_RAIZ não configurado.' }, 500);
    const corpo = await req.json().catch(() => ({}));
    const acao = corpo?.acao as string;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Cron: só com o segredo do hook ou a service key — nunca com o JWT de
    // uma pessoa (ver _shared/hook-auth.ts).
    if (acao === 'sincronizar_todos') {
      if (!chamadaAutorizada(req)) return respostaNaoAutorizado();
      const resultado: Record<string, unknown> = {};
      for (const grupo of Object.keys(PASTAS)) {
        try { resultado[grupo] = await sincronizar(admin, grupo, true); }
        catch (e) { resultado[grupo] = { erro: String((e as Error).message) }; console.error(grupo, e); }
      }
      return json({ ok: true, resultado });
    }

    // Daqui para baixo, é uma pessoa pelo app.
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const pessoa = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: u } = await pessoa.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'Faça login.' }, 401);

    if (acao === 'sincronizar') {
      const grupo = String(corpo.grupo ?? '');
      if (!PASTAS[grupo]) return json({ error: 'Grupo inválido.' }, 400);
      const { data: pode } = await pessoa.rpc('tem_acesso_grupo', { p_grupo: grupo });
      if (!pode) return json({ error: 'Sem acesso a este grupo.' }, 403);
      return json(await sincronizar(admin, grupo, false));
    }

    if (acao === 'link') {
      // A RLS de `grupo_arquivos` é quem decide: se a pessoa não é do grupo,
      // a linha simplesmente não volta.
      const { data: linha } = await pessoa
        .from('grupo_arquivos').select('id, drive_id').eq('id', String(corpo.arquivo_id ?? '')).maybeSingle();
      if (!linha?.drive_id) return json({ error: 'Material não encontrado.' }, 404);
      const t = await criarToken(linha.id);
      return json({ url: `${SUPABASE_URL}/functions/v1/materiais-drive?t=${encodeURIComponent(t)}` });
    }

    if (acao === 'remover') {
      // A policy "Líder do grupo gerencia os materiais" decide se pode apagar.
      const { data: apagadas, error } = await pessoa
        .from('grupo_arquivos').delete().eq('id', String(corpo.arquivo_id ?? '')).select('drive_id');
      if (error) return json({ error: error.message }, 400);
      const driveId = apagadas?.[0]?.drive_id;
      if (!apagadas?.length) return json({ error: 'Sem permissão ou material não encontrado.' }, 403);
      if (driveId) {
        const r = await drive(`/files/${encodeURIComponent(driveId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trashed: true }),
        });
        if (!r.ok && r.status !== 404) console.error('lixeira falhou', r.status, (await r.text()).slice(0, 300));
      }
      return json({ ok: true });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    console.error('materiais-drive:', e);
    return json({ error: 'Falha ao falar com o Drive.' }, 502);
  }
});
