// screens/ConversasScreen.tsx
//
// Aba "Conversas" (pedido do Marcos, 11/11/2026): o Chat da Igreja e as
// conversas privadas entre membros, num lugar só, como no WhatsApp.
//
// Regras (todas garantidas no banco — migração 20261111220000):
// • Só membros. Mensagens somem em 15 dias.
// • Adulto ↔ menor de 18: conversa protegida (4 meses, sem envio 22h–7h,
//   supervisores de proteção podem ler com motivo, responsáveis veem com quem
//   o filho conversa). Para abrir uma conversa, a pessoa precisa ter a data
//   de nascimento na ficha — esta tela pede.
// • O admin não lê conversa privada; só o que for denunciado.
//
// Entradas: ícone 💬 da Home, push "conversa" (`abrir` = id da conversa) e
// "Mensagem privada" no menu de uma mensagem em qualquer chat (`abrirCom`).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Modal, TextInput,
  Alert, Switch, Platform, KeyboardAvoidingView, ScrollView, Image, Linking, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/useAuth';
import { useAcesso } from '../lib/acesso';
import { useTheme, type ThemeColors } from '../lib/theme';
import { supabase } from '../lib/supabase';
import ChatGeralModal from '../components/ChatGeralModal';
import { fontePrivada, COR_PRIVADA, COR_IGREJA, BUCKET_PRIVADO } from '../lib/chatFonte';
import { urlDaMidia } from '../lib/chatGeral';
import {
  minhasConversas, membrosParaConversa, abrirConversa, minhaSituacao, definirMinhaDataNascimento,
  definirAceitaPrivadas, gerarCodigoVinculo, usarCodigoVinculo, conversasDosMeusFilhos,
  supervisaoConversas, supervisaoLer, erroDaConversa,
  type ConversaResumo, type MembroParaConversa, type SituacaoPrivadas, type ConversaDoFilho,
  type ConversaSupervisao, type MensagemSupervisao,
} from '../lib/conversas';

// Mesmo cuidado da tela Devocionais: no iOS o modal já começa abaixo da barra.
function topoDoModal(insetTop: number) {
  return Platform.OS === 'ios' ? 16 : insetTop + 12;
}

type Aberta = { conversa_id: string; nome: string; protegida: boolean };

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

function horaCurta(iso: string, locale: string) {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function dataHoraBR(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

/** DD/MM/AAAA → AAAA-MM-DD (ou null se inválida). */
function isoDaData(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const [, dd, mm, aa] = m;
  const d = new Date(Number(aa), Number(mm) - 1, Number(dd));
  if (d.getFullYear() !== Number(aa) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
  return `${aa}-${mm}-${dd}`;
}

/** Máscara DD/MM/AAAA enquanto digita. */
function mascaraData(txt: string) {
  const n = txt.replace(/\D/g, '').slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
}

function Avatar({ nome, foto, cor, tam = 46 }: { nome: string; foto?: string | null; cor: string; tam?: number }) {
  if (foto) {
    return <Image source={{ uri: foto }} style={{ width: tam, height: tam, borderRadius: tam / 2, backgroundColor: '#ddd' }} />;
  }
  return (
    <View style={{ width: tam, height: tam, borderRadius: tam / 2, backgroundColor: cor, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: tam * 0.36 }}>{iniciais(nome)}</Text>
    </View>
  );
}

export default function ConversasScreen({ navigation, route }: { navigation: any; route: any }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { ehMembro, carregando: carregandoPapel } = useAcesso();
  const { colors: C } = useTheme();
  const s = useMemo(() => estilos(C), [C]);
  const insets = useSafeAreaInsets();
  const locale = i18n.language === 'pt' ? 'pt-BR' : i18n.language;

  const [lista, setLista] = useState<ConversaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [situacao, setSituacao] = useState<SituacaoPrivadas | null>(null);
  const [aberta, setAberta] = useState<Aberta | null>(null);

  // Modais
  const [novaVisivel, setNovaVisivel] = useState(false);
  const [busca, setBusca] = useState('');
  const [membros, setMembros] = useState<MembroParaConversa[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [menuVisivel, setMenuVisivel] = useState(false);
  const [nascVisivel, setNascVisivel] = useState(false);
  const [nascTexto, setNascTexto] = useState('');
  const [codigoMeu, setCodigoMeu] = useState<string | null>(null);
  const [vincularVisivel, setVincularVisivel] = useState(false);
  const [codigoDigitado, setCodigoDigitado] = useState('');
  const [filhosVisivel, setFilhosVisivel] = useState(false);
  const [filhos, setFilhos] = useState<ConversaDoFilho[]>([]);
  const [supVisivel, setSupVisivel] = useState(false);
  const [supLista, setSupLista] = useState<ConversaSupervisao[]>([]);
  const [supEscolhida, setSupEscolhida] = useState<ConversaSupervisao | null>(null);
  const [supMotivo, setSupMotivo] = useState('');
  const [supMsgs, setSupMsgs] = useState<MensagemSupervisao[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Quem eu ia abrir antes de pedir a data de nascimento.
  const pendente = useRef<{ id: string; nome: string } | null>(null);

  const carregar = useCallback(async () => {
    const [l, sit] = await Promise.all([minhasConversas(), minhaSituacao()]);
    setLista(l);
    setSituacao(sit);
    setCarregando(false);
    return l;
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  // Lista ao vivo: nova mensagem em qualquer conversa minha (a RLS só entrega
  // as minhas) atualiza a ordem e o contador.
  useEffect(() => {
    const canal = supabase
      .channel('conversas_lista')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversa_mensagens' }, () => { carregar(); })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [carregar]);

  // ── Abrir conversa com alguém ─────────────────────────────────────────────
  const iniciarCom = useCallback(async (outroId: string, nome: string) => {
    setOcupado(true);
    const r = await abrirConversa(outroId);
    setOcupado(false);
    if (r.status === 'ok') {
      setNovaVisivel(false);
      setAberta({ conversa_id: r.conversa_id, nome, protegida: r.protegida });
      return;
    }
    if (r.status === 'sem_nascimento') {
      pendente.current = { id: outroId, nome };
      setNovaVisivel(false);
      setNascTexto('');
      setTimeout(() => setNascVisivel(true), 350);
      return;
    }
    const msg = r.status === 'bloqueado' ? t('conversas.erroBloqueado')
      : r.status === 'nao_aceita' ? t('conversas.erroNaoAceitaNome', { nome })
        : t('conversas.erroSemAcesso');
    Alert.alert(t('conversas.titulo'), msg);
  }, [t]);

  // Parâmetros de rota: push (`abrir`) e "Mensagem privada" (`abrirCom`).
  useEffect(() => {
    const p = route?.params ?? {};
    if (carregandoPapel || !ehMembro) return;
    if (p.abrirCom) {
      const { abrirCom, nome } = p;
      navigation.setParams({ abrirCom: undefined, nome: undefined, em: undefined });
      if (abrirCom !== user?.id) iniciarCom(abrirCom, nome ?? t('conversas.membro'));
    } else if (p.abrir) {
      const id = p.abrir as string;
      navigation.setParams({ abrir: undefined });
      (async () => {
        const l = lista.some(c => c.conversa_id === id) ? lista : await carregar();
        const c = l.find(x => x.conversa_id === id);
        if (c) setAberta({ conversa_id: c.conversa_id, nome: c.outro_nome, protegida: c.protegida });
      })();
    }
  }, [route?.params?.abrirCom, route?.params?.abrir, route?.params?.em, carregandoPapel, ehMembro]);

  // ── Busca de membros (Nova conversa) ──────────────────────────────────────
  useEffect(() => {
    if (!novaVisivel) return;
    setBuscando(true);
    const id = setTimeout(async () => {
      setMembros(await membrosParaConversa(busca.trim()));
      setBuscando(false);
    }, 250);
    return () => clearTimeout(id);
  }, [busca, novaVisivel]);

  // ── Data de nascimento ────────────────────────────────────────────────────
  const salvarNascimento = async () => {
    const iso = isoDaData(nascTexto);
    if (!iso) { Alert.alert(t('conversas.nascTitulo'), t('conversas.nascInvalida')); return; }
    setOcupado(true);
    const r = await definirMinhaDataNascimento(iso);
    setOcupado(false);
    if (r === 'data_invalida') { Alert.alert(t('conversas.nascTitulo'), t('conversas.nascInvalida')); return; }
    if (r === 'sem_ficha') { setNascVisivel(false); Alert.alert(t('conversas.nascTitulo'), t('conversas.nascSemFicha')); return; }
    if (r !== 'ok' && r !== 'ja_tinha') { Alert.alert(t('common.erro'), t('conversas.erroSemAcesso')); return; }
    setNascVisivel(false);
    carregar();
    const p = pendente.current;
    pendente.current = null;
    if (p) setTimeout(() => iniciarCom(p.id, p.nome), 350);
  };

  // ── Menu ⋯ ────────────────────────────────────────────────────────────────
  const alternarAceita = async (v: boolean) => {
    setSituacao(prev => (prev ? { ...prev, aceita: v } : prev));
    if (!(await definirAceitaPrivadas(v))) {
      setSituacao(prev => (prev ? { ...prev, aceita: !v } : prev));
      Alert.alert(t('common.erro'), t('conversas.erroSemAcesso'));
    }
  };

  const meuCodigo = async () => {
    setOcupado(true);
    const c = await gerarCodigoVinculo();
    setOcupado(false);
    if (!c) { Alert.alert(t('common.erro'), t('conversas.erroSemAcesso')); return; }
    setCodigoMeu(c);
  };

  const vincularFilho = async () => {
    const cod = codigoDigitado.trim().toUpperCase();
    if (cod.length !== 6) { Alert.alert(t('conversas.vincularTitulo'), t('conversas.codigoInvalido')); return; }
    setOcupado(true);
    const r = await usarCodigoVinculo(cod);
    setOcupado(false);
    if (r.status === 'ok') {
      setVincularVisivel(false);
      setCodigoDigitado('');
      carregar();
      Alert.alert(t('conversas.vincularTitulo'), t('conversas.vinculadoOk', { nome: r.nome ?? '' }));
    } else if (r.status === 'proprio') {
      Alert.alert(t('conversas.vincularTitulo'), t('conversas.codigoProprio'));
    } else {
      Alert.alert(t('conversas.vincularTitulo'), t('conversas.codigoInvalido'));
    }
  };

  const abrirFilhos = async () => {
    setMenuVisivel(false);
    setFilhos(await conversasDosMeusFilhos());
    setTimeout(() => setFilhosVisivel(true), 350);
  };

  const abrirSupervisao = async () => {
    setMenuVisivel(false);
    setSupEscolhida(null);
    setSupMsgs(null);
    setSupMotivo('');
    setSupLista(await supervisaoConversas());
    setTimeout(() => setSupVisivel(true), 350);
  };

  const lerSupervisao = async () => {
    if (!supEscolhida) return;
    if (supMotivo.trim().length < 5) { Alert.alert(t('conversas.supTitulo'), t('conversas.erroMotivo')); return; }
    setOcupado(true);
    const r = await supervisaoLer(supEscolhida.conversa_id, supMotivo.trim());
    setOcupado(false);
    if (!r.ok) { Alert.alert(t('conversas.supTitulo'), erroDaConversa(t, r.erro) ?? r.erro); return; }
    setSupMsgs(r.msgs);
  };

  const abrirArquivoSupervisao = async (caminho: string) => {
    try { Linking.openURL(await urlDaMidia(caminho, BUCKET_PRIVADO)); } catch { /* sem acesso */ }
  };

  const previa = (c: ConversaResumo) => {
    if (!c.ultima_tipo) return t('conversas.novaConversaSemMsg');
    const corpo = c.ultima_tipo === 'imagem' ? `📷 ${t('conversas.foto')}`
      : c.ultima_tipo === 'audio' ? `🎤 ${t('conversas.voz')}`
        : c.ultima_tipo === 'video' ? `🎬 ${t('conversas.video')}`
          : c.ultima_tipo === 'arquivo' ? `📎 ${t('conversas.arquivo')}`
            : (c.ultima_texto ?? '').replace(/\*/g, '');
    return c.ultima_minha ? `${t('conversas.voce')}: ${corpo}` : corpo;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!carregandoPapel && !ehMembro) {
    return (
      <View style={s.tela}>
        <Cabecalho titulo={t('conversas.titulo')} onFechar={() => navigation.goBack()} topo={topoDoModal(insets.top)} s={s} />
        <View style={s.vazio}>
          <Ionicons name="lock-closed-outline" size={40} color={C.textDim} />
          <Text style={s.vazioTexto}>{t('conversas.soMembros')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.tela}>
      <Cabecalho
        titulo={t('conversas.titulo')}
        onFechar={() => navigation.goBack()}
        topo={topoDoModal(insets.top)}
        s={s}
        direita={(
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={s.headerBtn} onPress={() => setMenuVisivel(true)} accessibilityLabel={t('conversas.opcoes')}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={s.headerBtn} onPress={() => { setBusca(''); setNovaVisivel(true); }} accessibilityLabel={t('conversas.nova')}>
              <Ionicons name="create-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      />

      {carregando ? (
        <ActivityIndicator color={COR_PRIVADA} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={c => c.conversa_id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
          ListHeaderComponent={(
            <View>
              {situacao && !situacao.aceita && (
                <TouchableOpacity style={s.faixa} onPress={() => setMenuVisivel(true)}>
                  <Ionicons name="notifications-off-outline" size={16} color={C.text} />
                  <Text style={s.faixaTexto}>{t('conversas.faixaNaoAceita')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={s.linha}
                onPress={() => navigation.navigate('MainTabs', { screen: 'Inicio', params: { abrirChatIgreja: Date.now() } })}
              >
                <View style={[s.avatarIcone, { backgroundColor: COR_IGREJA }]}>
                  <Ionicons name="people" size={22} color="#fff" />
                </View>
                <View style={s.linhaMeio}>
                  <Text style={s.nome}>{t('chatGeral.titulo')}</Text>
                  <Text style={s.previa} numberOfLines={1}>{t('conversas.igrejaSub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.textDim} />
              </TouchableOpacity>
              <Text style={s.secao}>{t('conversas.privadas')}</Text>
            </View>
          )}
          ListEmptyComponent={(
            <View style={s.vazio}>
              <Ionicons name="chatbubbles-outline" size={40} color={C.textDim} />
              <Text style={s.vazioTexto}>{t('conversas.vazio')}</Text>
              <TouchableOpacity style={s.botao} onPress={() => { setBusca(''); setNovaVisivel(true); }}>
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={s.botaoTexto}>{t('conversas.nova')}</Text>
              </TouchableOpacity>
            </View>
          )}
          renderItem={({ item: c }) => (
            <TouchableOpacity style={s.linha} onPress={() => setAberta({ conversa_id: c.conversa_id, nome: c.outro_nome, protegida: c.protegida })}>
              <Avatar nome={c.outro_nome} foto={c.outro_foto} cor={COR_PRIVADA} />
              <View style={s.linhaMeio}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.nome, { flexShrink: 1 }]} numberOfLines={1}>{c.outro_nome}</Text>
                  {c.protegida && <Ionicons name="shield-checkmark-outline" size={14} color={COR_PRIVADA} />}
                </View>
                <Text style={[s.previa, c.nao_lidas > 0 && s.previaNova]} numberOfLines={1}>{previa(c)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[s.hora, c.nao_lidas > 0 && { color: COR_PRIVADA, fontWeight: '700' }]}>{horaCurta(c.ultima_em, locale)}</Text>
                {c.nao_lidas > 0 && (
                  <View style={s.badge}><Text style={s.badgeTexto}>{c.nao_lidas > 99 ? '99+' : c.nao_lidas}</Text></View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── Conversa aberta ─────────────────────────────────────────────── */}
      {aberta && user?.id && (
        <ChatGeralModal
          visible
          userId={user.id}
          ehAdmin={false}
          fonte={fontePrivada(t, aberta.conversa_id, aberta.nome, aberta.protegida)}
          onClose={() => { setAberta(null); carregar(); }}
        />
      )}

      {/* ── Nova conversa ───────────────────────────────────────────────── */}
      <Modal visible={novaVisivel} animationType="slide" onRequestClose={() => setNovaVisivel(false)}>
        <View style={s.tela}>
          <Cabecalho titulo={t('conversas.nova')} onFechar={() => setNovaVisivel(false)} topo={insets.top + 12} s={s} voltar />
          <View style={s.buscaWrap}>
            <Ionicons name="search" size={18} color={C.textMuted} />
            <TextInput
              style={s.buscaInput}
              placeholder={t('conversas.buscarMembro')}
              placeholderTextColor={C.textDim}
              value={busca}
              onChangeText={setBusca}
              autoFocus
              autoCorrect={false}
            />
          </View>
          {buscando && membros.length === 0 ? (
            <ActivityIndicator color={COR_PRIVADA} style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={membros}
              keyExtractor={m => m.user_id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={[s.vazioTexto, { marginTop: 30 }]}>{t('conversas.nenhumMembro')}</Text>}
              renderItem={({ item: m }) => (
                <TouchableOpacity style={s.linha} disabled={ocupado} onPress={() => iniciarCom(m.user_id, m.nome)}>
                  <Avatar nome={m.nome} foto={m.foto} cor={COR_PRIVADA} tam={40} />
                  <Text style={[s.nome, { flex: 1, marginLeft: 12 }]} numberOfLines={1}>{m.nome}</Text>
                  <Ionicons name="chatbubble-outline" size={18} color={COR_PRIVADA} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* ── Data de nascimento ──────────────────────────────────────────── */}
      <Modal visible={nascVisivel} transparent animationType="fade" onRequestClose={() => setNascVisivel(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.fundo}>
          <View style={s.cartao}>
            <Text style={s.cartaoTitulo}>{t('conversas.nascTitulo')}</Text>
            <Text style={s.cartaoTexto}>{t('conversas.nascTexto')}</Text>
            <TextInput
              style={s.campo}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={C.textDim}
              keyboardType="number-pad"
              value={nascTexto}
              onChangeText={v => setNascTexto(mascaraData(v))}
              maxLength={10}
            />
            <View style={s.cartaoBotoes}>
              <TouchableOpacity onPress={() => { pendente.current = null; setNascVisivel(false); }} style={s.botaoSec}>
                <Text style={s.botaoSecTexto}>{t('common.cancelar')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={salvarNascimento} style={s.botao} disabled={ocupado}>
                {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>{t('conversas.continuar')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Menu ⋯ ──────────────────────────────────────────────────────── */}
      <Modal visible={menuVisivel} transparent animationType="fade" onRequestClose={() => setMenuVisivel(false)}>
        <Pressable style={s.fundoBaixo} onPress={() => { setMenuVisivel(false); setCodigoMeu(null); }}>
          <Pressable style={[s.folha, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={s.itemMenu}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={C.text} />
              <View style={{ flex: 1 }}>
                <Text style={s.itemMenuTexto}>{t('conversas.aceitar')}</Text>
                <Text style={s.itemMenuSub}>{t('conversas.aceitarSub')}</Text>
              </View>
              <Switch value={situacao?.aceita ?? true} onValueChange={alternarAceita} trackColor={{ true: COR_PRIVADA, false: undefined }} />
            </View>

            {situacao?.menor ? (
              <View style={s.itemMenuBloco}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Ionicons name="people-outline" size={20} color={C.text} />
                  <Text style={[s.itemMenuTexto, { flex: 1 }]}>{t('conversas.meuResponsavel')}</Text>
                </View>
                {situacao.responsaveis.length > 0 && (
                  <Text style={s.itemMenuSub}>{t('conversas.vinculadoA', { nomes: situacao.responsaveis.join(', ') })}</Text>
                )}
                {codigoMeu ? (
                  <View style={{ alignItems: 'center', marginTop: 10 }}>
                    <Text style={s.codigo}>{codigoMeu}</Text>
                    <Text style={[s.itemMenuSub, { textAlign: 'center' }]}>{t('conversas.codigoInstrucao')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={[s.botao, { alignSelf: 'flex-start', marginTop: 10 }]} onPress={meuCodigo} disabled={ocupado}>
                    <Text style={s.botaoTexto}>{t('conversas.gerarCodigo')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity style={s.itemMenu} onPress={() => { setMenuVisivel(false); setCodigoDigitado(''); setTimeout(() => setVincularVisivel(true), 350); }}>
                <Ionicons name="link-outline" size={20} color={C.text} />
                <View style={{ flex: 1 }}>
                  <Text style={s.itemMenuTexto}>{t('conversas.vincularTitulo')}</Text>
                  <Text style={s.itemMenuSub}>{t('conversas.vincularSub')}</Text>
                </View>
              </TouchableOpacity>
            )}

            {situacao?.tem_filhos_vinculados && (
              <TouchableOpacity style={s.itemMenu} onPress={abrirFilhos}>
                <Ionicons name="eye-outline" size={20} color={C.text} />
                <Text style={[s.itemMenuTexto, { flex: 1 }]}>{t('conversas.filhosTitulo')}</Text>
              </TouchableOpacity>
            )}

            {situacao?.supervisor && (
              <TouchableOpacity style={s.itemMenu} onPress={abrirSupervisao}>
                <Ionicons name="shield-checkmark-outline" size={20} color={C.text} />
                <Text style={[s.itemMenuTexto, { flex: 1 }]}>{t('conversas.supTitulo')}</Text>
              </TouchableOpacity>
            )}

            <Text style={[s.itemMenuSub, { marginTop: 12 }]}>{t('conversas.regrasResumo')}</Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Vincular conta de um filho ──────────────────────────────────── */}
      <Modal visible={vincularVisivel} transparent animationType="fade" onRequestClose={() => setVincularVisivel(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.fundo}>
          <View style={s.cartao}>
            <Text style={s.cartaoTitulo}>{t('conversas.vincularTitulo')}</Text>
            <Text style={s.cartaoTexto}>{t('conversas.vincularTexto')}</Text>
            <TextInput
              style={[s.campo, { letterSpacing: 6, textAlign: 'center', fontSize: 22 }]}
              placeholder="ABC123"
              placeholderTextColor={C.textDim}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              value={codigoDigitado}
              onChangeText={v => setCodigoDigitado(v.toUpperCase())}
            />
            <View style={s.cartaoBotoes}>
              <TouchableOpacity onPress={() => setVincularVisivel(false)} style={s.botaoSec}>
                <Text style={s.botaoSecTexto}>{t('common.cancelar')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={vincularFilho} style={s.botao} disabled={ocupado}>
                {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>{t('conversas.vincular')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Conversas dos meus filhos (só nomes) ────────────────────────── */}
      <Modal visible={filhosVisivel} animationType="slide" onRequestClose={() => setFilhosVisivel(false)}>
        <View style={s.tela}>
          <Cabecalho titulo={t('conversas.filhosTitulo')} onFechar={() => setFilhosVisivel(false)} topo={insets.top + 12} s={s} voltar />
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}>
            <Text style={s.cartaoTexto}>{t('conversas.filhosExplica')}</Text>
            {Object.entries(filhos.reduce<Record<string, ConversaDoFilho[]>>((acc, f) => {
              (acc[f.filho_nome] = acc[f.filho_nome] ?? []).push(f); return acc;
            }, {})).map(([nome, itens]) => (
              <View key={nome} style={s.blocoFilho}>
                <Text style={s.nome}>{nome}</Text>
                {itens.filter(i => i.com_nome).length === 0 ? (
                  <Text style={s.previa}>{t('conversas.filhoSemConversas')}</Text>
                ) : itens.filter(i => i.com_nome).map((i, k) => (
                  <View key={k} style={s.linhaFilho}>
                    <Ionicons name="chatbubble-outline" size={14} color={C.textMuted} />
                    <Text style={[s.previa, { flex: 1 }]}>{i.com_nome}</Text>
                    {!!i.ultima_em && <Text style={s.hora}>{dataHoraBR(i.ultima_em)}</Text>}
                  </View>
                ))}
              </View>
            ))}
            {filhos.length === 0 && <Text style={[s.vazioTexto, { marginTop: 20 }]}>{t('conversas.filhosVazio')}</Text>}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Supervisão de proteção ──────────────────────────────────────── */}
      <Modal visible={supVisivel} animationType="slide" onRequestClose={() => setSupVisivel(false)}>
        <View style={s.tela}>
          <Cabecalho
            titulo={supEscolhida ? `${supEscolhida.nome_a} ↔ ${supEscolhida.nome_b}` : t('conversas.supTitulo')}
            onFechar={() => { if (supEscolhida) { setSupEscolhida(null); setSupMsgs(null); setSupMotivo(''); } else setSupVisivel(false); }}
            topo={insets.top + 12}
            s={s}
            voltar
          />
          {!supEscolhida ? (
            <FlatList
              data={supLista}
              keyExtractor={c => c.conversa_id}
              ListHeaderComponent={<Text style={[s.cartaoTexto, { padding: 16 }]}>{t('conversas.supExplica')}</Text>}
              ListEmptyComponent={<Text style={[s.vazioTexto, { marginTop: 20 }]}>{t('conversas.supVazio')}</Text>}
              renderItem={({ item: c }) => (
                <TouchableOpacity style={s.linha} onPress={() => setSupEscolhida(c)}>
                  <Ionicons name="shield-outline" size={22} color={COR_PRIVADA} />
                  <View style={s.linhaMeio}>
                    <Text style={s.nome} numberOfLines={1}>{c.nome_a} ↔ {c.nome_b}</Text>
                    <Text style={s.previa}>{t('conversas.supMensagens', { n: c.mensagens })} · {dataHoraBR(c.ultima_em)}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          ) : !supMsgs ? (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ padding: 16 }}>
              <Text style={s.cartaoTexto}>{t('conversas.supMotivoTexto')}</Text>
              <TextInput
                style={[s.campo, { minHeight: 90, textAlignVertical: 'top' }]}
                multiline
                placeholder={t('conversas.supMotivoPlaceholder')}
                placeholderTextColor={C.textDim}
                value={supMotivo}
                onChangeText={setSupMotivo}
                maxLength={500}
              />
              <TouchableOpacity style={[s.botao, { marginTop: 12 }]} onPress={lerSupervisao} disabled={ocupado}>
                {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>{t('conversas.supAbrir')}</Text>}
              </TouchableOpacity>
            </KeyboardAvoidingView>
          ) : (
            <FlatList
              data={supMsgs}
              keyExtractor={m => m.id}
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}
              ListHeaderComponent={<Text style={[s.itemMenuSub, { marginBottom: 10 }]}>{t('conversas.supRegistrado')}</Text>}
              renderItem={({ item: m }) => (
                <View style={s.supMsg}>
                  <Text style={s.supAutor}>{m.autor_nome} · {dataHoraBR(m.created_at)}</Text>
                  {m.tipo === 'texto' ? (
                    <Text style={s.supTexto}>{m.texto}</Text>
                  ) : (
                    <TouchableOpacity onPress={() => m.midia_path && abrirArquivoSupervisao(m.midia_path)}>
                      <Text style={[s.supTexto, { color: COR_PRIVADA, textDecorationLine: 'underline' }]}>
                        {m.tipo === 'imagem' ? `📷 ${t('conversas.foto')}`
                          : m.tipo === 'audio' ? `🎤 ${t('conversas.voz')}`
                            : m.tipo === 'video' ? `🎬 ${t('conversas.video')}`
                              : `📎 ${m.midia_nome ?? t('conversas.arquivo')}`}
                        {m.texto ? ` — ${m.texto}` : ''}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function Cabecalho({ titulo, onFechar, topo, s, direita, voltar }: {
  titulo: string; onFechar: () => void; topo: number; s: ReturnType<typeof estilos>; direita?: React.ReactNode; voltar?: boolean;
}) {
  return (
    <View style={[s.header, { paddingTop: topo }]}>
      {voltar && (
        <TouchableOpacity style={[s.headerBtn, { marginRight: 10 }]} onPress={onFechar}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
      )}
      <Text style={s.headerTitulo} numberOfLines={1}>{titulo}</Text>
      {direita}
      {!voltar && (
        <TouchableOpacity style={[s.headerBtn, { marginLeft: 8 }]} onPress={onFechar}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function estilos(C: ThemeColors) {
  return StyleSheet.create({
    tela: { flex: 1, backgroundColor: C.bg },
    header: {
      backgroundColor: COR_PRIVADA, paddingBottom: 14, paddingHorizontal: 16,
      flexDirection: 'row', alignItems: 'center',
    },
    headerTitulo: { flex: 1, fontSize: 18, fontWeight: '800', color: '#fff' },
    headerBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    linha: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, backgroundColor: C.surface,
    },
    linhaMeio: { flex: 1, minWidth: 0 },
    avatarIcone: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    nome: { fontSize: 15, fontWeight: '700', color: C.text },
    previa: { fontSize: 13, color: C.textMuted, marginTop: 2 },
    previaNova: { color: C.text, fontWeight: '600' },
    hora: { fontSize: 11, color: C.textDim },
    badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: COR_PRIVADA, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    badgeTexto: { color: '#fff', fontSize: 11, fontWeight: '800' },
    secao: { fontSize: 11, fontWeight: '800', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 },
    faixa: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, backgroundColor: C.surfaceAlt },
    faixaTexto: { flex: 1, fontSize: 12, color: C.text },
    vazio: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 30, gap: 12 },
    vazioTexto: { fontSize: 14, color: C.textMuted, textAlign: 'center' },
    botao: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COR_PRIVADA, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 18 },
    botaoTexto: { color: '#fff', fontWeight: '800', fontSize: 14 },
    botaoSec: { paddingVertical: 11, paddingHorizontal: 18 },
    botaoSecTexto: { color: C.textMuted, fontWeight: '700', fontSize: 14 },
    buscaWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    buscaInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: C.text },
    fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    fundoBaixo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    cartao: { backgroundColor: C.surface, borderRadius: 18, padding: 20 },
    cartaoTitulo: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 8 },
    cartaoTexto: { fontSize: 14, color: C.textMuted, lineHeight: 20 },
    cartaoBotoes: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
    campo: { marginTop: 14, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.text, backgroundColor: C.bg },
    folha: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
    itemMenu: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    itemMenuBloco: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    itemMenuTexto: { fontSize: 15, fontWeight: '600', color: C.text },
    itemMenuSub: { fontSize: 12, color: C.textMuted, marginTop: 2, lineHeight: 17 },
    codigo: { fontSize: 32, fontWeight: '900', letterSpacing: 8, color: COR_PRIVADA, marginBottom: 6 },
    blocoFilho: { marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, gap: 6 },
    linhaFilho: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    supMsg: { padding: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
    supAutor: { fontSize: 11, fontWeight: '700', color: C.textMuted, marginBottom: 4 },
    supTexto: { fontSize: 14, color: C.text, lineHeight: 20 },
  });
}
