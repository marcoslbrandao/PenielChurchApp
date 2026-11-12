// screens/PastorScreen.tsx
//
// Área do Pastor (pedido do Marcos, nov/2026 — construída em 12/11/2026).
// Agenda (reuniões, aconselhamentos, visitas), anotações do que foi falado e
// lembretes por notificação. Abre com Face ID e tranca de novo quando o app
// vai para o fundo. Só pastores entram (o admin escolhe quem, aqui mesmo).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Switch, AppState, FlatList, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '../lib/theme';
import { useAcesso } from '../lib/acesso';
import { supabase } from '../lib/supabase';
import { pedirBiometria } from '../lib/biometria';
import { mascaraData } from '../lib/eventos';
import {
  TIPOS, tipoDe, type Compromisso, type Nota, type Lembrete, type PessoaIgreja, type TipoCompromisso,
  souPastor, carregarTudo, salvarCompromisso, apagarCompromisso, statusCompromisso, salvarNota, apagarNota,
  salvarLembrete, marcarLembrete, apagarLembrete, buscarPessoas, listaPastores, adicionarPastor, removerPastor,
  paraISO, dataDe, horaDe, chaveDia,
} from '../lib/pastor';

const COR = '#3B2E8C';
type Aba = 'agenda' | 'notas' | 'lembretes';
const LEMBRETES_MIN: (number | null)[] = [null, 15, 60, 180, 1440];

const mascaraHora = (v: string) => { const n = v.replace(/\D/g, '').slice(0, 4); return n.length <= 2 ? n : `${n.slice(0, 2)}:${n.slice(2)}`; };

// ─── Escolher pessoa (da igreja ou nome livre) ───────────────────────────────
function CampoPessoa({ nome, setNome, setMemberId, C, s, t }: {
  nome: string; setNome: (v: string) => void; setMemberId: (v: string | null) => void;
  C: ThemeColors; s: ReturnType<typeof estilos>; t: any;
}) {
  const [achados, setAchados] = useState<PessoaIgreja[]>([]);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const id = setTimeout(() => buscarPessoas(nome).then(setAchados), 250);
    return () => clearTimeout(id);
  }, [nome, aberto]);
  return (
    <View>
      <TextInput
        style={s.campo} value={nome} placeholder={t('pastor.pessoaEx')} placeholderTextColor={C.textDim}
        onChangeText={v => { setNome(v); setMemberId(null); setAberto(true); }} maxLength={120}
      />
      {aberto && achados.length > 0 && (
        <View style={[s.sugestoes, { borderColor: C.border, backgroundColor: C.surface }]}>
          {achados.slice(0, 6).map(p => (
            <TouchableOpacity key={p.id} style={s.sugestao} onPress={() => { setNome(p.nome); setMemberId(p.id); setAberto(false); setAchados([]); }}>
              <Ionicons name="person-circle-outline" size={18} color={COR} />
              <Text style={[s.texto, { flex: 1 }]} numberOfLines={1}>{p.nome}</Text>
              {!!p.telefone && <Text style={s.sub}>{p.telefone}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Compromisso ────────────────────────────────────────────────────────────
function CompromissoModal({ visivel, inicial, C, s, t, onFechar, onSalvo, onAnotar }: {
  visivel: boolean; inicial: Compromisso | null; C: ThemeColors; s: ReturnType<typeof estilos>; t: any;
  onFechar: () => void; onSalvo: () => void; onAnotar: (c: Compromisso) => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<TipoCompromisso>('reuniao');
  const [pessoa, setPessoa] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [horaFim, setHoraFim] = useState('');
  const [local, setLocal] = useState('');
  const [lembrete, setLembrete] = useState<number | null>(60);
  const [compartilhado, setCompartilhado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!visivel) return;
    setTitulo(inicial?.titulo ?? ''); setTipo(inicial?.tipo ?? 'reuniao');
    setPessoa(inicial?.pessoa ?? ''); setMemberId(inicial?.member_id ?? null);
    setData(inicial ? dataDe(inicial.inicio) : dataDe(new Date().toISOString()));
    setHora(inicial ? horaDe(inicial.inicio) : '');
    setHoraFim(inicial?.fim ? horaDe(inicial.fim) : '');
    setLocal(inicial?.local ?? ''); setLembrete(inicial ? inicial.lembrete_min : 60);
    setCompartilhado(!!inicial?.compartilhado);
  }, [visivel, inicial]);

  const salvar = async () => {
    if (!titulo.trim()) return Alert.alert(t('pastor.faltaTitulo'));
    const ini = paraISO(data, hora);
    if (!ini) return Alert.alert(t('pastor.dataHoraInvalida'));
    const fim = horaFim.trim() ? paraISO(data, horaFim) : null;
    if (horaFim.trim() && (!fim || fim < ini)) return Alert.alert(t('pastor.horaFimInvalida'));
    setSalvando(true);
    const r = await salvarCompromisso({
      id: inicial?.id, titulo, tipo, pessoa, member_id: memberId, inicio: ini, fim, local,
      lembrete_min: lembrete, compartilhado, status: inicial?.status ?? 'agendado',
    });
    setSalvando(false);
    if (r !== 'ok') return Alert.alert(t('common.erro'), r);
    onSalvo();
  };

  const mudarStatus = async (st: Compromisso['status']) => {
    if (!inicial) return;
    const r = await statusCompromisso(inicial.id, st);
    if (r !== 'ok') return Alert.alert(t('common.erro'), r);
    onSalvo();
  };
  const apagar = () => {
    if (!inicial) return;
    Alert.alert(t('pastor.apagarCompromisso'), inicial.titulo, [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('pastor.apagar'), style: 'destructive', onPress: async () => { const r = await apagarCompromisso(inicial.id); if (r === 'ok') onSalvo(); else Alert.alert(t('common.erro'), r); } },
    ]);
  };

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.fundoModal}>
        <View style={[s.folha, { backgroundColor: C.surface }]}>
          <View style={s.folhaTopo}>
            <Text style={s.folhaTitulo}>{inicial ? t('pastor.editarCompromisso') : t('pastor.novoCompromisso')}</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={10}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {inicial && (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                {inicial.status !== 'feito' && (
                  <TouchableOpacity style={[s.pilula, { backgroundColor: C.success }]} onPress={() => mudarStatus('feito')}>
                    <Ionicons name="checkmark" size={14} color="#fff" /><Text style={s.pilulaTexto}>{t('pastor.marcarFeito')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[s.pilula, { backgroundColor: COR }]} onPress={() => onAnotar(inicial)}>
                  <Ionicons name="create-outline" size={14} color="#fff" /><Text style={s.pilulaTexto}>{t('pastor.escreverAnotacao')}</Text>
                </TouchableOpacity>
                {inicial.status === 'agendado' && (
                  <TouchableOpacity style={[s.pilula, { backgroundColor: C.textMuted }]} onPress={() => mudarStatus('cancelado')}>
                    <Text style={s.pilulaTexto}>{t('pastor.cancelarCompromisso')}</Text>
                  </TouchableOpacity>
                )}
                {inicial.status !== 'agendado' && (
                  <TouchableOpacity style={[s.pilula, { backgroundColor: C.textMuted }]} onPress={() => mudarStatus('agendado')}>
                    <Text style={s.pilulaTexto}>{t('pastor.voltarAgendado')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <Text style={s.rotulo}>{t('pastor.tipo')}</Text>
            <View style={s.chips}>
              {TIPOS.map(tp => (
                <TouchableOpacity key={tp.id} onPress={() => setTipo(tp.id)}
                  style={[s.chip, { borderColor: tp.cor + '66', backgroundColor: tipo === tp.id ? tp.cor : tp.cor + '14' }]}>
                  <Text style={{ color: tipo === tp.id ? '#fff' : tp.cor, fontWeight: '700', fontSize: 12.5 }}>{tp.emoji} {t(`pastor.tipo_${tp.id}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.rotulo}>{t('pastor.titulo')}</Text>
            <TextInput style={s.campo} value={titulo} onChangeText={setTitulo} maxLength={120} placeholder={t('pastor.tituloEx')} placeholderTextColor={C.textDim} />
            <Text style={s.rotulo}>{t('pastor.pessoa')}</Text>
            <CampoPessoa nome={pessoa} setNome={setPessoa} setMemberId={setMemberId} C={C} s={s} t={t} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1.4 }}>
                <Text style={s.rotulo}>{t('pastor.data')}</Text>
                <TextInput style={s.campo} value={data} onChangeText={v => setData(mascaraData(v))} keyboardType="number-pad" placeholder="DD/MM/AAAA" placeholderTextColor={C.textDim} maxLength={10} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rotulo}>{t('pastor.hora')}</Text>
                <TextInput style={s.campo} value={hora} onChangeText={v => setHora(mascaraHora(v))} keyboardType="number-pad" placeholder="10:00" placeholderTextColor={C.textDim} maxLength={5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rotulo}>{t('pastor.ate')}</Text>
                <TextInput style={s.campo} value={horaFim} onChangeText={v => setHoraFim(mascaraHora(v))} keyboardType="number-pad" placeholder="11:00" placeholderTextColor={C.textDim} maxLength={5} />
              </View>
            </View>
            <Text style={s.rotulo}>{t('pastor.local')}</Text>
            <TextInput style={s.campo} value={local} onChangeText={setLocal} maxLength={200} placeholder={t('pastor.localEx')} placeholderTextColor={C.textDim} />
            <Text style={s.rotulo}>{t('pastor.lembrar')}</Text>
            <View style={s.chips}>
              {LEMBRETES_MIN.map(m => (
                <TouchableOpacity key={String(m)} onPress={() => setLembrete(m)} style={[s.chip, { borderColor: COR + '55', backgroundColor: lembrete === m ? COR : 'transparent' }]}>
                  <Text style={{ color: lembrete === m ? '#fff' : C.text, fontWeight: '600', fontSize: 12.5 }}>{t(`pastor.lembrete_${m ?? 'nao'}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.linhaSwitch}>
              <View style={{ flex: 1 }}>
                <Text style={s.textoForte}>{t('pastor.compartilhar')}</Text>
                <Text style={s.sub}>{t('pastor.compartilharSub')}</Text>
              </View>
              <Switch value={compartilhado} onValueChange={setCompartilhado} trackColor={{ true: COR }} />
            </View>
            <TouchableOpacity style={[s.botao, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
              {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>{t('pastor.salvar')}</Text>}
            </TouchableOpacity>
            {inicial && (
              <TouchableOpacity onPress={apagar} style={{ alignSelf: 'center', padding: 12 }}>
                <Text style={{ color: C.danger, fontWeight: '700' }}>{t('pastor.apagar')}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Anotação ───────────────────────────────────────────────────────────────
function NotaModal({ visivel, inicial, deCompromisso, C, s, t, onFechar, onSalvo }: {
  visivel: boolean; inicial: Nota | null; deCompromisso: Compromisso | null; C: ThemeColors; s: ReturnType<typeof estilos>; t: any;
  onFechar: () => void; onSalvo: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [pessoa, setPessoa] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [proximo, setProximo] = useState('');
  const [compartilhado, setCompartilhado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!visivel) return;
    setTitulo(inicial?.titulo ?? (deCompromisso ? `${deCompromisso.titulo} · ${dataDe(deCompromisso.inicio)}` : ''));
    setPessoa(inicial?.pessoa ?? deCompromisso?.pessoa ?? '');
    setMemberId(inicial?.member_id ?? deCompromisso?.member_id ?? null);
    setTexto(inicial?.texto ?? ''); setProximo(inicial?.proximo_passo ?? '');
    setCompartilhado(inicial?.compartilhado ?? deCompromisso?.compartilhado ?? false);
  }, [visivel, inicial, deCompromisso]);
  const salvar = async () => {
    if (!titulo.trim()) return Alert.alert(t('pastor.faltaTitulo'));
    setSalvando(true);
    const r = await salvarNota({
      id: inicial?.id, titulo, pessoa, member_id: memberId, texto, proximo_passo: proximo, compartilhado,
      compromisso_id: inicial?.compromisso_id ?? deCompromisso?.id ?? null,
    });
    setSalvando(false);
    if (r !== 'ok') return Alert.alert(t('common.erro'), r);
    onSalvo();
  };
  const apagar = () => {
    if (!inicial) return;
    Alert.alert(t('pastor.apagarNota'), inicial.titulo, [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('pastor.apagar'), style: 'destructive', onPress: async () => { const r = await apagarNota(inicial.id); if (r === 'ok') onSalvo(); else Alert.alert(t('common.erro'), r); } },
    ]);
  };
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.fundoModal}>
        <View style={[s.folha, { backgroundColor: C.surface, maxHeight: '94%' }]}>
          <View style={s.folhaTopo}>
            <Text style={s.folhaTitulo}>{inicial ? t('pastor.editarNota') : t('pastor.novaNota')}</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={10}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={s.rotulo}>{t('pastor.titulo')}</Text>
            <TextInput style={s.campo} value={titulo} onChangeText={setTitulo} maxLength={120} placeholderTextColor={C.textDim} />
            <Text style={s.rotulo}>{t('pastor.pessoa')}</Text>
            <CampoPessoa nome={pessoa} setNome={setPessoa} setMemberId={setMemberId} C={C} s={s} t={t} />
            <Text style={s.rotulo}>{t('pastor.oQueFoiFalado')}</Text>
            <TextInput style={[s.campo, { minHeight: 160, textAlignVertical: 'top' }]} value={texto} onChangeText={setTexto} multiline maxLength={20000} placeholderTextColor={C.textDim} />
            <Text style={s.rotulo}>{t('pastor.proximoPasso')}</Text>
            <TextInput style={[s.campo, { minHeight: 60, textAlignVertical: 'top' }]} value={proximo} onChangeText={setProximo} multiline maxLength={1000} placeholder={t('pastor.proximoPassoEx')} placeholderTextColor={C.textDim} />
            <View style={s.linhaSwitch}>
              <View style={{ flex: 1 }}>
                <Text style={s.textoForte}>{t('pastor.compartilhar')}</Text>
                <Text style={s.sub}>{t('pastor.compartilharSub')}</Text>
              </View>
              <Switch value={compartilhado} onValueChange={setCompartilhado} trackColor={{ true: COR }} />
            </View>
            <TouchableOpacity style={[s.botao, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
              {salvando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTexto}>{t('pastor.salvar')}</Text>}
            </TouchableOpacity>
            {inicial && (
              <TouchableOpacity onPress={apagar} style={{ alignSelf: 'center', padding: 12 }}>
                <Text style={{ color: C.danger, fontWeight: '700' }}>{t('pastor.apagar')}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Lembrete ───────────────────────────────────────────────────────────────
function LembreteModal({ visivel, inicial, C, s, t, onFechar, onSalvo }: {
  visivel: boolean; inicial: Lembrete | null; C: ThemeColors; s: ReturnType<typeof estilos>; t: any;
  onFechar: () => void; onSalvo: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  useEffect(() => {
    if (!visivel) return;
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1); amanha.setHours(9, 0, 0, 0);
    setTexto(inicial?.texto ?? '');
    setData(dataDe(inicial?.quando ?? amanha.toISOString()));
    setHora(horaDe(inicial?.quando ?? amanha.toISOString()));
  }, [visivel, inicial]);
  const salvar = async () => {
    if (!texto.trim()) return Alert.alert(t('pastor.faltaTexto'));
    const q = paraISO(data, hora);
    if (!q) return Alert.alert(t('pastor.dataHoraInvalida'));
    const r = await salvarLembrete({ id: inicial?.id, texto, quando: q });
    if (r !== 'ok') return Alert.alert(t('common.erro'), r);
    onSalvo();
  };
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.fundoModal}>
        <View style={[s.folha, { backgroundColor: C.surface }]}>
          <View style={s.folhaTopo}>
            <Text style={s.folhaTitulo}>{inicial ? t('pastor.editarLembrete') : t('pastor.novoLembrete')}</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={10}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
          </View>
          <Text style={s.rotulo}>{t('pastor.lembrarDe')}</Text>
          <TextInput style={[s.campo, { minHeight: 60, textAlignVertical: 'top' }]} value={texto} onChangeText={setTexto} multiline maxLength={300} placeholder={t('pastor.lembrarDeEx')} placeholderTextColor={C.textDim} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1.4 }}>
              <Text style={s.rotulo}>{t('pastor.data')}</Text>
              <TextInput style={s.campo} value={data} onChangeText={v => setData(mascaraData(v))} keyboardType="number-pad" maxLength={10} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rotulo}>{t('pastor.hora')}</Text>
              <TextInput style={s.campo} value={hora} onChangeText={v => setHora(mascaraHora(v))} keyboardType="number-pad" maxLength={5} />
            </View>
          </View>
          <TouchableOpacity style={s.botao} onPress={salvar}><Text style={s.botaoTexto}>{t('pastor.salvar')}</Text></TouchableOpacity>
          {inicial && (
            <TouchableOpacity style={{ alignSelf: 'center', padding: 12 }} onPress={async () => { await apagarLembrete(inicial.id); onSalvo(); }}>
              <Text style={{ color: C.danger, fontWeight: '700' }}>{t('pastor.apagar')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Quem é pastor (admin) ──────────────────────────────────────────────────
function PastoresAdmin({ C, s, t, onMudou }: { C: ThemeColors; s: ReturnType<typeof estilos>; t: any; onMudou: () => void }) {
  const [lista, setLista] = useState<{ user_id: string; nome: string }[]>([]);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<{ id: string; full_name: string }[]>([]);
  const carregar = useCallback(() => { listaPastores().then(setLista); }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (busca.trim().length < 2) { setAchados([]); return; }
    const id = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id, full_name').neq('role', 'visitante')
        .ilike('full_name', `%${busca.trim()}%`).order('full_name').limit(10);
      setAchados((data ?? []) as any);
    }, 250);
    return () => clearTimeout(id);
  }, [busca]);
  return (
    <View style={[s.cartao, { marginTop: 16 }]}>
      <Text style={s.textoForte}>🔐 {t('pastor.quemAcessa')}</Text>
      <Text style={[s.sub, { marginBottom: 8 }]}>{t('pastor.quemAcessaSub')}</Text>
      {lista.map(p => (
        <View key={p.user_id} style={s.linhaPessoa}>
          <Text style={[s.texto, { flex: 1 }]}>{p.nome}</Text>
          <TouchableOpacity hitSlop={8} onPress={() => Alert.alert(t('pastor.removerPastor'), p.nome, [
            { text: t('common.cancelar'), style: 'cancel' },
            { text: t('pastor.remover'), style: 'destructive', onPress: async () => { await removerPastor(p.user_id); carregar(); onMudou(); } },
          ])}>
            <Ionicons name="close-circle-outline" size={20} color={C.danger} />
          </TouchableOpacity>
        </View>
      ))}
      <TextInput style={[s.campo, { marginTop: 8 }]} value={busca} onChangeText={setBusca} placeholder={t('pastor.adicionarPastor')} placeholderTextColor={C.textDim} />
      {achados.map(a => (
        <TouchableOpacity key={a.id} style={s.linhaPessoa} onPress={async () => {
          const r = await adicionarPastor(a.id);
          if (r !== 'ok') Alert.alert(t('common.erro'), r);
          setBusca(''); carregar(); onMudou();
        }}>
          <Text style={[s.texto, { flex: 1 }]}>{a.full_name}</Text>
          <Ionicons name="add-circle-outline" size={20} color={COR} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Tela ───────────────────────────────────────────────────────────────────
export default function PastorScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const s = useMemo(() => estilos(C), [C]);
  const { ehAdmin } = useAcesso();

  const [pastor, setPastor] = useState<boolean | null>(null);
  const [destrancado, setDestrancado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>((route.params?.aba as Aba) ?? 'agenda');
  const [compromissos, setCompromissos] = useState<Compromisso[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [atualizando, setAtualizando] = useState(false);
  const [passados, setPassados] = useState(false);
  const [busca, setBusca] = useState('');
  const [compModal, setCompModal] = useState<{ c: Compromisso | null } | null>(null);
  const [notaModal, setNotaModal] = useState<{ n: Nota | null; de: Compromisso | null } | null>(null);
  const [lembModal, setLembModal] = useState<{ l: Lembrete | null } | null>(null);
  const [meuId, setMeuId] = useState<string | null>(null);
  const [gerir, setGerir] = useState(false);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMeuId(data.user?.id ?? null)); }, []);
  const verificar = useCallback(() => { souPastor().then(setPastor); }, []);
  useEffect(() => { verificar(); }, [verificar]);

  // Face ID ao abrir; tranca de novo quando o app vai para o fundo.
  const tentando = useRef(false);
  const destrancar = useCallback(async () => {
    if (tentando.current) return;
    tentando.current = true;
    const r = await pedirBiometria(t('pastor.faceIdMensagem'), t('common.cancelar'));
    tentando.current = false;
    if (r === 'ok') { setDestrancado(true); setAviso(null); }
    else if (r === 'sem_modulo') { setDestrancado(true); setAviso(t('pastor.semFaceIdApp')); }
    else if (r === 'sem_cadastro') { setDestrancado(true); setAviso(t('pastor.semFaceIdCelular')); }
  }, [t]);
  useEffect(() => { if (pastor) destrancar(); }, [pastor, destrancar]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => { if (e === 'background') setDestrancado(false); });
    return () => sub.remove();
  }, []);

  const carregar = useCallback(async (puxou = false) => {
    if (puxou) setAtualizando(true);
    const r = await carregarTudo();
    setCompromissos(r.compromissos); setNotas(r.notas); setLembretes(r.lembretes);
    setAtualizando(false);
  }, []);
  useFocusEffect(useCallback(() => { if (pastor && destrancado) carregar(); }, [pastor, destrancado, carregar]));
  useEffect(() => { if (route.params?.aba) setAba(route.params.aba); }, [route.params?.aba]);

  const topo = (
    <View style={[s.header, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}><Ionicons name="chevron-down" size={22} color="#fff" /></TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitulo}>{t('pastor.tituloTela')}</Text>
        <Text style={s.headerSub}>{t('pastor.sub')}</Text>
      </View>
      {destrancado && ehAdmin && (
        <TouchableOpacity onPress={() => setGerir(true)} style={s.headerBtn}><Ionicons name="people-outline" size={18} color="#fff" /></TouchableOpacity>
      )}
      {destrancado && (
        <TouchableOpacity onPress={() => setDestrancado(false)} style={s.headerBtn}><Ionicons name="lock-closed-outline" size={18} color="#fff" /></TouchableOpacity>
      )}
    </View>
  );

  if (pastor === null) return <View style={s.tela}>{topo}<ActivityIndicator color={COR} style={{ marginTop: 40 }} /></View>;

  if (!pastor) {
    return (
      <View style={s.tela}>
        {topo}
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={s.cartao}>
            <Text style={{ fontSize: 34, textAlign: 'center' }}>🔐</Text>
            <Text style={[s.textoForte, { textAlign: 'center', marginTop: 6 }]}>{t('pastor.soPastores')}</Text>
            <Text style={[s.sub, { textAlign: 'center', marginTop: 4 }]}>{ehAdmin ? t('pastor.adminNaoPastor') : t('pastor.semAcesso')}</Text>
          </View>
          {ehAdmin && <PastoresAdmin C={C} s={s} t={t} onMudou={verificar} />}
        </ScrollView>
      </View>
    );
  }

  if (!destrancado) {
    return (
      <View style={s.tela}>
        {topo}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="scan-outline" size={64} color={COR} />
          <Text style={[s.textoForte, { marginTop: 12, textAlign: 'center' }]}>{t('pastor.trancada')}</Text>
          <TouchableOpacity style={[s.botao, { paddingHorizontal: 28 }]} onPress={destrancar}>
            <Text style={s.botaoTexto}>{t('pastor.desbloquear')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Listas ──
  const agora = Date.now();
  const visiveisComp = compromissos
    .filter(c => (passados ? new Date(c.inicio).getTime() < agora - 3600e3 : new Date(c.inicio).getTime() >= agora - 3600e3))
    .sort((a, b) => (passados ? b.inicio.localeCompare(a.inicio) : a.inicio.localeCompare(b.inicio)));
  const porDia: { dia: string; itens: Compromisso[] }[] = [];
  for (const c of visiveisComp) {
    const k = chaveDia(c.inicio);
    const g = porDia.find(x => x.dia === k);
    if (g) g.itens.push(c); else porDia.push({ dia: k, itens: [c] });
  }
  const hojeK = chaveDia(new Date().toISOString());
  const amanhaK = chaveDia(new Date(agora + 864e5).toISOString());
  const rotuloDia = (k: string) => (k === hojeK ? t('pastor.hoje') : k === amanhaK ? t('pastor.amanha') : `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`);

  const q = busca.trim().toLowerCase();
  const notasVisiveis = q ? notas.filter(n => `${n.titulo} ${n.pessoa ?? ''} ${n.texto}`.toLowerCase().includes(q)) : notas;
  const pendentes = lembretes.filter(l => !l.feito);
  const feitos = lembretes.filter(l => l.feito).slice(-20).reverse();

  const abas: { k: Aba; rot: string; n?: number }[] = [
    { k: 'agenda', rot: t('pastor.abaAgenda'), n: compromissos.filter(c => c.status === 'agendado' && new Date(c.inicio).getTime() >= agora).length },
    { k: 'notas', rot: t('pastor.abaNotas') },
    { k: 'lembretes', rot: t('pastor.abaLembretes'), n: pendentes.length },
  ];

  const novo = () => (aba === 'agenda' ? setCompModal({ c: null }) : aba === 'notas' ? setNotaModal({ n: null, de: null }) : setLembModal({ l: null }));

  return (
    <View style={s.tela}>
      {topo}
      <View style={s.abas}>
        {abas.map(a => (
          <TouchableOpacity key={a.k} style={[s.aba, aba === a.k && s.abaAtiva]} onPress={() => setAba(a.k)}>
            <Text style={[s.abaTexto, aba === a.k && s.abaTextoAtivo]}>{a.rot}{a.n ? ` · ${a.n}` : ''}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!aviso && <Text style={[s.sub, { backgroundColor: '#F5C84233', padding: 10, textAlign: 'center' }]}>{aviso}</Text>}

      {aba === 'agenda' && (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => carregar(true)} tintColor={COR} />}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            {[false, true].map(p => (
              <TouchableOpacity key={String(p)} onPress={() => setPassados(p)} style={[s.chip, { borderColor: COR + '55', backgroundColor: passados === p ? COR : 'transparent' }]}>
                <Text style={{ color: passados === p ? '#fff' : C.text, fontWeight: '700', fontSize: 12.5 }}>{p ? t('pastor.anteriores') : t('pastor.proximos')}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {porDia.length === 0 && <Text style={[s.sub, { textAlign: 'center', marginTop: 30 }]}>{t('pastor.agendaVazia')}</Text>}
          {porDia.map(g => (
            <View key={g.dia} style={{ marginBottom: 8 }}>
              <Text style={s.dia}>{rotuloDia(g.dia)}</Text>
              {g.itens.map(c => {
                const tp = tipoDe(c.tipo);
                return (
                  <TouchableOpacity key={c.id} style={[s.cartao, { flexDirection: 'row', gap: 12, opacity: c.status === 'cancelado' ? 0.5 : 1 }]} onPress={() => setCompModal({ c })}>
                    <View style={[s.bolha, { backgroundColor: tp.cor + '22' }]}><Text style={{ fontSize: 20 }}>{tp.emoji}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.textoForte, c.status === 'cancelado' && { textDecorationLine: 'line-through' }]} numberOfLines={2}>{c.titulo}</Text>
                      <Text style={s.sub}>{horaDe(c.inicio)}{c.fim ? `–${horaDe(c.fim)}` : ''}{c.pessoa ? ` · ${c.pessoa}` : ''}</Text>
                      {!!c.local && <Text style={s.sub} numberOfLines={1}>📍 {c.local}</Text>}
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        {c.status === 'feito' && <Text style={[s.selo, { backgroundColor: C.success + '22', color: C.success }]}>✓ {t('pastor.feito')}</Text>}
                        {c.status === 'cancelado' && <Text style={[s.selo, { backgroundColor: C.textMuted + '22', color: C.textMuted }]}>{t('pastor.cancelado')}</Text>}
                        {c.compartilhado && <Text style={[s.selo, { backgroundColor: COR + '18', color: COR }]}>👥 {t('pastor.compartilhadoCurto')}</Text>}
                        {c.dono !== meuId && <Text style={[s.selo, { backgroundColor: COR + '18', color: COR }]}>{t('pastor.deOutroPastor')}</Text>}
                        {!!notas.find(n => n.compromisso_id === c.id) && <Text style={[s.selo, { backgroundColor: '#F5C84233', color: '#7A6010' }]}>📝 {t('pastor.temAnotacao')}</Text>}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {aba === 'notas' && (
        <FlatList
          data={notasVisiveis}
          keyExtractor={n => n.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => carregar(true)} tintColor={COR} />}
          ListHeaderComponent={<TextInput style={[s.campo, { marginBottom: 10 }]} value={busca} onChangeText={setBusca} placeholder={t('pastor.buscarNotas')} placeholderTextColor={C.textDim} />}
          ListEmptyComponent={<Text style={[s.sub, { textAlign: 'center', marginTop: 30 }]}>{t('pastor.notasVazio')}</Text>}
          renderItem={({ item: n }) => (
            <TouchableOpacity style={s.cartao} onPress={() => setNotaModal({ n, de: null })}>
              <Text style={s.textoForte} numberOfLines={1}>{n.titulo}</Text>
              <Text style={s.sub}>{dataDe(n.created_at)}{n.pessoa ? ` · ${n.pessoa}` : ''}{n.compartilhado ? ' · 👥' : ''}</Text>
              {!!n.texto && <Text style={[s.texto, { marginTop: 4 }]} numberOfLines={3}>{n.texto}</Text>}
              {!!n.proximo_passo && <Text style={[s.sub, { marginTop: 4, color: COR }]} numberOfLines={2}>➜ {n.proximo_passo}</Text>}
            </TouchableOpacity>
          )}
        />
      )}

      {aba === 'lembretes' && (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => carregar(true)} tintColor={COR} />}>
          {pendentes.length === 0 && <Text style={[s.sub, { textAlign: 'center', marginTop: 30 }]}>{t('pastor.lembretesVazio')}</Text>}
          {[...pendentes, ...feitos].map(l => {
            const atrasado = !l.feito && new Date(l.quando).getTime() < agora;
            return (
              <View key={l.id} style={[s.cartao, { flexDirection: 'row', alignItems: 'center', gap: 10, opacity: l.feito ? 0.55 : 1 }]}>
                <TouchableOpacity hitSlop={8} onPress={async () => { await marcarLembrete(l.id, !l.feito); carregar(); }}>
                  <Ionicons name={l.feito ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={l.feito ? C.success : COR} />
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setLembModal({ l })}>
                  <Text style={[s.texto, l.feito && { textDecorationLine: 'line-through' }]}>{l.texto}</Text>
                  <Text style={[s.sub, atrasado && { color: C.danger }]}>🔔 {dataDe(l.quando)} {horaDe(l.quando)}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={gerir} transparent animationType="slide" onRequestClose={() => setGerir(false)}>
        <View style={s.fundoModal}>
          <View style={[s.folha, { backgroundColor: C.bg }]}>
            <View style={s.folhaTopo}>
              <Text style={s.folhaTitulo}>{t('pastor.quemAcessa')}</Text>
              <TouchableOpacity onPress={() => setGerir(false)} hitSlop={10}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled"><PastoresAdmin C={C} s={s} t={t} onMudou={verificar} /></ScrollView>
          </View>
        </View>
      </Modal>

      <TouchableOpacity style={[s.fab, { bottom: insets.bottom + 18 }]} onPress={novo} activeOpacity={0.85}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={s.fabTexto}>{aba === 'agenda' ? t('pastor.novoCompromissoCurto') : aba === 'notas' ? t('pastor.novaNotaCurto') : t('pastor.novoLembreteCurto')}</Text>
      </TouchableOpacity>

      <CompromissoModal
        visivel={!!compModal} inicial={compModal?.c ?? null} C={C} s={s} t={t}
        onFechar={() => setCompModal(null)} onSalvo={() => { setCompModal(null); carregar(); }}
        onAnotar={c => { setCompModal(null); setNotaModal({ n: notas.find(n => n.compromisso_id === c.id) ?? null, de: c }); }}
      />
      <NotaModal
        visivel={!!notaModal} inicial={notaModal?.n ?? null} deCompromisso={notaModal?.de ?? null} C={C} s={s} t={t}
        onFechar={() => setNotaModal(null)} onSalvo={() => { setNotaModal(null); carregar(); }}
      />
      <LembreteModal
        visivel={!!lembModal} inicial={lembModal?.l ?? null} C={C} s={s} t={t}
        onFechar={() => setLembModal(null)} onSalvo={() => { setLembModal(null); carregar(); }}
      />
    </View>
  );
}

function estilos(C: ThemeColors) {
  return StyleSheet.create({
    tela: { flex: 1, backgroundColor: C.bg },
    header: { backgroundColor: COR, paddingHorizontal: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12.5, marginTop: 3 },
    headerTitulo: { color: '#fff', fontSize: 19, fontWeight: '800' },
    abas: { flexDirection: 'row', backgroundColor: COR, paddingHorizontal: 14, paddingBottom: 12, gap: 6 },
    aba: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
    abaAtiva: { backgroundColor: '#F5C842' },
    abaTexto: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', fontSize: 13 },
    abaTextoAtivo: { color: '#1A1740', fontWeight: '800' },
    cartao: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 },
    bolha: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    dia: { fontSize: 13, fontWeight: '800', color: COR, marginBottom: 6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    selo: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
    texto: { fontSize: 14, color: C.text },
    textoForte: { fontSize: 15, fontWeight: '700', color: C.text },
    sub: { fontSize: 12.5, color: C.textMuted, marginTop: 2 },
    rotulo: { fontSize: 12, fontWeight: '700', color: C.textMuted, marginTop: 10, marginBottom: 4 },
    campo: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text, backgroundColor: C.bg },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
    pilula: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
    pilulaTexto: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
    linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
    linhaPessoa: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    sugestoes: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden' },
    sugestao: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
    botao: { backgroundColor: COR, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
    botaoTexto: { color: '#fff', fontWeight: '800', fontSize: 15 },
    fundoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    folha: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 30, maxHeight: '92%' },
    folhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    folhaTitulo: { fontSize: 18, fontWeight: '800', color: C.text },
    fab: {
      position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COR,
      paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, elevation: 5,
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    },
    fabTexto: { color: '#fff', fontWeight: '800', fontSize: 14 },
  });
}
