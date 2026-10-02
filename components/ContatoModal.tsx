import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { useTheme } from '../lib/theme';

const EMAIL_CONTATO = 'info@penielchurch.org.uk';

function paletaContato(isDark: boolean) {
  return isDark ? {
    bg: '#1C1940', text: '#F1EFFA', textMuted: '#A69FD6', border: '#332D5C',
    inputBg: '#241F4D', placeholder: '#726A99',
  } : {
    bg: '#FFFFFF', text: '#1A1A2E', textMuted: '#6B7280', border: '#E5E0D8',
    inputBg: '#F7F4EE', placeholder: '#9CA3AF',
  };
}
type PaletaContato = ReturnType<typeof paletaContato>;

// Substitui os antigos botões "Contato" via WhatsApp (que apontavam pro
// telefone pessoal de alguém). Agora a mensagem é enviada direto pelo app —
// fica salva em `contact_messages`, visível para admin/líder no AdminScreen
// (aba Contato) — com um link de e-mail como alternativa, caso o usuário
// prefira ou o envio pelo app falhe.
export default function ContatoModal({ visible, grupo, grupoNome, cor, mensagemInicial, onClose }: {
  visible: boolean;
  grupo?: string;
  grupoNome?: string;
  cor: string;
  mensagemInicial?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const C = useMemo(() => paletaContato(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setNome((user?.user_metadata as any)?.full_name ?? '');
      setEmail(user?.email ?? '');
      setMensagem(mensagemInicial ?? '');
    }
  }, [visible, mensagemInicial, user]);

  const enviarPeloApp = async () => {
    if (!nome.trim()) { Alert.alert(t('contato.atencao'), t('contato.nomeObrigatorio')); return; }
    if (!mensagem.trim()) { Alert.alert(t('contato.atencao'), t('contato.mensagemObrigatoria')); return; }
    setSaving(true);
    const { error } = await supabase.from('contact_messages').insert({
      user_id: user?.id ?? null,
      nome: nome.trim(),
      email: email.trim() || null,
      grupo: grupo ?? null,
      mensagem: mensagem.trim(),
    });
    setSaving(false);
    if (error) { Alert.alert(t('contato.erroTitulo'), t('contato.erroTexto')); return; }
    Alert.alert(t('contato.sucessoTitulo'), t('contato.sucessoTexto'));
    onClose();
  };

  const enviarPorEmail = () => {
    const assunto = grupoNome ? `Peniel Church App — ${grupoNome}` : 'Peniel Church App';
    const corpo = mensagem.trim() || (nome.trim() ? `${nome.trim()}\n` : '');
    const url = `mailto:${EMAIL_CONTATO}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    Linking.openURL(url).catch(() => Alert.alert(t('contato.erroTitulo'), t('contato.erroEmail')));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '90%' }}>
          <View style={s.sheet}>
            <View style={s.header}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={s.title}>{t('contato.titulo')}</Text>
                <Text style={s.subtitle}>
                  {grupoNome ? t('contato.subtituloGrupo', { grupo: grupoNome }) : t('contato.subtitulo')}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>{t('contato.nome')}</Text>
              <TextInput
                style={s.fieldInput}
                placeholder={t('contato.nomePlaceholder')}
                placeholderTextColor={C.placeholder}
                value={nome}
                onChangeText={setNome}
              />
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>{t('contato.email')}</Text>
              <TextInput
                style={s.fieldInput}
                placeholder={t('contato.emailPlaceholder')}
                placeholderTextColor={C.placeholder}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>{t('contato.mensagem')}</Text>
              <TextInput
                style={[s.fieldInput, { height: 110, textAlignVertical: 'top', paddingTop: 10 }]}
                placeholder={t('contato.mensagemPlaceholder')}
                placeholderTextColor={C.placeholder}
                value={mensagem}
                onChangeText={setMensagem}
                multiline
              />
            </View>

            <TouchableOpacity style={[s.saveBtn, { backgroundColor: cor }, saving && { opacity: 0.7 }]} onPress={enviarPeloApp} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="paper-plane-outline" size={18} color="#fff" /><Text style={s.saveBtnText}>{t('contato.enviar')}</Text></>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={s.emailBtn} onPress={enviarPorEmail}>
              <Ionicons name="mail-outline" size={15} color={C.textMuted} />
              <Text style={s.emailBtnText}>{t('contato.ouEnviarEmail')}</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function buildStyles(C: PaletaContato) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { flexShrink: 1, backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 11, color: C.textMuted, marginTop: 3, lineHeight: 16 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: C.text, backgroundColor: C.inputBg },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 4 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  emailBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  emailBtnText: { fontSize: 13, color: C.textMuted, fontWeight: '600', textDecorationLine: 'underline' },
}); }
