import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, StatusBar, Platform,
  KeyboardAvoidingView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { apagarLinha } from '../lib/db';
import { useAuth } from '../lib/useAuth';
import { PAISES, Pais, bandeira, formatarNumeroLocal, montarTelefone, splitTelefone, paisPorNome, paisPorIso2, paisPadraoDdi } from '../lib/paises';
import { useTranslation } from 'react-i18next';

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
  telefone: string; email: string; endereco: string; complemento: string;
  cidade: string; estado: string; cep: string; pais: string;
  talentos_hobbies: string;
  batizado: boolean; data_batismo: string; membro_desde: string;
  igreja_anterior: boolean; igreja_anterior_nome: string;
  ministerio_anterior: boolean; ministerio_anterior_qual: string;
  deseja_servir: boolean; deseja_servir_area: string;
  ministerio: string; funcao: string;
  status: 'membro' | 'visitante' | 'lider' | 'crianca';
  observacoes: string;
  // Preenchidos pela própria pessoa em "Meu Cadastro" — existiam no banco desde
  // agosto, mas não apareciam em lugar nenhum do Admin.
  instagram: string; deseja_batizar: boolean; compartilhar_mais: string;
  conjuge_id: string | null; pai_id: string | null; mae_id: string | null;
  profile_id: string | null;
  // Preenchido quando a pessoa é dependente de outro cadastro — criança
  // cadastrada pelo pai ou pela mãe em "Meu Cadastro". É este campo, e não o
  // status, que define se a linha é uma criança: as telas que filtram por
  // status continuam corretas sem saber que crianças existem.
  responsavel_id: string | null;
  mostrar_aniversario: boolean;
  // Ficha de segurança (migração 20260918090000). `alergias` e
  // `necessidades_especiais` são dado de saúde — de um menor, no caso das
  // crianças. Vivem aqui porque `members` é fechada; nenhuma RPC pública os
  // devolve, e nenhuma deve passar a devolver.
  alergias: string; necessidades_especiais: string; info_responsavel: string;
};

type ProfileLite = { id: string; full_name: string | null };

const EMPTY: Omit<Membro, 'id'> = {
  nome: '', sobrenome: '', data_nascimento: '', sexo: '', nacionalidade: 'Brasileira',
  estado_civil: '', profissao: '', telefone: '', email: '',
  endereco: '', complemento: '', cidade: '', estado: '', cep: '', pais: 'Reino Unido',
  talentos_hobbies: '',
  batizado: false, data_batismo: '', membro_desde: '',
  igreja_anterior: false, igreja_anterior_nome: '',
  ministerio_anterior: false, ministerio_anterior_qual: '',
  deseja_servir: false, deseja_servir_area: '',
  ministerio: '',
  funcao: '', status: 'membro', observacoes: '',
  instagram: '', deseja_batizar: false, compartilhar_mais: '',
  conjuge_id: null, pai_id: null, mae_id: null, profile_id: null,
  responsavel_id: null, mostrar_aniversario: true,
  alergias: '', necessidades_especiais: '', info_responsavel: '',
};

const ESTADO_CIVIL = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável'];
const MINISTERIOS = ['Louvor', 'Infantil', 'Jovens', 'Intercessão', 'Mídia', 'Recepção', 'Outro'];
const FUNCOES = ['Líder', 'Co-líder', 'Membro', 'Voluntário', 'Pastor', 'Diácono'];
const SEXO_OPCOES: { valor: string; chave: string }[] = [
  { valor: 'masculino', chave: 'membros.op.masculino' },
  { valor: 'feminino', chave: 'membros.op.feminino' },
  { valor: 'prefiro_nao_informar', chave: 'membros.op.prefiroNaoInformar' },
];

// Chave de tradução de cada opção gravada no banco. O que não estiver aqui
// aparece como está — é o caso de valor antigo digitado à mão.
const OPCAO_CHAVE: Record<string, string> = {
  'Solteiro(a)': 'membros.op.solteiro', 'Casado(a)': 'membros.op.casado',
  'Divorciado(a)': 'membros.op.divorciado', 'Viúvo(a)': 'membros.op.viuvo',
  'União estável': 'membros.op.uniaoEstavel',
  'Louvor': 'membros.op.louvor', 'Infantil': 'membros.op.infantil',
  'Jovens': 'membros.op.jovens', 'Intercessão': 'membros.op.intercessao',
  'Mídia': 'membros.op.midia', 'Recepção': 'membros.op.recepcao',
  'Outro': 'membros.op.outro', 'Líder': 'membros.op.lider',
  'Co-líder': 'membros.op.coLider', 'Membro': 'membros.op.membro',
  'Voluntário': 'membros.op.voluntario', 'Pastor': 'membros.op.pastor',
  'Diácono': 'membros.op.diacono',
};

function statusColor(s: Membro['status']) {
  if (s === 'crianca') return '#7C4DFF';
  return s === 'lider' ? C.accent : s === 'membro' ? C.success : C.textMuted;
}
// Devolve a CHAVE — a função vive fora de qualquer componente, onde não há
// `t`. Quem renderiza traduz.
function statusChave(s: Membro['status']) {
  if (s === 'crianca') return 'membros.op.crianca';
  return s === 'lider' ? 'membros.op.lider' : s === 'membro' ? 'membros.op.membro' : 'membros.op.visitante';
}
function getAge(dob: string): string {
  if (!dob) return '';
  const date = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  if (today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())) age--;
  return `${age} anos`;
}
// `new Date('1990-05-12')` é interpretado como meia-noite UTC, e `getMonth()`
// devolve o mês no fuso do APARELHO: com o celular no Brasil (UTC-3), todo
// aniversário do dia 1º aparecia no mês anterior. A data de nascimento é uma
// data de calendário, não um instante — ler direto da string é o certo.
function mesDoNascimento(dob: string): number | null {
  if (!dob) return null;
  const mes = Number(String(dob).split('-')[1]);
  return mes >= 1 && mes <= 12 ? mes : null;
}
function diaDoNascimento(dob: string): number | null {
  if (!dob) return null;
  const dia = Number(String(dob).split('-')[2]?.slice(0, 2));
  return dia >= 1 && dia <= 31 ? dia : null;
}
/** Mês de hoje em Londres — a igreja é no Reino Unido e o aparelho pode não
 *  estar. Sem isto, o card "Aniversariantes do mês" mostraria outro mês para
 *  quem abrisse o app viajando. */
function mesAtualEmLondres(): number {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', month: '2-digit' }).formatToParts(new Date());
  return Number(partes.find(x => x.type === 'month')?.value ?? 1);
}
const MESES_CHAVE = [
  'meses.janeiro', 'meses.fevereiro', 'meses.marco', 'meses.abril',
  'meses.maio', 'meses.junho', 'meses.julho', 'meses.agosto',
  'meses.setembro', 'meses.outubro', 'meses.novembro', 'meses.dezembro',
];
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
// "Chegou na Peniel" só pergunta mês/ano (ninguém lembra o dia exato) — guarda
// como dia 01 do mês pra continuar usando a mesma coluna `date` do banco.
function formatMesAnoFromISO(iso: string): string {
  if (!iso) return '';
  const [y, m] = iso.split('-');
  if (!y || !m) return '';
  return `${m}/${y}`;
}
function parseMesAnoToISO(mmAAAA: string): string {
  const [m, y] = mmAAAA.split('/');
  if (!m || !y || y.length !== 4) return '';
  return `${y}-${m}-01`;
}

// ─── Campos do formulário (fora do MembroFormModal de propósito) ──────────────
// Bug do teclado fechando a cada letra (16ª rodada): esses componentes
// estavam declarados DENTRO de MembroFormModal. Cada tecla digitada chama
// `setForm`, que re-renderiza o modal inteiro — e como esses componentes
// eram recriados (nova identidade de função) a cada render, o React
// desmontava o TextInput antigo e montava um novo, perdendo o foco/fechando
// o teclado. Mesma causa e mesmo fix já aplicados no MeuCadastroScreen (8ª
// rodada) e nos modais do Admin (13ª rodada): mover pra fora, escopo do
// módulo, com o que antes vinha "de graça" via closure agora como prop.
function Field({ label, value, onChangeText, placeholder = '', keyboardType = 'default', maxLength, multiline = false, autoCapitalize }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; maxLength?: number;
  multiline?: boolean; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={fm.fieldWrap}>
      <Text style={fm.fieldLabel}>{label}</Text>
      <TextInput
        style={[fm.fieldInput, multiline && fm.fieldInputMultilinha]} value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={C.textDim}
        keyboardType={keyboardType} maxLength={maxLength}
        multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

// `rotulo` existe para traduzir o que APARECE sem mexer no que é GRAVADO.
// Estado civil, ministério e função vão para o banco exatamente como estão
// nestas listas: traduzir o valor faria a mesma pessoa ficar 'Casado(a)' na
// ficha de um admin e 'Married' na de outro, e os filtros parariam de casar.
function SelectPill({ label, options, value, onChange, rotulo }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
  rotulo?: (opcao: string) => string;
}) {
  return (
    <View style={fm.fieldWrap}>
      <Text style={fm.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {options.map(opt => (
            <TouchableOpacity key={opt} style={[fm.pill, value === opt && fm.pillActive]} onPress={() => onChange(opt)}>
              <Text style={[fm.pillText, value === opt && fm.pillTextActive]}>{rotulo ? rotulo(opt) : opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function FamiliaPicker({ label, value, onChange, membros, excludeId }: {
  label: string; value: string | null; onChange: (id: string | null) => void;
  membros: Membro[]; excludeId?: string;
}) {
  const { t } = useTranslation();
  const [expandido, setExpandido] = useState(false);
  const [busca, setBusca] = useState('');
  const selecionado = membros.find(m => m.id === value);
  const opcoes = membros.filter(m =>
    m.id !== excludeId && `${m.nome} ${m.sobrenome}`.toLowerCase().includes(busca.toLowerCase())
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
            style={fm.fieldInput} placeholder={t('membros.buscarPeloNome')} placeholderTextColor={C.textDim}
            value={busca} onChangeText={setBusca}
          />
          <View style={{ maxHeight: 160, marginTop: 6 }}>
            {opcoes.slice(0, 20).map(m => (
              <TouchableOpacity key={m.id} style={fm.familiaOpcao} onPress={() => { onChange(m.id); setExpandido(false); setBusca(''); }}>
                <Text style={fm.familiaOpcaoText}>{m.nome} {m.sobrenome}</Text>
              </TouchableOpacity>
            ))}
            {opcoes.length === 0 && <Text style={{ fontSize: 12, color: C.textDim, padding: 8 }}>{t('membros.nenhumMembroEncontrado')}</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

function ContaSection({ membro, profileId, onProfileIdChange }: {
  membro: Membro | null; profileId: string | null; onProfileIdChange: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<ProfileLite[]>([]);
  const [perfilVinculado, setPerfilVinculado] = useState<ProfileLite | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [areas, setAreas] = useState<{ id: string; nome: string }[]>([]);
  const [areasLideradas, setAreasLideradas] = useState<string[]>([]);
  const [salvandoPapel, setSalvandoPapel] = useState(false);

  useEffect(() => {
    if (!profileId) { setPerfilVinculado(null); setGrupos([]); setAreasLideradas([]); return; }
    setCarregando(true);
    (async () => {
      const [{ data: perfil }, { data: gl }, { data: areasData }, { data: eal }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').eq('id', profileId).single(),
        supabase.from('group_leaders').select('grupo').eq('profile_id', profileId),
        supabase.from('escala_areas').select('id, nome').order('nome'),
        supabase.from('escala_area_lideres').select('area_id').eq('profile_id', profileId),
      ]);
      setPerfilVinculado((perfil as ProfileLite) ?? null);
      setGrupos((gl ?? []).map((g: any) => g.grupo));
      setAreas(areasData ?? []);
      setAreasLideradas((eal ?? []).map((a: any) => a.area_id));
      setCarregando(false);
    })();
  }, [profileId]);

  useEffect(() => {
    if (busca.trim().length < 2) { setResultados([]); return; }
    const t = setTimeout(() => {
      supabase.from('profiles').select('id, full_name').ilike('full_name', `%${busca.trim()}%`).limit(8)
        .then(({ data }) => setResultados((data as ProfileLite[]) ?? []));
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const vincular = async (perfil: ProfileLite) => {
    if (!membro) return;
    const { error } = await supabase.from('members').update({ profile_id: perfil.id }).eq('id', membro.id);
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    onProfileIdChange(perfil.id);
    setBusca(''); setResultados([]);
  };

  const desvincular = () => {
    if (!membro) return;
    Alert.alert(t('membros.desvincularConta'), t('membros.removerOVinculoComEssa'), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desvincular', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('members').update({ profile_id: null }).eq('id', membro.id);
          if (error) { Alert.alert(t('common.erro'), error.message); return; }
          onProfileIdChange(null);
        },
      },
    ]);
  };

  const alternarGrupo = async (grupo: string) => {
    if (!profileId) return;
    setSalvandoPapel(true);
    if (grupos.includes(grupo)) {
      const { error } = await supabase.from('group_leaders').delete().eq('profile_id', profileId).eq('grupo', grupo);
      if (error) { Alert.alert(t('common.erro'), error.message); setSalvandoPapel(false); return; }
      setGrupos(prev => prev.filter(g => g !== grupo));
    } else {
      const { error } = await supabase.from('group_leaders').insert({ profile_id: profileId, grupo });
      if (error) { Alert.alert(t('common.erro'), error.message); setSalvandoPapel(false); return; }
      setGrupos(prev => [...prev, grupo]);
    }
    setSalvandoPapel(false);
  };

  const alternarArea = async (areaId: string) => {
    if (!profileId) return;
    setSalvandoPapel(true);
    if (areasLideradas.includes(areaId)) {
      const { error } = await supabase.from('escala_area_lideres').delete().eq('profile_id', profileId).eq('area_id', areaId);
      if (error) { Alert.alert(t('common.erro'), error.message); setSalvandoPapel(false); return; }
      setAreasLideradas(prev => prev.filter(a => a !== areaId));
    } else {
      const { error } = await supabase.from('escala_area_lideres').insert({ profile_id: profileId, area_id: areaId });
      if (error) { Alert.alert(t('common.erro'), error.message); setSalvandoPapel(false); return; }
      setAreasLideradas(prev => [...prev, areaId]);
    }
    setSalvandoPapel(false);
  };

  if (!membro) {
    return (
      <View style={fm.sectionContent}>
        <Text style={{ fontSize: 13, color: C.textMuted, lineHeight: 20 }}>
          Salve o membro primeiro para poder vincular uma conta de login.
        </Text>
      </View>
    );
  }

  return (
    <View style={fm.sectionContent}>
      <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 18 }}>
        Vincule este membro a uma conta de login do app para poder designá-lo líder de um grupo ou de uma área de escala.
      </Text>

      <View style={fm.fieldWrap}>
        <Text style={fm.fieldLabel}>{t('membros.contaDoApp')}</Text>
        {perfilVinculado ? (
          <View style={fm.familiaChip}>
            <Text style={fm.familiaChipText}>{perfilVinculado.full_name ?? t('membros.semNome')}</Text>
            <TouchableOpacity onPress={desvincular}>
              <Ionicons name="close-circle" size={18} color={C.textMuted} />
            </TouchableOpacity>
          </View>
        ) : carregando ? (
          <ActivityIndicator size="small" color={C.primary} />
        ) : (
          <View style={fm.familiaBusca}>
            <TextInput
              style={fm.fieldInput} placeholder={t('membros.buscarContaPeloNome')} placeholderTextColor={C.textDim}
              value={busca} onChangeText={setBusca}
            />
            {resultados.map(r => (
              <TouchableOpacity key={r.id} style={fm.familiaOpcao} onPress={() => vincular(r)}>
                <Text style={fm.familiaOpcaoText}>{r.full_name ?? t('membros.semNome')}</Text>
              </TouchableOpacity>
            ))}
            {busca.trim().length >= 2 && resultados.length === 0 && (
              <Text style={{ fontSize: 12, color: C.textDim, padding: 8 }}>{t('membros.nenhumaContaEncontrada')}</Text>
            )}
          </View>
        )}
      </View>

      {!!profileId && !carregando && (
        <>
          <View style={fm.fieldWrap}>
            <Text style={fm.fieldLabel}>{t('membros.liderDeGrupo')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              {(['mulheres', 'homens', 'jovens'] as const).map(g => (
                <TouchableOpacity key={g} disabled={salvandoPapel} style={[fm.pill, grupos.includes(g) && fm.pillActive]} onPress={() => alternarGrupo(g)}>
                  <Text style={[fm.pillText, grupos.includes(g) && fm.pillTextActive]}>
                    {g === 'mulheres' ? 'Mulheres' : g === 'homens' ? 'Homens' : 'Jovens'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={fm.fieldWrap}>
            <Text style={fm.fieldLabel}>{t('membros.liderDeAreaDeEscala')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              {areas.map(a => (
                <TouchableOpacity key={a.id} disabled={salvandoPapel} style={[fm.pill, areasLideradas.includes(a.id) && fm.pillActive]} onPress={() => alternarArea(a.id)}>
                  <Text style={[fm.pillText, areasLideradas.includes(a.id) && fm.pillTextActive]}>{a.nome}</Text>
                </TouchableOpacity>
              ))}
              {areas.length === 0 && <Text style={{ fontSize: 12, color: C.textDim }}>{t('membros.nenhumaAreaCadastrada')}</Text>}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

// Campo de telefone com seletor de DDI (24ª rodada — antes o telefone só
// tinha máscara de Brasil, não dava pra digitar um número de outro país
// tipo Reino Unido). O DDI selecionado e o número local vêm os dois juntos
// do MESMO valor salvo (`+55 (11) 98765-4321`, por ex.) — `splitTelefone`
// separa e `montarTelefone` junta de volta, então não precisa de um campo
// novo no banco. `paisPadrao` é só usado quando o campo ainda está vazio
// (número novo), pra já vir com o DDI que combina com o País do endereço.
function TelefoneField({ label, value, onChange, paisPadrao }: {
  label: string; value: string; onChange: (v: string) => void; paisPadrao: string;
}) {
  const { t } = useTranslation();
  const [expandido, setExpandido] = useState(false);
  const [busca, setBusca] = useState('');
  const parsed = value ? splitTelefone(value) : { iso2: paisPadrao, numeroLocal: '' };
  const iso2 = parsed.iso2;
  const numeroLocal = parsed.numeroLocal;
  const atual = paisPorIso2(iso2) ?? PAISES[0];
  const opcoes = PAISES.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) || p.ddi.includes(busca.replace('+', ''))
  );

  const atualizarNumero = (texto: string) => onChange(montarTelefone(iso2, formatarNumeroLocal(iso2, texto)));
  const trocarPais = (pais: Pais) => {
    onChange(montarTelefone(pais.iso2, formatarNumeroLocal(pais.iso2, numeroLocal)));
    setExpandido(false);
    setBusca('');
  };

  return (
    <View style={fm.fieldWrap}>
      <Text style={fm.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity style={fm.ddiBtn} onPress={() => setExpandido(e => !e)}>
          <Text style={fm.ddiBtnText} numberOfLines={1}>{bandeira(atual.iso2)} +{atual.ddi}</Text>
          <Ionicons name={expandido ? 'chevron-up' : 'chevron-down'} size={14} color={C.textMuted} />
        </TouchableOpacity>
        <TextInput
          style={[fm.fieldInput, { flex: 1 }]} value={numeroLocal} onChangeText={atualizarNumero}
          placeholder={iso2 === 'GB' ? '7700 900000' : iso2 === 'BR' ? '(11) 99999-0000' : t('membros.numero')}
          placeholderTextColor={C.textDim} keyboardType="phone-pad"
        />
      </View>
      {expandido && (
        <View style={fm.familiaBusca}>
          <TextInput
            style={fm.fieldInput} placeholder={t('membros.buscarPaisOuDdi')} placeholderTextColor={C.textDim}
            value={busca} onChangeText={setBusca}
          />
          <ScrollView style={{ maxHeight: 200, marginTop: 6 }} keyboardShouldPersistTaps="handled">
            {opcoes.slice(0, 40).map(p => (
              <TouchableOpacity key={p.iso2} style={fm.familiaOpcao} onPress={() => trocarPais(p)}>
                <Text style={fm.familiaOpcaoText}>{bandeira(p.iso2)}  {p.nome}  (+{p.ddi})</Text>
              </TouchableOpacity>
            ))}
            {opcoes.length === 0 && <Text style={{ fontSize: 12, color: C.textDim, padding: 8 }}>{t('membros.nenhumPaisEncontrado')}</Text>}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// Campo de País do endereço, agora um seletor em vez de texto livre (mesma
// lista de países do DDI acima) — era ele quem travava o CEP/Estado sempre
// no formato de Brasil, mesmo pra quem mora no Reino Unido.
function PaisEnderecoField({ label, value, onChange }: {
  label: string; value: string; onChange: (nome: string) => void;
}) {
  const { t } = useTranslation();
  const [expandido, setExpandido] = useState(false);
  const [busca, setBusca] = useState('');
  const atual = paisPorNome(value);
  const opcoes = PAISES.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <View style={fm.fieldWrap}>
      <Text style={fm.fieldLabel}>{label}</Text>
      <TouchableOpacity style={fm.ddiBtnFull} onPress={() => setExpandido(e => !e)}>
        <Text style={fm.ddiBtnText} numberOfLines={1}>
          {atual ? `${bandeira(atual.iso2)} ${atual.nome}` : (value || t('membros.selecionarPais'))}
        </Text>
        <Ionicons name={expandido ? 'chevron-up' : 'chevron-down'} size={14} color={C.textMuted} />
      </TouchableOpacity>
      {expandido && (
        <View style={fm.familiaBusca}>
          <TextInput
            style={fm.fieldInput} placeholder={t('membros.buscarPais')} placeholderTextColor={C.textDim}
            value={busca} onChangeText={setBusca}
          />
          <ScrollView style={{ maxHeight: 200, marginTop: 6 }} keyboardShouldPersistTaps="handled">
            {opcoes.slice(0, 40).map(p => (
              <TouchableOpacity key={p.iso2} style={fm.familiaOpcao} onPress={() => { onChange(p.nome); setExpandido(false); setBusca(''); }}>
                <Text style={fm.familiaOpcaoText}>{bandeira(p.iso2)} {p.nome}</Text>
              </TouchableOpacity>
            ))}
            {opcoes.length === 0 && <Text style={{ fontSize: 12, color: C.textDim, padding: 8 }}>{t('membros.nenhumPaisEncontrado')}</Text>}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ─── Form Modal ───────────────────────────────────────────────────────────────
function MembroFormModal({ visible, membro, membros, isAdmin, onClose, onSaved }: {
  visible: boolean; membro: Membro | null; membros: Membro[]; isAdmin: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Omit<Membro, 'id'>>({ ...EMPTY });
  const [section, setSection] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (membro) {
      setForm({
        ...membro,
        data_nascimento: formatDateBR(membro.data_nascimento),
        data_batismo: formatDateBR(membro.data_batismo),
        membro_desde: formatMesAnoFromISO(membro.membro_desde),
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

  // O telefone em si não precisa mais de um formatador aqui — o TelefoneField
  // (componente de módulo, ver acima) cuida da máscara dele sozinho, porque
  // ela depende do país escolhido no seletor de DDI, não só do que a pessoa
  // digita. O CEP/Postcode abaixo segue o mesmo princípio, mas usando o País
  // do próprio endereço (`form.pais`), não o do telefone.
  const cepBrasil = form.pais === 'Brasil';
  const cepReinoUnido = form.pais === 'Reino Unido';
  const formatCep = (texto: string) => {
    if (cepBrasil) {
      const digits = texto.replace(/\D/g, '').slice(0, 8);
      let f = digits;
      if (digits.length > 5) f = digits.slice(0, 5) + '-' + digits.slice(5);
      set('cep')(f);
    } else if (cepReinoUnido) {
      set('cep')(texto.toUpperCase().slice(0, 10));
    } else {
      set('cep')(texto.slice(0, 14));
    }
  };

  const formatMesAno = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    let f = digits;
    if (digits.length > 2) f = digits.slice(0, 2) + '/' + digits.slice(2);
    set('membro_desde')(f);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { Alert.alert(t('common.atencao'), t('membros.nomeEObrigatorio')); return; }
    // Criança cadastrada pelo responsável não tem telefone próprio — quem a
    // igreja liga é o pai ou a mãe. Exigir aqui travava a edição de qualquer
    // dependente sem que a tela explicasse por quê.
    if (!form.responsavel_id && !form.telefone.trim()) { Alert.alert(t('common.atencao'), t('membros.telefoneEObrigatorio')); return; }
    setSaving(true);

    // Tudo dentro de um try/catch/finally de propósito (16ª rodada — bug
    // "Salvar não funciona"): antes, se `await supabase...` lançasse uma
    // exceção (rede caiu, erro de JS) em vez de devolver `{ error }`, nada
    // pegava isso — o botão ficava girando pra sempre (`saving` nunca
    // voltava a `false`) e nenhuma mensagem aparecia, exatamente como "não
    // funciona". Agora qualquer falha sempre solta o spinner e mostra o
    // motivo, mesmo que a causa real seja outra (rede, RLS, etc).
    try {
      const payload = {
        ...form,
        data_nascimento: parseDateISO(form.data_nascimento) || null,
        data_batismo: parseDateISO(form.data_batismo) || null,
        membro_desde: parseMesAnoToISO(form.membro_desde) || null,
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

      if (error) {
        Alert.alert(t('membros.erroAoSalvar'), error.message);
      } else {
        onSaved();
        onClose();
      }
    } catch (e: any) {
      Alert.alert(t('membros.erroAoSalvar'), e?.message ?? 'Algo deu errado. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // Traduz a opção pelo mapa; valor fora do mapa (digitado à mão numa versão
  // antiga) aparece como está, em vez de virar uma chave crua na tela.
  const rotularOpcao = (opcao: string) => t(OPCAO_CHAVE[opcao] ?? '', { defaultValue: opcao });

  const SECTIONS = isAdmin
    ? ['membros.passoPessoal', 'membros.contato', 'membros.endereco', 'membros.igreja', 'membros.familia', 'membros.contaDoApp']
    : ['membros.passoPessoal', 'membros.contato', 'membros.endereco', 'membros.igreja', 'membros.familia'];

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

            {/* As abas quebram linha em vez de rolar na horizontal: com rolagem,
                a última ("Família", ou "Conta" pro admin) ficava cortada na
                borda do cartão e parecia defeito — ninguém adivinha que aquilo
                arrasta. Duas fileiras mostram todas de uma vez. */}
            <View style={fm.sectionTabs}>
              {SECTIONS.map((sec, idx) => (
                <TouchableOpacity key={sec} style={[fm.sectionTab, section === idx && fm.sectionTabActive]} onPress={() => setSection(idx)}>
                  <Text allowFontScaling={false} numberOfLines={1} style={[fm.sectionTabText, section === idx && fm.sectionTabTextActive]}>{t(sec)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Sem `flex: 1` aqui de propósito: o `fm.sheet` só tem `maxHeight`
                (não `height`/`flex`), e nesse caso o Yoga não tem uma altura
                resolvida pra distribuir pro filho `flex:1` crescer — ele acaba
                colapsando pra 0 (o conteúdo das abas sumia por causa disso).
                Sem `flex:1`, a ScrollView cresce pelo conteúdo normalmente e
                fica limitada pelo `maxHeight` do `sheet`, exatamente como já
                funciona nos outros modais do Admin (`AdminScreen.tsx`).

                O `flexShrink: 1` é o que faltava: sem ele, uma aba comprida
                (a de Igreja) fazia a ScrollView estourar o `maxHeight` e
                empurrar cabeçalho e abas pra fora da tela — em vez de rolar
                por dentro. Com ele, a ScrollView encolhe até caber e o
                conteúdo passa a rolar, mantendo o topo sempre visível. */}
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {section === 0 && (
                <View style={fm.sectionContent}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}><Field label={t('membros.nome')} value={form.nome} onChangeText={set('nome')} placeholder={t('membros.nome2')} /></View>
                    <View style={{ flex: 1.5 }}><Field label={t('membros.sobrenome')} value={form.sobrenome} onChangeText={set('sobrenome')} placeholder={t('membros.sobrenome')} /></View>
                  </View>
                  <Field label={t('membros.dataDeNascimento')} value={form.data_nascimento} onChangeText={txt => formatDate(txt, 'data_nascimento')} placeholder={t('membros.ddMmAaaa')} keyboardType="numeric" maxLength={10} />
                  <SelectPill label={t('membros.sexo')} options={SEXO_OPCOES.map(o => o.valor)}
                    value={form.sexo}
                    rotulo={(v) => t(SEXO_OPCOES.find(o => o.valor === v)?.chave ?? '', { defaultValue: v })}
                    onChange={set('sexo')} />
                  <Field label={t('membros.nacionalidade')} value={form.nacionalidade} onChangeText={set('nacionalidade')} placeholder={t('membros.exBrasileira')} />
                  <SelectPill label={t('membros.estadoCivil')} options={ESTADO_CIVIL} value={form.estado_civil} onChange={set('estado_civil')} rotulo={rotularOpcao} />
                  <Field label={t('membros.profissao')} value={form.profissao} onChangeText={set('profissao')} placeholder={t('membros.exProfessor')} />
                  <Field label={t('membros.talentosHobbies')} value={form.talentos_hobbies} onChangeText={set('talentos_hobbies')} placeholder={t('membros.exViolaoCulinariaFutebol')} />
                </View>
              )}
              {section === 1 && (
                <View style={fm.sectionContent}>
                  <TelefoneField label={t('membros.telefoneWhatsapp')} value={form.telefone} onChange={set('telefone')} paisPadrao={paisPadraoDdi(form.pais)} />
                  <Field label={t('membros.eMail')} value={form.email} onChangeText={set('email')} placeholder="email@exemplo.com" keyboardType="email-address" />
                  <Field label={t('membros.instagram')} value={form.instagram} onChangeText={set('instagram')} placeholder="@usuario" autoCapitalize="none" />
                </View>
              )}
              {section === 2 && (
                <View style={fm.sectionContent}>
                  {/* País primeiro de propósito — é ele que decide o formato
                      de Estado e CEP/Postcode logo abaixo. Fica em linha
                      cheia (não dividindo espaço com outro campo) porque a
                      lista de busca que abre embaixo precisa da largura
                      inteira pra ficar legível. */}
                  <PaisEnderecoField label={t('membros.pais')} value={form.pais} onChange={set('pais')} />
                  <Field label={t('membros.enderecoRuaENumero')} value={form.endereco} onChangeText={set('endereco')} placeholder={t('membros.ex45AbbeySquare')} />
                  <Field label={t('membros.complemento')} value={form.complemento} onChangeText={set('complemento')} placeholder={t('membros.exApto3bProximoAo')} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 2 }}><Field label={t('membros.cidade')} value={form.cidade} onChangeText={set('cidade')} placeholder={t('membros.cidade')} /></View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label={cepBrasil ? t('membros.estado') : t('membros.estadoRegiao')}
                        value={form.estado}
                        onChangeText={v => set('estado')(cepBrasil ? v.toUpperCase().slice(0, 2) : v.slice(0, 40))}
                        placeholder={cepBrasil ? 'SP' : 'Ex: Berkshire'}
                        maxLength={cepBrasil ? 2 : 40}
                      />
                    </View>
                  </View>
                  <Field
                    label={cepBrasil ? 'CEP' : cepReinoUnido ? 'Postcode' : t('membros.codigoPostal')}
                    value={form.cep}
                    onChangeText={formatCep}
                    placeholder={cepBrasil ? '00000-000' : cepReinoUnido ? 'RG1 3BE' : t('membros.codigoPostal')}
                    keyboardType={cepBrasil ? 'numeric' : 'default'}
                    maxLength={cepBrasil ? 9 : 14}
                  />
                </View>
              )}
              {section === 4 && (
                <View style={fm.sectionContent}>
                  <Text style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 18 }}>
                    Vincule este membro a outros já cadastrados. O vínculo de cônjuge é automático nos dois sentidos.
                  </Text>
                  <FamiliaPicker label={t('membros.conjuge')} value={form.conjuge_id} onChange={set('conjuge_id')} membros={membros} excludeId={membro?.id} />
                  <FamiliaPicker label={t('membros.pai')} value={form.pai_id} onChange={set('pai_id')} membros={membros} excludeId={membro?.id} />
                  <FamiliaPicker label={t('membros.mae')} value={form.mae_id} onChange={set('mae_id')} membros={membros} excludeId={membro?.id} />
                </View>
              )}
              {section === 5 && isAdmin && <ContaSection membro={membro} profileId={form.profile_id} onProfileIdChange={set('profile_id')} />}
              {section === 3 && (
                <View style={fm.sectionContent}>
                  <View style={fm.toggleRow}>
                    <View>
                      <Text style={fm.fieldLabel}>{t('membros.batizadoA')}</Text>
                      <Text style={[fm.toggleStatus, { color: form.batizado ? C.success : C.textMuted }]}>
                        {form.batizado ? t('membros.simNasAguas') : t('membros.aindaNao')}
                      </Text>
                    </View>
                    <TouchableOpacity style={[fm.toggleBtn, form.batizado && fm.toggleBtnActive]} onPress={() => set('batizado')(!form.batizado)}>
                      <Ionicons name={form.batizado ? 'water' : 'water-outline'} size={20} color={form.batizado ? '#fff' : C.textMuted} />
                    </TouchableOpacity>
                  </View>
                  {form.batizado && (
                    <Field label={t('membros.dataDoBatismo')} value={form.data_batismo} onChangeText={txt => formatDate(txt, 'data_batismo')} placeholder={t('membros.ddMmAaaa')} keyboardType="numeric" maxLength={10} />
                  )}
                  {!form.batizado && (
                    <View style={fm.toggleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={fm.fieldLabel}>{t('membros.desejaSeBatizar')}</Text>
                        <Text style={[fm.toggleStatus, { color: form.deseja_batizar ? C.success : C.textMuted }]}>
                          {form.deseja_batizar ? 'Sim' : 'Não'}
                        </Text>
                      </View>
                      <TouchableOpacity style={[fm.toggleBtn, form.deseja_batizar && fm.toggleBtnActive]} onPress={() => set('deseja_batizar')(!form.deseja_batizar)}>
                        <Ionicons name={form.deseja_batizar ? 'heart' : 'heart-outline'} size={20} color={form.deseja_batizar ? '#fff' : C.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}
                  <Field label={t('membros.chegouNaPenielEmMes')} value={form.membro_desde} onChangeText={formatMesAno} placeholder={t('membros.mmAaaa')} keyboardType="numeric" maxLength={7} />

                  <View style={fm.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={fm.fieldLabel}>{t('membros.pertenceuAOutraIgrejaAntes')}</Text>
                      <Text style={[fm.toggleStatus, { color: form.igreja_anterior ? C.success : C.textMuted }]}>
                        {form.igreja_anterior ? 'Sim' : 'Não'}
                      </Text>
                    </View>
                    <TouchableOpacity style={[fm.toggleBtn, form.igreja_anterior && fm.toggleBtnActive]} onPress={() => set('igreja_anterior')(!form.igreja_anterior)}>
                      <Ionicons name={form.igreja_anterior ? 'business' : 'business-outline'} size={20} color={form.igreja_anterior ? '#fff' : C.textMuted} />
                    </TouchableOpacity>
                  </View>
                  {form.igreja_anterior && (
                    <Field label={t('membros.qualIgreja')} value={form.igreja_anterior_nome} onChangeText={set('igreja_anterior_nome')} placeholder={t('membros.nomeDaIgreja')} />
                  )}

                  <View style={fm.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={fm.fieldLabel}>{t('membros.participouOuParticipaDeAlgum')}</Text>
                      <Text style={[fm.toggleStatus, { color: form.ministerio_anterior ? C.success : C.textMuted }]}>
                        {form.ministerio_anterior ? 'Sim' : 'Não'}
                      </Text>
                    </View>
                    <TouchableOpacity style={[fm.toggleBtn, form.ministerio_anterior && fm.toggleBtnActive]} onPress={() => set('ministerio_anterior')(!form.ministerio_anterior)}>
                      <Ionicons name={form.ministerio_anterior ? 'people' : 'people-outline'} size={20} color={form.ministerio_anterior ? '#fff' : C.textMuted} />
                    </TouchableOpacity>
                  </View>
                  {form.ministerio_anterior && (
                    <Field label={t('membros.qualMinisterio')} value={form.ministerio_anterior_qual} onChangeText={set('ministerio_anterior_qual')} placeholder={t('membros.exLouvorInfantilIntercessao')} />
                  )}

                  <SelectPill label={t('membros.ministerioEmPenielAtual')} options={MINISTERIOS} value={form.ministerio} onChange={set('ministerio')} rotulo={rotularOpcao} />
                  <SelectPill label={t('membros.funcao')} options={FUNCOES} value={form.funcao} onChange={set('funcao')} rotulo={rotularOpcao} />

                  <View style={fm.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={fm.fieldLabel}>{t('membros.desejaTrabalharEmAlgumaArea')}</Text>
                      <Text style={[fm.toggleStatus, { color: form.deseja_servir ? C.success : C.textMuted }]}>
                        {form.deseja_servir ? 'Sim' : 'Não'}
                      </Text>
                    </View>
                    <TouchableOpacity style={[fm.toggleBtn, form.deseja_servir && fm.toggleBtnActive]} onPress={() => set('deseja_servir')(!form.deseja_servir)}>
                      <Ionicons name={form.deseja_servir ? 'hand-right' : 'hand-right-outline'} size={20} color={form.deseja_servir ? '#fff' : C.textMuted} />
                    </TouchableOpacity>
                  </View>
                  {form.deseja_servir && (
                    <Field label={t('membros.qualArea')} value={form.deseja_servir_area} onChangeText={set('deseja_servir_area')} placeholder={t('membros.exLouvorRecepcaoMidia')} />
                  )}

                  <View style={fm.fieldWrap}>
                    <Text style={fm.fieldLabel}>{t('membros.status')}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      {(['visitante', 'membro', 'lider'] as Membro['status'][]).map(s => (
                        <TouchableOpacity key={s} style={[fm.pill, form.status === s && { backgroundColor: statusColor(s) + '22', borderColor: statusColor(s) }]} onPress={() => set('status')(s)}>
                          <Text style={[fm.pillText, form.status === s && { color: statusColor(s), fontWeight: '700' }]}>{t(statusChave(s))}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {/* Escrito pela própria pessoa no cadastro dela — fica antes
                      das observações, que são notas internas da liderança. */}
                  <Field label={t('membros.oQueAPessoaQuis')} value={form.compartilhar_mais} onChangeText={set('compartilhar_mais')} placeholder={t('membros.preenchidoPeloProprioMembroNo')} multiline />
                  <Field label={t('membros.observacoes')} value={form.observacoes} onChangeText={set('observacoes')} placeholder={t('membros.notasInternas')} />
                  <Field label={t('membros.alergias')} value={form.alergias} onChangeText={set('alergias')} placeholder={t('membros.alergiasPlaceholder')} multiline />
                  <Field label={t('membros.necessidadesEspeciais')} value={form.necessidades_especiais} onChangeText={set('necessidades_especiais')} placeholder={t('membros.necessidadesPlaceholder')} multiline />
                  <Field label={t('membros.infoResponsavel')} value={form.info_responsavel} onChangeText={set('info_responsavel')} placeholder={t('membros.infoResponsavelPlaceholder')} multiline />
                </View>
              )}
            </ScrollView>

            <View style={fm.footer}>
              {section > 0 && (
                <TouchableOpacity style={fm.prevBtn} onPress={() => setSection(s => s - 1)}>
                  <Ionicons name="arrow-back" size={16} color={C.primary} />
                  <Text style={fm.prevBtnText}>{t('membros.anterior')}</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              {section < SECTIONS.length - 1 ? (
                <TouchableOpacity style={fm.nextBtn} onPress={() => setSection(s => s + 1)}>
                  <Text style={fm.nextBtnText}>{t('membros.proximo')}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={fm.saveBtn} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                    <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={fm.saveBtnText}>{t('common.salvar')}</Text></>
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
  sectionTabs: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 6, marginBottom: 4 },
  sectionTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.surfaceAlt, alignItems: 'center' },
  sectionTabActive: { backgroundColor: C.primary },
  sectionTabText: { fontSize: 12, fontWeight: '600', color: C.textMuted },
  sectionTabTextActive: { color: '#fff' },
  sectionContent: { padding: 16, gap: 4 },
  fieldWrap: { marginBottom: 12 },
  fieldLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  fieldInput: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15, color: C.text },
  fieldInputMultilinha: { height: 96, paddingTop: 12, paddingBottom: 12 },
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
  ddiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, height: 46, minWidth: 100 },
  ddiBtnFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, height: 46 },
  ddiBtnText: { fontSize: 14, color: C.text, fontWeight: '600', flexShrink: 1 },
});

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function MembroDetailModal({ membro, membros, onClose, onEdit, onDelete }: {
  membro: Membro | null; membros: Membro[]; onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  if (!membro) return null;
  const nomeDe = (id: string | null) => {
    const m = membros.find(x => x.id === id);
    return m ? `${m.nome} ${m.sobrenome}` : '';
  };
  const sexoChave = SEXO_OPCOES.find(o => o.valor === membro.sexo)?.chave;
  const sexoLabel = sexoChave ? t(sexoChave) : '';
  // Label em cima e valor embaixo (em vez de lado a lado numa coluna de
  // largura fixa) — com uma coluna estreita, rótulos mais longos como
  // "Nacionalidade" ou "Já serviu em ministério" quebravam no meio da
  // palavra ("Nacionalida" / "de"). Empilhado assim não tem largura fixa
  // pra estourar, então nunca quebra de um jeito estranho.
  const Row = ({ icon, label, value }: { icon: string; label: string; value: string }) =>
    value ? (
      <View style={dd.row}>
        <Ionicons name={icon as any} size={16} color={C.textMuted} style={dd.rowIcon} />
        <View style={{ flex: 1 }}>
          <Text style={dd.rowLabel}>{label}</Text>
          <Text style={dd.rowValue}>{value}</Text>
        </View>
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
                    <Text style={[dd.badgeText, { color: statusColor(membro.status) }]}>{t(statusChave(membro.status))}</Text>
                  </View>
                  {membro.batizado && (
                    <View style={[dd.badge, { backgroundColor: C.primary + '15' }]}>
                      <Ionicons name="water-outline" size={11} color={C.primary} />
                      <Text style={[dd.badgeText, { color: C.primary }]}>{t('membros.batizado')}</Text>
                    </View>
                  )}
                  {mesDoNascimento(membro.data_nascimento) === mesAtualEmLondres() && (
                    <View style={[dd.badge, { backgroundColor: C.accent + '20' }]}>
                      <Text style={[dd.badgeText, { color: C.accent }]}>{t('membros.aniversarioEmoji')}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            {/* Alergia vem ANTES de tudo, em vermelho. Quem abre a ficha de
                uma criança minutos antes do lanche não pode depender de rolar
                até o fim da tela para descobrir que ela não pode comer
                amendoim. É a única informação desta ficha em que chegar tarde
                tem consequência física. */}
            {!!membro.alergias && (
              <View style={dd.alertaCard}>
                <Ionicons name="warning" size={18} color={C.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={dd.alertaTitulo}>{t('membros.alergias')}</Text>
                  <Text style={dd.alertaTexto}>{membro.alergias}</Text>
                </View>
              </View>
            )}
            {!!membro.necessidades_especiais && (
              <View style={[dd.alertaCard, { backgroundColor: C.primary + '12', borderColor: C.primary + '55' }]}>
                <Ionicons name="accessibility-outline" size={18} color={C.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[dd.alertaTitulo, { color: C.primary }]}>{t('membros.necessidadesEspeciais')}</Text>
                  <Text style={[dd.alertaTexto, { color: C.text }]}>{membro.necessidades_especiais}</Text>
                </View>
              </View>
            )}

            <Text style={dd.sectionTitle}>{t('membros.dadosPessoais')}</Text>
            <View style={dd.card}>
              <Row icon="calendar-outline" label={t('membros.nascimento')} value={`${formatDateBR(membro.data_nascimento)} ${getAge(membro.data_nascimento) ? '· ' + getAge(membro.data_nascimento) : ''}`} />
              <Row icon="male-female-outline" label={t('membros.sexo')} value={sexoLabel} />
              <Row icon="flag-outline" label={t('membros.nacionalidade')} value={membro.nacionalidade} />
              <Row icon="heart-outline" label={t('membros.estadoCivil')} value={membro.estado_civil} />
              <Row icon="briefcase-outline" label={t('membros.profissao')} value={membro.profissao} />
              <Row icon="color-palette-outline" label={t('membros.talentos')} value={membro.talentos_hobbies} />
            </View>
            <Text style={dd.sectionTitle}>{t('membros.contato')}</Text>
            <View style={dd.card}>
              <Row icon="call-outline" label={t('membros.telefone')} value={membro.telefone} />
              <Row icon="mail-outline" label={t('membros.eMail')} value={membro.email} />
              <Row icon="logo-instagram" label={t('membros.instagram')} value={membro.instagram} />
            </View>
            <Text style={dd.sectionTitle}>{t('membros.endereco')}</Text>
            <View style={dd.card}>
              <Row icon="home-outline" label={t('membros.endereco')} value={membro.endereco} />
              {!!membro.complemento && <Row icon="business-outline" label={t('membros.complemento')} value={membro.complemento} />}
              <Row icon="location-outline" label={t('membros.cidade')} value={`${membro.cidade || ''}${membro.estado ? ' – ' + membro.estado : ''}`.trim()} />
              <Row icon="map-outline" label={t('membros.cep')} value={membro.cep} />
              <Row icon="earth-outline" label={t('membros.pais')} value={membro.pais} />
            </View>
            {(membro.conjuge_id || membro.pai_id || membro.mae_id) && (
              <>
                <Text style={dd.sectionTitle}>{t('membros.familia')}</Text>
                <View style={dd.card}>
                  <Row icon="heart-circle-outline" label={t('membros.conjuge')} value={nomeDe(membro.conjuge_id)} />
                  <Row icon="man-outline" label={t('membros.pai')} value={nomeDe(membro.pai_id)} />
                  <Row icon="woman-outline" label={t('membros.mae')} value={nomeDe(membro.mae_id)} />
                </View>
              </>
            )}
            <Text style={dd.sectionTitle}>{t('membros.igreja')}</Text>
            <View style={dd.card}>
              <Row icon="water-outline" label={t('membros.batismo')} value={membro.batizado ? (membro.data_batismo ? `${t('membros.sim')} · ${formatDateBR(membro.data_batismo)}` : t('membros.sim')) : (membro.deseja_batizar ? t('membros.naoDesejaSeBatizar') : t('membros.nao'))} />
              <Row icon="calendar-outline" label={t('membros.chegouNaPeniel')} value={formatMesAnoFromISO(membro.membro_desde)} />
              <Row icon="business-outline" label={t('membros.outraIgrejaAntes')} value={membro.igreja_anterior ? `Sim · ${membro.igreja_anterior_nome || '—'}` : 'Não'} />
              <Row icon="people-outline" label={t('membros.jaServiuEmMinisterio')} value={membro.ministerio_anterior ? `Sim · ${membro.ministerio_anterior_qual || '—'}` : 'Não'} />
              <Row icon="hand-right-outline" label={t('membros.querServir')} value={membro.deseja_servir ? `Sim · ${membro.deseja_servir_area || '—'}` : 'Não'} />
              <Row icon="people-circle-outline" label={t('membros.ministerioEmPeniel')} value={membro.ministerio} />
              <Row icon="star-outline" label={t('membros.funcao')} value={membro.funcao} />
              {!!membro.compartilhar_mais && <Row icon="chatbubble-ellipses-outline" label={t('membros.compartilhou')} value={membro.compartilhar_mais} />}
              {!!membro.observacoes && <Row icon="document-text-outline" label={t('membros.obs')} value={membro.observacoes} />}
              {!!membro.info_responsavel && <Row icon="information-circle-outline" label={t('membros.infoResponsavel')} value={membro.info_responsavel} />}
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
  alertaCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: C.danger + '12', borderWidth: 1, borderColor: C.danger + '55',
    borderRadius: 12, padding: 12, marginTop: 14,
  },
  alertaTitulo: { fontSize: 10.5, fontWeight: '800', color: C.danger, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  alertaTexto: { fontSize: 14, color: C.text, lineHeight: 19.5 },
  card: { backgroundColor: C.surfaceAlt, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  rowIcon: { marginTop: 2 },
  rowLabel: { fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 },
  rowValue: { fontSize: 14, color: C.text, fontWeight: '600', lineHeight: 19 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MembrosScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<Membro['status'] | 'todos'>('todos');
  // null = sem filtro de aniversário. Era um booleano "aniversariantes deste
  // mês"; virou o número do mês para responder "quem faz aniversário em
  // outubro?" sem esperar outubro chegar.
  const [filterMes, setFilterMes] = useState<number | null>(null);
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
    if (role === 'admin') fetchMembros();
  }, [role, fetchMembros]);

  const handleDelete = (id: string) => {
    // `members.responsavel_id` é ON DELETE CASCADE (migração 20260917220000):
    // apagar o cadastro do pai apaga o das crianças dele, e não há lixeira.
    // Um admin que não souber disso perde os dados da sala infantil inteira
    // ao arrumar o diretório.
    const dependentes = membros.filter(m => m.responsavel_id === id);
    const texto = dependentes.length > 0
      ? `${t('membros.desejaRemoverEsteMembro')}\n\n${t('membros.removerLevaDependentes', { count: dependentes.length, nomes: dependentes.map(d => d.nome).join(', ') })}`
      : t('membros.desejaRemoverEsteMembro');

    Alert.alert(t('membros.removerMembro'), texto, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          await apagarLinha('members', id);
          setDetailMembro(null);
          fetchMembros();
        },
      },
    ]);
  };

  // Crianças ficam fora da lista principal: são dependentes cadastrados pelos
  // pais, não pessoas que a liderança gerencia uma a uma, e numa igreja com
  // muitas famílias elas dobrariam o diretório. A pílula "Crianças" traz elas
  // de volta, e o filtro de aniversário sempre mostra todo mundo — que é o
  // ponto de ter a criança no cadastro.
  const adultos = membros.filter(m => !m.responsavel_id);
  const mesAtual = mesAtualEmLondres();

  const filtered = membros.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${m.nome} ${m.sobrenome}`.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'todos' || m.status === filterStatus;
    const matchMes = filterMes === null || mesDoNascimento(m.data_nascimento) === filterMes;
    // Sem filtro explícito de criança nem de aniversário, o dependente não
    // aparece. Buscar pelo nome dele funciona sempre.
    const ehDependente = !!m.responsavel_id;
    const mostraDependente = filterStatus === 'crianca' || filterMes !== null || !!q;
    return matchSearch && matchStatus && matchMes && (!ehDependente || mostraDependente);
  }).sort((a, b) => {
    // Com filtro de mês, a ordem útil é a do calendário — a lista vira a
    // agenda de quem parabenizar, na ordem em que os dias chegam.
    if (filterMes === null) return 0;
    return (diaDoNascimento(a.data_nascimento) ?? 99) - (diaDoNascimento(b.data_nascimento) ?? 99);
  });

  const birthdayCount = membros.filter(m => mesDoNascimento(m.data_nascimento) === mesAtual).length;
  const criancasCount = membros.length - adultos.length;

  if (loadingRole) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Diretório com dados pessoais: só admin. Líder de grupo monta o grupo dele
  // por uma busca reduzida (só nome) dentro da aba Grupos.
  if (role !== 'admin') {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={C.primary} />
        <View style={s.header}>
          <Text style={s.headerTitle}>{t('membros.membros')}</Text>
        </View>
        <View style={s.empty}>
          <Ionicons name="lock-closed-outline" size={48} color={C.textDim} />
          <Text style={[s.emptyText, { fontWeight: '700', fontSize: 16, marginTop: 12 }]}>{t('membros.acessoRestrito')}</Text>
          <Text style={s.emptyText}>Esta lista com os dados pessoais dos membros é exclusiva para os administradores da igreja.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>{t('membros.membros')}</Text>
          <Text style={s.headerSub}>
            {t('membros.cadastradosContador', { count: adultos.length })}
            {criancasCount > 0 ? ` · ${t('membros.criancasContador', { count: criancasCount })}` : ''}
          </Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => { setEditingMembro(null); setFormVisible(true); }}>
          <Ionicons name="person-add-outline" size={18} color={C.primary} />
          <Text style={s.addBtnText}>{t('membros.novo')}</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          // Os três primeiros contam ADULTOS: criança entra como 'crianca' e
          // não deve inflar "quantos membros a igreja tem".
          { label: 'Membros', value: adultos.filter(m => m.status === 'membro').length, color: C.success },
          { label: t('membros.lideres'), value: adultos.filter(m => m.status === 'lider').length, color: C.accent },
          { label: t('membros.visitantes'), value: adultos.filter(m => m.status === 'visitante').length, color: C.textMuted },
          { label: t('membros.anivMes'), value: birthdayCount, color: '#7C4DFF', aniversario: true },
        ].map(stat => (
          <TouchableOpacity key={stat.label} style={s.statCard}
            onPress={() => stat.aniversario && setFilterMes(m => (m === null ? mesAtual : null))}>
            <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={16} color={C.textMuted} />
          <TextInput style={s.searchInput} placeholder={t('membros.buscarPorNomeOuE')} placeholderTextColor={C.textDim} value={search} onChangeText={setSearch} />
          {!!search && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color={C.textMuted} /></TouchableOpacity>}
        </View>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRowScroll} contentContainerStyle={s.filterRow}>
        {(['todos', 'membro', 'lider', 'visitante', 'crianca'] as const).map(f => (
          <TouchableOpacity key={f} style={[s.filterPill, filterStatus === f && s.filterPillActive]} onPress={() => setFilterStatus(f)}>
            <Text allowFontScaling={false} numberOfLines={1} style={[s.filterPillText, filterStatus === f && s.filterPillTextActive]}>{f === 'todos' ? t('membros.todos') : t(statusChave(f))}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[s.filterPill, filterMes !== null && { backgroundColor: C.accent + '18', borderColor: C.accent }]}
          onPress={() => setFilterMes(m => (m === null ? mesAtual : null))}
        >
          <Text allowFontScaling={false} numberOfLines={1} style={[s.filterPillText, filterMes !== null && { color: C.accent, fontWeight: '700' }]}>{t('membros.mesEmoji')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* A faixa dos doze meses só aparece com o filtro ligado: ocupa uma
          linha inteira e, desligada, seria ruído em cima de uma tela que já
          tem busca, estatísticas e filtros. */}
      {filterMes !== null && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRowScroll} contentContainerStyle={s.filterRow}>
          {MESES_CHAVE.map((chave, i) => {
            const numero = i + 1;
            const ativo = numero === filterMes;
            return (
              <TouchableOpacity
                key={chave}
                style={[s.filterPill, ativo && { backgroundColor: C.accent + '18', borderColor: C.accent }]}
                onPress={() => setFilterMes(numero)}
              >
                <Text allowFontScaling={false} numberOfLines={1} style={[s.filterPillText, ativo && { color: C.accent, fontWeight: '700' }]}>{t(chave)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* List */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={{ color: C.textMuted, marginTop: 12 }}>{t('membros.carregandoMembros')}</Text>
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
                    {mesDoNascimento(m.data_nascimento) === (filterMes ?? mesAtual) && <Text style={{ fontSize: 14 }}>🎂</Text>}
                  </View>
                  <Text style={s.memberSub}>{m.ministerio ? `${m.ministerio} · ` : ''}{m.telefone}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[s.statusBadge, { backgroundColor: statusColor(m.status) + '18' }]}>
                    <Text style={[s.statusBadgeText, { color: statusColor(m.status) }]}>{t(statusChave(m.status))}</Text>
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
        isAdmin={role === 'admin'}
        onClose={() => { setFormVisible(false); setEditingMembro(null); }}
        onSaved={fetchMembros}
      />
      <MembroDetailModal
        membro={detailMembro}
        membros={membros}
        onClose={() => setDetailMembro(null)}
        onEdit={() => {
          // Não abrir o modal de edição no mesmo instante em que o de
          // detalhes fecha: dois <Modal> nativos se sobrepondo na mesma
          // renderização deixa o modal novo visível mas sem responder a
          // toque no iOS (é exatamente o bug "abre errado e os botões das
          // abas não funcionam" — a UIKit ainda está desmontando o modal
          // anterior quando o novo tenta se apresentar). Fechar primeiro,
          // esperar a animação de saída terminar, só então abrir o de
          // edição, resolve nos dois sistemas.
          const membroParaEditar = detailMembro;
          setDetailMembro(null);
          setTimeout(() => {
            setEditingMembro(membroParaEditar);
            setFormVisible(true);
          }, 350);
        }}
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
  // Altura fixa + alignItems 'center' de propósito: sem isso, esse ScrollView
  // horizontal às vezes calculava a própria altura errado (menor que uma
  // linha de texto), cortando o topo/base das pílulas pela metade.
  //
  // Aumentar de 52 pra 60 (tentativa anterior) não resolveu nada — o texto
  // continuou 100% invisível mesmo com mais folga, então não era só corte
  // de sub-pixel. Aumentado mais uma vez (68) e trocado `height` fixo por
  // `minHeight`, que nunca força um corte mesmo que o conteúdo real acabe
  // um pouco maior do que o previsto — só ajuda, não deveria piorar nada.
  filterRowScroll: { minHeight: 68, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterPill: { minHeight: 34, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  filterPillActive: { backgroundColor: C.primary + '15', borderColor: C.primary },
  // Aumentar a folga (16ª rodada) não resolveu — o texto continuou 100%
  // invisível, não só cortado, então não era só espaço vertical. Removido
  // o `lineHeight` fixo (deixa o SO calcular pela métrica real da fonte,
  // em vez de forçar um valor que pode não bater), cor trocada pra um tom
  // escuro fixo (não depender de `C.textMuted` aqui, só por precaução) e
  // `allowFontScaling={false}` no `<Text>` pra não depender do tamanho de
  // fonte do sistema (Textos Grandes/Dynamic Type podiam estar estourando
  // a caixa da pílula e ficando cortado por inteiro).
  filterPillText: { fontSize: 13, color: '#374151', fontWeight: '600' },
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
