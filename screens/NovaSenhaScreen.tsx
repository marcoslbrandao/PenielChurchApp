import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

const C = {
  bg: '#1A1740', surface: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.15)',
  text: '#fff', textMuted: 'rgba(255,255,255,0.5)', accent: '#F5C842',
};

export default function NovaSenhaScreen({ navigation }: { navigation?: any }) {
  const { t } = useTranslation();
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSalvar = async () => {
    if (senha.length < 6) { Alert.alert(t('common.atencao'), t('novaSenha.senhaMinima')); return; }
    if (senha !== confirmar) { Alert.alert(t('common.atencao'), t('novaSenha.senhasNaoCoincidem')); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    Alert.alert(t('novaSenha.senhaAtualizada'), t('novaSenha.senhaAtualizadaMsg'), [
      { text: t('common.ok'), onPress: () => navigation?.reset?.({ index: 0, routes: [{ name: 'MainTabs' }] }) ?? navigation?.navigate?.('MainTabs') },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.inner}>
          <View style={s.iconRing}>
            <Ionicons name="lock-open-outline" size={32} color={C.accent} />
          </View>
          <Text style={s.title}>{t('novaSenha.titulo')}</Text>
          <Text style={s.sub}>{t('novaSenha.subtitulo')}</Text>

          <TextInput
            style={s.input} placeholder={t('novaSenha.novaSenhaPlaceholder')} placeholderTextColor={C.textMuted}
            value={senha} onChangeText={setSenha} secureTextEntry autoFocus
          />
          <TextInput
            style={s.input} placeholder={t('novaSenha.confirmarSenhaPlaceholder')} placeholderTextColor={C.textMuted}
            value={confirmar} onChangeText={setConfirmar} secureTextEntry
          />

          <TouchableOpacity style={[s.btn, saving && { opacity: 0.7 }]} onPress={handleSalvar} disabled={saving}>
            {saving ? <ActivityIndicator color="#1A1740" /> : <Text style={s.btnText}>{t('novaSenha.salvarNovaSenha')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconRing: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(245,200,66,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 6 },
  sub: { fontSize: 14, color: C.textMuted, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  input: { width: '100%', height: 50, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, color: C.text, marginBottom: 12 },
  btn: { width: '100%', backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#1A1740' },
});
