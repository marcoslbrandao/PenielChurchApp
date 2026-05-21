import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, StatusBar, ActivityIndicator,
  Share, RefreshControl, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { useBirthdays } from '../lib/useBirthdays';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
  border: '#E5E0D8', primary: '#1A1740', accent: '#F5C842',
  accentDim: '#7A6010', text: '#1A1A2E', textMuted: '#6B7280',
  textDim: '#9CA3AF', danger: '#C0392B', success: '#27AE60',
  purple: '#7C4DFF', purpleDim: '#3D2578',
};

// ─── Types ────────────────────────────────────────────────────────────────────
type InviteCode = {
  id: string; code: string; assigned_to_email: string | null;
  is_used: boolean; used_at: string | null; expires_at: string | null;
  created_at: string;
};

type Stats = {
  total: number; membros: number; lideres: number; visitantes: number; admins: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `PENIEL-${part1}-${part2}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

// ─── Novo Convite Modal ───────────────────────────────────────────────────────
function NovoConviteModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [email, setEmail] = useState('');
  const [days, setDays] = useState('30');
  const [code] = useState(generateCode());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(days || 30));

    const { error } = await supabase.from('invite_codes').insert({
      code,
      assigned_to_email: email.trim() || null,
      expires_at: expiresAt.toISOString(),
    });

    setSaving(false);
    if (error) { Alert.alert('Erro', error.message); return; }

    // Compartilhar o código
    await Share.share({
      message: `🔑 Seu convite para o app Peniel Church:\n\nCódigo: ${code}\n\nAbra o app, vá em Membros e insira este código para ativar seu acesso.\n\nVálido por ${days} dias.`,
      title: 'Convite Peniel Church',
    });

    setEmail('');
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.overlay}>
        <View style={mo.sheet}>
          <View style={mo.header}>
            <Text style={mo.title}>Novo Convite</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Código gerado */}
          <View style={mo.codeBox}>
            <Text style={mo.codeLabel}>Código gerado automaticamente</Text>
            <Text style={mo.code}>{code}</Text>
          </View>

          {/* Email (opcional) */}
          <View style={mo.fieldWrap}>
            <Text style={mo.fieldLabel}>E-mail do convidado (opcional)</Text>
            <View style={mo.fieldRow}>
              <Ionicons name="mail-outline" size={16} color={C.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={mo.fieldInput} placeholder="email@exemplo.com"
                placeholderTextColor={C.textDim} value={email}
                onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
              />
            </View>
          </View>

          {/* Validade */}
          <View style={mo.fieldWrap}>
            <Text style={mo.fieldLabel}>Válido por (dias)</Text>
            <View style={mo.daysRow}>
              {['7', '15', '30', '60'].map(d => (
                <TouchableOpacity
                  key={d}
                  style={[mo.dayPill, days === d && mo.dayPillActive]}
                  onPress={() => setDays(d)}
                >
                  <Text style={[mo.dayPillText, days === d && mo.dayPillTextActive]}>{d}d</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={[mo.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <><Ionicons name="share-outline" size={18} color="#fff" /><Text style={mo.saveBtnText}>Criar e Compartilhar</Text></>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const mo = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  codeBox: { backgroundColor: C.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 20 },
  codeLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  code: { fontSize: 22, fontWeight: '800', color: C.accent, letterSpacing: 3 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, height: 46 },
  fieldInput: { flex: 1, fontSize: 15, color: C.text },
  daysRow: { flexDirection: 'row', gap: 8 },
  dayPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  dayPillActive: { backgroundColor: C.primary, borderColor: C.primary },
  dayPillText: { fontSize: 13, color: C.textMuted, fontWeight: '600' },
  dayPillTextActive: { color: '#fff', fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.purple, borderRadius: 12, paddingVertical: 14 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminScreen() {
  const { user } = useAuth();
  const { todayBirthdays, monthBirthdays } = useBirthdays();
  const [role, setRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [stats, setStats] = useState<Stats>({ total: 0, membros: 0, lideres: 0, visitantes: 0, admins: 0 });
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'convites' | 'stats'>('convites');

  // Verifica role
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('role').eq('id', user.id).single()
      .then(({ data }) => { setRole(data?.role ?? null); setLoadingRole(false); });
  }, [user]);

  const fetchData = useCallback(async () => {
    // Stats de membros
    const { data: profiles } = await supabase.from('profiles').select('role');
    if (profiles) {
      setStats({
        total: profiles.length,
        membros: profiles.filter(p => p.role === 'membro').length,
        lideres: profiles.filter(p => p.role === 'lider').length,
        visitantes: profiles.filter(p => p.role === 'visitante').length,
        admins: profiles.filter(p => p.role === 'admin').length,
      });
    }
    // Convites
    const { data: inviteData } = await supabase
      .from('invite_codes').select('*').order('created_at', { ascending: false });
    if (inviteData) setInvites(inviteData as InviteCode[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { if (!loadingRole && role) fetchData(); }, [loadingRole, role, fetchData]);

  const deleteInvite = (id: string) => {
    Alert.alert('Remover Convite', 'Deseja remover este código?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await supabase.from('invite_codes').delete().eq('id', id);
        fetchData();
      }},
    ]);
  };

  const shareInvite = async (code: string) => {
    await Share.share({
      message: `🔑 Convite Peniel Church:\n\nCódigo: ${code}\n\nAbra o app e insira este código na Área do Membro para ativar seu acesso.`,
    });
  };

  // Loading
  if (loadingRole) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Acesso negado
  if (role !== 'admin' && role !== 'lider') {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Admin</Text>
        </View>
        <View style={s.denied}>
          <Ionicons name="lock-closed-outline" size={48} color={C.textDim} />
          <Text style={s.deniedTitle}>Acesso Restrito</Text>
          <Text style={s.deniedSub}>Esta área é exclusiva para líderes e administradores.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Painel Admin</Text>
          <Text style={s.headerSub}>{role === 'admin' ? 'Administrador' : 'Líder'}</Text>
        </View>
        <TouchableOpacity style={s.newBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={18} color={C.primary} />
          <Text style={s.newBtnText}>Novo Convite</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {(['convites', 'stats'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tabBtn, activeTab === tab && s.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Ionicons
              name={tab === 'convites' ? 'ticket-outline' : 'bar-chart-outline'}
              size={16}
              color={activeTab === tab ? C.purple : C.textMuted}
            />
            <Text style={[s.tabBtnText, activeTab === tab && { color: C.purple, fontWeight: '700' }]}>
              {tab === 'convites' ? 'Convites' : 'Estatísticas'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
        >

          {/* ══ CONVITES ══════════════════════════════════════════════════════ */}
          {activeTab === 'convites' && (
            <>
              {/* Summary */}
              <View style={s.summaryRow}>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.success }]}>{invites.filter(i => !i.is_used).length}</Text>
                  <Text style={s.summaryLabel}>Disponíveis</Text>
                </View>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.textMuted }]}>{invites.filter(i => i.is_used).length}</Text>
                  <Text style={s.summaryLabel}>Usados</Text>
                </View>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.purple }]}>{invites.length}</Text>
                  <Text style={s.summaryLabel}>Total</Text>
                </View>
              </View>

              {invites.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="ticket-outline" size={40} color={C.textDim} />
                  <Text style={s.emptyText}>Nenhum convite gerado ainda</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => setModalVisible(true)}>
                    <Text style={s.emptyBtnText}>Criar primeiro convite</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                invites.map(invite => (
                  <View key={invite.id} style={[s.inviteCard, invite.is_used && s.inviteCardUsed]}>
                    <View style={s.inviteLeft}>
                      <Text style={[s.inviteCode, invite.is_used && { color: C.textMuted }]}>
                        {invite.code}
                      </Text>
                      {invite.assigned_to_email && (
                        <View style={s.inviteEmailRow}>
                          <Ionicons name="mail-outline" size={12} color={C.textMuted} />
                          <Text style={s.inviteEmail}>{invite.assigned_to_email}</Text>
                        </View>
                      )}
                      <View style={s.inviteMetaRow}>
                        {invite.is_used ? (
                          <View style={[s.statusBadge, { backgroundColor: C.textMuted + '20' }]}>
                            <Text style={[s.statusBadgeText, { color: C.textMuted }]}>✓ Usado em {formatDate(invite.used_at)}</Text>
                          </View>
                        ) : (
                          <View style={[s.statusBadge, { backgroundColor: C.success + '18' }]}>
                            <Text style={[s.statusBadgeText, { color: C.success }]}>Disponível · expira {formatDate(invite.expires_at)}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={s.inviteActions}>
                      {!invite.is_used && (
                        <TouchableOpacity style={s.actionBtn} onPress={() => shareInvite(invite.code)}>
                          <Ionicons name="share-outline" size={16} color={C.purple} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[s.actionBtn, { borderColor: C.danger + '40' }]} onPress={() => deleteInvite(invite.id)}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ══ ESTATÍSTICAS ══════════════════════════════════════════════════ */}
          {activeTab === 'stats' && (
            <>
              <Text style={s.sectionLabel}>Usuários do App</Text>
              <View style={s.statsGrid}>
                {[
                  { label: 'Total', value: stats.total, icon: 'people-outline', color: C.primary },
                  { label: 'Membros', value: stats.membros, icon: 'person-outline', color: C.success },
                  { label: 'Líderes', value: stats.lideres, icon: 'star-outline', color: C.accent },
                  { label: 'Visitantes', value: stats.visitantes, icon: 'eye-outline', color: C.textMuted },
                ].map(stat => (
                  <View key={stat.label} style={s.statCard}>
                    <View style={[s.statIcon, { backgroundColor: stat.color + '18' }]}>
                      <Ionicons name={stat.icon as any} size={22} color={stat.color} />
                    </View>
                    <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
                    <Text style={s.statLabel}>{stat.label}</Text>
                  </View>
                ))}
              </View>

              <Text style={[s.sectionLabel, { marginTop: 24 }]}>Convites</Text>
              <View style={s.inviteStatsCard}>
                <View style={s.inviteStatRow}>
                  <Text style={s.inviteStatLabel}>Total gerados</Text>
                  <Text style={s.inviteStatValue}>{invites.length}</Text>
                </View>
                <View style={s.inviteStatRow}>
                  <Text style={s.inviteStatLabel}>Utilizados</Text>
                  <Text style={[s.inviteStatValue, { color: C.success }]}>{invites.filter(i => i.is_used).length}</Text>
                </View>
                <View style={[s.inviteStatRow, { borderBottomWidth: 0 }]}>
                  <Text style={s.inviteStatLabel}>Disponíveis</Text>
                  <Text style={[s.inviteStatValue, { color: C.purple }]}>{invites.filter(i => !i.is_used).length}</Text>
                </View>
              </View>

              {/* Taxa de conversão */}
              {invites.length > 0 && (
                <View style={s.conversionCard}>
                  <Text style={s.conversionLabel}>Taxa de ativação</Text>
                  <Text style={s.conversionValue}>
                    {Math.round((invites.filter(i => i.is_used).length / invites.length) * 100)}%
                  </Text>
                  <Text style={s.conversionSub}>dos convites foram utilizados</Text>
                </View>
              )}

              {/* Aniversários do mês */}
              <Text style={[s.sectionLabel, { marginTop: 24 }]}>🎂 Aniversários do Mês</Text>
              {monthBirthdays.length === 0 ? (
                <View style={[s.empty, { paddingVertical: 24 }]}>
                  <Text style={s.emptyText}>Nenhum aniversário este mês</Text>
                </View>
              ) : (
                monthBirthdays.map(member => {
                  const [y, m, d] = member.data_nascimento.split('-');
                  const isToday = new Date().getDate() === Number(d) && new Date().getMonth() + 1 === Number(m);
                  return (
                    <View key={member.id} style={[s.birthdayCard, isToday && s.birthdayCardToday]}>
                      <View style={[s.bdAvatar, isToday && { backgroundColor: '#F5C842' + '30' }]}>
                        <Text style={[s.bdAvatarText, isToday && { color: '#F5C842' }]}>
                          {member.nome[0]}{member.sobrenome?.[0] ?? ''}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.bdName}>{member.nome} {member.sobrenome}</Text>
                        <Text style={s.bdDate}>
                          {isToday ? '🎉 Hoje!' : `Dia ${d}`} · {member.idade} anos
                        </Text>
                      </View>
                      {isToday && (
                        <View style={s.todayBadge}>
                          <Text style={s.todayBadgeText}>Hoje</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      )}

      <NovoConviteModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSaved={fetchData}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: C.primary },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accent, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  newBtnText: { fontSize: 13, fontWeight: '700', color: C.primary },
  tabRow: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: C.purple },
  tabBtnText: { fontSize: 14, color: C.textMuted, fontWeight: '500' },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  // Summary
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  summaryNum: { fontSize: 28, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  // Invite cards
  inviteCard: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'flex-start' },
  inviteCardUsed: { opacity: 0.6 },
  inviteLeft: { flex: 1 },
  inviteCode: { fontSize: 16, fontWeight: '800', color: C.primary, letterSpacing: 1, marginBottom: 6 },
  inviteEmailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  inviteEmail: { fontSize: 12, color: C.textMuted },
  inviteMetaRow: { flexDirection: 'row' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  inviteActions: { flexDirection: 'row', gap: 8, marginLeft: 8 },
  actionBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '47%', backgroundColor: C.surface, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 30, fontWeight: '800' },
  statLabel: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  inviteStatsCard: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 12 },
  inviteStatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  inviteStatLabel: { fontSize: 14, color: C.text },
  inviteStatValue: { fontSize: 18, fontWeight: '700', color: C.text },
  conversionCard: { backgroundColor: C.purple + '12', borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: C.purple + '30' },
  conversionLabel: { fontSize: 12, color: C.purple, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  conversionValue: { fontSize: 48, fontWeight: '800', color: C.purple, marginVertical: 4 },
  conversionSub: { fontSize: 13, color: C.textMuted },
  // Empty
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, color: C.textMuted },
  emptyBtn: { backgroundColor: C.purple, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20 },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  // Denied
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  deniedTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  deniedSub: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 22 },
  // Birthday
  birthdayCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  birthdayCardToday: { borderColor: '#F5C842', backgroundColor: '#FFFBEB' },
  bdAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.purple + '18', alignItems: 'center', justifyContent: 'center' },
  bdAvatarText: { fontSize: 15, fontWeight: '800', color: C.purple },
  bdName: { fontSize: 14, fontWeight: '700', color: C.text },
  bdDate: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  todayBadge: { backgroundColor: '#F5C842', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  todayBadgeText: { fontSize: 11, fontWeight: '800', color: C.primary },
});
