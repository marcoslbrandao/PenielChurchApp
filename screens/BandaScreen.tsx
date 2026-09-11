import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, FlatList, Linking, Alert, KeyboardAvoidingView, Image,
  Platform, StatusBar, Animated, Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { useTheme } from '../lib/theme';
import { paletaBanda, type BandaColors } from '../lib/temaBanda';
import MetronomoModal from '../components/MetronomoModal';

// ─── Paleta ───────────────────────────────────────────────────────────────────
// A paleta vive em `lib/temaBanda` porque o metrônomo também precisa dela.


// Os sete blocos de estilo desta tela viram funções de `C` (buildGate, buildNm,
// …, no rodapé do arquivo). Montar tudo a cada render seria caro, e só existem
// dois temas — então o resultado fica guardado aqui e é o MESMO objeto em todos
// os componentes, o que mantém as comparações de referência do React baratas.
type TemaBanda = {
  C: BandaColors;
  gate: ReturnType<typeof buildGate>; nm: ReturnType<typeof buildNm>;
  md: ReturnType<typeof buildMd>; ind: ReturnType<typeof buildInd>;
  rel: ReturnType<typeof buildRel>; vs: ReturnType<typeof buildVs>;
  s: ReturnType<typeof buildS>;
};
const temasBanda: { light?: TemaBanda; dark?: TemaBanda } = {};
function temaBanda(isDark: boolean): TemaBanda {
  const chave = isDark ? 'dark' : 'light';
  let tema = temasBanda[chave];
  if (!tema) {
    const C = paletaBanda(isDark);
    tema = {
      C, gate: buildGate(C), nm: buildNm(C), md: buildMd(C),
      ind: buildInd(C), rel: buildRel(C), vs: buildVs(C), s: buildS(C),
    };
    temasBanda[chave] = tema;
  }
  return tema;
}
function useBandaTema(): TemaBanda {
  const { isDark } = useTheme();
  return useMemo(() => temaBanda(isDark), [isDark]);
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Song = {
  id: string; title: string; artist: string;
  song_key: string; bpm: number;
  spotify_id: string; youtube_id: string;
  // Links reais da cifra e da letra, colados pela banda. Opcionais: quando
  // vazios, o app abre a BUSCA do site em vez de um endereço adivinhado.
  cifra_url?: string | null; letra_url?: string | null;
  // Tom em que a cifra está publicada no site. Com song_key, permite abrir a
  // cifra já transposta pro tom que a banda toca.
  cifra_tom?: string | null;
  // Vindos da busca do Deezer no cadastro (todos opcionais).
  duracao_segundos?: number | null; capa_url?: string | null; deezer_id?: string | null;
  in_repertoire: boolean;
};

// "A nossa versão em Sol": tom, BPM e links próprios, com nome. A música em
// `songs` continua sendo o original — não existe linha aqui pra ela, e é por
// isso que `versao_id` é nulo em todo lugar quando se toca o original.
type SongVersao = {
  id: string; song_id: string; nome: string;
  song_key: string; bpm?: number | null; duracao_segundos?: number | null;
  cifra_url?: string | null; cifra_tom?: string | null; letra_url?: string | null;
  youtube_id?: string | null; spotify_id?: string | null;
};

// Alvo de um botão de link: além da URL, guarda se é o link direto salvo pela
// banda (direct: true) ou apenas a busca do site (direct: false) — a interface
// usa isso pra deixar o botão aceso ou apagado.
type LinkTarget = { url: string; direct: boolean };

type CultoSongEntry = {
  song_id: string; song_key: string; bpm: string; order_index: number;
  // Recado desta música NESTE culto ("entrar direto no refrão"). Fica no
  // evento, não no repertório: a mesma canção pode ser tocada de um jeito no
  // domingo de manhã e de outro no camping.
  nota?: string | null;
  // Versão usada neste evento. Nulo = o original.
  versao_id?: string | null;
};

// Um item da ordem do culto que não é música: oração, avisos, oferta,
// pregação. As músicas não são duplicadas aqui — a tela junta as duas listas
// na hora de mostrar, usando o mesmo `order_index`.
type RoadmapItem = {
  id: string; titulo: string; descricao?: string | null;
  duracao_segundos?: number | null; order_index: number;
};

type Culto = {
  id: string; label: string; date: string;
  // false = rascunho: escondido de quem não é admin enquanto a escala não
  // está pronta. É filtro de interface, não barreira de segurança.
  publicado: boolean;
  entries: CultoSongEntry[]; escala: EscalaEntry[]; roadmap: RoadmapItem[];
};

type EscalaEntry = { id: string; membro_id: string; instrumento: string };

// Resposta de um músico a um culto ou ensaio. Quem ainda não respondeu não tem
// linha nenhuma — é por isso que 'pendente' não existe como status.
type Presenca = {
  id: string; tipo: 'culto' | 'ensaio'; evento_id: string;
  profile_id: string; status: 'confirmado' | 'ausente';
};
type BandaMembro = { id: string; profile_id: string; nome: string; avatar_url?: string | null };

// Catálogo de funções do ministério (tabela `banda_funcoes`) e o N:N com as
// pessoas. Substituiu a lista fixa de 8 instrumentos que vivia no código: dava
// pra escalar alguém no Sax, mas não pra dizer que ele toca Sax.
type BandaFuncao = { id: string; nome: string; emoji: string; ordem: number; ativo: boolean };
type MembroFuncao = { membro_id: string; funcao_id: string; principal: boolean };

type Ensaio = {
  id: string; label: string; date: string; time: string; local: string; observacao: string;
  publicado: boolean;
  entries: CultoSongEntry[]; escala: EscalaEntry[];
};

// Um dia em que o músico avisou que não pode servir — declarado antes de
// existir culto nenhum, diferente da confirmação de presença.
type Indisponibilidade = {
  id: string; profile_id: string; data: string;
};

type Comentario = {
  id: string; culto_id: string; autor_id: string; autor_nome: string;
  texto: string; created_at: string;
};

// Uma linha do histórico da escala, gravada por gatilho no banco — não depende
// de ninguém lembrar de anotar.
type EscalaLog = {
  id: string; tipo: string; evento_id: string; acao: 'adicionou' | 'removeu';
  membro_nome: string; instrumento: string; autor_nome: string; created_at: string;
};

// Formação salva ("equipe A"), pra montar a escala de um culto num toque.
type BandaTime = {
  id: string; nome: string;
  membros: { membro_id: string; instrumento: string }[];
};

// Uma linha de `banda_chat_mensagens`. `autor_nome` vem duplicado do banco de
// propósito: a policy de SELECT de `profiles` só libera cada um ver a própria
// linha, então não há como descobrir por join quem mandou a mensagem.
type ChatMsg = { id: string; autor_id: string; autor_nome: string; texto: string; created_at: string };
type Tab = 'hoje' | 'repertorio' | 'cultos' | 'ensaios' | 'equipe' | 'chat';

// ─── Link helpers ───────────────────────────────────────────────────
// Regra: o link salvo pela banda SEMPRE ganha. Só quando não existe link salvo
// é que o app cai no plano B — abrir a BUSCA do site já preenchida com
// "título + artista".
//
// Antes, o app tentava adivinhar a URL do Cifra Club e do Letras a partir do
// nome (cifraclub.com.br/hillsong/oceanos/) e isso dava 404 quase sempre: os
// dois sites usam o nome oficial completo no endereço — a URL real de "Oceanos"
// é /hillsong-united/oceanos-onde-meus-pes-podem-falhar/. Nenhum dos dois tem
// API pública, então adivinhar era o único caminho... e o caminho errado.

// Aceita o que a pessoa colou com ou sem https:// e devolve sempre uma URL
// absoluta (ou '' se o campo estiver vazio).
function normalizeUrl(input?: string | null): string {
  const v = (input ?? '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v.replace(/^\/+/, '')}`;
}

// "Título Artista" pronto pra entrar numa querystring de busca.
function searchTerms(s: Pick<Song, 'title' | 'artist'>): string {
  return encodeURIComponent(`${(s.title || '').trim()} ${(s.artist || '').trim()}`.trim());
}

function cifraSearchUrl(s: Pick<Song, 'title' | 'artist'>) { return `https://www.cifraclub.com.br/?q=${searchTerms(s)}`; }
function letraSearchUrl(s: Pick<Song, 'title' | 'artist'>) { return `https://www.letras.mus.br/?q=${searchTerms(s)}`; }
function youtubeSearchUrl(s: Pick<Song, 'title' | 'artist'>) { return `https://www.youtube.com/results?search_query=${searchTerms(s)}`; }
function spotifySearchUrl(s: Pick<Song, 'title' | 'artist'>) { return `https://open.spotify.com/search/${searchTerms(s)}`; }

// Um resolvedor por serviço. Todos devolvem uma URL que ABRE — nunca uma
// montada na mão que possa dar 404.
function cifraTarget(s: Song): LinkTarget {
  const saved = normalizeUrl(s.cifra_url);
  if (!saved) return { url: cifraSearchUrl(s), direct: false };
  // Sabendo em que tom a cifra está publicada, abre a página já transposta pro
  // tom da banda. Um #key que já estivesse no link salvo é substituído.
  if (!/cifraclub\.com\.br/i.test(saved)) return { url: saved, direct: true };
  // Quem copia a URL da barra de endereço depois de transpor no site leva
  // junto um `#key=7` que não tem nada a ver com o tom da banda. O fragmento
  // antigo sempre sai; só entra um novo se houver transposição a fazer.
  const limpa = saved.replace(/#.*$/, '');
  const semitons = semitonsEntre(s.cifra_tom, s.song_key);
  return { url: semitons ? `${limpa}#key=${semitons}` : limpa, direct: true };
}
function letraTarget(s: Song): LinkTarget {
  const saved = normalizeUrl(s.letra_url);
  return saved ? { url: saved, direct: true } : { url: letraSearchUrl(s), direct: false };
}
function youtubeTarget(s: Song): LinkTarget {
  return s.youtube_id
    ? { url: `https://www.youtube.com/watch?v=${s.youtube_id}`, direct: true }
    : { url: youtubeSearchUrl(s), direct: false };
}
function spotifyTarget(s: Song): LinkTarget {
  return s.spotify_id
    ? { url: `https://open.spotify.com/track/${s.spotify_id}`, direct: true }
    : { url: spotifySearchUrl(s), direct: false };
}

// Aceita colar o link completo do YouTube (várias variações) ou só o ID —
// extrai o ID de vídeo pra guardar sempre o mesmo formato no banco. Se o texto
// não for reconhecível, devolve '' (melhor não salvar nada do que salvar lixo
// que vira um link quebrado depois).
function extractYoutubeId(input: string): string {
  const v = (input || '').trim();
  if (!v) return '';
  const match = v.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  const bare = v.replace(/[?&#].*$/, '');
  return /^[a-zA-Z0-9_-]{11}$/.test(bare) ? bare : '';
}

// Mesma ideia pro Spotify. O botão "Compartilhar" do Spotify copia algo como
// https://open.spotify.com/track/3vv9phNO5HfDkHvVtJYTNa?si=abc123 — antes esse
// texto era salvo inteiro no campo de ID e o link virava
// open.spotify.com/track/https://open.spotify.com/... (quebrado).
function extractSpotifyId(input: string): string {
  const v = (input || '').trim();
  if (!v) return '';
  const match = v.match(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/|spotify:track:)([a-zA-Z0-9]{22})/);
  if (match) return match[1];
  const bare = v.replace(/[?&#].*$/, '');
  return /^[a-zA-Z0-9]{22}$/.test(bare) ? bare : '';
}

// ─── Tom e transposição ──────────────────────────────────────────────────────
// O Cifra Club transpõe pela própria URL: `#key=N`, com N em semitons a partir
// do tom em que a cifra foi publicada. O app não tem como adivinhar esse tom,
// então ele fica salvo em `cifra_tom`; daí dá pra calcular quantos semitons
// separam a cifra do tom que a banda toca e abrir a página já transposta.
const GRAU_DA_NOTA: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Aceita "G", "Gm", "F#", "Bb", "Am", "bb" — devolve 0..11 ou null.
function grauDoTom(tom?: string | null): number | null {
  const t = (tom ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const m = t.match(/^([A-G])([#B]?)/);
  if (!m) return null;
  const base = GRAU_DA_NOTA[m[1]];
  if (base === undefined) return null;
  // Nessa posição, "B" só pode ser bemol — a nota Si já foi consumida em m[1].
  const alteracao = m[2] === '#' ? 1 : m[2] === 'B' ? -1 : 0;
  return (((base + alteracao) % 12) + 12) % 12;
}

// Semitons de `de` até `para`, sempre 0..11 (o Cifra Club aceita essa faixa).
function semitonsEntre(de?: string | null, para?: string | null): number {
  const a = grauDoTom(de);
  const b = grauDoTom(para);
  if (a === null || b === null) return 0;
  return (((b - a) % 12) + 12) % 12;
}

// ─── Duração ─────────────────────────────────────────────────────────────────
function formatDuracao(segundos?: number | null): string {
  const s = Math.max(0, Math.round(segundos ?? 0));
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}`
    : `${m}:${String(seg).padStart(2, '0')}`;
}

// Soma a duração das músicas conhecidas de um setlist. Devolve também quantas
// ficaram de fora, pra tela poder dizer "37:22 (2 sem duração)" em vez de
// mostrar um total que parece exato e não é.
function totalDoSetlist(songs: Song[]): { segundos: number; semDuracao: number } {
  let segundos = 0, semDuracao = 0;
  for (const s of songs) {
    if (s.duracao_segundos && s.duracao_segundos > 0) segundos += s.duracao_segundos;
    else semDuracao += 1;
  }
  return { segundos, semDuracao };
}

// ─── Agenda do celular ───────────────────────────────────────────────────────
// `expo-calendar` seria o caminho nativo, mas é um módulo nativo novo: exigiria
// build e revisão da App Store, e não chegaria por OTA. Este link abre a tela
// de "novo evento" já preenchida e funciona nos dois sistemas hoje.
//
// A data vai SEM o "Z" do fim de propósito: assim o horário é interpretado no
// fuso do calendário de quem abre, e não vira uma hora deslocada para quem
// estiver viajando.
function horaEMinuto(hora: string): { h: number; min: number } {
  const m = (hora || '').match(/(\d{1,2})\D?(\d{2})?/);
  // Limita uma vez só, aqui. Antes o início era limitado e o fim não: digitar
  // "930" (a regex gulosa lê 93 como hora) dava início 23:00 e fim quatro dias
  // depois, porque `new Date(..., 93, ...)` transborda em silêncio.
  const h = Math.min(23, Math.max(0, Number(m?.[1] ?? 9) || 0));
  const min = Math.min(59, Math.max(0, Number(m?.[2] ?? 0) || 0));
  return { h, min };
}

function carimbo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

function googleAgendaUrl(
  titulo: string, dataISO: string, hora: string, duracaoMin: number, detalhes: string, local: string,
): string {
  if (!dataISO) return '';
  const [y, mo, d] = dataISO.split('-').map(Number);
  const { h, min } = horaEMinuto(hora);
  const inicio = new Date(y, mo - 1, d, h, min);
  // O fim sai do início somando milissegundos: a virada de dia (22:00 + 2h)
  // fica correta sem nenhuma conta de calendário à mão.
  const fim = new Date(inicio.getTime() + Math.max(15, duracaoMin) * 60000);
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: titulo, dates: `${carimbo(inicio)}/${carimbo(fim)}`,
  });
  if (detalhes) q.set('details', detalhes);
  if (local) q.set('location', local);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// Iniciais pra quem ainda não subiu foto — "Karin Lediane Camargo" vira "KL",
// não "K" nem "KLC".
function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0] ?? '';
  const segunda = partes.length > 1 ? (partes[1][0] ?? '') : '';
  return (primeira + segunda).toUpperCase();
}

// ─── Playlist do YouTube com o setlist inteiro ───────────────────────────────
// O YouTube monta uma playlist temporária a partir de uma lista de IDs na
// própria URL — sem API, sem chave, sem gastar cota. É como o músico ouve o
// culto inteiro na ordem, no carro, antes do ensaio.
function youtubePlaylistUrl(ids: string[]): string {
  const limpos = ids.filter(Boolean).slice(0, 50);
  if (!limpos.length) return '';
  return `https://www.youtube.com/watch_videos?video_ids=${limpos.join(',')}`;
}

// ─── Busca no Deezer ─────────────────────────────────────────────────────────
// A API pública do Deezer não pede chave nem login (o Spotify pediria
// client_id + secret e uma Edge Function só pra isso). Devolve título,
// artista, capa do álbum e duração — o suficiente pra preencher o cadastro
// sem digitar nada.
type DeezerHit = {
  id: string; title: string; artist: string;
  duracao: number; capa: string; link: string;
};

async function buscarNoDeezer(termo: string): Promise<DeezerHit[]> {
  const q = termo.trim();
  if (q.length < 2) return [];
  // Sem timeout, uma rede ruim deixaria o spinner girando pra sempre e a
  // pessoa presa numa tela que parece travada — e o cadastro manual, que
  // funciona sem internet nenhuma, fica logo abaixo.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let json: any;
  try {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Deezer HTTP ${res.status}`);
    // A leitura do corpo fica dentro do mesmo timeout: uma resposta que abre e
    // depois trava no meio penduraria a busca do mesmo jeito.
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const data = Array.isArray(json?.data) ? json.data : [];
  return data.map((t: any) => ({
    id: String(t?.id ?? ''),
    title: String(t?.title ?? '').trim(),
    artist: String(t?.artist?.name ?? '').trim(),
    // O banco só aceita 0 < duração < 7200 (`songs_duracao_segundos_check`).
    // O Deezer indexa sets e álbuns ao vivo como faixa única de horas — sem
    // este corte, escolher um desses fazia o save falhar com erro cru do
    // Postgres, sem a pessoa ter como saber que a culpa era da duração.
    duracao: (() => { const d = Number(t?.duration) || 0; return d > 0 && d < 7200 ? d : 0; })(),
    capa: String(t?.album?.cover_medium ?? ''),
    link: String(t?.link ?? ''),
  })).filter((h: DeezerHit) => h.id && h.title);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
// Nomes de mês/dia da semana por idioma do app, para exibir a data do culto
// (ex: "Domingo, 12 de Julho" / "Sunday, 12 July") de forma coerente com o
// idioma escolhido em Perfil > Idioma.
const MONTHS_BY_LANG: Record<string, string[]> = {
  pt: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  es: ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
  fr: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
};
const DAYS_BY_LANG: Record<string, string[]> = {
  pt: ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'],
  en: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  es: ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'],
  fr: ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],
};
function formatDateLabel(iso: string, lang: string = 'pt'): string {
  const meses = MONTHS_BY_LANG[lang] ?? MONTHS_BY_LANG.pt;
  const dias = DAYS_BY_LANG[lang] ?? DAYS_BY_LANG.pt;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return lang === 'en'
    ? `${dias[dt.getDay()]}, ${d} ${meses[m - 1]}`
    : `${dias[dt.getDay()]}, ${d} de ${meses[m - 1]}`;
}
// Dia numérico + mês abreviado (3 letras) a partir de uma data ISO — usado
// no "selo" de data dos cards de ensaio.
function diaEMes(iso: string, lang: string = 'pt'): { dia: string; mes: string } {
  const meses = MONTHS_BY_LANG[lang] ?? MONTHS_BY_LANG.pt;
  const [, m, d] = iso.split('-').map(Number);
  return { dia: String(d).padStart(2, '0'), mes: meses[m - 1].slice(0, 3) };
}
// Grade de um mês pra desenhar o calendário: começa no domingo da semana do
// dia 1 e termina no sábado da semana do último dia, com null nos espaços de
// fora do mês.
function gradeDoMes(ano: number, mes: number): (string | null)[] {
  const primeiro = new Date(ano, mes, 1);
  const dias = new Date(ano, mes + 1, 0).getDate();
  const celulas: (string | null)[] = Array(primeiro.getDay()).fill(null);
  for (let d = 1; d <= dias; d++) {
    celulas.push(`${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (celulas.length % 7 !== 0) celulas.push(null);
  return celulas;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Chat: formatação de data ────────────────────────────────────────────────
function horaDaMensagem(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// Chave só de dia (sem hora), pra saber onde entra o divisor de data.
function diaDaMensagem(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "Hoje" e "Ontem" por extenso; datas mais antigas caem no formato normal do
// app ("Domingo, 30 de Agosto").
function rotuloDoDia(dia: string, hoje: string, lang: string, t: (k: string) => string): string {
  if (dia === hoje) return t('banda.hoje');
  const d = new Date(hoje);
  d.setDate(d.getDate() - 1);
  const ontem = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (dia === ontem) return t('banda.ontem');
  return formatDateLabel(dia, lang);
}

// ─── Gate ─────────────────────────────────────────────────────────────────────
function InviteGate({ onUnlock }: { onUnlock: () => void }) {
  const { C, gate } = useBandaTema();
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  const dispararErro = (msg: string) => {
    setError(msg);
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setError(''), 3000);
  };

  const tryUnlock = async () => {
    if (!code.trim()) return;
    setChecking(true);
    const { data, error: rpcError } = await supabase.rpc('use_banda_code', { p_code: code.trim() });
    setChecking(false);
    if (rpcError) { dispararErro(t('banda.erroValidarCodigo')); return; }
    if (!data?.success) { dispararErro(data?.error ?? t('banda.codigoInvalido')); return; }
    onUnlock();
  };

  return (
    <SafeAreaView style={gate.safe}>
      <StatusBar barStyle={C.statusBar} backgroundColor={C.bg} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={gate.kav}>
        <View style={gate.inner}>
          <View style={gate.iconRing}><Ionicons name="musical-notes" size={36} color={C.primary} /></View>
          <Text style={gate.title}>{t('banda.titulo')}</Text>
          <Text style={gate.subtitle}>{t('banda.subtitulo')}</Text>
          <Text style={gate.body}>{t('banda.gateBody')}</Text>
          <Animated.View style={{ transform: [{ translateX: shake }], width: '100%' }}>
            <TextInput style={[gate.input, !!error && gate.inputError]} placeholder={t('banda.codigoDeAcesso')} placeholderTextColor={C.textDim}
              value={code} onChangeText={t => setCode(t.toUpperCase())} autoCapitalize="characters" returnKeyType="go" onSubmitEditing={tryUnlock} editable={!checking} />
          </Animated.View>
          {!!error && <Text style={gate.errorText}>{error}</Text>}
          <TouchableOpacity style={[gate.btn, checking && { opacity: 0.7 }]} onPress={tryUnlock} activeOpacity={0.85} disabled={checking}>
            {checking ? <ActivityIndicator color={C.onPrimary} /> : (
              <><Text style={gate.btnText}>{t('banda.entrar')}</Text><Ionicons name="arrow-forward" size={18} color={C.onPrimary} /></>
            )}
          </TouchableOpacity>
          <Text style={gate.hint}>{t('banda.gateHint')}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const buildGate = (C: BandaColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, kav: { flex: 1 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconRing: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primaryDim, borderWidth: 1, borderColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: 1 },
  subtitle: { fontSize: 13, color: C.primary, fontWeight: '600', marginTop: 4, marginBottom: 20, letterSpacing: 2, textTransform: 'uppercase' },
  body: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  input: { width: '100%', height: 52, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 18, fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: 4, textAlign: 'center', marginBottom: 8 },
  inputError: { borderColor: C.danger },
  errorText: { fontSize: 13, color: C.danger, marginBottom: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, marginTop: 12 },
  btnText: { fontSize: 16, fontWeight: '700', color: C.onPrimary },
  hint: { fontSize: 12, color: C.textDim, marginTop: 24, textAlign: 'center' },
});

// ─── Modal de Música (criar e editar) ──────────────────────────
// O mesmo modal serve pra cadastrar uma música nova e pra corrigir uma já
// existente — antes só dava pra inserir, então uma música salva com o link
// errado ficava errada pra sempre.
function MusicaModal({ visible, song, onClose, onSaved }: {
  visible: boolean; song: Song | null; onClose: () => void; onSaved: () => void;
}) {
  const { C, nm } = useBandaTema();
  const { t } = useTranslation();
  const empty = { title: '', artist: '', song_key: '', bpm: '', youtube_id: '', spotify_id: '', cifra_url: '', letra_url: '', cifra_tom: '' };
  const [form, setForm] = useState(empty);
  const [inRepertoire, setInRepertoire] = useState(true);
  const [errors, setErrors] = useState<Partial<typeof empty>>({});
  const [saving, setSaving] = useState(false);
  const isEdit = !!song;

  // Capa, duração e id do Deezer não são campos que a pessoa digita — vêm da
  // busca — então ficam fora do `form` e viajam à parte até o save.
  const [midia, setMidia] = useState<{ duracao: number | null; capa: string | null; deezerId: string | null }>(
    { duracao: null, capa: null, deezerId: null },
  );
  const [apagando, setApagando] = useState(false);
  const [busca, setBusca] = useState('');
  const [hits, setHits] = useState<DeezerHit[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState('');

  // Recarrega o formulário toda vez que o modal abre: com os dados da música
  // em edição, ou em branco quando é uma música nova.
  useEffect(() => {
    if (!visible) return;
    if (song) {
      setForm({
        title: song.title ?? '', artist: song.artist ?? '',
        song_key: song.song_key ?? '', bpm: song.bpm != null ? String(song.bpm) : '',
        youtube_id: song.youtube_id ?? '', spotify_id: song.spotify_id ?? '',
        cifra_url: song.cifra_url ?? '', letra_url: song.letra_url ?? '',
        cifra_tom: song.cifra_tom ?? '',
      });
      setInRepertoire(!!song.in_repertoire);
      setMidia({ duracao: song.duracao_segundos ?? null, capa: song.capa_url ?? null, deezerId: song.deezer_id ?? null });
    } else {
      setForm({ title: '', artist: '', song_key: '', bpm: '', youtube_id: '', spotify_id: '', cifra_url: '', letra_url: '', cifra_tom: '' });
      setInRepertoire(true);
      setMidia({ duracao: null, capa: null, deezerId: null });
    }
    setErrors({});
    setBusca(''); setHits([]); setErroBusca('');
  }, [visible, song]);

  // ── Busca no Deezer ────────────────────────────────────────────────────────
  // Preenche título, artista, capa e duração sem digitar nada. A API pública do
  // Deezer não pede chave nem login, então dá pra chamar direto do app.
  const rodarBusca = async () => {
    const termo = busca.trim() || `${form.title} ${form.artist}`.trim();
    if (termo.length < 2) return;
    setBuscando(true); setErroBusca('');
    try {
      const achados = await buscarNoDeezer(termo);
      setHits(achados);
      if (!achados.length) setErroBusca(t('banda.buscaSemResultado'));
    } catch {
      // Sem internet, Deezer fora do ar, bloqueio de rede — em todos os casos o
      // cadastro manual continua funcionando, então o erro não trava nada.
      setErroBusca(t('banda.buscaFalhou'));
      setHits([]);
    } finally {
      // No finally pra que nenhum caminho de saída deixe o spinner girando.
      setBuscando(false);
    }
  };

  const aplicarHit = (hit: DeezerHit) => {
    setForm(prev => ({ ...prev, title: hit.title, artist: hit.artist }));
    setMidia({ duracao: hit.duracao || null, capa: hit.capa || null, deezerId: hit.id || null });
    setErrors(p => ({ ...p, title: undefined, artist: undefined }));
    setHits([]); setBusca('');
  };

  const set = (field: keyof typeof empty) => (val: string) => setForm(prev => ({ ...prev, [field]: val }));

  const handleSave = async () => {
    const e: Partial<typeof empty> = {};
    if (!form.title.trim()) e.title = t('banda.obrigatorio');
    if (!form.artist.trim()) e.artist = t('banda.obrigatorio');
    if (!form.song_key.trim()) e.song_key = t('banda.obrigatorio');
    if (!form.bpm.trim() || isNaN(Number(form.bpm))) e.bpm = t('banda.numeroValido');
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    const payload = {
      title: form.title.trim(), artist: form.artist.trim(),
      song_key: form.song_key.trim().toUpperCase(), bpm: Number(form.bpm),
      spotify_id: extractSpotifyId(form.spotify_id),
      youtube_id: extractYoutubeId(form.youtube_id),
      cifra_url: normalizeUrl(form.cifra_url) || null,
      letra_url: normalizeUrl(form.letra_url) || null,
      cifra_tom: form.cifra_tom.trim().toUpperCase() || null,
      duracao_segundos: midia.duracao,
      capa_url: midia.capa,
      deezer_id: midia.deezerId,
      in_repertoire: inRepertoire,
    };
    const { error } = song
      ? await supabase.from('songs').update(payload).eq('id', song.id)
      : await supabase.from('songs').insert(payload);
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    setErrors({});
    onSaved(); onClose();
  };

  // Apagar a música. Antes de perguntar, conta em quantos cultos e ensaios ela
  // está: a chave estrangeira de `culto_songs`/`ensaio_songs` é ON DELETE
  // CASCADE, então apagar a música a remove desses setlists junto — e isso
  // precisa estar na cara de quem confirma, não escondido.
  const apagarMusica = async () => {
    if (!song || apagando) return;
    setApagando(true);
    const [cultos, ensaios] = await Promise.all([
      supabase.from('culto_songs').select('id', { count: 'exact', head: true }).eq('song_id', song.id),
      supabase.from('ensaio_songs').select('id', { count: 'exact', head: true }).eq('song_id', song.id),
    ]);
    setApagando(false);

    // Se a contagem falhou, não dá pra afirmar que a música não está em setlist
    // nenhum. Nesse caso o aviso tem que ser o cauteloso — o contrário seria
    // dar uma garantia que o app não tem como dar.
    const falhou = !!cultos.error || !!ensaios.error;
    const usos = (cultos.count ?? 0) + (ensaios.count ?? 0);

    const confirmar = () => {
      Alert.alert(
        song.title,
        falhou ? t('banda.apagarMusicaTalvezEmUso')
               : usos > 0 ? t('banda.apagarMusicaEmUso', { n: usos })
                          : t('banda.apagarMusicaMsg'),
        [
          { text: t('common.cancelar'), style: 'cancel' },
          { text: t('common.remover'), style: 'destructive', onPress: async () => {
            setApagando(true);
            const { error } = await supabase.from('songs').delete().eq('id', song.id);
            setApagando(false);
            if (error) { Alert.alert(t('common.erro'), error.message); return; }
            onSaved(); onClose();
          }},
        ],
      );
    };
    confirmar();
  };

  // Prévia honesta: mostra exatamente o que cada botão vai abrir com o que
  // está preenchido agora — link direto quando existe, busca do site quando não.
  const previewSong: Song = {
    id: '', title: form.title.trim(), artist: form.artist.trim(),
    // song_key entra de verdade: sem ele a prévia nunca mostraria o #key da
    // transposição e discordaria da dica logo acima, na mesma tela.
    song_key: form.song_key.trim(), bpm: 0,
    spotify_id: extractSpotifyId(form.spotify_id),
    youtube_id: extractYoutubeId(form.youtube_id),
    cifra_url: form.cifra_url, letra_url: form.letra_url,
    cifra_tom: form.cifra_tom, in_repertoire: true,
  };
  const previewRows = (form.title.trim() && form.artist.trim())
    ? [
        { label: 'Cifra Club', target: cifraTarget(previewSong) },
        { label: 'Letras', target: letraTarget(previewSong) },
        { label: 'YouTube', target: youtubeTarget(previewSong) },
        { label: 'Spotify', target: spotifyTarget(previewSong) },
      ]
    : [];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={nm.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={nm.sheet}>
            <View style={nm.header}>
              <Text style={nm.title}>{isEdit ? t('banda.editarMusica') : t('banda.novaMusica')}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Busca no Deezer: preenche título, artista, capa e duração */}
              <View style={nm.buscaBox}>
                <Text style={nm.buscaTitulo}>{t('banda.buscarMusica')}</Text>
                <View style={nm.buscaRow}>
                  <TextInput
                    style={[nm.fieldInput, { flex: 1 }]}
                    placeholder={t('banda.buscarPlaceholder')}
                    placeholderTextColor={C.textDim}
                    value={busca}
                    onChangeText={setBusca}
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={rodarBusca}
                  />
                  <TouchableOpacity style={nm.buscaBtn} onPress={rodarBusca} disabled={buscando} activeOpacity={0.85}>
                    {buscando ? <ActivityIndicator color={C.onPrimary} size="small" /> : <Ionicons name="search" size={17} color={C.onPrimary} />}
                  </TouchableOpacity>
                </View>
                {!!erroBusca && <Text style={nm.buscaErro}>{erroBusca}</Text>}
                {hits.map(hit => (
                  <TouchableOpacity key={hit.id} style={nm.hitRow} onPress={() => aplicarHit(hit)} activeOpacity={0.7}>
                    {hit.capa
                      ? <Image source={{ uri: hit.capa }} style={nm.hitCapa} />
                      : <View style={[nm.hitCapa, nm.hitCapaVazia]}><Ionicons name="musical-note" size={14} color={C.textDim} /></View>}
                    <View style={{ flex: 1 }}>
                      <Text style={nm.hitTitulo} numberOfLines={1}>{hit.title}</Text>
                      <Text style={nm.hitArtista} numberOfLines={1}>
                        {hit.artist}{hit.duracao ? ` · ${formatDuracao(hit.duracao)}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={18} color={C.primary} />
                  </TouchableOpacity>
                ))}
                {!hits.length && !erroBusca && <Text style={nm.buscaDica}>{t('banda.buscarDica')}</Text>}
              </View>

              {/* Capa e duração já escolhidas */}
              {(midia.capa || midia.duracao) && (
                <View style={nm.midiaRow}>
                  {!!midia.capa && <Image source={{ uri: midia.capa }} style={nm.midiaCapa} />}
                  <View style={{ flex: 1 }}>
                    <Text style={nm.midiaLabel}>{t('banda.midiaDaMusica')}</Text>
                    <Text style={nm.midiaValor}>
                      {midia.duracao ? formatDuracao(midia.duracao) : t('banda.semDuracao')}
                      {midia.capa ? ` · ${t('banda.comCapa')}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setMidia({ duracao: null, capa: null, deezerId: null })} hitSlop={8}>
                    <Ionicons name="close-circle" size={19} color={C.textDim} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Título */}
              <View style={nm.fieldWrap}>
                <Text style={nm.fieldLabel}>{t('banda.tituloObrigatorio')}</Text>
                <TextInput style={[nm.fieldInput, !!errors.title && nm.fieldInputError]} placeholder={t('banda.nomeDaMusica')} placeholderTextColor={C.textDim} value={form.title} onChangeText={v => { set('title')(v); setErrors(p => ({ ...p, title: undefined })); }} />
                {!!errors.title && <Text style={nm.fieldError}>{errors.title}</Text>}
              </View>
              {/* Artista */}
              <View style={nm.fieldWrap}>
                <Text style={nm.fieldLabel}>{t('banda.artistaObrigatorio')}</Text>
                <TextInput style={[nm.fieldInput, !!errors.artist && nm.fieldInputError]} placeholder={t('banda.artistaOuMinisterio')} placeholderTextColor={C.textDim} value={form.artist} onChangeText={v => { set('artist')(v); setErrors(p => ({ ...p, artist: undefined })); }} />
                {!!errors.artist && <Text style={nm.fieldError}>{errors.artist}</Text>}
              </View>
              {/* Tom + BPM */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <View style={nm.fieldWrap}>
                    <Text style={nm.fieldLabel}>{t('banda.tomObrigatorio')}</Text>
                    <TextInput style={[nm.fieldInput, !!errors.song_key && nm.fieldInputError]} placeholder="Ex: G" placeholderTextColor={C.textDim} value={form.song_key} onChangeText={v => { set('song_key')(v.toUpperCase()); setErrors(p => ({ ...p, song_key: undefined })); }} autoCapitalize="characters" maxLength={3} />
                    {!!errors.song_key && <Text style={nm.fieldError}>{errors.song_key}</Text>}
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={nm.fieldWrap}>
                    <Text style={nm.fieldLabel}>{t('banda.bpmObrigatorio')}</Text>
                    <TextInput style={[nm.fieldInput, !!errors.bpm && nm.fieldInputError]} placeholder="Ex: 72" placeholderTextColor={C.textDim} value={form.bpm} onChangeText={v => { set('bpm')(v); setErrors(p => ({ ...p, bpm: undefined })); }} keyboardType="numeric" maxLength={3} />
                    {!!errors.bpm && <Text style={nm.fieldError}>{errors.bpm}</Text>}
                  </View>
                </View>
              </View>

              {/* ── Links ── */}
              <Text style={nm.groupLabel}>{t('banda.linksDaMusica')}</Text>
              <Text style={nm.groupHint}>{t('banda.linksDicaBusca')}</Text>
              {/* Cifra */}
              <View style={nm.fieldWrap}>
                <Text style={nm.fieldLabel}>{t('banda.linkCifraOpcional')}</Text>
                <TextInput style={nm.fieldInput} placeholder={t('banda.coleLinkCifra')} placeholderTextColor={C.textDim} value={form.cifra_url} onChangeText={set('cifra_url')} autoCorrect={false} autoCapitalize="none" keyboardType="url" />
              </View>
              {/* Tom em que a cifra está publicada — permite abrir já transposta */}
              {!!form.cifra_url.trim() && (
                <View style={nm.fieldWrap}>
                  <Text style={nm.fieldLabel}>{t('banda.tomDaCifra')}</Text>
                  <TextInput style={[nm.fieldInput, { width: 110 }]} placeholder="Ex: D" placeholderTextColor={C.textDim} value={form.cifra_tom} onChangeText={v => set('cifra_tom')(v.toUpperCase())} autoCapitalize="characters" maxLength={3} />
                  <Text style={nm.fieldHint}>
                    {form.cifra_tom.trim() && form.song_key.trim() && semitonsEntre(form.cifra_tom, form.song_key) > 0
                      ? t('banda.tomDaCifraTranspoe', { n: semitonsEntre(form.cifra_tom, form.song_key), tom: form.song_key.trim().toUpperCase() })
                      : t('banda.tomDaCifraDica')}
                  </Text>
                </View>
              )}
              {/* Letra */}
              <View style={nm.fieldWrap}>
                <Text style={nm.fieldLabel}>{t('banda.linkLetraOpcional')}</Text>
                <TextInput style={nm.fieldInput} placeholder={t('banda.coleLinkLetra')} placeholderTextColor={C.textDim} value={form.letra_url} onChangeText={set('letra_url')} autoCorrect={false} autoCapitalize="none" keyboardType="url" />
              </View>
              {/* YouTube */}
              <View style={nm.fieldWrap}>
                <Text style={nm.fieldLabel}>{t('banda.idYoutubeOpcional')}</Text>
                <TextInput style={nm.fieldInput} placeholder={t('banda.coleLinkYoutube')} placeholderTextColor={C.textDim} value={form.youtube_id} onChangeText={set('youtube_id')} autoCorrect={false} autoCapitalize="none" keyboardType="url" />
              </View>
              {/* Spotify */}
              <View style={nm.fieldWrap}>
                <Text style={nm.fieldLabel}>{t('banda.linkSpotifyOpcional')}</Text>
                <TextInput style={nm.fieldInput} placeholder={t('banda.coleLinkSpotify')} placeholderTextColor={C.textDim} value={form.spotify_id} onChangeText={set('spotify_id')} autoCorrect={false} autoCapitalize="none" keyboardType="url" />
              </View>

              {/* Prévia do que cada botão vai abrir */}
              {previewRows.length > 0 && (
                <View style={nm.previewBox}>
                  <Text style={nm.previewTitle}>{t('banda.oQueOsBotoesAbrem')}</Text>
                  {previewRows.map(r => (
                    <View key={r.label} style={nm.previewRow}>
                      <Text style={nm.previewLink}>{r.label}</Text>
                      <View style={[nm.previewTag, r.target.direct && nm.previewTagOk]}>
                        <Text style={[nm.previewTagText, r.target.direct && nm.previewTagTextOk]}>
                          {r.target.direct ? t('banda.linkSalvo') : t('banda.viaBusca')}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* No repertório? */}
              <TouchableOpacity style={nm.toggleRow} onPress={() => setInRepertoire(v => !v)} activeOpacity={0.7}>
                <Ionicons name={inRepertoire ? 'checkbox' : 'square-outline'} size={20} color={inRepertoire ? C.primary : C.textDim} />
                <Text style={nm.toggleText}>{t('banda.manterNoRepertorio')}</Text>
              </TouchableOpacity>

              {/* Apagar só faz sentido numa música que já existe */}
              {isEdit && (
                <TouchableOpacity
                  style={nm.apagarBtn}
                  onPress={apagarMusica}
                  disabled={apagando}
                  activeOpacity={0.7}
                >
                  {apagando
                    ? <ActivityIndicator color={C.danger} size="small" />
                    : <Ionicons name="trash-outline" size={16} color={C.danger} />}
                  <Text style={nm.apagarBtnText}>{t('banda.apagarMusica')}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            <TouchableOpacity style={[nm.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.onPrimary} /> : <><Ionicons name={isEdit ? 'checkmark-outline' : 'musical-note-outline'} size={18} color={C.onPrimary} /><Text style={nm.saveBtnText}>{isEdit ? t('banda.salvarAlteracoes') : t('banda.adicionarMusica')}</Text></>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
const buildNm = (C: BandaColors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: C.overlay },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: '90%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  fieldInput: { backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15, color: C.text },
  fieldInputError: { borderColor: C.danger },
  fieldError: { fontSize: 11, color: C.danger, marginTop: 3 },
  fieldHint: { fontSize: 11, color: C.textDim, marginTop: 5, lineHeight: 15 },
  buscaBox: { backgroundColor: C.surfaceHigh, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 16 },
  buscaTitulo: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  buscaRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  buscaBtn: { width: 46, height: 46, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  buscaDica: { fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 15 },
  buscaErro: { fontSize: 11, color: C.gold, marginTop: 8 },
  hitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border, marginTop: 8 },
  hitCapa: { width: 34, height: 34, borderRadius: 5, backgroundColor: C.surface },
  hitCapaVazia: { alignItems: 'center', justifyContent: 'center' },
  hitTitulo: { fontSize: 13, color: C.text, fontWeight: '600' },
  hitArtista: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  midiaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surfaceHigh, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 14 },
  midiaCapa: { width: 40, height: 40, borderRadius: 6 },
  midiaLabel: { fontSize: 10, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  midiaValor: { fontSize: 13, color: C.text, marginTop: 2 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, marginTop: 8 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: C.onPrimary },
  previewBox: { backgroundColor: C.surfaceHigh, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  previewTitle: { fontSize: 11, color: C.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  previewLink: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  previewTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  previewTagOk: { backgroundColor: C.primaryDim, borderColor: C.primary },
  previewTagText: { fontSize: 10, fontWeight: '700', color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.4 },
  previewTagTextOk: { color: C.onPrimaryDim },
  groupLabel: { fontSize: 12, color: C.text, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8, marginBottom: 4 },
  groupHint: { fontSize: 11, color: C.textDim, lineHeight: 15, marginBottom: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, marginBottom: 4 },
  toggleText: { fontSize: 14, color: C.text },
  apagarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, marginTop: 4, borderRadius: 10, borderWidth: 1, borderColor: C.danger + '55' },
  apagarBtnText: { fontSize: 13, fontWeight: '700', color: C.danger },
});

// ─── Novo Culto Modal ─────────────────────────────────────────────────────────
// ─── Editor de setlist ────────────────────────────────────────────────────────
// Usado nos três lugares onde se mexe nas músicas de um evento: criar culto,
// criar ensaio e editar o setlist de um que já existe. Antes cada modal tinha
// sua própria cópia da lista de repertório com checkbox — o que dava pra fazer
// era marcar e desmarcar, e a ordem era simplesmente a ordem dos toques, sem
// jeito de mudar depois.
//
// Aqui as duas coisas ficam separadas: em cima o setlist na ordem real, que dá
// pra subir, descer e remover; embaixo o repertório que ainda não entrou, com
// busca, pra adicionar. O componente não fala com o banco — só devolve as
// entradas por `setEntries`, e quem chama decide o que fazer com elas.
function SetlistEditor({ entries, setEntries, songs, versoes }: {
  entries: CultoSongEntry[];
  setEntries: React.Dispatch<React.SetStateAction<CultoSongEntry[]>>;
  songs: Song[];
  versoes: SongVersao[];
}) {
  const { C, md, s } = useBandaTema();
  const { t } = useTranslation();
  const [busca, setBusca] = useState('');

  const songById = useMemo(() => {
    const m = new Map<string, Song>();
    songs.forEach(sg => m.set(sg.id, sg));
    return m;
  }, [songs]);

  // order_index é sempre recalculado a partir da posição na lista. Guardar o
  // valor antigo depois de mover ou remover é o caminho curto pra uma ordem
  // que muda sozinha a cada recarga.
  const reindexar = (lista: CultoSongEntry[]) => lista.map((e, i) => ({ ...e, order_index: i }));

  const mover = (de: number, para: number) => {
    if (para < 0 || para >= entries.length) return;
    setEntries(prev => {
      const lista = [...prev];
      const [item] = lista.splice(de, 1);
      lista.splice(para, 0, item);
      return reindexar(lista);
    });
  };

  const remover = (songId: string) => {
    setEntries(prev => reindexar(prev.filter(e => e.song_id !== songId)));
  };

  const adicionar = (song: Song) => {
    setEntries(prev => [...prev, {
      song_id: song.id, song_key: song.song_key, bpm: String(song.bpm), order_index: prev.length,
    }]);
    setBusca('');
  };

  const updateEntry = (songId: string, field: 'song_key' | 'bpm', value: string) => {
    setEntries(prev => prev.map(e => e.song_id === songId
      ? { ...e, [field]: field === 'song_key' ? value.toUpperCase() : value }
      : e));
  };

  // Escolher a versão já traz o tom e o BPM dela pro setlist — que é o motivo
  // de a versão existir. Voltar pro original recupera os valores da música.
  const escolherVersao = (song: Song, versao: SongVersao | null) => {
    setEntries(prev => prev.map(e => {
      if (e.song_id !== song.id) return e;
      // Uma versão criada só pra mudar o BPM tem tom vazio (`not null default ''`).
      // Nesse caso o tom que a pessoa digitou pra este evento tem que ficar de
      // pé — voltar em silêncio pro tom do repertório é perder o trabalho dela.
      const tom = versao ? (versao.song_key || e.song_key || song.song_key) : song.song_key;
      return { ...e, versao_id: versao?.id ?? null, song_key: tom ?? '', bpm: String(versao?.bpm ?? song.bpm ?? '') };
    }));
  };

  const termo = busca.trim().toLowerCase();
  const disponiveis = songs.filter(sg =>
    !entries.some(e => e.song_id === sg.id) &&
    (termo === '' || `${sg.title} ${sg.artist}`.toLowerCase().includes(termo))
  );

  return (
    <>
      <Text style={[md.label, { marginTop: 16 }]}>{t('banda.musicasSelecionadas', { n: entries.length })}</Text>

      {entries.length === 0 ? (
        <Text style={md.setlistVazio}>{t('banda.setlistVazio')}</Text>
      ) : (
        entries.map((entry, idx) => {
          const song = songById.get(entry.song_id);
          if (!song) return null;
          const versoesDaSong = versoes.filter(v => v.song_id === song.id);
          return (
            <View key={entry.song_id} style={{ marginBottom: 8 }}>
              <View style={md.setlistRow}>
                <View style={md.setlistOrdem}>
                  <TouchableOpacity
                    onPress={() => mover(idx, idx - 1)}
                    disabled={idx === 0}
                    hitSlop={6}
                    style={md.ordemBtn}
                  >
                    <Ionicons name="chevron-up" size={15} color={idx === 0 ? C.textDim : C.primary} />
                  </TouchableOpacity>
                  <Text style={md.setlistNum}>{idx + 1}</Text>
                  <TouchableOpacity
                    onPress={() => mover(idx, idx + 1)}
                    disabled={idx === entries.length - 1}
                    hitSlop={6}
                    style={md.ordemBtn}
                  >
                    <Ionicons name="chevron-down" size={15} color={idx === entries.length - 1 ? C.textDim : C.primary} />
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={md.setlistTitulo} numberOfLines={1}>{song.title}</Text>
                  <Text style={md.songArtist} numberOfLines={1}>{song.artist}</Text>
                </View>
                <TouchableOpacity onPress={() => remover(entry.song_id)} hitSlop={8} style={md.ordemBtn}>
                  <Ionicons name="trash-outline" size={16} color={C.danger} />
                </TouchableOpacity>
              </View>

              {versoesDaSong.length > 0 && (
                <View style={md.versaoRow}>
                  {[null, ...versoesDaSong].map(v => {
                    const ativa = (entry.versao_id ?? null) === (v?.id ?? null);
                    return (
                      <TouchableOpacity key={v?.id ?? 'original'} style={[s.pill, ativa && s.pillActive]} onPress={() => escolherVersao(song, v)}>
                        <Text style={[s.pillText, ativa && s.pillTextActive]}>{v ? v.nome : t('banda.versaoOriginal')}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={md.overrideRow}>
                <View style={md.overrideField}>
                  <Text style={md.overrideLabel}>{t('banda.tomLabel')}</Text>
                  <TextInput style={md.overrideInput} value={entry.song_key} onChangeText={v => updateEntry(entry.song_id, 'song_key', v)} autoCapitalize="characters" maxLength={3} placeholderTextColor={C.textDim} />
                </View>
                <View style={md.overrideField}>
                  <Text style={md.overrideLabel}>{t('banda.bpm')}</Text>
                  <TextInput style={md.overrideInput} value={entry.bpm} onChangeText={v => updateEntry(entry.song_id, 'bpm', v)} keyboardType="numeric" maxLength={3} placeholderTextColor={C.textDim} />
                </View>
                <Text style={md.overrideHint}>{t('banda.ajusteParaEsteCulto')}</Text>
              </View>
            </View>
          );
        })
      )}

      <Text style={[md.label, { marginTop: 18 }]}>{t('banda.adicionarDoRepertorio')}</Text>
      <TextInput
        style={md.input}
        placeholder={t('banda.buscarPlaceholder')}
        placeholderTextColor={C.textDim}
        value={busca}
        onChangeText={setBusca}
      />
      <View style={md.songList}>
        {disponiveis.length === 0 ? (
          <Text style={md.setlistVazio}>
            {entries.length > 0 && termo === '' ? t('banda.todasNoSetlist') : t('banda.buscaSemResultado')}
          </Text>
        ) : (
          disponiveis.map(song => (
            <TouchableOpacity key={song.id} style={md.songRow} onPress={() => adicionar(song)} activeOpacity={0.7}>
              <View style={[md.keyPill, { backgroundColor: C.surfaceHigh }]}>
                <Text style={[md.keyPillText, { color: C.textMuted }]}>{song.song_key}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={md.songTitle}>{song.title}</Text>
                <Text style={md.songArtist}>{song.artist} · {song.bpm} BPM</Text>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={C.primary} />
            </TouchableOpacity>
          ))
        )}
      </View>
    </>
  );
}

function NovoCultoModal({ visible, onClose, onSaved, songs, versoes }: {
  visible: boolean; onClose: () => void; onSaved: () => void; songs: Song[]; versoes: SongVersao[];
}) {
  const { C, md } = useBandaTema();
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState('');
  const [entries, setEntries] = useState<CultoSongEntry[]>([]);
  const [dateError, setDateError] = useState('');
  const [saving, setSaving] = useState(false);
  // Ligado por padrão pra não mudar o comportamento de quem já usa: quem
  // quiser montar em paz desliga e publica depois.
  const [publicado, setPublicado] = useState(true);

  const formatDateInput = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let f = digits;
    if (digits.length > 2) f = digits.slice(0, 2) + '/' + digits.slice(2);
    if (digits.length > 4) f = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    setDate(f); setDateError('');
  };

  const handleSave = async () => {
    const parts = date.split('/');
    if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
      setDateError(t('banda.usarFormatoData')); return;
    }
    if (entries.length === 0) { Alert.alert(t('common.atencao'), t('banda.selecioneUmaMusica')); return; }
    const [d, m, y] = parts;
    const iso = `${y}-${m}-${d}`;
    const label = formatDateLabel(iso, i18n.language);
    setSaving(true);

    // 1. Cria o culto
    const { data: cultoData, error: cultoError } = await supabase
      .from('cultos').insert({ label, date: iso, publicado }).select().single();
    if (cultoError || !cultoData) { Alert.alert(t('common.erro'), cultoError?.message); setSaving(false); return; }

    // 2. Insere as músicas do culto
    const cultoSongs = entries.map(e => ({
      versao_id: e.versao_id ?? null,
      culto_id: cultoData.id, song_id: e.song_id,
      song_key: e.song_key, bpm: Number(e.bpm), order_index: e.order_index,
    }));
    const { error: songsError } = await supabase.from('culto_songs').insert(cultoSongs);
    setSaving(false);
    if (songsError) { Alert.alert(t('banda.erroSalvarMusicas'), songsError.message); return; }

    setDate(''); setEntries([]); setDateError('');
    onSaved(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={md.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={md.sheet}>
            <View style={md.header}>
              <Text style={md.title}>{t('banda.novoCulto')}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>
            <Text style={md.label}>{t('banda.dataDoCulto')}</Text>
            <TextInput style={[md.input, !!dateError && md.inputError]} placeholder="DD/MM/AAAA" placeholderTextColor={C.textDim} value={date} onChangeText={formatDateInput} keyboardType="numeric" maxLength={10} />
            {!!dateError && <Text style={md.errorText}>{dateError}</Text>}
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <SetlistEditor entries={entries} setEntries={setEntries} songs={songs} versoes={versoes} />
            </ScrollView>
            <TouchableOpacity style={md.publicarRow} onPress={() => setPublicado(v => !v)} activeOpacity={0.7}>
              <Ionicons name={publicado ? 'eye-outline' : 'eye-off-outline'} size={18} color={publicado ? C.accent : C.gold} />
              <View style={{ flex: 1 }}>
                <Text style={md.publicarTitulo}>{publicado ? t('banda.publicarAgora') : t('banda.salvarComoRascunho')}</Text>
                <Text style={md.publicarDesc}>{publicado ? t('banda.publicarAgoraDesc') : t('banda.salvarComoRascunhoDesc')}</Text>
              </View>
              <View style={[md.publicarSwitch, publicado && md.publicarSwitchOn]}>
                <View style={[md.publicarKnob, publicado && md.publicarKnobOn]} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[md.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.onPrimary} /> : <><Ionicons name="save-outline" size={18} color={C.onPrimary} /><Text style={md.saveBtnText}>{t('banda.salvarCulto')}</Text></>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
const buildMd = (C: BandaColors) => StyleSheet.create({
  versaoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginLeft: 4 },
  avisoIndisp: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.gold, borderRadius: 10, padding: 10, marginBottom: 16 },
  avisoIndispText: { flex: 1, fontSize: 12, color: C.gold, lineHeight: 16 },
  salvarTimeRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 16 },
  salvarTimeBtn: { width: 46, height: 46, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  funcaoGrupo: { fontSize: 10, fontWeight: '800', color: C.textDim, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 10, marginBottom: 6 },
  funcaoLinhaToque: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  funcaoEmoji: { fontSize: 20 },
  novaFuncaoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  emojiInput: { width: 52, height: 46, borderRadius: 10, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border, fontSize: 20, color: C.text },
  funcaoWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  avisoFuncaoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  avisoFuncaoTexto: { flex: 1, fontSize: 11, color: C.gold, lineHeight: 15 },
  timesDica: { fontSize: 11, color: C.textDim, marginTop: -8, marginBottom: 10, lineHeight: 15 },
  publicarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginTop: 12 },
  publicarTitulo: { fontSize: 14, fontWeight: '700', color: C.text },
  publicarDesc: { fontSize: 11, color: C.textMuted, marginTop: 2, lineHeight: 15 },
  publicarSwitch: { width: 42, height: 24, borderRadius: 12, backgroundColor: C.chipBorder, padding: 3, justifyContent: 'center' },
  publicarSwitchOn: { backgroundColor: C.accent },
  publicarKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.surface },
  publicarKnobOn: { backgroundColor: C.surface, alignSelf: 'flex-end' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: C.overlay },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  label: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 16, color: C.text },
  inputError: { borderColor: C.danger },
  errorText: { fontSize: 12, color: C.danger, marginTop: 4 },
  // Sem maxHeight de propósito: isto é uma View, não uma ScrollView, então um
  // teto de altura só cortava a lista — quem tinha muitas músicas via as
  // primeiras e não conseguia rolar até o resto. Agora a lista inteira flui
  // dentro da ScrollView do modal, que é quem rola.
  songList: { marginBottom: 16 },
  // Editor de setlist
  setlistVazio: { fontSize: 12, color: C.textDim, lineHeight: 17, paddingVertical: 10, paddingHorizontal: 4 },
  setlistSubtitulo: { fontSize: 13, color: C.textMuted, marginTop: -12, marginBottom: 4 },
  setlistRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.primary, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  setlistOrdem: { alignItems: 'center', width: 26 },
  setlistNum: { fontSize: 12, fontWeight: '800', color: C.primary, paddingVertical: 1 },
  ordemBtn: { padding: 2 },
  setlistTitulo: { fontSize: 14, fontWeight: '700', color: C.text },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: 'transparent' },
  songRowSelected: { borderColor: C.primary, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 },
  keyPill: { width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  keyPillText: { fontSize: 12, fontWeight: '800' },
  songTitle: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  songArtist: { fontSize: 11, color: C.textDim, marginTop: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: C.primary, borderColor: C.primary },
  overrideRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.primaryDim, borderWidth: 1, borderTopWidth: 0, borderColor: C.primary, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  overrideField: { alignItems: 'center', gap: 3 },
  overrideLabel: { fontSize: 9, color: C.onPrimaryDim, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  overrideInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.primary, borderRadius: 6, width: 52, height: 32, textAlign: 'center', fontSize: 14, fontWeight: '700', color: C.text },
  overrideHint: { flex: 1, fontSize: 11, color: C.onPrimaryDim, opacity: 0.8, textAlign: 'right' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: C.onPrimary },
});

// Devolve a música como ela deve ser TOCADA neste evento: os campos da versão
// escolhida sobrescrevem os do original, e o que a versão não define continua
// vindo da música. Assim os quatro botões de link, o tom e a duração passam a
// falar da versão certa sem duplicar nada no banco.
function comVersao(song: Song, versao?: SongVersao | null): Song {
  if (!versao) return song;
  return {
    ...song,
    song_key: versao.song_key || song.song_key,
    bpm: versao.bpm ?? song.bpm,
    duracao_segundos: versao.duracao_segundos ?? song.duracao_segundos,
    // cifra_url e cifra_tom andam juntos: são "qual cifra" e "em que tom ela
    // foi publicada". Herdar o tom do original junto com uma cifra nova abriria
    // a página transposta pelo número errado — pior que não transpor.
    ...(versao.cifra_url
      ? { cifra_url: versao.cifra_url, cifra_tom: versao.cifra_tom ?? null }
      : { cifra_url: song.cifra_url, cifra_tom: song.cifra_tom }),
    letra_url: versao.letra_url ?? song.letra_url,
    youtube_id: versao.youtube_id || song.youtube_id,
    spotify_id: versao.spotify_id || song.spotify_id,
  };
}

// ─── Botões de link (cifra, letra, YouTube, Spotify) ────────────────────────
// Quatro botões em toda música, em qualquer lista. Aceso = a banda salvou o
// link direto daquela música. Apagado = ainda não tem link salvo, e o botão
// abre a BUSCA do site já preenchida com título + artista — nunca um 404.
function LinkMiniButtons({ song, openLink }: { song: Song; openLink: (target: LinkTarget, label: string) => void }) {
  const { C, s } = useBandaTema();
  const cifra = cifraTarget(song);
  const letra = letraTarget(song);
  const yt = youtubeTarget(song);
  const sp = spotifyTarget(song);
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      <TouchableOpacity style={[s.linkBtn, s.linkBtnMini, !cifra.direct && s.linkBtnDisabled]} onPress={() => openLink(cifra, 'Cifra Club')}>
        <Text style={s.linkBtnLabel}>CI</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.linkBtn, s.linkBtnMini, !letra.direct && s.linkBtnDisabled]} onPress={() => openLink(letra, 'Letras')}>
        <Ionicons name="document-text-outline" size={14} color={C.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity style={[s.linkBtn, s.linkBtnMini, yt.direct ? s.linkBtnYt : s.linkBtnDisabled]} onPress={() => openLink(yt, 'YouTube')}>
        <Ionicons name="logo-youtube" size={14} color={yt.direct ? '#FF0000' : C.textDim} />
      </TouchableOpacity>
      <TouchableOpacity style={[s.linkBtn, s.linkBtnMini, sp.direct ? s.spotifyBtn : s.spotifyBtnDisabled]} onPress={() => openLink(sp, 'Spotify')}>
        <Ionicons name="musical-note" size={14} color={sp.direct ? C.accent : C.textDim} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Resumo do setlist ───────────────────────────────────────────────────────
// Quantas músicas, quanto tempo de música e um botão que abre o culto inteiro
// como playlist do YouTube. O total só aparece quando alguma música tem
// duração; se faltar duração em algumas, a tela avisa em vez de mostrar um
// número que parece exato e não é.
function SetlistResumo({ songs, onPlaylist }: { songs: Song[]; onPlaylist: () => void }) {
  const { s } = useBandaTema();
  const { t } = useTranslation();
  const { segundos, semDuracao } = totalDoSetlist(songs);
  const comVideo = songs.filter(sg => sg.youtube_id).length;
  return (
    <View style={s.resumoRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.resumoTexto}>
          {songs.length} {songs.length !== 1 ? t('banda.musicas') : t('banda.musica')}
          {segundos > 0 ? ` · ${formatDuracao(segundos)}` : ''}
        </Text>
        {semDuracao > 0 && segundos > 0 && (
          <Text style={s.resumoAviso}>{t('banda.semDuracaoAviso', { n: semDuracao })}</Text>
        )}
      </View>
      {comVideo > 0 && (
        <TouchableOpacity style={s.playlistBtn} onPress={onPlaylist} activeOpacity={0.85}>
          <Ionicons name="logo-youtube" size={14} color="#FF0000" />
          <Text style={s.playlistBtnText}>{t('banda.playlist', { n: comVideo })}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Confirmação de presença ─────────────────────────────────────────────────
// Cada músico responde por si (a policy do banco garante isso). Tocar de novo
// no botão já marcado apaga a resposta e volta pra "sem resposta".
function PresencaBar({ presencas, meuId, escalados, onResponder }: {
  presencas: Presenca[];
  meuId?: string;
  escalados: number;
  onResponder: (status: 'confirmado' | 'ausente' | null) => void;
}) {
  const { C, s } = useBandaTema();
  const { t } = useTranslation();
  const minha = presencas.find(pr => pr.profile_id === meuId)?.status ?? null;
  const confirmados = presencas.filter(pr => pr.status === 'confirmado').length;
  const ausentes = presencas.filter(pr => pr.status === 'ausente').length;
  const semResposta = Math.max(0, escalados - confirmados - ausentes);

  return (
    <View style={s.presencaWrap}>
      <View style={s.presencaBtns}>
        <TouchableOpacity
          style={[s.presencaBtn, minha === 'confirmado' && s.presencaBtnOk]}
          onPress={() => onResponder(minha === 'confirmado' ? null : 'confirmado')}
          activeOpacity={0.85}
        >
          <Ionicons name={minha === 'confirmado' ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={16} color={minha === 'confirmado' ? C.text : C.accent} />
          <Text style={[s.presencaBtnText, minha === 'confirmado' && s.presencaBtnTextOn]}>{t('banda.euVou')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.presencaBtn, minha === 'ausente' && s.presencaBtnNo]}
          onPress={() => onResponder(minha === 'ausente' ? null : 'ausente')}
          activeOpacity={0.85}
        >
          <Ionicons name={minha === 'ausente' ? 'close-circle' : 'close-circle-outline'}
            size={16} color={minha === 'ausente' ? C.text : C.danger} />
          <Text style={[s.presencaBtnText, minha === 'ausente' && s.presencaBtnTextOn]}>{t('banda.naoPosso')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.presencaResumo}>
        {t('banda.presencaResumo', { ok: confirmados, nao: ausentes })}
        {escalados > 0 ? t('banda.presencaPendentes', { n: semResposta }) : ''}
      </Text>
    </View>
  );
}

// ─── Novo Ensaio Modal ────────────────────────────────────────────────────────
// Igual ao NovoCultoModal (data + músicas do repertório com tom/BPM
// ajustáveis), só que também pede horário, local e uma observação opcional —
// os mesmos dados que a aba Ensaios sempre mostrou, agora vindos do banco.
function NovoEnsaioModal({ visible, onClose, onSaved, songs, versoes }: {
  visible: boolean; onClose: () => void; onSaved: () => void; songs: Song[]; versoes: SongVersao[];
}) {
  const { C, md } = useBandaTema();
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [local, setLocal] = useState('');
  const [observacao, setObservacao] = useState('');
  const [entries, setEntries] = useState<CultoSongEntry[]>([]);
  const [dateError, setDateError] = useState('');
  const [saving, setSaving] = useState(false);
  const [publicado, setPublicado] = useState(true);

  const formatDateInput = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let f = digits;
    if (digits.length > 2) f = digits.slice(0, 2) + '/' + digits.slice(2);
    if (digits.length > 4) f = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    setDate(f); setDateError('');
  };

  const handleSave = async () => {
    const parts = date.split('/');
    if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
      setDateError(t('banda.usarFormatoData')); return;
    }
    if (!time.trim() || !local.trim()) { Alert.alert(t('common.atencao'), t('banda.preencherHorarioLocal')); return; }
    if (entries.length === 0) { Alert.alert(t('common.atencao'), t('banda.selecioneUmaMusica')); return; }
    const [d, m, y] = parts;
    const iso = `${y}-${m}-${d}`;
    const label = formatDateLabel(iso, i18n.language);
    setSaving(true);

    const { data: ensaioData, error: ensaioError } = await supabase
      .from('ensaios').insert({ label, date: iso, time: time.trim(), local: local.trim(), observacao: observacao.trim(), publicado }).select().single();
    if (ensaioError || !ensaioData) { Alert.alert(t('common.erro'), ensaioError?.message ?? t('banda.erroSalvarEnsaio')); setSaving(false); return; }

    const ensaioSongs = entries.map(e => ({
      versao_id: e.versao_id ?? null,
      ensaio_id: ensaioData.id, song_id: e.song_id,
      song_key: e.song_key, bpm: Number(e.bpm), order_index: e.order_index,
    }));
    const { error: songsError } = await supabase.from('ensaio_songs').insert(ensaioSongs);
    setSaving(false);
    if (songsError) { Alert.alert(t('banda.erroSalvarMusicas'), songsError.message); return; }

    setDate(''); setTime(''); setLocal(''); setObservacao(''); setEntries([]); setDateError('');
    onSaved(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={md.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={md.sheet}>
            <View style={md.header}>
              <Text style={md.title}>{t('banda.novoEnsaio')}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={md.label}>{t('banda.dataDoEnsaio')}</Text>
              <TextInput style={[md.input, !!dateError && md.inputError]} placeholder="DD/MM/AAAA" placeholderTextColor={C.textDim} value={date} onChangeText={formatDateInput} keyboardType="numeric" maxLength={10} />
              {!!dateError && <Text style={md.errorText}>{dateError}</Text>}

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={md.label}>{t('banda.horarioDoEnsaio')}</Text>
                  <TextInput style={md.input} placeholder="Ex: 19:00" placeholderTextColor={C.textDim} value={time} onChangeText={setTime} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={md.label}>{t('banda.localDoEnsaio')}</Text>
                  <TextInput style={md.input} placeholder={t('banda.localPlaceholder')} placeholderTextColor={C.textDim} value={local} onChangeText={setLocal} />
                </View>
              </View>

              <Text style={[md.label, { marginTop: 14 }]}>{t('banda.observacaoOpcional')}</Text>
              <TextInput style={md.input} placeholder={t('banda.observacaoPlaceholder')} placeholderTextColor={C.textDim} value={observacao} onChangeText={setObservacao} />

              <SetlistEditor entries={entries} setEntries={setEntries} songs={songs} versoes={versoes} />
            </ScrollView>
            <TouchableOpacity style={md.publicarRow} onPress={() => setPublicado(v => !v)} activeOpacity={0.7}>
              <Ionicons name={publicado ? 'eye-outline' : 'eye-off-outline'} size={18} color={publicado ? C.accent : C.gold} />
              <View style={{ flex: 1 }}>
                <Text style={md.publicarTitulo}>{publicado ? t('banda.publicarAgora') : t('banda.salvarComoRascunho')}</Text>
                <Text style={md.publicarDesc}>{publicado ? t('banda.publicarAgoraDesc') : t('banda.salvarComoRascunhoDesc')}</Text>
              </View>
              <View style={[md.publicarSwitch, publicado && md.publicarSwitchOn]}>
                <View style={[md.publicarKnob, publicado && md.publicarKnobOn]} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[md.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.onPrimary} /> : <><Ionicons name="save-outline" size={18} color={C.onPrimary} /><Text style={md.saveBtnText}>{t('banda.salvarEnsaio')}</Text></>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Editar setlist de um culto/ensaio que já existe ──────────────────────────
// Antes só dava pra montar o setlist na criação: depois de salvo, mudar a
// ordem, tirar ou acrescentar uma música exigia apagar o culto inteiro e
// refazer — perdendo escala, presenças, comentários e a ordem do culto junto.
function EditarSetlistModal({ alvo, songs, versoes, onClose, onSalvo }: {
  alvo: { tipo: 'culto' | 'ensaio'; eventoId: string; label: string; entries: CultoSongEntry[] } | null;
  songs: Song[]; versoes: SongVersao[];
  onClose: () => void; onSalvo: () => void;
}) {
  const { C, md } = useBandaTema();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<CultoSongEntry[]>([]);
  const [saving, setSaving] = useState(false);

  // Recarrega a cada abertura: o setlist pode ter mudado no banco desde a
  // última vez que este modal esteve aberto nesta sessão.
  useEffect(() => { setEntries(alvo ? alvo.entries.map(e => ({ ...e })) : []); }, [alvo]);

  const handleSave = async () => {
    if (!alvo) return;
    if (entries.length === 0) { Alert.alert(t('common.atencao'), t('banda.selecioneUmaMusica')); return; }
    const tabela = alvo.tipo === 'culto' ? 'culto_songs' : 'ensaio_songs';
    const chave = alvo.tipo === 'culto' ? 'culto_id' : 'ensaio_id';

    // Apaga tudo e reinsere, em vez de calcular o que mudou linha a linha.
    // Motivo: um UPDATE linha a linha de `order_index` esbarraria numa
    // restrição de unicidade (evento, posição) caso ela exista — e essas
    // tabelas foram criadas fora das migrações, então não dá pra confirmar
    // pelo repositório. Reinserir do zero funciona com ou sem a restrição.
    // O `nota` de cada música viaja na própria entrada, então sobrevive.
    setSaving(true);
    const antigas = alvo.entries.map(e => ({
      [chave]: alvo.eventoId, song_id: e.song_id, song_key: e.song_key,
      bpm: Number(e.bpm) || 0, order_index: e.order_index,
      nota: e.nota ?? null, versao_id: e.versao_id ?? null,
    }));
    const novas = entries.map((e, i) => ({
      [chave]: alvo.eventoId, song_id: e.song_id, song_key: e.song_key,
      bpm: Number(e.bpm) || 0, order_index: i,
      nota: e.nota ?? null, versao_id: e.versao_id ?? null,
    }));

    const { error: delErro } = await supabase.from(tabela).delete().eq(chave, alvo.eventoId);
    if (delErro) { setSaving(false); Alert.alert(t('common.erro'), delErro.message); return; }

    const { error: insErro } = await supabase.from(tabela).insert(novas);
    if (insErro) {
      // Sem transação no cliente: se a reinserção falhar, o setlist teria
      // sumido. Devolve o que estava antes e conta o que aconteceu.
      await supabase.from(tabela).insert(antigas);
      setSaving(false);
      Alert.alert(t('banda.erroSalvarMusicas'), insErro.message);
      return;
    }
    setSaving(false);
    onSalvo(); onClose();
  };

  return (
    <Modal visible={!!alvo} animationType="slide" transparent onRequestClose={onClose}>
      <View style={md.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={md.sheet}>
            <View style={md.header}>
              <Text style={md.title}>{t('banda.editarSetlist')}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>
            <Text style={md.setlistSubtitulo}>{alvo?.label}</Text>
            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <SetlistEditor entries={entries} setEntries={setEntries} songs={songs} versoes={versoes} />
            </ScrollView>
            <TouchableOpacity style={[md.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.onPrimary} /> : <><Ionicons name="save-outline" size={18} color={C.onPrimary} /><Text style={md.saveBtnText}>{t('banda.salvarAlteracoes')}</Text></>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Adicionar à Escala Modal ─────────────────────────────────────────────────
// Usado tanto em Cultos quanto em Ensaios (props `tipo`/`eventoId` decidem a
// tabela certa) — escolhe uma pessoa do diretório da banda e o instrumento
// que ela vai tocar naquele culto/ensaio específico.
function EscalaModal({ visible, onClose, onSaved, membros, tipo, eventoId, times, escalaAtual, indisponiveis, onTimesMudaram, funcoes, membroFuncoes }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
  membros: BandaMembro[]; tipo: 'culto' | 'ensaio'; eventoId: string;
  times: BandaTime[]; escalaAtual: EscalaEntry[]; indisponiveis: string[];
  onTimesMudaram: () => void;
  funcoes: BandaFuncao[]; membroFuncoes: MembroFuncao[];
}) {
  const { C, md, s } = useBandaTema();
  const { t } = useTranslation();
  const [membroId, setMembroId] = useState('');
  const [funcaoSel, setFuncaoSel] = useState('');
  const [outroAberto, setOutroAberto] = useState(false);
  const [outroTexto, setOutroTexto] = useState('');
  const [saving, setSaving] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [nomeNovoTime, setNomeNovoTime] = useState('');

  useEffect(() => {
    if (!visible) { setMembroId(''); setFuncaoSel(''); setOutroAberto(false); setOutroTexto(''); setNomeNovoTime(''); }
  }, [visible]);

  // As funções que a pessoa realmente exerce vêm primeiro e separadas do resto:
  // escalar o baterista no violino continua possível (banda pequena improvisa),
  // mas deixa de ser o caminho de menor esforço.
  const funcoesDoMembro = useMemo(() => {
    if (!membroId) return [] as BandaFuncao[];
    const meus = new Set(membroFuncoes.filter(mf => mf.membro_id === membroId).map(mf => mf.funcao_id));
    return funcoes.filter(f => meus.has(f.id));
  }, [membroId, membroFuncoes, funcoes]);
  const temFuncoesProprias = funcoesDoMembro.length > 0;
  const outrasFuncoes = funcoes.filter(f => !funcoesDoMembro.some(x => x.id === f.id));
  const foraDasFuncoes = temFuncoesProprias && !!funcaoSel && !funcoesDoMembro.some(f => f.nome === funcaoSel);
  const nomeDoMembro = membros.find(m => m.id === membroId)?.nome ?? '';

  const tabelaEscala = tipo === 'culto' ? 'culto_escala' : 'ensaio_escala';
  const campoEvento = tipo === 'culto' ? 'culto_id' : 'ensaio_id';

  // Aplica uma formação salva de uma vez. Quem já está escalado com aquele
  // instrumento é ignorado — a constraint única do banco recusaria a linha
  // repetida e derrubaria o lote inteiro.
  const aplicarTime = async (time: BandaTime) => {
    if (aplicando) return;
    if (!time.membros.length) { Alert.alert(t('banda.times'), t('banda.timeVazio')); return; }
    const novos = time.membros.filter(tm =>
      !escalaAtual.some(e => e.membro_id === tm.membro_id && e.instrumento === tm.instrumento));
    if (!novos.length) { Alert.alert(t('banda.times'), t('banda.timeJaAplicado')); return; }
    setAplicando(true);
    // upsert com ignoreDuplicates em vez de insert: `escalaAtual` é o retrato
    // do último fetch, então se outro líder escalou alguém pelo celular dele
    // no meio do caminho, um insert comum violaria a constraint única e
    // derrubaria o time inteiro — ninguém entraria.
    const { error } = await supabase.from(tabelaEscala).upsert(
      novos.map(tm => ({ [campoEvento]: eventoId, membro_id: tm.membro_id, instrumento: tm.instrumento })),
      { onConflict: `${campoEvento},membro_id,instrumento`, ignoreDuplicates: true });
    setAplicando(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onSaved(); onClose();
  };

  // Salva a escala montada agora como uma formação reutilizável.
  const [salvandoTime, setSalvandoTime] = useState(false);

  const salvarComoTime = async () => {
    const nome = nomeNovoTime.trim();
    if (!nome || !escalaAtual.length || salvandoTime) return;
    setSalvandoTime(true);
    const { data, error } = await supabase.from('banda_times').insert({ nome }).select().single();
    if (error || !data) { setSalvandoTime(false); Alert.alert(t('common.erro'), error?.message ?? ''); return; }

    const { error: erroMembros } = await supabase.from('banda_time_membros').insert(
      escalaAtual.map(e => ({ time_id: data.id, membro_id: e.membro_id, instrumento: e.instrumento })));
    setSalvandoTime(false);
    if (erroMembros) {
      // Sem isto, o time ficaria salvo e vazio pra sempre — e ao ser aplicado
      // diria "todos já estão na escala", que é exatamente a mensagem errada.
      await supabase.from('banda_times').delete().eq('id', data.id);
      Alert.alert(t('common.erro'), erroMembros.message);
      return;
    }
    setNomeNovoTime('');
    onTimesMudaram();
    Alert.alert(t('banda.times'), t('banda.timeSalvo', { nome }));
  };

  const apagarTime = (time: BandaTime) => {
    Alert.alert(time.nome, t('banda.apagarTimeMsg'), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('common.remover'), style: 'destructive', onPress: async () => {
        await supabase.from('banda_times').delete().eq('id', time.id);
        onTimesMudaram();
      }},
    ]);
  };

  const handleSave = async () => {
    const instrumentoFinal = outroAberto ? outroTexto.trim() : funcaoSel;
    if (!membroId || !instrumentoFinal) { Alert.alert(t('common.atencao'), t('banda.selecioneMembro')); return; }
    setSaving(true);
    const table = tipo === 'culto' ? 'culto_escala' : 'ensaio_escala';
    const idField = tipo === 'culto' ? 'culto_id' : 'ensaio_id';
    const { error } = await supabase.from(table).insert({ [idField]: eventoId, membro_id: membroId, instrumento: instrumentoFinal });
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onSaved(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={md.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={md.sheet}>
            <View style={md.header}>
              <Text style={md.title}>{t('banda.adicionarNaEscala')}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Quem avisou que não pode neste dia */}
              {indisponiveis.length > 0 && (
                <View style={md.avisoIndisp}>
                  <Ionicons name="alert-circle-outline" size={15} color={C.gold} />
                  <Text style={md.avisoIndispText}>
                    {t('banda.avisoIndisponiveis', { nomes: indisponiveis.join(', ') })}
                  </Text>
                </View>
              )}

              {/* Formações salvas */}
              {times.length > 0 && (
                <>
                  <Text style={md.label}>{t('banda.times')}</Text>
                  <Text style={md.timesDica}>{t('banda.timesDica')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {times.map(time => (
                      <TouchableOpacity
                        key={time.id}
                        style={[s.pill, aplicando && { opacity: 0.6 }]}
                        onPress={() => aplicarTime(time)}
                        onLongPress={() => apagarTime(time)}
                        disabled={aplicando}
                      >
                        <Text style={s.pillText}>{time.nome} · {time.membros.length}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Salvar a escala atual como formação */}
              {escalaAtual.length > 0 && (
                <View style={md.salvarTimeRow}>
                  <TextInput
                    style={[md.input, { flex: 1, marginBottom: 0 }]}
                    placeholder={t('banda.nomeDoTime')}
                    placeholderTextColor={C.textDim}
                    value={nomeNovoTime}
                    onChangeText={setNomeNovoTime}
                    maxLength={60}
                  />
                  <TouchableOpacity
                    style={[md.salvarTimeBtn, (!nomeNovoTime.trim() || salvandoTime) && { opacity: 0.45 }]}
                    onPress={salvarComoTime}
                    disabled={!nomeNovoTime.trim() || salvandoTime}
                  >
                    {salvandoTime
                      ? <ActivityIndicator color={C.onPrimary} size="small" />
                      : <Ionicons name="bookmark-outline" size={17} color={C.onPrimary} />}
                  </TouchableOpacity>
                </View>
              )}

              <Text style={md.label}>{t('banda.pessoa')}</Text>
              {membros.length === 0 ? (
                <Text style={[s.emptyDesc, { textAlign: 'left', paddingTop: 0, marginBottom: 14 }]}>{t('banda.semMembrosNaBanda')}</Text>
              ) : (
                <View style={{ gap: 6, marginBottom: 16 }}>
                  {membros.map(m => {
                    const selected = membroId === m.id;
                    return (
                      <TouchableOpacity key={m.id} style={[md.songRow, selected && md.songRowSelected]} onPress={() => setMembroId(m.id)} activeOpacity={0.7}>
                        <View style={[md.keyPill, { backgroundColor: selected ? C.primaryDim : C.surfaceHigh }]}>
                          <Ionicons name="person" size={14} color={selected ? C.onPrimaryDim : C.textMuted} />
                        </View>
                        <Text style={[md.songTitle, selected && { color: C.text }]}>{m.nome}</Text>
                        <View style={[md.checkbox, selected && md.checkboxSelected]}>
                          {selected && <Ionicons name="checkmark" size={14} color={C.onPrimary} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={md.label}>{t('banda.escolherFuncao')}</Text>
              {temFuncoesProprias && (
                <>
                  <Text style={md.funcaoGrupo}>{t('banda.funcoesDe', { nome: nomeDoMembro })}</Text>
                  <View style={md.funcaoWrap}>
                    {funcoesDoMembro.map(f => (
                      <TouchableOpacity
                        key={f.id}
                        style={[s.pill, funcaoSel === f.nome && !outroAberto && s.pillActive]}
                        onPress={() => { setFuncaoSel(f.nome); setOutroAberto(false); }}
                      >
                        <Text style={[s.pillText, funcaoSel === f.nome && !outroAberto && s.pillTextActive]}>{f.emoji} {f.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              <Text style={md.funcaoGrupo}>{temFuncoesProprias ? t('banda.outrasFuncoes') : t('banda.todasAsFuncoes')}</Text>
              <View style={md.funcaoWrap}>
                {(temFuncoesProprias ? outrasFuncoes : funcoes).map(f => (
                  <TouchableOpacity
                    key={f.id}
                    style={[s.pill, funcaoSel === f.nome && !outroAberto && s.pillActive]}
                    onPress={() => { setFuncaoSel(f.nome); setOutroAberto(false); }}
                  >
                    <Text style={[s.pillText, funcaoSel === f.nome && !outroAberto && s.pillTextActive]}>{f.emoji} {f.nome}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[s.pill, outroAberto && s.pillActive]}
                  onPress={() => { setOutroAberto(true); setFuncaoSel(''); }}
                >
                  <Text style={[s.pillText, outroAberto && s.pillTextActive]}>＋ {t('banda.outraFuncao')}</Text>
                </TouchableOpacity>
              </View>
              {foraDasFuncoes && (
                <View style={md.avisoFuncaoRow}>
                  <Ionicons name="alert-circle-outline" size={14} color={C.gold} />
                  <Text style={md.avisoFuncaoTexto}>{t('banda.avisoForaDaFuncao', { nome: nomeDoMembro })}</Text>
                </View>
              )}
              {outroAberto && (
                <TextInput style={md.input} placeholder={t('banda.instrumentoPlaceholder')} placeholderTextColor={C.textDim} value={outroTexto} onChangeText={setOutroTexto} />
              )}
              <View style={{ height: 8 }} />
            </ScrollView>
            <TouchableOpacity style={[md.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.onPrimary} /> : <><Ionicons name="person-add-outline" size={18} color={C.onPrimary} /><Text style={md.saveBtnText}>{t('banda.salvarEscala')}</Text></>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Escala (lista de pessoas + instrumento) ─────────────────────────────────
// Reaproveitado em Hoje (só leitura), Cultos e Ensaios (com botão de remover).
function EscalaLista({ escala, membros, onRemover, funcoes }: {
  escala: EscalaEntry[]; membros: BandaMembro[]; onRemover?: (id: string) => void;
  funcoes?: BandaFuncao[];
}) {
  const { C, s } = useBandaTema();
  const { t } = useTranslation();
  if (escala.length === 0) {
    return <Text style={s.escalaVazia}>{t('banda.escalaVazia')}</Text>;
  }
  return (
    <>
      {escala.map(e => {
        const membro = membros.find(m => m.id === e.membro_id);
        // O emoji é procurado pelo NOME da função — linhas antigas de uma função
        // já renomeada simplesmente ficam sem emoji, em vez de sumirem.
        const emoji = funcoes?.find(f => f.nome === e.instrumento)?.emoji;
        return (
          <View key={e.id} style={s.escalaRow}>
            {membro?.avatar_url
              ? <Image source={{ uri: membro.avatar_url }} style={s.escalaAvatar} />
              : <Ionicons name="person-circle-outline" size={18} color={C.textMuted} />}
            <Text style={s.escalaNome} numberOfLines={1}>{membro?.nome ?? '—'}</Text>
            <View style={s.escalaInstChip}><Text style={s.escalaInstText}>{emoji ? `${emoji} ` : ''}{e.instrumento}</Text></View>
            {!!onRemover && (
              <TouchableOpacity onPress={() => onRemover(e.id)} hitSlop={6}>
                <Ionicons name="close-circle-outline" size={17} color={C.danger} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </>
  );
}

// ─── Funções de um integrante ────────────────────────────────────────────────
// Um toque no cartão da Equipe abre isto. Guardar quem toca o quê é o que
// permite a escala oferecer as funções certas primeiro — e o líder saber, sem
// abrir culto por culto, que só duas pessoas cobrem o baixo.
function MembroFuncoesModal({ membro, funcoes, membroFuncoes, onClose, onSaved }: {
  membro: BandaMembro | null; funcoes: BandaFuncao[]; membroFuncoes: MembroFuncao[];
  onClose: () => void; onSaved: () => void;
}) {
  const { C, md, s } = useBandaTema();
  const { t } = useTranslation();
  const [sel, setSel] = useState<string[]>([]);
  const [principal, setPrincipal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!membro) return;
    const meus = membroFuncoes.filter(mf => mf.membro_id === membro.id);
    setSel(meus.map(mf => mf.funcao_id));
    setPrincipal(meus.find(mf => mf.principal)?.funcao_id ?? null);
  }, [membro, membroFuncoes]);

  const alternar = (id: string) => {
    setSel(prev => {
      const tem = prev.includes(id);
      if (tem && principal === id) setPrincipal(null);
      return tem ? prev.filter(x => x !== id) : [...prev, id];
    });
  };

  const handleSave = async () => {
    if (!membro) return;
    setSaving(true);
    // Apaga e reescreve em vez de calcular o diff: são poucas linhas por pessoa
    // e o diff seria três consultas pra economizar uma.
    await supabase.from('banda_membro_funcoes').delete().eq('membro_id', membro.id);
    if (sel.length) {
      const { error } = await supabase.from('banda_membro_funcoes').insert(
        sel.map(funcao_id => ({ membro_id: membro.id, funcao_id, principal: funcao_id === principal })));
      if (error) { setSaving(false); Alert.alert(t('common.erro'), error.message); return; }
    }
    setSaving(false);
    onSaved(); onClose();
  };

  return (
    <Modal visible={!!membro} animationType="slide" transparent onRequestClose={onClose}>
      <View style={md.overlay}>
        <View style={md.sheet}>
          <View style={md.header}>
            <Text style={md.title} numberOfLines={1}>{membro?.nome ?? ''}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
          </View>
          <Text style={md.setlistSubtitulo}>{t('banda.marqueAsFuncoes')}</Text>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {funcoes.length === 0 ? (
              <Text style={md.setlistVazio}>{t('banda.semFuncoesCadastradas')}</Text>
            ) : funcoes.map(f => {
              const marcada = sel.includes(f.id);
              const ehPrincipal = principal === f.id;
              return (
                <View key={f.id} style={[md.songRow, marcada && { borderColor: C.primary }]}>
                  <TouchableOpacity style={md.funcaoLinhaToque} onPress={() => alternar(f.id)} activeOpacity={0.7}>
                    <Text style={md.funcaoEmoji}>{f.emoji}</Text>
                    <Text style={[md.songTitle, marcada && { color: C.text }]}>{f.nome}</Text>
                  </TouchableOpacity>
                  {/* A estrela só aparece no que está marcado: eleger como
                      principal algo que a pessoa nem exerce não quer dizer nada. */}
                  {marcada && (
                    <TouchableOpacity onPress={() => setPrincipal(ehPrincipal ? null : f.id)} hitSlop={8}>
                      <Ionicons name={ehPrincipal ? 'star' : 'star-outline'} size={18} color={ehPrincipal ? C.gold : C.textDim} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[md.checkbox, marcada && md.checkboxSelected]} onPress={() => alternar(f.id)}>
                    {marcada && <Ionicons name="checkmark" size={14} color={C.onPrimary} />}
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
          <Text style={s.hojeTipText}>{t('banda.dicaPrincipal')}</Text>
          <TouchableOpacity style={[md.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color={C.onPrimary} /> : <><Ionicons name="save-outline" size={18} color={C.onPrimary} /><Text style={md.saveBtnText}>{t('banda.salvarAlteracoes')}</Text></>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Catálogo de funções do ministério ───────────────────────────────────────
// Antes disto os instrumentos eram oito valores fixos no código: acrescentar
// "Mesa de som" exigia publicar uma versão do app.
function FuncoesModal({ visible, funcoes, onClose, onSaved }: {
  visible: boolean; funcoes: BandaFuncao[]; onClose: () => void; onSaved: () => void;
}) {
  const { C, md, s } = useBandaTema();
  const { t } = useTranslation();
  const [novoNome, setNovoNome] = useState('');
  const [novoEmoji, setNovoEmoji] = useState('🎵');
  const [editando, setEditando] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!visible) { setNovoNome(''); setNovoEmoji('🎵'); setEditando(null); }
  }, [visible]);

  const adicionar = async () => {
    const nome = novoNome.trim();
    if (!nome) return;
    setSalvando(true);
    // `ordem` vai pro fim da fila em passos de 10 pra sobrar espaço entre os
    // vizinhos quando alguém reordenar depois.
    const proxima = (funcoes[funcoes.length - 1]?.ordem ?? 0) + 10;
    const { error } = await supabase.from('banda_funcoes')
      .insert({ nome, emoji: novoEmoji.trim() || '🎵', ordem: proxima });
    setSalvando(false);
    if (error) {
      // O índice único é por nome minúsculo — vale avisar em vez de mostrar o
      // erro cru do Postgres.
      Alert.alert(t('common.erro'), error.code === '23505' ? t('banda.funcaoJaExiste') : error.message);
      return;
    }
    setNovoNome(''); setNovoEmoji('🎵');
    onSaved();
  };

  const salvarEdicao = async (f: BandaFuncao) => {
    const nome = editNome.trim();
    if (!nome) { setEditando(null); return; }
    const { error } = await supabase.from('banda_funcoes')
      .update({ nome, emoji: editEmoji.trim() || f.emoji }).eq('id', f.id);
    setEditando(null);
    if (error) { Alert.alert(t('common.erro'), error.code === '23505' ? t('banda.funcaoJaExiste') : error.message); return; }
    onSaved();
  };

  // Troca a `ordem` com o vizinho. Duas linhas alteradas, sem reindexar a lista
  // toda — o que também evita brigar com outro admin mexendo ao mesmo tempo.
  const mover = async (idx: number, delta: number) => {
    const alvo = funcoes[idx + delta];
    const atual = funcoes[idx];
    if (!alvo || !atual) return;
    await Promise.all([
      supabase.from('banda_funcoes').update({ ordem: alvo.ordem }).eq('id', atual.id),
      supabase.from('banda_funcoes').update({ ordem: atual.ordem }).eq('id', alvo.id),
    ]);
    onSaved();
  };

  const remover = (f: BandaFuncao) => {
    Alert.alert(t('banda.removerFuncao'), t('banda.removerFuncaoAviso', { nome: f.nome }), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('common.remover'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('banda_funcoes').delete().eq('id', f.id);
        if (error) { Alert.alert(t('common.erro'), error.message); return; }
        onSaved();
      }},
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={md.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={md.sheet}>
            <View style={md.header}>
              <Text style={md.title}>{t('banda.funcoes')}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>
            <Text style={md.setlistSubtitulo}>{t('banda.funcoesExplicacao')}</Text>

            <View style={md.novaFuncaoRow}>
              <TextInput
                style={md.emojiInput}
                value={novoEmoji}
                onChangeText={setNovoEmoji}
                maxLength={4}
                textAlign="center"
              />
              <TextInput
                style={[md.input, { flex: 1 }]}
                placeholder={t('banda.nomeDaFuncao')}
                placeholderTextColor={C.textDim}
                value={novoNome}
                onChangeText={setNovoNome}
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={adicionar}
              />
              <TouchableOpacity
                style={[md.salvarTimeBtn, (!novoNome.trim() || salvando) && { opacity: 0.45 }]}
                onPress={adicionar}
                disabled={!novoNome.trim() || salvando}
              >
                {salvando ? <ActivityIndicator color={C.onPrimary} size="small" /> : <Ionicons name="add" size={20} color={C.onPrimary} />}
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {funcoes.length === 0 ? (
                <Text style={md.setlistVazio}>{t('banda.semFuncoesCadastradas')}</Text>
              ) : funcoes.map((f, idx) => (
                <View key={f.id} style={md.songRow}>
                  {editando === f.id ? (
                    <>
                      <TextInput style={md.emojiInput} value={editEmoji} onChangeText={setEditEmoji} maxLength={4} textAlign="center" />
                      <TextInput
                        style={[md.input, { flex: 1 }]}
                        value={editNome}
                        onChangeText={setEditNome}
                        maxLength={40}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => salvarEdicao(f)}
                      />
                      <TouchableOpacity onPress={() => salvarEdicao(f)} hitSlop={8}>
                        <Ionicons name="checkmark-circle" size={22} color={C.primary} />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={md.funcaoLinhaToque}
                        onPress={() => { setEditando(f.id); setEditNome(f.nome); setEditEmoji(f.emoji); }}
                        activeOpacity={0.7}
                      >
                        <Text style={md.funcaoEmoji}>{f.emoji}</Text>
                        <Text style={md.songTitle}>{f.nome}</Text>
                        <Ionicons name="create-outline" size={13} color={C.textDim} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => mover(idx, -1)} disabled={idx === 0} hitSlop={6}>
                        <Ionicons name="chevron-up" size={16} color={idx === 0 ? C.textDim : C.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => mover(idx, 1)} disabled={idx === funcoes.length - 1} hitSlop={6}>
                        <Ionicons name="chevron-down" size={16} color={idx === funcoes.length - 1 ? C.textDim : C.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => remover(f)} hitSlop={6}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ))}
            </ScrollView>
            <Text style={s.hojeTipText}>{t('banda.dicaFuncaoEmEscalas')}</Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
// ─── Indisponibilidade ───────────────────────────────────────────────────────
// Calendário do mês onde cada um marca os dias em que não pode servir. Quem
// monta a escala vê isso antes de escalar, em vez de descobrir na véspera.
function IndisponibilidadeModal({ visible, onClose, indisponibilidades, membros, meuId, onAlternar }: {
  visible: boolean; onClose: () => void;
  indisponibilidades: Indisponibilidade[];
  membros: BandaMembro[];
  meuId?: string;
  onAlternar: (dia: string) => void;
}) {
  const { C, ind, nm } = useBandaTema();
  const { t, i18n } = useTranslation();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const meses = MONTHS_BY_LANG[i18n.language] ?? MONTHS_BY_LANG.pt;
  const celulas = gradeDoMes(ano, mes);
  // Uma linha por semana, em vez de uma grade única com `flexWrap`. Com
  // `width: ${100/7}%` cada célula fica com 14.285714285714286%, que o motor
  // de layout arredonda pra pixel físico — sete arredondamentos pra cima
  // estouram a largura do container por uma fração, e a 7ª célula (sábado)
  // cai pra linha de baixo. O efeito visível era a coluna de sábado vazia.
  // Com uma <View> por semana e `flex: 1` nas células cabem sempre
  // exatamente 7, sem depender de arredondamento — e alinham com as letras
  // do cabeçalho, que já usavam `flex: 1`.
  const semanas = useMemo(() => {
    const linhas: (string | null)[][] = [];
    for (let i = 0; i < celulas.length; i += 7) linhas.push(celulas.slice(i, i + 7));
    return linhas;
  }, [celulas]);
  const hojeISO = todayISO();

  // O modal fica montado o tempo todo (só o `visible` muda), então sem isto
  // ele reabriria no mês em que foi fechado — navegar até dezembro e voltar
  // uma hora depois pra marcar esta semana abria em dezembro.
  useEffect(() => {
    if (!visible) return;
    const agora = new Date();
    setAno(agora.getFullYear()); setMes(agora.getMonth());
  }, [visible]);

  const andarMes = (passo: number) => {
    const d = new Date(ano, mes + passo, 1);
    setAno(d.getFullYear()); setMes(d.getMonth());
  };

  const doDia = (dia: string) => indisponibilidades.filter(i => i.data === dia);
  const souEu = (dia: string) => doDia(dia).some(i => i.profile_id === meuId);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={nm.overlay}>
        <View style={[nm.sheet, { maxHeight: '92%' }]}>
          <View style={nm.header}>
            <Text style={nm.title}>{t('banda.indisponibilidade')}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
          </View>
          <Text style={ind.explicacao}>{t('banda.indisponibilidadeDesc')}</Text>

          <View style={ind.mesRow}>
            <TouchableOpacity onPress={() => andarMes(-1)} hitSlop={10}>
              <Ionicons name="chevron-back" size={20} color={C.textMuted} />
            </TouchableOpacity>
            <Text style={ind.mesTexto}>{meses[mes]} {ano}</Text>
            <TouchableOpacity onPress={() => andarMes(1)} hitSlop={10}>
              <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={ind.semanaRow}>
            {(DAYS_BY_LANG[i18n.language] ?? DAYS_BY_LANG.pt).map((d, i) => (
              <Text key={i} style={ind.semanaLabel}>{d.slice(0, 1)}</Text>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View>
              {semanas.map((semana, si) => (
              <View key={`s${si}`} style={ind.semana}>
              {semana.map((dia, i) => {
                if (!dia) return <View key={`v${i}`} style={ind.celulaVazia} />;
                const marcados = doDia(dia);
                const meu = souEu(dia);
                const passado = dia < hojeISO;
                return (
                  <TouchableOpacity
                    key={dia}
                    style={[ind.celula, meu && ind.celulaMinha, passado && { opacity: 0.35 }]}
                    onPress={() => !passado && onAlternar(dia)}
                    disabled={passado}
                    activeOpacity={0.7}
                  >
                    <Text style={[ind.celulaNum, meu && ind.celulaNumMinha, dia === hojeISO && ind.celulaHoje]}>
                      {Number(dia.slice(8))}
                    </Text>
                    {marcados.length > 0 && (
                      <View style={ind.pontos}>
                        {marcados.slice(0, 3).map(m => (
                          <View key={m.id} style={[ind.ponto, m.profile_id === meuId && ind.pontoMeu]} />
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
              </View>
              ))}
            </View>

            {/* Quem está fora, dia a dia */}
            {(() => {
              const doMes = indisponibilidades
                .filter(i => i.data.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}`) && i.data >= hojeISO)
                .sort((a, b) => a.data.localeCompare(b.data));
              if (!doMes.length) return <Text style={ind.vazio}>{t('banda.ninguemIndisponivel')}</Text>;
              return (
                <View style={{ marginTop: 18 }}>
                  <Text style={ind.listaTitulo}>{t('banda.quemEstaFora')}</Text>
                  {doMes.map(i => (
                    <View key={i.id} style={ind.listaRow}>
                      <Text style={ind.listaData}>{formatDateLabel(i.data, i18n.language)}</Text>
                      <Text style={ind.listaNome}>
                        {/* "Você" só pra mim mesmo. Um admin que nunca resgatou o
                            código da banda não está em `banda_membros`, e o
                            fallback antigo mostrava o dia dele como se fosse meu. */}
                        {membros.find(m => m.profile_id === i.profile_id)?.nome
                          ?? (i.profile_id === meuId ? t('banda.voce') : t('banda.outroMembro'))}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const buildInd = (C: BandaColors) => StyleSheet.create({
  explicacao: { fontSize: 12, color: C.textMuted, lineHeight: 17, marginBottom: 16 },
  mesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  mesTexto: { fontSize: 15, fontWeight: '700', color: C.text },
  semanaRow: { flexDirection: 'row', marginBottom: 6 },
  semanaLabel: { flex: 1, textAlign: 'center', fontSize: 10, color: C.textDim, fontWeight: '700' },
  semana: { flexDirection: 'row' },
  celula: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  celulaVazia: { flex: 1, aspectRatio: 1 },
  celulaMinha: { backgroundColor: C.dangerBg, borderWidth: 1, borderColor: C.danger },
  celulaNum: { fontSize: 13, color: C.text },
  celulaNumMinha: { color: C.dangerOn, fontWeight: '700' },
  celulaHoje: { color: C.gold, fontWeight: '800' },
  pontos: { flexDirection: 'row', gap: 2, marginTop: 3, height: 4 },
  ponto: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.textDim },
  pontoMeu: { backgroundColor: C.danger },
  vazio: { fontSize: 12, color: C.textDim, textAlign: 'center', marginTop: 20 },
  listaTitulo: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  listaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  listaData: { fontSize: 13, color: C.textMuted },
  listaNome: { fontSize: 13, color: C.text, fontWeight: '600' },
});

// ─── Relatórios ──────────────────────────────────────────────────────────────
// Duas perguntas que o líder faz toda semana: "a gente já não tocou isso
// domingo passado?" e "quem está sobrecarregado neste mês?". Tudo calculado
// do que já está no banco — nenhuma tabela nova.
function RelatoriosModal({ visible, onClose, cultos, ensaios, songs, membros }: {
  visible: boolean; onClose: () => void;
  cultos: Culto[]; ensaios: Ensaio[]; songs: Song[]; membros: BandaMembro[];
}) {
  const { C, ind, nm, rel } = useBandaTema();
  const { t, i18n } = useTranslation();
  const [aba, setAba] = useState<'musicas' | 'grade'>('musicas');
  const [dias, setDias] = useState(90);
  const hoje = new Date();
  const hojeStr = todayISO();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const meses = MONTHS_BY_LANG[i18n.language] ?? MONTHS_BY_LANG.pt;

  // Mesma razão do calendário: reabrir sempre no mês corrente e na primeira aba.
  useEffect(() => {
    if (!visible) return;
    const agora = new Date();
    setAno(agora.getFullYear()); setMes(agora.getMonth());
    setAba('musicas');
  }, [visible]);

  // ── Músicas mais tocadas ──
  const corte = (() => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const ranking = (() => {
    const contagem = new Map<string, number>();
    // Ensaio conta junto: uma música ensaiada três vezes também já está gasta.
    for (const ev of [...cultos, ...ensaios]) {
      // Teto em hoje: o culto de domingo que vem ainda não foi tocado, e
      // contá-lo faria a música sumir da lista de "não tocadas" justamente
      // quando o líder está decidindo o repertório.
      if (ev.date < corte || ev.date > hojeStr) continue;
      for (const e of ev.entries) contagem.set(e.song_id, (contagem.get(e.song_id) ?? 0) + 1);
    }
    return [...contagem.entries()]
      .map(([id, n]) => ({ song: songs.find(sg => sg.id === id), n }))
      .filter((r): r is { song: Song; n: number } => !!r.song)
      .sort((a, b) => b.n - a.n || a.song.title.localeCompare(b.song.title));
  })();
  const maxN = ranking[0]?.n ?? 1;

  // Músicas do repertório que não entraram em nada no período — o outro lado
  // útil do relatório: o que está encostado.
  const esquecidas = songs.filter(sg => sg.in_repertoire && !ranking.some(r => r.song.id === sg.id));

  // ── Grade do mês: instrumento × data ──
  const prefixoMes = `${ano}-${String(mes + 1).padStart(2, '0')}`;
  // Marca o tipo: culto e ensaio no mesmo dia viravam duas colunas "14"
  // idênticas, sem nada dizendo qual era qual.
  const idsDeEnsaio = new Set(ensaios.map(e => e.id));
  const eventosDoMes = [...cultos, ...ensaios]
    .filter(ev => ev.date.startsWith(prefixoMes))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Agrupa por nome normalizado. O instrumento é gravado já traduzido e o
  // campo "outro" é texto livre, então "Teclado", "Keyboard" e "teclado "
  // viravam três linhas separadas na grade. A primeira grafia encontrada é a
  // que aparece.
  const instrumentos = (() => {
    const porChave = new Map<string, string>();
    for (const ev of eventosDoMes) {
      for (const e of ev.escala) {
        const chave = e.instrumento.trim().toLowerCase();
        if (chave && !porChave.has(chave)) porChave.set(chave, e.instrumento.trim());
      }
    }
    return [...porChave.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  })();

  const andarMes = (passo: number) => {
    const d = new Date(ano, mes + passo, 1);
    setAno(d.getFullYear()); setMes(d.getMonth());
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={nm.overlay}>
        <View style={[nm.sheet, { maxHeight: '92%' }]}>
          <View style={nm.header}>
            <Text style={nm.title}>{t('banda.relatorios')}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
          </View>

          <View style={rel.abas}>
            {(['musicas', 'grade'] as const).map(a => (
              <TouchableOpacity key={a} style={[rel.aba, aba === a && rel.abaAtiva]} onPress={() => setAba(a)}>
                <Text style={[rel.abaTexto, aba === a && rel.abaTextoAtivo]}>
                  {a === 'musicas' ? t('banda.maisTocadas') : t('banda.gradeDoMes')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {aba === 'musicas' ? (
            <>
              <View style={rel.periodoRow}>
                {[30, 90, 365].map(d => (
                  <TouchableOpacity key={d} style={[rel.periodo, dias === d && rel.periodoAtivo]} onPress={() => setDias(d)}>
                    <Text style={[rel.periodoTexto, dias === d && rel.periodoTextoAtivo]}>
                      {d === 365 ? t('banda.periodoAno') : t('banda.periodoDias', { n: d })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {ranking.length === 0 ? (
                  <Text style={ind.vazio}>{t('banda.semDadosPeriodo')}</Text>
                ) : ranking.map((r, i) => (
                  <View key={r.song.id} style={rel.linha}>
                    <Text style={rel.posicao}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={rel.musicaTitulo} numberOfLines={1}>{r.song.title}</Text>
                      <Text style={rel.musicaArtista} numberOfLines={1}>{r.song.artist}</Text>
                      <View style={rel.barraFundo}>
                        <View style={[rel.barra, { width: `${Math.round((r.n / maxN) * 100)}%` }]} />
                      </View>
                    </View>
                    <Text style={rel.vezes}>{t('banda.vezes', { n: r.n })}</Text>
                  </View>
                ))}
                {esquecidas.length > 0 && (
                  <View style={{ marginTop: 22 }}>
                    <Text style={ind.listaTitulo}>{t('banda.naoTocadas', { n: esquecidas.length })}</Text>
                    <Text style={rel.esquecidasTexto}>
                      {esquecidas.slice(0, 25).map(sg => sg.title).join(' · ')}
                      {esquecidas.length > 25 ? ' …' : ''}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={ind.mesRow}>
                <TouchableOpacity onPress={() => andarMes(-1)} hitSlop={10}>
                  <Ionicons name="chevron-back" size={20} color={C.textMuted} />
                </TouchableOpacity>
                <Text style={ind.mesTexto}>{meses[mes]} {ano}</Text>
                <TouchableOpacity onPress={() => andarMes(1)} hitSlop={10}>
                  <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
                </TouchableOpacity>
              </View>
              {eventosDoMes.length === 0 ? (
                <Text style={ind.vazio}>{t('banda.semEventosNoMes')}</Text>
              ) : (
                // Rolagem horizontal: com muitos cultos no mês a grade passa da
                // largura da tela, e cortar coluna seria pior que rolar.
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View>
                    <View style={rel.gradeCabecalho}>
                      <View style={rel.gradeCanto} />
                      {eventosDoMes.map(ev => (
                        <View key={ev.id} style={rel.gradeColuna}>
                          <Text style={rel.gradeDia}>{Number(ev.date.slice(8))}</Text>
                          <Text style={rel.gradeTipo}>
                            {idsDeEnsaio.has(ev.id) ? t('banda.ensaioSingular') : t('banda.cultoSingular')}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                      {instrumentos.map(([chave, rotuloInst]) => (
                        <View key={chave} style={rel.gradeLinha}>
                          <View style={rel.gradeCanto}>
                            <Text style={rel.gradeInstrumento} numberOfLines={2}>{rotuloInst}</Text>
                          </View>
                          {eventosDoMes.map(ev => {
                            const quem = ev.escala
                              .filter(e => e.instrumento.trim().toLowerCase() === chave)
                              .map(e => membros.find(m => m.id === e.membro_id)?.nome ?? '?')
                              .map(n => n.split(' ')[0]);
                            return (
                              <View key={ev.id} style={rel.gradeColuna}>
                                {quem.length === 0 ? (
                                  <Text style={rel.gradeVazio}>—</Text>
                                ) : (
                                  <Text style={rel.gradeNome} numberOfLines={2}>{quem.join(', ')}</Text>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </ScrollView>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
const buildRel = (C: BandaColors) => StyleSheet.create({
  abas: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  aba: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  abaAtiva: { backgroundColor: C.primaryDim, borderColor: C.primary },
  abaTexto: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  abaTextoAtivo: { color: C.onPrimaryDim },
  periodoRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  periodo: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border },
  periodoAtivo: { backgroundColor: C.primaryDim, borderColor: C.primary },
  periodoTexto: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  periodoTextoAtivo: { color: C.onPrimaryDim },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  posicao: { width: 22, fontSize: 12, fontWeight: '800', color: C.textDim, textAlign: 'center' },
  musicaTitulo: { fontSize: 13, color: C.text, fontWeight: '600' },
  musicaArtista: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  barraFundo: { height: 4, borderRadius: 2, backgroundColor: C.surfaceHigh, marginTop: 6, overflow: 'hidden' },
  barra: { height: 4, borderRadius: 2, backgroundColor: C.primary },
  vezes: { fontSize: 12, fontWeight: '700', color: C.textMuted, minWidth: 34, textAlign: 'right' },
  esquecidasTexto: { fontSize: 12, color: C.textDim, lineHeight: 18 },
  gradeCabecalho: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 6 },
  gradeLinha: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border, minHeight: 42 },
  gradeCanto: { width: 92, paddingRight: 8, justifyContent: 'center' },
  gradeColuna: { width: 74, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  gradeDia: { fontSize: 12, fontWeight: '800', color: C.textMuted },
  gradeTipo: { fontSize: 8.5, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
  gradeInstrumento: { fontSize: 11, color: C.text, fontWeight: '600' },
  gradeNome: { fontSize: 10.5, color: C.text, textAlign: 'center' },
  gradeVazio: { fontSize: 12, color: C.textDim },
});

// ─── Nota da música no evento ────────────────────────────────────────────────
// O recado que hoje se perde no chat: "entrar direto no refrão", "sem bateria
// na primeira estrofe". Fica preso à música DAQUELE culto, não ao repertório.
function NotaMusicaModal({ alvo, onClose, onSalvo }: {
  alvo: { tipo: 'culto' | 'ensaio'; eventoId: string; songId: string; titulo: string; nota: string } | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const { C, nm } = useBandaTema();
  const { t } = useTranslation();
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setTexto(alvo?.nota ?? ''); }, [alvo]);

  const salvar = async () => {
    if (!alvo || salvando) return;
    setSalvando(true);
    const tabela = alvo.tipo === 'culto' ? 'culto_songs' : 'ensaio_songs';
    const coluna = alvo.tipo === 'culto' ? 'culto_id' : 'ensaio_id';
    const { error } = await supabase.from(tabela)
      .update({ nota: texto.trim() || null })
      .eq(coluna, alvo.eventoId).eq('song_id', alvo.songId);
    setSalvando(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onSalvo(); onClose();
  };

  return (
    <Modal visible={!!alvo} animationType="slide" transparent>
      <View style={nm.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={nm.sheet}>
            <View style={nm.header}>
              <Text style={nm.title} numberOfLines={1}>{alvo?.titulo ?? ''}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>
            <Text style={nm.fieldLabel}>{t('banda.notaDaMusica')}</Text>
            <TextInput
              style={[nm.fieldInput, { height: 100, textAlignVertical: 'top', paddingTop: 12 }]}
              placeholder={t('banda.notaPlaceholder')}
              placeholderTextColor={C.textDim}
              value={texto}
              onChangeText={setTexto}
              multiline
              maxLength={300}
            />
            <Text style={nm.fieldHint}>{t('banda.notaDica')}</Text>
            <TouchableOpacity style={[nm.saveBtn, salvando && { opacity: 0.7 }]} onPress={salvar} disabled={salvando} activeOpacity={0.85}>
              {salvando ? <ActivityIndicator color={C.onPrimary} /> : <><Ionicons name="checkmark-outline" size={18} color={C.onPrimary} /><Text style={nm.saveBtnText}>{t('banda.salvarAlteracoes')}</Text></>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Ordem do culto ──────────────────────────────────────────────────────────
// O que acontece no culto além das músicas: abertura, oração, avisos, oferta,
// pregação. Com a duração de cada parte, somada à das músicas, dá pra saber
// se o culto cabe no tempo antes de começar.
const ROADMAP_SUGESTOES = ['abertura', 'oracao', 'avisos', 'oferta', 'pregacao', 'ministracao'] as const;

function RoadmapItemModal({ visible, cultoId, onClose, onSalvo, proximoIndice }: {
  visible: boolean; cultoId: string; onClose: () => void; onSalvo: () => void; proximoIndice: number;
}) {
  const { C, nm, s } = useBandaTema();
  const { t } = useTranslation();
  const [titulo, setTitulo] = useState('');
  const [minutos, setMinutos] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (!visible) { setTitulo(''); setMinutos(''); } }, [visible]);

  const rotulo: Record<typeof ROADMAP_SUGESTOES[number], string> = {
    abertura: t('banda.itemAbertura'), oracao: t('banda.itemOracao'), avisos: t('banda.itemAvisos'),
    oferta: t('banda.itemOferta'), pregacao: t('banda.itemPregacao'), ministracao: t('banda.itemMinistracao'),
  };

  const salvar = async () => {
    const nome = titulo.trim();
    if (!nome || salvando) return;
    const min = Number(minutos);
    // O banco recusa acima de 6h (`culto_roadmap_duracao_segundos_check`). Sem
    // este aviso, digitar 400 minutos devolvia o erro cru do Postgres sem
    // ninguém ter como saber qual era o limite.
    if (min > 360) { Alert.alert(t('common.atencao'), t('banda.itemMinutosLimite')); return; }
    setSalvando(true);
    const { error } = await supabase.from('culto_roadmap').insert({
      culto_id: cultoId, titulo: nome,
      duracao_segundos: min > 0 ? Math.round(min * 60) : null,
      order_index: proximoIndice,
    });
    setSalvando(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onSalvo(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={nm.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={nm.sheet}>
            <View style={nm.header}>
              <Text style={nm.title}>{t('banda.novoItemDoCulto')}</Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {ROADMAP_SUGESTOES.map(sug => (
                <TouchableOpacity key={sug} style={s.pill} onPress={() => setTitulo(rotulo[sug])}>
                  <Text style={s.pillText}>{rotulo[sug]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={nm.fieldWrap}>
              <Text style={nm.fieldLabel}>{t('banda.itemTitulo')}</Text>
              <TextInput style={nm.fieldInput} placeholder={t('banda.itemTituloPlaceholder')} placeholderTextColor={C.textDim} value={titulo} onChangeText={setTitulo} maxLength={80} />
            </View>
            <View style={nm.fieldWrap}>
              <Text style={nm.fieldLabel}>{t('banda.itemMinutos')}</Text>
              <TextInput style={[nm.fieldInput, { width: 110 }]} placeholder="Ex: 10" placeholderTextColor={C.textDim} value={minutos} onChangeText={v => setMinutos(v.replace(/\D/g, ''))} keyboardType="numeric" maxLength={3} />
            </View>
            <TouchableOpacity style={[nm.saveBtn, (salvando || !titulo.trim()) && { opacity: 0.6 }]} onPress={salvar} disabled={salvando || !titulo.trim()} activeOpacity={0.85}>
              {salvando ? <ActivityIndicator color={C.onPrimary} /> : <><Ionicons name="add" size={18} color={C.onPrimary} /><Text style={nm.saveBtnText}>{t('banda.adicionarItem')}</Text></>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Comentários e histórico do culto ────────────────────────────────────────
// A conversa sobre o culto some no chat geral em dois dias. Aqui ela fica
// presa ao culto, junto do setlist, e ainda está lá no domingo de manhã. O
// histórico ao lado responde "quem me tirou da escala?" sem discussão.
function ComentariosModal({ culto, onClose, meuId, meuNome, souAdmin, nomePronto }: {
  culto: Culto | null; onClose: () => void;
  meuId?: string; meuNome: string; souAdmin: boolean; nomePronto: boolean;
}) {
  const { C, ind, nm, rel, s } = useBandaTema();
  const { t, i18n } = useTranslation();
  const [aba, setAba] = useState<'conversa' | 'historico'>('conversa');
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [historico, setHistorico] = useState<EscalaLog[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const listaRef = useRef<ScrollView>(null);

  const cultoId = culto?.id ?? '';

  const carregar = useCallback(async () => {
    if (!cultoId) return;
    setCarregando(true);
    const [{ data: coments }, { data: logs }] = await Promise.all([
      // DESC + reverse pelo mesmo motivo do chat: `limit` corta pelo começo da
      // ordenação, então pedir ascendente traria os comentários mais antigos.
      supabase.from('culto_comentarios').select('*').eq('culto_id', cultoId)
        .order('created_at', { ascending: false }).limit(200),
      supabase.from('banda_escala_log').select('*')
        .eq('tipo', 'culto').eq('evento_id', cultoId)
        .order('created_at', { ascending: false }).limit(100),
    ]);
    setComentarios(((coments ?? []) as Comentario[]).reverse());
    setHistorico((logs ?? []) as EscalaLog[]);
    setCarregando(false);
  }, [cultoId]);

  useEffect(() => {
    if (!culto) return;
    setAba('conversa');
    carregar();
    const canal = supabase
      .channel(`culto_comentarios_${cultoId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'culto_comentarios', filter: `culto_id=eq.${cultoId}` },
        payload => {
          const nova = payload.new as Comentario;
          setComentarios(prev => (prev.some(c => c.id === nova.id) ? prev : [...prev, nova]));
        })
      // Sem filtro no DELETE, de propósito: com a REPLICA IDENTITY padrão o
      // `old` de um DELETE traz só a chave primária, então `culto_id` nem vem
      // no payload e um filtro por ele nunca casaria — o comentário apagado
      // ficaria na tela dos outros até fechar e reabrir. É por isso que o chat
      // da banda também escuta sem filtro.
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'culto_comentarios' },
        payload => {
          const fora = payload.old as { id: string };
          setComentarios(prev => prev.filter(c => c.id !== fora.id));
        })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [culto, cultoId, carregar]);

  const enviar = async () => {
    const conteudo = texto.trim();
    // `autor_nome` fica gravado pra sempre na linha: enviar antes de o perfil
    // resolver gravaria o começo do e-mail como nome, sem UI pra corrigir.
    if (!conteudo || enviando || !meuId || !cultoId || !nomePronto) return;
    setEnviando(true);
    const { data, error } = await supabase.from('culto_comentarios')
      .insert({ culto_id: cultoId, autor_id: meuId, autor_nome: meuNome, texto: conteudo })
      .select().single();
    setEnviando(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    if (data) setComentarios(prev => (prev.some(c => c.id === (data as Comentario).id) ? prev : [...prev, data as Comentario]));
    setTexto('');
    setTimeout(() => listaRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const apagar = (c: Comentario) => {
    if (c.autor_id !== meuId && !souAdmin) return;
    Alert.alert(t('banda.apagarMensagem'), t('banda.apagarComentarioMsg'), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('common.remover'), style: 'destructive', onPress: async () => {
        setComentarios(prev => prev.filter(x => x.id !== c.id));
        const { error } = await supabase.from('culto_comentarios').delete().eq('id', c.id);
        // Sem isto, uma exclusão recusada pelo banco sumia da tela e voltava
        // sozinha no próximo carregamento, sem explicação nenhuma.
        if (error) { Alert.alert(t('common.erro'), error.message); carregar(); }
      }},
    ]);
  };

  return (
    <Modal visible={!!culto} animationType="slide" transparent onRequestClose={onClose}>
      <View style={nm.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={[nm.sheet, { maxHeight: '88%' }]}>
            <View style={nm.header}>
              <View style={{ flex: 1 }}>
                <Text style={nm.title} numberOfLines={1}>{culto?.label ?? ''}</Text>
                <Text style={ind.explicacao}>
                  {culto ? formatDateLabel(culto.date, i18n.language) : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>

            <View style={rel.abas}>
              {(['conversa', 'historico'] as const).map(a => (
                <TouchableOpacity key={a} style={[rel.aba, aba === a && rel.abaAtiva]} onPress={() => setAba(a)}>
                  <Text style={[rel.abaTexto, aba === a && rel.abaTextoAtivo]}>
                    {a === 'conversa' ? t('banda.conversa') : t('banda.historico')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {carregando ? (
              <View style={s.loadingWrap}><ActivityIndicator color={C.primary} /></View>
            ) : aba === 'conversa' ? (
              <>
                <ScrollView ref={listaRef} style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                  {comentarios.length === 0 ? (
                    <Text style={ind.vazio}>{t('banda.semComentarios')}</Text>
                  ) : comentarios.map(c => {
                    const meu = c.autor_id === meuId;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        activeOpacity={meu || souAdmin ? 0.7 : 1}
                        onLongPress={() => apagar(c)}
                        style={[s.bubble, meu && s.bubbleMine]}
                      >
                        {!meu && <Text style={s.bubbleAuthor}>{c.autor_nome}</Text>}
                        <Text style={[s.bubbleText, meu && s.bubbleTextMine]}>{c.texto}</Text>
                        <Text style={[s.bubbleTime, meu && s.bubbleTimeMine]}>{horaDaMensagem(c.created_at)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={[s.chatInput, { borderTopWidth: 0, paddingHorizontal: 0, backgroundColor: 'transparent' }]}>
                  <TextInput
                    style={s.chatField}
                    placeholder={t('banda.comentarPlaceholder')}
                    placeholderTextColor={C.textDim}
                    value={texto}
                    onChangeText={setTexto}
                    maxLength={600}
                    returnKeyType="send"
                    onSubmitEditing={enviar}
                  />
                  <TouchableOpacity
                    style={[s.sendBtn, (!texto.trim() || enviando || !nomePronto) && { opacity: 0.45 }]}
                    onPress={enviar}
                    disabled={!texto.trim() || enviando || !nomePronto}
                  >
                    {enviando ? <ActivityIndicator color={C.onPrimary} size="small" /> : <Ionicons name="send" size={18} color={C.onPrimary} />}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {historico.length === 0 ? (
                  <Text style={ind.vazio}>{t('banda.semHistorico')}</Text>
                ) : historico.map(h => (
                  <View key={h.id} style={ind.listaRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={ind.listaNome}>
                        {h.membro_nome} · {h.instrumento}
                      </Text>
                      <Text style={ind.listaData}>
                        {t(h.acao === 'adicionou' ? 'banda.logAdicionou' : 'banda.logRemoveu',
                          { autor: h.autor_nome || t('banda.alguem') })}
                      </Text>
                    </View>
                    <Text style={ind.listaData}>
                      {/* Data junto da hora: linhas de semanas diferentes
                          pareciam do mesmo dia mostrando só "9:12". */}
                      {rotuloDoDia(diaDaMensagem(h.created_at), todayISO(), i18n.language, t)}
                      {' · '}{horaDaMensagem(h.created_at)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Versões da música ───────────────────────────────────────────────────────
// Hoje o tom da banda é ajustado por culto e some ali: no culto seguinte
// alguém tem que lembrar de novo, e a cifra continua abrindo no tom do site.
// Uma versão é essa escolha com nome e memória.
function VersoesModal({ song, versoes, onClose, onMudou }: {
  song: Song | null; versoes: SongVersao[]; onClose: () => void; onMudou: () => void;
}) {
  const { C, ind, nm, vs } = useBandaTema();
  const { t } = useTranslation();
  const vazio = { nome: '', song_key: '', bpm: '', cifra_url: '', cifra_tom: '' };
  const [form, setForm] = useState(vazio);
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (!song) { setForm(vazio); setEditando(null); } }, [song]);

  const set = (campo: keyof typeof vazio) => (v: string) => setForm(p => ({ ...p, [campo]: v }));

  // Pré-preenche com o original: quase sempre a versão muda só o tom, e
  // redigitar título de cifra e BPM à toa é o tipo de atrito que faz ninguém usar.
  const começarNova = () => {
    if (!song) return;
    setEditando(null);
    setForm({
      nome: '', song_key: song.song_key ?? '',
      bpm: song.bpm ? String(song.bpm) : '',
      cifra_url: song.cifra_url ?? '', cifra_tom: song.cifra_tom ?? '',
    });
  };

  const editar = (v: SongVersao) => {
    setEditando(v.id);
    setForm({
      nome: v.nome, song_key: v.song_key ?? '',
      bpm: v.bpm ? String(v.bpm) : '',
      cifra_url: v.cifra_url ?? '', cifra_tom: v.cifra_tom ?? '',
    });
  };

  const salvar = async () => {
    if (!song || salvando) return;
    const nome = form.nome.trim();
    if (!nome) { Alert.alert(t('common.atencao'), t('banda.versaoPrecisaNome')); return; }
    const bpmNum = Number(form.bpm);
    setSalvando(true);
    const payload = {
      song_id: song.id, nome,
      song_key: form.song_key.trim().toUpperCase(),
      bpm: bpmNum > 0 && bpmNum < 400 ? bpmNum : null,
      cifra_url: normalizeUrl(form.cifra_url) || null,
      cifra_tom: form.cifra_tom.trim().toUpperCase() || null,
    };
    const { error } = editando
      ? await supabase.from('song_versoes').update(payload).eq('id', editando)
      : await supabase.from('song_versoes').insert(payload);
    setSalvando(false);
    if (error) {
      // O par (song_id, nome) é único: dois "Nossa versão" na mesma música
      // seriam impossíveis de distinguir no seletor do setlist.
      Alert.alert(t('common.erro'), error.code === '23505' ? t('banda.versaoNomeRepetido') : error.message);
      return;
    }
    setForm(vazio); setEditando(null);
    onMudou();
  };

  const apagar = (v: SongVersao) => {
    Alert.alert(v.nome, t('banda.apagarVersaoMsg'), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('common.remover'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('song_versoes').delete().eq('id', v.id);
        if (error) { Alert.alert(t('common.erro'), error.message); return; }
        if (editando === v.id) { setEditando(null); setForm(vazio); }
        onMudou();
      }},
    ]);
  };

  const minhas = versoes.filter(v => v.song_id === song?.id);

  return (
    <Modal visible={!!song} animationType="slide" transparent onRequestClose={onClose}>
      <View style={nm.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={[nm.sheet, { maxHeight: '90%' }]}>
            <View style={nm.header}>
              <View style={{ flex: 1 }}>
                <Text style={nm.title} numberOfLines={1}>{t('banda.versoes')}</Text>
                <Text style={ind.explicacao}>{song?.title ?? ''}</Text>
              </View>
              <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* O original nunca é uma linha no banco — aparece aqui só pra
                  deixar claro que ele continua existindo. */}
              <View style={vs.linha}>
                <View style={{ flex: 1 }}>
                  <Text style={vs.nome}>{t('banda.versaoOriginal')}</Text>
                  <Text style={vs.detalhe}>
                    {song?.song_key}{song?.bpm ? ` · ${song.bpm} BPM` : ''}
                  </Text>
                </View>
                <Ionicons name="lock-closed-outline" size={14} color={C.textDim} />
              </View>

              {minhas.map(v => (
                <View key={v.id} style={vs.linha}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => editar(v)} activeOpacity={0.7}>
                    <Text style={vs.nome}>{v.nome}</Text>
                    <Text style={vs.detalhe}>
                      {v.song_key || song?.song_key}{v.bpm ? ` · ${v.bpm} BPM` : ''}
                      {v.cifra_url ? ` · ${t('banda.comCifra')}` : ''}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => apagar(v)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={15} color={C.danger} />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={{ height: 18 }} />
              <Text style={nm.groupLabel}>
                {editando ? t('banda.editarVersao') : t('banda.novaVersao')}
              </Text>
              <View style={nm.fieldWrap}>
                <Text style={nm.fieldLabel}>{t('banda.versaoNome')}</Text>
                <TextInput style={nm.fieldInput} placeholder={t('banda.versaoNomePlaceholder')} placeholderTextColor={C.textDim} value={form.nome} onChangeText={set('nome')} maxLength={40} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <View style={nm.fieldWrap}>
                    <Text style={nm.fieldLabel}>{t('banda.tomLabel')}</Text>
                    <TextInput style={nm.fieldInput} placeholder="Ex: G" placeholderTextColor={C.textDim} value={form.song_key} onChangeText={v => set('song_key')(v.toUpperCase())} autoCapitalize="characters" maxLength={3} />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={nm.fieldWrap}>
                    <Text style={nm.fieldLabel}>BPM</Text>
                    <TextInput style={nm.fieldInput} placeholder="Ex: 72" placeholderTextColor={C.textDim} value={form.bpm} onChangeText={v => set('bpm')(v.replace(/\D/g, ''))} keyboardType="numeric" maxLength={3} />
                  </View>
                </View>
              </View>
              <View style={nm.fieldWrap}>
                <Text style={nm.fieldLabel}>{t('banda.linkCifraOpcional')}</Text>
                <TextInput style={nm.fieldInput} placeholder={t('banda.coleLinkCifra')} placeholderTextColor={C.textDim} value={form.cifra_url} onChangeText={set('cifra_url')} autoCorrect={false} autoCapitalize="none" keyboardType="url" />
              </View>
              {!!form.cifra_url.trim() && (
                <View style={nm.fieldWrap}>
                  <Text style={nm.fieldLabel}>{t('banda.tomDaCifra')}</Text>
                  <TextInput style={[nm.fieldInput, { width: 110 }]} placeholder="Ex: D" placeholderTextColor={C.textDim} value={form.cifra_tom} onChangeText={v => set('cifra_tom')(v.toUpperCase())} autoCapitalize="characters" maxLength={3} />
                </View>
              )}
              {!!editando && (
                <TouchableOpacity onPress={começarNova} style={{ paddingVertical: 8 }}>
                  <Text style={{ fontSize: 12, color: C.primary, fontWeight: '700' }}>{t('banda.criarOutraVersao')}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <TouchableOpacity style={[nm.saveBtn, (salvando || !form.nome.trim()) && { opacity: 0.6 }]} onPress={salvar} disabled={salvando || !form.nome.trim()} activeOpacity={0.85}>
              {salvando ? <ActivityIndicator color={C.onPrimary} /> : <><Ionicons name="checkmark-outline" size={18} color={C.onPrimary} /><Text style={nm.saveBtnText}>{editando ? t('banda.salvarAlteracoes') : t('banda.adicionarVersao')}</Text></>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
const buildVs = (C: BandaColors) => StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  nome: { fontSize: 14, color: C.text, fontWeight: '600' },
  detalhe: { fontSize: 11.5, color: C.textMuted, marginTop: 2 },
});

function BandaMain() {
  const { C, s } = useBandaTema();
  const { t, i18n } = useTranslation();
  // Precisa da conta logada pra saber quais mensagens do chat são minhas e
  // pra assinar o que eu mando.
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('hoje');
  const [songs, setSongs] = useState<Song[]>([]);
  const [cultos, setCultos] = useState<Culto[]>([]);
  const [ensaios, setEnsaios] = useState<Ensaio[]>([]);
  const [membros, setMembros] = useState<BandaMembro[]>([]);
  const [funcoes, setFuncoes] = useState<BandaFuncao[]>([]);
  const [membroFuncoes, setMembroFuncoes] = useState<MembroFuncao[]>([]);
  const [funcoesModal, setFuncoesModal] = useState(false);
  const [membroEditando, setMembroEditando] = useState<BandaMembro | null>(null);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [loadingCultos, setLoadingCultos] = useState(true);
  const [loadingEnsaios, setLoadingEnsaios] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCulto, setExpandedCulto] = useState<string | null>(null);
  const [expandedEnsaio, setExpandedEnsaio] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'repertoire'>('all');
  const [chatMsg, setChatMsg] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loadingChat, setLoadingChat] = useState(true);
  const [presencas, setPresencas] = useState<Presenca[]>([]);
  const [indisponibilidades, setIndisponibilidades] = useState<Indisponibilidade[]>([]);
  const [indispModal, setIndispModal] = useState(false);
  const [relatorioModal, setRelatorioModal] = useState(false);
  const [times, setTimes] = useState<BandaTime[]>([]);
  const [versoes, setVersoes] = useState<SongVersao[]>([]);
  const [versoesSong, setVersoesSong] = useState<Song | null>(null);
  // Qual música de qual evento está com a nota aberta pra edição.
  const [roadmapModal, setRoadmapModal] = useState<{ cultoId: string; proximo: number } | null>(null);
  const [setlistModal, setSetlistModal] = useState<
    { tipo: 'culto' | 'ensaio'; eventoId: string; label: string; entries: CultoSongEntry[] } | null
  >(null);
  const [comentariosCulto, setComentariosCulto] = useState<Culto | null>(null);
  const [metronomo, setMetronomo] = useState<{ bpm: number | null; titulo: string } | null>(null);
  const [notaModal, setNotaModal] = useState<
    { tipo: 'culto' | 'ensaio'; eventoId: string; songId: string; titulo: string; nota: string } | null
  >(null);
  // Nome e papel da própria conta. `autor_nome` fica gravado na mensagem pra
  // sempre, então não dá pra mandar antes de saber o nome de verdade — sem
  // isso, quem abrisse o chat com a rede lenta gravaria o começo do e-mail.
  const [meuPerfil, setMeuPerfil] = useState<{ nome: string; admin: boolean } | null>(null);
  const [enviandoChat, setEnviandoChat] = useState(false);
  const [cultosModal, setCultosModal] = useState(false);
  const [ensaioModal, setEnsaioModal] = useState(false);
  const [musicaModal, setMusicaModal] = useState(false);
  // Música sendo editada no modal — null significa "cadastrando uma nova".
  const [editSong, setEditSong] = useState<Song | null>(null);
  const [escalaModal, setEscalaModal] = useState<{ tipo: 'culto' | 'ensaio'; eventoId: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const today = todayISO();

  // ── Fetch songs ──────────────────────────────────────────────────────────────
  const fetchSongs = useCallback(async () => {
    const { data } = await supabase.from('songs').select('*').order('title');
    // Sanitiza o que já está no banco antes de usar: músicas cadastradas antes
    // desta correção podem ter a URL inteira salva no campo de ID (o extractor
    // antigo aceitava qualquer texto), o que montava um link quebrado. Se o
    // valor guardado não for um ID válido, ele vira '' e o botão passa a abrir
    // a busca — que sempre funciona.
    if (data) setSongs((data as Song[]).map(sg => ({
      ...sg,
      youtube_id: extractYoutubeId(sg.youtube_id ?? ''),
      spotify_id: extractSpotifyId(sg.spotify_id ?? ''),
    })));
    setLoadingSongs(false);
  }, []);

  // ── Fetch diretório da banda (pra montar a escala) ───────────────────────────
  // Catálogo de funções + quem exerce o quê. Duas consultas pequenas: a tabela
  // de ligação é minúscula (uma linha por pessoa/função), então trazer tudo de
  // uma vez sai mais barato do que consultar por integrante na hora de montar
  // cada cartão da Equipe.
  const fetchFuncoes = useCallback(async () => {
    const [{ data: cat }, { data: liga }] = await Promise.all([
      supabase.from('banda_funcoes').select('*').eq('ativo', true).order('ordem').order('nome'),
      supabase.from('banda_membro_funcoes').select('membro_id, funcao_id, principal'),
    ]);
    setFuncoes((cat ?? []) as BandaFuncao[]);
    setMembroFuncoes((liga ?? []) as MembroFuncao[]);
  }, []);

  const fetchMembros = useCallback(async () => {
    const { data } = await supabase.from('banda_membros').select('*').order('nome');
    if (data) setMembros(data as BandaMembro[]);
  }, []);

  // ── Chat da banda ───────────────────────────────────────────────────────────
  // Antes esta aba era decorativa: três mensagens fixas no código, que nunca
  // iam ao banco e sumiam ao fechar o app. Agora é a mesma mecânica que já
  // roda em produção no chat dos grupos (`components/GrupoChatModal.tsx`):
  // carrega o histórico uma vez e depois escuta o realtime do Postgres.
  const fetchChat = useCallback(async () => {
    // Ordem DESC + reverse: `limit` corta pelo começo da ordenação, então
    // pedir ascendente traria as 300 mensagens mais ANTIGAS e a conversa
    // pararia no meio assim que a banda passasse de 300 mensagens.
    const { data, error } = await supabase
      .from('banda_chat_mensagens')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (!error) setMessages(((data ?? []) as ChatMsg[]).reverse());
    setLoadingChat(false);
  }, []);

  // ── Confirmações de presença ────────────────────────────────────────────────
  // A tabela é pequena (uma linha por músico por evento respondido), então vale
  // mais trazer tudo de uma vez do que consultar culto a culto.
  const fetchPresencas = useCallback(async () => {
    const { data } = await supabase.from('banda_presenca').select('*');
    if (data) setPresencas(data as Presenca[]);
  }, []);

  const responderPresenca = async (
    tipo: 'culto' | 'ensaio', eventoId: string, status: 'confirmado' | 'ausente' | null,
  ) => {
    if (!user?.id) { Alert.alert(t('common.erro'), t('banda.chatPrecisaLogin')); return; }
    const anterior = presencas;
    // Responde na tela na hora; se o banco recusar, volta ao que estava.
    const semAMinha = presencas.filter(pr => !(pr.tipo === tipo && pr.evento_id === eventoId && pr.profile_id === user.id));
    setPresencas(status
      ? [...semAMinha, { id: `local-${eventoId}`, tipo, evento_id: eventoId, profile_id: user.id, status }]
      : semAMinha);

    const { error } = status
      ? await supabase.from('banda_presenca').upsert(
          { tipo, evento_id: eventoId, profile_id: user.id, status, updated_at: new Date().toISOString() },
          { onConflict: 'tipo,evento_id,profile_id' })
      : await supabase.from('banda_presenca').delete()
          .eq('tipo', tipo).eq('evento_id', eventoId).eq('profile_id', user.id);

    // Rollback só da própria linha: restaurar o array inteiro descartaria
    // respostas de outros músicos que tivessem chegado nesse meio-tempo.
    if (error) {
      setPresencas(prev => {
        const semAMinha2 = prev.filter(pr => !(pr.tipo === tipo && pr.evento_id === eventoId && pr.profile_id === user.id));
        const minhaAntes = anterior.find(pr => pr.tipo === tipo && pr.evento_id === eventoId && pr.profile_id === user.id);
        return minhaAntes ? [...semAMinha2, minhaAntes] : semAMinha2;
      });
      Alert.alert(t('common.erro'), error.message);
      return;
    }
    fetchPresencas();
  };

  const presencasDo = (tipo: 'culto' | 'ensaio', eventoId: string) =>
    presencas.filter(pr => pr.tipo === tipo && pr.evento_id === eventoId);

  // Quantas PESSOAS distintas estão na escala. A escala guarda uma linha por
  // pessoa+instrumento de propósito (a Ana pode estar como Teclado e como
  // Backing Vocal), enquanto a presença é uma resposta por pessoa — contar
  // linhas faria a tela cobrar resposta de gente que já respondeu.
  const pessoasNaEscala = (escala: EscalaEntry[]) => new Set(
    escala
      .map(e => membros.find(m => m.id === e.membro_id)?.profile_id)
      .filter((id): id is string => !!id),
  ).size;

  // ── Indisponibilidade ───────────────────────────────────────────────────────
  // Traz a partir de ontem: dias passados não servem pra nada e a lista
  // cresceria pra sempre.
  const fetchIndisponibilidades = useCallback(async () => {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const desde = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, '0')}-${String(ontem.getDate()).padStart(2, '0')}`;
    const { data } = await supabase
      .from('banda_indisponibilidade').select('*').gte('data', desde).order('data');
    if (data) setIndisponibilidades(data as Indisponibilidade[]);
  }, []);

  // Dias com toque em voo. Sem isto, marcar dez dias seguidos de viagem
  // rápido fazia o segundo toque no mesmo dia ver o estado antigo, mandar um
  // segundo insert e estourar a constraint única com erro cru do Postgres.
  const indispEmVoo = useRef<Set<string>>(new Set());

  const alternarIndisponibilidade = async (dia: string) => {
    if (!user?.id) { Alert.alert(t('common.erro'), t('banda.chatPrecisaLogin')); return; }
    if (indispEmVoo.current.has(dia)) return;
    indispEmVoo.current.add(dia);

    const existente = indisponibilidades.find(i => i.profile_id === user.id && i.data === dia);
    const anterior = indisponibilidades;
    // Pinta na hora: o calendário responde ao toque mesmo com a rede lenta.
    setIndisponibilidades(prev => existente
      ? prev.filter(i => i.id !== existente.id)
      : [...prev, { id: `local-${dia}`, profile_id: user.id, data: dia }]);

    const { error } = existente
      ? await supabase.from('banda_indisponibilidade').delete().eq('id', existente.id)
      : await supabase.from('banda_indisponibilidade').insert({ profile_id: user.id, data: dia });

    indispEmVoo.current.delete(dia);
    if (error) { setIndisponibilidades(anterior); Alert.alert(t('common.erro'), error.message); return; }
    fetchIndisponibilidades();
  };

  const minhasIndisponibilidades = indisponibilidades.filter(i => i.profile_id === user?.id);

  // Quem avisou que não pode servir num dia — usado pra avisar na hora de
  // montar a escala, que é o ponto da funcionalidade.
  const indisponiveisNoDia = (dia: string) => indisponibilidades
    .filter(i => i.data === dia)
    .map(i => membros.find(m => m.profile_id === i.profile_id)?.nome)
    .filter((n): n is string => !!n);

  const fetchVersoes = useCallback(async () => {
    const { data } = await supabase.from('song_versoes').select('*').order('nome');
    if (data) setVersoes(data as SongVersao[]);
  }, []);

  const fetchTimes = useCallback(async () => {
    const { data: timesData } = await supabase.from('banda_times').select('*').order('nome');
    if (!timesData) return;
    const { data: membrosData } = await supabase.from('banda_time_membros').select('*');
    setTimes(timesData.map((tm: any) => ({
      id: tm.id, nome: tm.nome,
      membros: (membrosData ?? []).filter((x: any) => x.time_id === tm.id)
        .map((x: any) => ({ membro_id: x.membro_id, instrumento: x.instrumento })),
    })));
  }, []);

  useEffect(() => { fetchPresencas(); fetchIndisponibilidades(); fetchTimes(); fetchVersoes(); }, [fetchPresencas, fetchIndisponibilidades, fetchTimes, fetchVersoes]);

  useEffect(() => {
    if (!user?.id) { setMeuPerfil(null); return; }
    let vivo = true;
    supabase.from('profiles').select('full_name, role').eq('id', user.id).single()
      .then(({ data }) => {
        if (!vivo) return;
        // Resolve mesmo sem nome cadastrado — o que importa é saber que a
        // consulta terminou, pra não travar o chat pra sempre.
        setMeuPerfil({ nome: (data?.full_name ?? '').trim(), admin: data?.role === 'admin' });
      });
    return () => { vivo = false; };
  }, [user?.id]);

  useEffect(() => {
    fetchChat();
    const channel = supabase
      .channel('banda_chat')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'banda_chat_mensagens' },
        payload => {
          const nova = payload.new as ChatMsg;
          // O próprio envio já inseriu a mensagem na lista local; sem esta
          // checagem ela apareceria duas vezes pra quem mandou.
          setMessages(prev => (prev.some(m => m.id === nova.id) ? prev : [...prev, nova]));
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'banda_chat_mensagens' },
        payload => {
          const removida = payload.old as { id: string };
          setMessages(prev => prev.filter(m => m.id !== removida.id));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchChat]);

  // ── Fetch cultos com músicas e escala ────────────────────────────────────────
  const fetchCultos = useCallback(async () => {
    const { data: cultosData } = await supabase
      .from('cultos').select('*').order('date', { ascending: false });
    if (!cultosData) { setLoadingCultos(false); setRefreshing(false); return; }

    const cultosWithEntries: Culto[] = await Promise.all(
      cultosData.map(async (culto: any) => {
        const [{ data: entriesData }, { data: escalaData }, { data: roadmapData }] = await Promise.all([
          supabase.from('culto_songs').select('*').eq('culto_id', culto.id).order('order_index'),
          supabase.from('culto_escala').select('*').eq('culto_id', culto.id),
          supabase.from('culto_roadmap').select('*').eq('culto_id', culto.id).order('order_index'),
        ]);
        return {
          id: culto.id, label: culto.label, date: culto.date,
          publicado: culto.publicado !== false,
          roadmap: (roadmapData ?? []).map((r: any) => ({
            id: r.id, titulo: r.titulo, descricao: r.descricao,
            duracao_segundos: r.duracao_segundos, order_index: r.order_index,
          })),
          entries: (entriesData ?? []).map((e: any) => ({
            song_id: e.song_id, song_key: e.song_key,
            bpm: String(e.bpm), order_index: e.order_index, nota: e.nota,
            versao_id: e.versao_id,
          })),
          escala: (escalaData ?? []).map((e: any) => ({
            id: e.id, membro_id: e.membro_id, instrumento: e.instrumento,
          })),
        };
      })
    );
    setCultos(cultosWithEntries);
    if (cultosWithEntries.length > 0) setExpandedCulto(cultosWithEntries[0].id);
    setLoadingCultos(false);
    setRefreshing(false);
  }, []);

  // ── Fetch ensaios com músicas e escala ───────────────────────────────────────
  const fetchEnsaios = useCallback(async () => {
    const { data: ensaiosData } = await supabase
      .from('ensaios').select('*').order('date', { ascending: true });
    if (!ensaiosData) { setLoadingEnsaios(false); return; }

    const ensaiosWithEntries: Ensaio[] = await Promise.all(
      ensaiosData.map(async (ensaio: any) => {
        const [{ data: entriesData }, { data: escalaData }] = await Promise.all([
          supabase.from('ensaio_songs').select('*').eq('ensaio_id', ensaio.id).order('order_index'),
          supabase.from('ensaio_escala').select('*').eq('ensaio_id', ensaio.id),
        ]);
        return {
          id: ensaio.id, label: ensaio.label, date: ensaio.date,
          time: ensaio.time ?? '', local: ensaio.local ?? '', observacao: ensaio.observacao ?? '',
          publicado: ensaio.publicado !== false,
          entries: (entriesData ?? []).map((e: any) => ({
            song_id: e.song_id, song_key: e.song_key,
            bpm: String(e.bpm), order_index: e.order_index, nota: e.nota,
            versao_id: e.versao_id,
          })),
          escala: (escalaData ?? []).map((e: any) => ({
            id: e.id, membro_id: e.membro_id, instrumento: e.instrumento,
          })),
        };
      })
    );
    setEnsaios(ensaiosWithEntries);
    if (ensaiosWithEntries.length > 0) setExpandedEnsaio(ensaiosWithEntries[0].id);
    setLoadingEnsaios(false);
  }, []);

  useEffect(() => { fetchSongs(); fetchCultos(); fetchEnsaios(); fetchMembros(); fetchFuncoes(); }, [fetchSongs, fetchCultos, fetchEnsaios, fetchMembros, fetchFuncoes]);

  const handleRefresh = () => { setRefreshing(true); fetchSongs(); fetchCultos(); fetchEnsaios(); fetchMembros(); fetchFuncoes(); fetchPresencas(); fetchIndisponibilidades(); fetchTimes(); fetchVersoes(); };

  const removerDaEscala = (tipo: 'culto' | 'ensaio', id: string) => {
    Alert.alert(t('banda.removerDaEscala'), t('banda.desejaRemoverDaEscala'), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('common.remover'), style: 'destructive', onPress: async () => {
        await supabase.from(tipo === 'culto' ? 'culto_escala' : 'ensaio_escala').delete().eq('id', id);
        tipo === 'culto' ? fetchCultos() : fetchEnsaios();
      }},
    ]);
  };

  const deleteCulto = (id: string) => {
    Alert.alert(t('banda.removerCulto'), t('banda.desejaRemoverCulto'), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('common.remover'), style: 'destructive', onPress: async () => {
        await supabase.from('cultos').delete().eq('id', id);
        fetchCultos();
      }},
    ]);
  };

  const deleteEnsaio = (id: string) => {
    Alert.alert(t('banda.removerEnsaio'), t('banda.desejaRemoverEnsaio'), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('common.remover'), style: 'destructive', onPress: async () => {
        await supabase.from('ensaios').delete().eq('id', id);
        fetchEnsaios();
      }},
    ]);
  };

  // Abre o destino já resolvido (link salvo ou busca do site). O guard de URL
  // vazia fica como rede de segurança: antes ele nunca disparava, porque
  // spotifyUrl('') devolvia "https://open.spotify.com/track/" — não vazio — e o
  // app abria uma página quebrada em vez de avisar que faltava o link.
  const openLink = (target: LinkTarget, label: string) => {
    if (!target?.url) { Alert.alert(t('banda.semLink'), t('banda.semLinkMsg', { label })); return; }
    Linking.openURL(target.url).catch(() => Alert.alert(t('common.erro'), t('banda.erroAbrirLink')));
  };

  // Abre o setlist inteiro como playlist do YouTube, na ordem do culto. Só
  // entram as músicas que têm vídeo cadastrado — as outras seriam buracos na
  // playlist.
  const abrirPlaylist = (entries: CultoSongEntry[]) => {
    const ids = entries
      .map(e => songs.find(sg => sg.id === e.song_id)?.youtube_id)
      .filter((id): id is string => !!id);
    const url = youtubePlaylistUrl(ids);
    if (!url) { Alert.alert(t('banda.semLink'), t('banda.semVideosNoSetlist')); return; }
    Linking.openURL(url).catch(() => Alert.alert(t('common.erro'), t('banda.erroAbrirLink')));
  };

  // A música como ela vai ser tocada: com a versão escolhida aplicada por cima
  // do original, pra que tom, BPM e os quatro links falem da versão certa.
  const musicaDaEntrada = (entry: CultoSongEntry): Song | null => {
    const song = songs.find(sg => sg.id === entry.song_id);
    if (!song) return null;
    const base = comVersao(song, entry.versao_id ? versoes.find(v => v.id === entry.versao_id) : null);
    // O tom gravado no evento é a última palavra: é ele que aparece no selo da
    // linha, e o botão da cifra tem que abrir nesse mesmo tom. Sem isto, o selo
    // dizia F# e a cifra abria em G.
    return entry.song_key ? { ...base, song_key: entry.song_key } : base;
  };

  const nomeDaVersao = (entry: CultoSongEntry) =>
    entry.versao_id ? versoes.find(v => v.id === entry.versao_id)?.nome ?? '' : '';

  const songsDoSetlist = (entries: CultoSongEntry[]) =>
    entries.map(musicaDaEntrada).filter((sg): sg is Song => !!sg);

  const removerItemRoadmap = (item: RoadmapItem) => {
    Alert.alert(item.titulo, t('banda.removerItemMsg'), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('common.remover'), style: 'destructive', onPress: async () => {
        await supabase.from('culto_roadmap').delete().eq('id', item.id);
        fetchCultos();
      }},
    ]);
  };

  // Tempo total do culto: as músicas mais os itens da ordem do culto.
  const totalDoCulto = (culto: Culto) => {
    const musicas = totalDoSetlist(songsDoSetlist(culto.entries));
    const itens = culto.roadmap.reduce((soma, r) => soma + (r.duracao_segundos ?? 0), 0);
    return { segundos: musicas.segundos + itens, semDuracao: musicas.semDuracao };
  };

  // Abre o calendário do celular já com o evento preenchido. A duração vem do
  // tempo real do culto quando ele existe; senão, um padrão razoável.
  const abrirAgenda = (
    titulo: string, data: string, hora: string, duracaoMin: number, detalhes: string, local: string,
  ) => {
    const url = googleAgendaUrl(titulo, data, hora, duracaoMin, detalhes, local);
    if (!url) { Alert.alert(t('common.erro'), t('banda.erroAbrirLink')); return; }
    Linking.openURL(url).catch(() => Alert.alert(t('common.erro'), t('banda.erroAbrirLink')));
  };

  const abrirNovaMusica = () => { setEditSong(null); setMusicaModal(true); };
  const abrirEditarMusica = (song: Song) => { setEditSong(song); setMusicaModal(true); };
  const fecharMusicaModal = () => { setMusicaModal(false); setEditSong(null); };

  // Nome que aparece na mensagem. Vem do diretório da banda, que já está
  // carregado na tela — evita uma consulta a `profiles` só pra isso.
  const meuNome = meuPerfil?.nome
    || membros.find(m => m.profile_id === user?.id)?.nome
    || user?.email?.split('@')[0]
    || t('banda.voce');
  // Só libera o envio depois que a consulta ao perfil voltou (ou que o
  // diretório da banda chegou), pra não gravar um nome provisório no banco.
  const nomePronto = meuPerfil !== null || membros.length > 0;

  const sendMessage = async () => {
    const texto = chatMsg.trim();
    if (!texto || enviandoChat) return;
    if (!user?.id) { Alert.alert(t('common.erro'), t('banda.chatPrecisaLogin')); return; }
    setEnviandoChat(true);
    const { data, error } = await supabase
      .from('banda_chat_mensagens')
      .insert({ autor_id: user.id, autor_nome: meuNome, texto })
      .select()
      .single();
    setEnviandoChat(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    // Aparece na hora pra quem mandou, sem esperar o realtime dar a volta.
    if (data) setMessages(prev => (prev.some(m => m.id === (data as ChatMsg).id) ? prev : [...prev, data as ChatMsg]));
    setChatMsg('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Segurar a própria mensagem apaga. A policy do banco só deixa apagar a
  // própria (ou qualquer uma, se for admin).
  const apagarMensagem = (msg: ChatMsg) => {
    // A policy do banco deixa o autor apagar a própria e o admin apagar
    // qualquer uma — a tela precisa oferecer as duas coisas, senão moderar só
    // pelo painel do Supabase.
    if (msg.autor_id !== user?.id && !meuPerfil?.admin) return;
    Alert.alert(t('banda.apagarMensagem'), t('banda.apagarMensagemMsg'), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('common.remover'), style: 'destructive', onPress: async () => {
        setMessages(prev => prev.filter(m => m.id !== msg.id));
        await supabase.from('banda_chat_mensagens').delete().eq('id', msg.id);
      }},
    ]);
  };

  // Rascunho fica escondido de quem não é admin. Vale repetir o que a migração
  // já diz: é filtro de tela, não barreira de segurança — serve pra ninguém ver
  // escala pela metade, não pra guardar segredo.
  // Quantas vezes cada um serviu nos últimos 90 dias, e em que função mais
  // aparece. Sai de graça do que já está na memória: cultos e ensaios chegam
  // com a escala junto, então não custa nenhuma consulta a mais.
  const escalasPorMembro = useMemo(() => {
    const limite = new Date();
    limite.setDate(limite.getDate() - 90);
    const limiteISO = limite.toISOString().slice(0, 10);
    const mapa = new Map<string, { total: number; maisFrequente: string }>();
    const contagem = new Map<string, Map<string, number>>();

    const somar = (escala: EscalaEntry[], date: string) => {
      if (date < limiteISO) return;
      escala.forEach(e => {
        const atual = mapa.get(e.membro_id) ?? { total: 0, maisFrequente: '' };
        mapa.set(e.membro_id, { ...atual, total: atual.total + 1 });
        const porFuncao = contagem.get(e.membro_id) ?? new Map<string, number>();
        porFuncao.set(e.instrumento, (porFuncao.get(e.instrumento) ?? 0) + 1);
        contagem.set(e.membro_id, porFuncao);
      });
    };
    cultos.forEach(c => somar(c.escala, c.date));
    ensaios.forEach(e => somar(e.escala, e.date));

    contagem.forEach((porFuncao, membroId) => {
      const top = [...porFuncao.entries()].sort((a, b) => b[1] - a[1])[0];
      const atual = mapa.get(membroId);
      if (atual && top) mapa.set(membroId, { ...atual, maisFrequente: top[0] });
    });
    return mapa;
  }, [cultos, ensaios]);

  const podeVerRascunho = !!meuPerfil?.admin;
  const cultosVisiveis = cultos.filter(c => c.publicado || podeVerRascunho);
  const ensaiosVisiveis = ensaios.filter(e => e.publicado || podeVerRascunho);

  const alternarPublicado = async (tipo: 'culto' | 'ensaio', id: string, publicado: boolean) => {
    const tabela = tipo === 'culto' ? 'cultos' : 'ensaios';
    const { error } = await supabase.from(tabela).update({ publicado }).eq('id', id);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    tipo === 'culto' ? fetchCultos() : fetchEnsaios();
  };

  const cultoDoDia = cultosVisiveis.find(c => c.date === today) ?? cultosVisiveis[0] ?? null;
  const filteredSongs = filter === 'repertoire' ? songs.filter(sg => sg.in_repertoire) : songs;

  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'hoje', icon: 'sunny-outline', label: t('banda.tabHoje') },
    { id: 'repertorio', icon: 'musical-notes-outline', label: t('banda.tabRepertorio') },
    { id: 'cultos', icon: 'mic-outline', label: t('banda.tabCultos') },
    { id: 'ensaios', icon: 'calendar-outline', label: t('banda.tabEnsaios') },
    { id: 'equipe', icon: 'people-outline', label: t('banda.tabEquipe') },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle={C.statusBar} backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>{t('banda.titulo')}</Text>
          <Text style={s.headerSub}>{t('banda.subtitulo')}</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.headerIconBtn} onPress={() => setIndispModal(true)} hitSlop={6}>
            <Ionicons name="calendar-outline" size={18} color={C.textMuted} />
            {minhasIndisponibilidades.length > 0 && (
              <View style={s.headerBadge}><Text style={s.headerBadgeText}>{minhasIndisponibilidades.length}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.headerIconBtn} onPress={() => setRelatorioModal(true)} hitSlop={6}>
            <Ionicons name="bar-chart-outline" size={18} color={C.textMuted} />
          </TouchableOpacity>
          {/* O Chat saiu das abas pro cabeçalho: com seis abas os ícones
              ficavam miúdos demais, e o chat é o único que não é "uma visão do
              domingo" — é conversa, entra e sai. Fica aceso quando é a tela
              ativa, já que a barra de abas não tem mais como indicar isso. */}
          <TouchableOpacity
            style={[s.headerIconBtn, activeTab === 'chat' && s.headerIconBtnAtivo]}
            onPress={() => setActiveTab(activeTab === 'chat' ? 'hoje' : 'chat')}
            hitSlop={6}
          >
            <Ionicons name="chatbubbles-outline" size={18} color={activeTab === 'chat' ? C.onPrimaryDim : C.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.id} style={[s.tabItem, activeTab === tab.id && s.tabItemActive]} onPress={() => setActiveTab(tab.id)}>
            <Ionicons name={tab.icon as any} size={20} color={activeTab === tab.id ? C.primary : C.textMuted} />
            <Text style={[s.tabLabel, activeTab === tab.id && s.tabLabelActive]} numberOfLines={1}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══ HOJE ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'hoje' && (
        <ScrollView contentContainerStyle={s.tabContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} colors={[C.primary]} progressBackgroundColor={C.surface} />}>
          {loadingCultos ? (
            <View style={s.loadingWrap}><ActivityIndicator color={C.primary} /><Text style={s.loadingText}>{t('banda.carregando')}</Text></View>
          ) : cultoDoDia ? (
            <>
              <View style={s.hojeBanner}>
                <View style={s.hojeBannerLeft}>
                  <Ionicons name="sunny" size={20} color={C.gold} />
                  <View>
                    <Text style={s.hojeBannerLabel}>{cultoDoDia.date === today ? t('banda.cultoDeHoje') : t('banda.proximoCulto')}</Text>
                    <Text style={s.hojeBannerDate}>{cultoDoDia.label}</Text>
                  </View>
                </View>
                <View style={s.hojeSongCount}>
                  <Text style={s.hojeSongCountNum}>{cultoDoDia.entries.length}</Text>
                  <Text style={s.hojeSongCountLabel}>{t('banda.musicas')}</Text>
                </View>
              </View>
              <PresencaBar
                presencas={presencasDo('culto', cultoDoDia.id)}
                meuId={user?.id}
                escalados={pessoasNaEscala(cultoDoDia.escala)}
                onResponder={st => responderPresenca('culto', cultoDoDia.id, st)}
              />
              <Text style={s.sectionLabel}>{t('banda.setlist')}</Text>
              <SetlistResumo
                songs={songsDoSetlist(cultoDoDia.entries)}
                onPlaylist={() => abrirPlaylist(cultoDoDia.entries)}
              />
              {cultoDoDia.entries.map((entry, idx) => {
                const song = musicaDaEntrada(entry);
                if (!song) return null;
                const versaoNome = nomeDaVersao(entry);
                return (
                  // Mesmo desenho do cartão do Repertório: título e artista em
                  // linhas inteiras em cima (antes vinham cortados, disputando a
                  // linha com tom/BPM/links), e as fichas + links embaixo.
                  <View key={entry.song_id} style={s.hojeCard}>
                    <TouchableOpacity
                      style={s.hojeCardTopo}
                      activeOpacity={0.7}
                      onPress={() => setNotaModal({
                        tipo: 'culto', eventoId: cultoDoDia.id, songId: entry.song_id,
                        titulo: song.title, nota: entry.nota ?? '',
                      })}
                    >
                      <View style={s.hojeOrder}><Text style={s.hojeOrderNum}>{idx + 1}</Text></View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={s.hojeSongTitle} numberOfLines={2}>{song.title}</Text>
                        <Text style={s.hojeSongArtist} numberOfLines={1}>
                          {song.artist}{versaoNome ? ` · ${versaoNome}` : ''}
                        </Text>
                        {entry.nota ? (
                          <View style={s.notaRow}>
                            <Ionicons name="chatbox-ellipses-outline" size={11} color={C.gold} />
                            <Text style={s.notaTexto} numberOfLines={2}>{entry.nota}</Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                    <View style={s.songRodape}>
                      <View style={s.songMeta}>
                        {/* Só a letra do tom, no roxo do Repertório — a ficha
                            cinza sumia no cartão. BPM logo ao lado. */}
                        <View style={s.hojeTomSelo}>
                          <Text style={s.hojeTomSeloText}>{entry.song_key}</Text>
                        </View>
                        <TouchableOpacity
                          style={[s.songMetaChip, s.songMetaChipAcionavel]}
                          onPress={() => setMetronomo({ bpm: Number(entry.bpm) || song.bpm, titulo: song.title })}
                        >
                          <Ionicons name="pulse-outline" size={10} color={C.primary} />
                          <Text style={[s.songMetaText, { color: C.primary }]}>{entry.bpm} BPM</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={s.songLinks}>
                        <LinkMiniButtons song={song} openLink={openLink} />
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={s.hojeTip}>
                <Ionicons name="information-circle-outline" size={14} color={C.textDim} />
                <Text style={s.hojeTipText}>{t('banda.dicaTomBpm')}</Text>
              </View>
              <Text style={[s.sectionLabel, { marginTop: 20 }]}>{t('banda.escalaDeHoje')}</Text>
              <View style={s.escalaCard}>
                <EscalaLista escala={cultoDoDia.escala} membros={membros} funcoes={funcoes} />
              </View>
            </>
          ) : (
            <View style={s.emptyState}>
              <Ionicons name="sunny-outline" size={48} color={C.textDim} />
              <Text style={s.emptyTitle}>{t('banda.nenhumCultoAgendado')}</Text>
              <Text style={s.emptyDesc}>{t('banda.crieUmCulto')}</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setActiveTab('cultos')}>
                <Text style={s.emptyBtnText}>{t('banda.irParaCultos')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* ══ REPERTÓRIO ════════════════════════════════════════════════════════ */}
      {activeTab === 'repertorio' && (
        <View style={{ flex: 1 }}>
          <View style={s.reperToolbar}>
            <View style={s.filterRow}>
              {(['all', 'repertoire'] as const).map(f => (
                <TouchableOpacity key={f} style={[s.pill, filter === f && s.pillActive]} onPress={() => setFilter(f)}>
                  <Text style={[s.pillText, filter === f && s.pillTextActive]}>{f === 'all' ? t('banda.todas') : t('banda.noRepertorio')}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.addSongBtn} onPress={abrirNovaMusica}>
              <Ionicons name="add" size={18} color={C.onPrimary} />
            </TouchableOpacity>
          </View>
          {loadingSongs ? (
            <View style={s.loadingWrap}><ActivityIndicator color={C.primary} /></View>
          ) : (
            <FlatList
              data={filteredSongs}
              keyExtractor={i => i.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} colors={[C.primary]} progressBackgroundColor={C.surface} />}
              renderItem={({ item }) => (
                // O cartão é em DUAS linhas de propósito: com os botões de link
                // à direita do texto, o título perdia ~140pt de largura e as
                // fichas de tom/BPM passavam POR BAIXO dos ícones (não há clip
                // no RN). Em cima o título ocupa o cartão inteiro; embaixo as
                // fichas e os links dividem a linha, sem se cruzar.
                <View style={s.songCard}>
                  <TouchableOpacity style={s.songCardTopo} onPress={() => abrirEditarMusica(item)} activeOpacity={0.7}>
                    {item.capa_url ? (
                      // A borda roxa faz o papel que o selo de tom fazia: dizer
                      // de relance se a música está no repertório da banda.
                      <Image
                        source={{ uri: item.capa_url }}
                        style={[s.songCapa, item.in_repertoire && s.songCapaNoRepertorio]}
                      />
                    ) : (
                      <View style={[s.keyBadge, { backgroundColor: item.in_repertoire ? C.primaryDim : C.surfaceHigh }]}>
                        <Text style={[s.keyText, { color: item.in_repertoire ? C.onPrimaryDim : C.textMuted }]}>{item.song_key}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={s.songTitleRow}>
                        <Text style={[s.songTitle, { flexShrink: 1 }]} numberOfLines={2}>{item.title}</Text>
                        <Ionicons name="create-outline" size={13} color={C.textDim} style={{ marginTop: 3 }} />
                        {versoes.some(v => v.song_id === item.id) && (
                          <View style={[s.versaoTag, { marginTop: 1 }]}>
                            <Text style={s.versaoTagText}>
                              {versoes.filter(v => v.song_id === item.id).length}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.songArtist} numberOfLines={1}>{item.artist}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={s.songRodape}>
                    <View style={s.songMeta}>
                      <View style={s.songMetaChip}><Text style={s.songMetaText}>{t('banda.tomLabel')} {item.song_key}</Text></View>
                      {/* Toque no BPM abre o metrônomo já naquele andamento —
                          era o motivo de o músico largar o app e abrir outro. */}
                      <TouchableOpacity
                        style={[s.songMetaChip, s.songMetaChipAcionavel]}
                        onPress={() => setMetronomo({ bpm: item.bpm, titulo: item.title })}
                      >
                        <Ionicons name="pulse-outline" size={10} color={C.primary} />
                        <Text style={[s.songMetaText, { color: C.primary }]}>{item.bpm} BPM</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.songMetaChip, s.songMetaChipAcionavel]}
                        onPress={() => setVersoesSong(item)}
                      >
                        <Ionicons name="git-branch-outline" size={10} color={C.primary} />
                        <Text style={[s.songMetaText, { color: C.primary }]}>{t('banda.versoes')}</Text>
                      </TouchableOpacity>
                      {!!item.duracao_segundos && (
                        <View style={s.songMetaChip}><Text style={s.songMetaText}>{formatDuracao(item.duracao_segundos)}</Text></View>
                      )}
                    </View>
                    <View style={s.songLinks}>
                      <LinkMiniButtons song={item} openLink={openLink} />
                    </View>
                  </View>
                </View>
              )}
            />
          )}
          {/* Recarrega culto e ensaio também: apagar uma música em uso a remove
              dos setlists por cascade, e as listas ficariam mostrando o que já
              não existe mais até o próximo refresh manual. */}
          <MusicaModal
            visible={musicaModal}
            song={editSong}
            onClose={fecharMusicaModal}
            onSaved={() => { fetchSongs(); fetchCultos(); fetchEnsaios(); }}
          />
        </View>
      )}

      {/* ══ CULTOS ════════════════════════════════════════════════════════════ */}
      {activeTab === 'cultos' && (
        <View style={{ flex: 1 }}>
          <View style={s.cultosToolbar}>
            <Text style={s.cultosCount}>{cultosVisiveis.length} {cultosVisiveis.length !== 1 ? t('banda.tabCultos').toLowerCase() : t('banda.cultoSingular')}</Text>
            <TouchableOpacity style={s.newCultoBtn} onPress={() => setCultosModal(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={18} color={C.onPrimary} />
              <Text style={s.newCultoBtnText}>{t('banda.novoCulto')}</Text>
            </TouchableOpacity>
          </View>
          {loadingCultos ? (
            <View style={s.loadingWrap}><ActivityIndicator color={C.primary} /></View>
          ) : cultosVisiveis.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="mic-outline" size={48} color={C.textDim} />
              <Text style={s.emptyTitle}>{t('banda.nenhumCultoAinda')}</Text>
              <Text style={s.emptyDesc}>{t('banda.toqueNovoCulto')}</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} colors={[C.primary]} progressBackgroundColor={C.surface} />}>
              {cultosVisiveis.map(culto => {
                const isOpen = expandedCulto === culto.id;
                return (
                  <View key={culto.id} style={[s.cultoCard, isOpen && s.cultoCardOpen]}>
                    <TouchableOpacity style={s.cultoHeader} onPress={() => setExpandedCulto(isOpen ? null : culto.id)} activeOpacity={0.8}>
                      <View style={s.cultoHeaderLeft}>
                        <View style={[s.cultoDot, culto.date === today && { backgroundColor: C.gold }]} />
                        <View>
                          <View style={s.cultoLabelRow}>
                            <Text style={s.cultoLabel}>{culto.label}</Text>
                            {!culto.publicado && (
                              <View style={s.rascunhoTag}><Text style={s.rascunhoTagText}>{t('banda.rascunho')}</Text></View>
                            )}
                          </View>
                          <Text style={s.cultoMeta}>{culto.entries.length} {culto.entries.length !== 1 ? t('banda.musicas') : t('banda.musica')}{culto.date === today ? t('banda.hojeSufixo') : ''}</Text>
                        </View>
                      </View>
                      <View style={s.cultoHeaderRight}>
                        {podeVerRascunho && (
                          <TouchableOpacity
                            onPress={() => alternarPublicado('culto', culto.id, !culto.publicado)}
                            style={s.deleteBtn}
                            hitSlop={6}
                          >
                            <Ionicons
                              name={culto.publicado ? 'eye-outline' : 'eye-off-outline'}
                              size={15}
                              color={culto.publicado ? C.accent : C.gold}
                            />
                          </TouchableOpacity>
                        )}
                        {/* Só admin apaga. Antes a lixeira ficava visível pra
                            qualquer pessoa com o código da banda, enquanto os
                            botões vizinhos (publicar, editar setlist) já eram
                            restritos — e apagar um culto leva junto setlist,
                            escala, roadmap e comentários, em cascata. */}
                        {podeVerRascunho && (
                          <TouchableOpacity onPress={() => deleteCulto(culto.id)} style={s.deleteBtn}>
                            <Ionicons name="trash-outline" size={15} color={C.danger} />
                          </TouchableOpacity>
                        )}
                        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
                      </View>
                    </TouchableOpacity>
                    {isOpen && (
                      <View style={s.cultoSongs}>
                        <View style={s.acoesRow}>
                          <TouchableOpacity
                            style={s.acaoBtn}
                            onPress={() => abrirAgenda(
                              culto.label, culto.date, '',
                              Math.max(60, Math.round(totalDoCulto(culto).segundos / 60) || 90),
                              songsDoSetlist(culto.entries).map((sg, i) => `${i + 1}. ${sg.title}`).join('\n'),
                              '',
                            )}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="calendar-outline" size={15} color={C.textMuted} />
                            <Text style={s.acaoTexto}>{t('banda.agenda')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.acaoBtn} onPress={() => setComentariosCulto(culto)} activeOpacity={0.8}>
                            <Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textMuted} />
                            <Text style={s.acaoTexto}>{t('banda.conversa')}</Text>
                          </TouchableOpacity>
                          {podeVerRascunho && (
                            <TouchableOpacity
                              style={s.acaoBtn}
                              onPress={() => setSetlistModal({
                                tipo: 'culto', eventoId: culto.id, label: culto.label, entries: culto.entries,
                              })}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="list-outline" size={15} color={C.textMuted} />
                              <Text style={s.acaoTexto}>{t('banda.editarSetlist')}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <SetlistResumo
                          songs={songsDoSetlist(culto.entries)}
                          onPlaylist={() => abrirPlaylist(culto.entries)}
                        />
                        <View style={s.cultoColHeader}>
                          <Text style={[s.cultoColLabel, { flex: 1, marginLeft: 52 }]}>{t('banda.colunaMusica')}</Text>
                          <Text style={[s.cultoColLabel, { width: 44, textAlign: 'center' }]}>{t('banda.tomLabel')}</Text>
                          <Text style={[s.cultoColLabel, { width: 44, textAlign: 'center' }]}>{t('banda.bpm')}</Text>
                          <View style={{ width: 28 }} />
                        </View>
                        {culto.entries.map((entry, idx) => {
                          const song = musicaDaEntrada(entry);
                          if (!song) return null;
                          const versaoNome = nomeDaVersao(entry);
                          return (
                            <View key={entry.song_id} style={[s.cultoSongRow, idx === culto.entries.length - 1 && { borderBottomWidth: 0 }]}>
                              <Text style={s.cultoSongNum}>{idx + 1}</Text>
                              <View style={s.cultoKeyBadge}><Text style={s.cultoKeyText}>{entry.song_key}</Text></View>
                              <TouchableOpacity
                                style={{ flex: 1 }}
                                activeOpacity={0.7}
                                onPress={() => setNotaModal({
                                  tipo: 'culto', eventoId: culto.id, songId: entry.song_id,
                                  titulo: song.title, nota: entry.nota ?? '',
                                })}
                              >
                                <Text style={s.cultoSongTitle}>{song.title}</Text>
                                <Text style={s.cultoSongArtist}>
                                  {song.artist}{versaoNome ? ` · ${versaoNome}` : ''}
                                </Text>
                                {entry.nota ? (
                                  <View style={s.notaRow}>
                                    <Ionicons name="chatbox-ellipses-outline" size={11} color={C.gold} />
                                    <Text style={s.notaTexto} numberOfLines={2}>{entry.nota}</Text>
                                  </View>
                                ) : null}
                              </TouchableOpacity>
                              {/* O BPM do setlist é o andamento real da banda
                                  naquele culto (já com a versão aplicada) —
                                  é este que o metrônomo tem que abrir, não o
                                  do repertório. */}
                              <TouchableOpacity
                                style={s.cultoBpmChip}
                                onPress={() => setMetronomo({ bpm: Number(entry.bpm) || song.bpm, titulo: song.title })}
                              >
                                <Text style={[s.cultoBpmText, { color: C.primary }]}>{entry.bpm}</Text>
                              </TouchableOpacity>
                              <LinkMiniButtons song={song} openLink={openLink} />
                            </View>
                          );
                        })}
                        <View style={s.escalaHeader}>
                          <Text style={s.cultoColLabel}>{t('banda.ordemDoCulto').toUpperCase()}</Text>
                          <TouchableOpacity
                            // max(order_index)+1, não a contagem: depois de remover um
                            // item do meio, a contagem repetiria um índice já usado e a
                            // ordem passaria a variar a cada recarga.
                            onPress={() => setRoadmapModal({
                              cultoId: culto.id,
                              proximo: culto.roadmap.reduce((max, r) => Math.max(max, r.order_index + 1), 0),
                            })}
                            hitSlop={6}
                          >
                            <Ionicons name="add-circle-outline" size={17} color={C.primary} />
                          </TouchableOpacity>
                        </View>
                        {culto.roadmap.length === 0 ? (
                          <Text style={s.escalaVazia}>{t('banda.ordemVazia')}</Text>
                        ) : (
                          <>
                            {culto.roadmap.map(item => (
                              <View key={item.id} style={s.roadmapRow}>
                                <Ionicons name="ellipse-outline" size={11} color={C.textDim} />
                                <Text style={s.roadmapTitulo}>{item.titulo}</Text>
                                <Text style={s.roadmapDuracao}>
                                  {item.duracao_segundos ? formatDuracao(item.duracao_segundos) : '—'}
                                </Text>
                                {/* Lixeira visível: antes só dava pra remover segurando o
                                    item, sem nada na tela dizendo isso — o toque simples
                                    piscava e não fazia nada, o que lê como botão quebrado. */}
                                <TouchableOpacity onPress={() => removerItemRoadmap(item)} hitSlop={8}>
                                  <Ionicons name="close-circle-outline" size={16} color={C.textDim} />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </>
                        )}

                        {/* Total fora do ramo do roadmap: um culto só com músicas
                            também merece saber quanto tempo tem. E o aviso de
                            músicas sem duração vem junto, pra ninguém tomar um
                            total incompleto por exato. */}
                        {(() => {
                          const total = totalDoCulto(culto);
                          if (total.segundos <= 0) return null;
                          return (
                            <View style={s.roadmapTotal}>
                              <View>
                                <Text style={s.roadmapTotalLabel}>{t('banda.totalDoCulto')}</Text>
                                {total.semDuracao > 0 && (
                                  <Text style={s.resumoAviso}>{t('banda.semDuracaoAviso', { n: total.semDuracao })}</Text>
                                )}
                              </View>
                              <Text style={s.roadmapTotalValor}>{formatDuracao(total.segundos)}</Text>
                            </View>
                          );
                        })()}

                        <View style={s.escalaHeader}>
                          <Text style={s.cultoColLabel}>{t('banda.escala').toUpperCase()}</Text>
                          <TouchableOpacity onPress={() => setEscalaModal({ tipo: 'culto', eventoId: culto.id })} hitSlop={6}>
                            <Ionicons name="person-add-outline" size={16} color={C.primary} />
                          </TouchableOpacity>
                        </View>
                        <EscalaLista escala={culto.escala} membros={membros} funcoes={funcoes} onRemover={id => removerDaEscala('culto', id)} />
                        <PresencaBar
                          presencas={presencasDo('culto', culto.id)}
                          meuId={user?.id}
                          escalados={pessoasNaEscala(culto.escala)}
                          onResponder={st => responderPresenca('culto', culto.id, st)}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
          <NovoCultoModal visible={cultosModal} onClose={() => setCultosModal(false)} onSaved={fetchCultos} songs={songs} versoes={versoes} />
        </View>
      )}

      {/* ══ ENSAIOS ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'ensaios' && (
        <View style={{ flex: 1 }}>
          <View style={s.cultosToolbar}>
            <Text style={s.cultosCount}>{ensaiosVisiveis.length} {ensaiosVisiveis.length !== 1 ? t('banda.tabEnsaios').toLowerCase() : t('banda.ensaioSingular')}</Text>
            <TouchableOpacity style={s.newCultoBtn} onPress={() => setEnsaioModal(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={18} color={C.onPrimary} />
              <Text style={s.newCultoBtnText}>{t('banda.novoEnsaio')}</Text>
            </TouchableOpacity>
          </View>
          {loadingEnsaios ? (
            <View style={s.loadingWrap}><ActivityIndicator color={C.primary} /></View>
          ) : ensaiosVisiveis.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={C.textDim} />
              <Text style={s.emptyTitle}>{t('banda.nenhumEnsaioAinda')}</Text>
              <Text style={s.emptyDesc}>{t('banda.toqueNovoEnsaio')}</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} colors={[C.primary]} progressBackgroundColor={C.surface} />}>
              {ensaiosVisiveis.map(ensaio => {
                const isOpen = expandedEnsaio === ensaio.id;
                const { dia, mes } = diaEMes(ensaio.date);
                return (
                  <View key={ensaio.id} style={[s.cultoCard, isOpen && s.cultoCardOpen]}>
                    <TouchableOpacity style={s.cultoHeader} onPress={() => setExpandedEnsaio(isOpen ? null : ensaio.id)} activeOpacity={0.8}>
                      <View style={s.ensaioDate}>
                        <Text style={s.ensaioDay}>{dia}</Text>
                        <Text style={s.ensaioMonth}>{mes}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={s.cultoLabelRow}>
                          <Text style={s.cultoLabel}>{ensaio.label}{ensaio.date === today ? t('banda.hojeSufixo') : ''}</Text>
                          {!ensaio.publicado && (
                            <View style={s.rascunhoTag}><Text style={s.rascunhoTagText}>{t('banda.rascunho')}</Text></View>
                          )}
                        </View>
                        {!!ensaio.time && (
                          <View style={s.ensaioLocalRow}>
                            <Ionicons name="time-outline" size={13} color={C.textMuted} />
                            <Text style={s.ensaioLocal}>{ensaio.time}</Text>
                          </View>
                        )}
                        {!!ensaio.local && (
                          <View style={s.ensaioLocalRow}>
                            <Ionicons name="location-outline" size={13} color={C.textMuted} />
                            <Text style={s.ensaioLocal}>{ensaio.local}</Text>
                          </View>
                        )}
                        {!!ensaio.observacao && (
                          <View style={s.obsRow}>
                            <Ionicons name="information-circle-outline" size={13} color={C.primary} />
                            <Text style={s.obsText}>{ensaio.observacao}</Text>
                          </View>
                        )}
                      </View>
                      <View style={s.cultoHeaderRight}>
                        {podeVerRascunho && (
                          <TouchableOpacity
                            onPress={() => alternarPublicado('ensaio', ensaio.id, !ensaio.publicado)}
                            style={s.deleteBtn}
                            hitSlop={6}
                          >
                            <Ionicons
                              name={ensaio.publicado ? 'eye-outline' : 'eye-off-outline'}
                              size={15}
                              color={ensaio.publicado ? C.accent : C.gold}
                            />
                          </TouchableOpacity>
                        )}
                        {podeVerRascunho && (
                          <TouchableOpacity onPress={() => deleteEnsaio(ensaio.id)} style={s.deleteBtn}>
                            <Ionicons name="trash-outline" size={15} color={C.danger} />
                          </TouchableOpacity>
                        )}
                        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
                      </View>
                    </TouchableOpacity>
                    {isOpen && (
                      <View style={s.cultoSongs}>
                        <View style={s.acoesRow}>
                          <TouchableOpacity
                            style={s.acaoBtn}
                            onPress={() => abrirAgenda(
                              ensaio.label, ensaio.date, ensaio.time, 120,
                              ensaio.observacao, ensaio.local,
                            )}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="calendar-outline" size={15} color={C.textMuted} />
                            <Text style={s.acaoTexto}>{t('banda.agenda')}</Text>
                          </TouchableOpacity>
                          {podeVerRascunho && (
                            <TouchableOpacity
                              style={s.acaoBtn}
                              onPress={() => setSetlistModal({
                                tipo: 'ensaio', eventoId: ensaio.id, label: ensaio.label, entries: ensaio.entries,
                              })}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="list-outline" size={15} color={C.textMuted} />
                              <Text style={s.acaoTexto}>{t('banda.editarSetlist')}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <SetlistResumo
                          songs={songsDoSetlist(ensaio.entries)}
                          onPlaylist={() => abrirPlaylist(ensaio.entries)}
                        />
                        <View style={s.cultoColHeader}>
                          <Text style={[s.cultoColLabel, { flex: 1, marginLeft: 52 }]}>{t('banda.colunaMusica')}</Text>
                          <Text style={[s.cultoColLabel, { width: 44, textAlign: 'center' }]}>{t('banda.tomLabel')}</Text>
                          <Text style={[s.cultoColLabel, { width: 44, textAlign: 'center' }]}>{t('banda.bpm')}</Text>
                          <View style={{ width: 28 }} />
                        </View>
                        {ensaio.entries.length === 0 ? (
                          <Text style={s.emptyDesc}>{t('banda.selecioneUmaMusica')}</Text>
                        ) : ensaio.entries.map((entry, idx) => {
                          const song = musicaDaEntrada(entry);
                          if (!song) return null;
                          const versaoNome = nomeDaVersao(entry);
                          return (
                            <View key={entry.song_id} style={[s.cultoSongRow, idx === ensaio.entries.length - 1 && { borderBottomWidth: 0 }]}>
                              <Text style={s.cultoSongNum}>{idx + 1}</Text>
                              <View style={s.cultoKeyBadge}><Text style={s.cultoKeyText}>{entry.song_key}</Text></View>
                              <TouchableOpacity
                                style={{ flex: 1 }}
                                activeOpacity={0.7}
                                onPress={() => setNotaModal({
                                  tipo: 'ensaio', eventoId: ensaio.id, songId: entry.song_id,
                                  titulo: song.title, nota: entry.nota ?? '',
                                })}
                              >
                                <Text style={s.cultoSongTitle}>{song.title}</Text>
                                <Text style={s.cultoSongArtist}>
                                  {song.artist}{versaoNome ? ` · ${versaoNome}` : ''}
                                </Text>
                                {entry.nota ? (
                                  <View style={s.notaRow}>
                                    <Ionicons name="chatbox-ellipses-outline" size={11} color={C.gold} />
                                    <Text style={s.notaTexto} numberOfLines={2}>{entry.nota}</Text>
                                  </View>
                                ) : null}
                              </TouchableOpacity>
                              {/* O BPM do setlist é o andamento real da banda
                                  naquele culto (já com a versão aplicada) —
                                  é este que o metrônomo tem que abrir, não o
                                  do repertório. */}
                              <TouchableOpacity
                                style={s.cultoBpmChip}
                                onPress={() => setMetronomo({ bpm: Number(entry.bpm) || song.bpm, titulo: song.title })}
                              >
                                <Text style={[s.cultoBpmText, { color: C.primary }]}>{entry.bpm}</Text>
                              </TouchableOpacity>
                              <LinkMiniButtons song={song} openLink={openLink} />
                            </View>
                          );
                        })}
                        <View style={s.escalaHeader}>
                          <Text style={s.cultoColLabel}>{t('banda.escala').toUpperCase()}</Text>
                          <TouchableOpacity onPress={() => setEscalaModal({ tipo: 'ensaio', eventoId: ensaio.id })} hitSlop={6}>
                            <Ionicons name="person-add-outline" size={16} color={C.primary} />
                          </TouchableOpacity>
                        </View>
                        <EscalaLista escala={ensaio.escala} membros={membros} funcoes={funcoes} onRemover={id => removerDaEscala('ensaio', id)} />
                        <PresencaBar
                          presencas={presencasDo('ensaio', ensaio.id)}
                          meuId={user?.id}
                          escalados={pessoasNaEscala(ensaio.escala)}
                          onResponder={st => responderPresenca('ensaio', ensaio.id, st)}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
          <NovoEnsaioModal visible={ensaioModal} onClose={() => setEnsaioModal(false)} onSaved={fetchEnsaios} songs={songs} versoes={versoes} />
        </View>
      )}

      {/* ══ EQUIPE ════════════════════════════════════════════════════════════ */}
      {activeTab === 'equipe' && (
        <View style={{ flex: 1 }}>
          <View style={s.cultosToolbar}>
            <Text style={s.cultosCount}>
              {membros.length} {membros.length !== 1 ? t('banda.integrantes') : t('banda.integranteSingular')}
            </Text>
            {podeVerRascunho && (
              <TouchableOpacity style={s.acaoBtn} onPress={() => setFuncoesModal(true)} activeOpacity={0.85}>
                <Ionicons name="options-outline" size={15} color={C.textMuted} />
                <Text style={s.acaoTexto}>{t('banda.funcoes')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {membros.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="people-outline" size={48} color={C.textDim} />
              <Text style={s.emptyTitle}>{t('banda.equipeVaziaTitulo')}</Text>
              <Text style={s.emptyDesc}>{t('banda.equipeVaziaDesc')}</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} colors={[C.primary]} progressBackgroundColor={C.surface} />}
            >
              {/* Quem cobre cada função: a pergunta que o líder faz antes de
                  montar a escala e que hoje só se responde de cabeça. */}
              {funcoes.length > 0 && (
                <View style={s.coberturaCard}>
                  <Text style={s.cultoColLabel}>{t('banda.quemCobreCadaFuncao')}</Text>
                  <View style={s.coberturaWrap}>
                    {funcoes.map(f => {
                      const quantos = membroFuncoes.filter(mf => mf.funcao_id === f.id).length;
                      const descoberta = quantos === 0;
                      return (
                        <View key={f.id} style={[s.coberturaChip, descoberta && s.coberturaChipVazia]}>
                          <Text style={s.coberturaEmoji}>{f.emoji}</Text>
                          <Text style={[s.coberturaNome, descoberta && { color: C.danger }]}>{f.nome}</Text>
                          <Text style={[s.coberturaNum, descoberta && { color: C.danger }]}>{quantos}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {membros.map(m => {
                const minhas = membroFuncoes.filter(mf => mf.membro_id === m.id);
                const listaFuncoes = funcoes
                  .filter(f => minhas.some(mf => mf.funcao_id === f.id))
                  .sort((a, b) => {
                    const pa = minhas.find(mf => mf.funcao_id === a.id)?.principal ? 0 : 1;
                    const pb = minhas.find(mf => mf.funcao_id === b.id)?.principal ? 0 : 1;
                    return pa - pb;
                  });
                const stats = escalasPorMembro.get(m.id);
                const souEu = !!user?.id && user.id === m.profile_id;
                const podeEditar = podeVerRascunho || souEu;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={s.equipeCard}
                    activeOpacity={podeEditar ? 0.7 : 1}
                    onPress={() => { if (podeEditar) setMembroEditando(m); }}
                  >
                    <View style={s.equipeTopo}>
                      {m.avatar_url ? (
                        <Image source={{ uri: m.avatar_url }} style={s.equipeAvatar} />
                      ) : (
                        <View style={[s.equipeAvatar, s.equipeIniciaisWrap]}>
                          <Text style={s.equipeIniciais}>{iniciaisDoNome(m.nome)}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={s.equipeNomeRow}>
                          <Text style={s.equipeNome} numberOfLines={1}>{m.nome}</Text>
                          {souEu && <View style={s.euTag}><Text style={s.euTagText}>{t('banda.voce')}</Text></View>}
                        </View>
                        {/* Sem função marcada é um estado a resolver, não um
                            detalhe: essa pessoa nunca vai ser sugerida na escala. */}
                        {listaFuncoes.length === 0 ? (
                          <Text style={s.equipeSemFuncao}>{t('banda.semFuncaoDefinida')}</Text>
                        ) : (
                          <View style={s.equipeFuncoesWrap}>
                            {listaFuncoes.map(f => {
                              const ehPrincipal = minhas.find(mf => mf.funcao_id === f.id)?.principal;
                              return (
                                <View key={f.id} style={[s.equipeFuncaoChip, ehPrincipal && s.equipeFuncaoChipPrincipal]}>
                                  <Text style={s.equipeFuncaoTexto}>{f.emoji} {f.nome}</Text>
                                  {ehPrincipal && <Ionicons name="star" size={9} color={C.gold} />}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                      {podeEditar && <Ionicons name="chevron-forward" size={18} color={C.textDim} />}
                    </View>
                    <View style={s.equipeRodape}>
                      <Ionicons name="calendar-outline" size={12} color={C.textDim} />
                      <Text style={s.equipeStat}>
                        {stats?.total
                          ? t('banda.escaladoNVezes', { n: stats.total })
                          : t('banda.naoEscaladoNoPeriodo')}
                      </Text>
                      {!!stats?.maisFrequente && (
                        <Text style={s.equipeStatDim}>· {stats.maisFrequente}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
              <View style={s.hojeTip}>
                <Ionicons name="information-circle-outline" size={14} color={C.textDim} />
                <Text style={s.hojeTipText}>{t('banda.dicaEquipe')}</Text>
              </View>
            </ScrollView>
          )}
          <FuncoesModal
            visible={funcoesModal}
            funcoes={funcoes}
            onClose={() => setFuncoesModal(false)}
            onSaved={fetchFuncoes}
          />
          <MembroFuncoesModal
            membro={membroEditando}
            funcoes={funcoes}
            membroFuncoes={membroFuncoes}
            onClose={() => setMembroEditando(null)}
            onSaved={fetchFuncoes}
          />
        </View>
      )}

      {/* ══ CHAT ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'chat' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
          {loadingChat ? (
            <View style={s.loadingWrap}><ActivityIndicator color={C.primary} /></View>
          ) : (
            <ScrollView ref={scrollRef} contentContainerStyle={s.chatContent} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
              {messages.length === 0 ? (
                <View style={s.emptyState}>
                  <Ionicons name="chatbubbles-outline" size={48} color={C.textDim} />
                  <Text style={s.emptyTitle}>{t('banda.chatVazio')}</Text>
                  <Text style={s.emptyDesc}>{t('banda.chatVazioDesc')}</Text>
                </View>
              ) : messages.map((m, idx) => {
                const mine = m.autor_id === user?.id;
                // Divisor de data quando a mensagem cai num dia diferente da anterior.
                const dia = diaDaMensagem(m.created_at);
                const mostraDia = idx === 0 || diaDaMensagem(messages[idx - 1].created_at) !== dia;
                return (
                  <View key={m.id}>
                    {mostraDia && (
                      <View style={s.chatDayWrap}>
                        <Text style={s.chatDay}>{rotuloDoDia(dia, today, i18n.language, t)}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      activeOpacity={mine || meuPerfil?.admin ? 0.7 : 1}
                      onLongPress={() => apagarMensagem(m)}
                      style={[s.bubble, mine && s.bubbleMine]}
                    >
                      {!mine && <Text style={s.bubbleAuthor}>{m.autor_nome}</Text>}
                      <Text style={[s.bubbleText, mine && s.bubbleTextMine]}>{m.texto}</Text>
                      <Text style={[s.bubbleTime, mine && s.bubbleTimeMine]}>{horaDaMensagem(m.created_at)}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <View style={s.chatInput}>
            <TextInput style={s.chatField} placeholder={t('banda.mensagemPlaceholder')} placeholderTextColor={C.textDim} value={chatMsg} onChangeText={setChatMsg} returnKeyType="send" onSubmitEditing={sendMessage} maxLength={1000} />
            <TouchableOpacity style={[s.sendBtn, (!chatMsg.trim() || enviandoChat || !nomePronto) && { opacity: 0.45 }]} onPress={sendMessage} disabled={!chatMsg.trim() || enviandoChat || !nomePronto}>
              {enviandoChat ? <ActivityIndicator color={C.onPrimary} size="small" /> : <Ionicons name="send" size={18} color={C.onPrimary} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      <IndisponibilidadeModal
        visible={indispModal}
        onClose={() => setIndispModal(false)}
        indisponibilidades={indisponibilidades}
        membros={membros}
        meuId={user?.id}
        onAlternar={alternarIndisponibilidade}
      />

      <RelatoriosModal
        visible={relatorioModal}
        onClose={() => setRelatorioModal(false)}
        cultos={cultosVisiveis}
        ensaios={ensaiosVisiveis}
        songs={songs}
        membros={membros}
      />

      <VersoesModal
        song={versoesSong}
        versoes={versoes}
        onClose={() => setVersoesSong(null)}
        onMudou={() => { fetchVersoes(); fetchCultos(); fetchEnsaios(); }}
      />

      <ComentariosModal
        culto={comentariosCulto}
        onClose={() => setComentariosCulto(null)}
        meuId={user?.id}
        meuNome={meuNome}
        souAdmin={!!meuPerfil?.admin}
        nomePronto={nomePronto}
      />

      {/* Montado só quando aberto: senão os dois players de áudio e o modo de
          áudio global do app seriam criados assim que a aba Banda abrisse,
          mesmo sem ninguém usar o metrônomo. */}
      {!!metronomo && <MetronomoModal
        visible={!!metronomo}
        onClose={() => setMetronomo(null)}
        bpmInicial={metronomo?.bpm}
        titulo={metronomo?.titulo}
      />}

      <EditarSetlistModal
        alvo={setlistModal}
        songs={songs}
        versoes={versoes}
        onClose={() => setSetlistModal(null)}
        onSalvo={() => { setlistModal?.tipo === 'culto' ? fetchCultos() : fetchEnsaios(); }}
      />
      <RoadmapItemModal
        visible={!!roadmapModal}
        cultoId={roadmapModal?.cultoId ?? ''}
        proximoIndice={roadmapModal?.proximo ?? 0}
        onClose={() => setRoadmapModal(null)}
        onSalvo={fetchCultos}
      />

      <NotaMusicaModal
        alvo={notaModal}
        onClose={() => setNotaModal(null)}
        onSalvo={() => { fetchCultos(); fetchEnsaios(); }}
      />

      {!!escalaModal && (
        <EscalaModal
          visible={!!escalaModal}
          onClose={() => setEscalaModal(null)}
          onSaved={() => (escalaModal.tipo === 'culto' ? fetchCultos() : fetchEnsaios())}
          membros={membros}
          tipo={escalaModal.tipo}
          eventoId={escalaModal.eventoId}
          times={times}
          funcoes={funcoes}
          membroFuncoes={membroFuncoes}
          escalaAtual={
            (escalaModal.tipo === 'culto'
              ? cultos.find(c => c.id === escalaModal.eventoId)
              : ensaios.find(e => e.id === escalaModal.eventoId)
            )?.escala ?? []
          }
          indisponiveis={indisponiveisNoDia(
            (escalaModal.tipo === 'culto'
              ? cultos.find(c => c.id === escalaModal.eventoId)
              : ensaios.find(e => e.id === escalaModal.eventoId)
            )?.date ?? ''
          )}
          onTimesMudaram={fetchTimes}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const buildS = (C: BandaColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: 0.3 },
  headerSub: { fontSize: 11, color: C.primary, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerIconBtnAtivo: { backgroundColor: C.primaryDim, borderColor: C.primary },
  headerBadge: { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.goldFill, borderWidth: 1, borderColor: C.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  headerBadgeText: { fontSize: 9, fontWeight: '800', color: '#000' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: C.primary },
  tabLabel: { fontSize: 10, color: C.textMuted, fontWeight: '500' },
  tabLabelActive: { color: C.primary, fontWeight: '700' },
  tabContent: { padding: 16, paddingBottom: 32 },
  sectionLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
  loadingText: { fontSize: 13, color: C.textMuted },
  // Hoje
  hojeBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  hojeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hojeBannerLabel: { fontSize: 11, color: C.gold, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  hojeBannerDate: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 2 },
  hojeSongCount: { alignItems: 'center', backgroundColor: C.surfaceHigh, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  hojeSongCountNum: { fontSize: 22, fontWeight: '800', color: C.primary },
  hojeSongCountLabel: { fontSize: 10, color: C.textMuted },
  hojeCard: { backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  hojeCardTopo: { flexDirection: 'row', alignItems: 'flex-start' },
  // Mesmas medidas do selo de tom do Repertório (s.keyBadge): 40×40, raio 10.
  hojeTomSelo: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.primaryDim, alignItems: 'center', justifyContent: 'center' },
  hojeTomSeloText: { fontSize: 14, fontWeight: '800', color: C.onPrimaryDim },
  hojeOrder: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.primaryDim, alignItems: 'center', justifyContent: 'center' },
  hojeOrderNum: { fontSize: 15, fontWeight: '800', color: C.onPrimaryDim },
  hojeSongTitle: { fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 19 },
  hojeSongArtist: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  hojeTomBadge: { alignItems: 'center', backgroundColor: C.primaryDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: 40 },
  hojeTomLabel: { fontSize: 8, color: C.onPrimaryDim, fontWeight: '700', letterSpacing: 0.5 },
  hojeTomValue: { fontSize: 14, fontWeight: '800', color: C.onPrimaryDim },
  hojeBpmBadge: { alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.chipBorder, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: 44 },
  hojeBpmLabel: { fontSize: 8, color: C.textMuted, fontWeight: '700', letterSpacing: 0.5 },
  hojeBpmValue: { fontSize: 14, fontWeight: '800', color: C.textMuted },
  hojeTip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  hojeTipText: { fontSize: 11, color: C.textDim },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 80 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textMuted, marginTop: 16, marginBottom: 8 },
  emptyDesc: { fontSize: 13, color: C.textDim, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: 20, backgroundColor: C.primary, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20 },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: C.onPrimary },
  // Repertório
  reperToolbar: { flexDirection: 'row', alignItems: 'center', paddingRight: 16 },
  filterRow: { flex: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  pillActive: { backgroundColor: C.primaryDim, borderColor: C.primary },
  pillText: { fontSize: 13, color: C.textMuted, fontWeight: '500' },
  pillTextActive: { color: C.onPrimaryDim, fontWeight: '700' },
  addSongBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  songCard: { backgroundColor: C.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border },
  songCardTopo: { flexDirection: 'row', alignItems: 'center' },
  songRodape: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  keyBadge: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 14, fontWeight: '800', color: C.text },
  songTitle: { fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 19 },
  songArtist: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  songMeta: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  songMetaChip: { backgroundColor: C.surfaceHigh, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  songMetaText: { fontSize: 10, color: C.textMuted, fontWeight: '600' },
  songLinks: { flexDirection: 'row', gap: 6 },
  acoesRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  acaoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9, backgroundColor: C.surface, borderWidth: 1, borderColor: C.chipBorder },
  acaoTexto: { fontSize: 11, fontWeight: '700', color: C.textMuted },
  songMetaChipAcionavel: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.primary },
  versaoTag: { minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.primaryDim, borderWidth: 1, borderColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  versaoTagText: { fontSize: 9, fontWeight: '800', color: C.onPrimaryDim },
  notaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 4, paddingRight: 6 },
  roadmapRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  roadmapTitulo: { flex: 1, fontSize: 13, color: C.text },
  roadmapDuracao: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  roadmapTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, marginTop: 2 },
  roadmapTotalLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  roadmapTotalValor: { fontSize: 15, color: C.primary, fontWeight: '800' },
  notaTexto: { flex: 1, fontSize: 11, color: C.gold, lineHeight: 15, fontStyle: 'italic' },
  songCapa: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.surfaceHigh, borderWidth: 2, borderColor: 'transparent' },
  songCapaNoRepertorio: { borderColor: C.primary },
  linkBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.chipBorder },
  linkBtnMini: { width: 28, height: 28, borderRadius: 7 },
  songTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  linkBtnLabel: { fontSize: 9, fontWeight: '800', color: C.textMuted },
  linkBtnYt: { backgroundColor: C.ytBg },
  linkBtnDisabled: { opacity: 0.4 },
  spotifyBtn: { backgroundColor: C.accentDim },
  spotifyBtnDisabled: { opacity: 0.4 },
  // Cultos
  cultosToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  cultosCount: { fontSize: 13, color: C.textMuted, fontWeight: '500' },
  newCultoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  newCultoBtnText: { fontSize: 13, fontWeight: '700', color: C.onPrimary },
  cultoCard: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12, overflow: 'hidden' },
  cultoCardOpen: { borderColor: C.primary },
  cultoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  rascunhoTag: { backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.gold, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  rascunhoTagText: { fontSize: 9, fontWeight: '800', color: C.gold, letterSpacing: 0.5, textTransform: 'uppercase' },
  cultoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  cultoHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cultoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
  cultoLabel: { fontSize: 15, fontWeight: '700', color: C.text },
  cultoMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  cultoHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deleteBtn: { padding: 4 },
  cultoSongs: { borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10, backgroundColor: C.surfaceHigh },
  cultoColHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cultoColLabel: { fontSize: 9, color: C.textDim, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cultoSongRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  cultoSongNum: { fontSize: 11, color: C.textDim, fontWeight: '700', width: 16, textAlign: 'center' },
  cultoKeyBadge: { width: 28, height: 28, borderRadius: 6, backgroundColor: C.primaryDim, alignItems: 'center', justifyContent: 'center' },
  cultoKeyText: { fontSize: 11, fontWeight: '800', color: C.onPrimaryDim },
  cultoSongTitle: { fontSize: 13, fontWeight: '600', color: C.text },
  cultoSongArtist: { fontSize: 11, color: C.textMuted },
  cultoBpmChip: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.chipBorder, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, minWidth: 40, alignItems: 'center' },
  cultoBpmText: { fontSize: 12, fontWeight: '700', color: C.textMuted },
  // Escala
  escalaCard: { backgroundColor: C.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border },
  escalaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 6 },
  escalaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  escalaAvatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.surfaceHigh },

  // ── Aba Equipe ────────────────────────────────────────────────────────────
  coberturaCard: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 14 },
  coberturaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  coberturaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surfaceHigh, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  coberturaChipVazia: { borderWidth: 1, borderColor: C.danger, backgroundColor: 'transparent' },
  coberturaEmoji: { fontSize: 12 },
  coberturaNome: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  coberturaNum: { fontSize: 11, color: C.primary, fontWeight: '800' },
  equipeCard: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 },
  equipeTopo: { flexDirection: 'row', alignItems: 'center' },
  equipeAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.surfaceHigh },
  equipeIniciaisWrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryDim },
  equipeIniciais: { fontSize: 16, fontWeight: '800', color: C.onPrimaryDim },
  equipeNomeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  equipeNome: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: C.text },
  euTag: { backgroundColor: C.primaryDim, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  euTagText: { fontSize: 9, fontWeight: '800', color: C.onPrimaryDim, letterSpacing: 0.4 },
  equipeSemFuncao: { fontSize: 12, color: C.gold, fontStyle: 'italic', marginTop: 3 },
  equipeFuncoesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  equipeFuncaoChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surfaceHigh, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  equipeFuncaoChipPrincipal: { backgroundColor: C.primaryDim },
  equipeFuncaoTexto: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  equipeRodape: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  equipeStat: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  equipeStatDim: { flex: 1, fontSize: 11, color: C.textDim },
  escalaNome: { flex: 1, fontSize: 13, fontWeight: '600', color: C.text },
  escalaInstChip: { backgroundColor: C.primaryDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  escalaInstText: { fontSize: 11, fontWeight: '700', color: C.onPrimaryDim },
  escalaVazia: { fontSize: 12, color: C.textDim, paddingVertical: 4 },
  // Ensaios
  ensaioDate: { width: 48, alignItems: 'center', marginRight: 14, backgroundColor: C.primaryDim, borderRadius: 10, paddingVertical: 8 },
  ensaioDay: { fontSize: 22, fontWeight: '800', color: C.onPrimaryDim, lineHeight: 24 },
  ensaioMonth: { fontSize: 11, color: C.onPrimaryDim, fontWeight: '600', textTransform: 'uppercase' },
  ensaioLocalRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ensaioLocal: { fontSize: 12, color: C.textMuted },
  obsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 6 },
  obsText: { fontSize: 12, color: C.primary, flex: 1 },
  // Chat
  // Resumo do setlist (contagem, tempo total e playlist do YouTube)
  resumoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 2, marginBottom: 4 },
  resumoTexto: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
  resumoAviso: { fontSize: 11, color: C.textDim, marginTop: 2 },
  playlistBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.ytBg, borderWidth: 1, borderColor: C.chipBorder, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  playlistBtnText: { fontSize: 11, fontWeight: '700', color: C.text },

  // Confirmação de presença
  presencaWrap: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 8 },
  presencaBtns: { flexDirection: 'row', gap: 8 },
  presencaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceHigh },
  presencaBtnOk: { backgroundColor: C.accentDim, borderColor: C.accent },
  presencaBtnNo: { backgroundColor: C.dangerBg, borderColor: C.danger },
  presencaBtnText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  presencaBtnTextOn: { color: C.text },
  presencaResumo: { fontSize: 11, color: C.textDim, textAlign: 'center' },

  chatContent: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  chatDayWrap: { alignItems: 'center', marginVertical: 10 },
  chatDay: { fontSize: 10, color: C.textMuted, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', backgroundColor: C.surfaceHigh, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  bubble: { alignSelf: 'flex-start', maxWidth: '80%', backgroundColor: C.surfaceHigh, borderRadius: 12, borderBottomLeftRadius: 4, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: C.primaryDim, borderBottomLeftRadius: 12, borderBottomRightRadius: 4, borderColor: C.primary },
  bubbleAuthor: { fontSize: 11, color: C.primary, fontWeight: '700', marginBottom: 4 },
  bubbleText: { fontSize: 14, color: C.text, lineHeight: 20 },
  bubbleTextMine: { color: C.onPrimaryDim },
  bubbleTime: { fontSize: 10, color: C.textDim, marginTop: 4, textAlign: 'right' },
  bubbleTimeMine: { color: C.onPrimaryDimMuted },
  chatInput: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  chatField: { flex: 1, height: 42, backgroundColor: C.surfaceHigh, borderRadius: 21, paddingHorizontal: 16, fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.border },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
});

// ─── Root Export ──────────────────────────────────────────────────────────────
export default function BandaScreen() {
  const { C } = useBandaTema();
  const { user } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [checandoAcesso, setChecandoAcesso] = useState(true);

  useEffect(() => {
    if (!user) { setChecandoAcesso(false); return; }
    // `or role === 'admin'` porque a função do banco (is_banda_membro, em
    // 20260728090000) já libera o admin sem código. Sem isso, um admin com
    // `banda_acesso = false` levava a tela de convite e precisava queimar um
    // código para ver uma área que o banco já abria para ele.
    supabase.from('profiles').select('banda_acesso, role').eq('id', user.id).single()
      .then(({ data }) => {
        setUnlocked(!!data?.banda_acesso || data?.role === 'admin');
        setChecandoAcesso(false);
      });
  }, [user]);

  if (checandoAcesso) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.primary} />
      </SafeAreaView>
    );
  }

  return unlocked ? <BandaMain /> : <InviteGate onUnlock={() => setUnlocked(true)} />;
}
