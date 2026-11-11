import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useCampoTraduzido } from '../lib/useTraducao';
import BotaoCompartilharDevocional from '../components/BotaoCompartilharDevocional';
import DevocionalCorpo from '../components/DevocionalCorpo';
import { ProgressoSerie, textoOrdem } from '../components/SeloSerie';
import { SerieDevocional, guardarSeries, useSerie, dataBR } from '../lib/devocionalSeries';

// Tela aberta como modal (presentation: 'modal'): no iOS ela ja comeca abaixo
// da barra de status, mas a area segura continua informando a altura do
// entalhe — somar as duas deixava um vao vazio grande em cima do titulo.
function topoDoModal(insetTop: number) {
  return Platform.OS === 'ios' ? 16 : insetTop + 12;
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Tela "Devocionais" — mostra só UM destino por vez, não tudo junto:
// - aberta pela Home (sem parâmetro) → só os devocionais Geral (grupo NULL).
// - aberta de dentro de um grupo (com `route.params.grupo`) → só os
//   devocionais daquele grupo específico.
// A RLS de `devocionais` já garante que só vem o que a conta tem acesso
// (15ª rodada: Geral ficou público pra todo mundo, logado ou não; grupo
// continua exigindo login + acesso ao grupo) — o filtro de `grupo` aqui é
// só pra não misturar os destinos na mesma lista (antes vinha tudo junto:
// Geral + todos os grupos da pessoa, o que o Marcos não queria).
type Devocional = {
  id: string;
  titulo: string;
  versiculo: string;
  referencia: string;
  texto: string;
  data: string;
  grupo: string | null;
  imagem_url?: string | null;
  serie_id?: string | null;
  ordem_na_serie?: number | null;
};

const GRUPO_LABEL_KEY: Record<string, string> = {
  homens: 'grupos.tabHomens',
  mulheres: 'grupos.tabMulheres',
  jovens: 'grupos.tabAlive',
  estudo_biblico: 'grupos.tabEstudoBiblico',
  infantil: 'grupos.tabInfantil',
};

type Navegacao = { onAnterior?: () => void; onProximo?: () => void };

function DevocionalItem({ dev, aberto, onToggle, totalSerie, nav }: {
  dev: Devocional; aberto: boolean; onToggle: () => void; totalSerie?: number | null; nav?: Navegacao;
}) {
  const { t, i18n } = useTranslation();
  const titulo = useCampoTraduzido(dev.titulo, 'devocionais', dev.id, 'titulo');
  const versiculo = useCampoTraduzido(dev.versiculo, 'devocionais', dev.id, 'versiculo');
  const referencia = useCampoTraduzido(dev.referencia, 'devocionais', dev.id, 'referencia');
  const texto = useCampoTraduzido(dev.texto, 'devocionais', dev.id, 'texto');
  const locale = i18n.language === 'pt' ? 'pt-BR' : i18n.language;
  const dataLabel = new Date(dev.data).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onToggle}>
      <View style={styles.cardHeader}>
        <View style={styles.icone}>
          <Ionicons name="book" size={16} color="#F5C842" />
        </View>
        <View style={{ flex: 1 }}>
          {/* Destino não aparece mais aqui — a tela inteira já é sempre de
              um destino só (Geral ou o grupo escolhido), ver header. */}
          <Text style={styles.data}>
            {dataLabel}
            {!!dev.ordem_na_serie && !!dev.serie_id ? `  ·  ${textoOrdem(t, dev.ordem_na_serie, totalSerie)}` : ''}
          </Text>
          <Text style={styles.titulo}>{titulo}</Text>
        </View>
        <Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color="rgba(255,255,255,0.4)" />
      </View>
      {aberto && (
        <View style={styles.body}>
          <Text style={styles.versiculo}>"{versiculo}"</Text>
          <DevocionalCorpo referencia={referencia} texto={texto} estiloReferencia={styles.referencia} estiloTexto={styles.texto} />
          <BotaoCompartilharDevocional
            original={dev}
            traduzido={{ titulo, versiculo, referencia, texto }}
            corFundo="rgba(245,200,66,0.15)"
            corTexto="#F5C842"
          />
          {nav && (nav.onAnterior || nav.onProximo) && (
            <View style={styles.navSerie}>
              {nav.onAnterior ? (
                <TouchableOpacity style={styles.navBtn} onPress={nav.onAnterior}>
                  <Ionicons name="chevron-back" size={14} color="#F5C842" />
                  <Text style={styles.navTexto}>{t('devocionais.anterior')}</Text>
                </TouchableOpacity>
              ) : <View />}
              {nav.onProximo ? (
                <TouchableOpacity style={styles.navBtn} onPress={nav.onProximo}>
                  <Text style={styles.navTexto}>{t('devocionais.proximo')}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#F5C842" />
                </TouchableOpacity>
              ) : <View />}
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// Card de uma serie na lista geral: capa, nome, situacao e progresso.
function SerieCard({ serie, publicados, capa, onPress }: {
  serie: SerieDevocional; publicados: number; capa?: string | null; onPress: () => void;
}) {
  const { t } = useTranslation();
  const titulo = useCampoTraduzido(serie.titulo, 'devocional_series', serie.id, 'titulo');
  const descricao = useCampoTraduzido(serie.descricao, 'devocional_series', serie.id, 'descricao');
  const total = serie.total_devocionais ?? null;
  const status = publicados === 0
    ? t('devocionais.comecaEm', { data: dataBR(serie.data_inicio) })
    : total && publicados >= total ? t('devocionais.concluida') : t('devocionais.emAndamento');
  const ativo = publicados > 0 && !(total && publicados >= total);
  return (
    <TouchableOpacity style={styles.serieCard} activeOpacity={0.85} onPress={onPress}>
      {capa ? (
        <Image source={{ uri: capa }} style={styles.serieCapa} resizeMode="cover" />
      ) : (
        <View style={[styles.serieCapa, styles.serieCapaVazia]}>
          <Ionicons name="library" size={28} color="rgba(245,200,66,0.6)" />
        </View>
      )}
      <View style={[styles.serieStatus, ativo ? styles.serieStatusAtivo : styles.serieStatusNeutro]}>
        <Text style={[styles.serieStatusTexto, { color: ativo ? '#1A1740' : '#fff' }]}>{status}</Text>
      </View>
      <View style={styles.serieCorpo}>
        <Text style={styles.serieRotulo}>{t('devocionais.serie')}</Text>
        <Text style={styles.serieTitulo}>{titulo}</Text>
        {!!descricao && <Text style={styles.serieDescricao} numberOfLines={2}>{descricao}</Text>}
        <Text style={styles.serieMeta}>
          {total ? t('devocionais.qtdDevocionais', { total }) + '  ·  ' : ''}{t('devocionais.publicados', { n: publicados })}
        </Text>
        <ProgressoSerie ordem={publicados} total={total} />
      </View>
    </TouchableOpacity>
  );
}

export default function DevocionaisScreen({ navigation, route }: { navigation?: any; route?: any }) {
  const { t } = useTranslation();
  // Tres modos:
  // - `route.params.serie` → os devocionais daquela serie, em ordem (1, 2, 3...).
  // - `route.params.grupo` → so os devocionais daquele grupo (aberto pelo grupo).
  // - sem parametro → Geral: primeiro os cards das series, depois os
  //   devocionais avulsos (sem serie). Pedido do Marcos (03/11): a lista
  //   estava longa demais.
  const grupoFiltro: string | null = route?.params?.grupo ?? null;
  const serieFiltro: string | null = route?.params?.serie ?? null;
  const serieAtual = useSerie(serieFiltro);
  const [devocionais, setDevocionais] = useState<Devocional[]>([]);
  const [series, setSeries] = useState<SerieDevocional[]>([]);
  const [loading, setLoading] = useState(true);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const posicoes = useRef<Record<string, number>>({});
  // Abrir UM devocional (11/11/2026): o toque na notificacao (`abrir` = id) ou
  // no card "Novo devocional" do sininho (`abrirTitulo`) traz a pessoa direto
  // para ele, ja aberto e na tela. Se ele e de uma serie, troca para a tela da
  // serie (na lista Geral os de serie ficam dentro do card da serie).
  const abrirId: string | null = route?.params?.abrir ?? null;
  const abrirTitulo: string | null = route?.params?.abrirTitulo ?? null;
  const rolarPara = useRef<string | null>(null);
  const jaAbriu = useRef(false);

  useEffect(() => {
    setLoading(true);
    let query = supabase
      .from('devocionais')
      .select('id, titulo, versiculo, referencia, texto, data, grupo, imagem_url, serie_id, ordem_na_serie');
    if (serieFiltro) query = query.eq('serie_id', serieFiltro).order('ordem_na_serie', { ascending: true });
    else if (grupoFiltro) query = query.eq('grupo', grupoFiltro).order('data', { ascending: false });
    else query = query.is('grupo', null).order('data', { ascending: false });

    const pedidoSeries = !serieFiltro && !grupoFiltro
      ? supabase.from('devocional_series').select('*').eq('ativa', true).order('ordem', { ascending: true })
      : Promise.resolve({ data: [] as any[] });

    Promise.all([query, pedidoSeries]).then(([dev, ser]: any) => {
      setDevocionais((dev.data as Devocional[]) ?? []);
      const lista = (ser.data as SerieDevocional[]) ?? [];
      guardarSeries(lista);
      setSeries(lista);
      setLoading(false);
    });
  }, [grupoFiltro, serieFiltro]);

  useEffect(() => {
    if (loading || jaAbriu.current || (!abrirId && !abrirTitulo)) return;
    jaAbriu.current = true;
    const alvo = abrirId
      ? devocionais.find(d => d.id === abrirId)
      : devocionais.find(d => d.titulo.trim() === abrirTitulo!.trim());
    if (alvo) {
      if (alvo.serie_id && !serieFiltro && !grupoFiltro && navigation?.replace) {
        navigation.replace('Devocionais', { serie: alvo.serie_id, abrir: alvo.id });
        return;
      }
      rolarPara.current = alvo.id;
      setAbertoId(alvo.id);
      const y = posicoes.current[alvo.id];
      if (y != null) {
        rolarPara.current = null;
        setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }), 150);
      }
      return;
    }
    // Nao esta nesta lista (ex.: devocional de grupo aberto sem o grupo):
    // descobre onde ele mora e abre a tela certa.
    if (abrirId && navigation?.replace) {
      supabase.from('devocionais').select('grupo, serie_id').eq('id', abrirId).maybeSingle()
        .then(({ data }: any) => {
          if (data?.serie_id && data.serie_id !== serieFiltro) navigation.replace('Devocionais', { serie: data.serie_id, abrir: abrirId });
          else if (data?.grupo && data.grupo !== grupoFiltro) navigation.replace('Devocionais', { grupo: data.grupo, abrir: abrirId });
        });
    }
  }, [loading, devocionais, abrirId, abrirTitulo, serieFiltro, grupoFiltro, navigation]);

  const subtitulo = serieFiltro
    ? t('devocionais.serie')
    : grupoFiltro ? t(GRUPO_LABEL_KEY[grupoFiltro] ?? grupoFiltro) : t('devocionais.geral');
  const tituloTela = serieFiltro && serieAtual ? serieAtual.tituloTraduzido : t('devocionais.titulo');

  // Geral: os devocionais de serie ficam dentro do card da serie.
  const avulsos = serieFiltro || grupoFiltro ? devocionais : devocionais.filter(d => !d.serie_id);
  // Serie so aparece depois que o primeiro devocional dela sai (pedido do
  // Marcos, 04/11): antes disso fica escondida, sem "Comeca em".
  const seriesComDados = series.map(sr => {
    const daSerie = devocionais.filter(d => d.serie_id === sr.id);
    const maisRecente = daSerie[0]; // lista vem da mais nova para a mais antiga
    return { serie: sr, publicados: daSerie.length, capa: sr.imagem_url ?? maisRecente?.imagem_url ?? null };
  }).filter(x => x.publicados > 0);

  // Anterior/Proximo dentro da serie: abre o vizinho e rola ate ele.
  const abrirVizinho = (id: string) => {
    setAbertoId(id);
    const y = posicoes.current[id];
    if (y != null) setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }), 50);
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topoDoModal(insets.top) }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitulo} numberOfLines={1}>{tituloTela}</Text>
          <Text style={styles.headerSubtitulo}>{subtitulo}</Text>
        </View>
        {navigation && (
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Ionicons name={serieFiltro ? 'chevron-back' : 'close'} size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#F5C842" />
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {serieFiltro && !!serieAtual?.descricao && (
            <Text style={styles.serieIntro}>{serieAtual.descricao}</Text>
          )}

          {seriesComDados.length > 0 && (
            <>
              <Text style={styles.secao}>{t('devocionais.series')}</Text>
              {seriesComDados.map(({ serie, publicados, capa }) => (
                <SerieCard
                  key={serie.id}
                  serie={serie}
                  publicados={publicados}
                  capa={capa}
                  onPress={() => navigation?.push('Devocionais', { serie: serie.id })}
                />
              ))}
              {avulsos.length > 0 && <Text style={styles.secao}>{t('devocionais.outros')}</Text>}
            </>
          )}

          {avulsos.length === 0 && seriesComDados.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={40} color="rgba(255,255,255,0.25)" />
              <Text style={styles.emptyTexto}>{t('devocionais.nenhumDevocional')}</Text>
            </View>
          ) : (
            avulsos.map((dev, i) => (
              <View key={dev.id} onLayout={e => {
                const y = e.nativeEvent.layout.y;
                posicoes.current[dev.id] = y;
                if (rolarPara.current === dev.id) {
                  rolarPara.current = null;
                  setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }), 150);
                }
              }}>
                <DevocionalItem
                  dev={dev}
                  aberto={abertoId === dev.id}
                  onToggle={() => setAbertoId(abertoId === dev.id ? null : dev.id)}
                  totalSerie={serieAtual?.total_devocionais}
                  nav={serieFiltro ? {
                    onAnterior: i > 0 ? () => abrirVizinho(avulsos[i - 1].id) : undefined,
                    onProximo: i < avulsos.length - 1 ? () => abrirVizinho(avulsos[i + 1].id) : undefined,
                  } : undefined}
                />
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Padrao Devocional = verde-petroleo (23/10), igual ao card da Home.
  container: { flex: 1, backgroundColor: '#072B29' },
  header: {
    backgroundColor: '#0B3835', paddingBottom: 16, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitulo: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSubtitulo: { fontSize: 12, color: '#F5C842', marginTop: 2, fontWeight: '600' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 18, paddingBottom: 40 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyTexto: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center' },
  card: {
    backgroundColor: '#0F4A47', borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(245,200,66,0.2)',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icone: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(245,200,66,0.15)', alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { fontSize: 10, fontWeight: '700', color: '#F5C842', textTransform: 'uppercase', letterSpacing: 0.5 },
  data: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  titulo: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 2 },
  body: { marginTop: 14, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.1)' },
  versiculo: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', lineHeight: 20 },
  referencia: { fontSize: 11, fontWeight: '700', color: '#F5C842', marginTop: 6 },
  texto: { fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 20, marginTop: 10 },
  navSerie: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.1)' },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(245,200,66,0.12)' },
  navTexto: { fontSize: 12, fontWeight: '700', color: '#F5C842' },
  secao: { fontSize: 11, fontWeight: '800', color: '#F5C842', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
  serieIntro: { fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 20, marginBottom: 16 },
  serieCard: { backgroundColor: '#0F4A47', borderRadius: 16, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(245,200,66,0.35)' },
  serieCapa: { width: '100%', aspectRatio: 2.6, backgroundColor: '#0B3835' },
  serieCapaVazia: { alignItems: 'center', justifyContent: 'center' },
  serieStatus: { position: 'absolute', top: 10, left: 10, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  serieStatusAtivo: { backgroundColor: '#F5C842' },
  serieStatusNeutro: { backgroundColor: 'rgba(7,43,41,0.85)' },
  serieStatusTexto: { fontSize: 11, fontWeight: '800' },
  serieCorpo: { padding: 14 },
  serieRotulo: { fontSize: 10, fontWeight: '800', color: '#F5C842', textTransform: 'uppercase', letterSpacing: 1 },
  serieTitulo: { fontSize: 17, fontWeight: '800', color: '#fff', marginTop: 2 },
  serieDescricao: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4, lineHeight: 18 },
  serieMeta: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 },
});
