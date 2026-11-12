// components/EventoGestaoModal.tsx
//
// Gestão de um evento com inscrição (11/11/2026): admin, tesouraria e líder
// do evento. Abas: Inscritos · Configurar · Equipe.
//
// • Dinheiro (pagamento manual, desconto, reembolso) e configuração: só
//   tesouraria e admin. O líder vê o painel, confirma a lista de espera e
//   monta a equipe. (As regras estão no banco; aqui só a tela.)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, TextInput,
  Switch, Platform, KeyboardAvoidingView, Share, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { useAcesso } from '../lib/acesso';
import { useTheme, type ThemeColors } from '../lib/theme';
import {
  painelEvento, detalheInscricao, registrarPagamento, definirDesconto, definirStatus, salvarConfig,
  definirEquipe, removerDaEquipe, definirPagamento, libras, dataBR, isoDeBR, mascaraData, PRECOS_PADRAO, PERGUNTAS_PADRAO,
  type DetalhesEvento, type LinhaPainel, type Preco, type Pergunta,
} from '../lib/eventos';

type Aba = 'inscritos' | 'config' | 'equipe';
type Filtro = 'todos' | 'saldo' | 'quitados' | 'espera' | 'cancelada';

export default function EventoGestaoModal({ visible, eventoId, eventoNome, cor, detalhes, onClose }: {
  visible: boolean; eventoId: string; eventoNome: string; cor: string; detalhes: DetalhesEvento; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { ehAdmin } = useAcesso();
  const { colors: C } = useTheme();
  const s = useMemo(() => estilos(C), [C]);
  const insets = useSafeAreaInsets();

  const [aba, setAba] = useState<Aba>('inscritos');
  const [tesouraria, setTesouraria] = useState(false);
  const [linhas, setLinhas] = useState<LinhaPainel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Pagamento manual / desconto
  const [pgValor, setPgValor] = useState('');
  const [pgForma, setPgForma] = useState<'dinheiro' | 'transferencia' | 'reembolso'>('dinheiro');
  const [pgObs, setPgObs] = useState('');
  const [descValor, setDescValor] = useState('');

  const podeDinheiro = ehAdmin || tesouraria;
  // Só inscrição (12/11/2026): sem valores, pagamentos nem desconto.
  const comPag = detalhes.config?.com_pagamento !== false;

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [l, tes] = await Promise.all([
      painelEvento(eventoId),
      user?.id ? supabase.from('tesouraria_eventos').select('user_id').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setLinhas(l);
    setTesouraria(!!(tes as any)?.data);
    setCarregando(false);
  }, [eventoId, user?.id]);

  useEffect(() => { if (visible) carregar(); }, [visible, carregar]);

  const filtradas = linhas.filter(l =>
    filtro === 'todos' ? l.status !== 'cancelada'
      : filtro === 'saldo' ? l.status === 'confirmada' && l.saldo > 0
        : filtro === 'quitados' ? l.status === 'confirmada' && l.saldo <= 0
          : l.status === filtro);
  const ativas = linhas.filter(l => l.status === 'confirmada');
  const totais = {
    pessoas: ativas.reduce((a, l) => a + l.pessoas, 0),
    esperado: ativas.reduce((a, l) => a + l.total - l.desconto, 0),
    arrecadado: linhas.reduce((a, l) => a + l.pago, 0),
    falta: ativas.reduce((a, l) => a + l.saldo, 0),
  };

  const abrirDetalhe = async (id: string) => {
    setPgValor(''); setPgObs(''); setPgForma('dinheiro');
    const d = await detalheInscricao(id);
    setDescValor(d ? String(d.desconto ?? 0) : '0');
    setDetalhe(d);
  };

  const registrar = async () => {
    const v = Number(pgValor.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) { Alert.alert(t('eventos.titulo'), t('eventos.valorMinimo')); return; }
    setOcupado(true);
    const r = await registrarPagamento(detalhe.id, v, pgForma, pgObs);
    setOcupado(false);
    if (r !== 'ok') { Alert.alert(t('eventos.titulo'), t('eventos.semPermissao')); return; }
    await abrirDetalhe(detalhe.id); carregar();
  };

  const salvarDesconto = async () => {
    const v = Number(descValor.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) return;
    const r = await definirDesconto(detalhe.id, v);
    if (r !== 'ok') { Alert.alert(t('eventos.titulo'), t('eventos.semPermissao')); return; }
    await abrirDetalhe(detalhe.id); carregar();
  };

  const mudarStatus = (status: string) => {
    const msg = status === 'cancelada' ? t('eventos.gCancelarConfirma') : t('eventos.gStatusConfirma', { status: t(`eventos.status_${status}`) });
    Alert.alert(t('eventos.titulo'), msg, [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: 'OK', onPress: async () => {
          const r = await definirStatus(detalhe.id, status);
          if (r !== 'ok') { Alert.alert(t('eventos.titulo'), t('eventos.semPermissao')); return; }
          await abrirDetalhe(detalhe.id); carregar();
        },
      },
    ]);
  };

  const exportar = async () => {
    const cab = ['Responsável', 'Status', 'Pessoas', 'Nomes', 'Total', 'Desconto', 'Pago', 'Falta', 'Inscrito em'];
    const csv = [cab, ...linhas.map(l => [l.responsavel_nome, l.status, l.pessoas, l.nomes ?? '', l.total, l.desconto, l.pago, l.saldo, dataBR(l.created_at)])]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    await Share.share({ message: csv, title: `${eventoNome} — inscritos.csv` });
  };

  const abas: { k: Aba; r: string }[] = [
    { k: 'inscritos', r: t('eventos.gInscritos') },
    { k: 'config', r: t('eventos.gConfigurar') },
    { k: 'equipe', r: t('eventos.abaEquipe') },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={detalhe ? () => setDetalhe(null) : onClose}>
      <KeyboardAvoidingView style={s.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.header, { paddingTop: insets.top + 12, backgroundColor: cor }]}>
          <TouchableOpacity style={[s.headerBtn, { marginRight: 10 }]} onPress={detalhe ? () => setDetalhe(null) : onClose}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitulo} numberOfLines={1}>{detalhe ? detalhe.responsavel : `${t('eventos.gerenciar')} · ${eventoNome}`}</Text>
          {!detalhe && aba === 'inscritos' && linhas.length > 0 && (
            <TouchableOpacity style={s.headerBtn} onPress={exportar}><Ionicons name="share-outline" size={18} color="#fff" /></TouchableOpacity>
          )}
        </View>

        {detalhe ? (
          // ── Detalhe de uma inscrição ──────────────────────────────────────
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
            {comPag && <View style={s.trio}>
              <Trio r={t('eventos.total')} v={libras(detalhe.total - detalhe.desconto)} s={s} />
              <Trio r={t('eventos.pago')} v={libras(detalhe.pago)} s={s} cor={C.success} />
              <Trio r={t('eventos.falta')} v={libras(detalhe.saldo)} s={s} cor={detalhe.saldo > 0 ? cor : C.success} />
            </View>}
            <Text style={s.sub}>{t(`eventos.status_${detalhe.status}`)} · {t('eventos.inscritoEm', { data: dataBR(detalhe.created_at) })}</Text>

            <Text style={s.titulo}>{t('eventos.quemVai')}</Text>
            {(detalhe.pessoas ?? []).map((p: any, i: number) => (
              <View key={i} style={s.linha}>
                <View style={{ flex: 1 }}>
                  <Text style={s.forte}>{p.nome}{p.idade != null ? ` (${p.idade})` : ''}</Text>
                  {Object.entries(p.respostas ?? {}).map(([q, r]) => <Text key={q} style={s.sub}>{q}: {String(r)}</Text>)}
                </View>
                {comPag && <Text style={s.forte}>{libras(p.valor)}</Text>}
              </View>
            ))}

            {comPag && <Text style={s.titulo}>{t('eventos.pagamentos')}</Text>}
            {!comPag ? null : (detalhe.pagamentos ?? []).length === 0 ? <Text style={s.sub}>{t('eventos.nenhumPagamento')}</Text> :
              detalhe.pagamentos.map((g: any, i: number) => (
                <View key={i} style={s.linha}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.forte}>{dataBR(g.pago_em)} · {t(`eventos.forma_${g.forma}`, { defaultValue: g.forma })}</Text>
                    {!!(g.observacao || g.por) && <Text style={s.sub}>{[g.observacao, g.por && t('eventos.registradoPor', { nome: g.por })].filter(Boolean).join(' · ')}</Text>}
                  </View>
                  <Text style={[s.forte, { color: g.valor < 0 ? C.danger : C.success }]}>{libras(g.valor)}</Text>
                </View>
              ))}

            {podeDinheiro && comPag && (
              <>
                <Text style={s.titulo}>{t('eventos.gRegistrarPagamento')}</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {(['dinheiro', 'transferencia', 'reembolso'] as const).map(f => (
                    <TouchableOpacity key={f} onPress={() => setPgForma(f)} style={[s.chip, pgForma === f && { backgroundColor: cor, borderColor: cor }]}>
                      <Text style={{ color: pgForma === f ? '#fff' : C.text, fontWeight: '600' }}>{t(`eventos.forma_${f}`)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TextInput style={[s.campo, { flex: 1 }]} placeholder="£" keyboardType="decimal-pad" value={pgValor} onChangeText={setPgValor} placeholderTextColor={C.textDim} />
                  <TextInput style={[s.campo, { flex: 2 }]} placeholder={t('eventos.observacao')} value={pgObs} onChangeText={setPgObs} placeholderTextColor={C.textDim} />
                </View>
                <TouchableOpacity style={[s.botao, { backgroundColor: cor, marginTop: 8 }]} onPress={registrar} disabled={ocupado}>
                  {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>{t('eventos.gRegistrar')}</Text>}
                </TouchableOpacity>

                <Text style={s.titulo}>{t('eventos.gDesconto')}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[s.campo, { flex: 1 }]} keyboardType="decimal-pad" value={descValor} onChangeText={setDescValor} placeholderTextColor={C.textDim} />
                  <TouchableOpacity style={[s.botaoSec, { borderColor: cor }]} onPress={salvarDesconto}>
                    <Text style={{ color: cor, fontWeight: '700' }}>{t('eventos.gAplicar')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <Text style={s.titulo}>{t('eventos.gStatus')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {detalhe.status !== 'confirmada' && (
                <TouchableOpacity style={[s.botaoSec, { borderColor: C.success }]} onPress={() => mudarStatus('confirmada')}>
                  <Text style={{ color: C.success, fontWeight: '700' }}>{t('eventos.gConfirmar')}</Text>
                </TouchableOpacity>
              )}
              {detalhe.status === 'confirmada' && (
                <TouchableOpacity style={[s.botaoSec, { borderColor: '#B7791F' }]} onPress={() => mudarStatus('espera')}>
                  <Text style={{ color: '#B7791F', fontWeight: '700' }}>{t('eventos.gParaEspera')}</Text>
                </TouchableOpacity>
              )}
              {detalhe.status !== 'cancelada' && (
                <TouchableOpacity style={[s.botaoSec, { borderColor: C.danger }]} onPress={() => mudarStatus('cancelada')}>
                  <Text style={{ color: C.danger, fontWeight: '700' }}>{t('eventos.gCancelar')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        ) : (
          <>
            <View style={s.abas}>
              {abas.map(a => (
                <TouchableOpacity key={a.k} style={[s.aba, aba === a.k && { borderBottomColor: cor }]} onPress={() => setAba(a.k)}>
                  <Text style={[s.abaTexto, aba === a.k && { color: cor }]}>{a.r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {aba === 'inscritos' && (carregando ? <ActivityIndicator color={cor} style={{ marginTop: 30 }} /> : (
              <FlatList
                data={filtradas}
                keyExtractor={l => l.inscricao_id}
                contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
                ListHeaderComponent={(
                  <View>
                    <View style={[s.trio, s.cartaoTotais]}>
                      <Trio r={t('eventos.gPessoas')} v={`${totais.pessoas}${detalhes.config?.vagas ? `/${detalhes.config.vagas}` : ''}`} s={s} />
                      {comPag && <Trio r={t('eventos.gArrecadado')} v={libras(totais.arrecadado)} s={s} cor={C.success} />}
                      {comPag && <Trio r={t('eventos.gFalta')} v={libras(totais.falta)} s={s} cor={cor} />}
                    </View>
                    {comPag && <Text style={[s.sub, { textAlign: 'center' }]}>{t('eventos.gEsperado', { valor: libras(totais.esperado) })}</Text>}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 12 }}>
                      {((comPag ? ['todos', 'saldo', 'quitados', 'espera', 'cancelada'] : ['todos', 'espera', 'cancelada']) as Filtro[]).map(f => (
                        <TouchableOpacity key={f} onPress={() => setFiltro(f)} style={[s.chip, filtro === f && { backgroundColor: cor, borderColor: cor }]}>
                          <Text style={{ color: filtro === f ? '#fff' : C.text, fontWeight: '600' }}>{t(`eventos.filtro_${f}`)}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
                ListEmptyComponent={<Text style={[s.sub, { textAlign: 'center', marginTop: 20 }]}>{t('eventos.gNenhum')}</Text>}
                renderItem={({ item: l }) => (
                  <TouchableOpacity style={s.linhaLista} onPress={() => abrirDetalhe(l.inscricao_id)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.forte}>{l.responsavel_nome} · {l.pessoas} {t('eventos.gPessoasMin')}</Text>
                      <Text style={s.sub} numberOfLines={1}>{l.nomes}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.forte, { color: !comPag ? (l.status === 'confirmada' ? C.success : cor) : l.saldo > 0 ? cor : C.success }]}>
                        {!comPag ? t(`eventos.status_${l.status}`) : l.status === 'confirmada' ? (l.saldo > 0 ? `${t('eventos.falta')} ${libras(l.saldo)}` : t('eventos.quitadoCurto')) : t(`eventos.status_${l.status}`)}
                      </Text>
                      {comPag && <Text style={s.sub}>{libras(l.pago)} / {libras(l.total - l.desconto)}</Text>}
                    </View>
                  </TouchableOpacity>
                )}
              />
            ))}

            {aba === 'config' && (
              <ConfigEditor eventoId={eventoId} detalhes={detalhes} cor={cor} podeSalvar={podeDinheiro} C={C} s={s} t={t} />
            )}

            {aba === 'equipe' && (
              <EquipeEditor eventoId={eventoId} cor={cor} podeLider={podeDinheiro} C={C} s={s} t={t} inicial={detalhes.equipe ?? []} />
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Configurar ──────────────────────────────────────────────────────────────
function ConfigEditor({ eventoId, detalhes, cor, podeSalvar, C, s, t }: {
  eventoId: string; detalhes: DetalhesEvento; cor: string; podeSalvar: boolean; C: ThemeColors; s: ReturnType<typeof estilos>; t: any;
}) {
  const c = detalhes.config;
  // Primeira vez: valores de exemplo do Retiro Peniel 2027 (Marcos, 11/11/2026).
  const [ativa, setAtiva] = useState(c?.ativa ?? false);
  const [inicio, setInicio] = useState(c?.inicio ? dataBR(c.inicio) : '');
  const [fim, setFim] = useState(c?.fim ? dataBR(c.fim) : '');
  const [abre, setAbre] = useState(c?.abre_em ? dataBR(c.abre_em) : '');
  const [fecha, setFecha] = useState(c?.fecha_em ? dataBR(c.fecha_em) : '');
  const [vagas, setVagas] = useState(c?.vagas != null ? String(c.vagas) : (c ? '' : '60'));
  const [entrada, setEntrada] = useState(c ? String(c.entrada_minima ?? 0) : '50');
  const [quitar, setQuitar] = useState(c?.quitar_ate ? dataBR(c.quitar_ate) : '');
  const [soMembros, setSoMembros] = useState(c?.publico === 'membros');
  const [regras, setRegras] = useState(c?.regras ?? '');
  const [reembolso, setReembolso] = useState(c?.reembolso ?? (c ? '' : t('eventos.reembolsoExemplo')));
  const [programacao, setProgramacao] = useState(c?.programacao ?? '');
  const [levar, setLevar] = useState(c?.o_que_levar ?? '');
  const [contato, setContato] = useState(c?.contato ?? '');
  const [precos, setPrecos] = useState<Preco[]>(detalhes.precos?.length ? detalhes.precos : PRECOS_PADRAO);
  const [perguntas, setPerguntas] = useState<Pergunta[]>(detalhes.perguntas?.length ? detalhes.perguntas : (c ? [] : PERGUNTAS_PADRAO));
  const [salvando, setSalvando] = useState(false);
  const [comPag, setComPag] = useState(c?.com_pagamento !== false);

  const data = (v: string) => (v.trim() ? isoDeBR(v) : null);

  const salvar = async () => {
    const campos: [string, string][] = [['inicio', inicio], ['fim', fim], ['abre', abre], ['fecha', fecha], ['quitar', quitar]];
    for (const [k, v] of campos) if (v.trim() && !isoDeBR(v)) { Alert.alert(t('eventos.titulo'), t('eventos.dataCampoInvalida', { campo: t(`eventos.cfg_${k}`) })); return; }
    setSalvando(true);
    const r = await salvarConfig(eventoId, {
      ativa,
      inicio: data(inicio) ? `${data(inicio)}T12:00:00Z` : null,
      fim: data(fim) ? `${data(fim)}T12:00:00Z` : null,
      abre_em: data(abre), fecha_em: data(fecha), quitar_ate: data(quitar),
      vagas: vagas.trim() ? Number(vagas) : null,
      entrada_minima: comPag ? (Number(entrada.replace(',', '.')) || 0) : 0,
      publico: soMembros ? 'membros' : 'todos',
      regras, reembolso, programacao, o_que_levar: levar, contato,
      ...(comPag ? { precos: precos.map(p => ({ ...p, valor: Number(String(p.valor).replace(',', '.')) || 0 })) } : {}),
      perguntas,
    });
    // Com/sem pagamento (12/11/2026): só chama se mudou.
    if (r === 'ok' && comPag !== (c?.com_pagamento !== false)) {
      const r2 = await definirPagamento(eventoId, comPag);
      if (r2 !== 'ok') {
        setSalvando(false);
        if (r2 === 'tem_pagamentos') setComPag(true);
        Alert.alert(t('eventos.titulo'), r2 === 'tem_pagamentos' ? t('admin.inscricaoTemPagamentos') : r2);
        return;
      }
    }
    setSalvando(false);
    Alert.alert(t('eventos.titulo'), r === 'ok' ? t('eventos.cfgSalvo') : r === 'sem_acesso' ? t('eventos.semPermissao') : r);
  };

  const Campo = ({ rotulo, valor, set, data: ehData, num, multi }: { rotulo: string; valor: string; set: (v: string) => void; data?: boolean; num?: boolean; multi?: boolean }) => (
    <View style={{ marginTop: 12 }}>
      <Text style={s.sub}>{rotulo}</Text>
      <TextInput
        style={[s.campo, multi && { minHeight: 80, textAlignVertical: 'top' }]}
        value={valor}
        onChangeText={v => set(ehData ? mascaraData(v) : v)}
        placeholder={ehData ? 'DD/MM/AAAA' : undefined}
        placeholderTextColor={C.textDim}
        keyboardType={ehData || num ? 'numeric' : 'default'}
        maxLength={ehData ? 10 : undefined}
        multiline={multi}
        editable={podeSalvar}
      />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      {!podeSalvar && <Text style={[s.sub, { color: cor }]}>{t('eventos.cfgSoTesouraria')}</Text>}
      <View style={s.linhaSwitch}>
        <View style={{ flex: 1 }}>
          <Text style={s.forte}>{t('eventos.cfgAtiva')}</Text>
          <Text style={s.sub}>{t('eventos.cfgAtivaSub')}</Text>
        </View>
        <Switch value={ativa} onValueChange={setAtiva} disabled={!podeSalvar} trackColor={{ true: cor, false: undefined }} />
      </View>
      <View style={s.linhaSwitch}>
        <View style={{ flex: 1 }}>
          <Text style={s.forte}>{t('eventos.cfgComPagamento')}</Text>
          <Text style={s.sub}>{comPag ? t('eventos.cfgComPagamentoSim') : t('eventos.cfgComPagamentoNao')}</Text>
        </View>
        <Switch value={comPag} onValueChange={setComPag} disabled={!podeSalvar} trackColor={{ true: cor, false: undefined }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>{Campo({ rotulo: t('eventos.cfg_inicio'), valor: inicio, set: setInicio, data: true })}</View>
        <View style={{ flex: 1 }}>{Campo({ rotulo: t('eventos.cfg_fim'), valor: fim, set: setFim, data: true })}</View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>{Campo({ rotulo: t('eventos.cfg_abre'), valor: abre, set: setAbre, data: true })}</View>
        <View style={{ flex: 1 }}>{Campo({ rotulo: t('eventos.cfg_fecha'), valor: fecha, set: setFecha, data: true })}</View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>{Campo({ rotulo: t('eventos.cfg_vagas'), valor: vagas, set: setVagas, num: true })}</View>
        {comPag && <View style={{ flex: 1 }}>{Campo({ rotulo: t('eventos.cfg_entrada'), valor: entrada, set: setEntrada, num: true })}</View>}
      </View>
      {comPag && Campo({ rotulo: t('eventos.cfg_quitar'), valor: quitar, set: setQuitar, data: true })}
      <View style={s.linhaSwitch}>
        <Text style={[s.forte, { flex: 1 }]}>{t('eventos.cfgSoMembros')}</Text>
        <Switch value={soMembros} onValueChange={setSoMembros} disabled={!podeSalvar} trackColor={{ true: cor, false: undefined }} />
      </View>

      {comPag && <Text style={s.titulo}>{t('eventos.valores')}</Text>}
      {comPag && precos.map((p, i) => (
        <View key={i} style={s.blocoItem}>
          <TextInput style={s.campo} value={p.categoria} editable={podeSalvar} placeholderTextColor={C.textDim}
            onChangeText={v => setPrecos(ps => ps.map((x, j) => (j === i ? { ...x, categoria: v } : x)))} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={s.sub}>{t('eventos.cfgIdade')}</Text>
            <TextInput style={[s.campo, { width: 56 }]} keyboardType="numeric" value={String(p.idade_min)} editable={podeSalvar}
              onChangeText={v => setPrecos(ps => ps.map((x, j) => (j === i ? { ...x, idade_min: Number(v) || 0 } : x)))} />
            <Text style={s.sub}>{t('eventos.cfgAte')}</Text>
            <TextInput style={[s.campo, { width: 56 }]} keyboardType="numeric" value={p.idade_max != null ? String(p.idade_max) : ''} placeholder="+" placeholderTextColor={C.textDim} editable={podeSalvar}
              onChangeText={v => setPrecos(ps => ps.map((x, j) => (j === i ? { ...x, idade_max: v.trim() ? Number(v) : null } : x)))} />
            <Text style={s.sub}>£</Text>
            <TextInput style={[s.campo, { flex: 1 }]} keyboardType="decimal-pad" value={String(p.valor)} editable={podeSalvar}
              onChangeText={v => setPrecos(ps => ps.map((x, j) => (j === i ? { ...x, valor: v as any } : x)))} />
            {podeSalvar && (
              <TouchableOpacity onPress={() => setPrecos(ps => ps.filter((_, j) => j !== i))}><Ionicons name="trash-outline" size={18} color={C.danger} /></TouchableOpacity>
            )}
          </View>
        </View>
      ))}
      {podeSalvar && comPag && (
        <TouchableOpacity onPress={() => setPrecos(ps => [...ps, { categoria: '', idade_min: 0, idade_max: null, valor: 0 }])}>
          <Text style={[s.link, { color: cor }]}>+ {t('eventos.cfgNovaFaixa')}</Text>
        </TouchableOpacity>
      )}

      <Text style={s.titulo}>{t('eventos.perguntas')}</Text>
      {perguntas.map((q, i) => (
        <View key={i} style={s.blocoItem}>
          <TextInput style={s.campo} value={q.texto} editable={podeSalvar} placeholderTextColor={C.textDim}
            onChangeText={v => setPerguntas(qs => qs.map((x, j) => (j === i ? { ...x, texto: v } : x)))} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['texto', 'sim_nao'] as const).map(tp => (
              <TouchableOpacity key={tp} disabled={!podeSalvar} onPress={() => setPerguntas(qs => qs.map((x, j) => (j === i ? { ...x, tipo: tp } : x)))}
                style={[s.chip, q.tipo === tp && { backgroundColor: cor, borderColor: cor }]}>
                <Text style={{ color: q.tipo === tp ? '#fff' : C.text, fontSize: 12 }}>{t(`eventos.cfgTipo_${tp}`)}</Text>
              </TouchableOpacity>
            ))}
            <Text style={s.sub}>{t('eventos.cfgObrigatoria')}</Text>
            <Switch value={q.obrigatoria} disabled={!podeSalvar} onValueChange={v => setPerguntas(qs => qs.map((x, j) => (j === i ? { ...x, obrigatoria: v } : x)))} />
            {podeSalvar && (
              <TouchableOpacity onPress={() => setPerguntas(qs => qs.filter((_, j) => j !== i))}><Ionicons name="trash-outline" size={18} color={C.danger} /></TouchableOpacity>
            )}
          </View>
        </View>
      ))}
      {podeSalvar && (
        <TouchableOpacity onPress={() => setPerguntas(qs => [...qs, { texto: '', tipo: 'texto', opcoes: null, obrigatoria: false }])}>
          <Text style={[s.link, { color: cor }]}>+ {t('eventos.cfgNovaPergunta')}</Text>
        </TouchableOpacity>
      )}

      {Campo({ rotulo: t('eventos.regras'), valor: regras, set: setRegras, multi: true })}
      {Campo({ rotulo: t('eventos.reembolso'), valor: reembolso, set: setReembolso, multi: true })}
      {Campo({ rotulo: t('eventos.programacao'), valor: programacao, set: setProgramacao, multi: true })}
      {Campo({ rotulo: t('eventos.oQueLevar'), valor: levar, set: setLevar, multi: true })}
      {Campo({ rotulo: t('eventos.cfg_contato'), valor: contato, set: setContato })}

      {podeSalvar && (
        <TouchableOpacity style={[s.botao, { backgroundColor: cor, marginTop: 20 }]} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>{t('eventos.cfgSalvar')}</Text>}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ── Equipe ──────────────────────────────────────────────────────────────────
function EquipeEditor({ eventoId, cor, podeLider, C, s, t, inicial }: {
  eventoId: string; cor: string; podeLider: boolean; C: ThemeColors; s: ReturnType<typeof estilos>; t: any;
  inicial: NonNullable<DetalhesEvento['equipe']>;
}) {
  const [equipe, setEquipe] = useState(inicial);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<{ id: string; full_name: string }[]>([]);
  const [funcao, setFuncao] = useState('');

  const recarregar = async () => {
    const { data } = await supabase.rpc('evento_detalhes', { p_evento: eventoId });
    setEquipe((data as any)?.equipe ?? []);
  };

  useEffect(() => {
    if (busca.trim().length < 2) { setResultados([]); return; }
    const id = setTimeout(async () => {
      const { data } = await supabase.rpc('evento_buscar_membros', { p_evento: eventoId, p_busca: busca.trim() });
      setResultados(((data ?? []) as any[]).map(m => ({ id: m.user_id, full_name: m.nome })));
    }, 250);
    return () => clearTimeout(id);
  }, [busca]);

  const adicionar = async (id: string, lider = false) => {
    const r = await definirEquipe(eventoId, id, funcao, lider);
    if (r !== 'ok') { Alert.alert(t('eventos.titulo'), t('eventos.semPermissao')); return; }
    setBusca(''); setFuncao(''); recarregar();
  };

  const remover = (id: string, nome: string) => {
    Alert.alert(t('eventos.abaEquipe'), t('eventos.eqRemover', { nome }), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: 'OK', style: 'destructive', onPress: async () => { await removerDaEquipe(eventoId, id); recarregar(); } },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      {equipe.map(m => (
        <View key={m.user_id} style={s.linha}>
          <View style={{ flex: 1 }}>
            <Text style={s.forte}>{m.eh_lider ? '⭐ ' : ''}{m.nome}</Text>
            <Text style={s.sub}>{m.eh_lider ? t('eventos.lider') : ''}{m.funcao ? `${m.eh_lider ? ' · ' : ''}${m.funcao}` : ''}</Text>
          </View>
          {podeLider && !m.eh_lider && (
            <TouchableOpacity onPress={() => definirEquipe(eventoId, m.user_id, m.funcao ?? '', true).then(recarregar)} style={{ marginRight: 14 }}>
              <Ionicons name="star-outline" size={20} color={cor} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => remover(m.user_id, m.nome)}><Ionicons name="close-circle-outline" size={22} color={C.danger} /></TouchableOpacity>
        </View>
      ))}
      {equipe.length === 0 && <Text style={s.sub}>{t('eventos.equipeVazia')}</Text>}

      <Text style={s.titulo}>{t('eventos.eqAdicionar')}</Text>
      <TextInput style={s.campo} placeholder={t('eventos.eqFuncaoPlaceholder')} placeholderTextColor={C.textDim} value={funcao} onChangeText={setFuncao} />
      <TextInput style={s.campo} placeholder={t('conversas.buscarMembro')} placeholderTextColor={C.textDim} value={busca} onChangeText={setBusca} />
      {resultados.map(r => (
        <View key={r.id} style={s.linha}>
          <Text style={[s.forte, { flex: 1 }]}>{r.full_name}</Text>
          {podeLider && (
            <TouchableOpacity onPress={() => adicionar(r.id, true)} style={{ marginRight: 14 }}>
              <Text style={{ color: cor, fontWeight: '700' }}>⭐ {t('eventos.lider')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => adicionar(r.id)}><Ionicons name="add-circle" size={24} color={cor} /></TouchableOpacity>
        </View>
      ))}
      <Text style={[s.sub, { marginTop: 10 }]}>{t('eventos.eqInfo')}</Text>
    </ScrollView>
  );
}

function Trio({ r, v, s, cor }: { r: string; v: string; s: ReturnType<typeof estilos>; cor?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.sub}>{r}</Text>
      <Text style={[s.forte, { fontSize: 18 }, cor ? { color: cor } : null]}>{v}</Text>
    </View>
  );
}

function estilos(C: ThemeColors) {
  return StyleSheet.create({
    tela: { flex: 1, backgroundColor: C.bg },
    header: { paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
    headerTitulo: { flex: 1, fontSize: 17, fontWeight: '800', color: '#fff' },
    headerBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
    abas: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    aba: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    abaTexto: { fontSize: 13, fontWeight: '700', color: C.textMuted },
    titulo: { fontSize: 15, fontWeight: '800', color: C.text, marginTop: 20, marginBottom: 6 },
    forte: { fontSize: 14, fontWeight: '700', color: C.text },
    sub: { fontSize: 12.5, color: C.textMuted, lineHeight: 18 },
    link: { fontSize: 14, fontWeight: '700', marginTop: 8 },
    linha: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, gap: 8 },
    linhaLista: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: C.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, gap: 10 },
    linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
    trio: { flexDirection: 'row', paddingVertical: 8 },
    cartaoTotais: { backgroundColor: C.surface, margin: 12, marginBottom: 4, borderRadius: 14, borderWidth: 1, borderColor: C.border },
    chip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.surface },
    campo: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: C.text, backgroundColor: C.surface, marginTop: 4 },
    blocoItem: { padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginTop: 8, gap: 6 },
    botao: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingVertical: 13 },
    botaoTexto: { color: '#fff', fontWeight: '800', fontSize: 15 },
    botaoSec: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  });
}
