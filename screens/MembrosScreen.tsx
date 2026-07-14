import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, StatusBar, Platform,
  KeyboardAvoidingView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';

const C = {
  bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
  border: '#E5E0D8', primary: '#1A1740', primaryLight: '#2D2870',
  accent: '#C8960A', accentLight: '#F5C842', text: '#1A1A2E',
  textMuted: '#6B7280', textDim: '#9CA3AF', danger: '#C0392B', success: '#27AE60',
};

// ─── Types ────────────────────────────────────────────────────────────────────
type Membro = {
  id: string;
  nome: string; sobrenome: string; data_nascimento: string; sexo: string;
  nacionalidade: string; estado_civil: string; profissao: string;
  telefone: string; email: string; endereco: string;
  cidade: string; estado: string; cep: string; pais: string;
  talentos_hobbies: string;
  batizado: boolean; data_batismo: string; membro_desde: string;
  ministerio: string; funcao: string;
  status: 'membro' | 'visitante' | 'lider';
  observacoes: string;
  conjuge_id: string | null; pai_id: string | null; mae_id: string | null;
};

const EMPTY: Omit<Membro, 'id'> = {
  nome: '', sobrenome: '', data_nascimento: '', sexo: '', nacionalidade: 'Brasileira',
  estado_civil: '', profissao: '', telefone: '', email: '',
  endereco: '', cidade: '', estado: '', cep: '', pais: 'Reino Unido',
  talentos_hobbies: '',
  batizado: false, data_batismo: '', membro_desde: '', ministerio: '',
  funcao: '', status: 'membro', observacoes: '',
  conjuge_id: null, pai_id: null, mae_id: null,
};

const ESTADO_CIVIL = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável'];
const MINISTERIOS = ['Louvor', 'Infantil', 'Jovens', 'Intercessão', 'Mídia', 'Recepção', 'Outro'];
const FUNCOES = ['Líder', 'Co-líder', 'Membro', 'Voluntário', 'Pastor', 'Diácono'];
const SEXO_OPCOES: { valor: string; label: string }[] = [
  { valor: 'masculino', label: 'Masculino' },
  { valor: 'feminino', label: 'Feminino' },
  { valor: 'prefiro_nao_informar', label: 'Prefiro não informar' },
];

function statusColor(s: Membro['status']) {
  return s === 'lider' ? C.accent : s === 'membro' ? C.success : C.textMuted;
}
function statusLabel(s: Membro['status']) {
  return s === 'lider' ? 'Líder' : s === 'membro' ? 'Membro' : 'Visitante';
}
function getAge(dob: string): string {
  if (!dob) return '';
  const date = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  if (today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())) age--;
  return `${age} anos`;
}
function isBirthdayThisMonth(dob: string): boolean {
  if (!dob) return false;
  return new Date(dob).getMonth() === new Date().getMonth();
}
function formatDateBR(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function parseDateISO(br: string): string {
  if (!br) return '';
  const [d, m, y] = br.split('/');
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m}-${d}`;
}

// ─── Form Modal ───────────────────────────────────────────────────────────────
function MembroFormModal({ visible, membro, membros, onClose, onSaved }: {
  visible: boolean; membro: Membro | null; membros: Membro[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Omit<Membro, 'id'>>({ ...EMPTY });
  const [section, setSection] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (membro) {
      setForm({
        ...membro,
        data_nascimento: formatDateBR(membro.data_nascimento),
        data_batismo: formatDateBR(membro.data_batismo),
        membro_desde: formatDateBR(membro.membro_desde),
      });
    } else {
      setForm({ ...EMPTY });
    }
    setSection(0);
  }, [membro, visible]);

  const set = (field: keyof Omit<Membro, 'id'>) => (val: any) =>
    setForm(prev => ({ ...prev, [field]: val }));

  const formatDate = (text: string, field: keyof Omit<Membro, 'id'>) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let f = digits;
    if (digits.length > 2) f = digits.slice(0, 2) + '/' + digits.slice(2);
    if (digits.length > 4) f = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    set(field)(f);
  };

  const formatPhone = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 11);
    let f = digits;
    if (digits.length > 0) f = '(' + digits.slice(0, 2);
    if (digits.length > 2) f += ') ' + digits.slice(2, 7);
    if (digits.length > 7) f += '-' + digits.slice(7);
    set('telefone')(f);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { Alert.alert('Atenção', 'Nome é obrigatório.'); return; }
    if (!form.telefone.trim()) { Alert.alert('Atenção', 'Telefone é obrigatório.'); return; }
    setSaving(true);

    const payload = {
      ...form,
      data_nascimento: parseDateISO(form.data_nascimento) || null,
      data_batismo: parseDateISO(form.data_batismo) || null,
      membro_desde: parseDateISO(form.membro_desde) || null,
    };

    let error;
    let novoId: string | undefined = membro?.id;
    if (membro) {
      ({ error } = await supabase.from('members').update(payload).eq('id', membro.id));
    } else {
      const resultado = await supabase.from('members').insert(payload).select('id').single();
      error = resultado.error;
      novoId = resultado.data?.id;
    }

    // Sincroniza o vínculo de cônjuge nos dois sentidos: se eu aponto pra
    // alguém como cônjuge, essa pessoa também deve apontar de volta pra mim.
    if (!error && novoId) {
      const conjugeAnterior = membro?.conjuge_id ?? null;
      if (conjugeAnterior && conjugeAnterior !== form.conjuge_id) {
        await supabase.from('members').update({ conjuge_id: null }).eq('id', conjugeAnterior);
      }
      if (form.conjuge_id) {
        await supabase.from('members').update({ conjuge_id: novoId }).eq('id', form.conjuge_id);
      }
    }

    setSaving(false);
    if (error) {
      Alert.alert('Erro ao salvar', error.message);
    } else {
      onSaved();
      onClose();
    }
  };

  const SECTIONS = ['Pessoal', 'Contato', 'Endereço', 'Igreja', 'Família'];

  const Field = ({ label, value, onChangeText, placeholder = '', keyboardType = 'default', maxLength }: {
    label: string; value: string; onChangeText: (v: string) => void;
    placeholder?: string; keyboardType?: any; maxLength?: number;
  }) => (
    <View style={fm.fieldWrap}>
      <Text style={fm.fieldLabel}>{label}</Text>
      <TextInput
        style={fm.fieldInput} value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={C.textDim}
        keyboardType={keyboardType} maxLength={maxLength}
      />
    </View>
  );

  const SelectPill = ({ label, options, value, onChange }: {
    label: string; options: string[]; value: string; onChange: (v: string) => void;
  }) => (
    <View style={fm.fieldWrap}>
      <Text style={fm.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {options.map(opt => (
            <TouchableOpacity key={opt} style={[fm.pill, value === opt && fm.pillActive]} onPress={() => onChange(opt)}>
              <Text style={[fm.pillText, value === opt && fm.pillTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  const FamiliaPicker = ({ label, value, onChange }: {
    label: string; value: string | null; onChange: (id: string | null) => void;
  }) => {
    const [expandido, setExpandido] = useState(false);
    const [busca, setBusca] = useState('');
    const selecionado = membros.find(m => m.id === value);
    const opcoes = membros.filter(m =>
      m.id !== membro?.id && `${m.nome} ${m.sobrenome}`.toLowerCase().includes(busca.toLowerCase())
    );

    return (
      <View style={fm.fieldWrap}>
        <Text style={fm.fieldLabel}>{label}</Text>
        {selecionado ? (
          <View style={fm.familiaChip}>
            <Text style={fm.familiaChipText}>{selecionado.nome} {selecionado.sobrenome}</Text>
            <TouchableOpacity onPress={() => onChange(null)}>
              <Ionicons name="close-circle" size={18} color={C.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={fm.familiaAddBtn} onPress={() => setExpandido(!expandido)}>
            <Ionicons name="add" size={16} color={C.primary} />
            <Text style={fm.familiaAddText}>Vincular {label.toLowerCase()}</Text>
          </TouchableOpacity>
        )}
        {expandido && !selecionado && (
          <View style={fm.familiaBusca}>
            <TextInput
              style={fm.fieldInput} placeholder="Buscar pelo nome..." placeholderTextColor={C.textDim}
              value={busca} onChangeText={setBusca}
            />
            <View style={{ maxHeight: 160, marginTop: 6 }}>
              {opcoes.slice(0, 20).map(m => (
                <TouchableOpacity key={m.id} style={fm.familiaOpcao} onPress={() => { onChange(m.id); setExpandido(false); setBusca(''); }}>
                  <Text style={fm.familiaOpcaoText}>{m.nome} {m.sobrenome}</Text>
                </TouchableOpacity>
              ))}
              {opcoes.length === 0 && <Text style={{ fontSize: 12, color: C.textDim, padding: 8 }}>Nenhum membro encontrado.</Text>}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={fm.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '95%' }}>
          <View style={fm.sheet}>
            <View style={fm.header}>
              <Text style={fm.title}>{membro ? 'Editar Membro' : 'Novo Membro'}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={fm.sectionTabs}>
              {SECTIONS.map((sec, idx) => (
                <TouchableOpacity key={sec} style={[fm.sectionTab, section === idx && fm.sectionTabActive]} onPress={() => setSection(idx)}>
                  <Text style={[fm.sectionTabText, section === idx && fm.sectionTabTextActive]}>{sec}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {section === 0 && (
                <View style={fm.sectionContent}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}><Field label="Nome *" value={form.nome} onChangeText={set('nome')} placeholder="Nome" /></View>
                    <View style={{ flex: 1.5 }}><Field label="Sobrenome" value={form.sobrenome} onChangeText={set('sobrenome')} placeholder="Sobrenome" /></View>
                  </View>
                  <Field label="Data de Nascimento" value={form.data_nascimento} onChangeText={t => formatDate(t, 'data_nascimento')} placeholder="DD/MM/AAAA" keyboardType="numeric" maxLength={10} />
                  <SelectPill label="Sexo" options={SEXO_OPCOES.map(o => o.label)}
                    value={SEXO_OPCOES.find(o => o.valor === form.sexo)?.label ?? ''}
                    onChange={(label) => set('sexo')(SEXO_OPCOES.find(o => o.label === label)?.valor ?? '')} />
                  <Field label="Nacionalidade" value={form.nacionalidade} onChangeText={set('nacionalidade')} placeholder="Ex: Brasileira" />
                  <SelectPill label="Estado Civil" options={ESTADO_CIVIL} value={form.estado_civil} onChange={set('estado_civil')} />
                  <Field label="Profissão" value={form.profissao} onChangeText={set('profissao')} placeholder="Ex: Professor" />
                  <Field label="Talentos / Hobbies" value={form.talentos_hobbies} onChangeText={set('talentos_hobbies')} placeholder="Ex: Violão, culinária, futebol" />
                </View>
              )}
              {section === 1 && (
                <View style={fm.sectionContent}>
                  <Field label="Telefone / WhatsApp *" value={form.telefone} onChangeText={formatPhone} placeholder="(11) 99999-0000" keyboardType="phone-pad" maxLength={15} />
                  <Field label="E-mail" value={form.email} onChangeText={set('email')} placeholder="email@exemplo.com" keyboardType="email-address" />
                </View>
              )}
              {section === 2 && (
                <View style={fm.sectionContent}>
                  <Field label="Endereço" value={form.endereco} onChangeText={set('endereco')} placeholder="Rua, número, complemento" />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 2 }}><Field label="Cidade" value={form.cidade} onChangeText={set('cidade')} placeholder="Cidade" /></View>
                    <View style={{ flex: 1 }}><Field label="Estado" value={form.estado} onChangeText={v => set('estado')(v.toUpperCase().slice(0, 2))} placeholder="SP" maxLength={2} /></View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}><Field label="CEP" value={form.cep} onChangeText={set('cep')} placeholder="00000-000" keyboardType="numeric" maxLength={9} /></View>
                    <View style={{ flex: 1.5 }}><Field label="País" value={form.pais} onChangeText={set('pais')} placeholder="Ex: Reino Unido" /></View>
                  </View>
                </View>
              )}
              {section === 4 && (
                <View style={fm.sectionContent}>
                  <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 18 }}>
                    Vincule este membro a outros já cadastrados. O vínculo de cônjuge é automático nos dois sentidos.
                  </Text>
                  <FamiliaPicker label="Cônjuge" value={form.conjuge_id} onChange={set('conjuge_id')} />
                  <FamiliaPicker label="Pai" value={form.pai_id} onChange={set('pai_id')} />
                  <FamiliaPicker label="Mãe" value={form.mae_id} onChange={set('mae_id')} />
                </View>
              )}
              {section === 3 && (
                <View style={fm.sectionContent}>
                  <View style={fm.toggleRow}>
                    <View>
                      <Text style={fm.fieldLabel}>Batizado(a)?</Text>
                      <Text style={[fm.toggleStatus, { color: form.batizado ? C.success : C.textMuted }]}>
                        {form.batizado ? 'Sim — nas águas' : 'Ainda não'}
                      </Text>
                    </View>
                    <TouchableOpacity style={[fm.toggleBtn, form.batizado && fm.toggleBtnActive]} onPress={() => set('batizado')(!form.batizado)}>
                      <Ionicons name={form.batizado ? 'water' : 'water-outline'} size={20} color={form.batizado ? '#fff' : C.textMuted} />
                    </TouchableOpacity>
                  </View>
                  {form.batizado && (
                    <Field label="Data do Batismo" value={form.data_batismo} onChangeText={t => formatDate(t, 'data_batismo')} placeholder="DD/MM/AAAA" keyboardType="numeric" maxLength={10} />
                  )}
                  <Field label="Membro desde" value={form.membro_desde} onChangeText={t => formatDate(t, 'membro_desde')} placeholder="DD/MM/AAAA" keyboardType="numeric" maxLength={10} />
                  <SelectPill label="Ministério" options={MINISTERIOS} value={form.ministerio} onChange={set('ministerio')} />
                  <SelectPill label="Função" options={FUNCOES} value={form.funcao} onChange={set('funcao')} />
                  <View style={fm.fieldWrap}>
                    <Text style={fm.fieldLabel}>Status</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      {(['visitante', 'membro', 'lider'] as Membro['status'][]).map(s => (
                        <TouchableOpacity key={s} style={[fm.pill, form.status === s && { backgroundColor: statusColor(s) + '22', borderColor: statusColor(s) }]} onPress={() => set('status')(s)}>
                          <Text style={[fm.pillText, form.status === s && { color: statusColor(s), fontWeight: '700' }]}>{statusLabel(s)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <Field label="Observações" value={form.observacoes} onChangeText={set('observacoes')} placeholder="Notas internas..." />
                </View>
              )}
            </ScrollView>

            <View style={fm.footer}>
              {section > 0 && (
                <TouchableOpacity style={fm.prevBtn} onPress={() => setSection(s => s - 1)}>
                  <Ionicons name="arrow-back" size={16} color={C.primary} />
                  <Text style={fm.prevBtnText}>Anterior</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              {section < SECTIONS.length - 1 ? (
                <TouchableOpacity style={fm.nextBtn} onPress={() => setSection(s => s + 1)}>
                  <Text style={fm.nextBtnText}>Próximo</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={fm.saveBtn} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                    <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={fm.saveBtnText}>Salvar</Text></>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const fm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '95%', paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  sectionTabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 4 },
  sectionTab: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: C.surfaceAlt, alignItems: 'center' },
  sectionTabActive: { backgroundColor: C.primary },
  sectionTabText: { fontSize: 12, fontWeight: '600', color: C.textMuted },
  sectionTabTextActive: { color: '#fff' },
  sectionContent: { padding: 16, gap: 4 },
  fieldWrap: { marginBottom: 12 },
  fieldLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  fieldInput: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15, color: C.text },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  pillActive: { backgroundColor: C.primary + '18', borderColor: C.primary },
  pillText: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
  pillTextActive: { color: C.primary, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 12 },
  toggleStatus: { fontSize: 13, marginTop: 3 },
  toggleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  toggleBtnActive: { backgroundColor: C.success, borderColor: C.success },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  prevBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14 },
  prevBtnText: { fontSize: 14, color: C.primary, fontWeight: '600' },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 },
  nextBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.success, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, minWidth: 90, justifyContent: 'center' },
  saveBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  familiaChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.primary + '12', borderWidth: 1, borderColor: C.primary + '30', borderRadius: 10, paddingHorizontal: 14, height: 46 },
  familiaChipText: { fontSize: 14, color: C.primary, fontWeight: '600' },
  familiaAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46 },
  familiaAddText: { fontSize: 13, color: C.primary, fontWeight: '600' },
  familiaBusca: { marginTop: 8 },
  familiaOpcao: { paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  familiaOpcaoText: { fontSize: 13, color: C.text },
});

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function MembroDetailModal({ membro, membros, onClose, onEdit, onDelete }: {
  membro: Membro | null; membros: Membro[]; onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  if (!membro) return null;
  const nomeDe = (id: string | null) => {
    const m = membros.find(x => x.id === id);
    return m ? `${m.nome} ${m.sobrenome}` : '';
  };
  const sexoLabel = SEXO_OPCOES.find(o => o.valor === membro.sexo)?.label ?? '';
  const Row = ({ icon, label, value }: { icon: string; label: string; value: string }) =>
    value ? (
      <View style={dd.row}>
        <Ionicons name={icon as any} size={16} color={C.textMuted} style={{ width: 20 }} />
        <Text style={dd.rowLabel}>{label}</Text>
        <Text style={dd.rowValue}>{value}</Text>
      </View>
    ) : null;

  return (
    <Modal visible={!!membro} animationType="slide" transparent>
      <View style={dd.overlay}>
        <View style={dd.sheet}>
          <View style={dd.header}>
            <TouchableOpacity onPress={onClose} style={dd.closeBtn}>
              <Ionicons name="chevron-down" size={22} color={C.textMuted} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={onEdit} style={dd.actionBtn}>
                <Ionicons name="pencil-outline" size={18} color={C.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onDelete} style={[dd.actionBtn, { borderColor: C.danger + '40' }]}>
                <Ionicons name="trash-outline" size={18} color={C.danger} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView contentContainerStyle={dd.content}>
            <View style={dd.avatarRow}>
              <View style={dd.avatar}>
                <Text style={dd.avatarInitials}>{membro.nome[0]}{membro.sobrenome[0] ?? ''}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={dd.name}>{membro.nome} {membro.sobrenome}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <View style={[dd.badge, { backgroundColor: statusColor(membro.status) + '18' }]}>
                    <Text style={[dd.badgeText, { color: statusColor(membro.status) }]}>{statusLabel(membro.status)}</Text>
                  </View>
                  {membro.batizado && (
                    <View style={[dd.badge, { backgroundColor: C.primary + '15' }]}>
                      <Ionicons name="water-outline" size={11} color={C.primary} />
                      <Text style={[dd.badgeText, { color: C.primary }]}>Batizado</Text>
                    </View>
                  )}
                  {isBirthdayThisMonth(membro.data_nascimento) && (
                    <View style={[dd.badge, { backgroundColor: C.accent + '20' }]}>
                      <Text style={[dd.badgeText, { color: C.accent }]}>🎂 Aniversário</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            <Text style={dd.sectionTitle}>Dados Pessoais</Text>
            <View style={dd.card}>
              <Row icon="calendar-outline" label="Nascimento" value={`${formatDateBR(membro.data_nascimento)} ${getAge(membro.data_nascimento) ? '· ' + getAge(membro.data_nascimento) : ''}`} />
              <Row icon="male-female-outline" label="Sexo" value={sexoLabel} />
              <Row icon="flag-outline" label="Nacionalidade" value={membro.nacionalidade} />
              <Row icon="heart-outline" label="Estado Civil" value={membro.estado_civil} />
              <Row icon="briefcase-outline" label="Profissão" value={membro.profissao} />
              <Row icon="color-palette-outline" label="Talentos" value={membro.talentos_hobbies} />
            </View>
            <Text style={dd.sectionTitle}>Contato</Text>
            <View style={dd.card}>
              <Row icon="call-outline" label="Telefone" value={membro.telefone} />
              <Row icon="mail-outline" label="E-mail" value={membro.email} />
            </View>
            <Text style={dd.sectionTitle}>Endereço</Text>
            <View style={dd.card}>
              <Row icon="home-outline" label="Endereço" value={membro.endereco} />
              <Row icon="location-outline" label="Cidade" value={`${membro.cidade}${membro.estado ? ' – ' + membro.estado : ''}`} />
              <Row icon="map-outline" label="CEP" value={membro.cep} />
              <Row icon="earth-outline" label="País" value={membro.pais} />
            </View>
            {(membro.conjuge_id || membro.pai_id || membro.mae_id) && (
              <>
                <Text style={dd.sectionTitle}>Família</Text>
                <View style={dd.card}>
                  <Row icon="heart-circle-outline" label="Cônjuge" value={nomeDe(membro.conjuge_id)} />
                  <Row icon="man-outline" label="Pai" value={nomeDe(membro.pai_id)} />
                  <Row icon="woman-outline" label="Mãe" value={nomeDe(membro.mae_id)} />
                </View>
              </>
            )}
            <Text style={dd.sectionTitle}>Igreja</Text>
            <View style={dd.card}>
              <Row icon="water-outline" label="Batismo" value={membro.data_batismo ? `Sim · ${formatDateBR(membro.data_batismo)}` : 'Não'} />
              <Row icon="calendar-outline" label="Membro desde" value={formatDateBR(membro.membro_desde)} />
              <Row icon="people-outline" label="Ministério" value={membro.ministerio} />
              <Row icon="star-outline" label="Função" value={membro.funcao} />
              {!!membro.observacoes && <Row icon="document-text-outline" label="Obs." value={membro.observacoes} />}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const dd = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  actionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 20 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 22, fontWeight: '800', color: '#fff' },
  name: { fontSize: 20, fontWeight: '800', color: C.text },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  card: { backgroundColor: C.surfaceAlt, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel: { fontSize: 13, color: C.textMuted, width: 90 },
  rowValue: { flex: 1, fontSize: 13, color: C.text, fontWeight: '500' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MembrosScreen() {
  const { user } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<Membro['status'] | 'todos'>('todos');
  const [filterBirthday, setFilterBirthday] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingMembro, setEditingMembro] = useState<Membro | null>(null);
  const [detailMembro, setDetailMembro] = useState<Membro | null>(null);

  // Esta tela mostra telefone, e-mail e endereço de todo mundo — só
  // admin/líder podem acessar (a tabela `members` também tem RLS reforçando
  // isso no banco, então mesmo sem essa checagem os dados não vazariam).
  useEffect(() => {
    if (!user) { setLoadingRole(false); return; }
    supabase.from('profiles').select('role').eq('id', user.id).single()
      .then(({ data }) => { setRole(data?.role ?? null); setLoadingRole(false); });
  }, [user]);

  const fetchMembros = useCallback(async () => {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('nome', { ascending: true });
    if (!error && data) setMembros(data as Membro[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (role === 'admin' || role === 'lider') fetchMembros();
  }, [role, fetchMembros]);

  const handleDelete = (id: string) => {
    Alert.alert('Remover Membro', 'Deseja remover este membro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          await supabase.from('members').delete().eq('id', id);
          setDetailMembro(null);
          fetchMembros();
        },
      },
    ]);
  };

  const filtered = membros.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${m.nome} ${m.sobrenome}`.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'todos' || m.status === filterStatus;
    const matchBirthday = !filterBirthday || isBirthdayThisMonth(m.data_nascimento);
    return matchSearch && matchStatus && matchBirthday;
  });

  const birthdayCount = membros.filter(m => isBirthdayThisMonth(m.data_nascimento)).length;

  if (loadingRole) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (role !== 'admin' && role !== 'lider') {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={C.primary} />
        <View style={s.header}>
          <Text style={s.headerTitle}>Membros</Text>
        </View>
        <View style={s.empty}>
          <Ionicons name="lock-closed-outline" size={48} color={C.textDim} />
          <Text style={[s.emptyText, { fontWeight: '700', fontSize: 16, marginTop: 12 }]}>Acesso restrito</Text>
          <Text style={s.emptyText}>Esta lista com dados dos membros é exclusiva para líderes e administradores.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Membros</Text>
          <Text style={s.headerSub}>{membros.length} cadastrados</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => { setEditingMembro(null); setFormVisible(true); }}>
          <Ionicons name="person-add-outline" size={18} color={C.primary} />
          <Text style={s.addBtnText}>Novo</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { label: 'Membros', value: membros.filter(m => m.status === 'membro').length, color: C.success },
          { label: 'Líderes', value: membros.filter(m => m.status === 'lider').length, color: C.accent },
          { label: 'Visitantes', value: membros.filter(m => m.status === 'visitante').length, color: C.textMuted },
          { label: 'Aniv. mês', value: birthdayCount, color: '#7C4DFF' },
        ].map(stat => (
          <TouchableOpacity key={stat.label} style={s.statCard}
            onPress={() => stat.label === 'Aniv. mês' && setFilterBirthday(f => !f)}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={16} color={C.textMuted} />
          <TextInput style={s.searchInput} placeholder="Buscar por nome ou e-mail..." placeholderTextColor={C.textDim} value={search} onChangeText={setSearch} />
          {!!search && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color={C.textMuted} /></TouchableOpacity>}
        </View>
      </View>

      {/* Filters */}
      <View style={s.filterRow}>
        {(['todos', 'membro', 'lider', 'visitante'] as const).map(f => (
          <TouchableOpacity key={f} style={[s.filterPill, filterStatus === f && s.filterPillActive]} onPress={() => setFilterStatus(f)}>
            <Text style={[s.filterPillText, filterStatus === f && s.filterPillTextActive]}>{f === 'todos' ? 'Todos' : statusLabel(f)}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.filterPill, filterBirthday && { backgroundColor: C.accent + '18', borderColor: C.accent }]} onPress={() => setFilterBirthday(f => !f)}>
          <Text style={[s.filterPillText, filterBirthday && { color: C.accent, fontWeight: '700' }]}>🎂 Mês</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={{ color: C.textMuted, marginTop: 12 }}>Carregando membros...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchMembros(); }} />}
        >
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={40} color={C.textDim} />
              <Text style={s.emptyText}>{membros.length === 0 ? 'Nenhum membro cadastrado ainda' : 'Nenhum membro encontrado'}</Text>
            </View>
          ) : (
            filtered.map(m => (
              <TouchableOpacity key={m.id} style={s.memberCard} onPress={() => setDetailMembro(m)} activeOpacity={0.75}>
                <View style={[s.memberAvatar, { backgroundColor: statusColor(m.status) + '22' }]}>
                  <Text style={[s.memberInitials, { color: statusColor(m.status) }]}>{m.nome[0]}{m.sobrenome?.[0] ?? ''}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.memberName}>{m.nome} {m.sobrenome}</Text>
                    {isBirthdayThisMonth(m.data_nascimento) && <Text style={{ fontSize: 14 }}>🎂</Text>}
                  </View>
                  <Text style={s.memberSub}>{m.ministerio ? `${m.ministerio} · ` : ''}{m.telefone}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[s.statusBadge, { backgroundColor: statusColor(m.status) + '18' }]}>
                    <Text style={[s.statusBadgeText, { color: statusColor(m.status) }]}>{statusLabel(m.status)}</Text>
                  </View>
                  {m.batizado && <Ionicons name="water-outline" size={13} color={C.primary} />}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <MembroFormModal
        visible={formVisible}
        membro={editingMembro}
        membros={membros}
        onClose={() => { setFormVisible(false); setEditingMembro(null); }}
        onSaved={fetchMembros}
      />
      <MembroDetailModal
        membro={detailMembro}
        membros={membros}
        onClose={() => setDetailMembro(null)}
        onEdit={() => { setEditingMembro(detailMembro); setDetailMembro(null); setFormVisible(true); }}
        onDelete={() => detailMembro && handleDelete(detailMembro.id)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: C.primary },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F5C842', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: C.primary },
  statsRow: { flexDirection: 'row', backgroundColor: C.primary, paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '500' },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, height: 40, gap: 8, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  filterPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  filterPillActive: { backgroundColor: C.primary + '15', borderColor: C.primary },
  filterPillText: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
  filterPillTextActive: { color: C.primary, fontWeight: '700' },
  list: { padding: 16, gap: 8, paddingBottom: 32 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: C.textMuted, textAlign: 'center' },
  memberCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border },
  memberAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  memberInitials: { fontSize: 17, fontWeight: '800' },
  memberName: { fontSize: 14, fontWeight: '700', color: C.text },
  memberSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
});
