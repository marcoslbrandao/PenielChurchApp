// components/CalendarioAnual.tsx
//
// Abas "Calendário" e "Ano" da Agenda (pedido do Marcos, 11/11/2026).
// Cada categoria com a sua cor e emoji, cara alegre; a pessoa leva todas as
// datas (ou só as que escolher) para o calendário do celular — ver
// lib/calendario.ts. Admin edita tudo; líder de grupo, só a sua categoria.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, Switch, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  CategoriaCal, DataCal, carregarCalendario, minhasCategoriasEditaveis, salvarData, apagarData,
  diaLocal, isoDoDia, cobreDia, horaCurta, assinarCalendario, adicionarUmaData, mascaraHora, horaValida,
} from '../lib/calendario';
import { dataBR, isoDeBR, mascaraData } from '../lib/eventos';
import { useCampoTraduzido } from '../lib/useTraducao';

type Paleta = {
  bg: string; cardBg: string; cardBorder: string; textPrimary: string; textMuted: string; accentText: string; eventoDataBg: string;
};

/** Nome da categoria: em português o que o admin escreveu; nos outros idiomas, a tradução fixa. */
export function useNomeCategoria() {
  const { t, i18n } = useTranslation();
  return useCallback((c?: CategoriaCal) => {
    if (!c) return '';
    if (i18n.language === 'pt') return c.nome;
    return t(`calendario.cat.${c.id}`, { defaultValue: c.nome });
  }, [t, i18n.language]);
}

function useCalendario() {
  const [categorias, setCategorias] = useState<CategoriaCal[]>([]);
  const [datas, setDatas] = useState<DataCal[]>([]);
  const [editaveis, setEditaveis] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const recarregar = useCallback(async (puxou = false) => {
    if (puxou) setAtualizando(true);
    const [r, e] = await Promise.all([carregarCalendario(), minhasCategoriasEditaveis()]);
    setCategorias(r.categorias); setDatas(r.datas); setEditaveis(e);
    setCarregando(false); setAtualizando(false);
  }, []);
  useFocusEffect(useCallback(() => { recarregar(); }, [recarregar]));
  return { categorias, datas, editaveis, carregando, atualizando, recarregar };
}

// ─── Linha de uma data (lista do mês) ─────────────────────────────────────────
function LinhaData({ d, cat, C, podeEditar, onEditar }: {
  d: DataCal; cat?: CategoriaCal; C: Paleta; podeEditar: boolean; onEditar: () => void;
}) {
  const { t } = useTranslation();
  const navegacao = useNavigation<any>();
  const titulo = useCampoTraduzido(d.titulo, 'calendario_datas', d.id, 'titulo');
  const DIAS = t('agenda.diasSemana', { returnObjects: true }) as string[];
  const ini = diaLocal(d.data_inicio);
  const cor = cat?.cor ?? '#534AB7';
  const quando = [
    `${(DIAS[ini.getDay()] ?? '').slice(0, 3)} ${dataBR(d.data_inicio).slice(0, 5)}${d.data_fim ? ` – ${dataBR(d.data_fim).slice(0, 5)}` : ''}`,
    d.hora_inicio ? `${horaCurta(d.hora_inicio)}${d.hora_fim ? `–${horaCurta(d.hora_fim)}` : ''}` : t('calendario.diaInteiro'),
  ].join(' · ');
  return (
    <TouchableOpacity
      activeOpacity={podeEditar ? 0.7 : 1}
      onPress={podeEditar ? onEditar : undefined}
      style={[st.linha, { backgroundColor: C.cardBg, borderColor: cor + '40' }]}
    >
      <View style={[st.emojiBolha, { backgroundColor: cor + '22' }]}>
        <Text style={st.emoji}>{cat?.emoji ?? '📅'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[st.linhaTitulo, { color: C.textPrimary }]} numberOfLines={2}>{titulo}</Text>
        <Text style={[st.linhaSub, { color: C.textMuted }]} numberOfLines={1}>{quando}</Text>
        {!!d.local && <Text style={[st.linhaSub, { color: C.textMuted }]} numberOfLines={1}>📍 {d.local}</Text>}
        {!!d.descricao && <Text style={[st.linhaSub, { color: C.textMuted, marginTop: 3 }]} numberOfLines={3}>{d.descricao}</Text>}
        {!!d.evento_id && (
          <TouchableOpacity onPress={() => navegacao.navigate('Evento', { id: d.evento_id })} style={[st.pilula, { backgroundColor: cor }]}>
            <Ionicons name="ticket-outline" size={13} color="#fff" />
            <Text style={st.pilulaTexto}>{t('eventos.inscricoesAbertasBotao')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        onPress={() => adicionarUmaData(d, cat).catch(() => Alert.alert(t('common.erro'), t('calendario.erroAbrir')))}
        hitSlop={8}
        accessibilityLabel={t('calendario.adicionarData')}
        style={[st.mais, { backgroundColor: cor + '1A' }]}
      >
        <Ionicons name="add" size={20} color={cor} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// Linha da visão do ano (título traduzido como na lista do mês).
function MiniLinha({ d, cor, C, mesIni }: { d: DataCal; cor?: string; C: Paleta; mesIni: string }) {
  const titulo = useCampoTraduzido(d.titulo, 'calendario_datas', d.id, 'titulo');
  // Evento que começou no mês anterior mostra o dia 01.
  const dia = d.data_inicio < mesIni ? '01' : d.data_inicio.slice(8, 10);
  return (
    <View style={st.miniLinha}>
      <View style={[st.ponto, { backgroundColor: cor }]} />
      <Text style={[st.miniTexto, { color: C.textPrimary }]} numberOfLines={1}>
        <Text style={{ fontWeight: '800' }}>{dia}</Text> {titulo}
      </Text>
    </View>
  );
}

// ─── "Levar para o meu calendário" ────────────────────────────────────────────
function ModalAssinar({ visivel, onFechar, categorias, C }: {
  visivel: boolean; onFechar: () => void; categorias: CategoriaCal[]; C: Paleta;
}) {
  const { t } = useTranslation();
  const nomeCat = useNomeCategoria();
  const [tudo, setTudo] = useState(true);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  useEffect(() => { if (visivel) { setTudo(true); setEscolhidas(new Set()); } }, [visivel]);
  const alternar = (id: string) => setEscolhidas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const confirmar = () => {
    if (!tudo && escolhidas.size === 0) { Alert.alert(t('calendario.escolhaUma')); return; }
    onFechar();
    assinarCalendario(tudo ? null : [...escolhidas]).catch(() => Alert.alert(t('common.erro'), t('calendario.erroAbrir')));
  };
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <View style={st.fundoModal}>
        <View style={[st.folha, { backgroundColor: C.cardBg }]}>
          <Text style={st.folhaEmoji}>📲🗓️</Text>
          <Text style={[st.folhaTitulo, { color: C.textPrimary }]}>{t('calendario.assinarTitulo')}</Text>
          <Text style={[st.folhaSub, { color: C.textMuted }]}>{t('calendario.assinarExplica')}</Text>

          {[true, false].map(op => (
            <TouchableOpacity key={String(op)} onPress={() => setTudo(op)} style={[st.opcao, { borderColor: tudo === op ? '#534AB7' : C.cardBorder }]}>
              <Ionicons name={tudo === op ? 'radio-button-on' : 'radio-button-off'} size={20} color="#534AB7" />
              <Text style={[st.opcaoTexto, { color: C.textPrimary }]}>{op ? t('calendario.tudo') : t('calendario.soEscolhidas')}</Text>
            </TouchableOpacity>
          ))}

          {!tudo && (
            <View style={st.chipsQuebra}>
              {categorias.filter(c => c.ativa).map(c => {
                const on = escolhidas.has(c.id);
                return (
                  <TouchableOpacity key={c.id} onPress={() => alternar(c.id)}
                    style={[st.chip, { backgroundColor: on ? c.cor : c.cor + '18', borderColor: c.cor }]}>
                    <Text style={[st.chipTexto, { color: on ? '#fff' : c.cor }]}>{on ? '✓ ' : ''}{c.emoji} {nomeCat(c)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <TouchableOpacity onPress={confirmar} style={st.botaoGrande}>
            <Ionicons name="calendar" size={18} color="#fff" />
            <Text style={st.botaoGrandeTexto}>{t('calendario.assinar')}</Text>
          </TouchableOpacity>
          <Text style={[st.folhaNota, { color: C.textMuted }]}>
            {Platform.OS === 'ios' ? t('calendario.notaIphone') : t('calendario.notaAndroid')}
          </Text>
          <TouchableOpacity onPress={onFechar} style={{ alignSelf: 'center', padding: 10 }}>
            <Text style={{ color: C.textMuted, fontWeight: '700' }}>{t('common.cancelar')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Editor (admin e líderes) ─────────────────────────────────────────────────
function EditorData({ visivel, inicial, diaSugerido, categorias, editaveis, C, onFechar, onSalvo }: {
  visivel: boolean; inicial: DataCal | null; diaSugerido: string | null; categorias: CategoriaCal[];
  editaveis: string[]; C: Paleta; onFechar: () => void; onSalvo: () => void;
}) {
  const { t } = useTranslation();
  const nomeCat = useNomeCategoria();
  const [cat, setCat] = useState('');
  const [titulo, setTitulo] = useState('');
  const [ini, setIni] = useState('');
  const [fim, setFim] = useState('');
  const [diaInteiro, setDiaInteiro] = useState(true);
  const [hIni, setHIni] = useState('');
  const [hFim, setHFim] = useState('');
  const [local, setLocal] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const minhas = categorias.filter(c => editaveis.includes(c.id) && (c.ativa || c.id === inicial?.categoria_id));

  useEffect(() => {
    if (!visivel) return;
    setCat(inicial?.categoria_id ?? minhas[0]?.id ?? '');
    setTitulo(inicial?.titulo ?? '');
    setIni(inicial ? dataBR(inicial.data_inicio) : diaSugerido ? dataBR(diaSugerido) : '');
    setFim(inicial?.data_fim ? dataBR(inicial.data_fim) : '');
    setDiaInteiro(!inicial?.hora_inicio);
    setHIni(horaCurta(inicial?.hora_inicio ?? null));
    setHFim(horaCurta(inicial?.hora_fim ?? null));
    setLocal(inicial?.local ?? '');
    setDescricao(inicial?.descricao ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel, inicial, diaSugerido]);

  const salvar = async () => {
    if (!titulo.trim()) return Alert.alert(t('calendario.erroTitulo'));
    const isoIni = isoDeBR(ini);
    if (!isoIni) return Alert.alert(t('calendario.erroData'));
    const isoFim = fim.trim() ? isoDeBR(fim) : null;
    if (fim.trim() && !isoFim) return Alert.alert(t('calendario.erroData'));
    if (isoFim && isoFim < isoIni) return Alert.alert(t('calendario.erroDataFim'));
    if (!diaInteiro && (!horaValida(hIni) || (hFim.trim() && !horaValida(hFim)))) return Alert.alert(t('calendario.erroHora'));
    setSalvando(true);
    const r = await salvarData({
      id: inicial?.id, categoria_id: cat, titulo, data_inicio: isoIni,
      data_fim: isoFim && isoFim !== isoIni ? isoFim : null,
      hora_inicio: diaInteiro ? null : hIni, hora_fim: diaInteiro || !hFim.trim() ? null : hFim,
      local, descricao,
    });
    setSalvando(false);
    if (r !== 'ok') return Alert.alert(t('common.erro'), r);
    onSalvo();
  };

  const apagar = () => {
    if (!inicial) return;
    Alert.alert(t('calendario.apagarTitulo'), t('calendario.apagarTexto', { titulo: inicial.titulo }), [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('calendario.apagar'), style: 'destructive', onPress: async () => {
          const r = await apagarData(inicial.id);
          if (r !== 'ok') return Alert.alert(t('common.erro'), r);
          onSalvo();
        },
      },
    ]);
  };

  const campo = [st.campo, { color: C.textPrimary, borderColor: C.cardBorder, backgroundColor: C.bg }];
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.fundoModal}>
        <View style={[st.folha, { backgroundColor: C.cardBg, maxHeight: '92%' }]}>
          <Text style={[st.folhaTitulo, { color: C.textPrimary, marginBottom: 10 }]}>
            {inicial ? t('calendario.editarData') : t('calendario.novaData')}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[st.rotulo, { color: C.textMuted }]}>{t('calendario.categoria')}</Text>
            <View style={st.chipsQuebra}>
              {minhas.map(c => {
                const on = c.id === cat;
                return (
                  <TouchableOpacity key={c.id} onPress={() => setCat(c.id)}
                    style={[st.chip, { backgroundColor: on ? c.cor : c.cor + '18', borderColor: c.cor }]}>
                    <Text style={[st.chipTexto, { color: on ? '#fff' : c.cor }]}>{c.emoji} {nomeCat(c)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[st.rotulo, { color: C.textMuted }]}>{t('calendario.titulo')}</Text>
            <TextInput style={campo} value={titulo} onChangeText={setTitulo} maxLength={120} placeholder={t('calendario.tituloEx')} placeholderTextColor={C.textMuted} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[st.rotulo, { color: C.textMuted }]}>{t('calendario.dataInicio')}</Text>
                <TextInput style={campo} value={ini} onChangeText={v => setIni(mascaraData(v))} keyboardType="number-pad" placeholder="DD/MM/AAAA" placeholderTextColor={C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.rotulo, { color: C.textMuted }]}>{t('calendario.dataFim')}</Text>
                <TextInput style={campo} value={fim} onChangeText={v => setFim(mascaraData(v))} keyboardType="number-pad" placeholder="DD/MM/AAAA" placeholderTextColor={C.textMuted} />
              </View>
            </View>
            <View style={st.linhaSwitch}>
              <Text style={[st.opcaoTexto, { color: C.textPrimary }]}>{t('calendario.diaInteiro')}</Text>
              <Switch value={diaInteiro} onValueChange={setDiaInteiro} trackColor={{ true: '#534AB7' }} />
            </View>
            {!diaInteiro && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.rotulo, { color: C.textMuted }]}>{t('calendario.horaInicio')}</Text>
                  <TextInput style={campo} value={hIni} onChangeText={v => setHIni(mascaraHora(v))} keyboardType="number-pad" placeholder="18:00" placeholderTextColor={C.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.rotulo, { color: C.textMuted }]}>{t('calendario.horaFim')}</Text>
                  <TextInput style={campo} value={hFim} onChangeText={v => setHFim(mascaraHora(v))} keyboardType="number-pad" placeholder="20:00" placeholderTextColor={C.textMuted} />
                </View>
              </View>
            )}
            <Text style={[st.rotulo, { color: C.textMuted }]}>{t('calendario.local')}</Text>
            <TextInput style={campo} value={local} onChangeText={setLocal} maxLength={200} />
            <Text style={[st.rotulo, { color: C.textMuted }]}>{t('calendario.descricao')}</Text>
            <TextInput style={[campo, { minHeight: 70, textAlignVertical: 'top' }]} value={descricao} onChangeText={setDescricao} multiline maxLength={2000} />

            <TouchableOpacity onPress={salvar} disabled={salvando || !cat} style={[st.botaoGrande, (salvando || !cat) && { opacity: 0.6 }]}>
              {salvando ? <ActivityIndicator color="#fff" /> : <Text style={st.botaoGrandeTexto}>{t('calendario.salvar')}</Text>}
            </TouchableOpacity>
            {!!inicial && (
              <TouchableOpacity onPress={apagar} style={{ alignSelf: 'center', padding: 10 }}>
                <Text style={{ color: '#D93025', fontWeight: '700' }}>{t('calendario.apagar')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onFechar} style={{ alignSelf: 'center', padding: 10 }}>
              <Text style={{ color: C.textMuted, fontWeight: '700' }}>{t('common.cancelar')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Tela ─────────────────────────────────────────────────────────────────────
export default function CalendarioAnual({ modo, C, onAbrirMes, mesInicial }: {
  modo: 'mes' | 'ano'; C: Paleta;
  /** Na visão do ano, tocar num mês abre esse mês na aba Calendário. */
  onAbrirMes?: (primeiroDia: Date) => void;
  mesInicial?: Date | null;
}) {
  const { t } = useTranslation();
  const nomeCat = useNomeCategoria();
  const MESES = t('agenda.mesesLongos', { returnObjects: true }) as string[];
  const DIAS = t('calendario.diasCurtos', { returnObjects: true }) as string[];
  const { categorias, datas, editaveis, carregando, atualizando, recarregar } = useCalendario();
  const hoje = isoDoDia(new Date());

  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [diaSel, setDiaSel] = useState<string | null>(null);
  useEffect(() => { if (mesInicial) { setMes(mesInicial); setDiaSel(null); } }, [mesInicial]);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [assinar, setAssinar] = useState(false);
  const [editor, setEditor] = useState<{ d: DataCal | null } | null>(null);

  const porCat = useMemo(() => new Map(categorias.map(c => [c.id, c])), [categorias]);
  const ativas = categorias.filter(c => c.ativa);
  const visiveis = useMemo(
    () => datas.filter(d => porCat.get(d.categoria_id)?.ativa && (!filtro || d.categoria_id === filtro)),
    [datas, porCat, filtro],
  );

  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} style={{ marginBottom: 12 }}>
      <TouchableOpacity onPress={() => setFiltro(null)} style={[st.chip, { backgroundColor: !filtro ? '#1A1740' : C.cardBg, borderColor: '#1A1740' + '40' }]}>
        <Text style={[st.chipTexto, { color: !filtro ? '#fff' : C.textPrimary }]}>🌈 {t('calendario.todas')}</Text>
      </TouchableOpacity>
      {ativas.map(c => {
        const on = filtro === c.id;
        return (
          <TouchableOpacity key={c.id} onPress={() => setFiltro(on ? null : c.id)}
            style={[st.chip, { backgroundColor: on ? c.cor : c.cor + '18', borderColor: c.cor + '66' }]}>
            <Text style={[st.chipTexto, { color: on ? '#fff' : c.cor }]}>{c.emoji} {nomeCat(c)}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const botaoAssinar = (
    <TouchableOpacity onPress={() => setAssinar(true)} activeOpacity={0.85} style={st.bannerAssinar}>
      <Text style={{ fontSize: 26 }}>📲</Text>
      <View style={{ flex: 1 }}>
        <Text style={st.bannerTitulo}>{t('calendario.adicionarMeu')}</Text>
        <Text style={st.bannerSub}>{t('calendario.adicionarMeuSub')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#fff" />
    </TouchableOpacity>
  );

  const refresh = <RefreshControl refreshing={atualizando} onRefresh={() => recarregar(true)} tintColor="#534AB7" />;

  if (carregando) return <ActivityIndicator color="#534AB7" style={{ marginTop: 40 }} />;

  // ── Visão do ANO ──
  if (modo === 'ano') {
    return (
      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }} refreshControl={refresh}>
          <View style={st.navMes}>
            <TouchableOpacity onPress={() => setAno(a => a - 1)} hitSlop={10}><Ionicons name="chevron-back" size={22} color={C.accentText} /></TouchableOpacity>
            <Text style={[st.navTitulo, { color: C.textPrimary }]}>{ano}</Text>
            <TouchableOpacity onPress={() => setAno(a => a + 1)} hitSlop={10}><Ionicons name="chevron-forward" size={22} color={C.accentText} /></TouchableOpacity>
          </View>
          {chips}
          {botaoAssinar}
          <View style={st.gradeAno}>
            {MESES.map((nome, m) => {
              const ini = `${ano}-${String(m + 1).padStart(2, '0')}-01`;
              const fim = `${ano}-${String(m + 1).padStart(2, '0')}-31`;
              const doMes = visiveis.filter(d => d.data_inicio <= fim && (d.data_fim ?? d.data_inicio) >= ini);
              const corTopo = doMes[0] ? porCat.get(doMes[0].categoria_id)?.cor ?? '#534AB7' : C.cardBorder;
              const ehMesAtual = ano === new Date().getFullYear() && m === new Date().getMonth();
              return (
                <TouchableOpacity key={m} activeOpacity={0.8}
                  onPress={() => onAbrirMes?.(new Date(ano, m, 1))}
                  style={[st.miniMes, { backgroundColor: C.cardBg, borderColor: ehMesAtual ? '#F5C842' : C.cardBorder, borderWidth: ehMesAtual ? 1.5 : 0.5 }]}>
                  <View style={[st.miniTopo, { backgroundColor: corTopo }]} />
                  <Text style={[st.miniNome, { color: C.textPrimary }]}>{nome}</Text>
                  {doMes.length === 0 && <Text style={[st.miniVazio, { color: C.textMuted }]}>—</Text>}
                  {doMes.slice(0, 4).map(d => (
                    <MiniLinha key={d.id} d={d} cor={porCat.get(d.categoria_id)?.cor} C={C} mesIni={ini} />
                  ))}
                  {doMes.length > 4 && <Text style={[st.miniVazio, { color: C.accentText }]}>{t('calendario.maisN', { n: doMes.length - 4 })}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[st.dica, { color: C.textMuted }]}>{t('calendario.toqueMes')}</Text>
        </ScrollView>
        <ModalAssinar visivel={assinar} onFechar={() => setAssinar(false)} categorias={categorias} C={C} />
      </View>
    );
  }

  // ── Visão do MÊS ──
  const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celulas: (string | null)[] = [
    ...Array(primeiro.getDay()).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => isoDoDia(new Date(mes.getFullYear(), mes.getMonth(), i + 1))),
  ];
  while (celulas.length % 7) celulas.push(null);
  const iniMes = isoDoDia(primeiro);
  const fimMes = isoDoDia(new Date(mes.getFullYear(), mes.getMonth(), diasNoMes));
  const doMes = visiveis.filter(d => d.data_inicio <= fimMes && (d.data_fim ?? d.data_inicio) >= iniMes);
  const lista = diaSel ? doMes.filter(d => cobreDia(d, diaSel)) : doMes;
  const mudarMes = (n: number) => { setMes(m => new Date(m.getFullYear(), m.getMonth() + n, 1)); setDiaSel(null); };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 90 }} refreshControl={refresh}>
        <View style={st.navMes}>
          <TouchableOpacity onPress={() => mudarMes(-1)} hitSlop={10}><Ionicons name="chevron-back" size={22} color={C.accentText} /></TouchableOpacity>
          <Text style={[st.navTitulo, { color: C.textPrimary }]}>{MESES[mes.getMonth()]} {mes.getFullYear()}</Text>
          <TouchableOpacity onPress={() => mudarMes(1)} hitSlop={10}><Ionicons name="chevron-forward" size={22} color={C.accentText} /></TouchableOpacity>
        </View>
        {chips}

        <View style={[st.grade, { backgroundColor: C.cardBg, borderColor: C.cardBorder }]}>
          <View style={st.semana}>
            {DIAS.map((d, i) => <Text key={i} style={[st.diaSemana, { color: i === 0 ? '#E84B1A' : C.textMuted }]}>{d}</Text>)}
          </View>
          {Array.from({ length: celulas.length / 7 }, (_, s) => (
            <View key={s} style={st.semana}>
              {celulas.slice(s * 7, s * 7 + 7).map((iso, i) => {
                if (!iso) return <View key={i} style={st.celula} />;
                const doDia = doMes.filter(d => cobreDia(d, iso));
                const cores = [...new Set(doDia.map(d => porCat.get(d.categoria_id)?.cor ?? '#534AB7'))];
                const sel = diaSel === iso;
                const ehHoje = iso === hoje;
                return (
                  <TouchableOpacity key={i} style={st.celula} onPress={() => setDiaSel(sel ? null : iso)} activeOpacity={0.7}>
                    <View style={[
                      st.numeroBolha,
                      cores.length > 0 && { backgroundColor: cores[0] + '22' },
                      ehHoje && { backgroundColor: '#F5C842' },
                      sel && { backgroundColor: cores[0] ?? '#534AB7' },
                    ]}>
                      <Text style={[st.numero, { color: C.textPrimary }, (ehHoje || sel) && { color: sel ? '#fff' : '#1A1740', fontWeight: '800' }, cores.length > 0 && !sel && { fontWeight: '800' }]}>
                        {Number(iso.slice(8, 10))}
                      </Text>
                    </View>
                    <View style={st.pontos}>
                      {cores.slice(0, 3).map(c => <View key={c} style={[st.ponto, { backgroundColor: c }]} />)}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {botaoAssinar}

        <Text style={[st.secao, { color: C.textPrimary }]}>
          {diaSel ? `📌 ${dataBR(diaSel)}` : `✨ ${MESES[mes.getMonth()]}`}
        </Text>
        {lista.length === 0 && (
          <Text style={[st.dica, { color: C.textMuted, textAlign: 'left' }]}>
            {diaSel ? t('calendario.nenhumaNoDia') : t('calendario.nenhumaNoMes')}
          </Text>
        )}
        {lista.map(d => (
          <LinhaData key={d.id} d={d} cat={porCat.get(d.categoria_id)} C={C}
            podeEditar={editaveis.includes(d.categoria_id)} onEditar={() => setEditor({ d })} />
        ))}
      </ScrollView>

      {editaveis.length > 0 && (
        <TouchableOpacity style={st.fab} onPress={() => setEditor({ d: null })} activeOpacity={0.85}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={st.fabTexto}>{t('calendario.novaData')}</Text>
        </TouchableOpacity>
      )}

      <ModalAssinar visivel={assinar} onFechar={() => setAssinar(false)} categorias={categorias} C={C} />
      <EditorData
        visivel={!!editor} inicial={editor?.d ?? null} diaSugerido={diaSel} categorias={categorias}
        editaveis={editaveis} C={C} onFechar={() => setEditor(null)}
        onSalvo={() => { setEditor(null); recarregar(); }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  navMes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
  navTitulo: { fontSize: 19, fontWeight: '800' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipTexto: { fontSize: 12.5, fontWeight: '700' },
  chipsQuebra: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  grade: { borderRadius: 18, borderWidth: 0.5, padding: 8, marginBottom: 14 },
  semana: { flexDirection: 'row' },
  diaSemana: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', paddingVertical: 6 },
  celula: { flex: 1, alignItems: 'center', paddingVertical: 4, minHeight: 48 },
  numeroBolha: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  numero: { fontSize: 14 },
  pontos: { flexDirection: 'row', gap: 3, marginTop: 3, height: 6 },
  ponto: { width: 6, height: 6, borderRadius: 3 },
  bannerAssinar: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, marginBottom: 16,
    backgroundColor: '#534AB7',
  },
  bannerTitulo: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bannerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  secao: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 10 },
  emojiBolha: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  linhaTitulo: { fontSize: 14.5, fontWeight: '700' },
  linhaSub: { fontSize: 12, marginTop: 2 },
  mais: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pilula: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pilulaTexto: { color: '#fff', fontWeight: '800', fontSize: 12 },
  dica: { fontSize: 12.5, textAlign: 'center', marginVertical: 8 },
  gradeAno: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  miniMes: { width: '48.5%', borderRadius: 14, overflow: 'hidden', paddingBottom: 10, minHeight: 92 },
  miniTopo: { height: 5 },
  miniNome: { fontSize: 13.5, fontWeight: '800', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  miniVazio: { fontSize: 12, paddingHorizontal: 10 },
  miniLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 2 },
  miniTexto: { fontSize: 11.5, flex: 1 },
  fab: {
    position: 'absolute', right: 16, bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E84B1A', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  fabTexto: { color: '#fff', fontWeight: '800', fontSize: 14 },
  fundoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  folha: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
  folhaEmoji: { fontSize: 34, textAlign: 'center' },
  folhaTitulo: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  folhaSub: { fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 14, lineHeight: 19 },
  folhaNota: { fontSize: 11.5, textAlign: 'center', marginTop: 10, lineHeight: 16 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, padding: 12, marginBottom: 8 },
  opcaoTexto: { fontSize: 14.5, fontWeight: '600', flex: 1 },
  botaoGrande: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#534AB7', borderRadius: 14, paddingVertical: 14, marginTop: 10 },
  botaoGrandeTexto: { color: '#fff', fontWeight: '800', fontSize: 15 },
  rotulo: { fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  campo: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  linhaSwitch: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
});
