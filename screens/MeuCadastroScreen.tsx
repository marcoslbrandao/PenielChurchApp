import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, StatusBar, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { useTheme } from '../lib/theme';
import FilhosCard, { FilhosCardRef } from '../components/FilhosCard';

// A chave fica embutida no bundle do app (padrão pra chaves de Google Maps/
// Places — por isso restringimos ela só a essas 2 APIs no Google Cloud).
// Precisa existir como EAS secret com esse nome exato (prefixo EXPO_PUBLIC_
// é o que faz o Expo embutir o valor no build/update).
const GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY as string | undefined;

const PAISES = ['Reino Unido', 'Brasil', 'Portugal', 'Outro'];
// Mesma lista do Admin (`MINISTERIOS` em MembrosScreen) — se uma mudar sem a
// outra, os dois formulários passam a gravar valores diferentes na mesma coluna.
const MINISTERIOS = ['Louvor', 'Infantil', 'Jovens', 'Intercessão', 'Mídia', 'Recepção', 'Outro'];
const ESTADO_CIVIL_OPCOES = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável'];
// Mesmos valores gravados pelo Admin (`SEXO_OPCOES` em MembrosScreen): o banco
// guarda o slug, a tela mostra o rótulo.
const SEXO_OPCOES: { valor: string; label: string }[] = [
  { valor: 'masculino', label: 'Masculino' },
  { valor: 'feminino', label: 'Feminino' },
  { valor: 'prefiro_nao_informar', label: 'Prefiro não informar' },
];

function paleta(isDark: boolean) {
  return isDark ? {
    primary: '#100D28', primaryLight: '#3B2E7A',
    accent: '#F5C842', accentLight: '#FFD873',
    bg: '#0E0B22', surface: '#1C1940', surfaceAlt: '#241F4D',
    text: '#F1EFFA', textMuted: '#A6A0C7', textDim: '#726A99',
    border: '#332D5C', danger: '#FF6B6B', success: '#4ADE80',
  } : {
    primary: '#1A1740', primaryLight: '#2D2870',
    accent: '#C8960A', accentLight: '#F5C842',
    bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
    text: '#1A1A2E', textMuted: '#6B7280', textDim: '#9CA3AF',
    border: '#E5E0D8', danger: '#C0392B', success: '#27AE60',
  };
}
type Paleta = ReturnType<typeof paleta>;
type Estilos = ReturnType<typeof buildStyles>;

type FormState = {
  nome: string; sobrenome: string;
  data_nascimento: string; sexo: string; estado_civil: string; nacionalidade: string; cidade: string;
  profissao: string; talentos_hobbies: string;
  email: string; telefone: string; instagram: string;
  pais: string; cep: string; endereco: string; complemento: string; estado: string;
  igreja_anterior: boolean; igreja_anterior_nome: string;
  batizado: boolean; data_batismo: string; deseja_batizar: boolean;
  membro_desde: string;
  ministerio_anterior: boolean; ministerio_anterior_qual: string;
  ministerio: string;
  deseja_servir: boolean; deseja_servir_area: string;
  compartilhar_mais: string;
  mostrar_aniversario: boolean;
};

const EMPTY: FormState = {
  nome: '', sobrenome: '',
  data_nascimento: '', sexo: '', estado_civil: '', nacionalidade: '', cidade: '',
  profissao: '', talentos_hobbies: '',
  email: '', telefone: '', instagram: '',
  pais: 'Reino Unido', cep: '', endereco: '', complemento: '', estado: '',
  igreja_anterior: false, igreja_anterior_nome: '',
  batizado: false, data_batismo: '', deseja_batizar: false,
  membro_desde: '',
  ministerio_anterior: false, ministerio_anterior_qual: '',
  ministerio: '',
  deseja_servir: false, deseja_servir_area: '',
  compartilhar_mais: '',
  // Padrão ligado: aparecer na lista de aniversariantes da igreja é o
  // comportamento esperado por quase todo mundo. Quem não quiser desliga.
  mostrar_aniversario: true,
};

// Só as colunas que ESTE formulário edita. Antes era `select('*')`, que
// trazia junto `observacoes` e `status` — as notas internas da liderança
// sobre a pessoa (aconselhamento, disciplina, situação familiar) e a
// situação dela na igreja. O gatilho `members_protege_campos_da_lideranca`
// (migração 20260909010000) já impedia o membro de SOBRESCREVER esses
// campos, mas nada impedia de LÊ-LOS: vinham na resposta e ficavam no
// aparelho. Montar a lista a partir do próprio formulário evita a armadilha
// de manter duas listas: campo novo no formulário entra sozinho, e coluna
// que não é do formulário não entra nunca.
const COLUNAS_DO_FORMULARIO = ['id', ...Object.keys(EMPTY)].join(', ');

function formatDateBR(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function parseDateISO(br: string): string {
  if (!br) return '';
  const [d, m, y] = br.split('/');
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m}-${d}`;
}
function formatMesAnoFromISO(iso: string): string {
  if (!iso) return '';
  const [y, m] = iso.split('-');
  if (!y || !m) return '';
  return `${m}/${y}`;
}
function parseMesAnoToISO(mmAAAA: string): string {
  const [m, y] = mmAAAA.split('/');
  if (!m || !y || y.length !== 4) return '';
  return `${y}-${m}-01`;
}

type Sugestao = { placeId: string; texto: string };

async function buscarSugestoesEndereco(cep: string): Promise<Sugestao[]> {
  if (!GOOGLE_PLACES_KEY || cep.trim().length < 5) return [];
  try {
    const resp = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_PLACES_KEY },
      body: JSON.stringify({ input: cep.trim(), includedRegionCodes: ['gb'] }),
    });
    const data = await resp.json();
    return ((data.suggestions ?? []) as any[])
      .map(s => s.placePrediction)
      .filter(Boolean)
      .map(p => ({ placeId: p.placeId as string, texto: (p.text?.text ?? '') as string }));
  } catch {
    return [];
  }
}

async function buscarDetalhesEndereco(placeId: string) {
  if (!GOOGLE_PLACES_KEY) return null;
  try {
    const resp = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_KEY, 'X-Goog-FieldMask': 'addressComponents' },
    });
    const data = await resp.json();
    const comps = (data.addressComponents ?? []) as any[];
    const parte = (tipo: string) => comps.find(c => (c.types ?? []).includes(tipo))?.longText ?? '';
    const numero = parte('street_number');
    const rua = parte('route');
    return {
      endereco: [numero, rua].filter(Boolean).join(' '),
      cidade: parte('postal_town') || parte('locality'),
      estado: parte('administrative_area_level_2'),
      cep: parte('postal_code'),
    };
  } catch {
    return null;
  }
}

// ---- Subcomponentes de campo, movidos pra fora do componente de tela ----
// IMPORTANTE: esses componentes precisam existir no escopo do módulo (não
// declarados dentro de MeuCadastroScreen). Uma função/componente declarada
// dentro do corpo de outro componente ganha uma identidade NOVA a cada
// renderização — e como o React usa a identidade do componente pra decidir
// se reaproveita ou remonta a instância, cada tecla digitada (que dispara
// setForm -> novo render -> nova "versão" do componente Field) fazia o
// React desmontar o TextInput antigo e montar um novo, derrubando o foco e
// fechando o teclado. Com os componentes fixos aqui fora, a identidade não
// muda entre renders e o TextInput mantém o foco normalmente.

function Field({ label, value, onChangeText, placeholder = '', keyboardType = 'default', maxLength, autoCapitalize = 'sentences', error, C, s }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; maxLength?: number; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  error?: boolean; C: Paleta; s: Estilos;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={[s.fieldLabel, error && s.fieldLabelError]}>{label}</Text>
      <TextInput
        style={[s.fieldInput, error && s.fieldInputError]} value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={C.textDim}
        keyboardType={keyboardType} maxLength={maxLength} autoCapitalize={autoCapitalize}
      />
      {error && <Text style={s.fieldErrorText}>Este campo é obrigatório.</Text>}
    </View>
  );
}

function CampoMultilinha({ label, value, onChangeText, placeholder, C, s }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string;
  C: Paleta; s: Estilos;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.fieldInput, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
        value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={C.textDim}
        multiline
      />
    </View>
  );
}

function SelectPill({ label, options, value, onChange, error, s }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
  error?: boolean; s: Estilos;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={[s.fieldLabel, error && s.fieldLabelError]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {options.map(opt => (
            <TouchableOpacity key={opt} style={[s.pill, value === opt && s.pillActive, error && s.pillError]} onPress={() => onChange(opt)}>
              <Text style={[s.pillText, value === opt && s.pillTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      {error && <Text style={s.fieldErrorText}>Este campo é obrigatório.</Text>}
    </View>
  );
}

function ToggleRow({ label, value, onToggle, icon, simTexto, naoTexto, C, s }: {
  label: string; value: boolean; onToggle: () => void; icon: string;
  simTexto: string; naoTexto: string; C: Paleta; s: Estilos;
}) {
  return (
    <View style={s.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.fieldLabel}>{label}</Text>
        <Text style={[s.toggleStatus, { color: value ? C.success : C.textMuted }]}>
          {value ? simTexto : naoTexto}
        </Text>
      </View>
      <TouchableOpacity style={[s.toggleBtn, value && s.toggleBtnActive]} onPress={onToggle}>
        <Ionicons name={icon as any} size={20} color={value ? '#fff' : C.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

function SectionTitle({ children, s }: { children: React.ReactNode; s: Estilos }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

export default function MeuCadastroScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [enderecoConfirmado, setEnderecoConfirmado] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const cepDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Os filhos são gravados por este ref, dentro do mesmo Salvar. Ver o
  // comentário de cabeçalho do FilhosCard: dois botões "Salvar" na mesma
  // tela fizeram o cadastro de uma criança ser descartado em silêncio.
  const filhosRef = useRef<FilhosCardRef>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('members').select(COLUNAS_DO_FORMULARIO).eq('profile_id', user.id).maybeSingle();
      if (data) {
        // `id` fica de fora do formulário: ele identifica a linha, não é um
        // campo editável, e mandá-lo de volta no insert criaria uma linha com
        // id escolhido pelo cliente.
        const { id: linhaId, ...campos } = data as unknown as Record<string, unknown>;
        setExistingId(linhaId as string);
        setForm({
          ...EMPTY,
          ...(campos as Partial<FormState>),
          data_nascimento: formatDateBR((campos.data_nascimento as string) ?? ''),
          data_batismo: formatDateBR((campos.data_batismo as string) ?? ''),
          membro_desde: formatMesAnoFromISO((campos.membro_desde as string) ?? ''),
        });
        if (campos.endereco) setEnderecoConfirmado(true);
      } else {
        const nomeCompleto = (user.user_metadata?.full_name ?? '').trim();
        const [primeiro, ...resto] = nomeCompleto.split(' ');
        setForm(prev => ({ ...prev, nome: primeiro ?? '', sobrenome: resto.join(' '), email: user.email ?? '' }));
      }
      setLoading(false);
    })();
  }, [user]);

  const set = (field: keyof FormState) => (val: any) => {
    setForm(prev => ({ ...prev, [field]: val }));
    setErrors(prev => (prev[field] ? { ...prev, [field]: false } : prev));
  };

  const formatDate = (text: string, field: 'data_nascimento' | 'data_batismo') => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let f = digits;
    if (digits.length > 2) f = digits.slice(0, 2) + '/' + digits.slice(2);
    if (digits.length > 4) f = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    set(field)(f);
  };
  const formatMesAno = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    let f = digits;
    if (digits.length > 2) f = digits.slice(0, 2) + '/' + digits.slice(2);
    set('membro_desde')(f);
  };
  const formatPhone = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 13);
    set('telefone')(digits.length ? '+' + digits : '');
  };

  // Busca sugestões de endereço enquanto digita o CEP (só faz sentido pro
  // Reino Unido — é o único país com essa integração por enquanto).
  const onChangeCep = (texto: string) => {
    set('cep')(texto);
    setEnderecoConfirmado(false);
    if (cepDebounce.current) clearTimeout(cepDebounce.current);
    if (form.pais !== 'Reino Unido' || texto.trim().length < 5) { setSugestoes([]); return; }
    setBuscandoCep(true);
    cepDebounce.current = setTimeout(async () => {
      const r = await buscarSugestoesEndereco(texto);
      setSugestoes(r);
      setBuscandoCep(false);
    }, 500);
  };

  const selecionarSugestao = async (sug: Sugestao) => {
    setBuscandoCep(true);
    const detalhes = await buscarDetalhesEndereco(sug.placeId);
    setBuscandoCep(false);
    setSugestoes([]);
    if (detalhes) {
      setForm(prev => ({
        ...prev,
        endereco: detalhes.endereco || prev.endereco,
        cidade: detalhes.cidade || prev.cidade,
        estado: detalhes.estado || prev.estado,
        cep: detalhes.cep || prev.cep,
      }));
    }
    setEnderecoConfirmado(true);
  };

  // Campos obrigatórios: todos os dados pessoais, e-mail e celular (contato),
  // e o endereço. Verificados na ordem em que aparecem no formulário, pra que
  // a primeira mensagem de erro corresponda ao primeiro campo vazio na tela.
  const CAMPOS_OBRIGATORIOS: { field: keyof FormState; label: string }[] = [
    { field: 'nome', label: 'Nome' },
    { field: 'sobrenome', label: 'Sobrenome' },
    { field: 'data_nascimento', label: t('cadastroMembro.dataNascimento') },
    { field: 'estado_civil', label: t('cadastroMembro.estadoCivil') },
    { field: 'nacionalidade', label: t('cadastroMembro.nacionalidade') },
    { field: 'cidade', label: t('cadastroMembro.cidade') },
    { field: 'email', label: t('cadastroMembro.email') },
    { field: 'telefone', label: t('cadastroMembro.celular') },
    { field: 'endereco', label: t('cadastroMembro.enderecoManual') },
  ];

  const handleSave = async () => {
    const faltando = CAMPOS_OBRIGATORIOS.filter(c => !String(form[c.field] ?? '').trim());

    if (faltando.length > 0) {
      const novosErros: Partial<Record<keyof FormState, boolean>> = {};
      faltando.forEach(c => { novosErros[c.field] = true; });
      setErrors(novosErros);

      const mensagem = faltando.length === 1
        ? `O campo "${faltando[0].label}" está vazio e precisa ser preenchido para salvar o cadastro.`
        : `Os seguintes campos estão vazios e precisam ser preenchidos para salvar o cadastro:\n\n${faltando.map(c => `• ${c.label}`).join('\n')}`;
      Alert.alert(t('common.atencao'), mensagem);
      return;
    }
    setErrors({});
    setSaving(true);

    const payload = {
      ...form,
      profile_id: user!.id,
      data_nascimento: parseDateISO(form.data_nascimento) || null,
      data_batismo: parseDateISO(form.data_batismo) || null,
      membro_desde: parseMesAnoToISO(form.membro_desde) || null,
    };

    let error;
    let idDoCadastro = existingId;
    if (existingId) {
      ({ error } = await supabase.from('members').update(payload).eq('id', existingId));
    } else {
      const r = await supabase.from('members').insert(payload).select('id').single();
      error = r.error;
      if (!error && r.data?.id) { idDoCadastro = r.data.id; setExistingId(r.data.id); }
    }

    if (error) {
      setSaving(false);
      // A mensagem do Supabase vai junto. Antes era só "não foi possível
      // salvar", e quando um insert de filho começou a falhar não havia como
      // saber por quê — nem no aparelho, nem depois.
      Alert.alert(t('common.erro'), `${t('cadastroMembro.erroSalvar')}\n\n${error.message ?? ''}`);
      return;
    }

    // Os filhos só podem ser gravados DEPOIS, porque `responsavel_id` aponta
    // para a linha que acabou de ser criada. É o que permite preencher o
    // próprio cadastro e os filhos de uma vez, na primeira visita.
    if (idDoCadastro) {
      const r = await filhosRef.current?.salvar(idDoCadastro);
      if (r && !r.ok) {
        setSaving(false);
        // Não fecha a tela: o cadastro foi salvo, mas algum filho não, e
        // sair agora esconderia o que falta corrigir.
        Alert.alert(t('cadastroMembro.filhosNaoSalvos'), r.erro ?? '');
        return;
      }
    }

    setSaving(false);
    Alert.alert(t('cadastroMembro.salvo'));
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('cadastroMembro.titulo')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={s.subtitulo}>{t('cadastroMembro.subtitulo')}</Text>

          <SectionTitle s={s}>{t('cadastroMembro.secaoPessoal')}</SectionTitle>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Field label="Nome *" value={form.nome} onChangeText={set('nome')} placeholder="Nome" error={errors.nome} C={C} s={s} /></View>
              <View style={{ flex: 1.5 }}><Field label="Sobrenome *" value={form.sobrenome} onChangeText={set('sobrenome')} placeholder="Sobrenome" error={errors.sobrenome} C={C} s={s} /></View>
            </View>
            <Field label={`${t('cadastroMembro.dataNascimento')} *`} value={form.data_nascimento} onChangeText={t2 => formatDate(t2, 'data_nascimento')} placeholder="DD/MM/AAAA" keyboardType="numeric" maxLength={10} error={errors.data_nascimento} C={C} s={s} />
            <SelectPill
              label={t('cadastroMembro.sexo')}
              options={SEXO_OPCOES.map(o => o.label)}
              value={SEXO_OPCOES.find(o => o.valor === form.sexo)?.label ?? ''}
              onChange={label => set('sexo')(SEXO_OPCOES.find(o => o.label === label)?.valor ?? '')}
              s={s}
            />
            <SelectPill label={`${t('cadastroMembro.estadoCivil')} *`} options={ESTADO_CIVIL_OPCOES} value={form.estado_civil} onChange={set('estado_civil')} error={errors.estado_civil} s={s} />
            <Field label={`${t('cadastroMembro.nacionalidade')} *`} value={form.nacionalidade} onChangeText={set('nacionalidade')} placeholder="Ex: Brasileira" error={errors.nacionalidade} C={C} s={s} />
            <Field label={t('cadastroMembro.profissao')} value={form.profissao} onChangeText={set('profissao')} placeholder={t('cadastroMembro.profissaoPlaceholder')} C={C} s={s} />
            {/* Fica ao lado do "deseja servir" na prática: é por aqui que a
                liderança descobre quem toca, canta, cozinha ou filma. */}
            <Field label={t('cadastroMembro.talentos')} value={form.talentos_hobbies} onChangeText={set('talentos_hobbies')} placeholder={t('cadastroMembro.talentosPlaceholder')} C={C} s={s} />
          </View>

          <SectionTitle s={s}>{t('cadastroMembro.secaoContato')}</SectionTitle>
          <View style={s.card}>
            <Field label={`${t('cadastroMembro.email')} *`} value={form.email} onChangeText={set('email')} placeholder="email@exemplo.com" keyboardType="email-address" error={errors.email} C={C} s={s} />
            <Field label={`${t('cadastroMembro.celular')} *`} value={form.telefone} onChangeText={formatPhone} placeholder="+44 7000 000000" keyboardType="phone-pad" maxLength={14} error={errors.telefone} C={C} s={s} />
            <Field label={t('cadastroMembro.instagram')} value={form.instagram} onChangeText={set('instagram')} placeholder={t('cadastroMembro.instagramPlaceholder')} C={C} s={s} />
          </View>

          <SectionTitle s={s}>{t('cadastroMembro.secaoEndereco')}</SectionTitle>
          <View style={s.card}>
            <SelectPill label={t('cadastroMembro.pais')} options={PAISES} value={form.pais} onChange={v => { set('pais')(v); setSugestoes([]); }} s={s} />

            {form.pais === 'Reino Unido' ? (
              <>
                <Field label={t('cadastroMembro.cep')} value={form.cep} onChangeText={onChangeCep} placeholder={t('cadastroMembro.cepPlaceholderUK')} autoCapitalize="characters" C={C} s={s} />
                {buscandoCep && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <ActivityIndicator size="small" color={C.accent} />
                    <Text style={{ fontSize: 12, color: C.textMuted }}>{t('cadastroMembro.buscandoEndereco')}</Text>
                  </View>
                )}
                {sugestoes.length > 0 && (
                  <View style={s.sugestoesBox}>
                    <Text style={s.fieldLabel}>{t('cadastroMembro.selecioneEndereco')}</Text>
                    {sugestoes.map(sug => (
                      <TouchableOpacity key={sug.placeId} style={s.sugestaoItem} onPress={() => selecionarSugestao(sug)}>
                        <Ionicons name="location-outline" size={16} color={C.accent} />
                        <Text style={s.sugestaoText}>{sug.texto}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {!GOOGLE_PLACES_KEY && (
                  <Text style={{ fontSize: 11, color: C.textDim, marginBottom: 10 }}>
                    Busca automática de endereço indisponível no momento — preencha manualmente abaixo.
                  </Text>
                )}
              </>
            ) : (
              <Field label={t('cadastroMembro.cep')} value={form.cep} onChangeText={set('cep')} placeholder="00000-000" C={C} s={s} />
            )}

            <Field label={`${t('cadastroMembro.enderecoManual')} *`} value={form.endereco} onChangeText={set('endereco')} placeholder="Ex: 45 Abbey Square" error={errors.endereco} C={C} s={s} />
            <Field label={t('cadastroMembro.complemento')} value={form.complemento} onChangeText={set('complemento')} placeholder="Ex: Apto 3B, próximo ao mercado" C={C} s={s} />
            <Field label={`${t('cadastroMembro.cidade')} *`} value={form.cidade} onChangeText={set('cidade')} placeholder="Cidade" error={errors.cidade} C={C} s={s} />
            <Field label={t('cadastroMembro.estadoRegiao')} value={form.estado} onChangeText={set('estado')} placeholder={t('cadastroMembro.estadoRegiaoPlaceholder')} maxLength={40} C={C} s={s} />
          </View>

          <SectionTitle s={s}>{t('cadastroMembro.secaoIgreja')}</SectionTitle>
          <View style={s.card}>
            <ToggleRow label={t('cadastroMembro.veioOutraIgreja')} value={form.igreja_anterior} onToggle={() => set('igreja_anterior')(!form.igreja_anterior)} icon={form.igreja_anterior ? 'business' : 'business-outline'} simTexto={t('cadastroMembro.sim')} naoTexto={t('cadastroMembro.nao')} C={C} s={s} />
            {form.igreja_anterior && (
              <Field label={t('cadastroMembro.nomeDaIgreja')} value={form.igreja_anterior_nome} onChangeText={set('igreja_anterior_nome')} placeholder={t('cadastroMembro.nomeDaIgreja')} C={C} s={s} />
            )}

            <ToggleRow label={t('cadastroMembro.ehBatizado')} value={form.batizado} onToggle={() => set('batizado')(!form.batizado)} icon={form.batizado ? 'water' : 'water-outline'} simTexto={t('cadastroMembro.sim')} naoTexto={t('cadastroMembro.nao')} C={C} s={s} />
            {form.batizado && (
              <Field label={t('cadastroMembro.dataBatismo')} value={form.data_batismo} onChangeText={t2 => formatDate(t2, 'data_batismo')} placeholder="DD/MM/AAAA" keyboardType="numeric" maxLength={10} C={C} s={s} />
            )}
            {!form.batizado && (
              <ToggleRow label={t('cadastroMembro.desejaBatizar')} value={form.deseja_batizar} onToggle={() => set('deseja_batizar')(!form.deseja_batizar)} icon={form.deseja_batizar ? 'heart' : 'heart-outline'} simTexto={t('cadastroMembro.sim')} naoTexto={t('cadastroMembro.nao')} C={C} s={s} />
            )}

            <Field label={t('cadastroMembro.quandoChegou')} value={form.membro_desde} onChangeText={formatMesAno} placeholder={t('cadastroMembro.quandoChegouPlaceholder')} keyboardType="numeric" maxLength={7} C={C} s={s} />

            <ToggleRow label={t('cadastroMembro.jaServiuArea')} value={form.ministerio_anterior} onToggle={() => set('ministerio_anterior')(!form.ministerio_anterior)} icon={form.ministerio_anterior ? 'people' : 'people-outline'} simTexto={t('cadastroMembro.sim')} naoTexto={t('cadastroMembro.nao')} C={C} s={s} />
            {form.ministerio_anterior && (
              <Field label={t('cadastroMembro.qualArea')} value={form.ministerio_anterior_qual} onChangeText={set('ministerio_anterior_qual')} placeholder={t('cadastroMembro.qualArea')} C={C} s={s} />
            )}

            <SelectPill label={t('cadastroMembro.ministerioAtual')} options={MINISTERIOS} value={form.ministerio} onChange={set('ministerio')} s={s} />

            <ToggleRow label={t('cadastroMembro.desejaServir')} value={form.deseja_servir} onToggle={() => set('deseja_servir')(!form.deseja_servir)} icon={form.deseja_servir ? 'hand-right' : 'hand-right-outline'} simTexto={t('cadastroMembro.sim')} naoTexto={t('cadastroMembro.nao')} C={C} s={s} />
            {form.deseja_servir && (
              <Field label={t('cadastroMembro.qualArea')} value={form.deseja_servir_area} onChangeText={set('deseja_servir_area')} placeholder={t('cadastroMembro.qualArea')} C={C} s={s} />
            )}

            <ToggleRow label={t('cadastroMembro.mostrarAniversario')} value={form.mostrar_aniversario} onToggle={() => set('mostrar_aniversario')(!form.mostrar_aniversario)} icon={form.mostrar_aniversario ? 'gift' : 'gift-outline'} simTexto={t('cadastroMembro.sim')} naoTexto={t('cadastroMembro.nao')} C={C} s={s} />

            <CampoMultilinha label={t('cadastroMembro.compartilharMais')} value={form.compartilhar_mais} onChangeText={set('compartilhar_mais')} placeholder={t('cadastroMembro.compartilharMaisPlaceholder')} C={C} s={s} />
          </View>

          <SectionTitle s={s}>{t('filhos.secao')}</SectionTitle>
          <FilhosCard ref={filhosRef} responsavelId={existingId} />

          <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={s.saveBtnText}>{t('cadastroMembro.salvar')}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function buildStyles(C: Paleta) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 12,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
    subtitulo: { fontSize: 13, color: C.textMuted, lineHeight: 19, marginBottom: 18 },
    sectionTitle: {
      fontSize: 12, fontWeight: '800', color: C.accent, letterSpacing: 0.6,
      textTransform: 'uppercase', marginBottom: 8, marginTop: 6,
    },
    card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20 },
    fieldWrap: { marginBottom: 12 },
    fieldLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
    fieldLabelError: { color: C.danger },
    fieldInput: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15, color: C.text },
    fieldInputError: { borderColor: C.danger, borderWidth: 1.5 },
    fieldErrorText: { fontSize: 11, color: C.danger, marginTop: 4 },
    pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
    pillActive: { backgroundColor: C.accent + '22', borderColor: C.accent },
    pillError: { borderColor: C.danger },
    pillText: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
    pillTextActive: { color: C.accent, fontWeight: '700' },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 12 },
    toggleStatus: { fontSize: 13, marginTop: 3 },
    toggleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    toggleBtnActive: { backgroundColor: C.success, borderColor: C.success },
    sugestoesBox: { backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 12 },
    sugestaoItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    sugestaoText: { fontSize: 13, color: C.text, flex: 1 },
    saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.success, borderRadius: 14, paddingVertical: 16, marginTop: 4 },
    saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  });
}
