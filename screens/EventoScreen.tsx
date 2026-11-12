// screens/EventoScreen.tsx
//
// Página de um evento com inscrição (Retiro Peniel 2027 e outros) — pedido do
// Marcos, 09–11/11/2026. Abas: Sobre · Regras · Equipe · Minha inscrição.
// Quem administra o evento (admin, tesouraria, líder) vê "Gerenciar".
//
// Rota do Stack (modal): navigate('Evento', { id, gerenciar? }).

import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert, Linking,
  Modal, TextInput, Switch, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { useTheme, type ThemeColors } from '../lib/theme';
import {
  detalhesEvento, minhaFamilia, minhaInscricao, inscrever, pagarParcela,
  libras, dataBR, isoDeBR, mascaraData,
  type DetalhesEvento, type PessoaFamilia, type MinhaInscricao, type PessoaParaInscrever,
} from '../lib/eventos';
import EventoGestaoModal from '../components/EventoGestaoModal';

type Aba = 'sobre' | 'regras' | 'equipe' | 'inscricao';
type EventoBase = {
  id: string; nome: string; data: string | null; data_fim?: string | null; horario: string | null; local: string | null;
  descricao: string | null; map_url: string | null; imagem_url: string | null; cor: string | null;
};
type Extra = { key: string; nome: string; nasc: string };

const COR_PADRAO = '#E84B1A';

function topoDoModal(insetTop: number) {
  return Platform.OS === 'ios' ? 16 : insetTop + 12;
}

export default function EventoScreen({ navigation, route }: { navigation: any; route: any }) {
  const { t } = useTranslation();
  const { user, isLoggedIn } = useAuth();
  const { colors: C } = useTheme();
  const s = useMemo(() => estilos(C), [C]);
  const insets = useSafeAreaInsets();
  const folha = usePaymentSheet();
  const eventoId: string = route?.params?.id;

  const [ev, setEv] = useState<EventoBase | null>(null);
  const [det, setDet] = useState<DetalhesEvento | null>(null);
  const [minha, setMinha] = useState<MinhaInscricao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>('sobre');
  const [gestaoVisivel, setGestaoVisivel] = useState(!!route?.params?.gerenciar);

  // Inscrição
  const [inscVisivel, setInscVisivel] = useState(false);
  const [familia, setFamilia] = useState<PessoaFamilia[]>([]);
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [respostas, setRespostas] = useState<Record<string, Record<string, string>>>({});
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Pagamento
  const [pagarVisivel, setPagarVisivel] = useState(false);
  const [valorPagar, setValorPagar] = useState('');
  const [pagando, setPagando] = useState(false);

  const cor = ev?.cor || COR_PADRAO;

  const carregar = useCallback(async () => {
    if (!eventoId) return;
    const [{ data: base }, d, m] = await Promise.all([
      supabase.from('agenda_eventos').select('id, nome, data, data_fim, horario, local, descricao, map_url, imagem_url, cor').eq('id', eventoId).maybeSingle(),
      isLoggedIn ? detalhesEvento(eventoId) : Promise.resolve(null),
      isLoggedIn ? minhaInscricao(eventoId) : Promise.resolve(null),
    ]);
    setEv((base as EventoBase) ?? null);
    setDet(d);
    setMinha(m);
    setCarregando(false);
  }, [eventoId, isLoggedIn]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const cfg = det?.config;
  const precos = det?.precos ?? [];
  // Só inscrição (confirma a vaga), sem preço nem pagamento — 12/11/2026.
  const comPag = cfg?.com_pagamento !== false;
  const perguntas = det?.perguntas ?? [];
  const equipe = det?.equipe ?? [];
  const vagasRestantes = cfg?.vagas != null ? Math.max(0, cfg.vagas - (det?.ocupadas ?? 0)) : null;
  const podeInscrever = !!det?.tem_inscricao && (det.estado === 'aberta' || det.gere) && det.pode_publico !== false;

  // ── Inscrever ─────────────────────────────────────────────────────────────
  const abrirInscricao = async () => {
    if (!isLoggedIn) {
      Alert.alert(t('eventos.titulo'), t('eventos.precisaConta'), [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('eventos.entrar'), onPress: () => navigation.navigate('Auth') },
      ]);
      return;
    }
    const f = await minhaFamilia(eventoId);
    setFamilia(f);
    // Refazendo uma inscrição sem pagamento: já marca quem estava.
    const jaNaLista = new Set((minha?.pessoas ?? []).map(p => p.member_id).filter(Boolean) as string[]);
    const m: Record<string, boolean> = {};
    f.forEach(p => { m[p.member_id] = minha ? jaNaLista.has(p.member_id) : p.sou_eu; });
    setMarcados(m);
    setExtras((minha?.pessoas ?? []).filter(p => !p.member_id).map((p, i) => ({
      key: `x${i}`, nome: p.nome, nasc: p.data_nascimento ? dataBR(p.data_nascimento) : '',
    })));
    const r: Record<string, Record<string, string>> = {};
    (minha?.pessoas ?? []).forEach(p => { r[p.member_id ?? p.nome] = p.respostas ?? {}; });
    setRespostas(r);
    setAceite(false);
    setInscVisivel(true);
  };

  const precoPrevisto = (idade: number | null) => {
    if (idade == null) return [...precos].sort((a, b) => b.valor - a.valor)[0];
    return precos.find(p => idade >= p.idade_min && (p.idade_max == null || idade <= p.idade_max));
  };
  const idadeNoEvento = (iso: string | null) => {
    if (!iso) return null;
    const ref = cfg?.inicio ? new Date(cfg.inicio) : ev?.data ? new Date(`${ev.data}T12:00:00`) : new Date();
    const n = new Date(`${iso}T12:00:00`);
    let i = ref.getFullYear() - n.getFullYear();
    if (ref.getMonth() < n.getMonth() || (ref.getMonth() === n.getMonth() && ref.getDate() < n.getDate())) i--;
    return i;
  };

  const resumoTotal = useMemo(() => {
    let tot = 0; let n = 0;
    familia.forEach(p => { if (marcados[p.member_id]) { tot += Number(p.valor ?? 0); n++; } });
    extras.forEach(x => { if (x.nome.trim()) { tot += Number(precoPrevisto(idadeNoEvento(isoDeBR(x.nasc)))?.valor ?? 0); n++; } });
    return { tot, n };
  }, [familia, marcados, extras, precos]);

  const responder = (chave: string, pergunta: string, valor: string) => {
    setRespostas(prev => ({ ...prev, [chave]: { ...(prev[chave] ?? {}), [pergunta]: valor } }));
  };

  const enviarInscricao = async () => {
    const pessoas: PessoaParaInscrever[] = [];
    familia.forEach(p => { if (marcados[p.member_id]) pessoas.push({ member_id: p.member_id, respostas: respostas[p.member_id] ?? {} }); });
    for (const x of extras) {
      if (!x.nome.trim()) continue;
      const iso = x.nasc.trim() ? isoDeBR(x.nasc) : null;
      if (x.nasc.trim() && !iso) { Alert.alert(t('eventos.titulo'), t('eventos.dataInvalida', { nome: x.nome })); return; }
      pessoas.push({ nome: x.nome.trim(), data_nascimento: iso, respostas: respostas[x.key] ?? {} });
    }
    if (pessoas.length === 0) { Alert.alert(t('eventos.titulo'), t('eventos.escolhaPessoas')); return; }
    for (const q of perguntas.filter(q => q.obrigatoria)) {
      const chaves = [...familia.filter(p => marcados[p.member_id]).map(p => p.member_id), ...extras.filter(x => x.nome.trim()).map(x => x.key)];
      if (chaves.some(k => !(respostas[k]?.[q.texto] ?? '').trim())) {
        Alert.alert(t('eventos.titulo'), t('eventos.respondaObrigatoria', { pergunta: q.texto })); return;
      }
    }
    if (!aceite) { Alert.alert(t('eventos.titulo'), t('eventos.aceiteRegras')); return; }
    setEnviando(true);
    const r = await inscrever(eventoId, pessoas, true);
    setEnviando(false);
    if (r.status !== 'ok') {
      const k = r.status.replace('erro_', '');
      Alert.alert(t('eventos.titulo'), t(`eventos.erro_${k}`, { defaultValue: t('eventos.erro_generico') }));
      return;
    }
    setInscVisivel(false);
    await carregar();
    setAba('inscricao');
    Alert.alert(t('eventos.titulo'), r.estado === 'espera' ? t('eventos.inscritoEspera') : r.estado === 'pendente' ? t('eventos.inscritoPendente', { entrada: libras(cfg?.entrada_minima) }) : (comPag ? t('eventos.inscritoOk', { total: libras(r.total) }) : t('eventos.inscritoOkSemPagamento')));
  };

  // ── Pagar ─────────────────────────────────────────────────────────────────
  const abrirPagar = () => {
    if (!minha) return;
    setValorPagar(String(minha.sugestao || minha.saldo));
    setPagarVisivel(true);
  };
  const pagar = async () => {
    if (!minha) return;
    const v = Number(valorPagar.replace(',', '.'));
    if (!Number.isFinite(v) || v < 1) { Alert.alert(t('eventos.titulo'), t('eventos.valorMinimo')); return; }
    if (v > minha.saldo) { Alert.alert(t('eventos.titulo'), t('eventos.valorMaior', { falta: libras(minha.saldo) })); return; }
    setPagando(true);
    const r = await pagarParcela(minha.id, Math.round(v * 100) / 100, folha);
    setPagando(false);
    if (r === 'cancelado') return;
    setPagarVisivel(false);
    if (r === 'ok') {
      Alert.alert(t('eventos.titulo'), t('eventos.pagoOk'));
      // O webhook grava em segundos; recarrega duas vezes para pegar.
      setTimeout(carregar, 2500); setTimeout(carregar, 7000);
    } else if (r === 'aberto_fora') {
      Alert.alert(t('eventos.titulo'), t('eventos.pagoFora'));
    } else {
      Alert.alert(t('eventos.titulo'), r);
    }
  };

  // Cancelar a inscrição é só com a organização (Marcos, 12/11/2026).

  // ── Render ────────────────────────────────────────────────────────────────
  if (carregando) {
    return <View style={[s.tela, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={COR_PADRAO} /></View>;
  }
  if (!ev) {
    return (
      <View style={s.tela}>
        <View style={[s.header, { paddingTop: topoDoModal(insets.top), backgroundColor: COR_PADRAO }]}>
          <Text style={s.headerTitulo}>{t('eventos.titulo')}</Text>
          <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()}><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
        </View>
        <Text style={[s.texto, { padding: 20 }]}>{t('eventos.naoEncontrado')}</Text>
      </View>
    );
  }

  const quando = cfg?.inicio
    ? `${dataBR(cfg.inicio)}${cfg.fim ? ` – ${dataBR(cfg.fim)}` : ''}`
    : [ev.data ? `${dataBR(ev.data)}${ev.data_fim ? ` – ${dataBR(ev.data_fim)}` : ''}` : '', ev.horario ?? ''].filter(Boolean).join(' · ');

  const abas: { k: Aba; rotulo: string; icone: keyof typeof Ionicons.glyphMap }[] = [
    { k: 'sobre', rotulo: t('eventos.abaSobre'), icone: 'information-circle-outline' },
    { k: 'regras', rotulo: t('eventos.abaRegras'), icone: 'document-text-outline' },
    { k: 'equipe', rotulo: t('eventos.abaEquipe'), icone: 'people-outline' },
    { k: 'inscricao', rotulo: t('eventos.abaInscricao'), icone: 'ticket-outline' },
  ];

  return (
    <View style={s.tela}>
      <View style={[s.header, { paddingTop: topoDoModal(insets.top), backgroundColor: cor }]}>
        <Text style={s.headerTitulo} numberOfLines={1}>{ev.nome}</Text>
        {det?.gere && (
          <TouchableOpacity style={[s.headerBtn, { width: undefined, paddingHorizontal: 12, flexDirection: 'row', gap: 6, marginRight: 8 }]} onPress={() => setGestaoVisivel(true)}>
            <Ionicons name="settings-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t('eventos.gerenciar')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()}><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
      </View>

      <View style={s.abas}>
        {abas.map(a => (
          <TouchableOpacity key={a.k} style={[s.aba, aba === a.k && { borderBottomColor: cor }]} onPress={() => setAba(a.k)}>
            <Ionicons name={a.icone} size={16} color={aba === a.k ? cor : C.textMuted} />
            <Text style={[s.abaTexto, aba === a.k && { color: cor }]} numberOfLines={1}>{a.rotulo}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        {aba === 'sobre' && (
          <View>
            {!!ev.imagem_url && <Image source={{ uri: ev.imagem_url }} style={s.capa} resizeMode="cover" />}
            <View style={s.bloco}>
              {!!quando && <Linha icone="calendar-outline" texto={quando} C={C} />}
              {!!ev.horario && !!cfg?.inicio && <Linha icone="time-outline" texto={ev.horario} C={C} />}
              {!!ev.local && (
                <Linha icone="location-outline" texto={ev.local} C={C}
                  acao={ev.map_url ? { rotulo: t('eventos.mapa'), onPress: () => Linking.openURL(ev.map_url!) } : undefined} />
              )}
              {vagasRestantes != null && <Linha icone="people-outline" texto={t('eventos.vagasRestantes', { n: vagasRestantes, total: cfg?.vagas })} C={C} />}
              {!!cfg?.fecha_em && <Linha icone="hourglass-outline" texto={t('eventos.inscricoesAte', { data: dataBR(cfg.fecha_em) })} C={C} />}
              {!!cfg?.contato && <Linha icone="call-outline" texto={cfg.contato} C={C} />}
            </View>
            {!!ev.descricao && <Secao titulo={t('eventos.descricao')} texto={ev.descricao} s={s} />}
            {comPag && precos.length > 0 && (
              <View style={s.bloco}>
                <Text style={s.secaoTitulo}>{t('eventos.valores')}</Text>
                {precos.map(p => (
                  <View key={p.categoria} style={s.linhaPreco}>
                    <Text style={s.texto}>{p.categoria}</Text>
                    <Text style={[s.textoForte, { color: cor }]}>{p.valor > 0 ? libras(p.valor) : t('eventos.gratis')}</Text>
                  </View>
                ))}
                {!!cfg?.entrada_minima && (
                  <Text style={s.sub}>{t('eventos.parcelamentoInfo', { entrada: libras(cfg.entrada_minima), data: cfg.quitar_ate ? dataBR(cfg.quitar_ate) : '' })}</Text>
                )}
              </View>
            )}
            {!!cfg?.programacao && <Secao titulo={t('eventos.programacao')} texto={cfg.programacao} s={s} />}
            {!!cfg?.o_que_levar && <Secao titulo={t('eventos.oQueLevar')} texto={cfg.o_que_levar} s={s} />}
          </View>
        )}

        {aba === 'regras' && (
          <View>
            <Secao titulo={t('eventos.regras')} texto={cfg?.regras || t('eventos.semRegras')} s={s} />
            {!!cfg?.reembolso && <Secao titulo={t('eventos.reembolso')} texto={cfg.reembolso} s={s} />}
          </View>
        )}

        {aba === 'equipe' && (
          <View style={s.bloco}>
            {equipe.length === 0 ? (
              <Text style={s.sub}>{t('eventos.equipeVazia')}</Text>
            ) : equipe.map(m => (
              <View key={m.user_id} style={s.linhaEquipe}>
                {m.foto ? <Image source={{ uri: m.foto }} style={s.avatar} /> : (
                  <View style={[s.avatar, { backgroundColor: cor, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>{m.nome.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.textoForte}>{m.nome}</Text>
                  <Text style={s.sub}>{m.eh_lider ? `⭐ ${t('eventos.lider')}${m.funcao ? ` · ${m.funcao}` : ''}` : (m.funcao || t('eventos.equipe'))}</Text>
                </View>
                {m.user_id !== user?.id && (
                  <TouchableOpacity onPress={() => navigation.navigate('Conversas', { abrirCom: m.user_id, nome: m.nome, em: Date.now() })} hitSlop={8}>
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={cor} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {aba === 'inscricao' && (
          <View>
            {!det?.tem_inscricao ? (
              <Text style={[s.sub, { padding: 20 }]}>{t('eventos.semInscricao')}</Text>
            ) : !minha || minha.status === 'cancelada' ? (
              <View style={s.bloco}>
                <Text style={s.secaoTitulo}>{t(`eventos.estado_${det.estado}`)}</Text>
                {det.estado === 'em_breve' && !!cfg?.abre_em && <Text style={s.sub}>{t('eventos.abreEm', { data: dataBR(cfg.abre_em) })}</Text>}
                {minha?.status === 'cancelada' && <Text style={s.sub}>{t('eventos.voceCancelou')}</Text>}
                {det.gere && det.estado !== 'aberta' && <Text style={[s.sub, { color: cor }]}>{t('eventos.testeGestao')}</Text>}
              </View>
            ) : (
              <View style={s.bloco}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.secaoTitulo}>{t('eventos.minhaInscricao')}</Text>
                  <View style={[s.selo, { backgroundColor: minha.status === 'espera' || minha.status === 'pendente' ? '#F5A62322' : cor + '22' }]}>
                    <Text style={{ color: minha.status === 'espera' || minha.status === 'pendente' ? '#B7791F' : cor, fontWeight: '800', fontSize: 11 }}>
                      {t(`eventos.status_${minha.status}`)}
                    </Text>
                  </View>
                </View>
                {comPag && (<>
                <View style={s.barra}><View style={[s.barraCheia, { backgroundColor: cor, width: `${minha.total - minha.desconto > 0 ? Math.min(100, (minha.pago / (minha.total - minha.desconto)) * 100) : 100}%` }]} /></View>
                <View style={s.trio}>
                  <Trio rotulo={t('eventos.total')} valor={libras(minha.total - minha.desconto)} s={s} />
                  <Trio rotulo={t('eventos.pago')} valor={libras(minha.pago)} s={s} cor={C.success} />
                  <Trio rotulo={t('eventos.falta')} valor={libras(minha.saldo)} s={s} cor={minha.saldo > 0 ? cor : C.success} />
                </View>
                {minha.desconto > 0 && <Text style={s.sub}>{t('eventos.descontoAplicado', { valor: libras(minha.desconto) })}</Text>}
                </>)}
                {!comPag && minha.status === 'confirmada' && <Text style={[s.textoForte, { color: C.success, marginTop: 6 }]}>{t('eventos.vagaConfirmada')}</Text>}

                {minha.status === 'pendente' && (
                  <Text style={[s.textoForte, { color: '#B7791F', marginTop: 10 }]}>{t('eventos.pendenteInfo', { entrada: libras(Math.max(0, Math.min(cfg?.entrada_minima ?? 0, minha.total - minha.desconto) - minha.pago)) })}</Text>
                )}
                {comPag && (minha.status === 'confirmada' || minha.status === 'pendente') && minha.saldo > 0 && (
                  <>
                    {minha.status === 'confirmada' && <Text style={[s.sub, { marginTop: 10 }]}>{t('eventos.sugestao', { valor: libras(minha.sugestao) })}</Text>}
                    <TouchableOpacity style={[s.botao, { backgroundColor: cor, marginTop: 10 }]} onPress={abrirPagar}>
                      <Ionicons name="card-outline" size={18} color="#fff" />
                      <Text style={s.botaoTexto}>{t('eventos.pagarAgora')}</Text>
                    </TouchableOpacity>
                  </>
                )}
                {minha.status === 'espera' && <Text style={[s.sub, { marginTop: 10 }]}>{t('eventos.esperaInfo')}</Text>}
                {comPag && minha.saldo <= 0 && minha.status === 'confirmada' && <Text style={[s.textoForte, { color: C.success, marginTop: 10 }]}>{t('eventos.quitado')}</Text>}

                <Text style={[s.secaoTitulo, { marginTop: 18 }]}>{t('eventos.quemVai')}</Text>
                {minha.pessoas.map((p, i) => (
                  <View key={i} style={s.linhaPreco}>
                    <Text style={s.texto}>{p.nome}{p.idade != null ? ` (${p.idade})` : ''}</Text>
                    {comPag && <Text style={s.texto}>{p.valor > 0 ? libras(p.valor) : t('eventos.gratis')}</Text>}
                  </View>
                ))}

                {comPag && <Text style={[s.secaoTitulo, { marginTop: 18 }]}>{t('eventos.pagamentos')}</Text>}
                {!comPag ? null : minha.pagamentos.length === 0 ? <Text style={s.sub}>{t('eventos.nenhumPagamento')}</Text> : minha.pagamentos.map((g, i) => (
                  <View key={i} style={s.linhaPreco}>
                    <Text style={s.texto}>{dataBR(g.pago_em)} · {t(`eventos.forma_${g.forma}`, { defaultValue: g.forma })}</Text>
                    <Text style={[s.textoForte, { color: g.valor < 0 ? C.danger : C.success }]}>{libras(g.valor)}</Text>
                  </View>
                ))}

                <View style={{ flexDirection: 'row', gap: 16, marginTop: 18 }}>
                  {minha.pago <= 0 && podeInscrever && (
                    <TouchableOpacity onPress={abrirInscricao}><Text style={[s.link, { color: cor }]}>{t('eventos.editarPessoas')}</Text></TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Botão fixo "Inscrever-se" */}
      {det?.tem_inscricao && (!minha || minha.status === 'cancelada') && podeInscrever && (
        <View style={[s.rodape, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={[s.botao, { backgroundColor: cor }]} onPress={abrirInscricao}>
            <Ionicons name="ticket-outline" size={18} color="#fff" />
            <Text style={s.botaoTexto}>{t('eventos.inscreverSe')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Modal de inscrição ──────────────────────────────────────────── */}
      <Modal visible={inscVisivel} animationType="slide" onRequestClose={() => setInscVisivel(false)}>
        <KeyboardAvoidingView style={s.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.header, { paddingTop: insets.top + 12, backgroundColor: cor }]}>
            <TouchableOpacity style={[s.headerBtn, { marginRight: 10 }]} onPress={() => setInscVisivel(false)}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
            <Text style={s.headerTitulo} numberOfLines={1}>{t('eventos.inscricaoEm', { nome: ev.nome })}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
            <Text style={s.secaoTitulo}>{t('eventos.quemVai')}</Text>
            {familia.map(p => (
              <TouchableOpacity key={p.member_id} style={s.pessoa} onPress={() => setMarcados(m => ({ ...m, [p.member_id]: !m[p.member_id] }))}>
                <Ionicons name={marcados[p.member_id] ? 'checkbox' : 'square-outline'} size={22} color={cor} />
                <View style={{ flex: 1 }}>
                  <Text style={s.textoForte}>{p.nome}{p.sou_eu ? ` (${t('eventos.eu')})` : ''}</Text>
                  <Text style={s.sub}>{p.idade != null ? t('eventos.anosNoEvento', { n: p.idade }) : t('eventos.semData')}{comPag && p.categoria ? ` · ${p.categoria}` : ''}</Text>
                </View>
                {comPag && <Text style={s.textoForte}>{Number(p.valor ?? 0) > 0 ? libras(p.valor) : t('eventos.gratis')}</Text>}
              </TouchableOpacity>
            ))}
            {familia.length === 0 && <Text style={s.sub}>{t('eventos.semFicha')}</Text>}

            {extras.map((x, i) => (
              <View key={x.key} style={s.extra}>
                <TextInput style={[s.campo, { flex: 1.4 }]} placeholder={t('eventos.nomeCompleto')} placeholderTextColor={C.textDim}
                  value={x.nome} onChangeText={v => setExtras(e => e.map((y, j) => (j === i ? { ...y, nome: v } : y)))} />
                <TextInput style={[s.campo, { flex: 1 }]} placeholder="DD/MM/AAAA" placeholderTextColor={C.textDim} keyboardType="number-pad"
                  maxLength={10} value={x.nasc} onChangeText={v => setExtras(e => e.map((y, j) => (j === i ? { ...y, nasc: mascaraData(v) } : y)))} />
                <TouchableOpacity onPress={() => setExtras(e => e.filter((_, j) => j !== i))} hitSlop={8}>
                  <Ionicons name="close-circle" size={22} color={C.danger} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.addPessoa} onPress={() => setExtras(e => [...e, { key: `x${Date.now()}`, nome: '', nasc: '' }])}>
              <Ionicons name="person-add-outline" size={18} color={cor} />
              <Text style={[s.link, { color: cor }]}>{t('eventos.adicionarPessoa')}</Text>
            </TouchableOpacity>
            <Text style={s.sub}>{t('eventos.adicionarPessoaInfo')}</Text>

            {perguntas.length > 0 && (
              <>
                <Text style={[s.secaoTitulo, { marginTop: 18 }]}>{t('eventos.perguntas')}</Text>
                {[...familia.filter(p => marcados[p.member_id]).map(p => ({ chave: p.member_id, nome: p.nome })),
                  ...extras.filter(x => x.nome.trim()).map(x => ({ chave: x.key, nome: x.nome }))].map(pessoa => (
                  <View key={pessoa.chave} style={s.blocoPergunta}>
                    <Text style={s.textoForte}>{pessoa.nome}</Text>
                    {perguntas.map(q => (
                      <View key={q.texto} style={{ marginTop: 8 }}>
                        <Text style={s.sub}>{q.texto}{q.obrigatoria ? ' *' : ''}</Text>
                        {q.tipo === 'sim_nao' || q.tipo === 'opcoes' ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                            {(q.tipo === 'sim_nao' ? [t('eventos.sim'), t('eventos.nao')] : (q.opcoes ?? [])).map(op => {
                              const ativo = respostas[pessoa.chave]?.[q.texto] === op;
                              return (
                                <TouchableOpacity key={op} onPress={() => responder(pessoa.chave, q.texto, op)}
                                  style={[s.chip, ativo && { backgroundColor: cor, borderColor: cor }]}>
                                  <Text style={{ color: ativo ? '#fff' : C.text, fontWeight: '600' }}>{op}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : (
                          <TextInput style={s.campo} value={respostas[pessoa.chave]?.[q.texto] ?? ''} placeholderTextColor={C.textDim}
                            onChangeText={v => responder(pessoa.chave, q.texto, v)} />
                        )}
                      </View>
                    ))}
                  </View>
                ))}
              </>
            )}

            <TouchableOpacity style={[s.pessoa, { marginTop: 18 }]} onPress={() => setAceite(a => !a)}>
              <Ionicons name={aceite ? 'checkbox' : 'square-outline'} size={22} color={cor} />
              <Text style={[s.texto, { flex: 1 }]}>{t('eventos.liAceito')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setInscVisivel(false); setAba('regras'); }}>
              <Text style={[s.link, { color: cor, marginLeft: 34 }]}>{t('eventos.verRegras')}</Text>
            </TouchableOpacity>
          </ScrollView>
          <View style={[s.rodape, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={[s.textoForte, { textAlign: 'center', marginBottom: 8 }]}>
              {comPag ? t('eventos.resumoTotal', { n: resumoTotal.n, total: libras(resumoTotal.tot) }) : t('eventos.resumoPessoas', { n: resumoTotal.n })}
            </Text>
            <TouchableOpacity style={[s.botao, { backgroundColor: cor }]} onPress={enviarInscricao} disabled={enviando}>
              {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>{t('eventos.confirmarInscricao')}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Pagar ───────────────────────────────────────────────────────── */}
      <Modal visible={pagarVisivel} transparent animationType="fade" onRequestClose={() => setPagarVisivel(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.fundo}>
          <View style={s.cartao}>
            <Text style={s.secaoTitulo}>{t('eventos.pagarAgora')}</Text>
            <Text style={s.sub}>{t('eventos.pagarInfo', { falta: libras(minha?.saldo) })}</Text>
            <View style={s.campoValor}>
              <Text style={[s.textoForte, { fontSize: 22 }]}>£</Text>
              <TextInput style={[s.textoForte, { fontSize: 22, flex: 1, paddingVertical: 10 }]} keyboardType="decimal-pad"
                value={valorPagar} onChangeText={setValorPagar} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[minha?.sugestao, minha?.saldo].filter((v, i, a) => !!v && a.indexOf(v) === i).map(v => (
                <TouchableOpacity key={String(v)} style={s.chip} onPress={() => setValorPagar(String(v))}>
                  <Text style={{ color: C.text, fontWeight: '600' }}>{v === minha?.saldo ? t('eventos.quitarTudo', { valor: libras(v) }) : libras(v)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setPagarVisivel(false)} style={{ padding: 12 }}><Text style={s.sub}>{t('common.cancelar')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.botao, { backgroundColor: cor, paddingHorizontal: 22 }]} onPress={pagar} disabled={pagando}>
                {pagando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>{t('eventos.continuarPagamento')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {det?.gere && (
        <EventoGestaoModal
          visible={gestaoVisivel}
          eventoId={eventoId}
          eventoNome={ev.nome}
          cor={cor}
          detalhes={det}
          onClose={() => { setGestaoVisivel(false); carregar(); }}
        />
      )}
    </View>
  );
}

function Linha({ icone, texto, C, acao }: { icone: keyof typeof Ionicons.glyphMap; texto: string; C: ThemeColors; acao?: { rotulo: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <Ionicons name={icone} size={18} color={C.textMuted} />
      <Text style={{ flex: 1, fontSize: 14, color: C.text }}>{texto}</Text>
      {acao && <TouchableOpacity onPress={acao.onPress}><Text style={{ color: C.icone, fontWeight: '700' }}>{acao.rotulo}</Text></TouchableOpacity>}
    </View>
  );
}

function Secao({ titulo, texto, s }: { titulo: string; texto: string; s: ReturnType<typeof estilos> }) {
  return (
    <View style={s.bloco}>
      <Text style={s.secaoTitulo}>{titulo}</Text>
      <Text style={s.texto}>{texto}</Text>
    </View>
  );
}

function Trio({ rotulo, valor, s, cor }: { rotulo: string; valor: string; s: ReturnType<typeof estilos>; cor?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.sub}>{rotulo}</Text>
      <Text style={[s.textoForte, { fontSize: 18 }, cor ? { color: cor } : null]}>{valor}</Text>
    </View>
  );
}

function estilos(C: ThemeColors) {
  return StyleSheet.create({
    tela: { flex: 1, backgroundColor: C.bg },
    header: { paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
    headerTitulo: { flex: 1, fontSize: 18, fontWeight: '800', color: '#fff' },
    headerBtn: { height: 34, minWidth: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
    abas: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    aba: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    abaTexto: { fontSize: 11.5, fontWeight: '700', color: C.textMuted },
    capa: { width: '100%', aspectRatio: 2, backgroundColor: C.surfaceAlt },
    bloco: { backgroundColor: C.surface, marginHorizontal: 12, marginTop: 12, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
    secaoTitulo: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 8 },
    texto: { fontSize: 14, color: C.text, lineHeight: 21 },
    textoForte: { fontSize: 14, color: C.text, fontWeight: '700' },
    sub: { fontSize: 12.5, color: C.textMuted, lineHeight: 18 },
    link: { fontSize: 14, fontWeight: '700' },
    linhaPreco: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    linhaEquipe: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    selo: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    barra: { height: 10, borderRadius: 5, backgroundColor: C.surfaceAlt, overflow: 'hidden', marginVertical: 10 },
    barraCheia: { height: 10, borderRadius: 5 },
    trio: { flexDirection: 'row', marginTop: 4 },
    botao: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingVertical: 14 },
    botaoTexto: { color: '#fff', fontWeight: '800', fontSize: 15 },
    rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: C.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    pessoa: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    extra: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    campo: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text, backgroundColor: C.surface, marginTop: 4 },
    addPessoa: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    blocoPergunta: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginTop: 10 },
    chip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.surface },
    fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    cartao: { backgroundColor: C.surface, borderRadius: 18, padding: 20 },
    campoValor: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, marginVertical: 12 },
  });
}
