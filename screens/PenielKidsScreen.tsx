// screens/PenielKidsScreen.tsx
//
// Peniel Kids — o que a família abre durante a semana, e a porta da sala de
// domingo para quem ensina.
//
// QUEM ENTRA AQUI
//   • o pai ou a mãe que tem filho cadastrado (o card na Home só aparece
//     para ele);
//   • quem lidera o grupo `infantil`, e o admin — esses veem também a ficha
//     de segurança da sala.
//
// DE ONDE VEM O CONTEÚDO
// Tudo de `kit_da_semana(p_crianca_id)`. É uma RPC e não um select porque
// três coisas precisam ser decididas no banco, não no aparelho: a TRILHA sai
// da idade (ninguém escolhe faixa etária à mão), a LIÇÃO sai da data (o
// domingo mais recente que já passou) e o `roteiro_sala` NÃO PODE sair — é o
// material do professor, e a função o omite campo a campo.
//
// O VÍDEO TOCA AQUI DENTRO
// A aba Mídia abre o YouTube por fora (`Linking.openURL`). Para adulto tudo
// bem; para criança é entregá-la ao autoplay e às sugestões do YouTube. Aqui
// é `WebView` com o embed, `rel=0` e `playsinline` — a criança vê o vídeo da
// semana e nada mais. `react-native-webview` já está no projeto.
//
// O ÁUDIO É NOSSO
// História e música são arquivos no Storage, na voz da professora que a
// criança reconhece do domingo. `expo-audio` já está no app (metrônomo,
// tradução ao vivo) e é usado aqui do mesmo jeito: `createAudioPlayer`.
//
// O QUE NÃO ESTÁ AQUI (leva 2): o Modo Criança em tela cheia e os jogos. A
// RPC já devolve `jogo`; esta tela ainda não o desenha.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
  ActivityIndicator, StatusBar, RefreshControl, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Crianca = {
  id: string;
  nome: string;
  sobrenome: string | null;
  data_nascimento: string | null;
};

type Kit = {
  ok: boolean;
  erro?: string;
  sem_licao?: boolean;
  crianca?: { id: string; nome: string; trilha: 'jardim' | 'exploradores' };
  licao?: {
    id: string; numero: number; data: string; titulo: string;
    base_biblica: string | null; verdade_central: string | null;
  };
  carimbada?: boolean;
  conteudo?: {
    versiculo_texto: string | null; versiculo_ref: string | null;
    historia_titulo: string | null; historia_texto: string | null;
    historia_audio_url: string | null; historia_duracao_s: number | null;
    musica_titulo: string | null; musica_audio_url: string | null;
    video_titulo: string | null; video_youtube_id: string | null;
    atividade_titulo: string | null; atividade_pdf_url: string | null;
    devocional_familia: string | null;
  } | null;
};

type FichaLinha = {
  id: string;
  nome: string;
  sobrenome: string;
  data_nascimento: string | null;
  alergias: string | null;
  necessidades_especiais: string | null;
  info_responsavel: string | null;
  responsavel_nome: string;
};

// ─── Paleta ───────────────────────────────────────────────────────────────────
// Mesma base do resto do app, com o amarelo do logo como cor de acento da
// área infantil — é o que faz o card se distinguir sem inventar uma marca
// nova dentro do próprio app.

function paleta(isDark: boolean) {
  return isDark ? {
    primary: '#100D28', accent: '#F5C842', roxo: '#7B61FF',
    bg: '#0E0B22', surface: '#1C1940', surfaceAlt: '#241F4D',
    text: '#F1EFFA', textMuted: '#A6A0C7', textDim: '#726A99',
    border: '#332D5C', alerta: '#E4695B', alertaBg: 'rgba(228,105,91,0.14)',
  } : {
    primary: '#1A1740', accent: '#C8960A', roxo: '#534AB7',
    bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
    text: '#1A1A2E', textMuted: '#6B7280', textDim: '#9CA3AF',
    border: '#E5E0D8', alerta: '#C0392B', alertaBg: 'rgba(192,57,43,0.09)',
  };
}
type Paleta = ReturnType<typeof paleta>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOCALE_POR_IDIOMA: Record<string, string> = {
  pt: 'pt-BR', en: 'en-GB', es: 'es-ES', fr: 'fr-FR',
};

function idade(nascimentoISO: string | null): number | null {
  if (!nascimentoISO) return null;
  // Lê a string, não `new Date(iso)`: em fuso negativo o construtor volta um
  // dia e a criança "perde" um ano no próprio aniversário.
  const [a, m, d] = nascimentoISO.split('-').map(Number);
  if (!a || !m || !d) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - a;
  const mesAtual = hoje.getMonth() + 1;
  if (mesAtual < m || (mesAtual === m && hoje.getDate() < d)) anos -= 1;
  return anos;
}

function formatData(iso: string, lang: string): string {
  const locale = LOCALE_POR_IDIOMA[lang] ?? 'pt-BR';
  const texto = new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
    day: '2-digit', month: 'long',
  });
  return texto;
}

function iniciais(nome: string): string {
  return (nome.trim()[0] ?? '?').toUpperCase();
}

// ─── Botão de áudio ───────────────────────────────────────────────────────────
// Um player por vez no aparelho inteiro: se a criança toca a música enquanto
// a história corre, a história para. Dois áudios sobrepostos numa tela feita
// para criança de cinco anos não é recurso, é confusão.

let playerAtivo: AudioPlayer | null = null;
let pararAtivo: (() => void) | null = null;

function BotaoAudio({ url, C, grande }: { url: string; C: Paleta; grande?: boolean }) {
  const [tocando, setTocando] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);

  const parar = useCallback(() => {
    try { playerRef.current?.remove(); } catch { /* já removido */ }
    playerRef.current = null;
    setTocando(false);
  }, []);

  // Sair da tela não pode deixar áudio tocando em segundo plano.
  useEffect(() => () => {
    if (pararAtivo === parar) { playerAtivo = null; pararAtivo = null; }
    parar();
  }, [parar]);

  const alternar = useCallback(async () => {
    if (tocando) { playerAtivo = null; pararAtivo = null; parar(); return; }
    try {
      if (pararAtivo) pararAtivo();
      await setAudioModeAsync({ playsInSilentMode: true });
      const p = createAudioPlayer({ uri: url });
      playerRef.current = p;
      playerAtivo = p; pararAtivo = parar;
      p.play();
      setTocando(true);
    } catch {
      parar();
    }
  }, [tocando, url, parar]);

  const d = grande ? 52 : 44;
  return (
    <TouchableOpacity
      onPress={alternar}
      accessibilityRole="button"
      accessibilityLabel={tocando ? 'Parar' : 'Tocar'}
      style={{
        width: d, height: d, borderRadius: d / 2, backgroundColor: C.accent,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Ionicons name={tocando ? 'pause' : 'play'} size={grande ? 24 : 20} color="#1A1740" />
    </TouchableOpacity>
  );
}

// ─── Ficha de segurança da sala ───────────────────────────────────────────────
// Só para quem lidera o infantil e para o admin. A alergia aparece na LINHA
// da lista, não escondida atrás de um toque: quem confere a sala minutos
// antes do lanche não vai abrir o cadastro de cada criança.

function FichaSalaModal({ visible, onClose, C, t }: {
  visible: boolean; onClose: () => void; C: Paleta; t: (k: string) => string;
}) {
  const [linhas, setLinhas] = useState<FichaLinha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const s = useMemo(() => buildStyles(C), [C]);

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    (async () => {
      setCarregando(true);
      const { data } = await supabase.rpc('ficha_seguranca_sala', { p_grupo: 'infantil' });
      if (!vivo) return;
      setLinhas((data ?? []) as FichaLinha[]);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={C.primary} />
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.headerBtn} accessibilityLabel={t('common.fechar')}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={s.headerTitulo}>{t('kids.fichaTitulo')}</Text>
          <View style={s.headerBtn} />
        </View>

        {carregando ? (
          <View style={s.centro}><ActivityIndicator color={C.accent} /></View>
        ) : linhas.length === 0 ? (
          <View style={s.centro}>
            <Ionicons name="people-outline" size={40} color={C.textDim} />
            <Text style={s.vazio}>{t('kids.fichaVazia')}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <Text style={s.fichaAviso}>{t('kids.fichaAviso')}</Text>
            {linhas.map(l => {
              const anos = idade(l.data_nascimento);
              return (
                <View key={l.id} style={s.fichaCard}>
                  <View style={s.fichaTopo}>
                    <View style={s.fichaAvatar}>
                      <Text style={s.fichaAvatarTexto}>{iniciais(l.nome)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fichaNome}>{l.nome} {l.sobrenome}</Text>
                      <Text style={s.fichaSub}>
                        {anos !== null ? t('kids.anos').replace('{{n}}', String(anos)) : '—'}
                        {l.responsavel_nome ? ` · ${l.responsavel_nome}` : ''}
                      </Text>
                    </View>
                  </View>

                  {!!l.alergias && (
                    <View style={s.fichaAlergia}>
                      <Ionicons name="warning" size={17} color={C.alerta} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.fichaAlergiaRotulo}>{t('kids.alergias')}</Text>
                        <Text style={s.fichaAlergiaTexto}>{l.alergias}</Text>
                      </View>
                    </View>
                  )}

                  {!!l.necessidades_especiais && (
                    <View style={s.fichaBloco}>
                      <Text style={s.fichaRotulo}>{t('kids.necessidades')}</Text>
                      <Text style={s.fichaTexto}>{l.necessidades_especiais}</Text>
                    </View>
                  )}

                  {!!l.info_responsavel && (
                    <View style={s.fichaBloco}>
                      <Text style={s.fichaRotulo}>{t('kids.infoResponsavel')}</Text>
                      <Text style={s.fichaTexto}>{l.info_responsavel}</Text>
                    </View>
                  )}
                </View>
              );
            })}
            <View style={s.fichaTrava}>
              <Ionicons name="lock-closed-outline" size={14} color={C.textDim} />
              <Text style={s.fichaTravaTexto}>{t('kids.fichaTrava')}</Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Tela ─────────────────────────────────────────────────────────────────────

export default function PenielKidsScreen() {
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const [criancas, setCriancas] = useState<Crianca[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [podeVerFicha, setPodeVerFicha] = useState(false);
  const [fichaAberta, setFichaAberta] = useState(false);

  // ── Quem sou eu, e quem são meus filhos ───────────────────────────────────
  const carregarCriancas = useCallback(async () => {
    const { data: meuId } = await supabase.rpc('meu_member_id');
    // `pode_editar_kids()` é admin OU líder do grupo infantil. Uma RPC em vez
    // de ler `group_leaders` no cliente: a função é a permissão.
    const { data: podeEditar } = await supabase.rpc('pode_editar_kids');
    setPodeVerFicha(!!podeEditar);

    if (!meuId) { setCriancas([]); return; }
    const { data } = await supabase
      .from('members')
      .select('id, nome, sobrenome, data_nascimento')
      .eq('responsavel_id', meuId)
      .order('data_nascimento', { ascending: true });

    const lista = (data ?? []) as Crianca[];
    setCriancas(lista);
    // Um filho só: entra direto no kit dele, sem uma tela de escolha com um
    // item. Dois ou mais: mantém a escolha anterior se ainda existir.
    setSelecionada(prev => (prev && lista.some(c => c.id === prev) ? prev : lista[0]?.id ?? null));
  }, []);

  const carregarKit = useCallback(async (criancaId: string | null) => {
    if (!criancaId) { setKit(null); return; }
    const { data, error } = await supabase.rpc('kit_da_semana', { p_crianca_id: criancaId });
    if (error) { setKit({ ok: false, erro: error.message }); return; }
    setKit(data as Kit);
  }, []);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      await carregarCriancas();
      setCarregando(false);
    })();
  }, [carregarCriancas]);

  useEffect(() => { carregarKit(selecionada); }, [selecionada, carregarKit]);

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregarCriancas();
    await carregarKit(selecionada);
    setAtualizando(false);
  }, [carregarCriancas, carregarKit, selecionada]);

  const conteudo = kit?.conteudo ?? null;
  const licao = kit?.licao ?? null;
  const trilha = kit?.crianca?.trilha;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.headerBtn}
          accessibilityLabel={t('common.voltar')}
        >
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={s.headerTitulo}>{t('kids.titulo')}</Text>
        {podeVerFicha ? (
          <TouchableOpacity
            onPress={() => setFichaAberta(true)}
            style={s.headerBtn}
            accessibilityLabel={t('kids.fichaTitulo')}
          >
            <Ionicons name="clipboard-outline" size={22} color={C.accent} />
          </TouchableOpacity>
        ) : <View style={s.headerBtn} />}
      </View>

      {carregando ? (
        <View style={s.centro}><ActivityIndicator color={C.accent} /></View>
      ) : criancas.length === 0 ? (
        <View style={s.centro}>
          <Ionicons name="happy-outline" size={44} color={C.textDim} />
          <Text style={s.vazio}>{t('kids.semFilhos')}</Text>
          <TouchableOpacity style={s.botaoVazio} onPress={() => navigation.navigate('MeuCadastro')}>
            <Text style={s.botaoVazioTexto}>{t('kids.irAoCadastro')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          refreshControl={
            <RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={C.accent} />
          }
        >
          {/* Escolha da criança — só com dois ou mais filhos */}
          {criancas.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 9, paddingBottom: 14 }}
            >
              {criancas.map(c => {
                const ativa = c.id === selecionada;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setSelecionada(c.id)}
                    style={[s.pilula, ativa && s.pilulaAtiva]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: ativa }}
                  >
                    <Text style={[s.pilulaTexto, ativa && s.pilulaTextoAtivo]}>{c.nome}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Cabeçalho da lição */}
          {kit && !kit.ok && (
            <View style={s.card}>
              <Text style={s.erro}>{t('kids.erroKit')}</Text>
            </View>
          )}

          {kit?.ok && kit.sem_licao && (
            <View style={s.card}>
              <Ionicons name="calendar-outline" size={26} color={C.textDim} />
              <Text style={s.vazioCard}>{t('kids.semLicao')}</Text>
            </View>
          )}

          {licao && (
            <>
              <View style={s.licaoCard}>
                <View style={s.licaoTopo}>
                  <Text style={s.licaoEtiqueta}>
                    {t('kids.licaoN').replace('{{n}}', String(licao.numero))} ·{' '}
                    {trilha === 'jardim' ? t('kids.trilhaJardim') : t('kids.trilhaExploradores')}
                  </Text>
                  {kit?.carimbada && (
                    <View style={s.carimbo}>
                      <Ionicons name="checkmark-circle" size={14} color={C.accent} />
                      <Text style={s.carimboTexto}>{t('kids.carimbada')}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.licaoTitulo}>{licao.titulo}</Text>
                {!!licao.base_biblica && <Text style={s.licaoBase}>{licao.base_biblica}</Text>}
                {!!licao.verdade_central && (
                  <Text style={s.licaoVerdade}>{licao.verdade_central}</Text>
                )}
                <Text style={s.licaoData}>
                  {t('kids.aulaDe').replace('{{data}}', formatData(licao.data, i18n.language))}
                </Text>
              </View>

              {/* Versículo */}
              {!!conteudo?.versiculo_texto && (
                <View style={s.versiculoCard}>
                  <Text style={s.secaoRotulo}>{t('kids.versiculo')}</Text>
                  <Text style={s.versiculoTexto}>“{conteudo.versiculo_texto}”</Text>
                  {!!conteudo.versiculo_ref && (
                    <Text style={s.versiculoRef}>{conteudo.versiculo_ref}</Text>
                  )}
                </View>
              )}

              {/* História */}
              {(!!conteudo?.historia_titulo || !!conteudo?.historia_audio_url) && (
                <View style={s.card}>
                  <Text style={s.secaoRotulo}>{t('kids.historia')}</Text>
                  <View style={s.linhaAudio}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitulo}>{conteudo?.historia_titulo}</Text>
                      {!!conteudo?.historia_duracao_s && (
                        <Text style={s.cardSub}>
                          {Math.round((conteudo.historia_duracao_s ?? 0) / 60)} min
                        </Text>
                      )}
                    </View>
                    {!!conteudo?.historia_audio_url && (
                      <BotaoAudio url={conteudo.historia_audio_url} C={C} grande />
                    )}
                  </View>
                  {!!conteudo?.historia_texto && (
                    <Text style={s.historiaTexto}>{conteudo.historia_texto}</Text>
                  )}
                </View>
              )}

              {/* Vídeo — embutido, nunca abrindo o YouTube por fora */}
              {!!conteudo?.video_youtube_id && (
                <View style={s.card}>
                  <Text style={s.secaoRotulo}>{t('kids.video')}</Text>
                  <View style={s.videoMoldura}>
                    <WebView
                      style={{ flex: 1, backgroundColor: '#000' }}
                      source={{
                        uri:
                          `https://www.youtube-nocookie.com/embed/${conteudo.video_youtube_id}` +
                          `?rel=0&modestbranding=1&playsinline=1&fs=0`,
                      }}
                      allowsFullscreenVideo={false}
                      mediaPlaybackRequiresUserAction={Platform.OS !== 'android'}
                      javaScriptEnabled
                      domStorageEnabled
                    />
                  </View>
                  {!!conteudo.video_titulo && (
                    <Text style={s.cardTitulo}>{conteudo.video_titulo}</Text>
                  )}
                </View>
              )}

              {/* Música */}
              {!!conteudo?.musica_audio_url && (
                <View style={s.card}>
                  <Text style={s.secaoRotulo}>{t('kids.musica')}</Text>
                  <View style={s.linhaAudio}>
                    <Text style={[s.cardTitulo, { flex: 1 }]}>
                      {conteudo.musica_titulo ?? t('kids.musica')}
                    </Text>
                    <BotaoAudio url={conteudo.musica_audio_url} C={C} />
                  </View>
                </View>
              )}

              {/* Atividade para imprimir */}
              {!!conteudo?.atividade_pdf_url && (
                <TouchableOpacity
                  style={s.card}
                  onPress={() => Linking.openURL(conteudo.atividade_pdf_url as string)}
                  accessibilityRole="button"
                >
                  <Text style={s.secaoRotulo}>{t('kids.atividade')}</Text>
                  <View style={s.linhaAudio}>
                    <Text style={[s.cardTitulo, { flex: 1 }]}>
                      {conteudo.atividade_titulo ?? t('kids.atividade')}
                    </Text>
                    <Ionicons name="download-outline" size={22} color={C.roxo} />
                  </View>
                </TouchableOpacity>
              )}

              {/* Devocional da família */}
              {!!conteudo?.devocional_familia && (
                <View style={s.devocionalCard}>
                  <Text style={s.devocionalRotulo}>{t('kids.devocional')}</Text>
                  <Text style={s.devocionalTexto}>{conteudo.devocional_familia}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      <FichaSalaModal
        visible={fichaAberta}
        onClose={() => setFichaAberta(false)}
        C={C}
        t={t as (k: string) => string}
      />
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

function buildStyles(C: Paleta) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    header: {
      backgroundColor: C.primary, paddingHorizontal: 8, paddingBottom: 14, paddingTop: 6,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerTitulo: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },

    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    vazio: { fontSize: 15, color: C.textMuted, textAlign: 'center', lineHeight: 22 },
    vazioCard: { fontSize: 14.5, color: C.textMuted, textAlign: 'center', marginTop: 8 },
    erro: { fontSize: 14.5, color: C.alerta, textAlign: 'center' },
    botaoVazio: {
      backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22, marginTop: 6,
    },
    botaoVazioTexto: { fontSize: 15, fontWeight: '700', color: '#1A1740' },

    pilula: {
      paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    pilulaAtiva: { backgroundColor: C.primary, borderColor: C.primary },
    pilulaTexto: { fontSize: 14, fontWeight: '600', color: C.textMuted },
    pilulaTextoAtivo: { color: '#FFFFFF' },

    card: {
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border,
      padding: 15, marginBottom: 12,
    },
    cardTitulo: { fontSize: 15.5, fontWeight: '700', color: C.text },
    cardSub: { fontSize: 12.5, color: C.textDim, marginTop: 2 },

    secaoRotulo: {
      fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase',
      color: C.textDim, marginBottom: 9,
    },

    licaoCard: {
      backgroundColor: C.primary, borderRadius: 18, padding: 17, marginBottom: 12,
    },
    licaoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    licaoEtiqueta: {
      fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase',
      color: C.accent,
    },
    carimbo: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(245,200,66,0.18)', borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8,
    },
    carimboTexto: { fontSize: 11, fontWeight: '700', color: C.accent },
    licaoTitulo: { fontSize: 21, fontWeight: '800', color: '#FFFFFF', marginTop: 8, letterSpacing: -0.3 },
    licaoBase: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
    licaoVerdade: {
      fontSize: 14.5, color: 'rgba(255,255,255,0.88)', marginTop: 10, lineHeight: 21, fontStyle: 'italic',
    },
    licaoData: { fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 12 },

    versiculoCard: {
      backgroundColor: C.surfaceAlt, borderRadius: 16, padding: 16, marginBottom: 12,
      borderLeftWidth: 3, borderLeftColor: C.accent,
    },
    versiculoTexto: { fontSize: 16.5, color: C.text, lineHeight: 25, fontWeight: '600' },
    versiculoRef: { fontSize: 12.5, color: C.textMuted, marginTop: 8, fontWeight: '700' },

    linhaAudio: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    historiaTexto: { fontSize: 15, color: C.text, lineHeight: 24, marginTop: 13 },

    videoMoldura: {
      height: 200, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000', marginBottom: 11,
    },

    devocionalCard: {
      backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12,
      borderWidth: 1, borderColor: C.border, borderStyle: 'dashed',
    },
    devocionalRotulo: {
      fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase',
      color: C.roxo, marginBottom: 8,
    },
    devocionalTexto: { fontSize: 15, color: C.text, lineHeight: 23 },

    // ── Ficha da sala ──
    fichaAviso: { fontSize: 13, color: C.textMuted, lineHeight: 19, marginBottom: 14 },
    fichaCard: {
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border,
      padding: 14, marginBottom: 11, gap: 11,
    },
    fichaTopo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    fichaAvatar: {
      width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceAlt,
      alignItems: 'center', justifyContent: 'center',
    },
    fichaAvatarTexto: { fontSize: 18, fontWeight: '800', color: C.accent },
    fichaNome: { fontSize: 16.5, fontWeight: '800', color: C.text },
    fichaSub: { fontSize: 12.5, color: C.textDim, marginTop: 2 },
    fichaAlergia: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      backgroundColor: C.alertaBg, borderRadius: 12, padding: 11,
      borderWidth: 1, borderColor: C.alerta,
    },
    fichaAlergiaRotulo: {
      fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: C.alerta,
    },
    fichaAlergiaTexto: { fontSize: 14.5, fontWeight: '600', color: C.text, marginTop: 3, lineHeight: 20 },
    fichaBloco: { gap: 3 },
    fichaRotulo: {
      fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: C.textDim,
    },
    fichaTexto: { fontSize: 14, color: C.text, lineHeight: 20 },
    fichaTrava: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8, paddingHorizontal: 2,
    },
    fichaTravaTexto: { flex: 1, fontSize: 11.5, color: C.textDim, lineHeight: 17 },
  });
}
