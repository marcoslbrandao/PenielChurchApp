import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, StatusBar, Alert,
  ActivityIndicator, Animated, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#1A1740',
  surface: '#242155',
  border: 'rgba(255,255,255,0.12)',
  primary: '#7C4DFF',
  accent: '#F5C842',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.55)',
  textDim: 'rgba(255,255,255,0.25)',
  danger: '#FF4D4D',
  success: '#1DB954',
};

// ─── Tipos de modo ────────────────────────────────────────────────────────────
// 'confirmar' = confirmação do e-mail por CÓDIGO de 6 dígitos, não por link.
// O link do e-mail abria o Safari e morria em "endereço inválido" (o esquema
// penielchurch:// não é aberto a partir do Mail, e o redirect nem estava na
// allow-list do Supabase). Com código, a pessoa nunca sai do app — e funciona
// mesmo quando ela abre o e-mail no computador e o app está no celular.
type Mode = 'login' | 'signup' | 'reset' | 'invite' | 'confirmar';

export default function AuthScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [mode, setMode] = useState<Mode>('login');
  const [codigoEmail, setCodigoEmail] = useState('');
  const [erroCodigo, setErroCodigo] = useState('');
  const [reenviando, setReenviando] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) { Alert.alert(t('common.atencao'), t('auth.preencherEmailSenha')); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      if (error.message.includes('Email not confirmed') || error.message.includes('email_not_confirmed')) {
        // Em vez de só avisar, leva pra tela de código: quem não confirmou
        // precisa de um caminho, não de um aviso.
        Alert.alert(
          t('auth.emailNaoConfirmadoTitulo'),
          t('auth.emailNaoConfirmadoMsg'),
          [
            { text: t('common.cancelar'), style: 'cancel' },
            { text: t('auth.inserirCodigoEmail'), onPress: () => { setCodigoEmail(''); setErroCodigo(''); setMode('confirmar'); } },
          ]
        );
      } else {
        Alert.alert(t('auth.erroAoEntrar'), error.message);
      }
      return;
    }
    fecharSeModal();
  };

  // Esta tela é aberta como modal (a partir do card do Perfil). Depois de
  // entrar ou confirmar, ela sai de cena sozinha e devolve a pessoa ao app.
  const fecharSeModal = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  // ── Cadastro ───────────────────────────────────────────────────────────────
  const handleSignup = async () => {
    if (!fullName || !email || !password) { Alert.alert(t('common.atencao'), t('auth.preencherTodosCampos')); return; }
    if (password.length < 6) { Alert.alert(t('common.atencao'), t('auth.senhaMinima')); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) {
      Alert.alert(t('auth.erroAoCadastrar'), error.message);
      return;
    }
    setCodigoEmail('');
    setErroCodigo('');
    setMode('confirmar');
  };

  // ── Confirmar e-mail com o código de 6 dígitos ─────────────────────────────
  const handleConfirmarEmail = async () => {
    // O comprimento do código vem do painel do Supabase (Auth → Email → "Email
    // OTP length", hoje 6). Aceitamos 6–10 dígitos para que o app nunca volte a
    // travar o cadastro se esse ajuste mudar: antes o campo cortava em 6 e um
    // código de 8 dígitos virava "código inválido" para todo mundo.
    const token = codigoEmail.replace(/\D/g, '');
    if (token.length < 6) { setErroCodigo(t('auth.codigoEmailIncompleto')); return; }
    setLoading(true); setErroCodigo('');
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) {
      // Rede de segurança: o código do e-mail é de USO ÚNICO e é o mesmo
      // token do antigo link de confirmação. Se a pessoa tiver um e-mail
      // velho na caixa de entrada e clicar no link, a conta é confirmada e o
      // código morre — digitá-lo aqui daria "código inválido" numa conta que
      // está perfeitamente ativa. Antes de acusar erro, tentamos entrar com a
      // senha que ela acabou de criar: se funcionar, estava tudo certo.
      if (password) {
        const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password });
        if (!erroLogin) {
          setLoading(false);
          if (navigation.canGoBack()) navigation.replace('BemVindo');
          return;
        }
      }
      setLoading(false);
      setErroCodigo(t('auth.codigoEmailInvalido'));
      return;
    }
    setLoading(false);
    // verifyOtp já devolve a sessão: a pessoa entra direto, sem precisar
    // digitar a senha de novo logo depois de tê-la criado.
    if (navigation.canGoBack()) navigation.replace('BemVindo');
  };

  const handleReenviarCodigo = async () => {
    if (!email) { Alert.alert(t('common.atencao'), t('auth.informeSeuEmail')); return; }
    setReenviando(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setReenviando(false);
    if (error) Alert.alert(t('common.erro'), error.message);
    else Alert.alert(t('perfil.emailEnviadoTitulo'), t('auth.codigoReenviado', { email }));
  };

  // ── Usar código de convite ─────────────────────────────────────────────────
  const handleInviteCode = async () => {
    if (!inviteCode.trim()) { setInviteError(t('auth.digiteCodigoConviteErro')); return; }
    setLoading(true);
    setInviteError('');

    const { data, error } = await supabase.rpc('use_invite_code', {
      p_code: inviteCode.trim().toUpperCase(),
    });

    setLoading(false);

    if (error || !data?.success) {
      setInviteError(data?.error ?? t('auth.codigoInvalido'));
    } else {
      setInviteSuccess(true);
      setTimeout(() => {
        // Força refresh da sessão para carregar o novo role
        supabase.auth.refreshSession();
      }, 1500);
    }
  };

  // ── Pular convite (continuar como visitante) ───────────────────────────────
  const handleSkipInvite = () => {
    Alert.alert(
      t('auth.continuarVisitanteTitulo'),
      t('auth.continuarVisitanteMsg'),
      [
        { text: t('auth.inserirCodigo'), style: 'cancel' },
        { text: t('auth.continuarVisitante'), onPress: () => supabase.auth.refreshSession() },
      ]
    );
  };

  // ── Reset de senha ─────────────────────────────────────────────────────────
  const handleReset = async () => {
    if (!email) { Alert.alert(t('common.atencao'), t('auth.informeSeuEmail')); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'penielchurch://reset-password',
    });
    setLoading(false);
    if (error) {
      Alert.alert(t('common.erro'), error.message);
    } else {
      Alert.alert(t('perfil.emailEnviadoTitulo'), t('auth.emailEnviadoResetMsg'),
        [{ text: t('common.ok'), onPress: () => setMode('login') }]
      );
    }
  };

  const handleSubmit = () => {
    if (mode === 'login') handleLogin();
    else if (mode === 'signup') handleSignup();
    else if (mode === 'reset') handleReset();
    else if (mode === 'invite') handleInviteCode();
    else if (mode === 'confirmar') handleConfirmarEmail();
  };

  // ── Tela de código de convite ──────────────────────────────────────────────
  if (mode === 'invite') {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav}>
          <View style={s.inner}>

            {/* Ícone */}
            <View style={s.logoWrap}>
              <View style={[s.logoCircle, inviteSuccess && { backgroundColor: 'rgba(29,185,84,0.2)', borderColor: 'rgba(29,185,84,0.4)' }]}>
                {inviteSuccess
                  ? <Ionicons name="checkmark-circle" size={40} color={C.success} />
                  : <Ionicons name="key-outline" size={36} color={C.accent} />
                }
              </View>
              <Text style={s.appName}>
                {inviteSuccess ? t('auth.bemVindoMembro') : t('auth.codigoConvite')}
              </Text>
              <Text style={s.appSub}>
                {inviteSuccess
                  ? t('auth.acessoAtivado')
                  : t('auth.digiteCodigoConvite')
                }
              </Text>
            </View>

            {!inviteSuccess && (
              <View style={s.form}>
                {/* Campo de código */}
                <View style={s.fieldWrap}>
                  <Text style={s.fieldLabel}>{t('auth.codigoConvite')}</Text>
                  <View style={[s.fieldRow, !!inviteError && { borderColor: C.danger }]}>
                    <Ionicons name="ticket-outline" size={18} color={C.textMuted} style={s.fieldIcon} />
                    <TextInput
                      style={[s.fieldInput, { letterSpacing: 2, fontWeight: '700' }]}
                      placeholder="PENIEL-2024-XX"
                      placeholderTextColor={C.textDim}
                      value={inviteCode}
                      onChangeText={v => { setInviteCode(v.toUpperCase()); setInviteError(''); }}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </View>
                  {!!inviteError && (
                    <View style={s.errorRow}>
                      <Ionicons name="alert-circle-outline" size={14} color={C.danger} />
                      <Text style={s.errorText}>{inviteError}</Text>
                    </View>
                  )}
                </View>

                {/* Botão ativar */}
                <TouchableOpacity
                  style={[s.submitBtn, loading && { opacity: 0.7 }]}
                  onPress={handleInviteCode}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
                        <Text style={s.submitBtnText}>{t('auth.ativarAcesso')}</Text>
                      </>
                  }
                </TouchableOpacity>

                {/* Pular */}
                <TouchableOpacity style={s.skipBtn} onPress={handleSkipInvite}>
                  <Text style={s.skipText}>{t('auth.naoTenhoCodigo')}</Text>
                </TouchableOpacity>

                <Text style={s.inviteHint}>
                  {t('auth.dicaCodigoConvite')}
                </Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Tela de confirmação de e-mail (código de 6 dígitos) ────────────────────
  if (mode === 'confirmar') {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <TouchableOpacity style={s.fecharBtn} onPress={fecharSeModal} hitSlop={10}>
          <Ionicons name="close" size={24} color={C.textMuted} />
        </TouchableOpacity>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav}>
          <View style={s.inner}>
            <View style={s.logoWrap}>
              <View style={s.logoCircle}>
                <Ionicons name="mail-open-outline" size={36} color={C.accent} />
              </View>
              <Text style={s.appName}>{t('auth.confirmeSeuEmail')}</Text>
              <Text style={s.appSub}>{t('auth.confirmeSeuEmailMsg', { email })}</Text>
            </View>

            <View style={s.form}>
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>{t('auth.codigoDoEmail')}</Text>
                <View style={[s.fieldRow, !!erroCodigo && { borderColor: C.danger }]}>
                  <Ionicons name="keypad-outline" size={18} color={C.textMuted} style={s.fieldIcon} />
                  <TextInput
                    style={[s.fieldInput, { letterSpacing: 8, fontWeight: '700', fontSize: 20 }]}
                    placeholder="000000"
                    placeholderTextColor={C.textDim}
                    value={codigoEmail}
                    onChangeText={v => { setCodigoEmail(v.replace(/[^0-9]/g, '').slice(0, 10)); setErroCodigo(''); }}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    maxLength={10}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleConfirmarEmail}
                  />
                </View>
                {!!erroCodigo && (
                  <View style={s.errorRow}>
                    <Ionicons name="alert-circle-outline" size={14} color={C.danger} />
                    <Text style={s.errorText}>{erroCodigo}</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[s.submitBtn, loading && { opacity: 0.7 }]}
                onPress={handleConfirmarEmail} disabled={loading} activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Text style={s.submitBtnText}>{t('auth.confirmarBtn')}</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={s.skipBtn} onPress={handleReenviarCodigo} disabled={reenviando}>
                <Text style={s.skipText}>
                  {reenviando ? t('common.enviando') : t('auth.naoRecebeuReenviar')}
                </Text>
              </TouchableOpacity>

              <View style={s.switchRow}>
                <TouchableOpacity onPress={() => setMode('login')}>
                  <Text style={s.switchLink}>{t('auth.voltarParaLogin')}</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.inviteHint}>{t('auth.dicaSpam')}</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Tela principal (login / cadastro / reset) ──────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <TouchableOpacity style={s.fecharBtn} onPress={fecharSeModal} hitSlop={10}>
        <Ionicons name="close" size={24} color={C.textMuted} />
      </TouchableOpacity>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav}>
        <View style={s.inner}>

          {/* Logo */}
          <View style={s.logoWrap}>
            <Image
              source={require('../assets/peniel-logo.png')}
              style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 16 }}
              resizeMode="cover"
            />
            <Text style={s.appName}>Peniel Church</Text>
            <Text style={s.appSub}>
              {mode === 'login' && t('auth.entrarNaConta')}
              {mode === 'signup' && t('auth.criarConta')}
              {mode === 'reset' && t('auth.recuperarSenha')}
            </Text>
          </View>

          {/* Formulário */}
          <View style={s.form}>

            {/* Nome — só no cadastro */}
            {mode === 'signup' && (
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>{t('auth.nomeCompleto')}</Text>
                <View style={s.fieldRow}>
                  <Ionicons name="person-outline" size={18} color={C.textMuted} style={s.fieldIcon} />
                  <TextInput
                    style={s.fieldInput} placeholder={t('auth.seuNome')} placeholderTextColor={C.textDim}
                    value={fullName} onChangeText={setFullName} autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {/* E-mail */}
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>{t('auth.email')}</Text>
              <View style={s.fieldRow}>
                <Ionicons name="mail-outline" size={18} color={C.textMuted} style={s.fieldIcon} />
                <TextInput
                  style={s.fieldInput} placeholder="seu@email.com" placeholderTextColor={C.textDim}
                  value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
                />
              </View>
            </View>

            {/* Senha */}
            {mode !== 'reset' && (
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>{t('auth.senha')}</Text>
                <View style={s.fieldRow}>
                  <Ionicons name="lock-closed-outline" size={18} color={C.textMuted} style={s.fieldIcon} />
                  <TextInput
                    style={s.fieldInput} placeholder="••••••••" placeholderTextColor={C.textDim}
                    value={password} onChangeText={setPassword}
                    secureTextEntry={!showPassword} autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={s.eyeBtn}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Esqueci a senha */}
            {mode === 'login' && (
              <TouchableOpacity onPress={() => setMode('reset')} style={s.forgotBtn}>
                <Text style={s.forgotText}>{t('auth.esqueciSenha')}</Text>
              </TouchableOpacity>
            )}

            {/* Botão principal */}
            <TouchableOpacity
              style={[s.submitBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit} disabled={loading} activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Text style={s.submitBtnText}>
                    {mode === 'login' && t('auth.entrar')}
                    {mode === 'signup' && t('auth.criarContaBtn')}
                    {mode === 'reset' && t('auth.enviarEmail')}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            {/* Alternar modo */}
            <View style={s.switchRow}>
              {mode === 'login' && (
                <>
                  <Text style={s.switchText}>{t('auth.naoTemConta')}</Text>
                  <TouchableOpacity onPress={() => setMode('signup')}>
                    <Text style={s.switchLink}>{t('auth.cadastreSe')}</Text>
                  </TouchableOpacity>
                </>
              )}
              {mode === 'signup' && (
                <>
                  <Text style={s.switchText}>{t('auth.jaTemConta')}</Text>
                  <TouchableOpacity onPress={() => setMode('login')}>
                    <Text style={s.switchLink}>{t('auth.entrar')}</Text>
                  </TouchableOpacity>
                </>
              )}
              {mode === 'reset' && (
                <TouchableOpacity onPress={() => setMode('login')}>
                  <Text style={s.switchLink}>{t('auth.voltarParaLogin')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={s.footer}>{t('auth.rodape')}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  kav: { flex: 1 },
  fecharBtn: { position: 'absolute', top: 8, right: 16, zIndex: 10, padding: 8 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(245,200,66,0.15)', borderWidth: 1, borderColor: 'rgba(245,200,66,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  appName: { fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: 0.5, textAlign: 'center' },
  appSub: { fontSize: 14, color: C.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  form: { gap: 4 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 50 },
  fieldIcon: { marginRight: 10 },
  fieldInput: { flex: 1, fontSize: 15, color: C.text },
  eyeBtn: { padding: 4 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 8, marginTop: -6 },
  forgotText: { fontSize: 13, color: C.accent },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, marginTop: 8 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  switchText: { fontSize: 14, color: C.textMuted },
  switchLink: { fontSize: 14, color: C.accent, fontWeight: '700' },
  footer: { textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 40 },
  // Invite
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  errorText: { fontSize: 12, color: C.danger },
  skipBtn: { alignItems: 'center', paddingVertical: 14 },
  skipText: { fontSize: 13, color: C.textMuted, textDecorationLine: 'underline' },
  inviteHint: { fontSize: 12, color: C.textDim, textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
