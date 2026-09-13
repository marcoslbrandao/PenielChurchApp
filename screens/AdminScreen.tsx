import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, StatusBar, ActivityIndicator,
  Share, RefreshControl, Modal, Image,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { apagarLinha } from '../lib/db';
import { useAuth } from '../lib/useAuth';
import { useBirthdays } from '../lib/useBirthdays';
import { useTranslation } from 'react-i18next';

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
  created_at: string; tipo: string;
};

type Stats = {
  total: number; membros: number; lideres: number; visitantes: number; admins: number;
};

type Offering = {
  id: string; user_id: string; valor: number; tipo: string; metodo: string | null;
  data: string; observacoes: string | null;
  profiles?: { full_name: string | null } | null;
};

type ProfileLite = { id: string; full_name: string | null };

type Aviso = { id: string; titulo: string; texto: string; data: string; tipo: string; destaque_home: boolean };

type DevocionalGeral = {
  id: string; titulo: string; versiculo: string; referencia: string;
  texto: string; autor: string | null; data: string; grupo: string | null;
};

type AgendaEvento = {
  id: string; nome: string; tipo: string; recorrente: boolean; dia_semana: number | null;
  data: string | null; horario: string; local: string; descricao: string | null;
  link_zoom: string | null; especial: boolean; cor: string | null;
  destaque_home: boolean; cta_texto: string | null; cta_url: string | null;
};

type ShortVideo = { id: string; titulo: string; url: string; plataforma: string; destaque_home: boolean };

type MensagemBlog = {
  id: string; titulo: string; resumo: string; conteudo: string;
  imagem_url: string | null; autor: string; data: string;
};

type ContactMessage = {
  id: string; nome: string; email: string | null; grupo: string | null;
  mensagem: string; status: 'novo' | 'lido' | 'respondido'; created_at: string;
};

type PrayerRequest = {
  id: string; user_id: string; titulo: string; descricao: string;
  status: 'aberto' | 'em_oracao' | 'respondido'; created_at: string;
  profiles?: { full_name: string | null } | null;
};

// Guarda a CHAVE de tradução, não o texto: estas constantes moram fora de
// qualquer componente, onde não existe `t`. Quem renderiza traduz.
const NOME_GRUPO: Record<string, string> = {
  mulheres: 'admin.grupoDeMulheres', homens: 'admin.grupoDeHomens',
  jovens: 'admin.penielAlive', estudo_biblico: 'admin.estudoBiblico',
};

// Opções de destino do devocional: geral (aparece pra todo mundo na Home)
// ou de um grupo específico (só quem tem acesso ao grupo vê — a RLS de
// `devocionais` já trata isso, não precisa de nada extra aqui além de
// mandar o valor certo de `grupo` no insert).
const GRUPO_DEVOCIONAL_OPCOES: { valor: string | null; chave: string }[] = [
  { valor: null, chave: 'admin.devocionalPenielHome' },
  { valor: 'mulheres', chave: 'admin.mulheres' },
  { valor: 'homens', chave: 'admin.homens' },
  { valor: 'jovens', chave: 'admin.penielAlive' },
  { valor: 'estudo_biblico', chave: 'admin.estudoBiblico' },
];

type EscalaArea = { id: string; nome: string; vagas_padrao: number };
type AreaVoluntario = { id: string; area_id: string; membro_id: string; nome: string; sobrenome: string };
// Sem telefone: quem lidera uma área de escala monta o time da área, mas não
// tem acesso ao diretório da igreja. A busca vem de `membros_para_area_escala`
// no Supabase, que devolve só nome e checa a permissão lá dentro.
type MembroDiretorio = { id: string; nome: string; sobrenome: string };

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
  const { t } = useTranslation();
  const [tipo, setTipo] = useState<'membro' | 'banda'>('membro');
  const [email, setEmail] = useState('');
  const [days, setDays] = useState('30');
  const [code, setCode] = useState(generateCode());
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (visible) setCode(generateCode()); }, [visible]);

  const handleSave = async () => {
    setSaving(true);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(days || 30));

    const { error } = await supabase.from('invite_codes').insert({
      code,
      tipo,
      assigned_to_email: email.trim() || null,
      expires_at: expiresAt.toISOString(),
    });

    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }

    // Compartilhar o código
    const mensagem = tipo === 'banda'
      ? `🎵 Seu convite para a área da Banda de Louvor — Peniel Church:\n\nCódigo: ${code}\n\nAbra o app, vá em Membros → Banda, e insira este código para ativar seu acesso.\n\nVálido por ${days} dias. Uso único.`
      : `🔑 Seu convite para o app Peniel Church:\n\nCódigo: ${code}\n\nAbra o app, vá em Membros e insira este código para ativar seu acesso.\n\nVálido por ${days} dias.`;
    await Share.share({ message: mensagem, title: 'Convite Peniel Church' });

    setEmail('');
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
        <View style={mo.sheet}>
          <View style={mo.header}>
            <Text style={mo.title}>{t('admin.novoConvite')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Tipo de convite */}
          <View style={mo.fieldWrap}>
            <Text style={mo.fieldLabel}>{t('admin.tipoDeConvite')}</Text>
            <View style={mo.daysRow}>
              <TouchableOpacity style={[mo.dayPill, tipo === 'membro' && mo.dayPillActive]} onPress={() => setTipo('membro')}>
                <Text style={[mo.dayPillText, tipo === 'membro' && mo.dayPillTextActive]}>{t('admin.pillMembro')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mo.dayPill, tipo === 'banda' && mo.dayPillActive]} onPress={() => setTipo('banda')}>
                <Text style={[mo.dayPillText, tipo === 'banda' && mo.dayPillTextActive]}>{t('admin.pillBanda')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Código gerado */}
          <View style={mo.codeBox}>
            <Text style={mo.codeLabel}>{t('admin.codigoGeradoAutomaticamente')}</Text>
            <Text style={mo.code}>{code}</Text>
          </View>

          {/* Email (opcional) */}
          <View style={mo.fieldWrap}>
            <Text style={mo.fieldLabel}>{t('admin.eMailDoConvidadoOpcional')}</Text>
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
            <Text style={mo.fieldLabel}>{t('admin.validoPorDias')}</Text>
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
              <><Ionicons name="share-outline" size={18} color="#fff" /><Text style={mo.saveBtnText}>{t('admin.criarECompartilhar')}</Text></>
            )}
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
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
  fieldHint: { fontSize: 11, color: C.textDim, marginTop: 6, lineHeight: 15 },
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

// ─── Nova Oferta Modal (registro manual) ──────────────────────────────────────
function NovaOfertaModal({ visible, onClose, onSaved, adminId }: {
  visible: boolean; onClose: () => void; onSaved: () => void; adminId: string | undefined;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [selected, setSelected] = useState<ProfileLite | null>(null);
  const [valor, setValor] = useState('');
  const [tipo, setTipo] = useState<'dizimo' | 'oferta' | 'missoes' | 'outro'>('oferta');
  const [metodo, setMetodo] = useState<'sumup' | 'pix' | 'dinheiro' | 'transferencia'>('sumup');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery(''); setResults([]); setSelected(null); setValor('');
      setTipo('oferta'); setMetodo('sumup'); setData(new Date().toISOString().slice(0, 10));
    }
  }, [visible]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      supabase.from('profiles').select('id, full_name').ilike('full_name', `%${query.trim()}%`).limit(8)
        .then(({ data }) => setResults((data as ProfileLite[]) ?? []));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handleSave = async () => {
    if (!selected) { Alert.alert(t('common.atencao'), t('admin.selecioneOMembro')); return; }
    const valorNum = Number(valor.replace(',', '.'));
    if (!valorNum || valorNum <= 0) { Alert.alert(t('common.atencao'), t('admin.informeUmValorValido')); return; }
    setSaving(true);
    const { error } = await supabase.from('offerings').insert({
      user_id: selected.id, valor: valorNum, tipo, metodo, data, registrado_por: adminId,
    });
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '85%' }}>
        <View style={[mo.sheet, { maxHeight: '100%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={mo.header}>
              <Text style={mo.title}>{t('admin.registrarOferta')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.membro')}</Text>
              {selected ? (
                <View style={[mo.fieldRow, { justifyContent: 'space-between' }]}>
                  <Text style={{ fontSize: 15, color: C.text, fontWeight: '600' }}>{selected.full_name ?? t('admin.semNome')}</Text>
                  <TouchableOpacity onPress={() => { setSelected(null); setQuery(''); }}>
                    <Ionicons name="close-circle" size={18} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={mo.fieldRow}>
                    <Ionicons name="search-outline" size={16} color={C.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                      style={mo.fieldInput} placeholder={t('admin.buscarPeloNome')}
                      placeholderTextColor={C.textDim} value={query} onChangeText={setQuery}
                    />
                  </View>
                  {results.map(r => (
                    <TouchableOpacity
                      key={r.id}
                      style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}
                      onPress={() => setSelected(r)}
                    >
                      <Text style={{ fontSize: 14, color: C.text }}>{r.full_name ?? t('admin.semNome')}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.valor')}</Text>
              <View style={mo.fieldRow}>
                <TextInput
                  style={mo.fieldInput} placeholder="0.00" placeholderTextColor={C.textDim}
                  value={valor} onChangeText={setValor} keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.tipo')}</Text>
              <View style={mo.daysRow}>
                {/* O parâmetro do map se chamava `t` e sombreava a função de
                    tradução dentro deste bloco — renomeado para `tp`. */}
                {(['dizimo', 'oferta', 'missoes', 'outro'] as const).map(tp => (
                  <TouchableOpacity key={tp} style={[mo.dayPill, tipo === tp && mo.dayPillActive]} onPress={() => setTipo(tp)}>
                    <Text style={[mo.dayPillText, tipo === tp && mo.dayPillTextActive]}>
                      {tp === 'dizimo' ? t('admin.tipoDizimo') : tp === 'oferta' ? t('admin.tipoOferta') : tp === 'missoes' ? t('admin.tipoMissoes') : t('admin.tipoOutro')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.metodo')}</Text>
              <View style={mo.daysRow}>
                {(['sumup', 'pix', 'dinheiro', 'transferencia'] as const).map(m => (
                  <TouchableOpacity key={m} style={[mo.dayPill, metodo === m && mo.dayPillActive]} onPress={() => setMetodo(m)}>
                    <Text style={[mo.dayPillText, metodo === m && mo.dayPillTextActive]}>
                      {m === 'sumup' ? 'SumUp' : m === 'pix' ? 'PIX' : m === 'dinheiro' ? t('admin.metodoDinheiro') : t('admin.metodoTransferencia')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.dataAaaaMmDd')}</Text>
              <View style={mo.fieldRow}>
                <TextInput
                  style={mo.fieldInput} value={data} onChangeText={setData}
                  placeholder="2026-07-09" placeholderTextColor={C.textDim}
                />
              </View>
            </View>

            <TouchableOpacity style={[mo.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={mo.saveBtnText}>{t('admin.registrarOferta')}</Text></>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Novo Aviso Modal ──────────────────────────────────────────────────────────
function NovoAvisoModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<'geral' | 'evento' | 'urgente'>('geral');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) { setTitulo(''); setTexto(''); setTipo('geral'); }
  }, [visible]);

  const handleSave = async () => {
    if (!titulo.trim() || !texto.trim()) { Alert.alert(t('common.atencao'), t('admin.preenchaOTituloEO')); return; }
    setSaving(true);
    const { error } = await supabase.from('avisos').insert({
      titulo: titulo.trim(), texto: texto.trim(), tipo, data: new Date().toISOString(), grupo: null,
    });
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '85%' }}>
        <View style={[mo.sheet, { maxHeight: '100%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={mo.header}>
              <Text style={mo.title}>{t('admin.novoAviso')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.tipo')}</Text>
              <View style={mo.daysRow}>
                {(['geral', 'evento', 'urgente'] as const).map(t => (
                  <TouchableOpacity key={t} style={[mo.dayPill, tipo === t && mo.dayPillActive]} onPress={() => setTipo(t)}>
                    <Text style={[mo.dayPillText, tipo === t && mo.dayPillTextActive]}>
                      {t === 'geral' ? '📢 Geral' : t === 'evento' ? '📅 Evento' : '🚨 Urgente'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.titulo')}</Text>
              <View style={mo.fieldRow}>
                <TextInput
                  style={mo.fieldInput} placeholder={t('admin.exCultoEspecialDeAcao')}
                  placeholderTextColor={C.textDim} value={titulo} onChangeText={setTitulo}
                />
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.texto')}</Text>
              <TextInput
                style={[mo.fieldRow, { height: 100, textAlignVertical: 'top', paddingVertical: 10, color: C.text, fontSize: 15 }]}
                placeholder={t('admin.escrevaOAviso')} placeholderTextColor={C.textDim}
                value={texto} onChangeText={setTexto} multiline
              />
            </View>

            <TouchableOpacity style={[mo.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="megaphone-outline" size={18} color="#fff" /><Text style={mo.saveBtnText}>{t('admin.publicarAviso')}</Text></>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Novo Devocional Modal ────────────────────────────────────────────────────
function NovoDevocionalModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [titulo, setTitulo] = useState('');
  const [versiculo, setVersiculo] = useState('');
  const [referencia, setReferencia] = useState('');
  const [texto, setTexto] = useState('');
  const [grupo, setGrupo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) { setTitulo(''); setVersiculo(''); setReferencia(''); setTexto(''); setGrupo(null); }
  }, [visible]);

  const handleSave = async () => {
    if (!titulo.trim() || !versiculo.trim() || !referencia.trim() || !texto.trim()) {
      Alert.alert(t('common.atencao'), t('admin.preenchaTodosOsCamposDo'));
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('devocionais').insert({
      titulo: titulo.trim(), versiculo: versiculo.trim(), referencia: referencia.trim(),
      texto: texto.trim(), autor: 'Peniel Church', data: new Date().toISOString(), grupo,
    });
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '85%' }}>
        <View style={[mo.sheet, { maxHeight: '100%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={mo.header}>
              <Text style={mo.title}>{t('admin.novoDevocional')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.destino')}</Text>
              <View style={[mo.daysRow, { flexWrap: 'wrap' }]}>
                {GRUPO_DEVOCIONAL_OPCOES.map(op => (
                  <TouchableOpacity
                    key={op.chave}
                    style={[mo.dayPill, grupo === op.valor && mo.dayPillActive]}
                    onPress={() => setGrupo(op.valor)}
                  >
                    <Text style={[mo.dayPillText, grupo === op.valor && mo.dayPillTextActive]}>{t(op.chave)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.titulo')}</Text>
              <View style={mo.fieldRow}>
                <TextInput
                  style={mo.fieldInput} placeholder={t('admin.exConfiandoNoTempoDe')}
                  placeholderTextColor={C.textDim} value={titulo} onChangeText={setTitulo}
                />
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.versiculo')}</Text>
              <TextInput
                style={[mo.fieldRow, { height: 70, textAlignVertical: 'top', paddingVertical: 10, color: C.text, fontSize: 15 }]}
                placeholder='Ex: "Tudo posso naquele que me fortalece."'
                placeholderTextColor={C.textDim} value={versiculo} onChangeText={setVersiculo} multiline
              />
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.referencia')}</Text>
              <View style={mo.fieldRow}>
                <TextInput
                  style={mo.fieldInput} placeholder={t('admin.exFilipenses413')}
                  placeholderTextColor={C.textDim} value={referencia} onChangeText={setReferencia}
                />
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.reflexao')}</Text>
              <TextInput
                style={[mo.fieldRow, { height: 120, textAlignVertical: 'top', paddingVertical: 10, color: C.text, fontSize: 15 }]}
                placeholder={t('admin.escrevaAReflexaoDoDevocional')} placeholderTextColor={C.textDim}
                value={texto} onChangeText={setTexto} multiline
              />
            </View>

            <TouchableOpacity style={[mo.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="book-outline" size={18} color="#fff" /><Text style={mo.saveBtnText}>{t('admin.publicarDevocional')}</Text></>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Novo Evento (Agenda) Modal ───────────────────────────────────────────────
const DIAS_SEMANA_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function NovoEventoModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'presencial' | 'online' | 'casa'>('presencial');
  const [recorrente, setRecorrente] = useState(true);
  const [diaSemana, setDiaSemana] = useState(0);
  const [data, setData] = useState(''); // YYYY-MM-DD
  const [horario, setHorario] = useState('');
  const [local, setLocal] = useState('');
  const [descricao, setDescricao] = useState('');
  const [linkZoom, setLinkZoom] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [especial, setEspecial] = useState(false);
  const [destaqueHome, setDestaqueHome] = useState(false);
  const [ctaTexto, setCtaTexto] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setNome(''); setTipo('presencial'); setRecorrente(true); setDiaSemana(0);
      setData(''); setHorario(''); setLocal(''); setDescricao('');
      setLinkZoom(''); setMapUrl(''); setEspecial(false);
      setDestaqueHome(false); setCtaTexto(''); setCtaUrl('');
    }
  }, [visible]);

  const handleSave = async () => {
    if (!nome.trim() || !horario.trim() || !local.trim()) {
      Alert.alert(t('common.atencao'), t('admin.preenchaAoMenosNomeHorario'));
      return;
    }
    if (!recorrente && !data.trim()) {
      Alert.alert(t('common.atencao'), t('admin.informeADataNoFormato'));
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('agenda_eventos').insert({
      nome: nome.trim(), tipo, recorrente,
      dia_semana: recorrente ? diaSemana : null,
      data: !recorrente ? data.trim() : null,
      horario: horario.trim(), local: local.trim(),
      descricao: descricao.trim() || null,
      link_zoom: tipo === 'online' ? (linkZoom.trim() || null) : null,
      map_url: tipo === 'presencial' ? (mapUrl.trim() || null) : null,
      especial,
      cor: especial ? '#E84B1A' : null,
      // Destaque na Home: o banco garante que só um evento fica marcado por
      // vez (trigger agenda_destaque_home_exclusivo), então marcar este já
      // desmarca o anterior sozinho.
      destaque_home: destaqueHome,
      cta_texto: destaqueHome ? (ctaTexto.trim() || null) : null,
      cta_url: destaqueHome ? (ctaUrl.trim() || null) : null,
    });
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '90%' }}>
        <View style={[mo.sheet, { maxHeight: '100%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={mo.header}>
              <Text style={mo.title}>{t('admin.novoEvento')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.nomeDoEvento')}</Text>
              <View style={mo.fieldRow}>
                <TextInput style={mo.fieldInput} placeholder={t('admin.exCultoDeJovens')} placeholderTextColor={C.textDim} value={nome} onChangeText={setNome} />
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.tipoDeLocal')}</Text>
              <View style={mo.daysRow}>
                {(['presencial', 'online', 'casa'] as const).map(t => (
                  <TouchableOpacity key={t} style={[mo.dayPill, tipo === t && mo.dayPillActive]} onPress={() => setTipo(t)}>
                    <Text style={[mo.dayPillText, tipo === t && mo.dayPillTextActive]}>
                      {t === 'presencial' ? '⛪ Igreja' : t === 'online' ? '💻 Online' : '🏠 Nas casas'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.repeticao')}</Text>
              <View style={mo.daysRow}>
                <TouchableOpacity style={[mo.dayPill, recorrente && mo.dayPillActive]} onPress={() => setRecorrente(true)}>
                  <Text style={[mo.dayPillText, recorrente && mo.dayPillTextActive]}>{t('admin.todaSemana')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[mo.dayPill, !recorrente && mo.dayPillActive]} onPress={() => setRecorrente(false)}>
                  <Text style={[mo.dayPillText, !recorrente && mo.dayPillTextActive]}>{t('admin.dataUnica')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {recorrente ? (
              <View style={mo.fieldWrap}>
                <Text style={mo.fieldLabel}>{t('admin.diaDaSemana')}</Text>
                <View style={mo.daysRow}>
                  {DIAS_SEMANA_LABELS.map((label, idx) => (
                    <TouchableOpacity key={idx} style={[mo.dayPill, diaSemana === idx && mo.dayPillActive]} onPress={() => setDiaSemana(idx)}>
                      <Text style={[mo.dayPillText, diaSemana === idx && mo.dayPillTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View style={mo.fieldWrap}>
                <Text style={mo.fieldLabel}>{t('admin.dataAaaaMmDd')}</Text>
                <View style={mo.fieldRow}>
                  <TextInput style={mo.fieldInput} placeholder={t('admin.ex20260828')} placeholderTextColor={C.textDim} value={data} onChangeText={setData} />
                </View>
              </View>
            )}

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.horario')}</Text>
              <View style={mo.fieldRow}>
                <TextInput style={mo.fieldInput} placeholder={t('admin.ex19h00')} placeholderTextColor={C.textDim} value={horario} onChangeText={setHorario} />
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.local')}</Text>
              <View style={mo.fieldRow}>
                <TextInput style={mo.fieldInput} placeholder={t('admin.exAbbeySquareReading')} placeholderTextColor={C.textDim} value={local} onChangeText={setLocal} />
              </View>
            </View>

            {tipo === 'online' && (
              <View style={mo.fieldWrap}>
                <Text style={mo.fieldLabel}>{t('admin.linkDoZoom')}</Text>
                <View style={mo.fieldRow}>
                  <TextInput style={mo.fieldInput} placeholder="https://..." placeholderTextColor={C.textDim} value={linkZoom} onChangeText={setLinkZoom} autoCapitalize="none" />
                </View>
              </View>
            )}

            {tipo === 'presencial' && (
              <View style={mo.fieldWrap}>
                <Text style={mo.fieldLabel}>{t('admin.linkDoGoogleMaps')}</Text>
                <View style={mo.fieldRow}>
                  <TextInput style={mo.fieldInput} placeholder="https://maps.google.com/?q=..." placeholderTextColor={C.textDim} value={mapUrl} onChangeText={setMapUrl} autoCapitalize="none" />
                </View>
              </View>
            )}

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.descricao')}</Text>
              <TextInput
                style={[mo.fieldRow, { height: 80, textAlignVertical: 'top', paddingVertical: 10, color: C.text, fontSize: 15 }]}
                placeholder={t('admin.breveDescricaoDoEvento')} placeholderTextColor={C.textDim}
                value={descricao} onChangeText={setDescricao} multiline
              />
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.eventoEspecialApareceEmDestaque')}</Text>
              <View style={mo.daysRow}>
                <TouchableOpacity style={[mo.dayPill, especial && mo.dayPillActive]} onPress={() => setEspecial(!especial)}>
                  <Text style={[mo.dayPillText, especial && mo.dayPillTextActive]}>
                    {especial ? '⭐ Sim, é especial' : 'Não'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.destaqueNaHomeChamadaDe')}</Text>
              <View style={mo.daysRow}>
                <TouchableOpacity style={[mo.dayPill, destaqueHome && mo.dayPillActive]} onPress={() => setDestaqueHome(!destaqueHome)}>
                  <Text style={[mo.dayPillText, destaqueHome && mo.dayPillTextActive]}>
                    {destaqueHome ? '🏠 Sim, mostrar na Home' : 'Não'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={mo.fieldHint}>Só um evento fica em destaque por vez — marcar este tira o anterior da Home automaticamente (ele continua na Agenda).</Text>
            </View>

            {destaqueHome && (
              <>
                <View style={mo.fieldWrap}>
                  <Text style={mo.fieldLabel}>{t('admin.textoDoBotaoOpcional')}</Text>
                  <View style={mo.fieldRow}>
                    <TextInput style={mo.fieldInput} placeholder={t('admin.exInscrevaSe')} placeholderTextColor={C.textDim} value={ctaTexto} onChangeText={setCtaTexto} />
                  </View>
                </View>
                <View style={mo.fieldWrap}>
                  <Text style={mo.fieldLabel}>{t('admin.linkDoBotaoOpcional')}</Text>
                  <View style={mo.fieldRow}>
                    <TextInput style={mo.fieldInput} placeholder="https://..." placeholderTextColor={C.textDim} value={ctaUrl} onChangeText={setCtaUrl} autoCapitalize="none" />
                  </View>
                  <Text style={mo.fieldHint}>{t('admin.semLinkTocarNoCard')}</Text>
                </View>
              </>
            )}

            <TouchableOpacity style={[mo.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="calendar-outline" size={18} color="#fff" /><Text style={mo.saveBtnText}>{t('admin.publicarEvento')}</Text></>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Novo Short Modal ─────────────────────────────────────────────────────────
function NovoShortModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [titulo, setTitulo] = useState('');
  const [url, setUrl] = useState('');
  const [plataforma, setPlataforma] = useState<'youtube' | 'instagram'>('youtube');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) { setTitulo(''); setUrl(''); setPlataforma('youtube'); }
  }, [visible]);

  const handleSave = async () => {
    if (!titulo.trim() || !url.trim()) { Alert.alert(t('common.atencao'), t('admin.preenchaOTituloEO2')); return; }
    setSaving(true);
    const { error } = await supabase.from('shorts_videos').insert({
      titulo: titulo.trim(), url: url.trim(), plataforma, grupo: null,
    });
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '80%' }}>
        <View style={[mo.sheet, { maxHeight: '100%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={mo.header}>
              <Text style={mo.title}>{t('admin.novoShort')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.plataforma')}</Text>
              <View style={mo.daysRow}>
                {(['youtube', 'instagram'] as const).map(p => (
                  <TouchableOpacity key={p} style={[mo.dayPill, plataforma === p && mo.dayPillActive]} onPress={() => setPlataforma(p)}>
                    <Text style={[mo.dayPillText, plataforma === p && mo.dayPillTextActive]}>
                      {p === 'youtube' ? '▶️ YouTube Shorts' : '📸 Instagram Reels'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.titulo')}</Text>
              <View style={mo.fieldRow}>
                <TextInput style={mo.fieldInput} placeholder={t('admin.ex1MinutoDeFe')} placeholderTextColor={C.textDim} value={titulo} onChangeText={setTitulo} />
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.linkDoVideo')}</Text>
              <View style={mo.fieldRow}>
                <TextInput
                  style={mo.fieldInput}
                  placeholder={plataforma === 'youtube' ? 'https://youtube.com/shorts/...' : 'https://instagram.com/reel/...'}
                  placeholderTextColor={C.textDim} value={url} onChangeText={setUrl} autoCapitalize="none"
                />
              </View>
            </View>

            <TouchableOpacity style={[mo.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="film-outline" size={18} color="#fff" /><Text style={mo.saveBtnText}>{t('admin.publicarShort')}</Text></>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Nova Mensagem (Blog) Modal ───────────────────────────────────────────────
function NovaMensagemModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [titulo, setTitulo] = useState('');
  const [resumo, setResumo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [autor, setAutor] = useState('Peniel Church');
  const [imagemLocal, setImagemLocal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [enviandoImagem, setEnviandoImagem] = useState(false);

  useEffect(() => {
    if (!visible) {
      setTitulo(''); setResumo(''); setConteudo(''); setAutor('Peniel Church'); setImagemLocal(null);
    }
  }, [visible]);

  const escolherImagem = async () => {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert(t('admin.permissaoNecessaria'), t('admin.precisamosDeAcessoAsSuas'));
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.7,
    });
    if (!resultado.canceled && resultado.assets?.[0]) {
      setImagemLocal(resultado.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!titulo.trim() || !resumo.trim() || !conteudo.trim()) {
      Alert.alert(t('common.atencao'), t('admin.preenchaAoMenosTituloResumo'));
      return;
    }
    setSaving(true);

    let imagemUrl: string | null = null;
    if (imagemLocal) {
      setEnviandoImagem(true);
      try {
        const extensao = imagemLocal.split('.').pop()?.toLowerCase() ?? 'jpg';
        const contentType = extensao === 'png' ? 'image/png' : 'image/jpeg';
        const base64 = await FileSystem.readAsStringAsync(imagemLocal, { encoding: FileSystem.EncodingType.Base64 });
        const caminho = `capas/${Date.now()}.${extensao}`;
        const { error: uploadError } = await supabase.storage
          .from('blog')
          .upload(caminho, decode(base64), { contentType, upsert: true });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from('blog').getPublicUrl(caminho);
        imagemUrl = publicUrlData.publicUrl;
      } catch (e: any) {
        setSaving(false);
        setEnviandoImagem(false);
        Alert.alert(t('admin.erroAoEnviarImagem'), e?.message ?? 'Tente novamente.');
        return;
      }
      setEnviandoImagem(false);
    }

    const { error } = await supabase.from('mensagens').insert({
      titulo: titulo.trim(), resumo: resumo.trim(), conteudo: conteudo.trim(),
      autor: autor.trim() || 'Peniel Church', imagem_url: imagemUrl,
      data: new Date().toISOString().slice(0, 10),
    });
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '90%' }}>
        <View style={[mo.sheet, { maxHeight: '100%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={mo.header}>
              <Text style={mo.title}>{t('admin.novaMensagem')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.imagemDeCapaOpcional')}</Text>
              <TouchableOpacity style={nm.imagemPicker} onPress={escolherImagem} disabled={enviandoImagem}>
                {imagemLocal ? (
                  <Image source={{ uri: imagemLocal }} style={nm.imagemPreview} resizeMode="cover" />
                ) : (
                  <View style={nm.imagemPlaceholder}>
                    <Ionicons name="image-outline" size={24} color={C.textDim} />
                    <Text style={nm.imagemPlaceholderTexto}>{t('admin.toqueParaEscolherUmaFoto')}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.titulo')}</Text>
              <View style={mo.fieldRow}>
                <TextInput
                  style={mo.fieldInput} placeholder={t('admin.exOCegoQueEnxergava')}
                  placeholderTextColor={C.textDim} value={titulo} onChangeText={setTitulo}
                />
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.resumoApareceNaHomeE')}</Text>
              <TextInput
                style={[mo.fieldRow, { height: 70, textAlignVertical: 'top', paddingVertical: 10, color: C.text, fontSize: 15 }]}
                placeholder={t('admin.umBreveResumoDaMensagem')}
                placeholderTextColor={C.textDim} value={resumo} onChangeText={setResumo} multiline
              />
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.conteudoCompleto')}</Text>
              <TextInput
                style={[mo.fieldRow, { height: 200, textAlignVertical: 'top', paddingVertical: 10, color: C.text, fontSize: 15 }]}
                placeholder={t('admin.escrevaOTextoCompletoSepare')}
                placeholderTextColor={C.textDim} value={conteudo} onChangeText={setConteudo} multiline
              />
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.autorPregador')}</Text>
              <View style={mo.fieldRow}>
                <TextInput
                  style={mo.fieldInput} placeholder={t('admin.exPrJoaoSilva')}
                  placeholderTextColor={C.textDim} value={autor} onChangeText={setAutor}
                />
              </View>
            </View>

            <TouchableOpacity style={[mo.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="newspaper-outline" size={18} color="#fff" /><Text style={mo.saveBtnText}>{t('admin.publicarMensagem')}</Text></>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const nm = StyleSheet.create({
  imagemPicker: { borderRadius: 12, overflow: 'hidden', backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  imagemPreview: { width: '100%', height: 140 },
  imagemPlaceholder: { height: 100, alignItems: 'center', justifyContent: 'center', gap: 6 },
  imagemPlaceholderTexto: { fontSize: 12, color: C.textDim },
});

// ─── Nova Área de Escala Modal (admin) ─────────────────────────────────────────
function NovaAreaModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [nome, setNome] = useState('');
  const [vagas, setVagas] = useState('2');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!visible) { setNome(''); setVagas('2'); } }, [visible]);

  const handleSave = async () => {
    if (!nome.trim()) { Alert.alert(t('common.atencao'), t('admin.informeONomeDaArea')); return; }
    setSaving(true);
    const { error } = await supabase.from('escala_areas').insert({
      nome: nome.trim(), vagas_padrao: Number(vagas) || 1,
    });
    setSaving(false);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
        <View style={mo.sheet}>
          <View style={mo.header}>
            <Text style={mo.title}>{t('admin.novaAreaDeEscala')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={mo.fieldWrap}>
            <Text style={mo.fieldLabel}>{t('admin.nomeDaArea')}</Text>
            <View style={mo.fieldRow}>
              <TextInput
                style={mo.fieldInput} placeholder={t('admin.exSomEstacionamento')}
                placeholderTextColor={C.textDim} value={nome} onChangeText={setNome}
              />
            </View>
          </View>

          <View style={mo.fieldWrap}>
            <Text style={mo.fieldLabel}>{t('admin.vagasPorDomingo')}</Text>
            <View style={mo.fieldRow}>
              <TextInput
                style={mo.fieldInput} placeholder="2" placeholderTextColor={C.textDim}
                value={vagas} onChangeText={setVagas} keyboardType="number-pad"
              />
            </View>
          </View>

          <TouchableOpacity style={[mo.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={mo.saveBtnText}>{t('admin.criarArea')}</Text>}
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Time de Voluntários por Área Modal (líder da área / admin) ────────────────
function AreaVoluntariosModal({ visible, area, onClose, onChanged }: {
  visible: boolean; area: EscalaArea | null; onClose: () => void; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [voluntarios, setVoluntarios] = useState<AreaVoluntario[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<MembroDiretorio[]>([]);
  const [buscando, setBuscando] = useState(false);

  const fetchVoluntarios = useCallback(async () => {
    if (!area) return;
    setLoading(true);
    const { data } = await supabase.rpc('voluntarios_da_area', { p_area_id: area.id });
    setVoluntarios(((data ?? []) as any[]).map(row => ({
      id: row.id, area_id: row.area_id, membro_id: row.membro_id,
      nome: row.nome ?? '', sobrenome: row.sobrenome ?? '',
    })));
    setLoading(false);
  }, [area]);

  useEffect(() => {
    if (visible) { fetchVoluntarios(); setQuery(''); setResultados([]); }
  }, [visible, fetchVoluntarios]);

  useEffect(() => {
    if (!area || query.trim().length < 2) { setResultados([]); return; }
    const areaId = area.id;
    setBuscando(true);
    const t = setTimeout(() => {
      // A função já exclui quem está no time e já limita o resultado.
      supabase.rpc('membros_para_area_escala', { p_area_id: areaId, p_busca: query.trim() })
        .then(({ data }) => {
          setResultados((data ?? []) as MembroDiretorio[]);
          setBuscando(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query, area?.id, voluntarios.length]);

  const adicionar = async (membro: MembroDiretorio) => {
    if (!area) return;
    const { error } = await supabase.from('escala_area_voluntarios').insert({ area_id: area.id, membro_id: membro.id });
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    setQuery(''); setResultados([]);
    fetchVoluntarios();
    onChanged();
  };

  const remover = (v: AreaVoluntario) => {
    Alert.alert(t('admin.removerDoTime'), `Remover ${v.nome} ${v.sobrenome} do time de ${area?.nome}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await apagarLinha('escala_area_voluntarios', v.id);
        fetchVoluntarios();
        onChanged();
      }},
    ]);
  };

  if (!area) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '85%' }}>
          <View style={[mo.sheet, { maxHeight: '100%' }]}>
            <View style={mo.header}>
              <Text style={mo.title}>Time — {area.nome}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={mo.fieldRow}>
              <Ionicons name="search-outline" size={16} color={C.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={mo.fieldInput}
                placeholder={t('admin.buscarNoDiretorioPraAdicionar')}
                placeholderTextColor={C.textDim}
                value={query}
                onChangeText={setQuery}
              />
              {buscando && <ActivityIndicator size="small" color={C.purple} />}
            </View>

            {resultados.map(m => (
              <TouchableOpacity
                key={m.id}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}
                onPress={() => adicionar(m)}
              >
                <Text style={{ flex: 1, fontSize: 14, color: C.text }}>{m.nome} {m.sobrenome}</Text>
                <Ionicons name="add-circle" size={22} color={C.purple} />
              </TouchableOpacity>
            ))}

            <Text style={[s.sectionLabel, { marginTop: 16 }]}>
              Time atual ({voluntarios.length}) · vagas por domingo: {area.vagas_padrao}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
              {loading ? (
                <ActivityIndicator color={C.purple} style={{ marginVertical: 20 }} />
              ) : voluntarios.length === 0 ? (
                <Text style={s.emptyText}>{t('admin.ninguemAdicionadoAinda')}</Text>
              ) : (
                voluntarios.map(v => (
                  <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
                    <Text style={{ fontSize: 14, color: C.text }}>{v.nome} {v.sobrenome}</Text>
                    <TouchableOpacity onPress={() => remover(v)}>
                      <Ionicons name="trash-outline" size={18} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
              <View style={{ height: 10 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Gerador de Escala Automático (admin) ──────────────────────────────────────
// Distribui o pool de voluntários de cada área pelos domingos do período
// escolhido, por rotação (cada pessoa vai avançando na fila da própria área),
// respeitando `vagas_padrao` e nunca escalando a mesma pessoa em duas áreas
// no mesmo domingo — é a trava anti-"crash de escalas" que foi pedida.
function proximoDomingo(): Date {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diasAte = (7 - hoje.getDay()) % 7;
  hoje.setDate(hoje.getDate() + diasAte);
  return hoje;
}
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function formatarDataBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function GerarEscalaModal({ visible, areas, voluntarios, userId, onClose, onGerado }: {
  visible: boolean; areas: EscalaArea[]; voluntarios: AreaVoluntario[]; userId: string | undefined;
  onClose: () => void; onGerado: () => void;
}) {
  const { t } = useTranslation();
  const [dataInicio, setDataInicio] = useState('');
  const [semanas, setSemanas] = useState('26');
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (visible) { setDataInicio(formatarDataBR(toISODate(proximoDomingo()))); setSemanas('26'); }
  }, [visible]);

  const handleGerar = async () => {
    const [d, m, y] = dataInicio.split('/');
    if (!d || !m || !y || y.length !== 4) { Alert.alert(t('common.atencao'), t('admin.informeADataDeInicio')); return; }
    const inicio = new Date(Number(y), Number(m) - 1, Number(d));
    if (inicio.getDay() !== 0) { Alert.alert(t('common.atencao'), t('admin.aDataDeInicioPrecisa')); return; }
    const numSemanas = Number(semanas);
    if (!numSemanas || numSemanas < 1 || numSemanas > 52) { Alert.alert(t('common.atencao'), t('admin.informeUmaQuantidadeDeDomingos')); return; }
    if (areas.length === 0) { Alert.alert(t('common.atencao'), t('admin.cadastreAoMenosUmaArea')); return; }

    setGerando(true);

    const datas: string[] = [];
    const cursor = new Date(inicio);
    for (let i = 0; i < numSemanas; i++) {
      datas.push(toISODate(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }

    const dataFim = datas[datas.length - 1];

    // Designações já existentes no período — contam como "ocupado" pra não
    // dar crash nem duplicar, e são descontadas das vagas de cada área.
    const { data: existentesData, error: existentesError } = await supabase
      .from('escala_designacoes')
      .select('area_id, membro_id, data')
      .gte('data', datas[0])
      .lte('data', dataFim);

    if (existentesError) {
      setGerando(false);
      Alert.alert(t('common.erro'), existentesError.message);
      return;
    }

    const usadoNoDia: Record<string, Set<string>> = {};
    const existentesPorAreaData: Record<string, number> = {};
    (existentesData ?? []).forEach((e: any) => {
      (usadoNoDia[e.data] ??= new Set()).add(e.membro_id);
      const chave = `${e.area_id}|${e.data}`;
      existentesPorAreaData[chave] = (existentesPorAreaData[chave] ?? 0) + 1;
    });

    const areasOrdenadas = [...areas].sort((a, b) => a.nome.localeCompare(b.nome));
    const poolPorArea: Record<string, string[]> = {};
    areasOrdenadas.forEach(a => {
      poolPorArea[a.id] = voluntarios.filter(v => v.area_id === a.id).map(v => v.membro_id);
    });
    const ponteiro: Record<string, number> = {};
    areasOrdenadas.forEach(a => { ponteiro[a.id] = 0; });

    const novas: { area_id: string; membro_id: string; data: string; gerado_automaticamente: boolean; criado_por: string | undefined }[] = [];

    datas.forEach(data => {
      const usadosHoje = (usadoNoDia[data] ??= new Set());
      areasOrdenadas.forEach(area => {
        const jaTem = existentesPorAreaData[`${area.id}|${data}`] ?? 0;
        const precisa = area.vagas_padrao - jaTem;
        if (precisa <= 0) return;
        const pool = poolPorArea[area.id];
        if (!pool || pool.length === 0) return;

        const escolhidos: string[] = [];
        let i = ponteiro[area.id];
        let tentativas = 0;
        while (escolhidos.length < precisa && tentativas < pool.length) {
          const candidato = pool[i % pool.length];
          if (!usadosHoje.has(candidato)) {
            escolhidos.push(candidato);
            usadosHoje.add(candidato);
          }
          i++;
          tentativas++;
        }
        ponteiro[area.id] = i % pool.length;

        escolhidos.forEach(membroId => {
          novas.push({ area_id: area.id, membro_id: membroId, data, gerado_automaticamente: true, criado_por: userId });
        });
      });
    });

    if (novas.length === 0) {
      setGerando(false);
      Alert.alert(t('admin.nadaAGerar'), t('admin.naoHaVoluntariosDisponiveisNas'));
      return;
    }

    const { error: insertError } = await supabase.from('escala_designacoes').insert(novas);
    setGerando(false);
    if (insertError) { Alert.alert(t('admin.erroAoGerar'), insertError.message); return; }

    onGerado();
    onClose();
    Alert.alert(t('admin.escalaGerada'), `${novas.length} designações criadas ao longo de ${numSemanas} domingos.`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={mo.sheet}>
            <View style={mo.header}>
              <Text style={mo.title}>{t('admin.gerarEscalaDoSemestre')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, lineHeight: 18 }}>
              Preenche automaticamente as vagas de todas as áreas, revezando o time de voluntários de cada uma. Ninguém é escalado em duas áreas no mesmo domingo, e domingos/áreas já preenchidos manualmente não são sobrescritos.
            </Text>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.domingoDeInicio')}</Text>
              <View style={mo.fieldRow}>
                <TextInput
                  style={mo.fieldInput} placeholder={t('admin.ddMmAaaa')} placeholderTextColor={C.textDim}
                  value={dataInicio} onChangeText={setDataInicio} keyboardType="numeric" maxLength={10}
                />
              </View>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.quantidadeDeDomingos')}</Text>
              <View style={mo.fieldRow}>
                <TextInput
                  style={mo.fieldInput} placeholder="26" placeholderTextColor={C.textDim}
                  value={semanas} onChangeText={setSemanas} keyboardType="number-pad"
                />
              </View>
            </View>

            <TouchableOpacity style={[mo.saveBtn, gerando && { opacity: 0.7 }]} onPress={handleGerar} disabled={gerando}>
              {gerando ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="shuffle-outline" size={18} color="#fff" /><Text style={mo.saveBtnText}>{t('admin.gerarEscala')}</Text></>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { todayBirthdays, monthBirthdays } = useBirthdays();
  const [role, setRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  // Painel Admin = conteúdo PÚBLICO da igreja (avisos, devocionais, mensagens
  // e shorts que aparecem na Home e na Mídia) — isso é só do admin. A única
  // exceção é quem lidera uma área de escala: essa pessoa entra aqui, mas vê
  // exclusivamente a aba Escalas, e dentro dela só as áreas que lidera.
  // Conteúdo de GRUPO não se administra aqui: é dentro da aba Grupos.
  const [lideraAreaEscala, setLideraAreaEscala] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, membros: 0, lideres: 0, visitantes: 0, admins: 0 });
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [devocionais, setDevocionais] = useState<DevocionalGeral[]>([]);
  const [eventosAgenda, setEventosAgenda] = useState<AgendaEvento[]>([]);
  const [shorts, setShorts] = useState<ShortVideo[]>([]);
  const [mensagens, setMensagens] = useState<MensagemBlog[]>([]);
  const [contatoMensagens, setContatoMensagens] = useState<ContactMessage[]>([]);
  const [pedidosOracao, setPedidosOracao] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [ofertaModalVisible, setOfertaModalVisible] = useState(false);
  const [avisoModalVisible, setAvisoModalVisible] = useState(false);
  const [devocionalModalVisible, setDevocionalModalVisible] = useState(false);
  const [eventoModalVisible, setEventoModalVisible] = useState(false);
  const [shortModalVisible, setShortModalVisible] = useState(false);
  const [mensagemModalVisible, setMensagemModalVisible] = useState(false);
  const [escalaAreas, setEscalaAreas] = useState<EscalaArea[]>([]);
  const [areaVoluntarios, setAreaVoluntarios] = useState<AreaVoluntario[]>([]);
  const [areasLideradas, setAreasLideradas] = useState<string[]>([]);
  const [areaModalVisible, setAreaModalVisible] = useState(false);
  const [areaGerenciarVisible, setAreaGerenciarVisible] = useState<EscalaArea | null>(null);
  const [gerarEscalaModalVisible, setGerarEscalaModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'convites' | 'stats' | 'ofertas' | 'avisos' | 'devocionais' | 'agenda' | 'shorts' | 'mensagens' | 'escalas' | 'contato' | 'oracao'>('convites');
  // São 9 abas e só ~3 cabem na tela por vez — sem esse indicador, dava a
  // impressão de que a lista de abas estava cortada/quebrada (só aparecia
  // uma lasquinha do ícone da 4ª aba na borda). A setinha "→" avisa que dá
  // pra arrastar pra ver o resto, e some sozinha quando chega no fim.
  const [tabsScrollFim, setTabsScrollFim] = useState(false);

  // Verifica role e liderança de área de escala
  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase.from('escala_area_lideres').select('area_id').eq('profile_id', user.id),
    ]).then(([{ data: perfil }, { data: areas }]) => {
      setRole(perfil?.role ?? null);
      setLideraAreaEscala((areas ?? []).length > 0);
      setLoadingRole(false);
    });
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
    // Ofertas
    const { data: offeringsData } = await supabase
      .from('offerings')
      .select('*, profiles!offerings_user_id_fkey(full_name)')
      .order('data', { ascending: false })
      .limit(200);
    if (offeringsData) setOfferings(offeringsData as unknown as Offering[]);
    // Avisos
    const { data: avisosData } = await supabase
      .from('avisos').select('*').is('grupo', null).order('created_at', { ascending: false }).limit(50);
    if (avisosData) setAvisos(avisosData as Aviso[]);
    // Devocionais — geral (grupo = null, aparece em destaque na Home) e os
    // de cada grupo (admin vê e gerencia todos, RLS permite).
    const { data: devData } = await supabase
      .from('devocionais').select('*').order('data', { ascending: false }).limit(50);
    if (devData) setDevocionais(devData as DevocionalGeral[]);
    // Agenda
    const { data: agendaData } = await supabase
      .from('agenda_eventos').select('*').order('created_at', { ascending: false });
    if (agendaData) setEventosAgenda(agendaData as AgendaEvento[]);
    // Shorts
    const { data: shortsData } = await supabase
      .from('shorts_videos').select('*').is('grupo', null).order('created_at', { ascending: false });
    if (shortsData) setShorts(shortsData as ShortVideo[]);
    // Mensagens (blog)
    const { data: mensagensData } = await supabase
      .from('mensagens').select('*').order('data', { ascending: false });
    if (mensagensData) setMensagens(mensagensData as MensagemBlog[]);
    // Mensagens de contato (enviadas pelo botão "Contato" nos grupos)
    const { data: contatoData } = await supabase
      .from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200);
    if (contatoData) setContatoMensagens(contatoData as ContactMessage[]);
    // Pedidos de oração (enviados pelo Perfil > Pedidos de Oração)
    const { data: oracaoData } = await supabase
      .from('prayer_requests')
      .select('*, profiles!prayer_requests_user_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (oracaoData) setPedidosOracao(oracaoData as unknown as PrayerRequest[]);
    // Escalas — áreas, time de cada uma, e quais áreas o usuário logado lidera
    const { data: areasData } = await supabase.from('escala_areas').select('*').order('nome');
    if (areasData) setEscalaAreas(areasData as EscalaArea[]);
    const { data: volData } = await supabase
      .from('escala_area_voluntarios')
      .select('id, area_id, membro_id, members(nome, sobrenome)');
    if (volData) {
      setAreaVoluntarios((volData as any[]).map(v => ({
        id: v.id, area_id: v.area_id, membro_id: v.membro_id,
        nome: v.members?.nome ?? '', sobrenome: v.members?.sobrenome ?? '',
      })));
    }
    if (user) {
      const { data: liderData } = await supabase
        .from('escala_area_lideres').select('area_id').eq('profile_id', user.id);
      setAreasLideradas((liderData ?? []).map((r: any) => r.area_id));
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  const deleteOffering = (id: string) => {
    Alert.alert(t('admin.removerRegistro'), t('admin.desejaRemoverEsteRegistroDe'), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await apagarLinha('offerings', id);
        fetchData();
      }},
    ]);
  };

  const deleteAviso = (id: string) => {
    Alert.alert(t('admin.removerAviso'), t('admin.desejaRemoverEsteAviso'), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await apagarLinha('avisos', id);
        fetchData();
      }},
    ]);
  };

  const deleteDevocional = (id: string) => {
    Alert.alert(t('admin.removerDevocional'), t('admin.desejaRemoverEsteDevocional'), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await apagarLinha('devocionais', id);
        fetchData();
      }},
    ]);
  };

  const marcarContatoRespondido = async (id: string) => {
    await supabase.from('contact_messages').update({ status: 'respondido' }).eq('id', id);
    fetchData();
  };

  const deleteContato = (id: string) => {
    Alert.alert(t('admin.removerMensagem'), t('admin.desejaRemoverEstaMensagemDe'), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await apagarLinha('contact_messages', id);
        fetchData();
      }},
    ]);
  };

  const responderPorEmail = (msg: ContactMessage) => {
    if (!msg.email) return;
    const assunto = msg.grupo ? `Re: ${NOME_GRUPO[msg.grupo] ? t(NOME_GRUPO[msg.grupo]) : msg.grupo} — Peniel Church App` : 'Re: Peniel Church App';
    Linking.openURL(`mailto:${msg.email}?subject=${encodeURIComponent(assunto)}`).catch(() => {});
  };

  const avancarStatusOracao = async (pedido: PrayerRequest) => {
    const proximo = pedido.status === 'aberto' ? 'em_oracao' : 'respondido';
    await supabase.from('prayer_requests').update({ status: proximo, updated_at: new Date().toISOString() }).eq('id', pedido.id);
    fetchData();
  };

  // Liga/desliga o destaque da Home direto na lista, sem precisar recriar o
  // evento. Desligar tira só da Home — o evento continua normal na Agenda.
  // Ligar não exige desligar o anterior: o trigger no banco faz isso sozinho.
  const toggleDestaqueHome = async (evento: AgendaEvento) => {
    const { error } = await supabase
      .from('agenda_eventos')
      .update({ destaque_home: !evento.destaque_home })
      .eq('id', evento.id);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    fetchData();
  };

  // Mesmo mecanismo do destaque de evento, para avisos e shorts. Cada tabela
  // tem seu próprio destaque (dá pra ter 1 evento + 1 aviso + 1 short na Home
  // ao mesmo tempo) e seu próprio trigger garantindo um só por tabela.
  const toggleDestaqueHomeGenerico = async (
    tabela: 'avisos' | 'shorts_videos',
    id: string,
    atual: boolean,
  ) => {
    const { error } = await supabase.from(tabela).update({ destaque_home: !atual }).eq('id', id);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    fetchData();
  };

  const deleteEvento = (id: string) => {
    Alert.alert(t('admin.removerEvento'), t('admin.desejaRemoverEsteEventoDa'), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await apagarLinha('agenda_eventos', id);
        fetchData();
      }},
    ]);
  };

  const deleteShort = (id: string) => {
    Alert.alert(t('admin.removerShort'), t('admin.desejaRemoverEsteVideo'), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await apagarLinha('shorts_videos', id);
        fetchData();
      }},
    ]);
  };

  const deleteMensagem = (id: string) => {
    Alert.alert(t('admin.removerMensagem'), t('admin.desejaRemoverEstaMensagemDo'), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await apagarLinha('mensagens', id);
        fetchData();
      }},
    ]);
  };

  useEffect(() => { if (!loadingRole && role) fetchData(); }, [loadingRole, role, fetchData]);

  const deleteInvite = (id: string) => {
    Alert.alert(t('admin.removerConvite'), t('admin.desejaRemoverEsteCodigo'), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await apagarLinha('invite_codes', id);
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

  const ehAdmin = role === 'admin';
  // Quem só lidera área de escala começa (e fica) na aba Escalas.
  const abasVisiveis = ehAdmin
    ? (['convites', 'avisos', 'devocionais', 'mensagens', 'contato', 'oracao', 'agenda', 'shorts', 'ofertas', 'escalas', 'stats'] as const)
    : (['escalas'] as const);
  const abaAtual = abasVisiveis.includes(activeTab as any) ? activeTab : 'escalas';

  // Acesso negado
  if (!ehAdmin && !lideraAreaEscala) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{t('admin.admin')}</Text>
        </View>
        <View style={s.denied}>
          <Ionicons name="lock-closed-outline" size={48} color={C.textDim} />
          <Text style={s.deniedTitle}>{t('admin.acessoRestrito')}</Text>
          <Text style={s.deniedSub}>{t('admin.estaAreaEExclusivaPara')}</Text>
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
          <Text style={s.headerTitle}>{t('admin.painelAdmin')}</Text>
          <Text style={s.headerSub}>{ehAdmin ? t('admin.administrador') : t('admin.liderDeEscala')}</Text>
        </View>
        {!(abaAtual === 'escalas' && !ehAdmin) && abaAtual !== 'contato' && abaAtual !== 'oracao' && (
          <TouchableOpacity
            style={s.newBtn}
            onPress={() => {
              if (abaAtual === 'ofertas') setOfertaModalVisible(true);
              else if (abaAtual === 'avisos') setAvisoModalVisible(true);
              else if (abaAtual === 'devocionais') setDevocionalModalVisible(true);
              else if (abaAtual === 'agenda') setEventoModalVisible(true);
              else if (abaAtual === 'shorts') setShortModalVisible(true);
              else if (abaAtual === 'mensagens') setMensagemModalVisible(true);
              else if (abaAtual === 'escalas') setAreaModalVisible(true);
              else setModalVisible(true);
            }}
          >
            <Ionicons name="add" size={18} color={C.primary} />
            <Text style={s.newBtnText}>
              {abaAtual === 'ofertas' ? t('admin.novaOferta') : abaAtual === 'avisos' ? t('admin.novoAviso') : abaAtual === 'devocionais' ? t('admin.novoDevocional') : abaAtual === 'agenda' ? t('admin.novoEvento') : abaAtual === 'shorts' ? t('admin.novoShort') : abaAtual === 'mensagens' ? t('admin.novaMensagem') : abaAtual === 'escalas' ? t('admin.novaArea') : t('admin.novoConvite')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={s.tabRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tabRowScroll}
          contentContainerStyle={s.tabRow}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            setTabsScrollFim(contentOffset.x + layoutMeasurement.width >= contentSize.width - 12);
          }}
        >
          {abasVisiveis.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.tabBtn, abaAtual === tab && s.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons
                name={tab === 'convites' ? 'ticket-outline' : tab === 'avisos' ? 'megaphone-outline' : tab === 'devocionais' ? 'book-outline' : tab === 'mensagens' ? 'newspaper-outline' : tab === 'contato' ? 'chatbubble-ellipses-outline' : tab === 'oracao' ? 'heart-outline' : tab === 'agenda' ? 'calendar-outline' : tab === 'shorts' ? 'film-outline' : tab === 'ofertas' ? 'gift-outline' : tab === 'escalas' ? 'people-circle-outline' : 'bar-chart-outline'}
                size={14}
                color={abaAtual === tab ? C.purple : C.textMuted}
              />
              {tab === 'contato' && contatoMensagens.some(m => m.status === 'novo') && (
                <View style={s.tabDot} />
              )}
              {tab === 'oracao' && pedidosOracao.some(p => p.status === 'aberto') && (
                <View style={s.tabDot} />
              )}
              <Text style={[s.tabBtnText, abaAtual === tab && { color: C.purple, fontWeight: '700' }]}>
                {t(`admin.aba_${tab}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {!tabsScrollFim && (
          <View pointerEvents="none" style={s.tabsFade}>
            <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
          </View>
        )}
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
          {abaAtual === 'convites' && (
            <>
              {/* Summary */}
              <View style={s.summaryRow}>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.success }]}>{invites.filter(i => !i.is_used).length}</Text>
                  <Text style={s.summaryLabel}>{t('admin.disponiveis')}</Text>
                </View>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.textMuted }]}>{invites.filter(i => i.is_used).length}</Text>
                  <Text style={s.summaryLabel}>{t('admin.usados')}</Text>
                </View>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.purple }]}>{invites.length}</Text>
                  <Text style={s.summaryLabel}>{t('admin.total')}</Text>
                </View>
              </View>

              {invites.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="ticket-outline" size={40} color={C.textDim} />
                  <Text style={s.emptyText}>{t('admin.nenhumConviteGeradoAinda')}</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => setModalVisible(true)}>
                    <Text style={s.emptyBtnText}>{t('admin.criarPrimeiroConvite')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                invites.map(invite => (
                  <View key={invite.id} style={[s.inviteCard, invite.is_used && s.inviteCardUsed]}>
                    <View style={s.inviteLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[s.inviteCode, invite.is_used && { color: C.textMuted }]}>
                          {invite.code}
                        </Text>
                        {invite.tipo === 'banda' && (
                          <View style={[s.statusBadge, { backgroundColor: C.purple + '18' }]}>
                            <Text style={[s.statusBadgeText, { color: C.purple }]}>{t('admin.pillBanda')}</Text>
                          </View>
                        )}
                      </View>
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

          {/* ══ AVISOS ════════════════════════════════════════════════════════ */}
          {abaAtual === 'avisos' && (
            <>
              {avisos.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="megaphone-outline" size={40} color={C.textDim} />
                  <Text style={s.emptyText}>{t('admin.nenhumAvisoPublicadoAinda')}</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => setAvisoModalVisible(true)}>
                    <Text style={s.emptyBtnText}>{t('admin.publicarPrimeiroAviso')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                avisos.map(a => (
                  <View key={a.id} style={s.inviteCard}>
                    <View style={s.inviteLeft}>
                      <Text style={s.inviteCode}>{a.titulo}</Text>
                      <Text style={[s.inviteEmail, { marginTop: 4 }]} numberOfLines={2}>{a.texto}</Text>
                      <View style={s.inviteMetaRow}>
                        <View style={[s.statusBadge, {
                          backgroundColor: a.tipo === 'urgente' ? C.danger + '18' : a.tipo === 'evento' ? C.purple + '18' : C.success + '18',
                        }]}>
                          <Text style={[s.statusBadgeText, {
                            color: a.tipo === 'urgente' ? C.danger : a.tipo === 'evento' ? C.purple : C.success,
                          }]}>
                            {a.tipo === 'urgente' ? '🚨 Urgente' : a.tipo === 'evento' ? '📅 Evento' : '📢 Geral'}
                          </Text>
                        </View>
                        {a.destaque_home && (
                          <View style={[s.statusBadge, { backgroundColor: C.accent + '30' }]}>
                            <Text style={[s.statusBadgeText, { color: C.accentDim }]}>{t('admin.naHome')}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={s.inviteActions}>
                      <TouchableOpacity
                        style={[s.actionBtn, { borderColor: a.destaque_home ? C.accent : C.textDim + '40' }]}
                        onPress={() => toggleDestaqueHomeGenerico('avisos', a.id, a.destaque_home)}
                      >
                        <Ionicons name={a.destaque_home ? 'home' : 'home-outline'} size={16} color={a.destaque_home ? C.accent : C.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.actionBtn, { borderColor: C.danger + '40' }]} onPress={() => deleteAviso(a.id)}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ══ DEVOCIONAIS ═══════════════════════════════════════════════════ */}
          {abaAtual === 'devocionais' && (
            <>
              <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 18 }}>
                Devocionais gerais aparecem em destaque na Home pra todo mundo. Devocionais de grupo só aparecem pra quem tem acesso àquele grupo.
              </Text>
              {devocionais.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="book-outline" size={40} color={C.textDim} />
                  <Text style={s.emptyText}>{t('admin.nenhumDevocionalPublicadoAinda')}</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => setDevocionalModalVisible(true)}>
                    <Text style={s.emptyBtnText}>{t('admin.publicarPrimeiroDevocional')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                devocionais.map(d => (
                  <View key={d.id} style={s.inviteCard}>
                    <View style={s.inviteLeft}>
                      <Text style={s.inviteCode}>{d.titulo}</Text>
                      <Text style={[s.inviteEmail, { marginTop: 4, fontStyle: 'italic' }]} numberOfLines={2}>
                        "{d.versiculo}" — {d.referencia}
                      </Text>
                      <View style={s.inviteMetaRow}>
                        <View style={[s.statusBadge, { backgroundColor: C.purple + '18' }]}>
                          <Text style={[s.statusBadgeText, { color: C.purple }]}>{formatDate(d.data)}</Text>
                        </View>
                        <View style={[s.statusBadge, { backgroundColor: (d.grupo ? C.accentDim : C.success) + '18' }]}>
                          <Text style={[s.statusBadgeText, { color: d.grupo ? C.accentDim : C.success }]}>
                            {d.grupo ? (NOME_GRUPO[d.grupo] ? t(NOME_GRUPO[d.grupo]) : d.grupo) : t('admin.devocionalPeniel')}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.inviteActions}>
                      <TouchableOpacity style={[s.actionBtn, { borderColor: C.danger + '40' }]} onPress={() => deleteDevocional(d.id)}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ══ MENSAGENS (blog) ═════════════════════════════════════════════ */}
          {abaAtual === 'mensagens' && (
            <>
              <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 18 }}>
                A mensagem mais recente aparece em destaque na Home. Todas ficam listadas na aba Mensagens dentro de Mídia.
              </Text>
              {mensagens.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="newspaper-outline" size={40} color={C.textDim} />
                  <Text style={s.emptyText}>{t('admin.nenhumaMensagemPublicadaAinda')}</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => setMensagemModalVisible(true)}>
                    <Text style={s.emptyBtnText}>{t('admin.publicarPrimeiraMensagem')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                mensagens.map(m => (
                  <View key={m.id} style={s.inviteCard}>
                    {!!m.imagem_url && (
                      <Image source={{ uri: m.imagem_url }} style={{ width: 48, height: 48, borderRadius: 8, marginRight: 10 }} />
                    )}
                    <View style={s.inviteLeft}>
                      <Text style={s.inviteCode}>{m.titulo}</Text>
                      <Text style={[s.inviteEmail, { marginTop: 4 }]} numberOfLines={2}>{m.resumo}</Text>
                      <View style={s.inviteMetaRow}>
                        <View style={[s.statusBadge, { backgroundColor: C.purple + '18' }]}>
                          <Text style={[s.statusBadgeText, { color: C.purple }]}>{formatDate(m.data)} · {m.autor}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.inviteActions}>
                      <TouchableOpacity style={[s.actionBtn, { borderColor: C.danger + '40' }]} onPress={() => deleteMensagem(m.id)}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ══ CONTATO ═══════════════════════════════════════════════════════ */}
          {abaAtual === 'contato' && (
            <>
              <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 18 }}>
                Mensagens enviadas pelo botão "Contato" nos grupos (e visitantes sem conta). Ninguém mais vê essas mensagens.
              </Text>
              <View style={s.summaryRow}>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.danger }]}>{contatoMensagens.filter(m => m.status !== 'respondido').length}</Text>
                  <Text style={s.summaryLabel}>{t('admin.pendentes')}</Text>
                </View>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.purple }]}>{contatoMensagens.length}</Text>
                  <Text style={s.summaryLabel}>{t('admin.total')}</Text>
                </View>
              </View>
              {contatoMensagens.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="chatbubble-ellipses-outline" size={40} color={C.textDim} />
                  <Text style={s.emptyText}>{t('admin.nenhumaMensagemDeContatoAinda')}</Text>
                </View>
              ) : (
                contatoMensagens.map(msg => (
                  <View key={msg.id} style={s.inviteCard}>
                    <View style={s.inviteLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.inviteCode}>{msg.nome}</Text>
                        {!!msg.grupo && (
                          <View style={[s.statusBadge, { backgroundColor: C.purple + '18' }]}>
                            <Text style={[s.statusBadgeText, { color: C.purple }]}>{NOME_GRUPO[msg.grupo] ? t(NOME_GRUPO[msg.grupo]) : msg.grupo}</Text>
                          </View>
                        )}
                      </View>
                      {!!msg.email && (
                        <View style={s.inviteEmailRow}>
                          <Ionicons name="mail-outline" size={12} color={C.textMuted} />
                          <Text style={s.inviteEmail}>{msg.email}</Text>
                        </View>
                      )}
                      <Text style={[s.inviteEmail, { marginTop: 4 }]}>{msg.mensagem}</Text>
                      <View style={s.inviteMetaRow}>
                        <View style={[s.statusBadge, {
                          backgroundColor: msg.status === 'respondido' ? C.success + '18' : msg.status === 'lido' ? C.textMuted + '20' : C.danger + '18',
                        }]}>
                          <Text style={[s.statusBadgeText, {
                            color: msg.status === 'respondido' ? C.success : msg.status === 'lido' ? C.textMuted : C.danger,
                          }]}>
                            {msg.status === 'respondido' ? '✓ Respondido' : msg.status === 'lido' ? 'Lido' : '● Novo'} · {formatDate(msg.created_at)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.inviteActions}>
                      {!!msg.email && (
                        <TouchableOpacity style={s.actionBtn} onPress={() => responderPorEmail(msg)}>
                          <Ionicons name="arrow-undo-outline" size={16} color={C.purple} />
                        </TouchableOpacity>
                      )}
                      {msg.status !== 'respondido' && (
                        <TouchableOpacity style={[s.actionBtn, { borderColor: C.success + '40' }]} onPress={() => marcarContatoRespondido(msg.id)}>
                          <Ionicons name="checkmark-circle-outline" size={16} color={C.success} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[s.actionBtn, { borderColor: C.danger + '40' }]} onPress={() => deleteContato(msg.id)}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ══ ORAÇÃO ═════════════════════════════════════════════════════════ */}
          {abaAtual === 'oracao' && (
            <>
              <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 18 }}>
                Pedidos enviados pelo Perfil {'>'} Pedidos de Oração. Só admin/líder vê — inclusive o próprio membro só vê os dele.
              </Text>
              <View style={s.summaryRow}>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.danger }]}>{pedidosOracao.filter(p => p.status === 'aberto').length}</Text>
                  <Text style={s.summaryLabel}>{t('admin.abertos')}</Text>
                </View>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.accentDim }]}>{pedidosOracao.filter(p => p.status === 'em_oracao').length}</Text>
                  <Text style={s.summaryLabel}>{t('admin.emOracao')}</Text>
                </View>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.purple }]}>{pedidosOracao.length}</Text>
                  <Text style={s.summaryLabel}>{t('admin.total')}</Text>
                </View>
              </View>
              {pedidosOracao.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="heart-outline" size={40} color={C.textDim} />
                  <Text style={s.emptyText}>{t('admin.nenhumPedidoDeOracaoAinda')}</Text>
                </View>
              ) : (
                pedidosOracao.map(p => (
                  <View key={p.id} style={s.inviteCard}>
                    <View style={s.inviteLeft}>
                      <Text style={s.inviteCode}>{p.titulo}</Text>
                      <View style={s.inviteEmailRow}>
                        <Ionicons name="person-outline" size={12} color={C.textMuted} />
                        <Text style={s.inviteEmail}>{p.profiles?.full_name ?? '—'}</Text>
                      </View>
                      <Text style={[s.inviteEmail, { marginTop: 4 }]}>{p.descricao}</Text>
                      <View style={s.inviteMetaRow}>
                        <View style={[s.statusBadge, {
                          backgroundColor: p.status === 'respondido' ? C.success + '18' : p.status === 'em_oracao' ? C.accentDim + '18' : C.danger + '18',
                        }]}>
                          <Text style={[s.statusBadgeText, {
                            color: p.status === 'respondido' ? C.success : p.status === 'em_oracao' ? C.accentDim : C.danger,
                          }]}>
                            {p.status === 'respondido' ? '✓ Respondido' : p.status === 'em_oracao' ? '🙏 Em oração' : '● Aberto'} · {formatDate(p.created_at)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {p.status !== 'respondido' && (
                      <View style={s.inviteActions}>
                        <TouchableOpacity style={[s.actionBtn, { borderColor: C.success + '40' }]} onPress={() => avancarStatusOracao(p)}>
                          <Ionicons name={p.status === 'aberto' ? 'heart-half-outline' : 'checkmark-circle-outline'} size={16} color={C.success} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </>
          )}

          {/* ══ AGENDA ════════════════════════════════════════════════════════ */}
          {abaAtual === 'agenda' && (
            <>
              {eventosAgenda.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="calendar-outline" size={40} color={C.textDim} />
                  <Text style={s.emptyText}>{t('admin.nenhumEventoCadastradoAinda')}</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => setEventoModalVisible(true)}>
                    <Text style={s.emptyBtnText}>{t('admin.criarPrimeiroEvento')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                eventosAgenda.map(e => (
                  <View key={e.id} style={s.inviteCard}>
                    <View style={s.inviteLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.inviteCode}>{e.nome}</Text>
                        {e.especial && (
                          <View style={[s.statusBadge, { backgroundColor: '#E84B1A18' }]}>
                            <Text style={[s.statusBadgeText, { color: '#E84B1A' }]}>⭐ Especial</Text>
                          </View>
                        )}
                        {e.destaque_home && (
                          <View style={[s.statusBadge, { backgroundColor: C.accent + '30' }]}>
                            <Text style={[s.statusBadgeText, { color: C.accentDim }]}>{t('admin.naHome')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[s.inviteEmail, { marginTop: 4 }]}>
                        {e.recorrente ? `Toda ${DIAS_SEMANA_LABELS[e.dia_semana ?? 0]}` : e.data} · {e.horario} · {e.local}
                      </Text>
                      <View style={s.inviteMetaRow}>
                        <View style={[s.statusBadge, {
                          backgroundColor: e.tipo === 'online' ? C.success + '18' : e.tipo === 'casa' ? C.accent + '30' : C.purple + '18',
                        }]}>
                          <Text style={[s.statusBadgeText, {
                            color: e.tipo === 'online' ? C.success : e.tipo === 'casa' ? C.accentDim : C.purple,
                          }]}>
                            {e.tipo === 'presencial' ? 'Igreja' : e.tipo === 'online' ? 'Online' : 'Nas casas'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.inviteActions}>
                      <TouchableOpacity
                        style={[s.actionBtn, { borderColor: e.destaque_home ? C.accent : C.textDim + '40' }]}
                        onPress={() => toggleDestaqueHome(e)}
                      >
                        <Ionicons name={e.destaque_home ? 'home' : 'home-outline'} size={16} color={e.destaque_home ? C.accent : C.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.actionBtn, { borderColor: C.danger + '40' }]} onPress={() => deleteEvento(e.id)}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ══ SHORTS ════════════════════════════════════════════════════════ */}
          {abaAtual === 'shorts' && (
            <>
              {shorts.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="film-outline" size={40} color={C.textDim} />
                  <Text style={s.emptyText}>{t('admin.nenhumVideoCurtoPublicadoAinda')}</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => setShortModalVisible(true)}>
                    <Text style={s.emptyBtnText}>{t('admin.publicarPrimeiroShort')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                shorts.map(sh => (
                  <View key={sh.id} style={s.inviteCard}>
                    <View style={s.inviteLeft}>
                      <Text style={s.inviteCode}>{sh.titulo}</Text>
                      <Text style={[s.inviteEmail, { marginTop: 4 }]} numberOfLines={1}>{sh.url}</Text>
                      <View style={s.inviteMetaRow}>
                        <View style={[s.statusBadge, { backgroundColor: sh.plataforma === 'youtube' ? '#FF000018' : '#E1306C18' }]}>
                          <Text style={[s.statusBadgeText, { color: sh.plataforma === 'youtube' ? '#FF0000' : '#E1306C' }]}>
                            {sh.plataforma === 'youtube' ? '▶️ YouTube' : '📸 Instagram'}
                          </Text>
                        </View>
                        {sh.destaque_home && (
                          <View style={[s.statusBadge, { backgroundColor: C.accent + '30' }]}>
                            <Text style={[s.statusBadgeText, { color: C.accentDim }]}>{t('admin.naHome')}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={s.inviteActions}>
                      <TouchableOpacity
                        style={[s.actionBtn, { borderColor: sh.destaque_home ? C.accent : C.textDim + '40' }]}
                        onPress={() => toggleDestaqueHomeGenerico('shorts_videos', sh.id, sh.destaque_home)}
                      >
                        <Ionicons name={sh.destaque_home ? 'home' : 'home-outline'} size={16} color={sh.destaque_home ? C.accent : C.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.actionBtn, { borderColor: C.danger + '40' }]} onPress={() => deleteShort(sh.id)}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ══ OFERTAS ═══════════════════════════════════════════════════════ */}
          {abaAtual === 'ofertas' && (
            <>
              <View style={s.summaryRow}>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { fontSize: 20, color: C.purple }]}>
                    £{offerings.reduce((sum, o) => sum + Number(o.valor), 0).toFixed(0)}
                  </Text>
                  <Text style={s.summaryLabel}>{t('admin.totalRegistrado')}</Text>
                </View>
                <View style={s.summaryCard}>
                  <Text style={[s.summaryNum, { color: C.success }]}>{offerings.length}</Text>
                  <Text style={s.summaryLabel}>{t('admin.registros')}</Text>
                </View>
              </View>

              {offerings.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="gift-outline" size={40} color={C.textDim} />
                  <Text style={s.emptyText}>{t('admin.nenhumaOfertaRegistradaAinda')}</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => setOfertaModalVisible(true)}>
                    <Text style={s.emptyBtnText}>{t('admin.registrarPrimeiraOferta')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                offerings.map(o => (
                  <View key={o.id} style={s.inviteCard}>
                    <View style={s.inviteLeft}>
                      <Text style={s.inviteCode}>{o.profiles?.full_name ?? 'Membro removido'}</Text>
                      <View style={s.inviteMetaRow}>
                        <View style={[s.statusBadge, { backgroundColor: C.purple + '18' }]}>
                          <Text style={[s.statusBadgeText, { color: C.purple }]}>
                            £{Number(o.valor).toFixed(2)} · {o.tipo === 'dizimo' ? t('admin.tipoDizimo') : o.tipo === 'oferta' ? t('admin.tipoOferta') : o.tipo === 'missoes' ? t('admin.tipoMissoes') : t('admin.tipoOutro')}
                          </Text>
                        </View>
                      </View>
                      <Text style={[s.inviteEmail, { marginTop: 6 }]}>{formatDate(o.data)} · {o.metodo ?? '—'}</Text>
                    </View>
                    <View style={s.inviteActions}>
                      <TouchableOpacity style={[s.actionBtn, { borderColor: C.danger + '40' }]} onPress={() => deleteOffering(o.id)}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ══ ESCALAS ═══════════════════════════════════════════════════════ */}
          {abaAtual === 'escalas' && (() => {
            const areasVisiveis = role === 'admin'
              ? escalaAreas
              : escalaAreas.filter(a => areasLideradas.includes(a.id));
            return (
              <>
                {role === 'admin' && (
                  <TouchableOpacity
                    style={[s.inviteCard, { backgroundColor: C.purple + '10', borderColor: C.purple + '30', marginBottom: 16 }]}
                    onPress={() => setGerarEscalaModalVisible(true)}
                  >
                    <View style={s.inviteLeft}>
                      <Text style={[s.inviteCode, { color: C.purple }]}>{t('admin.gerarEscalaDoSemestre')}</Text>
                      <Text style={s.emptyText}>{t('admin.distribuiOsVoluntariosPelosDomingos')}</Text>
                    </View>
                    <Ionicons name="shuffle-outline" size={22} color={C.purple} />
                  </TouchableOpacity>
                )}
                <Text style={s.sectionLabel}>{t('admin.areasDeServico')}</Text>
                {areasVisiveis.length === 0 ? (
                  <View style={s.empty}>
                    <Ionicons name="people-circle-outline" size={40} color={C.textDim} />
                    <Text style={s.emptyText}>
                      {role === 'admin' ? t('admin.nenhumaAreaCadastradaAinda') : t('admin.voceAindaNaoLideraArea')}
                    </Text>
                  </View>
                ) : (
                  areasVisiveis.map(area => {
                    const time = areaVoluntarios.filter(v => v.area_id === area.id);
                    return (
                      <TouchableOpacity key={area.id} style={s.inviteCard} onPress={() => setAreaGerenciarVisible(area)}>
                        <View style={s.inviteLeft}>
                          <Text style={s.inviteCode}>{area.nome}</Text>
                          <View style={s.inviteMetaRow}>
                            <View style={[s.statusBadge, { backgroundColor: C.purple + '18' }]}>
                              <Text style={[s.statusBadgeText, { color: C.purple }]}>
                                {time.length} no time · {area.vagas_padrao} vagas/domingo
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            );
          })()}

          {/* ══ ESTATÍSTICAS ══════════════════════════════════════════════════ */}
          {abaAtual === 'stats' && (
            <>
              <Text style={s.sectionLabel}>{t('admin.usuariosDoApp')}</Text>
              <View style={s.statsGrid}>
                {[
                  { label: t('admin.total'), value: stats.total, icon: 'people-outline', color: C.primary },
                  { label: t('admin.statMembros'), value: stats.membros, icon: 'person-outline', color: C.success },
                  { label: t('admin.statLideres'), value: stats.lideres, icon: 'star-outline', color: C.accent },
                  { label: t('admin.statVisitantes'), value: stats.visitantes, icon: 'eye-outline', color: C.textMuted },
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

              <Text style={[s.sectionLabel, { marginTop: 24 }]}>{t('admin.convites')}</Text>
              <View style={s.inviteStatsCard}>
                <View style={s.inviteStatRow}>
                  <Text style={s.inviteStatLabel}>{t('admin.totalGerados')}</Text>
                  <Text style={s.inviteStatValue}>{invites.length}</Text>
                </View>
                <View style={s.inviteStatRow}>
                  <Text style={s.inviteStatLabel}>{t('admin.utilizados')}</Text>
                  <Text style={[s.inviteStatValue, { color: C.success }]}>{invites.filter(i => i.is_used).length}</Text>
                </View>
                <View style={[s.inviteStatRow, { borderBottomWidth: 0 }]}>
                  <Text style={s.inviteStatLabel}>{t('admin.disponiveis')}</Text>
                  <Text style={[s.inviteStatValue, { color: C.purple }]}>{invites.filter(i => !i.is_used).length}</Text>
                </View>
              </View>

              {/* Taxa de conversão */}
              {invites.length > 0 && (
                <View style={s.conversionCard}>
                  <Text style={s.conversionLabel}>{t('admin.taxaDeAtivacao')}</Text>
                  <Text style={s.conversionValue}>
                    {Math.round((invites.filter(i => i.is_used).length / invites.length) * 100)}%
                  </Text>
                  <Text style={s.conversionSub}>{t('admin.dosConvitesForamUtilizados')}</Text>
                </View>
              )}

              {/* Aniversários do mês */}
              <Text style={[s.sectionLabel, { marginTop: 24 }]}>{t('admin.aniversariosDoMes')}</Text>
              {monthBirthdays.length === 0 ? (
                <View style={[s.empty, { paddingVertical: 24 }]}>
                  <Text style={s.emptyText}>{t('admin.nenhumAniversarioEsteMes')}</Text>
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
                          <Text style={s.todayBadgeText}>{t('admin.hoje')}</Text>
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
      <NovaOfertaModal
        visible={ofertaModalVisible}
        onClose={() => setOfertaModalVisible(false)}
        onSaved={fetchData}
        adminId={user?.id}
      />
      <NovoAvisoModal
        visible={avisoModalVisible}
        onClose={() => setAvisoModalVisible(false)}
        onSaved={fetchData}
      />
      <NovoDevocionalModal
        visible={devocionalModalVisible}
        onClose={() => setDevocionalModalVisible(false)}
        onSaved={fetchData}
      />
      <NovoEventoModal
        visible={eventoModalVisible}
        onClose={() => setEventoModalVisible(false)}
        onSaved={fetchData}
      />
      <NovoShortModal
        visible={shortModalVisible}
        onClose={() => setShortModalVisible(false)}
        onSaved={fetchData}
      />
      <NovaMensagemModal
        visible={mensagemModalVisible}
        onClose={() => setMensagemModalVisible(false)}
        onSaved={fetchData}
      />
      <NovaAreaModal
        visible={areaModalVisible}
        onClose={() => setAreaModalVisible(false)}
        onSaved={fetchData}
      />
      <AreaVoluntariosModal
        visible={!!areaGerenciarVisible}
        area={areaGerenciarVisible}
        onClose={() => setAreaGerenciarVisible(null)}
        onChanged={fetchData}
      />
      <GerarEscalaModal
        visible={gerarEscalaModalVisible}
        areas={escalaAreas}
        voluntarios={areaVoluntarios}
        userId={user?.id}
        onClose={() => setGerarEscalaModalVisible(false)}
        onGerado={fetchData}
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
  tabRowWrap: { position: 'relative' },
  tabRowScroll: { backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tabRow: { flexDirection: 'row' },
  // Sinaliza que dá pra arrastar pra ver mais abas (some quando chega no fim).
  tabsFade: { position: 'absolute', right: 0, top: 0, bottom: 1, width: 30, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', opacity: 0.94 },
  // Mais compacto que antes de propósito: com 9 abas, dava pra ver só
  // 3 de cada vez (parecia que a barra tava "cortada pela metade"). Com
  // menos padding/fonte, cabem ~5-6 na tela sem precisar arrastar tanto.
  tabBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 10 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: C.purple },
  tabBtnText: { fontSize: 12.5, color: C.textMuted, fontWeight: '500' },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.danger },
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
