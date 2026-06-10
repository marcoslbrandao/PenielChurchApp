import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, StatusBar, Alert,
  ActivityIndicator, Animated, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
type Mode = 'login' | 'signup' | 'reset' | 'invite';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
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
    if (!email || !password) { Alert.alert('Atenção', 'Preencha e-mail e senha.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      if (error.message.includes('Email not confirmed') || error.message.includes('email_not_confirmed')) {
        Alert.alert(
          'E-mail não confirmado',
          'Verifique a sua caixa de entrada e clique no link de confirmação que enviámos.\n\nNão recebeu? Verifique a pasta de spam.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Erro ao entrar', error.message);
      }
    }
  };

  // ── Cadastro ───────────────────────────────────────────────────────────────
  const handleSignup = async () => {
    if (!fullName || !email || !password) { Alert.alert('Atenção', 'Preencha todos os campos.'); return; }
    if (password.length < 6) { Alert.alert('Atenção', 'A senha deve ter pelo menos 6 caracteres.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Erro ao cadastrar', error.message);
    } else {
      Alert.alert(
        'Cadastro realizado! 🎉',
        'Enviamos um e-mail de confirmação para:\n\n' + email + '\n\nClique no link do e-mail para ativar a sua conta e depois volte aqui para fazer o login.\n\n⚠️ Verifique também a pasta de spam.',
        [{ text: 'OK, entendi!', onPress: () => setMode('login') }]
      );
    }
  };

  // ── Usar código de convite ─────────────────────────────────────────────────
  const handleInviteCode = async () => {
    if (!inviteCode.trim()) { setInviteError('Digite o código de convite.'); return; }
    setLoading(true);
    setInviteError('');

    const { data, error } = await supabase.rpc('use_invite_code', {
      p_code: inviteCode.trim().toUpperCase(),
    });

    setLoading(false);

    if (error || !data?.success) {
      setInviteError(data?.error ?? 'Código inválido ou expirado.');
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
      'Continuar como visitante?',
      'Você poderá inserir o código depois no seu Perfil. Sem o código, o acesso à Área do Membro será limitado.',
      [
        { text: 'Inserir código', style: 'cancel' },
        { text: 'Continuar visitante', onPress: () => supabase.auth.refreshSession() },
      ]
    );
  };

  // ── Reset de senha ─────────────────────────────────────────────────────────
  const handleReset = async () => {
    if (!email) { Alert.alert('Atenção', 'Informe seu e-mail.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) {
      Alert.alert('Erro', error.message);
    } else {
      Alert.alert('E-mail enviado ✅', 'Verifique sua caixa de entrada para redefinir a senha.',
        [{ text: 'OK', onPress: () => setMode('login') }]
      );
    }
  };

  const handleSubmit = () => {
    if (mode === 'login') handleLogin();
    else if (mode === 'signup') handleSignup();
    else if (mode === 'reset') handleReset();
    else if (mode === 'invite') handleInviteCode();
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
                {inviteSuccess ? 'Bem-vindo, membro! 🎉' : 'Código de Convite'}
              </Text>
              <Text style={s.appSub}>
                {inviteSuccess
                  ? 'Seu acesso de membro foi ativado com sucesso!'
                  : 'Digite o código enviado pelo seu líder para ativar o acesso de membro.'
                }
              </Text>
            </View>

            {!inviteSuccess && (
              <View style={s.form}>
                {/* Campo de código */}
                <View style={s.fieldWrap}>
                  <Text style={s.fieldLabel}>Código de Convite</Text>
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
                        <Text style={s.submitBtnText}>Ativar acesso de membro</Text>
                      </>
                  }
                </TouchableOpacity>

                {/* Pular */}
                <TouchableOpacity style={s.skipBtn} onPress={handleSkipInvite}>
                  <Text style={s.skipText}>Não tenho código — continuar como visitante</Text>
                </TouchableOpacity>

                <Text style={s.inviteHint}>
                  💬 Peça o código ao seu pastor ou líder de ministério.
                </Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Tela principal (login / cadastro / reset) ──────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav}>
        <View style={s.inner}>

          {/* Logo */}
          <View style={s.logoWrap}>
            <Image
              source={require('../assets/Peniel Logo.png')}
              style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 16 }}
              resizeMode="cover"
            />
            <Text style={s.appName}>Peniel Church</Text>
            <Text style={s.appSub}>
              {mode === 'login' && 'Entre na sua conta'}
              {mode === 'signup' && 'Crie sua conta'}
              {mode === 'reset' && 'Recuperar senha'}
            </Text>
          </View>

          {/* Formulário */}
          <View style={s.form}>

            {/* Nome — só no cadastro */}
            {mode === 'signup' && (
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>Nome completo</Text>
                <View style={s.fieldRow}>
                  <Ionicons name="person-outline" size={18} color={C.textMuted} style={s.fieldIcon} />
                  <TextInput
                    style={s.fieldInput} placeholder="Seu nome" placeholderTextColor={C.textDim}
                    value={fullName} onChangeText={setFullName} autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {/* E-mail */}
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>E-mail</Text>
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
                <Text style={s.fieldLabel}>Senha</Text>
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
                <Text style={s.forgotText}>Esqueci minha senha</Text>
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
                    {mode === 'login' && 'Entrar'}
                    {mode === 'signup' && 'Criar conta'}
                    {mode === 'reset' && 'Enviar e-mail'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            {/* Alternar modo */}
            <View style={s.switchRow}>
              {mode === 'login' && (
                <>
                  <Text style={s.switchText}>Não tem conta? </Text>
                  <TouchableOpacity onPress={() => setMode('signup')}>
                    <Text style={s.switchLink}>Cadastre-se</Text>
                  </TouchableOpacity>
                </>
              )}
              {mode === 'signup' && (
                <>
                  <Text style={s.switchText}>Já tem conta? </Text>
                  <TouchableOpacity onPress={() => setMode('login')}>
                    <Text style={s.switchLink}>Entrar</Text>
                  </TouchableOpacity>
                </>
              )}
              {mode === 'reset' && (
                <TouchableOpacity onPress={() => setMode('login')}>
                  <Text style={s.switchLink}>← Voltar para o login</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={s.footer}>Peniel Church App · Área do Membro</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  kav: { flex: 1 },
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
  footer: { textAlign: 'center', fontSize: 11, color: C.textDim, marginTop: 40 },
  // Invite
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  errorText: { fontSize: 12, color: C.danger },
  skipBtn: { alignItems: 'center', paddingVertical: 14 },
  skipText: { fontSize: 13, color: C.textMuted, textDecorationLine: 'underline' },
  inviteHint: { fontSize: 12, color: C.textDim, textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
