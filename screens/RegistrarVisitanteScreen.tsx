// screens/RegistrarVisitanteScreen.tsx
//
// Registro de visitante pela recepção. O visitante NÃO instala nada e não
// preenche nada: quem digita é quem o recebeu na porta.
//
// A TELA É CURTA DE PROPÓSITO
// Isto é usado em pé, no corredor, com alguém esperando do outro lado. Cada
// campo a mais é uma chance de o registro não terminar — e um registro pela
// metade vale menos que nenhum, porque dá a impressão de que a igreja tem o
// contato quando não tem. Nome é o único obrigatório.
//
// CONSENTIMENTO NÃO É BUROCRACIA AQUI
// Quem digita é a igreja, não a pessoa. No Reino Unido, guardar um telefone
// para ligar depois precisa de base legal, e "alguém anotou" não é uma. Por
// isso o interruptor é explícito e a copy manda perguntar em voz alta. Sem
// ele marcado, o cadastro é salvo (a visita aconteceu, é um fato) mas a lista
// do acolhimento mostra que não se deve ligar.
//
// O WHATSAPP É O PONTO ALTO
// Assim que salva, um botão abre o WhatsApp com a mensagem de boas-vindas
// pronta. É o que transforma um dado num contato: a igreja fala com a pessoa
// no mesmo domingo, e a partir daí o canal existe — sem ela ter instalado
// nada. Os dígitos vêm normalizados do banco (`telefone_wa`), não montados
// aqui: a regra de normalização mora num lugar só.

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

const COMO_CONHECEU = [
  { valor: 'amigo',     chave: 'visitantes.comoAmigo' },
  { valor: 'familia',   chave: 'visitantes.comoFamilia' },
  { valor: 'internet',  chave: 'visitantes.comoInternet' },
  { valor: 'passando',  chave: 'visitantes.comoPassando' },
  { valor: 'evento',    chave: 'visitantes.comoEvento' },
  { valor: 'outro',     chave: 'visitantes.comoOutro' },
];

function paleta(isDark: boolean) {
  return isDark ? {
    primary: '#100D28', accent: '#F5C842',
    bg: '#0E0B22', surface: '#1C1940', surfaceAlt: '#241F4D',
    text: '#F1EFFA', textMuted: '#A6A0C7', textDim: '#726A99',
    border: '#332D5C', danger: '#FF6B6B', success: '#4ADE80', whats: '#25D366',
  } : {
    primary: '#1A1740', accent: '#C8960A',
    bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
    text: '#1A1A2E', textMuted: '#6B7280', textDim: '#9CA3AF',
    border: '#E5E0D8', danger: '#C0392B', success: '#27AE60', whats: '#25D366',
  };
}

type Salvo = { id: string; jaExistia: boolean; telefoneWa: string | null; nome: string };

export default function RegistrarVisitanteScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [primeiraVez, setPrimeiraVez] = useState(true);
  const [comoConheceu, setComoConheceu] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [consentiu, setConsentiu] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState<Salvo | null>(null);

  const salvar = async () => {
    if (!nome.trim()) {
      Alert.alert(t('common.atencao'), t('visitantes.erroNome'));
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase.rpc('registrar_visitante', {
      p_nome: nome.trim(),
      p_telefone: telefone.trim() || null,
      p_email: null,
      p_primeira_vez: primeiraVez,
      p_como_conheceu: comoConheceu ? t(COMO_CONHECEU.find(c => c.valor === comoConheceu)!.chave) : null,
      p_observacoes: observacoes.trim() || null,
      p_consentiu_contato: consentiu,
    });
    setSalvando(false);

    if (error || !(data as any)?.ok) {
      // A mensagem real vai junto: um erro mudo aqui vira "registrei e sumiu".
      Alert.alert(t('common.erro'), error?.message ?? (data as any)?.erro ?? '');
      return;
    }
    const r = data as any;
    setSalvo({ id: r.id, jaExistia: !!r.ja_existia, telefoneWa: r.telefone_wa ?? null, nome: nome.trim() });
  };

  const abrirWhatsApp = async () => {
    if (!salvo?.telefoneWa) return;
    const texto = t('visitantes.mensagemBoasVindas', { nome: salvo.nome.split(' ')[0] });
    const url = `https://wa.me/${salvo.telefoneWa}?text=${encodeURIComponent(texto)}`;
    const podeAbrir = await Linking.canOpenURL(url);
    if (!podeAbrir) { Alert.alert(t('common.erro'), t('visitantes.semWhatsApp')); return; }
    Linking.openURL(url);
  };

  const registrarOutro = () => {
    setSalvo(null);
    setNome(''); setTelefone(''); setPrimeiraVez(true);
    setComoConheceu(''); setObservacoes(''); setConsentiu(false);
  };

  // ── Confirmação ───────────────────────────────────────────────────────────
  if (salvo) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={C.primary} />
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t('visitantes.registrado')}</Text>
          <View style={s.backBtn} />
        </View>

        <ScrollView contentContainerStyle={s.conteudo}>
          <View style={s.okWrap}>
            <View style={s.okCirculo}>
              <Ionicons name="checkmark" size={38} color={C.success} />
            </View>
            <Text style={s.okTitulo}>{salvo.nome}</Text>
            <Text style={s.okTexto}>
              {salvo.jaExistia ? t('visitantes.jaTinhaVindo') : t('visitantes.primeiroRegistro')}
            </Text>
          </View>

          {/* O passo que transforma um dado num contato. Fica em destaque
              porque é o que a recepção tem de fazer ANTES de a pessoa sair. */}
          {!!salvo.telefoneWa && consentiu && (
            <TouchableOpacity style={s.btnWhats} onPress={abrirWhatsApp} activeOpacity={0.85}>
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              <Text style={s.btnWhatsTexto}>{t('visitantes.enviarBoasVindas')}</Text>
            </TouchableOpacity>
          )}
          {!!salvo.telefoneWa && !consentiu && (
            <Text style={s.avisoSemConsentimento}>{t('visitantes.semConsentimentoAviso')}</Text>
          )}

          <TouchableOpacity style={s.btnSecundario} onPress={registrarOutro}>
            <Ionicons name="person-add-outline" size={18} color={C.text} />
            <Text style={s.btnSecundarioTexto}>{t('visitantes.registrarOutro')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnTexto} onPress={() => navigation.goBack()}>
            <Text style={s.btnTextoLabel}>{t('visitantes.concluir')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Formulário ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('visitantes.novoTitulo')}</Text>
        <View style={s.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.conteudo} keyboardShouldPersistTaps="handled">
          <Text style={s.intro}>{t('visitantes.introRecepcao')}</Text>

          <Text style={s.label}>{t('visitantes.nome')} *</Text>
          <TextInput
            style={s.input} value={nome} onChangeText={setNome}
            placeholder={t('visitantes.nomePlaceholder')} placeholderTextColor={C.textDim}
            autoCapitalize="words" autoFocus
          />

          <Text style={s.label}>{t('visitantes.telefone')}</Text>
          <TextInput
            style={s.input} value={telefone} onChangeText={setTelefone}
            placeholder="07700 900123" placeholderTextColor={C.textDim}
            keyboardType="phone-pad"
          />
          <Text style={s.ajuda}>{t('visitantes.telefoneAjuda')}</Text>

          <View style={s.toggleLinha}>
            <Text style={s.toggleLabel}>{t('visitantes.primeiraVez')}</Text>
            <View style={s.simNaoRow}>
              {[true, false].map(v => (
                <TouchableOpacity
                  key={String(v)}
                  style={[s.simNao, primeiraVez === v && s.simNaoAtivo]}
                  onPress={() => setPrimeiraVez(v)}
                >
                  <Text style={[s.simNaoTexto, primeiraVez === v && s.simNaoTextoAtivo]}>
                    {v ? t('cadastroMembro.sim') : t('cadastroMembro.nao')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={s.label}>{t('visitantes.comoConheceu')}</Text>
          <View style={s.pillWrap}>
            {COMO_CONHECEU.map(op => (
              <TouchableOpacity
                key={op.valor}
                style={[s.pill, comoConheceu === op.valor && s.pillAtiva]}
                onPress={() => setComoConheceu(comoConheceu === op.valor ? '' : op.valor)}
              >
                <Text style={[s.pillTexto, comoConheceu === op.valor && s.pillTextoAtivo]}>
                  {t(op.chave)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>{t('visitantes.observacoes')}</Text>
          <TextInput
            style={[s.input, s.inputMulti]} value={observacoes} onChangeText={setObservacoes}
            placeholder={t('visitantes.observacoesPlaceholder')} placeholderTextColor={C.textDim}
            multiline
          />

          {/* O consentimento é um cartão, não mais um interruptor na lista:
              ele precisa parar o olho da pessoa que está digitando às pressas. */}
          <TouchableOpacity
            style={[s.consentCard, consentiu && s.consentCardAtivo]}
            onPress={() => setConsentiu(c => !c)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={consentiu ? 'checkbox' : 'square-outline'}
              size={22} color={consentiu ? C.success : C.textMuted}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.consentTitulo}>{t('visitantes.consentimentoTitulo')}</Text>
              <Text style={s.consentTexto}>{t('visitantes.consentimentoTexto')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnSalvar} onPress={salvar} disabled={salvando}>
            {salvando ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={s.btnSalvarTexto}>{t('visitantes.salvar')}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function buildStyles(C: ReturnType<typeof paleta>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 12,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
    conteudo: { padding: 20, paddingBottom: 48 },
    intro: { fontSize: 13, color: C.textMuted, lineHeight: 19, marginBottom: 20 },
    label: {
      fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6,
      textTransform: 'uppercase', marginBottom: 6,
    },
    input: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      borderRadius: 10, paddingHorizontal: 14, height: 50, fontSize: 16,
      color: C.text, marginBottom: 6,
    },
    inputMulti: { height: 84, textAlignVertical: 'top', paddingTop: 12 },
    ajuda: { fontSize: 11.5, color: C.textDim, marginBottom: 16, lineHeight: 16 },
    toggleLinha: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 10, marginBottom: 18,
    },
    toggleLabel: { fontSize: 14.5, color: C.text, fontWeight: '600', flex: 1 },
    simNaoRow: { flexDirection: 'row', gap: 8 },
    simNao: {
      paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    simNaoAtivo: { backgroundColor: C.accent + '22', borderColor: C.accent },
    simNaoTexto: { fontSize: 13.5, color: C.textMuted, fontWeight: '600' },
    simNaoTextoAtivo: { color: C.accent, fontWeight: '800' },
    pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    pill: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    pillAtiva: { backgroundColor: C.accent + '22', borderColor: C.accent },
    pillTexto: { fontSize: 13, color: C.textMuted, fontWeight: '500' },
    pillTextoAtivo: { color: C.accent, fontWeight: '700' },
    consentCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border,
      borderRadius: 12, padding: 14, marginTop: 14, marginBottom: 22,
    },
    consentCardAtivo: { borderColor: C.success, backgroundColor: C.success + '0F' },
    consentTitulo: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 },
    consentTexto: { fontSize: 12.5, color: C.textMuted, lineHeight: 17.5 },
    btnSalvar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: C.success, borderRadius: 14, paddingVertical: 16,
    },
    btnSalvarTexto: { fontSize: 15.5, fontWeight: '800', color: '#fff' },
    okWrap: { alignItems: 'center', paddingVertical: 26, gap: 10 },
    okCirculo: {
      width: 76, height: 76, borderRadius: 38, backgroundColor: C.success + '1F',
      alignItems: 'center', justifyContent: 'center', marginBottom: 6,
    },
    okTitulo: { fontSize: 21, fontWeight: '800', color: C.text, textAlign: 'center' },
    okTexto: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
    btnWhats: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      backgroundColor: C.whats, borderRadius: 14, paddingVertical: 16, marginTop: 18,
    },
    btnWhatsTexto: { fontSize: 15.5, fontWeight: '800', color: '#fff' },
    avisoSemConsentimento: {
      fontSize: 12.5, color: C.textMuted, lineHeight: 18, marginTop: 18,
      backgroundColor: C.surfaceAlt, borderRadius: 10, padding: 12,
    },
    btnSecundario: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
      borderRadius: 14, paddingVertical: 15, marginTop: 12,
    },
    btnSecundarioTexto: { fontSize: 14.5, fontWeight: '700', color: C.text },
    btnTexto: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
    btnTextoLabel: { fontSize: 14, fontWeight: '600', color: C.textMuted },
  });
}
