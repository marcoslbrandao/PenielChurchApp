// Admin › Devocionais: series e fila de agendados (03/11/2026).
// - Series: criar e editar (titulo, descricao, datas, total, capa, ativa).
// - Agendados: o que ainda vai sair (devocionais_agendados com publicado_em
//   nulo), com a imagem de cada um e o botao para trocar.
// O agendamento em si fica no NovoDevocionalModal do AdminScreen.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert, Modal, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { mascaraDataBR, dataBRparaISO, isoParaDataBR } from '../lib/datas';
import type { SerieDevocional } from '../lib/devocionalSeries';

const C = {
  bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8', border: '#E5E0D8',
  primary: '#1A1740', accent: '#F5C842', text: '#1A1A2E', textMuted: '#6B7280',
  textDim: '#9CA3AF', danger: '#C0392B', success: '#27AE60', verde: '#059669',
};

// ── Imagem do devocional: escolher na galeria e subir em devocionais/fotos ──
export async function escolherImagemDevocional(): Promise<string | null> {
  const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissao.granted) {
    Alert.alert('Permissão necessária', 'Libere o acesso às fotos para escolher a imagem.');
    return null;
  }
  // No iOS o corte do sistema e sempre quadrado: a foto vai inteira (deve ser 2:1).
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: Platform.OS === 'android', aspect: [2, 1], quality: 0.8,
  });
  if (r.canceled || !r.assets?.[0]) return null;
  return r.assets[0].uri;
}

export async function enviarImagemDevocional(uriLocal: string): Promise<string> {
  const ext = (uriLocal.split('.').pop()?.toLowerCase() ?? 'jpg') === 'png' ? 'png' : 'jpg';
  const base64 = await FileSystem.readAsStringAsync(uriLocal, { encoding: FileSystem.EncodingType.Base64 });
  const caminho = `fotos/admin-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('devocionais')
    .upload(caminho, decode(base64), { contentType: ext === 'png' ? 'image/png' : 'image/jpeg', upsert: true });
  if (error) throw error;
  return supabase.storage.from('devocionais').getPublicUrl(caminho).data.publicUrl;
}

// Proxima ordem livre da serie (conta publicados e agendados).
export async function proximaOrdemDaSerie(serieId: string): Promise<number> {
  const [a, b] = await Promise.all([
    supabase.from('devocionais').select('ordem_na_serie').eq('serie_id', serieId).order('ordem_na_serie', { ascending: false }).limit(1),
    supabase.from('devocionais_agendados').select('ordem_na_serie').eq('serie_id', serieId).order('ordem_na_serie', { ascending: false }).limit(1),
  ]);
  const max = Math.max(a.data?.[0]?.ordem_na_serie ?? 0, b.data?.[0]?.ordem_na_serie ?? 0);
  return max + 1;
}

type Agendado = {
  id: string; data: string; titulo: string; referencia: string; imagem_url: string | null;
  serie_id: string | null; ordem_na_serie: number | null; erro: string | null; grupo: string | null;
};

export default function DevocionaisAdmin({ recarregar }: { recarregar: number }) {
  const [series, setSeries] = useState<SerieDevocional[]>([]);
  const [agendados, setAgendados] = useState<Agendado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<SerieDevocional | null | 'nova'>(null);
  const [trocandoId, setTrocandoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [s, a] = await Promise.all([
      supabase.from('devocional_series').select('*').order('ordem', { ascending: true }),
      supabase.from('devocionais_agendados')
        .select('id, data, titulo, referencia, imagem_url, serie_id, ordem_na_serie, erro, grupo')
        .is('publicado_em', null).order('data', { ascending: true }),
    ]);
    setSeries((s.data as SerieDevocional[]) ?? []);
    setAgendados((a.data as Agendado[]) ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar, recarregar]);

  const nomeSerie = (id: string | null) => series.find(x => x.id === id)?.titulo;
  const totalSerie = (id: string | null) => series.find(x => x.id === id)?.total_devocionais;

  const trocarImagem = async (ag: Agendado) => {
    const uri = await escolherImagemDevocional();
    if (!uri) return;
    setTrocandoId(ag.id);
    try {
      const url = await enviarImagemDevocional(uri);
      const { error } = await supabase.from('devocionais_agendados').update({ imagem_url: url }).eq('id', ag.id);
      if (error) throw error;
      await carregar();
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível trocar a imagem.');
    } finally {
      setTrocandoId(null);
    }
  };

  const removerAgendado = (ag: Agendado) => {
    Alert.alert('Remover agendamento', `"${ag.titulo}" (${isoParaDataBR(ag.data)}) não será publicado.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('devocionais_agendados').delete().eq('id', ag.id);
          if (error) { Alert.alert('Erro', error.message); return; }
          carregar();
        },
      },
    ]);
  };

  if (carregando) return <ActivityIndicator color={C.verde} style={{ marginVertical: 16 }} />;

  return (
    <View style={{ marginBottom: 8 }}>
      {/* ── Series ── */}
      <View style={st.secaoTopo}>
        <Text style={st.secao}>Séries</Text>
        <TouchableOpacity style={st.btnPequeno} onPress={() => setEditando('nova')}>
          <Ionicons name="add" size={14} color="#fff" />
          <Text style={st.btnPequenoTexto}>Nova série</Text>
        </TouchableOpacity>
      </View>
      {series.length === 0 && <Text style={st.vazio}>Nenhuma série ainda.</Text>}
      {series.map(sr => (
        <TouchableOpacity key={sr.id} style={st.card} activeOpacity={0.8} onPress={() => setEditando(sr)}>
          {sr.imagem_url
            ? <Image source={{ uri: sr.imagem_url }} style={st.thumb} />
            : <View style={[st.thumb, st.thumbVazio]}><Ionicons name="library-outline" size={18} color={C.textDim} /></View>}
          <View style={{ flex: 1 }}>
            <Text style={st.titulo}>{sr.titulo}</Text>
            <Text style={st.meta}>
              {isoParaDataBR(sr.data_inicio)}{sr.data_fim ? ` a ${isoParaDataBR(sr.data_fim)}` : ''}
              {sr.total_devocionais ? ` · ${sr.total_devocionais} devocionais` : ''}
            </Text>
            {!sr.ativa && <Text style={[st.meta, { color: C.danger }]}>Oculta no app</Text>}
          </View>
          <Ionicons name="create-outline" size={18} color={C.textMuted} />
        </TouchableOpacity>
      ))}

      {/* ── Agendados ── */}
      <Text style={[st.secao, { marginTop: 18 }]}>Agendados ({agendados.length})</Text>
      <Text style={st.ajuda}>Saem às 06:00 (Londres) do dia. Sem imagem, o app escolhe uma automaticamente.</Text>
      {agendados.length === 0 && <Text style={st.vazio}>Nenhum devocional agendado.</Text>}
      {agendados.map(ag => (
        <View key={ag.id} style={st.card}>
          {ag.imagem_url
            ? <Image source={{ uri: ag.imagem_url }} style={st.thumb} />
            : <View style={[st.thumb, st.thumbVazio]}><Text style={st.auto}>auto</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={st.meta}>{isoParaDataBR(ag.data)}{ag.serie_id ? ` · ${nomeSerie(ag.serie_id) ?? 'Série'} ${ag.ordem_na_serie ?? ''}${totalSerie(ag.serie_id) ? `/${totalSerie(ag.serie_id)}` : ''}` : ''}</Text>
            <Text style={st.titulo} numberOfLines={1}>{ag.titulo}</Text>
            <Text style={st.meta} numberOfLines={1}>{ag.referencia}</Text>
            {!!ag.erro && <Text style={[st.meta, { color: C.danger }]} numberOfLines={2}>Erro: {ag.erro}</Text>}
          </View>
          <View style={{ gap: 6 }}>
            <TouchableOpacity style={st.acao} onPress={() => trocarImagem(ag)} disabled={trocandoId === ag.id}>
              {trocandoId === ag.id
                ? <ActivityIndicator size="small" color={C.verde} />
                : <Ionicons name="image-outline" size={16} color={C.verde} />}
            </TouchableOpacity>
            <TouchableOpacity style={[st.acao, { borderColor: C.danger + '40' }]} onPress={() => removerAgendado(ag)}>
              <Ionicons name="trash-outline" size={16} color={C.danger} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <Text style={[st.secao, { marginTop: 18 }]}>Publicados</Text>

      <SerieModal
        serie={editando}
        onClose={() => setEditando(null)}
        onSaved={() => { setEditando(null); carregar(); }}
      />
    </View>
  );
}

// ── Criar / editar serie ──
function SerieModal({ serie, onClose, onSaved }: {
  serie: SerieDevocional | null | 'nova'; onClose: () => void; onSaved: () => void;
}) {
  const visivel = serie !== null;
  const existente = serie && serie !== 'nova' ? serie : null;
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [total, setTotal] = useState('');
  const [ativa, setAtiva] = useState(true);
  const [capaUrl, setCapaUrl] = useState<string | null>(null);
  const [capaLocal, setCapaLocal] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!visivel) return;
    setTitulo(existente?.titulo ?? '');
    setDescricao(existente?.descricao ?? '');
    setInicio(isoParaDataBR(existente?.data_inicio));
    setFim(isoParaDataBR(existente?.data_fim));
    setTotal(existente?.total_devocionais ? String(existente.total_devocionais) : '');
    setAtiva(existente?.ativa ?? true);
    setCapaUrl(existente?.imagem_url ?? null);
    setCapaLocal(null);
  }, [serie]);

  const salvar = async () => {
    if (!titulo.trim()) { Alert.alert('Atenção', 'Dê um nome para a série.'); return; }
    const isoInicio = inicio ? dataBRparaISO(inicio) : '';
    const isoFim = fim ? dataBRparaISO(fim) : '';
    if ((inicio && !isoInicio) || (fim && !isoFim)) { Alert.alert('Atenção', 'Use datas no formato DD/MM/AAAA.'); return; }
    setSalvando(true);
    try {
      let imagem = capaUrl;
      if (capaLocal) imagem = await enviarImagemDevocional(capaLocal);
      const dados: any = {
        titulo: titulo.trim(), descricao: descricao.trim() || null,
        data_inicio: isoInicio || null, data_fim: isoFim || null,
        total_devocionais: total ? Number(total) : null, ativa, imagem_url: imagem,
      };
      if (existente) {
        const { error } = await supabase.from('devocional_series').update(dados).eq('id', existente.id);
        if (error) throw error;
      } else {
        const { data: ult } = await supabase.from('devocional_series').select('ordem').order('ordem', { ascending: false }).limit(1);
        dados.ordem = (ult?.[0]?.ordem ?? 0) + 1;
        const { error } = await supabase.from('devocional_series').insert(dados);
        if (error) throw error;
      }
      onSaved();
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não foi possível salvar a série.');
    } finally {
      setSalvando(false);
    }
  };

  const capaMostrada = capaLocal ?? capaUrl;

  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '90%' }}>
          <View style={st.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={st.sheetTopo}>
                <Text style={st.sheetTitulo}>{existente ? 'Editar série' : 'Nova série'}</Text>
                <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
              </View>

              <Text style={st.label}>Capa (opcional, 2:1)</Text>
              <TouchableOpacity style={st.capaBox} onPress={async () => { const u = await escolherImagemDevocional(); if (u) setCapaLocal(u); }}>
                {capaMostrada
                  ? <Image source={{ uri: capaMostrada }} style={{ width: '100%', aspectRatio: 2 }} />
                  : <Text style={st.meta}>Sem capa: o app usa a foto do devocional mais recente</Text>}
              </TouchableOpacity>

              <Text style={st.label}>Nome</Text>
              <TextInput style={st.input} value={titulo} onChangeText={setTitulo} placeholder="Ex.: A Promessa" placeholderTextColor={C.textDim} />

              <Text style={st.label}>Descrição</Text>
              <TextInput style={[st.input, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]} value={descricao} onChangeText={setDescricao} multiline placeholder="Uma frase sobre a série" placeholderTextColor={C.textDim} />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={st.label}>Início</Text>
                  <TextInput style={st.input} value={inicio} onChangeText={v => setInicio(mascaraDataBR(v))} keyboardType="number-pad" placeholder="DD/MM/AAAA" placeholderTextColor={C.textDim} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.label}>Fim</Text>
                  <TextInput style={st.input} value={fim} onChangeText={v => setFim(mascaraDataBR(v))} keyboardType="number-pad" placeholder="DD/MM/AAAA" placeholderTextColor={C.textDim} />
                </View>
              </View>

              <Text style={st.label}>Quantos devocionais</Text>
              <TextInput style={st.input} value={total} onChangeText={v => setTotal(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Ex.: 12" placeholderTextColor={C.textDim} />

              <View style={st.linhaSwitch}>
                <Text style={[st.label, { marginBottom: 0, flex: 1 }]}>Mostrar no app</Text>
                <Switch value={ativa} onValueChange={setAtiva} />
              </View>

              <TouchableOpacity style={[st.salvar, salvando && { opacity: 0.7 }]} onPress={salvar} disabled={salvando}>
                {salvando ? <ActivityIndicator color="#fff" /> : <Text style={st.salvarTexto}>Salvar série</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  secaoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  secao: { fontSize: 12, fontWeight: '800', color: C.text, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  ajuda: { fontSize: 12, color: C.textMuted, marginBottom: 10, lineHeight: 17 },
  vazio: { fontSize: 13, color: C.textDim, marginBottom: 10 },
  btnPequeno: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.verde, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  btnPequenoTexto: { fontSize: 12, fontWeight: '700', color: '#fff' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 8 },
  thumb: { width: 72, height: 36, borderRadius: 6, backgroundColor: C.surfaceAlt },
  thumbVazio: { alignItems: 'center', justifyContent: 'center' },
  auto: { fontSize: 10, color: C.textDim, fontWeight: '700' },
  titulo: { fontSize: 14, fontWeight: '700', color: C.text },
  meta: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  acao: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: C.verde + '40', alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  sheetTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitulo: { fontSize: 18, fontWeight: '800', color: C.text },
  label: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, height: 46, fontSize: 15, color: C.text },
  capaBox: { borderRadius: 10, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', overflow: 'hidden', minHeight: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceAlt },
  linhaSwitch: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  salvar: { marginTop: 20, backgroundColor: C.verde, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  salvarTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
