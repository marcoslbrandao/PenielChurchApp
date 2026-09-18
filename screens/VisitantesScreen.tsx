// screens/VisitantesScreen.tsx
//
// A lista do acolhimento. Registrar visitante não serve de nada se ninguém
// voltar a falar com a pessoa — esta tela é a metade que faz a outra valer.
//
// A ORDEM É A FILA DE TRABALHO, NÃO O HISTÓRICO
// O filtro abre em "A contatar" e não em "Todos", de propósito: quem abre esta
// tela na segunda-feira quer saber com quem falar, não quantos visitantes a
// igreja já teve. Dentro do filtro, os mais recentes primeiro.
//
// QUEM VÊ
// `eh_acolhimento()` — a equipe e o admin. Quem só registrou vê as próprias
// linhas (é o que permite corrigir um nome digitado errado), e esta tela
// mostra o que a RLS deixar passar, sem uma segunda regra no cliente que
// pudesse discordar do banco.
//
// O SELO DE CONSENTIMENTO
// Sem "pode entrar em contato" marcado, o cartão diz isso em vermelho e o
// botão de WhatsApp não aparece. A igreja tem o registro da visita — que é um
// fato —, mas não tem permissão para ligar, e a tela não deixa esquecer disso.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, StatusBar, RefreshControl, Alert, Linking, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { useAcesso } from '../lib/acesso';

type Situacao = 'novo' | 'contatado' | 'retornou' | 'virou_membro' | 'sem_retorno';

type PerfilLite = { id: string; full_name: string | null };

type Visitante = {
  id: string;
  nome: string;
  telefone: string | null;
  telefone_digitos: string | null;
  email: string | null;
  primeira_vez: boolean;
  como_conheceu: string | null;
  observacoes: string | null;
  consentiu_contato: boolean;
  primeira_visita: string;
  ultima_visita: string;
  total_visitas: number;
  situacao: Situacao;
  nota_contato: string | null;
};

const SITUACOES: { valor: Situacao; chave: string; cor: (c: any) => string }[] = [
  { valor: 'novo',         chave: 'visitantes.sitNovo',        cor: c => c.accent },
  { valor: 'contatado',    chave: 'visitantes.sitContatado',   cor: c => c.primary },
  { valor: 'retornou',     chave: 'visitantes.sitRetornou',    cor: c => c.success },
  { valor: 'virou_membro', chave: 'visitantes.sitVirouMembro', cor: c => c.success },
  { valor: 'sem_retorno',  chave: 'visitantes.sitSemRetorno',  cor: c => c.textMuted },
];

function paleta(isDark: boolean) {
  return isDark ? {
    primary: '#7B61FF', accent: '#F5C842', headerBg: '#100D28',
    bg: '#0E0B22', surface: '#1C1940', surfaceAlt: '#241F4D',
    text: '#F1EFFA', textMuted: '#A6A0C7', textDim: '#726A99',
    border: '#332D5C', danger: '#FF6B6B', success: '#4ADE80', whats: '#25D366',
  } : {
    primary: '#534AB7', accent: '#C8960A', headerBg: '#1A1740',
    bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
    text: '#1A1A2E', textMuted: '#6B7280', textDim: '#9CA3AF',
    border: '#E5E0D8', danger: '#C0392B', success: '#27AE60', whats: '#25D366',
  };
}

function formatDataBR(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}/${m}` : '';
}

export default function VisitantesScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const [lista, setLista] = useState<Visitante[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  // Abre na fila de trabalho, não no arquivo.
  const [filtro, setFiltro] = useState<Situacao | 'todos'>('novo');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<Visitante | null>(null);
  const [nota, setNota] = useState('');
  const [salvando, setSalvando] = useState(false);

  // ── Equipe de acolhimento (só admin) ────────────────────────────────────
  // Mora aqui, e não numa aba nova do Admin, porque é onde a equipe trabalha:
  // quem percebe que falta alguém na equipe é quem está olhando a fila de
  // visitantes sem conseguir dar conta dela.
  const { papel } = useAcesso();
  const ehAdmin = papel === 'admin';
  const [equipeAberta, setEquipeAberta] = useState(false);
  const [equipe, setEquipe] = useState<PerfilLite[]>([]);
  const [buscaPessoa, setBuscaPessoa] = useState('');
  const [achados, setAchados] = useState<PerfilLite[]>([]);

  const carregarEquipe = useCallback(async () => {
    if (!ehAdmin) return;
    const { data } = await supabase
      .from('equipe_acolhimento')
      .select('profile_id, profiles:profile_id (id, full_name)');
    setEquipe(((data ?? []) as any[])
      .map(l => l.profiles)
      .filter(Boolean) as PerfilLite[]);
  }, [ehAdmin]);

  useEffect(() => { if (equipeAberta) carregarEquipe(); }, [equipeAberta, carregarEquipe]);

  useEffect(() => {
    const termo = buscaPessoa.trim();
    if (termo.length < 2) { setAchados([]); return; }
    // 300 ms de espera: sem isso cada tecla vira uma consulta, e a lista
    // pisca com o resultado de uma busca que a pessoa já abandonou.
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles').select('id, full_name')
        .ilike('full_name', `%${termo}%`).limit(10);
      setAchados((data as PerfilLite[]) ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaPessoa]);

  const adicionarNaEquipe = async (p: PerfilLite) => {
    const { error } = await supabase.from('equipe_acolhimento').insert({ profile_id: p.id });
    if (error && error.code !== '23505') { Alert.alert(t('common.erro'), error.message); return; }
    setBuscaPessoa(''); setAchados([]);
    carregarEquipe();
  };

  const tirarDaEquipe = async (p: PerfilLite) => {
    const { error } = await supabase.from('equipe_acolhimento').delete().eq('profile_id', p.id);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    carregarEquipe();
  };

  const carregar = useCallback(async () => {
    const [{ data: vs }, { data: r }] = await Promise.all([
      supabase.from('visitantes').select('*').order('ultima_visita', { ascending: false }),
      supabase.rpc('resumo_visitantes'),
    ]);
    setLista((vs as Visitante[]) ?? []);
    setResumo(Array.isArray(r) ? r[0] : r);
    setCarregando(false);
    setAtualizando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (v: Visitante) => { setAberto(v); setNota(v.nota_contato ?? ''); };

  const mudarSituacao = async (v: Visitante, situacao: Situacao) => {
    setSalvando(true);
    // `contatado_em` e `contatado_por` são carimbados pelo gatilho do banco,
    // não mandados daqui — quem falou com a pessoa é um fato do servidor.
    const { error } = await supabase
      .from('visitantes')
      .update({ situacao, nota_contato: nota.trim() || null })
      .eq('id', v.id);
    setSalvando(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    setAberto(null);
    carregar();
  };

  const salvarNota = async (v: Visitante) => {
    setSalvando(true);
    const { error } = await supabase
      .from('visitantes').update({ nota_contato: nota.trim() || null }).eq('id', v.id);
    setSalvando(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    setAberto(null);
    carregar();
  };

  const chamarWhatsApp = async (v: Visitante) => {
    if (!v.telefone_digitos) return;
    const texto = t('visitantes.mensagemBoasVindas', { nome: v.nome.split(' ')[0] });
    const url = `https://wa.me/${v.telefone_digitos}?text=${encodeURIComponent(texto)}`;
    if (!(await Linking.canOpenURL(url))) { Alert.alert(t('common.erro'), t('visitantes.semWhatsApp')); return; }
    Linking.openURL(url);
  };

  const filtrada = lista.filter(v => {
    const q = busca.trim().toLowerCase();
    const bateBusca = !q || v.nome.toLowerCase().includes(q) || (v.telefone ?? '').includes(q);
    const bateFiltro = filtro === 'todos' || v.situacao === filtro;
    return bateBusca && bateFiltro;
  });

  const corDaSituacao = (sit: Situacao) =>
    (SITUACOES.find(x => x.valor === sit)?.cor(C)) ?? C.textMuted;
  const chaveDaSituacao = (sit: Situacao) =>
    SITUACOES.find(x => x.valor === sit)?.chave ?? 'visitantes.sitNovo';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.headerBg} />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('visitantes.titulo')}</Text>
        <View style={{ flexDirection: 'row' }}>
          {ehAdmin && (
            <TouchableOpacity style={s.backBtn} onPress={() => setEquipeAberta(true)} hitSlop={8}>
              <Ionicons name="people-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={s.backBtn}
            onPress={() => navigation.navigate('RegistrarVisitante' as never)}
            hitSlop={8}
          >
            <Ionicons name="person-add-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {!!resumo && (
        <View style={s.statsRow}>
          {[
            { label: t('visitantes.statSemana'), valor: resumo.novos_semana, cor: C.accent },
            { label: t('visitantes.statMes'), valor: resumo.novos_mes, cor: C.primary },
            { label: t('visitantes.statAguardando'), valor: resumo.aguardando, cor: C.danger },
            { label: t('visitantes.statMembros'), valor: resumo.viraram_membro, cor: C.success },
          ].map(st => (
            <View key={st.label} style={s.statCard}>
              <Text style={[s.statValor, { color: st.cor }]}>{st.valor ?? 0}</Text>
              <Text style={s.statLabel} numberOfLines={2}>{st.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.buscaWrap}>
        <Ionicons name="search-outline" size={16} color={C.textMuted} />
        <TextInput
          style={s.buscaInput} value={busca} onChangeText={setBusca}
          placeholder={t('visitantes.buscar')} placeholderTextColor={C.textDim}
        />
        {!!busca && (
          <TouchableOpacity onPress={() => setBusca('')}>
            <Ionicons name="close-circle" size={16} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.filtroScroll} contentContainerStyle={s.filtroRow}>
        <TouchableOpacity
          style={[s.filtroPill, filtro === 'todos' && s.filtroPillAtiva]}
          onPress={() => setFiltro('todos')}
        >
          <Text style={[s.filtroTexto, filtro === 'todos' && s.filtroTextoAtivo]}>
            {t('visitantes.todos')}
          </Text>
        </TouchableOpacity>
        {SITUACOES.map(st => (
          <TouchableOpacity
            key={st.valor}
            style={[s.filtroPill, filtro === st.valor && s.filtroPillAtiva]}
            onPress={() => setFiltro(st.valor)}
          >
            <Text style={[s.filtroTexto, filtro === st.valor && s.filtroTextoAtivo]}>
              {t(st.chave)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {carregando ? (
        <View style={s.centro}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.lista}
          refreshControl={<RefreshControl refreshing={atualizando}
            onRefresh={() => { setAtualizando(true); carregar(); }} />}
        >
          {filtrada.length === 0 ? (
            <View style={s.centro}>
              <Ionicons name="people-outline" size={40} color={C.textDim} />
              <Text style={s.vazio}>
                {lista.length === 0 ? t('visitantes.nenhumAinda') : t('visitantes.nenhumNesteFiltro')}
              </Text>
            </View>
          ) : filtrada.map(v => (
            <TouchableOpacity key={v.id} style={s.cartao} onPress={() => abrir(v)} activeOpacity={0.75}>
              <View style={[s.avatar, { backgroundColor: corDaSituacao(v.situacao) + '22' }]}>
                <Text style={[s.avatarTexto, { color: corDaSituacao(v.situacao) }]}>
                  {v.nome[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.cartaoNome} numberOfLines={1}>{v.nome}</Text>
                  {v.total_visitas > 1 && (
                    <View style={s.tagVisitas}>
                      <Text style={s.tagVisitasTexto}>{t('visitantes.nVisitas', { count: v.total_visitas })}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.cartaoSub} numberOfLines={1}>
                  {formatDataBR(v.ultima_visita)}
                  {v.como_conheceu ? ` · ${v.como_conheceu}` : ''}
                </Text>
                {!v.consentiu_contato && (
                  <Text style={s.semConsent}>{t('visitantes.semConsentimentoTag')}</Text>
                )}
              </View>
              {!!v.telefone_digitos && v.consentiu_contato && (
                <TouchableOpacity onPress={() => chamarWhatsApp(v)} style={s.whatsBtn} hitSlop={8}>
                  <Ionicons name="logo-whatsapp" size={20} color={C.whats} />
                </TouchableOpacity>
              )}
              <View style={[s.selo, { backgroundColor: corDaSituacao(v.situacao) + '1A' }]}>
                <Text style={[s.seloTexto, { color: corDaSituacao(v.situacao) }]}>
                  {t(chaveDaSituacao(v.situacao))}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Ficha e follow-up */}
      <Modal visible={!!aberto} animationType="slide" transparent onRequestClose={() => setAberto(null)}>
        <View style={s.modalFundo}>
          <View style={s.modalCartao}>
            <View style={s.modalTopo}>
              <Text style={s.modalTitulo} numberOfLines={1}>{aberto?.nome}</Text>
              <TouchableOpacity onPress={() => setAberto(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexShrink: 1 }}>
              {!!aberto?.telefone && <Linha s={s} C={C} icone="call-outline" texto={aberto.telefone} />}
              {!!aberto?.email && <Linha s={s} C={C} icone="mail-outline" texto={aberto.email} />}
              <Linha s={s} C={C} icone="calendar-outline"
                texto={t('visitantes.visitouEm', {
                  primeira: formatDataBR(aberto?.primeira_visita ?? null),
                  ultima: formatDataBR(aberto?.ultima_visita ?? null),
                  count: aberto?.total_visitas ?? 1,
                })} />
              {!!aberto?.como_conheceu && <Linha s={s} C={C} icone="compass-outline" texto={aberto.como_conheceu} />}
              {!!aberto?.observacoes && <Linha s={s} C={C} icone="document-text-outline" texto={aberto.observacoes} />}
              {!aberto?.consentiu_contato && (
                <View style={s.alertaConsent}>
                  <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
                  <Text style={s.alertaConsentTexto}>{t('visitantes.semConsentimentoFicha')}</Text>
                </View>
              )}

              <Text style={s.modalLabel}>{t('visitantes.notaContato')}</Text>
              <TextInput
                style={s.modalInput} value={nota} onChangeText={setNota}
                placeholder={t('visitantes.notaPlaceholder')} placeholderTextColor={C.textDim}
                multiline
              />

              <Text style={s.modalLabel}>{t('visitantes.situacao')}</Text>
              <View style={s.pillWrap}>
                {SITUACOES.map(st => (
                  <TouchableOpacity
                    key={st.valor}
                    style={[s.pill, aberto?.situacao === st.valor && { backgroundColor: st.cor(C) + '22', borderColor: st.cor(C) }]}
                    onPress={() => aberto && mudarSituacao(aberto, st.valor)}
                    disabled={salvando}
                  >
                    <Text style={[s.pillTexto, aberto?.situacao === st.valor && { color: st.cor(C), fontWeight: '700' }]}>
                      {t(st.chave)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={s.modalBotoes}>
              {!!aberto?.telefone_digitos && aberto.consentiu_contato && (
                <TouchableOpacity style={s.btnWhats} onPress={() => aberto && chamarWhatsApp(aberto)}>
                  <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                  <Text style={s.btnWhatsTexto}>WhatsApp</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={s.btnSalvar}
                onPress={() => aberto && salvarNota(aberto)}
                disabled={salvando}
              >
                {salvando ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.btnSalvarTexto}>{t('visitantes.salvarNota')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Equipe de acolhimento — só admin */}
      <Modal visible={equipeAberta} animationType="slide" transparent
        onRequestClose={() => setEquipeAberta(false)}>
        <View style={s.modalFundo}>
          <View style={s.modalCartao}>
            <View style={s.modalTopo}>
              <Text style={s.modalTitulo}>{t('visitantes.equipeTitulo')}</Text>
              <TouchableOpacity onPress={() => setEquipeAberta(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={s.equipeAjuda}>{t('visitantes.equipeAjuda')}</Text>

            <View style={s.buscaWrap}>
              <Ionicons name="search-outline" size={16} color={C.textMuted} />
              <TextInput
                style={s.buscaInput} value={buscaPessoa} onChangeText={setBuscaPessoa}
                placeholder={t('visitantes.equipeBuscar')} placeholderTextColor={C.textDim}
              />
            </View>

            <ScrollView style={{ flexShrink: 1 }}>
              {achados.map(p => (
                <TouchableOpacity key={p.id} style={s.pessoaLinha} onPress={() => adicionarNaEquipe(p)}>
                  <Ionicons name="add-circle-outline" size={20} color={C.success} />
                  <Text style={s.pessoaNome}>{p.full_name ?? '—'}</Text>
                </TouchableOpacity>
              ))}

              {achados.length === 0 && (
                <>
                  <Text style={s.modalLabel}>{t('visitantes.equipeAtual')}</Text>
                  {equipe.length === 0 ? (
                    <Text style={s.equipeVazia}>{t('visitantes.equipeVazia')}</Text>
                  ) : equipe.map(p => (
                    <View key={p.id} style={s.pessoaLinha}>
                      <Ionicons name="person-circle-outline" size={20} color={C.primary} />
                      <Text style={s.pessoaNome}>{p.full_name ?? '—'}</Text>
                      <TouchableOpacity onPress={() => tirarDaEquipe(p)} hitSlop={8}>
                        <Ionicons name="close-circle-outline" size={19} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Fora do componente: dentro dele, a identidade mudaria a cada render.
function Linha({ s, C, icone, texto }: { s: any; C: any; icone: string; texto: string }) {
  return (
    <View style={s.linha}>
      <Ionicons name={icone as any} size={15} color={C.textMuted} />
      <Text style={s.linhaTexto}>{texto}</Text>
    </View>
  );
}

function buildStyles(C: ReturnType<typeof paleta>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: C.headerBg, paddingHorizontal: 8, paddingVertical: 12,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
    statsRow: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: C.headerBg,
    },
    statCard: {
      flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10,
      paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center',
    },
    statValor: { fontSize: 19, fontWeight: '800' },
    statLabel: { fontSize: 9.5, color: 'rgba(255,255,255,0.72)', textAlign: 'center', marginTop: 2 },
    buscaWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 8,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      borderRadius: 10, paddingHorizontal: 12, height: 44,
    },
    buscaInput: { flex: 1, fontSize: 14.5, color: C.text },
    filtroScroll: { maxHeight: 54 },
    filtroRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center', paddingBottom: 8 },
    filtroPill: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    filtroPillAtiva: { backgroundColor: C.accent + '22', borderColor: C.accent },
    filtroTexto: { fontSize: 12.5, color: C.textMuted, fontWeight: '600' },
    filtroTextoAtivo: { color: C.accent, fontWeight: '800' },
    lista: { paddingHorizontal: 16, paddingBottom: 40 },
    cartao: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface, borderRadius: 12, borderWidth: 1,
      borderColor: C.border, padding: 12, marginBottom: 8,
    },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    avatarTexto: { fontSize: 16, fontWeight: '800' },
    cartaoNome: { fontSize: 15, fontWeight: '700', color: C.text, flexShrink: 1 },
    cartaoSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    semConsent: { fontSize: 10.5, color: C.danger, fontWeight: '700', marginTop: 3 },
    tagVisitas: { backgroundColor: C.primary + '1F', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    tagVisitasTexto: { fontSize: 9.5, fontWeight: '800', color: C.primary },
    whatsBtn: { padding: 6 },
    selo: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    seloTexto: { fontSize: 10, fontWeight: '800' },
    centro: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
    vazio: { fontSize: 14, color: C.textMuted, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
    modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCartao: {
      backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, maxHeight: '88%',
    },
    modalTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    modalTitulo: { fontSize: 19, fontWeight: '800', color: C.text, flex: 1 },
    linha: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 7 },
    linhaTexto: { fontSize: 14, color: C.text, flex: 1, lineHeight: 19.5 },
    alertaConsent: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10,
      backgroundColor: C.danger + '12', borderWidth: 1, borderColor: C.danger + '44',
      borderRadius: 10, padding: 10,
    },
    alertaConsentTexto: { fontSize: 12.5, color: C.text, flex: 1, lineHeight: 17.5 },
    modalLabel: {
      fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6,
      textTransform: 'uppercase', marginTop: 18, marginBottom: 7,
    },
    modalInput: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      borderRadius: 10, padding: 12, height: 80, textAlignVertical: 'top',
      fontSize: 14.5, color: C.text,
    },
    pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      paddingHorizontal: 13, paddingVertical: 7, borderRadius: 18,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    pillTexto: { fontSize: 12.5, color: C.textMuted, fontWeight: '600' },
    modalBotoes: { flexDirection: 'row', gap: 10, marginTop: 18 },
    btnWhats: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: C.whats, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18,
    },
    btnWhatsTexto: { fontSize: 14, fontWeight: '800', color: '#fff' },
    btnSalvar: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14,
    },
    btnSalvarTexto: { fontSize: 14, fontWeight: '800', color: '#fff' },
    equipeAjuda: { fontSize: 13, color: C.textMuted, lineHeight: 18.5, marginBottom: 14 },
    equipeVazia: { fontSize: 13, color: C.textMuted, paddingVertical: 14, textAlign: 'center' },
    pessoaLinha: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    pessoaNome: { flex: 1, fontSize: 14.5, color: C.text, fontWeight: '600' },
  });
}
