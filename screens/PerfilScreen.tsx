import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Image, Alert, StatusBar, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';
import { useAcesso } from '../lib/acesso';
import { IDIOMAS, trocarIdioma } from '../lib/i18n';
import { useTheme, ThemeMode } from '../lib/theme';

// Versão real do app.json (não mais um texto fixo desatualizado), + info de
// qual atualização OTA (EAS Update) está rodando agora — útil pra confirmar
// se uma atualização remota já chegou nesse aparelho ou não.
const APP_VERSION = Constants.expoConfig?.version ?? '—';
function infoAtualizacaoOTA(): string {
  if (Updates.isEmbeddedLaunch || !Updates.createdAt) {
    return 'Sem atualização remota aplicada (versão instalada da loja)';
  }
  const data = new Date(Updates.createdAt);
  const dataFormatada = data.toLocaleDateString('pt-BR');
  const horaFormatada = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Atualizado remotamente em ${dataFormatada} às ${horaFormatada}`;
}

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  color?: string;
}
interface MenuSection { title: string; items: MenuItem[]; }

// Paleta calculada a partir do tema global (claro/escuro/sistema) — os
// mesmos nomes de campo de sempre, só que agora com uma variante escura.
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

// ─── Edit Profile Modal ───────────────────────────────────────────────────────
function EditProfileModal({ visible, profile, userId, onClose, onSaved }: {
  visible: boolean; profile: any; userId: string | undefined;
  onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const em = useMemo(() => buildEm(C), [C]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile, visible]);

  const handleSave = async () => {
    if (!fullName.trim()) { Alert.alert(t('common.atencao'), t('perfil.nomeObrigatorio')); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles')
      .update({ full_name: fullName.trim(), phone: phone.trim(), updated_at: new Date().toISOString() })
      .eq('id', userId);
    setSaving(false);
    if (error) { Alert.alert(t('biblia.erroAoSalvar'), error.message); return; }
    onSaved(); onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={em.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={em.sheet}>
            <View style={em.header}>
              <Text style={em.title}>{t('perfil.editarPerfil')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={em.field}>
              <Text style={em.label}>{t('auth.nomeCompleto')}</Text>
              <TextInput style={em.input} value={fullName} onChangeText={setFullName}
                placeholder={t('auth.seuNome')} placeholderTextColor={C.textDim} autoCapitalize="words" />
            </View>
            <View style={em.field}>
              <Text style={em.label}>{t('perfil.telefoneWhatsapp')}</Text>
              <TextInput style={em.input} value={phone} onChangeText={setPhone}
                placeholder={t('perfil.telefoneExemplo')} placeholderTextColor={C.textDim} keyboardType="phone-pad" />
            </View>
            <TouchableOpacity style={[em.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={em.saveBtnText}>{t('perfil.salvarAlteracoes')}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function buildEm(C: Paleta) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  field: { marginBottom: 16 },
  label: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15, color: C.text },
  saveBtn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
}); }

// ─── List modal styles (compartilhado entre os modais abaixo) ────────────────
function buildLm(C: Paleta) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '82%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
  item: { backgroundColor: C.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  itemTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  itemText: { fontSize: 13, color: C.text, lineHeight: 19, fontStyle: 'italic', flex: 1, marginRight: 8 },
  itemRef: { fontSize: 12, fontWeight: '700', color: C.accent, marginTop: 6 },
  itemMeta: { fontSize: 11, color: C.textMuted, marginTop: 4 },
  deleteBtn: { padding: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, marginBottom: 14 },
  addBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.text, marginBottom: 12 },
  textarea: { height: 100, textAlignVertical: 'top' },
  totalCard: { backgroundColor: C.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16 },
  totalLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  totalValue: { fontSize: 28, fontWeight: '800', color: C.accentLight, marginTop: 4 },
}); }

// ─── Versículos Salvos ────────────────────────────────────────────────────────
function SavedVersesModal({ visible, userId, onClose }: {
  visible: boolean; userId: string | undefined; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const lm = useMemo(() => buildLm(C), [C]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = () => {
    if (!userId) return;
    setLoading(true);
    supabase.from('saved_verses').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      .then(({ data }) => { setItems(data ?? []); setLoading(false); });
  };

  useEffect(() => { if (visible) fetchItems(); }, [visible, userId]);

  const handleDelete = (id: string) => {
    Alert.alert(t('common.remover'), t('perfil.removerVersiculoConfirm'), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('common.remover'), style: 'destructive', onPress: async () => {
        await supabase.from('saved_verses').delete().eq('id', id);
        fetchItems();
      }},
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={lm.overlay}>
        <View style={lm.sheet}>
          <View style={lm.header}>
            <Text style={lm.title}>{t('perfil.versiculosSalvos')}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator color={C.primary} style={{ marginVertical: 30 }} />
            ) : items.length === 0 ? (
              <View style={lm.empty}>
                <Ionicons name="bookmark-outline" size={40} color={C.textDim} />
                <Text style={lm.emptyText}>{t('perfil.nenhumVersiculoSalvo')}</Text>
              </View>
            ) : (
              items.map(v => (
                <View key={v.id} style={lm.item}>
                  <View style={lm.itemTopRow}>
                    <Text style={lm.itemText}>"{v.texto}"</Text>
                    <TouchableOpacity style={lm.deleteBtn} onPress={() => handleDelete(v.id)}>
                      <Ionicons name="trash-outline" size={16} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                  <Text style={lm.itemRef}>{v.referencia} · {v.versao}</Text>
                </View>
              ))
            )}
            <View style={{ height: 10 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Histórico de Estudos ─────────────────────────────────────────────────────
function ReadingHistoryModal({ visible, userId, onClose }: {
  visible: boolean; userId: string | undefined; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const lm = useMemo(() => buildLm(C), [C]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true);
    supabase.from('reading_history').select('*').eq('user_id', userId).order('lido_em', { ascending: false }).limit(100)
      .then(({ data }) => { setItems(data ?? []); setLoading(false); });
  }, [visible, userId]);

  const formatarData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={lm.overlay}>
        <View style={lm.sheet}>
          <View style={lm.header}>
            <Text style={lm.title}>{t('perfil.historicoDeEstudos')}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator color={C.primary} style={{ marginVertical: 30 }} />
            ) : items.length === 0 ? (
              <View style={lm.empty}>
                <Ionicons name="book-outline" size={40} color={C.textDim} />
                <Text style={lm.emptyText}>{t('perfil.nenhumaLeituraAinda')}</Text>
              </View>
            ) : (
              items.map(r => (
                <View key={r.id} style={lm.item}>
                  <Text style={[lm.itemText, { fontStyle: 'normal', fontWeight: '700' }]}>{r.livro} {r.capitulo}</Text>
                  <Text style={lm.itemMeta}>{r.versao} · {formatarData(r.lido_em)}</Text>
                </View>
              ))
            )}
            <View style={{ height: 10 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Pedidos de Oração ────────────────────────────────────────────────────────
function PrayerRequestsModal({ visible, userId, onClose }: {
  visible: boolean; userId: string | undefined; onClose: () => void;
}) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const lm = useMemo(() => buildLm(C), [C]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchItems = () => {
    if (!userId) return;
    setLoading(true);
    supabase.from('prayer_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      .then(({ data }) => { setItems(data ?? []); setLoading(false); });
  };

  useEffect(() => { if (visible) { fetchItems(); setShowForm(false); } }, [visible, userId]);

  const handleSubmit = async () => {
    if (!titulo.trim() || !descricao.trim()) { Alert.alert(t('common.atencao'), t('perfil.preenchaTituloPedido')); return; }
    setSaving(true);
    const { error } = await supabase.from('prayer_requests').insert({
      user_id: userId, titulo: titulo.trim(), descricao: descricao.trim(),
    });
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    setTitulo(''); setDescricao(''); setShowForm(false);
    fetchItems();
  };

  const statusInfo = (status: string) =>
    status === 'respondido' ? { bg: '#E8F5E9', text: C.success, label: t('perfil.statusRespondido') } :
    status === 'em_oracao'  ? { bg: '#FFF6DC', text: '#B8860B', label: t('perfil.statusEmOracao') } :
                               { bg: '#EEF4FF', text: C.primary, label: t('perfil.statusAberto') };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={lm.overlay}>
        <View style={lm.sheet}>
          <View style={lm.header}>
            <Text style={lm.title}>{t('perfil.pedidosDeOracao')}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
          </View>

          {showForm ? (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <Text style={lm.emptyText}>{t('perfil.pedidoPrivadoAviso')}</Text>
              <View style={{ height: 12 }} />
              <TextInput style={lm.input} placeholder={t('perfil.tituloPlaceholderOracao')} placeholderTextColor={C.textDim}
                value={titulo} onChangeText={setTitulo} />
              <TextInput style={[lm.input, lm.textarea]} placeholder={t('perfil.descricaoPlaceholderOracao')} placeholderTextColor={C.textDim}
                value={descricao} onChangeText={setDescricao} multiline />
              <TouchableOpacity style={[lm.addBtn, saving && { opacity: 0.7 }]} onPress={handleSubmit} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={lm.addBtnText}>{t('perfil.enviarPedido')}</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowForm(false)} style={{ alignItems: 'center', marginTop: -4, marginBottom: 8 }}>
                <Text style={{ color: C.textMuted, fontSize: 13 }}>{t('common.cancelar')}</Text>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          ) : (
            <>
              <TouchableOpacity style={lm.addBtn} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={lm.addBtnText}>{t('perfil.novoPedido')}</Text>
              </TouchableOpacity>
              <ScrollView showsVerticalScrollIndicator={false}>
                {loading ? (
                  <ActivityIndicator color={C.primary} style={{ marginVertical: 30 }} />
                ) : items.length === 0 ? (
                  <View style={lm.empty}>
                    <Ionicons name="heart-outline" size={40} color={C.textDim} />
                    <Text style={lm.emptyText}>{t('perfil.nenhumPedidoOracao')}</Text>
                  </View>
                ) : (
                  items.map(p => {
                    const si = statusInfo(p.status);
                    return (
                      <View key={p.id} style={lm.item}>
                        <Text style={[lm.itemText, { fontStyle: 'normal', fontWeight: '700' }]}>{p.titulo}</Text>
                        <Text style={[lm.itemText, { marginTop: 4, fontStyle: 'normal' }]}>{p.descricao}</Text>
                        <View style={[lm.statusBadge, { backgroundColor: si.bg }]}>
                          <Text style={[lm.statusBadgeText, { color: si.text }]}>{si.label}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
                <View style={{ height: 10 }} />
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Language Picker Modal ──────────────────────────────────────────────────
function LanguagePickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const lang = useMemo(() => buildLang(C), [C]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={lang.overlay}>
        <View style={lang.sheet}>
          <View style={lang.header}>
            <Text style={lang.title}>{t('perfil.escolherIdioma')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          {IDIOMAS.map(idioma => (
            <TouchableOpacity
              key={idioma.codigo}
              style={[lang.opcao, i18n.language === idioma.codigo && lang.opcaoAtiva]}
              onPress={async () => { await trocarIdioma(idioma.codigo); onClose(); }}
            >
              <Text style={lang.bandeira}>{idioma.bandeira}</Text>
              <Text style={[lang.opcaoTexto, i18n.language === idioma.codigo && lang.opcaoTextoAtiva]}>{idioma.label}</Text>
              {i18n.language === idioma.codigo && <Ionicons name="checkmark-circle" size={20} color={C.accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function buildLang(C: Paleta) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  opcaoAtiva: { backgroundColor: C.surfaceAlt },
  bandeira: { fontSize: 22 },
  opcaoTexto: { flex: 1, fontSize: 15, color: C.text, fontWeight: '500' },
  opcaoTextoAtiva: { fontWeight: '700' },
}); }

// ─── Tema (Claro / Escuro / Automático) ──────────────────────────────────────
function ThemeModePickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { mode, setMode, isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const lang = useMemo(() => buildLang(C), [C]);

  const opcoes: { valor: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { valor: 'light', label: t('perfil.temaClaro'), icon: 'sunny-outline' },
    { valor: 'dark', label: t('perfil.temaEscuro'), icon: 'moon-outline' },
    { valor: 'system', label: t('perfil.temaAutomatico'), icon: 'phone-portrait-outline' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={lang.overlay}>
        <View style={lang.sheet}>
          <View style={lang.header}>
            <Text style={lang.title}>{t('perfil.escolherTema')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          {opcoes.map(op => (
            <TouchableOpacity
              key={op.valor}
              style={[lang.opcao, mode === op.valor && lang.opcaoAtiva]}
              onPress={() => { setMode(op.valor); onClose(); }}
            >
              <Ionicons name={op.icon} size={20} color={mode === op.valor ? C.accent : C.textMuted} />
              <Text style={[lang.opcaoTexto, mode === op.valor && lang.opcaoTextoAtiva]}>{op.label}</Text>
              {mode === op.valor && <Ionicons name="checkmark-circle" size={20} color={C.accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ─── Excluir Conta ────────────────────────────────────────────────────────────
// Exigido pela App Store (Guideline 5.1.1(v)): apps com criação de conta
// precisam oferecer exclusão de conta dentro do próprio app. Dupla
// confirmação (digitar a palavra + Alert final) evita exclusão acidental,
// mas o fluxo inteiro acontece dentro do app, sem depender de suporte.
function DeleteAccountModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const em = useMemo(() => buildEm(C), [C]);
  const dam = useMemo(() => buildDam(C), [C]);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const palavraConfirmacao = t('perfil.excluirPalavraConfirmacao');

  useEffect(() => { if (visible) setConfirmText(''); }, [visible]);

  const podeExcluir = confirmText.trim().toUpperCase() === palavraConfirmacao.toUpperCase();

  const handleDelete = () => {
    Alert.alert(
      t('perfil.excluirContaTitulo'),
      t('perfil.excluirContaConfirmacaoFinal'),
      [
        { text: t('common.cancelar'), style: 'cancel' },
        {
          text: t('perfil.excluirBtn'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { data, error } = await supabase.functions.invoke('delete-account');
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              await supabase.auth.signOut();
              onClose();
              // Espera o modal terminar de fechar antes de abrir o Alert nativo —
              // apresentar os dois ao mesmo tempo (Modal ainda animando + Alert
              // novo) crasha no iOS ("present view controller while a
              // presentation is in progress").
              setTimeout(() => {
                Alert.alert(t('perfil.contaExcluidaTitulo'), t('perfil.contaExcluidaMsg'));
              }, 400);
            } catch (err: any) {
              Alert.alert(t('common.erro'), err.message ?? t('common.tenteNovamente'));
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={em.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={em.sheet}>
            <View style={em.header}>
              <Text style={em.title}>{t('perfil.excluirConta')}</Text>
              <TouchableOpacity onPress={onClose} disabled={deleting}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={dam.warningBox}>
              <Ionicons name="warning-outline" size={20} color="#922B21" />
              <Text style={dam.warningText}>{t('perfil.excluirContaAviso')}</Text>
            </View>

            <View style={em.field}>
              <Text style={em.label}>{t('perfil.excluirDigitePalavra', { palavra: palavraConfirmacao })}</Text>
              <TextInput
                style={em.input}
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder={palavraConfirmacao}
                placeholderTextColor={C.textDim}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleting}
              />
            </View>

            <TouchableOpacity
              style={[dam.dangerBtn, (!podeExcluir || deleting) && dam.dangerBtnDisabled]}
              onPress={handleDelete}
              disabled={!podeExcluir || deleting}
            >
              {deleting ? <ActivityIndicator color="#fff" /> : <Text style={dam.dangerBtnText}>{t('perfil.excluirContaPermanentemente')}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function buildDam(_C: Paleta) { return StyleSheet.create({
  warningBox: { backgroundColor: '#FDEDEC', borderRadius: 12, padding: 14, marginBottom: 18, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  warningText: { flex: 1, fontSize: 13, color: '#922B21', lineHeight: 19 },
  dangerBtn: { backgroundColor: '#C0392B', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  dangerBtnDisabled: { opacity: 0.4 },
  dangerBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
}); }

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const { user, isLoggedIn } = useAuth();
  const { papel, ehMembro, carregando: carregandoPapel } = useAcesso();
  const { isDark, mode, setMode } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const styles = useMemo(() => buildStyles(C), [C]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [savedVersesVisible, setSavedVersesVisible] = useState(false);
  const [readingHistoryVisible, setReadingHistoryVisible] = useState(false);
  const [prayerVisible, setPrayerVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const fetchProfile = () => {
    if (!user) return;
    setLoadingProfile(true);
    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(({ data }) => { setProfile(data); setLoadingProfile(false); });
  };

  // Sem o `else` daqui, sair da conta (ou excluí-la) deixava o perfil antigo
  // na memória: a tela continuava mostrando nome, telefone e foto de uma
  // conta que já não existia — só o rótulo mudava para "Visitante".
  useEffect(() => {
    if (!user) { setProfile(null); setLoadingProfile(false); return; }
    fetchProfile();
  }, [user?.id]);

  const handleTrocarFoto = async () => {
    if (!isLoggedIn || !user) {
      Alert.alert(t('biblia.facaLogin'), t('perfil.facaLoginFoto'));
      return;
    }
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert(t('perfil.permissaoNecessaria'), t('perfil.permissaoFotos'));
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (resultado.canceled || !resultado.assets?.[0]) return;

    setUploadingAvatar(true);
    try {
      const foto = resultado.assets[0];
      const extensao = foto.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const contentType = extensao === 'png' ? 'image/png' : 'image/jpeg';
      const base64 = await FileSystem.readAsStringAsync(foto.uri, { encoding: FileSystem.EncodingType.Base64 });
      const caminho = `${user.id}/avatar.${extensao}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(caminho, decode(base64), { contentType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(caminho);
      // Cache-busting: sem isso, a foto antiga fica em cache no <Image> mesmo após trocar.
      const urlComVersao = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlComVersao })
        .eq('id', user.id);
      if (updateError) throw updateError;

      fetchProfile();
    } catch (err: any) {
      Alert.alert(t('perfil.erroEnviarFoto'), err.message ?? t('common.tenteNovamente'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const displayName = profile?.full_name ?? user?.email ?? t('perfil.visitante');
  const displayEmail = user?.email ?? '';
  const initials = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  // Com a aba Membros escondida pra quem não é membro, um alerta seco de
  // "faça login" deixaria a pessoa sem caminho nenhum: o botão leva à tela.
  const pedirLogin = (mensagem: string) => {
    Alert.alert(t('common.atencao'), mensagem, [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('auth.entrar'), onPress: () => navigation.navigate('Auth' as never) },
    ]);
  };

  const handleLogout = () => {
    Alert.alert(t('perfil.sairDaContaTitulo'), t('perfil.confirmaSair'), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('perfil.sairBtn'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) Alert.alert(t('common.erro'), error.message);
      }},
    ]);
  };

  const handleChangePassword = () => {
    if (!user?.email) return;
    Alert.alert(
      t('perfil.alterarSenha'),
      t('perfil.enviaremosLink', { email: user.email }),
      [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('common.enviar'), onPress: async () => {
          const { error } = await supabase.auth.resetPasswordForEmail(user.email!, {
            redirectTo: 'penielchurch://reset-password',
          });
          if (error) Alert.alert(t('common.erro'), error.message);
          else Alert.alert(t('perfil.emailEnviadoTitulo'), t('perfil.verifiqueCaixaEntrada'));
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
      t('perfil.sobreVersao'),
      [{ text: t('common.ok') }]
    );
  };

  const idiomaAtual = IDIOMAS.find(i => i.codigo === i18n.language)?.label ?? '';
  const temaAtualLabel = mode === 'dark' ? t('perfil.temaEscuro') : mode === 'light' ? t('perfil.temaClaro') : t('perfil.temaAutomatico');

  const sections: MenuSection[] = [
    {
      title: t('perfil.minhaIgreja'),
      items: [
        { icon: 'id-card-outline', label: t('perfil.meuCadastro'), onPress: () => isLoggedIn ? navigation.navigate('MeuCadastro' as never) : pedirLogin(t('perfil.faceLoginEditarPerfil')) },
        { icon: 'bookmark-outline', label: t('perfil.versiculosSalvos'), onPress: () => isLoggedIn ? setSavedVersesVisible(true) : pedirLogin(t('perfil.faceLoginVersiculos')) },
        { icon: 'book-outline', label: t('perfil.historicoDeEstudos'), onPress: () => isLoggedIn ? setReadingHistoryVisible(true) : pedirLogin(t('perfil.faceLoginHistorico')) },
        { icon: 'heart-outline', label: t('perfil.pedidosDeOracao'), onPress: () => isLoggedIn ? setPrayerVisible(true) : pedirLogin(t('perfil.faceLoginOracao')) },
      ],
    },
    {
      title: t('perfil.preferencias'),
      items: [
        {
          icon: 'notifications-outline', label: t('perfil.notificacoes'),
          rightElement: (
            <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled}
              trackColor={{ false: C.border, true: C.primaryLight }}
              thumbColor={notificationsEnabled ? C.accent : '#fff'} />
          ),
        },
        {
          icon: 'moon-outline', label: t('perfil.modoEscuro'),
          onPress: () => setThemeModalVisible(true),
          rightElement: <Text style={{ fontSize: 13, color: C.textMuted }}>{temaAtualLabel}</Text>,
        },
        {
          icon: 'language-outline', label: t('perfil.idioma'),
          onPress: () => setLanguageModalVisible(true),
          rightElement: <Text style={{ fontSize: 13, color: C.textMuted }}>{idiomaAtual}</Text>,
        },
      ],
    },
    {
      title: t('perfil.conta'),
      items: [
        { icon: 'person-outline', label: t('perfil.editarPerfil'), onPress: () => isLoggedIn ? setEditModalVisible(true) : pedirLogin(t('perfil.faceLoginEditarPerfil')) },
        { icon: 'lock-closed-outline', label: t('perfil.alterarSenha'), onPress: () => isLoggedIn ? handleChangePassword() : pedirLogin(t('perfil.faceLoginAlterarSenha')) },
        { icon: 'help-circle-outline', label: t('perfil.suporte'), onPress: handleSupport },
        { icon: 'trash-outline', label: t('perfil.excluirConta'), color: C.danger, onPress: () => isLoggedIn ? setDeleteAccountVisible(true) : pedirLogin(t('perfil.faceLoginExcluirConta')) },
      ],
    },
    {
      title: t('perfil.secaoSobre'),
      items: [
        { icon: 'information-circle-outline', label: t('perfil.sobre'), onPress: handleAbout },
        { icon: 'document-text-outline', label: t('perfil.politicaDePrivacidade'), onPress: () => Linking.openURL('https://penielchurch.org.uk/politica-de-privacidade/') },
        ...(isLoggedIn ? [{
          icon: 'log-out-outline' as keyof typeof Ionicons.glyphMap,
          label: t('perfil.sair'), color: C.danger, onPress: handleLogout,
        }] : []),
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('perfil.titulo')}</Text>
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
            <TouchableOpacity style={styles.avatarCameraBtn} onPress={handleTrocarFoto} disabled={uploadingAvatar}>
              {uploadingAvatar ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="camera" size={14} color="#fff" />}
            </TouchableOpacity>
          </View>
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userEmail}>{displayEmail}</Text>
          {profile?.phone && <Text style={styles.userPhone}>{profile.phone}</Text>}
          {/* Selo só pra cima: membro, líder e admin ganham etiqueta; quem
              ainda não é membro não recebe carimbo de "visitante". O app é
              híbrido — ninguém precisa ser lembrado do que não é. Antes, o
              selo dizia "Membro" pra QUALQUER pessoa logada, inclusive quem
              nunca usou um código de convite. */}
          {ehMembro && (
            <View style={styles.badges}>
              <View style={[styles.badge, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="checkmark-circle-outline" size={12} color={C.success} />
                <Text style={[styles.badgeText, { color: C.success }]}>
                  {papel === 'lider' ? t('perfil.badgeLider') : papel === 'admin' ? t('perfil.badgeAdmin') : t('perfil.badgeMembro')}
                </Text>
              </View>
              {profile?.baptized && (
                <View style={styles.badge}>
                  <Ionicons name="water-outline" size={12} color={C.primary} />
                  <Text style={styles.badgeText}>{t('perfil.badgeBatizado')}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[{ value: '—', label: t('perfil.statEstudos') }, { value: '—', label: t('perfil.statEventos') }, { value: '—', label: t('perfil.statOracoes') }].map(stat => (
            <View key={stat.label} style={styles.statItem}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Ponto de entrada fixo: deslogado leva ao login/cadastro; logado sem
            vínculo leva à ativação de membro. O card fica aqui enquanto a
            pessoa não for membro — é o lugar onde ela volta quando o líder
            finalmente mandar o código, dias depois. Antes isto era um <View>
            com uma seta que não navegava para lugar nenhum. */}
        {!ehMembro && !carregandoPapel && (
          <TouchableOpacity
            style={styles.loginCta}
            activeOpacity={0.8}
            onPress={() => navigation.navigate((isLoggedIn ? 'AtivarMembro' : 'Auth') as never)}
          >
            <Ionicons name={isLoggedIn ? 'key-outline' : 'log-in-outline'} size={20} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.loginCtaTitle}>
                {isLoggedIn ? t('perfil.souMembroTitulo') : t('perfil.entrarOuCriarConta')}
              </Text>
              <Text style={styles.loginCtaSub}>
                {isLoggedIn ? t('perfil.souMembroSub') : t('perfil.entrarOuCriarContaSub')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
          </TouchableOpacity>
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

        <Text style={styles.version}>Peniel Church App v{APP_VERSION}</Text>
        <Text style={styles.versionSub}>{infoAtualizacaoOTA()}</Text>
      </ScrollView>

      <EditProfileModal
        visible={editModalVisible}
        profile={profile}
        userId={user?.id}
        onClose={() => setEditModalVisible(false)}
        onSaved={fetchProfile}
      />
      <SavedVersesModal
        visible={savedVersesVisible}
        userId={user?.id}
        onClose={() => setSavedVersesVisible(false)}
      />
      <ReadingHistoryModal
        visible={readingHistoryVisible}
        userId={user?.id}
        onClose={() => setReadingHistoryVisible(false)}
      />
      <PrayerRequestsModal
        visible={prayerVisible}
        userId={user?.id}
        onClose={() => setPrayerVisible(false)}
      />
      <LanguagePickerModal
        visible={languageModalVisible}
        onClose={() => setLanguageModalVisible(false)}
      />
      <ThemeModePickerModal
        visible={themeModalVisible}
        onClose={() => setThemeModalVisible(false)}
      />
      <DeleteAccountModal
        visible={deleteAccountVisible}
        onClose={() => setDeleteAccountVisible(false)}
      />
    </SafeAreaView>
  );
}

function buildStyles(C: Paleta) { return StyleSheet.create({
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
  versionSub: { textAlign: 'center', fontSize: 10, color: C.textDim, marginTop: 4 },
}); }
