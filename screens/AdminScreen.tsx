import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, StatusBar, ActivityIndicator,
  Share, RefreshControl, Modal, Image,
  KeyboardAvoidingView, Platform, Linking, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { apagarLinha } from '../lib/db';
import { mascaraDataBR, dataBRparaISO, isoParaDataBR } from '../lib/datas';
import { useAuth } from '../lib/useAuth';
import { useBirthdays } from '../lib/useBirthdays';
import { useTranslation } from 'react-i18next';
import { APP_LINK_URL } from '../lib/appLinks';
import { versaoDoBinario } from '../lib/recursosNativos';
import DenunciasAdmin from '../components/DenunciasAdmin';
import CultoDaSemanaAdmin from '../components/CultoDaSemanaAdmin';

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

type Aviso = {
  id: string; titulo: string; texto: string; data: string; tipo: string; destaque_home: boolean;
  cta_texto: string | null; cta_url: string | null;
};

type DevocionalGeral = {
  id: string; titulo: string; versiculo: string; referencia: string;
  texto: string; autor: string | null; data: string; grupo: string | null;
};

type AgendaEvento = {
  id: string; nome: string; tipo: string; recorrente: boolean; dia_semana: number | null;
  data: string | null; horario: string; local: string; descricao: string | null;
  link_zoom: string | null; especial: boolean; cor: string | null;
  destaque_home: boolean; cta_texto: string | null; cta_url: string | null;
  imagem_url: string | null;
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
  infantil: 'membros.penielKids',
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
  { valor: 'infantil', chave: 'membros.penielKids' },
];

type EscalaArea = { id: string; nome: string; vagas_padrao: number; em_duplas?: boolean; exige_lider?: boolean };
type EscalaDupla = { id: string; area_id: string; membro_a: string; membro_b: string };
type AreaVoluntario = { id: string; area_id: string; membro_id: string; nome: string; sobrenome: string; lider_de_turno?: boolean };
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
  // Desde 16/10 não existe mais convite de MEMBRO: a pessoa cria o perfil e o
  // Admin toca em "Tornar membro". Aqui só sobrou o código da Banda.
  const [tipo, setTipo] = useState<'membro' | 'banda'>('banda');
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
      ? `🎵 Seu convite para a área da Banda de Louvor — Peniel Church:\n\nCódigo: ${code}\n\nAbra o app, vá em Membros → Banda, e insira este código para ativar seu acesso.\n\nVálido por ${days} dias. Uso único.\n\nAinda não tem o app? Baixe aqui: ${APP_LINK_URL}`
      : `🔑 Seu convite para o app Peniel Church:\n\nCódigo: ${code}\n\nAbra o app, vá em Membros e insira este código para ativar seu acesso.\n\nVálido por ${days} dias.\n\nAinda não tem o app? Baixe aqui: ${APP_LINK_URL}`;
    await Share.share({ message: mensagem, title: 'Convite Peniel Church' });

    setEmail('');
    onSaved();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '92%' }}>
        <View style={mo.sheet}>
          <View style={mo.header}>
            <Text style={mo.title}>{t('admin.novoConvite')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Tipo de convite */}
          <View style={mo.fieldWrap}>
            <Text style={mo.fieldLabel}>{t('admin.tipoDeConvite')}</Text>
            <View style={mo.daysRow}>
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
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const mo = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { flexShrink: 1, backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
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
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
// `aviso` preenchido = modo edicao: grava com UPDATE, que NAO dispara push
// (o gatilho de notificacao e so AFTER INSERT). Corrigir um erro de digitacao
// nao manda notificacao de novo para a igreja inteira.
function NovoAvisoModal({ visible, onClose, onSaved, aviso }: {
  visible: boolean; onClose: () => void; onSaved: () => void; aviso?: Aviso | null;
}) {
  const { t } = useTranslation();
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<'geral' | 'evento' | 'urgente'>('geral');
  const [ctaTexto, setCtaTexto] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const editando = !!aviso;

  useEffect(() => {
    if (!visible) { setTitulo(''); setTexto(''); setTipo('geral'); setCtaTexto(''); setCtaUrl(''); return; }
    if (aviso) {
      setTitulo(aviso.titulo ?? ''); setTexto(aviso.texto ?? '');
      setTipo((['geral', 'evento', 'urgente'].includes(aviso.tipo) ? aviso.tipo : 'geral') as 'geral' | 'evento' | 'urgente');
      setCtaTexto(aviso.cta_texto ?? ''); setCtaUrl(aviso.cta_url ?? '');
    }
  }, [visible, aviso]);

  const handleSave = async () => {
    if (!titulo.trim() || !texto.trim()) { Alert.alert(t('common.atencao'), t('admin.preenchaOTituloEO')); return; }
    setSaving(true);
    // O botão é tudo ou nada: sem link não há botão, e com link sem rótulo o
    // app cai em "Abrir link". Gravar um rótulo órfão só criaria um botão
    // invisível que ninguém entende depois.
    const campos = {
      titulo: titulo.trim(), texto: texto.trim(), tipo,
      cta_texto: ctaUrl.trim() ? (ctaTexto.trim() || null) : null,
      cta_url: ctaUrl.trim() || null,
    };
    const { error } = aviso
      ? await supabase.from('avisos').update(campos).eq('id', aviso.id)
      : await supabase.from('avisos').insert({ ...campos, data: new Date().toISOString(), grupo: null });
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
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={mo.header}>
              <Text style={mo.title}>{editando ? t('admin.editarAviso') : t('admin.novoAviso')}</Text>
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

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.linkDoBotao')}</Text>
              <View style={mo.fieldRow}>
                <TextInput
                  style={mo.fieldInput} placeholder="https://us02web.zoom.us/j/..."
                  placeholderTextColor={C.textDim} value={ctaUrl} onChangeText={setCtaUrl}
                  autoCapitalize="none" keyboardType="url"
                />
              </View>
            </View>

            {!!ctaUrl.trim() && (
              <View style={mo.fieldWrap}>
                <Text style={mo.fieldLabel}>{t('admin.textoDoBotao')}</Text>
                <View style={mo.fieldRow}>
                  <TextInput
                    style={mo.fieldInput} placeholder={t('admin.exEntrarNoZoom')}
                    placeholderTextColor={C.textDim} value={ctaTexto} onChangeText={setCtaTexto}
                  />
                </View>
              </View>
            )}

            <Text style={[mo.fieldLabel, { textTransform: 'none', fontWeight: '400', marginBottom: 14, marginTop: -4 }]}>
              {t('admin.botaoAjuda')}
            </Text>

            <TouchableOpacity style={[mo.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name={editando ? 'checkmark' : 'megaphone-outline'} size={18} color="#fff" /><Text style={mo.saveBtnText}>{editando ? t('admin.salvarAlteracoes') : t('admin.publicarAviso')}</Text></>
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
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

// ─── Contas de visitantes (Admin → Estatísticas) ────────────────────────────
// Quem criou conta no app mas ainda não é membro (profiles.role = 'visitante').
// O e-mail vem de auth.users pela RPC listar_contas_visitantes (só admin).
// `visitou_igreja`: bate (e-mail ou telefone) com um registro da Recepção.
type ContaVisitante = { id: string; nome: string | null; email: string | null; criado_em: string; ultimo_acesso: string | null; visitou_igreja?: boolean };

function ContasVisitantesModal({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const [contas, setContas] = useState<ContaVisitante[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [promovendoId, setPromovendoId] = useState<string | null>(null);

  // Mesmo efeito de resgatar um convite: vira 'membro' e ganha ficha no
  // diretório (RPC tornar_visitante_membro, só admin).
  const tornarMembro = (c: ContaVisitante) => {
    Alert.alert(
      t('admin.tornarMembro'),
      t('admin.tornarMembroConfirma', { nome: c.nome?.trim() || c.email || '' }),
      [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('admin.tornarMembro'), onPress: async () => {
          setPromovendoId(c.id);
          const { data, error } = await supabase.rpc('tornar_visitante_membro', { p_profile_id: c.id });
          setPromovendoId(null);
          const res = data as { success?: boolean; error?: string } | null;
          if (error || !res?.success) { Alert.alert(t('common.erro'), error?.message ?? res?.error ?? ''); return; }
          setContas(prev => prev.filter(x => x.id !== c.id));
          onChanged();
        } },
      ],
    );
  };

  useEffect(() => {
    if (!visible) return;
    setCarregando(true);
    supabase.rpc('listar_contas_visitantes').then(({ data, error }) => {
      setCarregando(false);
      if (error) { Alert.alert(t('common.erro'), error.message); return; }
      setContas((data as ContaVisitante[]) ?? []);
    });
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={mo.overlay}>
        <View style={[mo.sheet, { maxHeight: '85%' }]}>
          <View style={mo.header}>
            <Text style={mo.title}>{t('admin.contasVisitantes')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={[mo.fieldHint, { marginTop: -12, marginBottom: 12 }]}>{t('admin.contasVisitantesDica')}</Text>
          {carregando ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: 24 }} />
          ) : contas.length === 0 ? (
            <Text style={{ color: C.textMuted, textAlign: 'center', marginVertical: 24 }}>{t('admin.nenhumaContaVisitante')}</Text>
          ) : (
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
              {contas.map(c => (
                <View key={c.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{c.nome?.trim() || '—'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <Ionicons name={c.visitou_igreja ? 'home-outline' : 'phone-portrait-outline'} size={11} color={c.visitou_igreja ? C.success : C.textMuted} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: c.visitou_igreja ? C.success : C.textMuted }}>
                      {c.visitou_igreja ? t('membros.visitouIgreja') : t('membros.soPeloApp')}
                    </Text>
                  </View>
                  {!!c.email && (
                    <TouchableOpacity onPress={() => Linking.openURL(`mailto:${c.email}`)}>
                      <Text style={{ fontSize: 13, color: C.primary, marginTop: 2 }}>{c.email}</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                    {t('admin.contaCriadaEm')} {isoParaDataBR(c.criado_em)}
                    {c.ultimo_acesso ? ` · ${t('admin.ultimoAcesso')} ${isoParaDataBR(c.ultimo_acesso)}` : ''}
                  </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => tornarMembro(c)}
                    disabled={promovendoId === c.id}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.success + '18', borderWidth: 1, borderColor: C.success + '50' }}
                  >
                    {promovendoId === c.id ? <ActivityIndicator size="small" color={C.success} /> : (
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.success }}>{t('admin.tornarMembro')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Imagem de evento (bucket 'eventos' no Storage) ──────────────────────────
// Mesmo jeito de enviar da capa das Mensagens: lê o arquivo em base64 e sobe
// para o bucket. O bucket é público para leitura (a Home mostra a imagem até
// para quem não tem conta) e só admin consegue enviar (regras eventos_admin_*).
async function escolherImagemEvento(t: (k: string) => string): Promise<string | null> {
  const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissao.granted) {
    Alert.alert(t('admin.permissaoNecessaria'), t('admin.precisamosDeAcessoAsSuas'));
    return null;
  }
  const resultado = await ImagePicker.launchImageLibraryAsync({
    // No iOS o editor de corte do sistema é sempre QUADRADO (o `aspect` só vale
      // no Android) — cortava as capas 16:9. No iOS a foto vai inteira.
      mediaTypes: ['images'], allowsEditing: Platform.OS === 'android', aspect: [2, 1], quality: 0.7,
  });
  if (resultado.canceled || !resultado.assets?.[0]) return null;
  return resultado.assets[0].uri;
}

async function enviarImagemEvento(uriLocal: string): Promise<string> {
  const extensao = uriLocal.split('.').pop()?.toLowerCase() ?? 'jpg';
  const ext = extensao === 'png' ? 'png' : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const base64 = await FileSystem.readAsStringAsync(uriLocal, { encoding: FileSystem.EncodingType.Base64 });
  const caminho = `capas/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('eventos')
    .upload(caminho, decode(base64), { contentType, upsert: true });
  if (error) throw error;
  return supabase.storage.from('eventos').getPublicUrl(caminho).data.publicUrl;
}

function NovoEventoModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'presencial' | 'online' | 'casa'>('presencial');
  const [recorrente, setRecorrente] = useState(true);
  const [diaSemana, setDiaSemana] = useState(0);
  const [data, setData] = useState(''); // DD/MM/AAAA (vira AAAA-MM-DD so ao salvar)
  const [horario, setHorario] = useState('');
  const [local, setLocal] = useState('');
  const [descricao, setDescricao] = useState('');
  const [linkZoom, setLinkZoom] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [especial, setEspecial] = useState(false);
  const [destaqueHome, setDestaqueHome] = useState(false);
  const [ctaTexto, setCtaTexto] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [imagemLocal, setImagemLocal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setImagemLocal(null);
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
    const dataISO = recorrente ? '' : dataBRparaISO(data);
    if (!recorrente && !dataISO) {
      Alert.alert(t('common.atencao'), t('admin.informeADataNoFormato'));
      return;
    }
    setSaving(true);
    let imagemUrl: string | null = null;
    if (imagemLocal) {
      try {
        imagemUrl = await enviarImagemEvento(imagemLocal);
      } catch (e: any) {
        setSaving(false);
        Alert.alert(t('admin.erroAoEnviarImagem'), e?.message ?? 'Tente novamente.');
        return;
      }
    }
    const { error } = await supabase.from('agenda_eventos').insert({
      imagem_url: imagemUrl,
      nome: nome.trim(), tipo, recorrente,
      dia_semana: recorrente ? diaSemana : null,
      data: !recorrente ? dataISO : null,
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
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={mo.header}>
              <Text style={mo.title}>{t('admin.novoEvento')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={mo.fieldWrap}>
              <Text style={mo.fieldLabel}>{t('admin.imagemDeCapaOpcional')}</Text>
              <TouchableOpacity
                style={nm.imagemPicker}
                disabled={saving}
                onPress={async () => { const uri = await escolherImagemEvento(t); if (uri) setImagemLocal(uri); }}
              >
                {imagemLocal ? (
                  <Image source={{ uri: imagemLocal }} style={[nm.imagemPreview, { height: undefined, aspectRatio: 2 }]} resizeMode="cover" />
                ) : (
                  <View style={nm.imagemPlaceholder}>
                    <Ionicons name="image-outline" size={24} color={C.textDim} />
                    <Text style={nm.imagemPlaceholderTexto}>{t('admin.toqueParaEscolherUmaFoto')}</Text>
                  </View>
                )}
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
                  <TextInput style={mo.fieldInput} placeholder={t('admin.ex20260828')} placeholderTextColor={C.textDim} value={data} onChangeText={v => setData(mascaraDataBR(v))} keyboardType="numeric" maxLength={10} />
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
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
      // No iOS o editor de corte do sistema é sempre QUADRADO (o `aspect` só vale
      // no Android) — cortava as capas 16:9. No iOS a foto vai inteira.
      mediaTypes: ['images'], allowsEditing: Platform.OS === 'android', aspect: [16, 9], quality: 0.7,
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
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '92%' }}>
        <View style={mo.sheet}>
          <View style={mo.header}>
            <Text style={mo.title}>{t('admin.novaAreaDeEscala')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

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
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Time de Voluntários por Área Modal (líder da área / admin) ────────────────
function AreaVoluntariosModal({ visible, area, podeMudarVagas, onClose, onChanged }: {
  visible: boolean; area: EscalaArea | null; podeMudarVagas: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { t } = useTranslation();
  // Vagas por culto: o admin ajusta aqui antes de gerar (pedido do Marcos,
  // 17/10). A RLS de `escala_areas` so deixa o admin alterar.
  const [vagas, setVagas] = useState(1);
  const [salvandoVagas, setSalvandoVagas] = useState(false);
  useEffect(() => { if (area) setVagas(area.vagas_padrao); }, [area?.id, area?.vagas_padrao]);

  // ── Duplas (ex.: casais nos Diaconos) ── pedido do Marcos, 17/10.
  // Area "em dupla": o gerador escala as duplas juntas; quem nao esta em
  // dupla segue sozinho. Liga/desliga so o admin; o lider monta as duplas.
  const [emDuplas, setEmDuplas] = useState(false);
  const [duplas, setDuplas] = useState<EscalaDupla[]>([]);
  const [formando, setFormando] = useState(false);
  const [primeiro, setPrimeiro] = useState<string | null>(null);
  useEffect(() => { setEmDuplas(!!area?.em_duplas); setFormando(false); setPrimeiro(null); }, [area?.id, area?.em_duplas]);
  const carregarDuplas = useCallback(async () => {
    if (!area) return;
    const { data } = await supabase.from('escala_duplas').select('id, area_id, membro_a, membro_b').eq('area_id', area.id);
    setDuplas((data ?? []) as EscalaDupla[]);
  }, [area?.id]);
  useEffect(() => { if (visible && area) carregarDuplas(); }, [visible, carregarDuplas]);

  const nomeDe = (membroId: string) => {
    const v = voluntarios.find(x => x.membro_id === membroId);
    return v ? `${v.nome} ${v.sobrenome}`.trim() : '?';
  };
  const duplaDe = (membroId: string) => duplas.find(d => d.membro_a === membroId || d.membro_b === membroId);

  // ── Lider obrigatorio (ex.: Ministerio Infantil) ── pedido do Marcos, 17/10.
  // 1a vaga de cada culto sempre e de um lider; as outras, de qualquer um.
  const [exigeLider, setExigeLider] = useState(false);
  useEffect(() => { setExigeLider(!!area?.exige_lider); }, [area?.id, area?.exige_lider]);
  const alternarExigeLider = async (valor: boolean) => {
    if (!area) return;
    setExigeLider(valor);
    const { error } = await supabase.from('escala_areas').update({ exige_lider: valor }).eq('id', area.id);
    if (error) { setExigeLider(!valor); Alert.alert(t('common.erro'), error.message); return; }
    onChanged();
  };
  const alternarLiderDeTurno = async (v: AreaVoluntario) => {
    const novo = !v.lider_de_turno;
    setVoluntarios(vs => vs.map(x => (x.id === v.id ? { ...x, lider_de_turno: novo } : x)));
    const { error } = await supabase.from('escala_area_voluntarios').update({ lider_de_turno: novo }).eq('id', v.id);
    if (error) {
      setVoluntarios(vs => vs.map(x => (x.id === v.id ? { ...x, lider_de_turno: !novo } : x)));
      Alert.alert(t('common.erro'), error.message);
      return;
    }
    onChanged();
  };

  const alternarEmDuplas = async (valor: boolean) => {
    if (!area) return;
    setEmDuplas(valor);
    const { error } = await supabase.from('escala_areas').update({ em_duplas: valor }).eq('id', area.id);
    if (error) { setEmDuplas(!valor); Alert.alert(t('common.erro'), error.message); return; }
    onChanged();
  };

  const tocarParaDupla = async (membroId: string) => {
    if (!area || duplaDe(membroId)) return;
    if (!primeiro) { setPrimeiro(membroId); return; }
    if (primeiro === membroId) { setPrimeiro(null); return; }
    const { error } = await supabase.from('escala_duplas').insert({ area_id: area.id, membro_a: primeiro, membro_b: membroId });
    setPrimeiro(null);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    carregarDuplas();
  };

  const desfazerDupla = async (d: EscalaDupla) => {
    if (await apagarLinha('escala_duplas', d.id)) carregarDuplas();
  };

  // Junta automaticamente quem esta no time junto com o conjuge (campo
  // "conjuge" da ficha em Membros). So o admin le as fichas.
  const juntarCasais = async () => {
    if (!area) return;
    const ids = voluntarios.map(v => v.membro_id);
    const { data, error } = await supabase.from('members').select('id, conjuge_id').in('id', ids);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    const noTime = new Set(ids);
    const usados = new Set(duplas.flatMap(d => [d.membro_a, d.membro_b]));
    const novas: { area_id: string; membro_a: string; membro_b: string }[] = [];
    ((data ?? []) as any[]).forEach(m => {
      const c = m.conjuge_id as string | null;
      if (!c || !noTime.has(c) || usados.has(m.id) || usados.has(c)) return;
      usados.add(m.id); usados.add(c);
      novas.push({ area_id: area.id, membro_a: m.id, membro_b: c });
    });
    if (novas.length === 0) { Alert.alert(t('admin.duplasNenhumCasalTitulo'), t('admin.duplasNenhumCasalMsg')); return; }
    const { error: e2 } = await supabase.from('escala_duplas').insert(novas);
    if (e2) { Alert.alert(t('common.erro'), e2.message); return; }
    carregarDuplas();
    Alert.alert(t('admin.duplasCasaisJuntados', { n: novas.length }));
  };
  const mudarVagas = async (nova: number) => {
    if (!area || nova < 1 || nova > 20 || salvandoVagas) return;
    const anterior = vagas;
    setVagas(nova);
    setSalvandoVagas(true);
    const { error } = await supabase.from('escala_areas').update({ vagas_padrao: nova }).eq('id', area.id);
    setSalvandoVagas(false);
    if (error) { setVagas(anterior); Alert.alert(t('common.erro'), error.message); return; }
    onChanged();
  };
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
      nome: row.nome ?? '', sobrenome: row.sobrenome ?? '', lider_de_turno: !!row.lider_de_turno,
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

  // ── Lider da area (quem edita a escala dela) ── pedido do Marcos, 23/10.
  // Nao confundir com `lider_de_turno` (lider obrigatorio no culto). So o
  // admin troca (RLS de `escala_area_lideres`); a pessoa precisa de conta no
  // app, porque a lideranca e por `profile_id`. Vira voluntaria sozinha (trigger).
  const [lideres, setLideres] = useState<{ id: string; profile_id: string; nome: string }[]>([]);
  const [perfilDoMembro, setPerfilDoMembro] = useState<Record<string, string | null>>({});
  const [escolhendoLider, setEscolhendoLider] = useState(false);
  const carregarLideres = useCallback(async () => {
    if (!area) return;
    const { data } = await supabase.from('escala_area_lideres')
      .select('id, profile_id, profiles(full_name)').eq('area_id', area.id);
    setLideres(((data ?? []) as any[]).map(l => ({ id: l.id, profile_id: l.profile_id, nome: l.profiles?.full_name ?? '—' })));
  }, [area?.id]);
  useEffect(() => { if (visible && area) { setEscolhendoLider(false); carregarLideres(); } }, [visible, carregarLideres]);
  useEffect(() => {
    if (!visible || !podeMudarVagas || voluntarios.length === 0) { setPerfilDoMembro({}); return; }
    supabase.from('members').select('id, profile_id').in('id', voluntarios.map(v => v.membro_id))
      .then(({ data }) => {
        const mapa: Record<string, string | null> = {};
        ((data ?? []) as any[]).forEach(m => { mapa[m.id] = m.profile_id ?? null; });
        setPerfilDoMembro(mapa);
      });
  }, [visible, podeMudarVagas, voluntarios]);
  const tornarLider = async (v: AreaVoluntario) => {
    if (!area) return;
    const profileId = perfilDoMembro[v.membro_id];
    if (!profileId) { Alert.alert(t('admin.liderAreaSemContaTitulo'), t('admin.liderAreaSemContaMsg', { nome: `${v.nome} ${v.sobrenome}`.trim() })); return; }
    const { error } = await supabase.from('escala_area_lideres').insert({ area_id: area.id, profile_id: profileId });
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    setEscolhendoLider(false);
    carregarLideres();
    onChanged();
  };
  const tirarLider = (l: { id: string; nome: string }) => {
    if (!area) return;
    Alert.alert(t('admin.liderAreaTirarTitulo'), t('admin.liderAreaTirarMsg', { nome: l.nome, area: area.nome }), [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: t('admin.liderAreaTirar'), style: 'destructive', onPress: async () => {
        const ok = await apagarLinha('escala_area_lideres', l.id);
        if (!ok) return;
        carregarLideres();
        onChanged();
      }},
    ]);
  };

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

  // Apagar a area inteira (admin). O banco apaga junto, em cascata, o time,
  // os lideres da area e as datas ja escaladas nela (pedido do Marcos, 17/10).
  const apagarArea = () => {
    if (!area) return;
    Alert.alert(
      t('admin.apagarAreaTitulo', { area: area.nome }),
      t('admin.apagarAreaMsg', { n: voluntarios.length }),
      [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('admin.apagarArea'), style: 'destructive', onPress: async () => {
          const ok = await apagarLinha('escala_areas', area.id);
          if (!ok) return;
          onChanged();
          onClose();
        }},
      ],
    );
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

            <View style={{ backgroundColor: C.accent + '14', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{t('admin.liderAreaTitulo')}</Text>
              <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{t('admin.liderAreaDesc')}</Text>
              {lideres.length === 0 ? (
                <Text style={{ fontSize: 13, color: C.textDim, marginTop: 8 }}>{t('admin.liderAreaNenhum')}</Text>
              ) : lideres.map(l => (
                <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <Ionicons name="shield-checkmark" size={16} color={C.accent} style={{ marginRight: 6 }} />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: C.text }}>{l.nome}</Text>
                  {podeMudarVagas && (
                    <TouchableOpacity onPress={() => tirarLider(l)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={C.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {podeMudarVagas && (
                <TouchableOpacity onPress={() => setEscolhendoLider(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                  <Ionicons name={escolhendoLider ? 'chevron-up' : 'swap-horizontal'} size={16} color={C.purple} style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.purple }}>
                    {escolhendoLider ? t('admin.liderAreaFecharLista') : lideres.length > 0 ? t('admin.liderAreaTrocar') : t('admin.liderAreaEscolher')}
                  </Text>
                </TouchableOpacity>
              )}
              {podeMudarVagas && escolhendoLider && (
                <View style={{ marginTop: 6 }}>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>{t('admin.liderAreaEscolherDica')}</Text>
                  {voluntarios.length === 0 ? (
                    <Text style={{ fontSize: 12, color: C.textDim }}>{t('admin.liderAreaTimeVazio')}</Text>
                  ) : voluntarios
                    .filter(v => !lideres.some(l => l.profile_id && l.profile_id === perfilDoMembro[v.membro_id]))
                    .map(v => {
                      const temConta = !!perfilDoMembro[v.membro_id];
                      return (
                        <TouchableOpacity key={v.id} onPress={() => tornarLider(v)}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                          <Text style={{ flex: 1, fontSize: 14, color: temConta ? C.text : C.textDim }}>
                            {v.nome} {v.sobrenome}{temConta ? '' : ` · ${t('admin.liderAreaSemConta')}`}
                          </Text>
                          <Ionicons name="add-circle-outline" size={20} color={temConta ? C.purple : C.textDim} />
                        </TouchableOpacity>
                      );
                    })}
                </View>
              )}
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

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.purple + '10', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 16 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{t('admin.vagasPorCulto')}</Text>
                <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{t('admin.vagasPorCultoDesc')}</Text>
              </View>
              {podeMudarVagas ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <TouchableOpacity onPress={() => mudarVagas(vagas - 1)} disabled={vagas <= 1 || salvandoVagas} hitSlop={8}>
                    <Ionicons name="remove-circle" size={32} color={vagas <= 1 ? C.textDim : C.purple} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, minWidth: 24, textAlign: 'center' }}>{vagas}</Text>
                  <TouchableOpacity onPress={() => mudarVagas(vagas + 1)} disabled={vagas >= 20 || salvandoVagas} hitSlop={8}>
                    <Ionicons name="add-circle" size={32} color={C.purple} />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>{vagas}</Text>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.purple + '10', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{t('admin.liderObrigatorio')}</Text>
                <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  {exigeLider
                    ? t('admin.liderObrigatorioLigado', { n: voluntarios.filter(v => v.lider_de_turno).length })
                    : t('admin.liderObrigatorioDesligado')}
                </Text>
              </View>
              <Switch value={exigeLider} onValueChange={alternarExigeLider} disabled={!podeMudarVagas} trackColor={{ true: C.purple }} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.purple + '10', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{t('admin.duplasServemEmDupla')}</Text>
                <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  {emDuplas ? t('admin.duplasLigadoDesc') : t('admin.duplasDesligadoDesc')}
                </Text>
              </View>
              <Switch value={emDuplas} onValueChange={alternarEmDuplas} disabled={!podeMudarVagas} trackColor={{ true: C.purple }} />
            </View>

            {emDuplas && (
              <View style={{ marginTop: 12 }}>
                <Text style={s.sectionLabel}>{t('admin.duplasTitulo', { n: duplas.length })}</Text>
                {duplas.length === 0 && <Text style={s.emptyText}>{t('admin.duplasNenhuma')}</Text>}
                {duplas.map(d => (
                  <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 }}>
                    <Ionicons name="people" size={18} color={C.purple} />
                    <Text style={{ flex: 1, fontSize: 14, color: C.text }}>{nomeDe(d.membro_a)} & {nomeDe(d.membro_b)}</Text>
                    <TouchableOpacity onPress={() => desfazerDupla(d)} hitSlop={8}>
                      <Ionicons name="close-circle-outline" size={20} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    onPress={() => { setFormando(f => !f); setPrimeiro(null); }}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: formando ? C.purple : C.purple + '15' }}
                  >
                    <Ionicons name={formando ? 'checkmark' : 'add'} size={16} color={formando ? '#fff' : C.purple} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: formando ? '#fff' : C.purple }}>
                      {formando ? t('admin.duplasPronto') : t('admin.duplasFormar')}
                    </Text>
                  </TouchableOpacity>
                  {podeMudarVagas && (
                    <TouchableOpacity
                      onPress={juntarCasais}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: C.purple + '15' }}
                    >
                      <Ionicons name="heart-outline" size={16} color={C.purple} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.purple }}>{t('admin.duplasJuntarCasais')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {formando && (
                  <Text style={{ fontSize: 12, color: C.purple, marginTop: 8, lineHeight: 17 }}>
                    {primeiro ? t('admin.duplasEscolhaSegundo', { nome: nomeDe(primeiro) }) : t('admin.duplasEscolhaPrimeiro')}
                  </Text>
                )}
              </View>
            )}

            <Text style={[s.sectionLabel, { marginTop: 16 }]}>
              {t('admin.timeAtual', { n: voluntarios.length })}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320, flexShrink: 1 }}>
              {loading ? (
                <ActivityIndicator color={C.purple} style={{ marginVertical: 20 }} />
              ) : voluntarios.length === 0 ? (
                <Text style={s.emptyText}>{t('admin.ninguemAdicionadoAinda')}</Text>
              ) : (
                voluntarios.map(v => {
                  const dupla = emDuplas ? duplaDe(v.membro_id) : undefined;
                  const parceiro = dupla ? (dupla.membro_a === v.membro_id ? dupla.membro_b : dupla.membro_a) : null;
                  const selecionavel = formando && !dupla;
                  const selecionado = primeiro === v.membro_id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      disabled={!selecionavel}
                      onPress={() => tocarParaDupla(v.membro_id)}
                      activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: selecionado ? 8 : 0, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: selecionado ? C.purple + '18' : 'transparent', borderRadius: selecionado ? 8 : 0, opacity: formando && dupla ? 0.4 : 1 }}
                    >
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {selecionavel && (
                          <Ionicons name={selecionado ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={C.purple} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, color: C.text }}>{v.nome} {v.sobrenome}</Text>
                          {exigeLider && (
                            <Text style={{ fontSize: 11, color: v.lider_de_turno ? C.purple : C.textMuted, marginTop: 2, fontWeight: v.lider_de_turno ? '700' : '400' }}>
                              {v.lider_de_turno ? t('admin.liderDeTurno') : t('admin.auxiliar')}
                            </Text>
                          )}
                          {parceiro && (
                            <Text style={{ fontSize: 11, color: C.purple, marginTop: 2 }}>{t('admin.duplasEmDuplaCom', { nome: nomeDe(parceiro) })}</Text>
                          )}
                        </View>
                      </View>
                      {!formando && exigeLider && (
                        <TouchableOpacity onPress={() => alternarLiderDeTurno(v)} hitSlop={8} style={{ marginRight: 16 }}>
                          <Ionicons name={v.lider_de_turno ? 'star' : 'star-outline'} size={20} color={v.lider_de_turno ? C.accent ?? C.purple : C.textDim} />
                        </TouchableOpacity>
                      )}
                      {!formando && (
                        <TouchableOpacity onPress={() => remover(v)}>
                          <Ionicons name="trash-outline" size={18} color={C.danger} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
              {podeMudarVagas && (
                <TouchableOpacity
                  onPress={apagarArea}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: C.danger + '55' }}
                >
                  <Ionicons name="trash-outline" size={18} color={C.danger} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.danger }}>{t('admin.apagarArea')}</Text>
                </TouchableOpacity>
              )}
              <View style={{ height: 10 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Ver e editar a escala (admin / líder da área) ─────────────────────────────
// Trocar quem foi escalado, tirar alguém, ou preencher uma vaga livre, nas
// próximas datas. A RLS de `escala_designacoes` já libera escrita pro admin e
// pro líder daquela área ("Líder da área gerencia a escala"), então o filtro
// de áreas aqui é só pra cada líder ver o que é dele. Nomes vêm pelas RPCs
// (`escala_proximas_designacoes`, `voluntarios_da_area`,
// `membros_para_area_escala`), porque a RLS de `members` não abre o diretório
// pro líder. Sem push ao trocar — decisão do Marcos em 28/09.
type DesignacaoEdit = { id: string; data: string; area_id: string; membro_id: string; nome: string; sobrenome: string };
type AlvoEdicao =
  | { modo: 'trocar'; area: EscalaArea; data: string; designacao: DesignacaoEdit }
  | { modo: 'adicionar'; area: EscalaArea; data: string };

function dataEscalaLonga(iso: string, lng: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lng, { weekday: 'long', day: '2-digit', month: 'long' });
}

function EditarEscalaModal({ visible, areas, userId, onClose }: {
  visible: boolean; areas: EscalaArea[]; userId: string | undefined; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [designacoes, setDesignacoes] = useState<DesignacaoEdit[]>([]);
  const [alvo, setAlvo] = useState<AlvoEdicao | null>(null);
  const [time, setTime] = useState<MembroDiretorio[]>([]);
  const [carregandoTime, setCarregandoTime] = useState(false);
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<MembroDiretorio[]>([]);
  const [salvando, setSalvando] = useState(false);
  // "membro_id|data" de quem marcou que nao pode (RLS: admin e lider da area).
  const [indisponiveis, setIndisponiveis] = useState<Set<string>>(new Set());

  const idsAreas = areas.map(a => a.id).join(',');

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: ind }] = await Promise.all([
      supabase.rpc('escala_proximas_designacoes'),
      supabase.from('escala_indisponibilidade').select('membro_id, data').gte('data', toISODate(new Date())),
    ]);
    if (error) Alert.alert(t('common.erro'), error.message);
    setIndisponiveis(new Set(((ind ?? []) as any[]).map(i => `${i.membro_id}|${i.data}`)));
    const permitidas = new Set(idsAreas.split(','));
    setDesignacoes(((data ?? []) as any[])
      .filter(d => permitidas.has(d.area_id))
      .map(d => ({ id: d.id, data: d.data, area_id: d.area_id, membro_id: d.membro_id, nome: d.nome ?? '', sobrenome: d.sobrenome ?? '' })));
    setLoading(false);
  }, [idsAreas, t]);

  useEffect(() => {
    if (visible) { setAlvo(null); carregar(); }
  }, [visible, carregar]);

  // Ao escolher trocar/adicionar: carrega o time daquela área.
  useEffect(() => {
    if (!alvo) return;
    setQuery(''); setResultados([]); setTime([]);
    setCarregandoTime(true);
    supabase.rpc('voluntarios_da_area', { p_area_id: alvo.area.id }).then(({ data }) => {
      setTime(((data ?? []) as any[]).map(r => ({ id: r.membro_id, nome: r.nome ?? '', sobrenome: r.sobrenome ?? '' })));
      setCarregandoTime(false);
    });
  }, [alvo]);

  // Busca de alguém fora do time (a função já exclui quem é do time).
  useEffect(() => {
    if (!alvo || query.trim().length < 2) { setResultados([]); return; }
    const areaId = alvo.area.id;
    const tm = setTimeout(() => {
      supabase.rpc('membros_para_area_escala', { p_area_id: areaId, p_busca: query.trim() })
        .then(({ data }) => setResultados((data ?? []) as MembroDiretorio[]));
    }, 300);
    return () => clearTimeout(tm);
  }, [query, alvo]);

  const mensagemDeErro = (error: { code?: string; message: string }) =>
    error.code === '23505' ? t('admin.escalaJaEscaladoNoDia') : error.message;

  const escolher = async (m: MembroDiretorio) => {
    if (!alvo || salvando) return;
    setSalvando(true);
    const { error } = alvo.modo === 'trocar'
      ? await supabase.from('escala_designacoes').update({ membro_id: m.id }).eq('id', alvo.designacao.id)
      : await supabase.from('escala_designacoes').insert({
          area_id: alvo.area.id, membro_id: m.id, data: alvo.data,
          gerado_automaticamente: false, criado_por: userId,
        });
    setSalvando(false);
    if (error) { Alert.alert(t('common.erro'), mensagemDeErro(error)); return; }
    setAlvo(null);
    carregar();
  };

  const remover = (d: DesignacaoEdit, area: EscalaArea) => {
    Alert.alert(
      t('admin.escalaRemoverTitulo'),
      t('admin.escalaRemoverMsg', { nome: `${d.nome} ${d.sobrenome}`.trim(), area: area.nome, data: dataEscalaLonga(d.data, i18n.language) }),
      [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('common.remover'), style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('escala_designacoes').delete().eq('id', d.id);
          if (error) { Alert.alert(t('common.erro'), error.message); return; }
          carregar();
        }},
      ],
    );
  };

  const areasOrdenadas = [...areas].sort((a, b) => a.nome.localeCompare(b.nome));
  const datas = [...new Set(designacoes.map(d => d.data))].sort();
  // Quem já serve em cada data (em qualquer área visível) — pra não oferecer
  // a mesma pessoa duas vezes no mesmo dia. O banco também barra (unique).
  const ocupadosNoDia = (data: string) => new Set(designacoes.filter(d => d.data === data).map(d => d.membro_id));

  const naoPode = (membroId: string, data: string) => indisponiveis.has(`${membroId}|${data}`);
  const linhaPessoa = (m: MembroDiretorio, ocupado: boolean) => (
    <TouchableOpacity
      key={m.id}
      disabled={ocupado || salvando}
      onPress={() => escolher(m)}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, opacity: ocupado ? 0.45 : 1 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: C.text }}>{m.nome} {m.sobrenome}</Text>
        {!!alvo && naoPode(m.id, alvo.data) && (
          <Text style={{ fontSize: 11, color: C.danger, marginTop: 2 }}>{t('admin.escalaMarcouIndisponivel')}</Text>
        )}
      </View>
      {ocupado
        ? <Text style={{ fontSize: 11, color: C.textMuted }}>{t('admin.escalaJaServeNoDia')}</Text>
        : <Ionicons name="checkmark-circle-outline" size={22} color={C.purple} />}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => (alvo ? setAlvo(null) : onClose())}>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '92%' }}>
          <View style={[mo.sheet, { maxHeight: '100%' }]}>
            {alvo ? (
              <>
                <View style={mo.header}>
                  <TouchableOpacity onPress={() => setAlvo(null)} hitSlop={8} style={{ marginRight: 10 }}>
                    <Ionicons name="arrow-back" size={22} color={C.textMuted} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={mo.title} numberOfLines={2}>
                      {alvo.modo === 'trocar'
                        ? t('admin.escalaTrocarTitulo', { nome: alvo.designacao.nome })
                        : t('admin.escalaAdicionarTitulo', { area: alvo.area.nome })}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                      {alvo.area.nome} · {dataEscalaLonga(alvo.data, i18n.language)}
                    </Text>
                  </View>
                  {salvando && <ActivityIndicator color={C.purple} />}
                </View>

                <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text style={[s.sectionLabel, { marginTop: 4 }]}>{t('admin.escalaTimeDaArea')}</Text>
                  {carregandoTime ? (
                    <ActivityIndicator color={C.purple} style={{ marginVertical: 16 }} />
                  ) : time.length === 0 ? (
                    <Text style={s.emptyText}>{t('admin.ninguemAdicionadoAinda')}</Text>
                  ) : (() => {
                    const ocupados = ocupadosNoDia(alvo.data);
                    return time.map(m => linhaPessoa(m, ocupados.has(m.id)));
                  })()}

                  <Text style={[s.sectionLabel, { marginTop: 18 }]}>{t('admin.escalaOutraPessoa')}</Text>
                  <View style={mo.fieldRow}>
                    <Ionicons name="search-outline" size={16} color={C.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                      style={mo.fieldInput}
                      placeholder={t('admin.buscarNoDiretorioPraAdicionar')}
                      placeholderTextColor={C.textDim}
                      value={query}
                      onChangeText={setQuery}
                    />
                  </View>
                  {(() => {
                    const ocupados = ocupadosNoDia(alvo.data);
                    return resultados.map(m => linhaPessoa(m, ocupados.has(m.id)));
                  })()}
                  <View style={{ height: 12 }} />
                </ScrollView>
              </>
            ) : (
              <>
                <View style={mo.header}>
                  <Text style={mo.title}>{t('admin.escalaVerEditar')}</Text>
                  <TouchableOpacity onPress={onClose}>
                    <Ionicons name="close" size={22} color={C.textMuted} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
                  {loading ? (
                    <ActivityIndicator color={C.purple} style={{ marginVertical: 30 }} />
                  ) : datas.length === 0 ? (
                    <Text style={[s.emptyText, { marginVertical: 20 }]}>{t('admin.escalaNadaAgendado')}</Text>
                  ) : datas.map(data => (
                    <View key={data} style={{ marginBottom: 18 }}>
                      <Text style={[s.sectionLabel, { textTransform: 'capitalize' }]}>{dataEscalaLonga(data, i18n.language)}</Text>
                      {areasOrdenadas.map(area => {
                        const pessoas = designacoes.filter(d => d.data === data && d.area_id === area.id);
                        const livres = Math.max(0, area.vagas_padrao - pessoas.length);
                        return (
                          <View key={area.id} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 4 }}>{area.nome}</Text>
                            {pessoas.map(d => (
                              <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 14 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 14, color: C.text }}>{d.nome} {d.sobrenome}</Text>
                                  {naoPode(d.membro_id, data) && (
                                    <Text style={{ fontSize: 11, color: C.danger, fontWeight: '700', marginTop: 2 }}>{t('admin.escalaMarcouIndisponivelTrocar')}</Text>
                                  )}
                                </View>
                                <TouchableOpacity onPress={() => setAlvo({ modo: 'trocar', area, data, designacao: d })} hitSlop={8}>
                                  <Ionicons name="swap-horizontal" size={20} color={C.purple} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => remover(d, area)} hitSlop={8}>
                                  <Ionicons name="trash-outline" size={18} color={C.danger} />
                                </TouchableOpacity>
                              </View>
                            ))}
                            {Array.from({ length: livres }).map((_, i) => (
                              <TouchableOpacity
                                key={`livre-${i}`}
                                onPress={() => setAlvo({ modo: 'adicionar', area, data })}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 }}
                              >
                                <Ionicons name="add-circle-outline" size={20} color={C.textMuted} />
                                <Text style={{ fontSize: 13, color: C.textMuted }}>{t('admin.escalaVagaLivre')}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                  <View style={{ height: 10 }} />
                </ScrollView>
              </>
            )}
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
// Data de CALENDÁRIO local, montada pelos componentes. `toISOString()` converte
// pra UTC: no horário de verão britânico, meia-noite de domingo em Londres é
// 23h de sábado em UTC, e o gerador gravava a escala inteira NO SÁBADO (de
// abril a outubro). Corrigido em 28/09/2026.
function toISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function formatarDataBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Datas de culto entre `inicio` e `fim` (ISO), com a regra de fim de ano da
// Peniel (Marcos, 16/10/2026): o Natal e celebrado no domingo ANTES de 25/12,
// depois so o culto da Virada (31/12), e o proximo culto e o 2o domingo de
// janeiro. Os domingos entre esses ficam de fora. Tudo pode ser ligado ou
// desligado na lista antes de gerar.
type DataDeCulto = { data: string; rotulo?: 'natal' | 'virada' | 'extra'; ativo: boolean; motivoFora?: 'recesso' };
function domingoDoNatal(ano: number): string {
  const d = new Date(ano, 11, 24);
  while (d.getDay() !== 0) d.setDate(d.getDate() - 1);
  return toISODate(d);
}
function datasDeCulto(inicio: string, fim: string): DataDeCulto[] {
  const [y, m, d] = inicio.split('-').map(Number);
  const cursor = new Date(y, m - 1, d);
  while (cursor.getDay() !== 0) cursor.setDate(cursor.getDate() + 1);
  const lista: DataDeCulto[] = [];
  while (toISODate(cursor) <= fim) {
    const iso = toISODate(cursor);
    const ano = cursor.getFullYear();
    const natal = domingoDoNatal(ano);
    if (iso.endsWith('-12-31')) lista.push({ data: iso, rotulo: 'virada', ativo: true });
    else if (iso === natal) lista.push({ data: iso, rotulo: 'natal', ativo: true });
    else if (iso > natal && cursor.getMonth() === 11) lista.push({ data: iso, ativo: false, motivoFora: 'recesso' });
    else if (cursor.getMonth() === 0 && cursor.getDate() < 8) lista.push({ data: iso, ativo: false, motivoFora: 'recesso' });
    else lista.push({ data: iso, ativo: true });
    cursor.setDate(cursor.getDate() + 7);
  }
  // Culto da Virada em cada 31/12 do periodo.
  for (let ano = y; ano <= Number(fim.slice(0, 4)); ano++) {
    const virada = `${ano}-12-31`;
    if (virada >= inicio && virada <= fim && !lista.some(l => l.data === virada)) {
      lista.push({ data: virada, rotulo: 'virada', ativo: true });
    }
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}
function lerDDMMAAAA(txt: string): string | null {
  const [d, m, y] = txt.trim().split('/');
  if (!d || !m || !y || y.length !== 4) return null;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (isNaN(dt.getTime()) || dt.getDate() !== Number(d)) return null;
  return toISODate(dt);
}
// Fim padrao: fim do 2o mes seguinte, a mesma janela em que os voluntarios
// podem marcar os dias em que nao podem (em outubro, 31/12).
function fimPadraoDaEscala(): string {
  const h = new Date();
  return toISODate(new Date(h.getFullYear(), h.getMonth() + 3, 0));
}

function GerarEscalaModal({ visible, areas, voluntarios, userId, onClose, onGerado }: {
  visible: boolean; areas: EscalaArea[]; voluntarios: AreaVoluntario[]; userId: string | undefined;
  onClose: () => void; onGerado: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [datas, setDatas] = useState<DataDeCulto[]>([]);
  const [extra, setExtra] = useState('');
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (visible) {
      setDataInicio(formatarDataBR(toISODate(proximoDomingo())));
      setDataFim(formatarDataBR(fimPadraoDaEscala()));
      setExtra('');
    }
  }, [visible]);

  // Recalcula a lista sempre que as duas datas ficam validas.
  useEffect(() => {
    const ini = lerDDMMAAAA(dataInicio);
    const fim = lerDDMMAAAA(dataFim);
    setDatas(ini && fim && fim >= ini ? datasDeCulto(ini, fim) : []);
  }, [dataInicio, dataFim]);

  const alternar = (iso: string) => setDatas(ds => ds.map(d => (d.data === iso ? { ...d, ativo: !d.ativo } : d)));
  const adicionarExtra = () => {
    const iso = lerDDMMAAAA(extra);
    if (!iso) { Alert.alert(t('common.atencao'), t('admin.escalaDataInvalida')); return; }
    setDatas(ds => ds.some(d => d.data === iso)
      ? ds.map(d => (d.data === iso ? { ...d, ativo: true } : d))
      : [...ds, { data: iso, rotulo: 'extra' as const, ativo: true }].sort((a, b) => a.data.localeCompare(b.data)));
    setExtra('');
  };

  const ativas = datas.filter(d => d.ativo).map(d => d.data);

  const handleGerar = async () => {
    const ini = lerDDMMAAAA(dataInicio);
    const fim = lerDDMMAAAA(dataFim);
    if (!ini || !fim) { Alert.alert(t('common.atencao'), t('admin.informeADataDeInicio')); return; }
    if (fim < ini) { Alert.alert(t('common.atencao'), t('admin.escalaFimAntesDoInicio')); return; }
    if (ativas.length === 0) { Alert.alert(t('common.atencao'), t('admin.escalaNenhumaData')); return; }
    if (areas.length === 0) { Alert.alert(t('common.atencao'), t('admin.cadastreAoMenosUmaArea')); return; }

    setGerando(true);
    const primeira = ativas[0];
    const ultima = ativas[ativas.length - 1];

    // Ja escalados no periodo (contam como ocupados e descontam vagas) e os
    // dias que cada voluntario marcou como indisponivel.
    const [{ data: existentesData, error: existentesError }, { data: indData, error: indError }] = await Promise.all([
      supabase.from('escala_designacoes').select('area_id, membro_id, data').gte('data', primeira).lte('data', ultima),
      supabase.from('escala_indisponibilidade').select('membro_id, data').gte('data', primeira).lte('data', ultima),
    ]);
    const erro = existentesError ?? indError;
    if (erro) { setGerando(false); Alert.alert(t('common.erro'), erro.message); return; }

    const usadoNoDia: Record<string, Set<string>> = {};
    const existentesPorAreaData: Record<string, number> = {};
    const vezes: Record<string, number> = {};       // quantas vezes cada pessoa serve no periodo (todas as areas)
    const ultimaVez: Record<string, string> = {};   // ultima data em que serviu
    (existentesData ?? []).forEach((e: any) => {
      (usadoNoDia[e.data] ??= new Set()).add(e.membro_id);
      const chave = `${e.area_id}|${e.data}`;
      existentesPorAreaData[chave] = (existentesPorAreaData[chave] ?? 0) + 1;
      vezes[e.membro_id] = (vezes[e.membro_id] ?? 0) + 1;
    });
    const indisponivel = new Set((indData ?? []).map((i: any) => `${i.membro_id}|${i.data}`));

    // Areas "em dupla": as duplas viram uma unidade so (as duas pessoas no
    // mesmo culto). Quem do time nao esta em dupla segue sozinho.
    const idsEmDupla = areas.filter(a => a.em_duplas).map(a => a.id);
    let duplasDb: EscalaDupla[] = [];
    if (idsEmDupla.length) {
      const { data: dd, error: de } = await supabase.from('escala_duplas').select('id, area_id, membro_a, membro_b').in('area_id', idsEmDupla);
      if (de) { setGerando(false); Alert.alert(t('common.erro'), de.message); return; }
      duplasDb = (dd ?? []) as EscalaDupla[];
    }

    // Areas com time menor escolhem primeiro: quem serve em duas areas fica
    // pra area que mais depende dele.
    const poolPorArea: Record<string, string[]> = {};
    areas.forEach(a => { poolPorArea[a.id] = voluntarios.filter(v => v.area_id === a.id).map(v => v.membro_id); });
    const areasOrdenadas = [...areas].sort((a, b) =>
      (poolPorArea[a.id].length - poolPorArea[b.id].length) || a.nome.localeCompare(b.nome));
    // Unidades de cada area: [pessoa] ou [pessoa, pessoa] (dupla).
    const unidadesPorArea: Record<string, string[][]> = {};
    areas.forEach(a => {
      const pool = poolPorArea[a.id];
      if (!a.em_duplas) { unidadesPorArea[a.id] = pool.map(id => [id]); return; }
      const noTime = new Set(pool);
      const pares = duplasDb.filter(d => d.area_id === a.id && noTime.has(d.membro_a) && noTime.has(d.membro_b));
      const emPar = new Set(pares.flatMap(d => [d.membro_a, d.membro_b]));
      unidadesPorArea[a.id] = [
        ...pares.map(d => [d.membro_a, d.membro_b]),
        ...pool.filter(id => !emPar.has(id)).map(id => [id]),
      ];
    });
    const ordemNaFila: Record<string, number> = {};
    voluntarios.forEach((v, i) => { ordemNaFila[v.membro_id] ??= i; });

    const novas: { area_id: string; membro_id: string; data: string; gerado_automaticamente: boolean; criado_por: string | undefined }[] = [];
    let vagasSemNinguem = 0;
    const semLider: string[] = []; // "Area dd/mm" sem lider disponivel
    const liderSet = new Set(voluntarios.filter(v => v.lider_de_turno).map(v => `${v.area_id}|${v.membro_id}`));

    ativas.forEach(data => {
      const usadosHoje = (usadoNoDia[data] ??= new Set());
      areasOrdenadas.forEach(area => {
        const precisa = area.vagas_padrao - (existentesPorAreaData[`${area.id}|${data}`] ?? 0);
        if (precisa <= 0) return;
        const unidades = unidadesPorArea[area.id];
        if (!unidades.length) return;
        // Quem serviu menos vem primeiro; empate: quem serviu ha mais tempo.
        // Numa dupla vale a pessoa da dupla que serviu mais.
        const vezesU = (u: string[]) => Math.max(...u.map(id => vezes[id] ?? 0));
        const ultimaU = (u: string[]) => u.map(id => ultimaVez[id] ?? '').sort().reverse()[0];
        const candidatos = unidades
          .filter(u => u.every(id => !usadosHoje.has(id) && !indisponivel.has(`${id}|${data}`)))
          .sort((a, b) =>
            (vezesU(a) - vezesU(b))
            || ultimaU(a).localeCompare(ultimaU(b))
            || ((ordemNaFila[a[0]] ?? 0) - (ordemNaFila[b[0]] ?? 0)));
        const escolhidos: string[] = [];
        let restantes = candidatos;
        // Lider obrigatorio: a 1a escolha e a unidade (pessoa ou dupla) com
        // um lider que serviu menos; o resto completa com qualquer um.
        const jaTemLider = (existentesData ?? []).some((e: any) =>
          e.area_id === area.id && e.data === data && liderSet.has(`${area.id}|${e.membro_id}`));
        if (area.exige_lider && !jaTemLider) {
          const comLider = candidatos.find(u => u.length <= precisa && u.some(id => liderSet.has(`${area.id}|${id}`)));
          if (comLider) {
            escolhidos.push(...comLider);
            restantes = candidatos.filter(u => u !== comLider);
          } else {
            semLider.push(`${area.nome} ${formatarDataBR(data).slice(0, 5)}`);
          }
        }
        for (const u of restantes) {
          if (escolhidos.length === precisa) break;
          if (escolhidos.length + u.length > precisa) continue;
          escolhidos.push(...u);
        }
        vagasSemNinguem += precisa - escolhidos.length;
        escolhidos.forEach(id => {
          usadosHoje.add(id);
          vezes[id] = (vezes[id] ?? 0) + 1;
          ultimaVez[id] = data;
          novas.push({ area_id: area.id, membro_id: id, data, gerado_automaticamente: true, criado_por: userId });
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
    Alert.alert(
      t('admin.escalaGerada'),
      t('admin.escalaGeradaResumo', { n: novas.length, datas: ativas.length, ate: formatarDataBR(ultima) })
        + (vagasSemNinguem > 0 ? `\n\n${t('admin.escalaVagasSemNinguem', { n: vagasSemNinguem })}` : '')
        + (semLider.length > 0 ? `\n\n${t('admin.escalaSemLider', { lista: semLider.join(', ') })}` : ''),
    );
  };

  const rotuloDe = (d: DataDeCulto) =>
    d.rotulo === 'natal' ? t('admin.escalaCultoNatal')
      : d.rotulo === 'virada' ? t('admin.escalaCultoVirada')
      : d.rotulo === 'extra' ? t('admin.escalaDataExtra')
      : d.motivoFora === 'recesso' ? t('admin.escalaRecesso')
      : '';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={mo.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '92%' }}>
          <View style={[mo.sheet, { maxHeight: '100%' }]}>
            <View style={mo.header}>
              <Text style={mo.title}>{t('admin.gerarEscalaDoSemestre')}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, lineHeight: 18 }}>
              {t('admin.escalaGeradorExplicacao')}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[mo.fieldWrap, { flex: 1 }]}>
                <Text style={mo.fieldLabel}>{t('admin.escalaDe')}</Text>
                <View style={mo.fieldRow}>
                  <TextInput
                    style={mo.fieldInput} placeholder={t('admin.ddMmAaaa')} placeholderTextColor={C.textDim}
                    value={dataInicio} onChangeText={setDataInicio} keyboardType="numbers-and-punctuation" maxLength={10}
                  />
                </View>
              </View>
              <View style={[mo.fieldWrap, { flex: 1 }]}>
                <Text style={mo.fieldLabel}>{t('admin.escalaAte')}</Text>
                <View style={mo.fieldRow}>
                  <TextInput
                    style={mo.fieldInput} placeholder={t('admin.ddMmAaaa')} placeholderTextColor={C.textDim}
                    value={dataFim} onChangeText={setDataFim} keyboardType="numbers-and-punctuation" maxLength={10}
                  />
                </View>
              </View>
            </View>

            <Text style={[s.sectionLabel, { marginTop: 4 }]}>
              {t('admin.escalaDatasDeCulto', { n: ativas.length })}
            </Text>
            {datas.length === 0 ? (
              <Text style={[s.emptyText, { marginBottom: 12 }]}>{t('admin.escalaInformePeriodo')}</Text>
            ) : datas.map(d => (
              <TouchableOpacity
                key={d.data}
                onPress={() => alternar(d.data)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 }}
              >
                <Ionicons name={d.ativo ? 'checkbox' : 'square-outline'} size={20} color={d.ativo ? C.purple : C.textDim} />
                <Text style={{ flex: 1, fontSize: 14, color: d.ativo ? C.text : C.textDim, textTransform: 'capitalize' }}>
                  {formatarDataBR(d.data)} · {dataEscalaLonga(d.data, i18n.language).split(',')[0]}
                </Text>
                {!!rotuloDe(d) && (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: d.ativo ? C.purple : C.textDim }}>{rotuloDe(d)}</Text>
                )}
              </TouchableOpacity>
            ))}

            <View style={[mo.fieldWrap, { marginTop: 14 }]}>
              <Text style={mo.fieldLabel}>{t('admin.escalaAdicionarData')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={[mo.fieldRow, { flex: 1 }]}>
                  <TextInput
                    style={mo.fieldInput} placeholder={t('admin.ddMmAaaa')} placeholderTextColor={C.textDim}
                    value={extra} onChangeText={setExtra} keyboardType="numbers-and-punctuation" maxLength={10}
                    onSubmitEditing={adicionarExtra}
                  />
                </View>
                <TouchableOpacity onPress={adicionarExtra} style={{ justifyContent: 'center', paddingHorizontal: 12 }}>
                  <Ionicons name="add-circle" size={28} color={C.purple} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={[mo.saveBtn, gerando && { opacity: 0.7 }]} onPress={handleGerar} disabled={gerando}>
              {gerando ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="shuffle-outline" size={18} color="#fff" /><Text style={mo.saveBtnText}>{t('admin.gerarEscala')}</Text></>
              )}
            </TouchableOpacity>
            <View style={{ height: 12 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Tradução ao vivo (Admin) ──────────────────────────────────────────────
// Controla remotamente o serviço `translator-service` que roda sempre ligado
// (via pm2) no Mac mini da igreja: estes botões só escrevem o campo `ativa`
// na tabela `traducao_ao_vivo` (permitido pra admin via RLS) — quem liga/
// desliga a captura de áudio de verdade é o próprio serviço no Mac mini, que
// escuta essa mudança por Realtime (não precisa mais abrir Terminal/SSH
// pra iniciar/parar a tradução em cada culto). Ver `translator-service/
// index.js` e a seção "Mac mini" de `claude/site-novo-design-system-e-
// escopo.md` pro resto da arquitetura.
type TraducaoStatus = { ativa: boolean; atualizado_em: string | null };

function TraducaoAoVivoAdminPanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TraducaoStatus | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  useEffect(() => {
    let ativoNoAr = true;

    supabase
      .from('traducao_ao_vivo')
      .select('ativa, atualizado_em')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!ativoNoAr) return;
        setStatus((data as TraducaoStatus) ?? { ativa: false, atualizado_em: null });
        setCarregando(false);
      });

    // Mantém o badge sincronizado se o próprio serviço no Mac mini mudar o
    // estado sozinho (ex. foi encerrado na mão, caiu a internet, etc.).
    const canal = supabase
      .channel('traducao-ao-vivo-admin')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'traducao_ao_vivo', filter: 'id=eq.1' },
        (payload) => {
          if (!ativoNoAr) return;
          setStatus(payload.new as TraducaoStatus);
        }
      )
      .subscribe();

    return () => {
      ativoNoAr = false;
      supabase.removeChannel(canal);
    };
  }, []);

  const enviarComando = useCallback(async (novaAtiva: boolean) => {
    setAtualizando(true);
    const agora = new Date().toISOString();
    const { error } = await supabase
      .from('traducao_ao_vivo')
      .update({ ativa: novaAtiva, atualizado_em: agora })
      .eq('id', 1);
    setAtualizando(false);
    if (error) {
      Alert.alert(t('admin.traducaoErroAoAtualizar'), error.message);
      return;
    }
    setStatus({ ativa: novaAtiva, atualizado_em: agora });
  }, [t]);

  const confirmarIniciar = () => {
    Alert.alert(
      t('admin.traducaoIniciarConfirmarTitulo'),
      t('admin.traducaoIniciarConfirmarTexto'),
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: t('admin.traducaoIniciarBotao'), onPress: () => enviarComando(true) },
      ]
    );
  };

  const confirmarParar = () => {
    Alert.alert(
      t('admin.traducaoPararConfirmarTitulo'),
      t('admin.traducaoPararConfirmarTexto'),
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: t('admin.traducaoPararBotao'), style: 'destructive', onPress: () => enviarComando(false) },
      ]
    );
  };

  const ativa = status?.ativa ?? false;

  return (
    <View style={s.traducaoCard}>
      <View style={s.traducaoHeaderRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="headset-outline" size={20} color={C.primary} />
          <Text style={s.traducaoTitulo}>{t('admin.traducaoAoVivoTitulo')}</Text>
        </View>
        {!carregando && (
          <View style={[s.traducaoStatusBadge, { backgroundColor: (ativa ? C.success : C.textMuted) + '18' }]}>
            <View style={[s.traducaoStatusDot, { backgroundColor: ativa ? C.success : C.textMuted }]} />
            <Text style={[s.traducaoStatusBadgeText, { color: ativa ? C.success : C.textMuted }]}>
              {ativa ? t('admin.traducaoStatusAtiva') : t('admin.traducaoStatusParada')}
            </Text>
          </View>
        )}
      </View>

      <Text style={s.traducaoIdiomasTexto}>{t('admin.traducaoIdiomas')}</Text>

      {carregando ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 12 }} />
      ) : (
        <View style={s.traducaoBotoesRow}>
          <TouchableOpacity
            style={[s.traducaoBotao, s.traducaoBotaoIniciar, (ativa || atualizando) && s.traducaoBotaoDisabled]}
            disabled={ativa || atualizando}
            onPress={confirmarIniciar}
          >
            {atualizando && !ativa ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="play" size={16} color="#fff" />
                <Text style={s.traducaoBotaoTexto}>{t('admin.traducaoIniciarBotao')}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.traducaoBotao, s.traducaoBotaoParar, (!ativa || atualizando) && s.traducaoBotaoDisabled]}
            disabled={!ativa || atualizando}
            onPress={confirmarParar}
          >
            {atualizando && ativa ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="stop" size={16} color="#fff" />
                <Text style={s.traducaoBotaoTexto}>{t('admin.traducaoPararBotao')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
// ─── Textos editáveis (tabela textos_app) ────────────────────────────────────
// Mensagens que o admin corrige sem novo build. {nome} vira o nome da pessoa.
const TEXTOS_EDITAVEIS: { chave: string; titulo: string; dica: string }[] = [
  { chave: 'aniversario_membro', titulo: '🎂 Aniversário de membro',
    dica: 'Aparece na Home de todos os membros no dia e vai no push da manhã (7h). Visitantes não veem.' },
  { chave: 'aniversario_visitante', titulo: '🎈 Aniversário de visitante',
    dica: 'Só o próprio visitante vê, na Home dele e num push às 7h do dia do aniversário.' },
];

// ─── Versão do app nas lojas (admin) ──────────────────────────────────────────
// 17/10/2026. `versao_recomendada`: aviso suave ("versão nova disponível",
// dá para fechar) para quem está abaixo — iPhone e Android. `versao_minima`:
// tela obrigatória "Atualize para continuar". Só subir depois que a versão
// estiver PUBLICADA naquela loja (não "em revisão"), senão a pessoa é mandada
// para uma loja que ainda não tem a versão.
const RE_VERSAO = /^\d+\.\d+\.\d+$/;
function VersaoDoAppPanel() {
  const { t } = useTranslation();
  const [linhas, setLinhas] = useState<Record<string, { recomendada: string; minima: string }>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('app_versao').select('*');
    const m: Record<string, { recomendada: string; minima: string }> = {};
    ((data ?? []) as any[]).forEach(r => {
      m[r.plataforma] = { recomendada: r.versao_recomendada ?? '0.0.0', minima: r.versao_minima ?? '0.0.0' };
    });
    setLinhas(m);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const mudar = (plat: string, campo: 'recomendada' | 'minima', v: string) =>
    setLinhas(l => ({ ...l, [plat]: { ...l[plat], [campo]: v.replace(/[^0-9.]/g, '') } }));

  const salvar = (plat: string) => {
    const l = linhas[plat];
    if (!l || !RE_VERSAO.test(l.recomendada) || !RE_VERSAO.test(l.minima)) {
      Alert.alert(t('common.atencao'), t('admin.versaoFormato'));
      return;
    }
    Alert.alert(
      t('admin.versaoConfirmarTitulo', { plataforma: plat === 'ios' ? 'iPhone' : 'Android' }),
      t('admin.versaoConfirmarMsg', { recomendada: l.recomendada, minima: l.minima }),
      [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('common.salvar'), onPress: async () => {
          setSalvando(plat);
          const { error } = await supabase.from('app_versao')
            .update({ versao_recomendada: l.recomendada, versao_minima: l.minima, atualizado_em: new Date().toISOString() })
            .eq('plataforma', plat);
          setSalvando(null);
          if (error) { Alert.alert(t('common.erro'), error.message); return; }
          carregar();
          Alert.alert(t('admin.versaoSalva'));
        }},
      ],
    );
  };

  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={s.sectionLabel}>{t('admin.versaoTitulo')}</Text>
      <View style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14 }}>
        <Text style={{ fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 12 }}>
          {t('admin.versaoExplicacao', { atual: versaoDoBinario() ?? '—' })}
        </Text>
        {(['ios', 'android'] as const).map(plat => {
          const l = linhas[plat];
          if (!l) return null;
          return (
            <View key={plat} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name={plat === 'ios' ? 'logo-apple' : 'logo-android'} size={16} color={C.text} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{plat === 'ios' ? 'iPhone' : 'Android'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>{t('admin.versaoRecomendada')}</Text>
                  <View style={mo.fieldRow}>
                    <TextInput style={mo.fieldInput} value={l.recomendada} onChangeText={v => mudar(plat, 'recomendada', v)}
                      keyboardType="numbers-and-punctuation" placeholder="1.5.0" placeholderTextColor={C.textDim} maxLength={10} />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>{t('admin.versaoMinima')}</Text>
                  <View style={mo.fieldRow}>
                    <TextInput style={mo.fieldInput} value={l.minima} onChangeText={v => mudar(plat, 'minima', v)}
                      keyboardType="numbers-and-punctuation" placeholder="1.5.0" placeholderTextColor={C.textDim} maxLength={10} />
                  </View>
                </View>
                <TouchableOpacity onPress={() => salvar(plat)} disabled={salvando === plat}
                  style={{ alignSelf: 'flex-end', height: 46, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.purple, justifyContent: 'center' }}>
                  {salvando === plat ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark" size={20} color="#fff" />}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
        <Text style={{ fontSize: 11, color: C.textDim, lineHeight: 16 }}>{t('admin.versaoAviso')}</Text>
      </View>
    </View>
  );
}

function TextosAppEditor() {
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [originais, setOriginais] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('textos_app').select('chave, texto');
    if (!error && data) {
      const mapa: Record<string, string> = {};
      (data as { chave: string; texto: string }[]).forEach(r => { mapa[r.chave] = r.texto; });
      setTextos(mapa); setOriginais(mapa);
    }
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (chave: string) => {
    const texto = (textos[chave] ?? '').trim();
    if (!texto) { Alert.alert('Texto vazio', 'Escreva a mensagem antes de salvar.'); return; }
    setSalvando(chave);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('textos_app')
      .update({ texto, atualizado_em: new Date().toISOString(), atualizado_por: u.user?.id ?? null })
      .eq('chave', chave);
    setSalvando(null);
    if (error) { Alert.alert('Erro', error.message); return; }
    setOriginais(o => ({ ...o, [chave]: texto }));
    Alert.alert('Salvo', 'A mensagem nova já vale a partir de agora.');
  };

  if (carregando) return <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} />;

  return (
    <>
      <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 14, lineHeight: 17 }}>
        Use {'{nome}'} onde deve entrar o nome da pessoa. Com dois aniversariantes no mesmo dia, os nomes são juntados ("Ana e João").
      </Text>
      {TEXTOS_EDITAVEIS.map(item => {
        const mudou = (textos[item.chave] ?? '') !== (originais[item.chave] ?? '');
        return (
          <View key={item.chave} style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 14 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{item.titulo}</Text>
            <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 4, marginBottom: 10 }}>{item.dica}</Text>
            <TextInput
              value={textos[item.chave] ?? ''}
              onChangeText={v => setTextos(t => ({ ...t, [item.chave]: v }))}
              multiline
              style={{ minHeight: 110, textAlignVertical: 'top', borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, fontSize: 14, color: C.text, backgroundColor: C.bg }}
              placeholder="Mensagem"
              placeholderTextColor={C.textDim}
            />
            <Text style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
              Prévia: {(textos[item.chave] ?? '').split('{nome}').join('Maria')}
            </Text>
            <TouchableOpacity
              disabled={!mudou || salvando === item.chave}
              onPress={() => salvar(item.chave)}
              style={{ marginTop: 12, alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10, backgroundColor: mudou ? C.primary : C.border }}
            >
              {salvando === item.chave
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: mudou ? '#fff' : C.textMuted, fontWeight: '700' }}>Salvar</Text>}
            </TouchableOpacity>
          </View>
        );
      })}
    </>
  );
}

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
  const [avisoEditando, setAvisoEditando] = useState<Aviso | null>(null);
  const [devocionalModalVisible, setDevocionalModalVisible] = useState(false);
  const [eventoModalVisible, setEventoModalVisible] = useState(false);
  const [contasVisitantesVisible, setContasVisitantesVisible] = useState(false);
  const [shortModalVisible, setShortModalVisible] = useState(false);
  const [mensagemModalVisible, setMensagemModalVisible] = useState(false);
  const [escalaAreas, setEscalaAreas] = useState<EscalaArea[]>([]);
  const [areaVoluntarios, setAreaVoluntarios] = useState<AreaVoluntario[]>([]);
  const [lideresPorArea, setLideresPorArea] = useState<Record<string, string[]>>({});
  const [areasLideradas, setAreasLideradas] = useState<string[]>([]);
  const [areaModalVisible, setAreaModalVisible] = useState(false);
  const [areaGerenciarVisible, setAreaGerenciarVisible] = useState<EscalaArea | null>(null);
  const [gerarEscalaModalVisible, setGerarEscalaModalVisible] = useState(false);
  const [editarEscalaVisible, setEditarEscalaVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'convites' | 'stats' | 'ofertas' | 'avisos' | 'culto' | 'devocionais' | 'agenda' | 'shorts' | 'mensagens' | 'escalas' | 'contato' | 'oracao' | 'textos' | 'denuncias'>('avisos');
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
      .from('invite_codes').select('*').eq('tipo', 'banda').order('created_at', { ascending: false });
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
      .from('avisos').select('*').is('grupo', null).is('origem', null).order('created_at', { ascending: false }).limit(50);
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
    const { data: lidData } = await supabase.from('escala_area_lideres').select('area_id, profiles(full_name)');
    const porArea: Record<string, string[]> = {};
    ((lidData ?? []) as any[]).forEach(l => {
      const nome = l.profiles?.full_name;
      if (nome) (porArea[l.area_id] ??= []).push(nome);
    });
    setLideresPorArea(porArea);
    const { data: volData } = await supabase
      .from('escala_area_voluntarios')
      .select('id, area_id, membro_id, lider_de_turno, members(nome, sobrenome)');
    if (volData) {
      setAreaVoluntarios((volData as any[]).map(v => ({
        id: v.id, area_id: v.area_id, membro_id: v.membro_id,
        nome: v.members?.nome ?? '', sobrenome: v.members?.sobrenome ?? '', lider_de_turno: !!v.lider_de_turno,
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

  const removerPedidoOracao = (pedido: PrayerRequest) => {
    Alert.alert('Remover pedido de oração', `Remover "${pedido.titulo}"? Não dá para desfazer.`, [
      { text: t('common.cancelar'), style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        const { error, count } = await supabase.from('prayer_requests').delete({ count: 'exact' }).eq('id', pedido.id);
        if (error || count === 0) { Alert.alert(t('common.erro'), error?.message ?? 'Não foi possível remover.'); return; }
        setPedidosOracao(lista => lista.filter(p => p.id !== pedido.id));
      } },
    ]);
  };

  const avancarStatusOracao = async (pedido: PrayerRequest) => {
    const proximo = pedido.status === 'aberto' ? 'em_oracao' : 'respondido';
    await supabase.from('prayer_requests').update({ status: proximo, updated_at: new Date().toISOString() }).eq('id', pedido.id);
    fetchData();
  };

  // Liga/desliga o destaque da Home direto na lista, sem precisar recriar o
  // evento. Desligar tira só da Home — o evento continua normal na Agenda.
  // Ligar não exige desligar o anterior: o trigger no banco faz isso sozinho.
  // Coloca ou troca a imagem de um evento que já existe (o formulário só cria
  // eventos novos). A imagem antiga fica no Storage — não apagamos nada aqui.
  const [imagemEnviandoId, setImagemEnviandoId] = useState<string | null>(null);
  const trocarImagemEvento = async (evento: AgendaEvento) => {
    const uri = await escolherImagemEvento(t);
    if (!uri) return;
    setImagemEnviandoId(evento.id);
    try {
      const url = await enviarImagemEvento(uri);
      const { error } = await supabase.from('agenda_eventos').update({ imagem_url: url }).eq('id', evento.id);
      if (error) throw error;
      fetchData();
    } catch (e: any) {
      Alert.alert(t('admin.erroAoEnviarImagem'), e?.message ?? 'Tente novamente.');
    } finally {
      setImagemEnviandoId(null);
    }
  };

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

  // Toque no push do Admin (Contato / pedido de oração) chega aqui com
  // `aba`: abre direto nela e relê a lista, para a mensagem nova já aparecer.
  const route = useRoute<any>();
  const abaDoPush = route.params?.aba as string | undefined;
  // Pontinho da aba Denúncias (moderação dos chats, 17/10/2026).
  const [denunciasAbertas, setDenunciasAbertas] = useState(0);
  useEffect(() => {
    if (role !== 'admin') return;
    supabase.from('chat_denuncias').select('chat, mensagem_id').eq('status', 'aberta').then(({ data }) => {
      setDenunciasAbertas(new Set((data ?? []).map((d: any) => `${d.chat}:${d.mensagem_id}`)).size);
    });
  }, [role, route.params]);
  useEffect(() => {
    if (abaDoPush === 'contato' || abaDoPush === 'oracao' || abaDoPush === 'denuncias') {
      setActiveTab(abaDoPush);
      if (!loadingRole && role) fetchData();
    }
  }, [abaDoPush, route.params]);

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
      message: `🎵 Seu convite para a área da Banda de Louvor — Peniel Church:\n\nCódigo: ${code}\n\nAbra o app, vá em Membros → Banda, e insira este código para ativar seu acesso.\n\nAinda não tem o app? Baixe aqui: ${APP_LINK_URL}`,
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
    ? (['avisos', 'culto', 'denuncias', 'devocionais', 'mensagens', 'contato', 'oracao', 'agenda', 'shorts', 'ofertas', 'escalas', 'textos', 'stats'] as const)
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
        {!(abaAtual === 'escalas' && !ehAdmin) && abaAtual !== 'contato' && abaAtual !== 'oracao' && abaAtual !== 'textos' && abaAtual !== 'stats' && abaAtual !== 'denuncias' && abaAtual !== 'culto' && (
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
                name={tab === 'avisos' ? 'megaphone-outline' : tab === 'culto' ? 'videocam-outline' : tab === 'devocionais' ? 'book-outline' : tab === 'mensagens' ? 'newspaper-outline' : tab === 'contato' ? 'chatbubble-ellipses-outline' : tab === 'oracao' ? 'heart-outline' : tab === 'agenda' ? 'calendar-outline' : tab === 'shorts' ? 'film-outline' : tab === 'ofertas' ? 'gift-outline' : tab === 'escalas' ? 'people-circle-outline' : tab === 'textos' ? 'create-outline' : tab === 'denuncias' ? 'flag-outline' : 'bar-chart-outline'}
                size={14}
                color={abaAtual === tab ? C.purple : C.textMuted}
              />
              {tab === 'contato' && contatoMensagens.some(m => m.status === 'novo') && (
                <View style={s.tabDot} />
              )}
              {tab === 'denuncias' && denunciasAbertas > 0 && (
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
                      <Text style={[s.inviteEmail, { marginTop: 4 }]}>{a.texto}</Text>
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
                      <TouchableOpacity
                        style={[s.actionBtn, { borderColor: C.textDim + '40' }]}
                        onPress={() => { setAvisoEditando(a); setAvisoModalVisible(true); }}
                      >
                        <Ionicons name="create-outline" size={16} color={C.textMuted} />
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

          {/* ══ DENÚNCIAS (chats) ═════════════════════════════════════════════ */}
          {abaAtual === 'denuncias' && (
            <DenunciasAdmin key={`den-${refreshing ? 1 : 0}`} C={C as any} onMudou={setDenunciasAbertas} />
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
                    <View style={s.inviteActions}>
                      {p.status !== 'respondido' && (
                        <TouchableOpacity style={[s.actionBtn, { borderColor: C.success + '40' }]} onPress={() => avancarStatusOracao(p)}>
                          <Ionicons name={p.status === 'aberto' ? 'heart-half-outline' : 'checkmark-circle-outline'} size={16} color={C.success} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[s.actionBtn, { borderColor: C.danger + '40' }]} onPress={() => removerPedidoOracao(p)}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ══ CULTO DA SEMANA ══════════════════════════════════════════════ */}
          {abaAtual === 'culto' && <CultoDaSemanaAdmin C={C} />}

          {/* ══ TEXTOS ═══════════════════════════════════════════════════════ */}
          {abaAtual === 'textos' && <TextosAppEditor />}

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
                        {e.recorrente ? `Toda ${DIAS_SEMANA_LABELS[e.dia_semana ?? 0]}` : isoParaDataBR(e.data)} · {e.horario} · {e.local}
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
                        style={[s.actionBtn, { borderColor: e.imagem_url ? C.accent : C.textDim + '40' }]}
                        onPress={() => trocarImagemEvento(e)}
                        disabled={imagemEnviandoId === e.id}
                      >
                        {imagemEnviandoId === e.id ? <ActivityIndicator size="small" color={C.accent} /> : (
                          <Ionicons name={e.imagem_url ? 'image' : 'image-outline'} size={16} color={e.imagem_url ? C.accent : C.textMuted} />
                        )}
                      </TouchableOpacity>
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
                {areasVisiveis.length > 0 && (
                  <TouchableOpacity
                    style={[s.inviteCard, { marginBottom: 16 }]}
                    onPress={() => setEditarEscalaVisible(true)}
                  >
                    <View style={s.inviteLeft}>
                      <Text style={s.inviteCode}>{t('admin.escalaVerEditar')}</Text>
                      <Text style={s.emptyText}>{t('admin.escalaVerEditarDesc')}</Text>
                    </View>
                    <Ionicons name="create-outline" size={22} color={C.purple} />
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
                                {time.length} no time · {area.vagas_padrao} vagas por culto
                              </Text>
                            </View>
                          </View>
                          <Text style={[s.inviteEmail, { marginTop: 6 }]}>
                            {(lideresPorArea[area.id] ?? []).length > 0
                              ? t('admin.liderAreaCartao', { nomes: lideresPorArea[area.id].join(', ') })
                              : t('admin.liderAreaCartaoNenhum')}
                          </Text>
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
              <TraducaoAoVivoAdminPanel />
              {ehAdmin && <VersaoDoAppPanel />}
              <Text style={s.sectionLabel}>{t('admin.usuariosDoApp')}</Text>
              <View style={s.statsGrid}>
                {[
                  { label: t('admin.total'), value: stats.total, icon: 'people-outline', color: C.primary },
                  { label: t('admin.statMembros'), value: stats.membros, icon: 'person-outline', color: C.success },
                  { label: t('admin.statLideres'), value: stats.lideres, icon: 'star-outline', color: C.accent },
                  { label: t('admin.statVisitantes'), value: stats.visitantes, icon: 'eye-outline', color: C.textMuted },
                ].map(stat => {
                  // Só o card de Visitantes abre uma lista (nome e e-mail das contas).
                  const abreLista = stat.label === t('admin.statVisitantes') && ehAdmin;
                  return (
                    <TouchableOpacity key={stat.label} style={s.statCard} disabled={!abreLista} activeOpacity={0.7}
                      onPress={() => setContasVisitantesVisible(true)}>
                      <View style={[s.statIcon, { backgroundColor: stat.color + '18' }]}>
                        <Ionicons name={stat.icon as any} size={22} color={stat.color} />
                      </View>
                      <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
                      <Text style={s.statLabel}>{stat.label}</Text>
                      {abreLista && <Text style={{ fontSize: 10, color: C.primary, marginTop: 4 }}>{t('admin.verLista')}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Convites (códigos) saíram em 16/10/2026: membros e Banda agora são
                  adicionados direto pelo Admin / líder da Banda. */}

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
        onClose={() => { setAvisoModalVisible(false); setAvisoEditando(null); }}
        onSaved={fetchData}
        aviso={avisoEditando}
      />
      <NovoDevocionalModal
        visible={devocionalModalVisible}
        onClose={() => setDevocionalModalVisible(false)}
        onSaved={fetchData}
      />
      <ContasVisitantesModal visible={contasVisitantesVisible} onClose={() => setContasVisitantesVisible(false)} onChanged={fetchData} />
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
        podeMudarVagas={role === 'admin'}
        onClose={() => setAreaGerenciarVisible(null)}
        onChanged={fetchData}
      />
      <EditarEscalaModal
        visible={editarEscalaVisible}
        areas={role === 'admin' ? escalaAreas : escalaAreas.filter(a => areasLideradas.includes(a.id))}
        userId={user?.id}
        onClose={() => setEditarEscalaVisible(false)}
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
  // Tradução ao vivo (painel do Admin — botões Iniciar/Parar)
  traducaoCard: { backgroundColor: C.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 24 },
  traducaoHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  traducaoTitulo: { fontSize: 15, fontWeight: '700', color: C.text },
  traducaoStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  traducaoStatusDot: { width: 7, height: 7, borderRadius: 4 },
  traducaoStatusBadgeText: { fontSize: 11.5, fontWeight: '700' },
  traducaoIdiomasTexto: { fontSize: 12.5, color: C.textMuted, marginTop: 6 },
  traducaoBotoesRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  traducaoBotao: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  traducaoBotaoIniciar: { backgroundColor: C.success },
  traducaoBotaoParar: { backgroundColor: C.danger },
  traducaoBotaoDisabled: { opacity: 0.4 },
  traducaoBotaoTexto: { fontSize: 13.5, fontWeight: '700', color: '#fff' },
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
