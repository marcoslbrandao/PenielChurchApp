import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Image, Alert, StatusBar, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  color?: string;
}
interface MenuSection { title: string; items: MenuItem[]; }

const C = {
  primary: '#1A1740', primaryLight: '#2D2870',
  accent: '#C8960A', accentLight: '#F5C842',
  bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
  text: '#1A1A2E', textMuted: '#6B7280', textDim: '#9CA3AF',
  border: '#E5E0D8', danger: '#C0392B', success: '#27AE60',
};

// ─── Edit Profile Modal ───────────────────────────────────────────────────────
function EditProfileModal({ visible, profile, userId, onClose, onSaved }: {
  visible: boolean; profile: any; userId: string | undefined;
  onClose: () => void; onSaved: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile, visible]);

  const handleSave = async () => {
    if (!fullName.trim()) { Alert.alert('Atenção', 'Nome é obrigatório.'); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles')
      .update({ full_name: fullName.trim(), phone: phone.trim(), updated_at: new Date().toISOString() })
      .eq('id', userId);
    setSaving(false);
    if (error) { Alert.alert('Erro ao salvar', error.message); return; }
    onSaved(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={em.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={em.sheet}>
            <View style={em.header}>
              <Text style={em.title}>Editar Perfil</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={em.field}>
              <Text style={em.label}>Nome completo</Text>
              <TextInput style={em.input} value={fullName} onChangeText={setFullName}
                placeholder="Seu nome" placeholderTextColor={C.textDim} autoCapitalize="words" />
            </View>
            <View style={em.field}>
              <Text style={em.label}>Telefone / WhatsApp</Text>
              <TextInput style={em.input} value={phone} onChangeText={setPhone}
                placeholder="(11) 99999-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
            </View>
            <TouchableOpacity style={[em.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={em.saveBtnText}>Salvar alterações</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const em = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  field: { marginBottom: 16 },
  label: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15, color: C.text },
  saveBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { user, isLoggedIn } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);

  const fetchProfile = () => {
    if (!user) return;
    setLoadingProfile(true);
    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(({ data }) => { setProfile(data); setLoadingProfile(false); });
  };

  useEffect(() => { fetchProfile(); }, [user]);

  const displayName = profile?.full_name ?? user?.email ?? 'Visitante';
  const displayEmail = user?.email ?? '';
  const initials = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  const handleLogout = () => {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) Alert.alert('Erro', error.message);
      }},
    ]);
  };

  const handleChangePassword = () => {
    if (!user?.email) return;
    Alert.alert(
      'Alterar Senha',
      `Enviaremos um link de redefinição para:\n${user.email}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: async () => {
          const { error } = await supabase.auth.resetPasswordForEmail(user.email!);
          if (error) Alert.alert('Erro', error.message);
          else Alert.alert('E-mail enviado ✅', 'Verifique sua caixa de entrada.');
        }},
      ]
    );
  };

  const handleSupport = () => {
    Linking.openURL('mailto:info@penielchurch.org.uk?subject=Suporte Peniel App');
  };

  const handleAbout = () => {
    Alert.alert(
      'Peniel Church App',
      'Versão 1.0.0\n\nDesenvolvido com ❤️ para a Igreja Peniel Church.\n\nReading, UK',
      [{ text: 'OK' }]
    );
  };

  const sections: MenuSection[] = [
    {
      title: 'Minha Igreja',
      items: [
        { icon: 'book-outline', label: 'Histórico de Estudos', onPress: () => Alert.alert('Em breve', 'Esta funcionalidade estará disponível em breve!') },
        { icon: 'heart-outline', label: 'Pedidos de Oração', onPress: () => Alert.alert('Em breve', 'Esta funcionalidade estará disponível em breve!') },
        { icon: 'gift-outline', label: 'Minhas Ofertas', onPress: () => Alert.alert('Em breve', 'Esta funcionalidade estará disponível em breve!') },
      ],
    },
    {
      title: 'Preferências',
      items: [
        {
          icon: 'notifications-outline', label: 'Notificações',
          rightElement: (
            <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled}
              trackColor={{ false: C.border, true: C.primaryLight }}
              thumbColor={notificationsEnabled ? C.accent : '#fff'} />
          ),
        },
        {
          icon: 'moon-outline', label: 'Modo Escuro',
          rightElement: (
            <Switch value={darkMode} onValueChange={setDarkMode}
              trackColor={{ false: C.border, true: C.primaryLight }}
              thumbColor={darkMode ? C.accent : '#fff'} />
          ),
        },
        { icon: 'language-outline', label: 'Idioma', onPress: () => Alert.alert('Em breve', 'Suporte a mais idiomas em breve!') },
      ],
    },
    {
      title: 'Conta',
      items: [
        { icon: 'person-outline', label: 'Editar Perfil', onPress: () => isLoggedIn ? setEditModalVisible(true) : Alert.alert('Atenção', 'Faça login para editar o perfil.') },
        { icon: 'lock-closed-outline', label: 'Alterar Senha', onPress: () => isLoggedIn ? handleChangePassword() : Alert.alert('Atenção', 'Faça login para alterar a senha.') },
        { icon: 'help-circle-outline', label: 'Suporte', onPress: handleSupport },
      ],
    },
    {
      title: 'Sobre',
      items: [
        { icon: 'information-circle-outline', label: 'Sobre o App', onPress: handleAbout },
        { icon: 'document-text-outline', label: 'Termos de Uso', onPress: () => Linking.openURL('https://penielchurch.com/termos') },
        ...(isLoggedIn ? [{
          icon: 'log-out-outline' as keyof typeof Ionicons.glyphMap,
          label: 'Sair', color: C.danger, onPress: handleLogout,
        }] : []),
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Perfil</Text>
        {isLoggedIn && (
          <TouchableOpacity style={styles.editBtn} onPress={() => setEditModalVisible(true)}>
            <Ionicons name="pencil-outline" size={20} color={C.accentLight} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                {loadingProfile ? <ActivityIndicator color="#fff" /> : <Text style={styles.avatarInitials}>{initials}</Text>}
              </View>
            )}
            <TouchableOpacity style={styles.avatarCameraBtn} onPress={() => Alert.alert('Em breve', 'Upload de foto em breve!')}>
              <Ionicons name="camera" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userEmail}>{displayEmail}</Text>
          {profile?.phone && <Text style={styles.userPhone}>{profile.phone}</Text>}
          <View style={styles.badges}>
            {isLoggedIn ? (
              <>
                <View style={[styles.badge, { backgroundColor: '#E8F5E9' }]}>
                  <Ionicons name="checkmark-circle-outline" size={12} color={C.success} />
                  <Text style={[styles.badgeText, { color: C.success }]}>
                    {profile?.role === 'lider' ? 'Líder' : profile?.role === 'admin' ? 'Admin' : 'Membro'}
                  </Text>
                </View>
                {profile?.baptized && (
                  <View style={styles.badge}>
                    <Ionicons name="water-outline" size={12} color={C.primary} />
                    <Text style={styles.badgeText}>Batizado</Text>
                  </View>
                )}
              </>
            ) : (
              <View style={[styles.badge, { backgroundColor: '#F3F4F6' }]}>
                <Ionicons name="person-outline" size={12} color={C.textMuted} />
                <Text style={[styles.badgeText, { color: C.textMuted }]}>Visitante</Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[{ value: '—', label: 'Estudos' }, { value: '—', label: 'Eventos' }, { value: '—', label: 'Orações' }].map(stat => (
            <View key={stat.label} style={styles.statItem}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Login CTA */}
        {!isLoggedIn && (
          <View style={styles.loginCta}>
            <Ionicons name="lock-closed-outline" size={20} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.loginCtaTitle}>Área do Membro</Text>
              <Text style={styles.loginCtaSub}>Acesse na aba Membros para fazer login</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
          </View>
        )}

        {/* Menu */}
        {sections.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuItem, idx < section.items.length - 1 && styles.menuItemBorder]}
                  onPress={item.onPress}
                  activeOpacity={item.rightElement ? 1 : 0.7}
                  disabled={!item.onPress && !item.rightElement}
                >
                  <Ionicons name={item.icon} size={20} color={item.color ?? C.primary} style={styles.menuIcon} />
                  <Text style={[styles.menuLabel, item.color && { color: item.color }]}>{item.label}</Text>
                  <View style={styles.menuRight}>
                    {item.rightElement ?? (item.onPress && <Ionicons name="chevron-forward" size={16} color={C.textMuted} />)}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.version}>Peniel Church App v1.0.0</Text>
      </ScrollView>

      <EditProfileModal
        visible={editModalVisible}
        profile={profile}
        userId={user?.id}
        onClose={() => setEditModalVisible(false)}
        onSaved={fetchProfile}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: C.primary },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },
  editBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(248,200,66,0.4)', alignItems: 'center', justifyContent: 'center' },
  scroll: { backgroundColor: C.bg, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', paddingTop: 32, paddingBottom: 24, backgroundColor: C.primary, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  avatarWrapper: { position: 'relative', marginBottom: 14 },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: C.accentLight },
  avatarFallback: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.primaryLight, borderWidth: 3, borderColor: C.accentLight, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 30, fontWeight: '700', color: '#FFFFFF' },
  avatarCameraBtn: { position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  userEmail: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  userPhone: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#EEF4FF', borderRadius: 20 },
  badgeText: { fontSize: 12, color: C.primary, fontWeight: '600' },
  statsRow: { flexDirection: 'row', marginHorizontal: 20, marginTop: 12, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRightWidth: 1, borderRightColor: C.border },
  statValue: { fontSize: 22, fontWeight: '700', color: C.primary },
  statLabel: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  loginCta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 12, backgroundColor: C.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  loginCtaTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  loginCtaSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  sectionCard: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  menuIcon: { marginRight: 14 },
  menuLabel: { flex: 1, fontSize: 15, color: C.text, fontWeight: '400' },
  menuRight: { marginLeft: 8 },
  version: { textAlign: 'center', fontSize: 12, color: C.textMuted, marginTop: 32 },
});
