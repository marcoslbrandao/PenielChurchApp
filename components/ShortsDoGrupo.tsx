// components/ShortsDoGrupo.tsx
//
// Shorts dos grupos (pedido do Marcos, 11/11/2026; feito em 12/11/2026).
// • Membro: "🎬 Enviar vídeo" — grava ou escolhe da galeria (até 5 min) e o
//   vídeo vai para a FILA do líder.
// • Líder: "Fila" — vê os vídeos, põe título/arte/legenda, confirma a
//   autorização de imagem e publica (ou recusa). Publicar dispara o GitHub
//   Actions, que aplica a arte, legenda e sobe para o YouTube da igreja. O
//   Short pronto aparece sozinho na seção Shorts do grupo.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, ScrollView, Switch,
  KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { enviarArquivo, tamanhoLocal } from '../lib/chatGeral';
import { useTheme } from '../lib/theme';
import PlayerDeVideo from './PlayerDeVideo';

const MAX_S = 300;
const MAX_MB = 200;

type ItemFila = {
  id: string; grupo: string; autor: string; autor_nome: string | null; video_path: string; duracao_s: number | null;
  mensagem: string | null; status: 'na_fila' | 'aprovado' | 'processando' | 'publicado' | 'recusado' | 'erro';
  titulo: string | null; subtitulo: string | null; legendas: boolean; arte: 'faixa' | 'limpa'; erro: string | null; created_at: string;
};

const p2 = (n: number) => String(n).padStart(2, '0');
const dataBR = (iso: string) => { const d = new Date(iso); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
const minSeg = (s: number | null) => (s ? `${Math.floor(s / 60)}:${p2(Math.round(s % 60))}` : '');

export default function ShortsDoGrupo({ grupo, cor, podeEnviar, ehLider, userId, onPublicado }: {
  grupo: string; cor: string; podeEnviar: boolean; ehLider: boolean; userId: string | null; onPublicado?: () => void;
}) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [filaAberta, setFilaAberta] = useState(false);
  const [envio, setEnvio] = useState<{ uri: string; duracao: number; mime?: string | null } | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<ItemFila | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!ehLider) return;
    const { data } = await supabase.from('shorts_fila').select('*').eq('grupo', grupo)
      .in('status', ['na_fila', 'aprovado', 'processando', 'erro']).order('created_at', { ascending: true });
    setFila((data ?? []) as ItemFila[]);
  }, [grupo, ehLider]);
  useEffect(() => { carregar(); }, [carregar]);

  // ── Escolher / gravar ──
  const aceitar = (a: ImagePicker.ImagePickerAsset) => {
    const dur = Math.round((a.duration ?? 0) / 1000);
    if (dur > MAX_S + 3) { Alert.alert(t('shorts.titulo'), t('shorts.muitoLongo')); return; }
    setMensagem('');
    setEnvio({ uri: a.uri, duracao: dur, mime: a.mimeType });
  };
  const daGaleria = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'], videoMaxDuration: MAX_S, quality: 1,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_960x540,
    });
    if (!r.canceled && r.assets?.[0]) aceitar(r.assets[0]);
  };
  const gravar = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { Alert.alert(t('shorts.titulo'), t('shorts.semCamera')); return; }
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'], videoMaxDuration: MAX_S,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame960x540,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_960x540,
    });
    if (!r.canceled && r.assets?.[0]) aceitar(r.assets[0]);
  };
  const escolher = () => {
    Alert.alert(t('shorts.enviarVideo'), t('shorts.escolherSub'), [
      { text: t('shorts.gravar'), onPress: gravar },
      { text: t('shorts.galeria'), onPress: daGaleria },
      { text: t('common.cancelar'), style: 'cancel' },
    ]);
  };

  const enviar = async () => {
    if (!envio || !userId) return;
    const tam = await tamanhoLocal(envio.uri);
    if (tam && tam > MAX_MB * 1024 * 1024) { Alert.alert(t('shorts.titulo'), t('shorts.muitoGrande', { mb: MAX_MB })); return; }
    setEnviando(true);
    let caminho: string | null = null;
    try {
      const ehMov = (envio.mime ?? '').includes('quicktime') || /\.mov$/i.test(envio.uri);
      caminho = await enviarArquivo(envio.uri, userId, ehMov ? 'mov' : 'mp4', ehMov ? 'video/quicktime' : 'video/mp4', false,
        { bucket: 'shorts-fila', prefixo: grupo });
      const { data, error } = await supabase.from('shorts_fila')
        .insert({ grupo, video_path: caminho, duracao_s: envio.duracao || null, mensagem: mensagem.trim() || null })
        .select('*').single();
      if (error) throw error;
      setEnvio(null);
      if (ehLider) { await carregar(); setEditando(data as ItemFila); setFilaAberta(true); }
      else Alert.alert(t('shorts.titulo'), t('shorts.enviadoAoLider'));
    } catch (e: any) {
      if (caminho) supabase.storage.from('shorts-fila').remove([caminho]);
      const msg = String(e?.message ?? '');
      Alert.alert(t('shorts.titulo'), /too large|413|exceeded/i.test(msg) ? t('shorts.muitoGrande', { mb: 50 }) : (msg || t('shorts.erroEnvio')));
    } finally {
      setEnviando(false);
    }
  };

  const verVideo = async (item: ItemFila) => {
    const { data } = await supabase.storage.from('shorts-fila').createSignedUrl(item.video_path, 3600);
    if (data?.signedUrl) setVideoUrl(data.signedUrl);
  };

  if (!podeEnviar && !ehLider) return null;
  const pendentes = fila.filter(f => f.status === 'na_fila').length;

  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {podeEnviar && (
        <TouchableOpacity style={[st.botao, { backgroundColor: cor }]} onPress={escolher}>
          <Ionicons name="videocam" size={16} color="#fff" />
          <Text style={st.botaoTexto}>{ehLider ? t('shorts.criarShort') : t('shorts.enviarVideo')}</Text>
        </TouchableOpacity>
      )}
      {ehLider && (
        <TouchableOpacity style={[st.botao, { backgroundColor: 'transparent', borderWidth: 1, borderColor: cor }]} onPress={() => { carregar(); setFilaAberta(true); }}>
          <Ionicons name="albums-outline" size={16} color={cor} />
          <Text style={[st.botaoTexto, { color: cor }]}>{t('shorts.fila')}{fila.length ? ` · ${fila.length}` : ''}</Text>
          {pendentes > 0 && <View style={[st.bolinha, { backgroundColor: '#E84B1A' }]} />}
        </TouchableOpacity>
      )}

      {/* ── Enviar (membro ou líder) ── */}
      <Modal visible={!!envio} transparent animationType="slide" onRequestClose={() => !enviando && setEnvio(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.fundo}>
          <View style={[st.folha, { backgroundColor: C.surface, paddingBottom: insets.bottom + 18 }]}>
            <Text style={[st.folhaTitulo, { color: C.text }]}>🎬 {ehLider ? t('shorts.criarShort') : t('shorts.enviarParaLider')}</Text>
            <Text style={[st.sub, { color: C.textMuted }]}>{t('shorts.duracao', { tempo: minSeg(envio?.duracao ?? 0) })}{(envio?.duracao ?? 0) > 180 ? ` · ${t('shorts.videoNormal')}` : ` · ${t('shorts.viraShort')}`}</Text>
            {!ehLider && (
              <>
                <Text style={[st.rotulo, { color: C.textMuted }]}>{t('shorts.recado')}</Text>
                <TextInput style={[st.campo, { color: C.text, borderColor: C.border, minHeight: 70, textAlignVertical: 'top' }]} multiline maxLength={500}
                  value={mensagem} onChangeText={setMensagem} placeholder={t('shorts.recadoEx')} placeholderTextColor={C.textDim} />
              </>
            )}
            <TouchableOpacity style={[st.botaoGrande, { backgroundColor: cor }, enviando && { opacity: 0.6 }]} onPress={enviar} disabled={enviando}>
              {enviando ? <ActivityIndicator color="#fff" /> : <Text style={st.botaoTexto}>{ehLider ? t('shorts.continuar') : t('shorts.enviar')}</Text>}
            </TouchableOpacity>
            {enviando && <Text style={[st.sub, { color: C.textMuted, textAlign: 'center' }]}>{t('shorts.enviandoAguarde')}</Text>}
            {!enviando && (
              <TouchableOpacity onPress={() => setEnvio(null)} style={{ alignSelf: 'center', padding: 12 }}>
                <Text style={{ color: C.textMuted, fontWeight: '700' }}>{t('common.cancelar')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Fila do líder ── */}
      <Modal visible={filaAberta} transparent animationType="slide" onRequestClose={() => { setFilaAberta(false); setEditando(null); }}>
        <View style={st.fundo}>
          <View style={[st.folha, { backgroundColor: C.surface, paddingBottom: insets.bottom + 18, maxHeight: '94%' }]}>
            {editando ? (
              <EditorShort item={editando} cor={cor} onVoltar={() => setEditando(null)} onVer={() => verVideo(editando)}
                onFeito={async () => { setEditando(null); await carregar(); onPublicado?.(); }} />
            ) : (
              <>
                <View style={st.topo}>
                  <Text style={[st.folhaTitulo, { color: C.text }]}>🎬 {t('shorts.filaTitulo')}</Text>
                  <TouchableOpacity onPress={() => setFilaAberta(false)} hitSlop={10}><Ionicons name="close" size={22} color={C.textMuted} /></TouchableOpacity>
                </View>
                <FlatList
                  data={fila}
                  keyExtractor={i => i.id}
                  ListEmptyComponent={<Text style={[st.sub, { color: C.textMuted, textAlign: 'center', marginVertical: 30 }]}>{t('shorts.filaVazia')}</Text>}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={[st.item, { borderColor: C.border }]} onPress={() => setEditando(item)}>
                      <Ionicons name="film-outline" size={22} color={cor} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.text, fontWeight: '700' }} numberOfLines={1}>{item.titulo || item.autor_nome || t('shorts.semTitulo')}</Text>
                        <Text style={[st.sub, { color: C.textMuted }]}>{item.autor_nome} · {dataBR(item.created_at)} · {minSeg(item.duracao_s)}</Text>
                        {!!item.mensagem && <Text style={[st.sub, { color: C.text }]} numberOfLines={2}>💬 {item.mensagem}</Text>}
                      </View>
                      <Text style={[st.selo, { color: item.status === 'erro' ? '#C0392B' : cor, backgroundColor: (item.status === 'erro' ? '#C0392B' : cor) + '18' }]}>
                        {t(`shorts.status_${item.status}`)}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}
          </View>
        </View>
      </Modal>
      <PlayerDeVideo url={videoUrl} onFechar={() => setVideoUrl(null)} />
    </View>
  );
}

function EditorShort({ item, cor, onVoltar, onVer, onFeito }: {
  item: ItemFila; cor: string; onVoltar: () => void; onVer: () => void; onFeito: () => void;
}) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const [titulo, setTitulo] = useState(item.titulo ?? '');
  const [subtitulo, setSubtitulo] = useState(item.subtitulo ?? '');
  const [legendas, setLegendas] = useState(item.legendas ?? true);
  const [arte, setArte] = useState<'faixa' | 'limpa'>(item.arte ?? 'faixa');
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const travado = item.status === 'aprovado' || item.status === 'processando';

  const publicar = async () => {
    if (!titulo.trim()) return Alert.alert(t('shorts.titulo'), t('shorts.faltaTitulo'));
    if (!ok) return Alert.alert(t('shorts.titulo'), t('shorts.faltaConsentimento'));
    setSalvando(true);
    const { data, error } = await supabase.rpc('shorts_aprovar', {
      p_id: item.id, p_titulo: titulo, p_subtitulo: subtitulo, p_legendas: legendas, p_arte: arte, p_consentimento: ok,
    });
    if (error || data !== 'ok') { setSalvando(false); return Alert.alert(t('shorts.titulo'), String(error?.message ?? data)); }
    const r = await supabase.functions.invoke('shorts-publicar', { body: { id: item.id } });
    setSalvando(false);
    Alert.alert(t('shorts.titulo'), r.data?.disparado ? t('shorts.publicando') : t('shorts.aprovadoAguardando'));
    onFeito();
  };
  const recusar = () => {
    Alert.prompt
      ? Alert.prompt(t('shorts.recusar'), t('shorts.recusarSub'), async motivo => { await supabase.rpc('shorts_recusar', { p_id: item.id, p_motivo: motivo ?? '' }); onFeito(); })
      : Alert.alert(t('shorts.recusar'), t('shorts.recusarSub'), [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('shorts.recusar'), style: 'destructive', onPress: async () => { await supabase.rpc('shorts_recusar', { p_id: item.id, p_motivo: '' }); onFeito(); } },
      ]);
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={st.topo}>
        <TouchableOpacity onPress={onVoltar} hitSlop={10}><Ionicons name="chevron-back" size={22} color={C.textMuted} /></TouchableOpacity>
        <Text style={[st.folhaTitulo, { color: C.text, flex: 1, marginLeft: 6 }]}>{t('shorts.prepararShort')}</Text>
      </View>
      <Text style={[st.sub, { color: C.textMuted }]}>{item.autor_nome} · {dataBR(item.created_at)} · {minSeg(item.duracao_s)} · {(item.duracao_s ?? 0) > 180 ? t('shorts.videoNormal') : t('shorts.viraShort')}</Text>
      {!!item.mensagem && <Text style={[st.sub, { color: C.text, marginTop: 6 }]}>💬 {item.mensagem}</Text>}
      {item.status === 'erro' && <Text style={[st.sub, { color: '#C0392B', marginTop: 6 }]}>⚠️ {t('shorts.deuErro')} {item.erro ?? ''}</Text>}
      {travado && <Text style={[st.sub, { color: cor, marginTop: 6 }]}>⏳ {t('shorts.emPreparo')}</Text>}

      <TouchableOpacity style={[st.botao, { backgroundColor: cor + '18', alignSelf: 'flex-start', marginTop: 10 }]} onPress={onVer}>
        <Ionicons name="play-circle-outline" size={18} color={cor} />
        <Text style={[st.botaoTexto, { color: cor }]}>{t('shorts.verVideo')}</Text>
      </TouchableOpacity>

      <Text style={[st.rotulo, { color: C.textMuted }]}>{t('shorts.tituloCampo')}</Text>
      <TextInput style={[st.campo, { color: C.text, borderColor: C.border }]} value={titulo} onChangeText={setTitulo} maxLength={90} editable={!travado}
        placeholder={t('shorts.tituloEx')} placeholderTextColor={C.textDim} />
      <Text style={[st.rotulo, { color: C.textMuted }]}>{t('shorts.subtituloCampo')}</Text>
      <TextInput style={[st.campo, { color: C.text, borderColor: C.border }]} value={subtitulo} onChangeText={setSubtitulo} maxLength={90} editable={!travado}
        placeholder={t('shorts.subtituloEx')} placeholderTextColor={C.textDim} />

      <Text style={[st.rotulo, { color: C.textMuted }]}>{t('shorts.arte')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['faixa', 'limpa'] as const).map(a => (
          <TouchableOpacity key={a} disabled={travado} onPress={() => setArte(a)}
            style={[st.chip, { borderColor: cor + '66', backgroundColor: arte === a ? cor : 'transparent' }]}>
            <Text style={{ color: arte === a ? '#fff' : C.text, fontWeight: '700', fontSize: 12.5 }}>{t(`shorts.arte_${a}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={st.linhaSwitch}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontWeight: '700' }}>{t('shorts.legendas')}</Text>
          <Text style={[st.sub, { color: C.textMuted }]}>{t('shorts.legendasSub')}</Text>
        </View>
        <Switch value={legendas} onValueChange={setLegendas} disabled={travado} trackColor={{ true: cor }} />
      </View>
      <TouchableOpacity style={st.linhaSwitch} onPress={() => !travado && setOk(!ok)}>
        <Ionicons name={ok ? 'checkbox' : 'square-outline'} size={24} color={cor} />
        <Text style={{ color: C.text, flex: 1, fontSize: 13 }}>{t('shorts.consentimento')}</Text>
      </TouchableOpacity>

      {!travado && (
        <TouchableOpacity style={[st.botaoGrande, { backgroundColor: cor }, salvando && { opacity: 0.6 }]} onPress={publicar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={st.botaoTexto}>{item.status === 'erro' ? t('shorts.tentarDeNovo') : t('shorts.publicar')}</Text>}
        </TouchableOpacity>
      )}
      {!travado && (
        <TouchableOpacity onPress={recusar} style={{ alignSelf: 'center', padding: 12 }}>
          <Text style={{ color: '#C0392B', fontWeight: '700' }}>{t('shorts.recusar')}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  botao: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  botaoTexto: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bolinha: { width: 8, height: 8, borderRadius: 4 },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  folha: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  folhaTitulo: { fontSize: 18, fontWeight: '800' },
  sub: { fontSize: 12.5, marginTop: 2 },
  rotulo: { fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  campo: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  botaoGrande: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  selo: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
});
