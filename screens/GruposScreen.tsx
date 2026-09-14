import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  StatusBar, ActivityIndicator, RefreshControl, Linking, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { apagarLinha } from '../lib/db';
import { useCampoTraduzido } from '../lib/useTraducao';
import { useAuth } from '../lib/useAuth';
import GrupoAdminModal from '../components/GrupoAdminModal';
import GrupoChatModal from '../components/GrupoChatModal';
import ContatoModal from '../components/ContatoModal';
import { useTheme } from '../lib/theme';

// ─── Palette ──────────────────────────────────────────────────────────────────
// As cores de identidade de cada grupo (mulheres/homens/jovens) não mudam
// com o tema — só o fundo/superfície/texto neutros trocam.
function paleta(isDark: boolean) {
  return isDark ? {
    bg: '#0E0B22', surface: '#1C1940', surfaceAlt: '#241F4D',
    border: '#332D5C', primary: '#100D28', text: '#F1EFFA',
    textMuted: '#A6A0C7', textDim: '#726A99',
    danger: '#FF6B6B', success: '#4ADE80',
    mulheres: '#D63A8A', mulheresDim: '#3A1B2C',
    homens: '#3D8FE0', homensDim: '#16273F',
    jovens: '#8F79FF', jovensDim: '#241B4D',
    estudoBiblico: '#2FBF9F', estudoBiblicoDim: '#123B33',
  } : {
    bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
    border: '#E5E0D8', primary: '#1A1740', text: '#1A1A2E',
    textMuted: '#6B7280', textDim: '#9CA3AF',
    danger: '#C0392B', success: '#27AE60',
    mulheres: '#D63A8A', mulheresDim: '#FCE4F3',
    homens: '#1A6FC4', homensDim: '#E3F0FC',
    // Mesmo lilás escuro do card "Peniel Alive" na Home
    jovens: '#4A1AA8', jovensDim: '#EDE4FB',
    estudoBiblico: '#0F8F73', estudoBiblicoDim: '#DFF5EE',
  };
}
type Paleta = ReturnType<typeof paleta>;

type Tab = 'mulheres' | 'homens' | 'jovens' | 'estudo_biblico';

type GrupoEvento = {
  id: string;
  titulo: string;
  descricao: string;
  dataISO: string;
  horario: string;
  local: string;
  tipo: string;
};

type GrupoDevocional = {
  id: string;
  titulo: string;
  texto: string;
  versiculo: string;
  referencia: string;
  dataISO: string;
};

type GrupoShort = {
  id: string;
  titulo: string;
  url: string;
  plataforma: 'youtube' | 'instagram';
};

type GrupoArquivo = {
  id: string;
  titulo: string;
  url: string;
  created_at: string;
};

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:shorts\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  return m ? m[1] : null;
}

// ─── Config dos grupos ────────────────────────────────────────────────────────
function buildGrupos(t: (key: string) => string, C: Paleta) {
  return {
    mulheres: {
      nome: t('grupos.mulheresNome'),
      subtitulo: t('grupos.mulheresSubtitulo'),
      icon: 'flower-outline' as const,
      cor: C.mulheres,
      corDim: C.mulheresDim,
      descricao: t('grupos.mulheresDescricao'),
      mensagemContato: 'Olá! Quero saber mais sobre o Grupo de Mulheres da Peniel Church.',
    },
    homens: {
      nome: t('grupos.homensNome'),
      subtitulo: t('grupos.homensSubtitulo'),
      icon: 'shield-outline' as const,
      cor: C.homens,
      corDim: C.homensDim,
      descricao: t('grupos.homensDescricao'),
      mensagemContato: 'Olá! Quero saber mais sobre o Grupo de Homens da Peniel Church.',
    },
    jovens: {
      nome: t('grupos.jovensNome'),
      subtitulo: t('grupos.jovensSubtitulo'),
      icon: 'flame-outline' as const,
      cor: C.jovens,
      corDim: C.jovensDim,
      descricao: t('grupos.jovensDescricao'),
      mensagemContato: 'Olá! Quero saber mais sobre o Peniel Alive.',
    },
    estudo_biblico: {
      nome: t('grupos.estudoBiblicoNome'),
      subtitulo: t('grupos.estudoBiblicoSubtitulo'),
      icon: 'school-outline' as const,
      cor: C.estudoBiblico,
      corDim: C.estudoBiblicoDim,
      descricao: t('grupos.estudoBiblicoDescricao'),
      mensagemContato: 'Olá! Quero saber mais sobre o Estudo Bíblico da Peniel Church.',
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const LOCALE_POR_IDIOMA: Record<string, string> = { pt: 'pt-BR', en: 'en-GB', es: 'es-ES', fr: 'fr-FR' };

function formatDataEvento(iso: string, lang: string = 'pt'): string {
  const locale = LOCALE_POR_IDIOMA[lang] ?? 'pt-BR';
  const d = new Date(`${iso}T00:00:00`);
  const texto = d.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'short' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
function formatDataDevocional(iso: string, lang: string = 'pt'): string {
  const locale = LOCALE_POR_IDIOMA[lang] ?? 'pt-BR';
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Card de evento do grupo — título e descrição (digitados pelo admin em
// português) traduzidos automaticamente pro idioma do app.
function GrupoEventoCard({ evento, tag, podeEditar, onEditar, onApagar }: {
  evento: GrupoEvento; tag: { bg: string; text: string; label: string };
  podeEditar?: boolean; onEditar?: () => void; onApagar?: () => void;
}) {
  const { i18n } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const s = useMemo(() => buildS(C), [C]);
  const titulo = useCampoTraduzido(evento.titulo, 'grupo_eventos', evento.id, 'titulo');
  const descricao = useCampoTraduzido(evento.descricao, 'grupo_eventos', evento.id, 'descricao');
  const dataLabel = formatDataEvento(evento.dataISO, i18n.language);
  return (
    <View style={s.eventoCard}>
      <View style={s.eventoTop}>
        <Text style={s.eventoTitulo}>{titulo}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[s.eventoTag, { backgroundColor: tag.bg }]}>
            <Text style={[s.eventoTagText, { color: tag.text }]}>{tag.label}</Text>
          </View>
          {/* Só líder do grupo e admin. Um encontro com a data errada não
              tinha conserto nenhum: a lista some sozinha quando a data passa,
              mas um ano digitado errado ficaria ali para sempre. */}
          {podeEditar && (
            <>
              <TouchableOpacity onPress={onEditar} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <Ionicons name="create-outline" size={16} color={C.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onApagar} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <Ionicons name="trash-outline" size={16} color={C.textMuted} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
      <Text style={s.eventoDesc}>{descricao}</Text>
      <View style={s.eventoMeta}>
        <View style={s.eventoMetaItem}>
          <Ionicons name="calendar-outline" size={13} color={C.textMuted} />
          <Text style={s.eventoMetaText}>{dataLabel}</Text>
        </View>
        <View style={s.eventoMetaItem}>
          <Ionicons name="time-outline" size={13} color={C.textMuted} />
          <Text style={s.eventoMetaText}>{evento.horario}</Text>
        </View>
        <View style={s.eventoMetaItem}>
          <Ionicons name="location-outline" size={13} color={C.textMuted} />
          <Text style={s.eventoMetaText}>{evento.local}</Text>
        </View>
      </View>
    </View>
  );
}

// Card de devocional do grupo — título, referência, versículo e texto
// traduzidos automaticamente pro idioma do app.
function GrupoDevocionalCard({ dev, cor, isOpen, onToggle, onApagar }: {
  dev: GrupoDevocional; cor: string; isOpen: boolean; onToggle: () => void;
  onApagar?: () => void;
}) {
  const { i18n } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const s = useMemo(() => buildS(C), [C]);
  const titulo = useCampoTraduzido(dev.titulo, 'devocionais', dev.id, 'titulo');
  const versiculo = useCampoTraduzido(dev.versiculo, 'devocionais', dev.id, 'versiculo');
  const referencia = useCampoTraduzido(dev.referencia, 'devocionais', dev.id, 'referencia');
  const texto = useCampoTraduzido(dev.texto, 'devocionais', dev.id, 'texto');
  const dataLabel = formatDataDevocional(dev.dataISO, i18n.language);
  return (
    <View style={[s.devCard, isOpen && { borderColor: cor }]}>
      <TouchableOpacity style={s.devHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={[s.devIcon, { backgroundColor: cor + '18' }]}>
          <Ionicons name="book" size={16} color={cor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.devTitulo}>{titulo}</Text>
          <Text style={s.devRef}>{referencia} · {dataLabel}</Text>
        </View>
        {onApagar && (
          <TouchableOpacity onPress={onApagar} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={{ marginRight: 6 }}>
            <Ionicons name="trash-outline" size={15} color={C.textMuted} />
          </TouchableOpacity>
        )}
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
      </TouchableOpacity>
      {isOpen && (
        <View style={s.devBody}>
          <View style={[s.versiculoBox, { borderLeftColor: cor }]}>
            <Text style={s.versiculoText}>"{versiculo}"</Text>
            <Text style={[s.versiculoRef, { color: cor }]}>{referencia}</Text>
          </View>
          <Text style={s.reflexaoText}>{texto}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Gestão de Participantes (só líder do grupo ou admin) ────────────────────
type Participante = { id: string; membro_id: string; nome: string; sobrenome: string };
// Sem telefone de propósito: o líder de grupo não tem acesso ao diretório da
// igreja. A busca vem da função `membros_para_grupo` no Supabase, que devolve
// só nome e sobrenome — o suficiente pra montar o grupo, sem entregar a ficha
// de ninguém. A permissão é checada dentro da função, não aqui.
type MembroBusca = { id: string; nome: string; sobrenome: string };

function GerenciarParticipantesModal({ visible, grupo, grupoNome, cor, onClose }: {
  visible: boolean; grupo: Tab; grupoNome: string; cor: string; onClose: () => void;
}) {
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const gm = useMemo(() => buildGm(C), [C]);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<MembroBusca[]>([]);
  const [buscando, setBuscando] = useState(false);

  const fetchParticipantes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('participantes_do_grupo', { p_grupo: grupo });
    setParticipantes(((data ?? []) as any[]).map(row => ({
      id: row.id,
      membro_id: row.membro_id,
      nome: row.nome ?? '',
      sobrenome: row.sobrenome ?? '',
    })));
    setLoading(false);
  }, [grupo]);

  useEffect(() => {
    if (visible) { fetchParticipantes(); setQuery(''); setResultados([]); }
  }, [visible, fetchParticipantes]);

  useEffect(() => {
    if (query.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    const t = setTimeout(() => {
      // A função já filtra quem está no grupo e já limita o resultado.
      supabase.rpc('membros_para_grupo', { p_grupo: grupo, p_busca: query.trim() })
        .then(({ data }) => {
          setResultados((data ?? []) as MembroBusca[]);
          setBuscando(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query, grupo, participantes.length]);

  const adicionar = async (membro: MembroBusca) => {
    const { error } = await supabase.from('grupo_membros').insert({ membro_id: membro.id, grupo });
    if (error) { Alert.alert('Erro', error.message); return; }
    setQuery(''); setResultados([]);
    fetchParticipantes();
  };

  const remover = (participante: Participante) => {
    Alert.alert('Remover do grupo', `Remover ${participante.nome} ${participante.sobrenome} do grupo ${grupoNome}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await apagarLinha('grupo_membros', participante.id);
        fetchParticipantes();
      }},
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={gm.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '85%' }}>
          <View style={gm.sheet}>
            <View style={gm.header}>
              <Text style={gm.title}>Participantes — {grupoNome}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={gm.searchRow}>
              <Ionicons name="search-outline" size={16} color={C.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={gm.searchInput}
                placeholder="Buscar no diretório pra adicionar..."
                placeholderTextColor={C.textDim}
                value={query}
                onChangeText={setQuery}
              />
              {buscando && <ActivityIndicator size="small" color={cor} />}
            </View>

            {resultados.length > 0 && (
              <View style={gm.resultsBox}>
                {resultados.map(m => (
                  <TouchableOpacity key={m.id} style={gm.resultRow} onPress={() => adicionar(m)}>
                    <View style={{ flex: 1 }}>
                      <Text style={gm.resultNome}>{m.nome} {m.sobrenome}</Text>
                    </View>
                    <Ionicons name="add-circle" size={22} color={cor} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={gm.listLabel}>No grupo ({participantes.length})</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
              {loading ? (
                <ActivityIndicator color={cor} style={{ marginVertical: 20 }} />
              ) : participantes.length === 0 ? (
                <Text style={gm.emptyText}>Ninguém adicionado ainda.</Text>
              ) : (
                participantes.map(p => (
                  <View key={p.id} style={gm.participanteRow}>
                    <Text style={gm.participanteNome}>{p.nome} {p.sobrenome}</Text>
                    <TouchableOpacity onPress={() => remover(p)}>
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

// ─── Gestão de Líderes (só admin) ────────────────────────────────────────────
// Diferente de Participantes (escolhidos do diretório `members`, sem precisar
// de conta), líder precisa ter conta no app — por isso busca em `profiles`,
// não em `members`. RLS de `group_leaders` já restringe a admin.
type Lider = { id: string; profile_id: string; nome: string };
type ProfileBusca = { id: string; full_name: string };

function GerenciarLideresModal({ visible, grupo, grupoNome, cor, onClose }: {
  visible: boolean; grupo: Tab; grupoNome: string; cor: string; onClose: () => void;
}) {
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const gm = useMemo(() => buildGm(C), [C]);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<ProfileBusca[]>([]);
  const [buscando, setBuscando] = useState(false);

  const fetchLideres = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('group_leaders')
      .select('id, profile_id, profiles(full_name)')
      .eq('grupo', grupo);
    setLideres(((data ?? []) as any[]).map(row => ({
      id: row.id,
      profile_id: row.profile_id,
      nome: row.profiles?.full_name ?? '—',
    })).sort((a, b) => a.nome.localeCompare(b.nome)));
    setLoading(false);
  }, [grupo]);

  useEffect(() => {
    if (visible) { fetchLideres(); setQuery(''); setResultados([]); }
  }, [visible, fetchLideres]);

  useEffect(() => {
    if (query.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    const t = setTimeout(() => {
      supabase.from('profiles').select('id, full_name')
        .ilike('full_name', `%${query.trim()}%`)
        .limit(10)
        .then(({ data }) => {
          const jaLideres = new Set(lideres.map(l => l.profile_id));
          setResultados(((data ?? []) as ProfileBusca[]).filter(p => !jaLideres.has(p.id)));
          setBuscando(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query, lideres]);

  const adicionar = async (perfil: ProfileBusca) => {
    const { error } = await supabase.from('group_leaders').insert({ profile_id: perfil.id, grupo });
    if (error) { Alert.alert('Erro', error.message); return; }
    setQuery(''); setResultados([]);
    fetchLideres();
  };

  const remover = (lider: Lider) => {
    Alert.alert('Remover líder', `Remover ${lider.nome} da liderança do grupo ${grupoNome}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await apagarLinha('group_leaders', lider.id);
        fetchLideres();
      }},
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={gm.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '85%' }}>
          <View style={gm.sheet}>
            <View style={gm.header}>
              <Text style={gm.title}>Líderes — {grupoNome}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={gm.searchRow}>
              <Ionicons name="search-outline" size={16} color={C.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={gm.searchInput}
                placeholder="Buscar por nome (precisa ter conta no app)..."
                placeholderTextColor={C.textDim}
                value={query}
                onChangeText={setQuery}
              />
              {buscando && <ActivityIndicator size="small" color={cor} />}
            </View>

            {resultados.length > 0 && (
              <View style={gm.resultsBox}>
                {resultados.map(p => (
                  <TouchableOpacity key={p.id} style={gm.resultRow} onPress={() => adicionar(p)}>
                    <Text style={gm.resultNome}>{p.full_name}</Text>
                    <Ionicons name="add-circle" size={22} color={cor} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={gm.listLabel}>Líderes atuais ({lideres.length})</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 280 }}>
              {loading ? (
                <ActivityIndicator color={cor} style={{ marginVertical: 20 }} />
              ) : lideres.length === 0 ? (
                <Text style={gm.emptyText}>Nenhum líder designado ainda.</Text>
              ) : (
                lideres.map(l => (
                  <View key={l.id} style={gm.participanteRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="ribbon-outline" size={16} color={cor} />
                      <Text style={gm.participanteNome}>{l.nome}</Text>
                    </View>
                    <TouchableOpacity onPress={() => remover(l)}>
                      <Ionicons name="trash-outline" size={18} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
              <View style={{ height: 10 }} />
            </ScrollView>
            <Text style={gm.hint}>A pessoa precisa já ter uma conta no app (ter feito login pelo menos uma vez) pra aparecer na busca.</Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function buildGm(C: Paleta) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '800', color: C.text, flex: 1, marginRight: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, height: 46, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 15, color: C.text },
  resultsBox: { marginTop: 8, marginBottom: 8, borderWidth: 1, borderColor: C.border, borderRadius: 10, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surfaceAlt },
  resultNome: { fontSize: 14, fontWeight: '600', color: C.text },
  resultMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  listLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingVertical: 20 },
  participanteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  participanteNome: { fontSize: 14, color: C.text },
  hint: { fontSize: 11, color: C.textDim, textAlign: 'center', marginTop: 10, lineHeight: 16 },
}); }

// ─── Componente principal ─────────────────────────────────────────────────────
export default function GruposScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const s = useMemo(() => buildS(C), [C]);
  const GRUPOS = buildGrupos(t, C);
  // Permite abrir já numa aba específica (ex: card "Peniel Alive" da Home
  // manda direto pra 'jovens') via navigation.navigate('Grupos', { grupoInicial: 'jovens' }).
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const grupoInicial = route.params?.grupoInicial as Tab | undefined;
  const [activeTab, setActiveTab] = useState<Tab>(grupoInicial ?? 'homens');
  const [expandedDev, setExpandedDev] = useState<string | null>(null);
  const [eventos, setEventos] = useState<GrupoEvento[]>([]);
  const [devocionais, setDevocionais] = useState<GrupoDevocional[]>([]);
  const [shorts, setShorts] = useState<GrupoShort[]>([]);
  const [arquivos, setArquivos] = useState<GrupoArquivo[]>([]);
  const [encontroEditando, setEncontroEditando] = useState<GrupoEvento | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userNome, setUserNome] = useState('');
  const [gruposLiderados, setGruposLiderados] = useState<Tab[]>([]);
  const [meusGrupos, setMeusGrupos] = useState<Tab[]>([]);
  const [permissoesCarregadas, setPermissoesCarregadas] = useState(false);
  const [participantesModalVisible, setParticipantesModalVisible] = useState(false);
  const [adminModalVisible, setAdminModalVisible] = useState(false);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [lideresModalVisible, setLideresModalVisible] = useState(false);
  const [contatoModalVisible, setContatoModalVisible] = useState(false);

  const grupo = GRUPOS[activeTab];
  const souLiderDesteGrupo = isAdmin || gruposLiderados.includes(activeTab);

  // Uma confirmação só para todo conteúdo de grupo. A RLS já decide quem
  // pode: as policies de `grupo_eventos`, `shorts_videos`, `grupo_arquivos` e
  // `devocionais` liberam o admin e o líder DAQUELE grupo, e mais ninguém —
  // esconder o botão é conveniência, não é a trava.
  const confirmarRemocao = (tabela: string, id: string, titulo: string) => {
    Alert.alert(
      t('grupos.removerConteudoTitulo'),
      t('grupos.removerConteudoMsg', { titulo }),
      [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('common.remover'), style: 'destructive', onPress: async () => {
          if (await apagarLinha(tabela, id)) {
            fetchGrupoData(activeTab, temAcessoConteudo);
          }
        }},
      ],
    );
  };

  // A notificação que já foi para o sininho quando o conteúdo foi publicado
  // NÃO é apagada junto: ela é histórico do que aconteceu, e o push já saiu
  // para os celulares de qualquer jeito. Some sozinha do mural com o tempo.
  const temAcessoConteudo = souLiderDesteGrupo || meusGrupos.includes(activeTab);

  // Se a tela já estava montada (usuário já estava na aba Membros) e a Home
  // manda um novo grupoInicial, troca a aba também — não só na primeira montagem.
  useEffect(() => {
    if (grupoInicial) setActiveTab(grupoInicial);
  }, [grupoInicial]);

  // Toque na notificação de mensagem do chat abre o chat daquele grupo já
  // aberto (ver lib/destinoNotificacao.ts). Espera `user` porque o
  // GrupoChatModal só é montado com sessão; e consome o parâmetro, senão
  // trocar de aba e voltar reabriria o chat sozinho.
  useEffect(() => {
    if (!route.params?.abrirChat || !user) return;
    navigation.setParams({ abrirChat: undefined });
    if (grupoInicial) setActiveTab(grupoInicial);
    setChatModalVisible(true);
  }, [route.params?.abrirChat, user]);

  // Verifica se o usuário é admin, líder de algum grupo, ou membro de algum
  // grupo (adicionado pelo líder) — decide o que mostrar em cada aba.
  useEffect(() => {
    if (!user) {
      setIsAdmin(false); setGruposLiderados([]); setMeusGrupos([]); setUserNome('');
      setPermissoesCarregadas(true);
      return;
    }
    setPermissoesCarregadas(false);
    Promise.all([
      supabase.from('profiles').select('role, full_name').eq('id', user.id).single(),
      supabase.from('group_leaders').select('grupo').eq('profile_id', user.id),
      supabase.rpc('meus_grupos'),
    ]).then(([{ data: perfil }, { data: liderados }, { data: grupos }]) => {
      setIsAdmin(perfil?.role === 'admin');
      setUserNome(perfil?.full_name ?? 'Membro');
      setGruposLiderados(((liderados ?? []) as { grupo: Tab }[]).map(r => r.grupo));
      setMeusGrupos(((grupos ?? []) as Tab[]));
      setPermissoesCarregadas(true);
    });
  }, [user]);

  const fetchGrupoData = useCallback(async (tab: Tab, temAcesso: boolean, isRefresh = false) => {
    if (!temAcesso) { setEventos([]); setDevocionais([]); setShorts([]); setArquivos([]); setLoading(false); setRefreshing(false); return; }
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const hoje = new Date().toISOString().slice(0, 10);
    const [{ data: eventosData }, { data: devData }, { data: shortsData }, { data: arquivosData }] = await Promise.all([
      supabase.from('grupo_eventos').select('*').eq('grupo', tab).gte('data', hoje).order('data', { ascending: true }),
      // Só o mais recente — vira o "banner" no topo da seção, igual à Home.
      // A lista completa fica na tela Devocionais (botão "Ver todos").
      supabase.from('devocionais').select('*').eq('grupo', tab).order('data', { ascending: false }).limit(1),
      supabase.from('shorts_videos').select('*').eq('grupo', tab).order('created_at', { ascending: false }).limit(12),
      supabase.from('grupo_arquivos').select('*').eq('grupo', tab).order('created_at', { ascending: false }).limit(20),
    ]);

    setEventos((eventosData ?? []).map((e: any) => ({
      id: e.id, titulo: e.titulo, descricao: e.descricao ?? '',
      dataISO: e.data, horario: e.horario, local: e.local, tipo: e.tipo,
    })));
    setDevocionais((devData ?? []).map((d: any) => ({
      id: d.id, titulo: d.titulo, texto: d.texto, versiculo: d.versiculo,
      referencia: d.referencia, dataISO: d.data,
    })));
    setShorts((shortsData ?? []) as GrupoShort[]);
    setArquivos((arquivosData ?? []) as GrupoArquivo[]);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (!permissoesCarregadas) return;
    fetchGrupoData(activeTab, temAcessoConteudo);
  }, [activeTab, temAcessoConteudo, permissoesCarregadas, fetchGrupoData]);

  const abrirContato = () => setContatoModalVisible(true);

  const tipoTag = (tipo: string) => {
    switch (tipo) {
      case 'presencial': return { bg: '#EEEDFE', text: '#534AB7', label: t('grupos.tagPresencial') };
      case 'online':     return { bg: '#E1F5EE', text: '#085041', label: t('grupos.tagOnline')     };
      case 'casa':       return { bg: '#FEF6DC', text: '#633806', label: t('grupos.tagCasa')        };
      default:           return { bg: '#F3F4F6', text: '#6B7280', label: tipo                       };
    }
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'homens',        label: t('grupos.tabHomens'),         icon: 'shield-outline'  },
    { id: 'mulheres',      label: t('grupos.tabMulheres'),       icon: 'flower-outline'  },
    { id: 'jovens',        label: t('grupos.tabAlive'),          icon: 'flame-outline'   },
    { id: 'estudo_biblico', label: t('grupos.tabEstudoBiblico'), icon: 'school-outline'  },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>{t('grupos.titulo')}</Text>
          <Text style={s.headerSub}>Peniel Church</Text>
        </View>
        {/* Ações do grupo. Os três ícones brancos são de gestão e só aparecem
            pra quem pode usá-los: Participantes e Admin do grupo pro líder
            DAQUELE grupo, Líderes só pro admin da igreja — só ele nomeia ou
            remove um líder, nem o próprio líder pode. O Chat ficou no lugar
            onde estava o botão de Contato, maior e na cor do grupo: é a ação
            que todo mundo do grupo usa todo dia, não uma ferramenta de gestão. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {souLiderDesteGrupo && (
            <TouchableOpacity
              style={[s.waBtn, { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' }]}
              onPress={() => setParticipantesModalVisible(true)}
            >
              <Ionicons name="people-outline" size={16} color="#fff" />
            </TouchableOpacity>
          )}
          {souLiderDesteGrupo && (
            <TouchableOpacity
              style={[s.waBtn, { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' }]}
              // Limpa a edição pendente: sem isto, depois de corrigir um encontro
              // o botão de admin reabriria o modal no formulário daquele encontro.
              onPress={() => { setEncontroEditando(null); setAdminModalVisible(true); }}
            >
              <Ionicons name="megaphone-outline" size={16} color="#fff" />
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity
              style={[s.waBtn, { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' }]}
              onPress={() => setLideresModalVisible(true)}
            >
              <Ionicons name="ribbon-outline" size={16} color="#fff" />
            </TouchableOpacity>
          )}
          {temAcessoConteudo && (
            <TouchableOpacity
              style={[s.chatBtn, { backgroundColor: grupo.cor, borderColor: grupo.cor }]}
              onPress={() => setChatModalVisible(true)}
            >
              <Ionicons name="chatbubbles" size={20} color="#fff" />
              <Text style={[s.chatBtnText, { color: '#fff' }]}>{t('grupos.chat')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[s.tabItem, activeTab === tab.id && { borderBottomWidth: 2, borderBottomColor: GRUPOS[tab.id].cor }]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons name={tab.icon as any} size={17} color={activeTab === tab.id ? GRUPOS[tab.id].cor : C.textMuted} />
            <Text style={[s.tabLabel, activeTab === tab.id && { color: GRUPOS[tab.id].cor, fontWeight: '700' }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchGrupoData(activeTab, temAcessoConteudo, true)} tintColor={grupo.cor} />}
      >

        {/* Hero do grupo */}
        <View style={[s.heroCard, { backgroundColor: grupo.cor }]}>
          {activeTab === 'jovens' ? (
            <Image
              source={require('../assets/PenielAlive-Logo.png')}
              style={s.heroLogo}
              resizeMode="cover"
            />
          ) : (
            <View style={[s.heroIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name={grupo.icon} size={32} color="#fff" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.heroNome}>{grupo.nome}</Text>
            <Text style={s.heroSub}>{grupo.subtitulo}</Text>
          </View>
        </View>
        <View style={[s.descricaoCard, { borderLeftColor: grupo.cor }]}>
          <Text style={s.descricaoTexto}>{grupo.descricao}</Text>
        </View>

        {!permissoesCarregadas ? (
          <ActivityIndicator color={grupo.cor} style={{ marginVertical: 30 }} />
        ) : !temAcessoConteudo ? (
          <View style={[s.lockedCard, { borderColor: grupo.cor + '40' }]}>
            <View style={[s.lockedIcon, { backgroundColor: grupo.cor + '18' }]}>
              <Ionicons name="lock-closed" size={22} color={grupo.cor} />
            </View>
            <Text style={s.lockedTitle}>{t('grupos.conteudoExclusivoTitulo')}</Text>
            <Text style={s.lockedTexto}>{t('grupos.conteudoExclusivoTexto')}</Text>
          </View>
        ) : (
          <>
            {/* Eventos */}
            <Text style={s.sectionLabel}>{t('grupos.proximosEventos')}</Text>
            {loading ? (
              <ActivityIndicator color={grupo.cor} style={{ marginVertical: 20 }} />
            ) : eventos.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>{t('grupos.nenhumEventoAgendado')}</Text>
              </View>
            ) : (
              eventos.map(evento => (
                <GrupoEventoCard
                  key={evento.id}
                  evento={evento}
                  tag={tipoTag(evento.tipo)}
                  podeEditar={souLiderDesteGrupo}
                  onEditar={() => { setEncontroEditando(evento); setAdminModalVisible(true); }}
                  onApagar={() => confirmarRemocao('grupo_eventos', evento.id, evento.titulo)}
                />
              ))
            )}

            {/* Devocionais — só o mais recente aqui (banner), como na Home;
                a lista completa desse grupo fica na tela Devocionais. */}
            <Text style={s.sectionLabel}>{t('grupos.devocionalGrupo')}</Text>
            {!loading && devocionais.length === 0 && (
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>{t('grupos.nenhumDevocionalAinda')}</Text>
              </View>
            )}
            {devocionais.length > 0 && (
              <>
                <GrupoDevocionalCard
                  key={devocionais[0].id}
                  dev={devocionais[0]}
                  cor={grupo.cor}
                  isOpen={expandedDev === devocionais[0].id}
                  onToggle={() => setExpandedDev(expandedDev === devocionais[0].id ? null : devocionais[0].id)}
                  onApagar={souLiderDesteGrupo
                    ? () => confirmarRemocao('devocionais', devocionais[0].id, devocionais[0].titulo)
                    : undefined}
                />
                <TouchableOpacity
                  style={[s.verTodosDevocionais, { backgroundColor: grupo.cor + '14', borderColor: grupo.cor + '40' }]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('Devocionais', { grupo: activeTab })}
                >
                  <Text style={[s.verTodosDevocionaisTexto, { color: grupo.cor }]}>{t('devocionais.verTodos')}</Text>
                  <Ionicons name="arrow-forward" size={14} color={grupo.cor} />
                </TouchableOpacity>
              </>
            )}

            {/* Shorts */}
            <Text style={s.sectionLabel}>{t('grupos.shortsGrupo')}</Text>
            {!loading && shorts.length === 0 && (
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>{t('grupos.nenhumShortAinda')}</Text>
              </View>
            )}
            {shorts.length > 0 && (
              <View style={s.shortsGrid}>
                {shorts.map(short => {
                  const ytId = short.plataforma === 'youtube' ? extractYoutubeId(short.url) : null;
                  return (
                    <TouchableOpacity
                      key={short.id}
                      style={s.shortCard}
                      activeOpacity={0.85}
                      onPress={() => Linking.openURL(short.url).catch(() => Alert.alert(t('common.erro'), t('grupos.erroWhatsapp')))}
                    >
                      {ytId ? (
                        <Image source={{ uri: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` }} style={s.shortThumb} resizeMode="cover" />
                      ) : (
                        <View style={[s.shortThumb, s.shortThumbPlaceholder, {
                          backgroundColor: short.plataforma === 'instagram' ? '#E1306C22' : '#FF000022',
                        }]}>
                          <Ionicons
                            name={short.plataforma === 'instagram' ? 'logo-instagram' : 'logo-youtube'}
                            size={26}
                            color={short.plataforma === 'instagram' ? '#E1306C' : '#FF0000'}
                          />
                        </View>
                      )}
                      <View style={s.shortPlayOverlay}>
                        <Ionicons name="play-circle" size={26} color="rgba(255,255,255,0.9)" />
                      </View>
                      <View style={s.shortInfo}>
                        <Text style={s.shortTitle} numberOfLines={2}>{short.titulo}</Text>
                      </View>
                      {souLiderDesteGrupo && (
                        <TouchableOpacity
                          style={s.removerBadge}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={() => confirmarRemocao('shorts_videos', short.id, short.titulo)}
                        >
                          <Ionicons name="trash-outline" size={13} color="#fff" />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Materiais (PDFs/links) */}
            <Text style={s.sectionLabel}>{t('grupos.materiaisGrupo')}</Text>
            {!loading && arquivos.length === 0 && (
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>{t('grupos.nenhumMaterialAinda')}</Text>
              </View>
            )}
            {arquivos.map(arq => (
              <TouchableOpacity
                key={arq.id}
                style={s.arquivoCard}
                activeOpacity={0.8}
                onPress={() => Linking.openURL(arq.url).catch(() => Alert.alert(t('common.erro'), t('grupos.erroWhatsapp')))}
              >
                <View style={[s.arquivoIcon, { backgroundColor: grupo.cor + '18' }]}>
                  <Ionicons name="document-text-outline" size={18} color={grupo.cor} />
                </View>
                <Text style={s.arquivoTitulo} numberOfLines={1}>{arq.titulo}</Text>
                {souLiderDesteGrupo && (
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => confirmarRemocao('grupo_arquivos', arq.id, arq.titulo)}
                  >
                    <Ionicons name="trash-outline" size={15} color={C.textMuted} />
                  </TouchableOpacity>
                )}
                <Ionicons name="open-outline" size={16} color={C.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Falar com o líder: só pra quem ainda NÃO faz parte do grupo — é
            como essa pessoa pede pra entrar. Quem já está dentro usa o Chat. */}
        {!temAcessoConteudo && (
          <TouchableOpacity style={[s.contactBtn, { backgroundColor: grupo.cor }]} onPress={abrirContato}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
            <Text style={s.contactBtnText}>{t('grupos.entrarContatoLider')}</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <ContatoModal
        visible={contatoModalVisible}
        grupo={activeTab}
        grupoNome={grupo.nome}
        cor={grupo.cor}
        mensagemInicial={grupo.mensagemContato}
        onClose={() => setContatoModalVisible(false)}
      />

      <GerenciarParticipantesModal
        visible={participantesModalVisible}
        grupo={activeTab}
        grupoNome={grupo.nome}
        cor={grupo.cor}
        onClose={() => setParticipantesModalVisible(false)}
      />

      <GerenciarLideresModal
        visible={lideresModalVisible}
        grupo={activeTab}
        grupoNome={grupo.nome}
        cor={grupo.cor}
        onClose={() => setLideresModalVisible(false)}
      />

      <GrupoAdminModal
        visible={adminModalVisible}
        grupo={activeTab}
        grupoNome={grupo.nome}
        cor={grupo.cor}
        encontroParaEditar={encontroEditando && {
          id: encontroEditando.id,
          titulo: encontroEditando.titulo,
          descricao: encontroEditando.descricao,
          dataISO: encontroEditando.dataISO,
          horario: encontroEditando.horario,
          local: encontroEditando.local,
          tipo: encontroEditando.tipo as 'presencial' | 'online' | 'casa',
        }}
        onClose={() => { setAdminModalVisible(false); setEncontroEditando(null); }}
        onSaved={() => fetchGrupoData(activeTab, temAcessoConteudo)}
      />

      {user && (
        <GrupoChatModal
          visible={chatModalVisible}
          grupo={activeTab}
          grupoNome={grupo.nome}
          cor={grupo.cor}
          userId={user.id}
          userNome={userNome}
          podeModerar={souLiderDesteGrupo}
          onClose={() => setChatModalVisible(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function buildS(C: Paleta) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: C.primary },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 },
  waBtnText: { fontSize: 12, fontWeight: '700' },
  // Chat: um pouco maior que os ícones de gestão ao lado — é a ação principal
  // do grupo, não uma ferramenta de liderança. Fundo na cor cheia do grupo e
  // ícone branco: na primeira versão era o contrário (cor do grupo sobre fundo
  // translúcido), e o roxo do Peniel Alive (#4A1AA8) sumia contra o cabeçalho
  // navy (#1A1740). Branco sobre a cor cheia funciona nos quatro grupos.
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1 },
  chatBtnText: { fontSize: 13.5, fontWeight: '700' },
  tabBar: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabLabel: { fontSize: 11, color: C.textMuted, fontWeight: '500' },
  scroll: { padding: 16, paddingBottom: 32 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10, marginTop: 8 },
  // Hero
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 18, marginBottom: 0 },
  heroIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  // Maior que o heroIcon (56) dos outros grupos de propósito: o logo do Alive
  // é um círculo com os cantos transparentes, então a arte visível é menor que
  // a caixa. Com 56 ele parecia encolhido ao lado dos ícones dos outros grupos.
  heroLogo: { width: 76, height: 76, borderRadius: 38 },
  heroNome: { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  descricaoCard: { backgroundColor: C.surface, borderRadius: 0, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: 14, marginBottom: 20, borderLeftWidth: 3, borderWidth: 1, borderColor: C.border },
  descricaoTexto: { fontSize: 13, color: C.textMuted, lineHeight: 20 },
  // Eventos
  eventoCard: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  eventoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  eventoTitulo: { fontSize: 14, fontWeight: '700', color: C.text, flex: 1 },
  eventoTag: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  eventoTagText: { fontSize: 10, fontWeight: '600' },
  eventoDesc: { fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 10 },
  eventoMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  eventoMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventoMetaText: { fontSize: 11, color: C.textMuted },
  // Devocionais
  devCard: { backgroundColor: C.surface, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  devHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  devIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  devTitulo: { fontSize: 14, fontWeight: '700', color: C.text },
  devRef: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  devBody: { paddingHorizontal: 14, paddingBottom: 14 },
  versiculoBox: { borderLeftWidth: 3, paddingLeft: 12, marginBottom: 10 },
  versiculoText: { fontSize: 13, color: C.text, fontStyle: 'italic', lineHeight: 20 },
  versiculoRef: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  reflexaoText: { fontSize: 13, color: C.textMuted, lineHeight: 20 },
  verTodosDevocionais: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'center', marginTop: -2, marginBottom: 20,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  verTodosDevocionaisTexto: { fontSize: 13, fontWeight: '700' },
  // Shorts
  shortsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  shortCard: { width: '48%', aspectRatio: 9 / 14, borderRadius: 14, overflow: 'hidden', backgroundColor: C.surface, marginBottom: 14, position: 'relative', borderWidth: 1, borderColor: C.border },
  shortThumb: { width: '100%', height: '100%' },
  shortThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  shortPlayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // Badge da lixeira no canto do short: fica por cima da miniatura, com fundo
  // escuro, porque a imagem pode ser clara e um ícone solto sumiria nela.
  removerBadge: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  shortInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  shortTitle: { fontSize: 11, fontWeight: '700', color: '#fff' },
  // Materiais
  arquivoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  arquivoIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  arquivoTitulo: { flex: 1, fontSize: 13, fontWeight: '600', color: C.text },
  // Conteúdo trancado (não-membro)
  lockedCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center', marginTop: 4 },
  lockedIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  lockedTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 6, textAlign: 'center' },
  lockedTexto: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
  // Contato
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  contactBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 13, color: C.textMuted },
}); }
