// components/CultoDaSemanaAdmin.tsx
//
// Painel Admin → aba "Culto" (21/10/2026). Só o Admin preenche.
//
// O Admin escolhe data, tipo de culto, tema, texto base, pregador e foto; a
// thumb aparece na hora (canvas, ver lib/thumbCulto.ts). "Publicar no
// YouTube" salva, sobe a thumb para `culto-semana/thumbs/<id>.jpg` e chama a
// Edge Function `youtube-culto`, que cria o live AGENDADO no canal com
// título, descrição, thumb e playlist. Mudou algo? "Atualizar no YouTube"
// mexe no mesmo live. No domingo, no OBS: "Selecionar transmissão existente".
//
// Fotos dos pregadores: PNG já recortado (sem fundo) em
// `culto-semana/pregadores/`. Pregador visitante: pedir a foto e recortar.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, Image, Linking, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { mascaraDataBR, dataBRparaISO, isoParaDataBR, hojeEmLondres } from '../lib/datas';
import { TIPOS_CULTO, TipoCulto, DadosThumb } from '../lib/thumbCulto';
import ThumbCultoView, { ThumbCultoRef } from './ThumbCultoView';

const BUCKET = 'culto-semana';
const PREGADOR_PADRAO = 'Pr. Marcos Brandão';
// Pasta criada pelo Marcos no Storage com P maiúsculo (o Storage diferencia).
const PASTA_FOTOS = 'pregadores';

type Culto = {
  id: string; data: string; hora: string; tipo: TipoCulto; tema: string;
  subtitulo: string | null; referencia: string | null; pregador: string;
  foto_path: string | null; observacao: string | null; thumb_path: string | null;
  youtube_id: string | null; youtube_publicado_em: string | null; youtube_erro: string | null;
};

type Form = {
  id: string | null; data: string; hora: string; tipo: TipoCulto; tema: string;
  subtitulo: string; referencia: string; pregador: string; foto_path: string | null; observacao: string;
};

type Cores = { text: string; textMuted: string; textDim: string; border: string; primary: string; purple: string; danger: string; success?: string; surface?: string };

function proximoDomingoISO(): string {
  const h = hojeEmLondres();
  const d = new Date(Date.UTC(h.ano, h.mes - 1, h.dia));
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

function hojeISO(): string {
  const h = hojeEmLondres();
  return `${h.ano}-${String(h.mes).padStart(2, '0')}-${String(h.dia).padStart(2, '0')}`;
}

function mascaraHora(t: string): string {
  const d = t.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

function formVazio(): Form {
  return {
    id: null, data: isoParaDataBR(proximoDomingoISO()), hora: '18:00', tipo: 'adoracao',
    tema: '', subtitulo: '', referencia: '', pregador: PREGADOR_PADRAO, foto_path: null, observacao: '',
  };
}

function urlPublica(caminho: string | null): string | null {
  return caminho ? supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl : null;
}

async function erroDaFuncao(error: any): Promise<string> {
  try {
    const corpo = await error?.context?.json?.();
    if (corpo?.error) return String(corpo.error);
  } catch { /* corpo não é JSON */ }
  return error?.message ?? 'Erro desconhecido.';
}

export default function CultoDaSemanaAdmin({ C }: { C: Cores }) {
  const { t } = useTranslation();
  const [cultos, setCultos] = useState<Culto[]>([]);
  const [fotos, setFotos] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [ocupado, setOcupado] = useState<null | 'salvando' | 'publicando' | 'removendo' | 'foto'>(null);
  const thumbRef = useRef<ThumbCultoRef>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [c, f] = await Promise.all([
      supabase.from('cultos_semana').select('*').order('data', { ascending: false }).limit(20),
      supabase.storage.from(BUCKET).list(PASTA_FOTOS, { limit: 100, sortBy: { column: 'name', order: 'asc' } }),
    ]);
    setCultos((c.data ?? []) as Culto[]);
    setFotos((f.data ?? []).filter(o => /\.(png|jpe?g|webp)$/i.test(o.name)).map(o => `${PASTA_FOTOS}/${o.name}`));
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const hoje = hojeISO();
  const proximos = cultos.filter(c => c.data >= hoje).sort((a, b) => a.data.localeCompare(b.data));
  const anteriores = cultos.filter(c => c.data < hoje).slice(0, 6);
  const atual = form?.id ? cultos.find(c => c.id === form.id) ?? null : null;

  const dadosThumb: DadosThumb | null = useMemo(() => {
    if (!form) return null;
    const iso = dataBRparaISO(form.data);
    return {
      tipo: form.tipo,
      dataTexto: iso ? iso.split('-').reverse().join(' · ') : '',
      tema: form.tema, subtitulo: form.subtitulo.trim(), referencia: form.referencia.trim(),
      pregador: form.pregador.trim(), fotoUrl: urlPublica(form.foto_path),
    };
  }, [form]);

  const editar = (c: Culto) => setForm({
    id: c.id, data: isoParaDataBR(c.data), hora: c.hora.slice(0, 5), tipo: c.tipo, tema: c.tema,
    subtitulo: c.subtitulo ?? '', referencia: c.referencia ?? '', pregador: c.pregador,
    foto_path: c.foto_path, observacao: c.observacao ?? '',
  });

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm(f => (f ? { ...f, [k]: v } : f));

  // Salva a linha e a thumb. Devolve o id (ou null se não deu).
  const salvar = async (): Promise<string | null> => {
    if (!form) return null;
    const iso = dataBRparaISO(form.data);
    if (!iso) { Alert.alert(t('common.atencao'), t('cultoSemana.dataInvalida')); return null; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.hora)) { Alert.alert(t('common.atencao'), t('cultoSemana.horaInvalida')); return null; }
    if (!form.tema.trim()) { Alert.alert(t('common.atencao'), t('cultoSemana.temaObrigatorio')); return null; }
    if (!form.pregador.trim()) { Alert.alert(t('common.atencao'), t('cultoSemana.pregadorObrigatorio')); return null; }

    const linha = {
      data: iso, hora: form.hora, tipo: form.tipo, tema: form.tema.trim(),
      subtitulo: form.subtitulo.trim() || null, referencia: form.referencia.trim() || null,
      pregador: form.pregador.trim(), foto_path: form.foto_path, observacao: form.observacao.trim() || null,
    };
    let id = form.id;
    if (id) {
      const { error } = await supabase.from('cultos_semana').update(linha).eq('id', id);
      if (error) { Alert.alert(t('common.erro'), error.message); return null; }
    } else {
      const { data, error } = await supabase.from('cultos_semana').insert(linha).select('id').single();
      if (error || !data) { Alert.alert(t('common.erro'), error?.message ?? ''); return null; }
      id = data.id as string;
      setForm(f => (f ? { ...f, id } : f));
    }

    try {
      const base64 = await thumbRef.current!.exportar();
      const caminho = `thumbs/${id}.jpg`;
      const { error: up } = await supabase.storage.from(BUCKET)
        .upload(caminho, decode(base64), { contentType: 'image/jpeg', upsert: true });
      if (up) throw up;
      await supabase.from('cultos_semana').update({ thumb_path: caminho }).eq('id', id);
    } catch (e: any) {
      Alert.alert(t('cultoSemana.erroThumb'), e?.message ?? '');
      return null;
    }
    return id;
  };

  const onSalvar = async () => {
    setOcupado('salvando');
    const id = await salvar();
    setOcupado(null);
    if (id) { await carregar(); Alert.alert(t('cultoSemana.salvo'), t('cultoSemana.salvoTexto')); }
  };

  const onPublicar = async () => {
    setOcupado('publicando');
    const id = await salvar();
    if (!id) { setOcupado(null); return; }
    const { data, error } = await supabase.functions.invoke('youtube-culto', { body: { acao: 'publicar', id } });
    setOcupado(null);
    await carregar();
    if (error) { Alert.alert(t('cultoSemana.erroYoutube'), await erroDaFuncao(error)); return; }
    const avisos: string[] = data?.avisos ?? [];
    Alert.alert(
      data?.novo ? t('cultoSemana.publicado') : t('cultoSemana.atualizado'),
      t('cultoSemana.publicadoTexto') + (avisos.length ? `\n\n⚠️ ${avisos.join('\n')}` : ''),
    );
  };

  const onRemover = () => {
    if (!form?.id) return;
    Alert.alert(t('cultoSemana.removerTitulo'), t('cultoSemana.removerTexto'), [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('cultoSemana.remover'), style: 'destructive', onPress: async () => {
          setOcupado('removendo');
          const { error } = await supabase.functions.invoke('youtube-culto', { body: { acao: 'remover', id: form.id } });
          setOcupado(null);
          await carregar();
          if (error) Alert.alert(t('cultoSemana.erroYoutube'), await erroDaFuncao(error));
        },
      },
    ]);
  };

  const onExcluir = () => {
    if (!form?.id) { setForm(null); return; }
    Alert.alert(t('cultoSemana.excluirTitulo'), t('cultoSemana.excluirTexto'), [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('cultoSemana.excluir'), style: 'destructive', onPress: async () => {
          const id = form.id!;
          await supabase.storage.from(BUCKET).remove([`thumbs/${id}.jpg`]);
          const { error } = await supabase.from('cultos_semana').delete().eq('id', id);
          if (error) { Alert.alert(t('common.erro'), error.message); return; }
          setForm(null);
          carregar();
        },
      },
    ]);
  };

  const enviarFoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const ext = (a.fileName?.split('.').pop() ?? a.uri.split('.').pop() ?? 'png').toLowerCase();
    const extensao = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : 'png';
    setOcupado('foto');
    try {
      const base64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
      const nome = (form?.pregador || 'pregador').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'pregador';
      const caminho = `${PASTA_FOTOS}/${nome}-${Date.now()}.${extensao}`;
      const contentType = extensao === 'png' ? 'image/png' : extensao === 'webp' ? 'image/webp' : 'image/jpeg';
      const { error } = await supabase.storage.from(BUCKET).upload(caminho, decode(base64), { contentType });
      if (error) throw error;
      setFotos(f => [...f, caminho]);
      set('foto_path')(caminho);
      if (extensao !== 'png') Alert.alert(t('common.atencao'), t('cultoSemana.fotoSemRecorte'));
    } catch (e: any) {
      Alert.alert(t('admin.erroAoEnviarImagem'), e?.message ?? '');
    }
    setOcupado(null);
  };

  if (carregando && !cultos.length) {
    return <ActivityIndicator color={C.purple} style={{ marginTop: 40 }} />;
  }

  // ─── Lista ────────────────────────────────────────────────────────────────
  if (!form) {
    const cartao = (c: Culto) => {
      const tipo = TIPOS_CULTO.find(x => x.id === c.tipo);
      return (
        <TouchableOpacity key={c.id} style={[st.cartao, { borderColor: C.border }]} onPress={() => editar(c)}>
          {c.thumb_path ? (
            <Image source={{ uri: `${urlPublica(c.thumb_path)}?v=${encodeURIComponent(c.youtube_publicado_em ?? c.id)}` }} style={st.cartaoThumb} />
          ) : (
            <View style={[st.cartaoThumb, { backgroundColor: tipo?.cor ?? C.primary }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[st.cartaoData, { color: tipo?.cor ?? C.purple }]}>{isoParaDataBR(c.data)} · {c.hora.slice(0, 5)} · {tipo?.nome}</Text>
            <Text style={[st.cartaoTema, { color: C.text }]} numberOfLines={2}>{c.tema.replace(/\n/g, ' ')}</Text>
            <View style={st.linha}>
              <Ionicons name={c.youtube_id ? 'logo-youtube' : 'document-outline'} size={13} color={c.youtube_id ? '#e11d48' : C.textDim} />
              <Text style={[st.cartaoStatus, { color: c.youtube_erro ? '#b45309' : C.textMuted }]}>
                {c.youtube_id ? (c.youtube_erro ? t('cultoSemana.statusComAviso') : t('cultoSemana.statusNoYoutube')) : t('cultoSemana.statusRascunho')}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.textDim} />
        </TouchableOpacity>
      );
    };
    return (
      <View>
        <Text style={[st.intro, { color: C.textMuted }]}>{t('cultoSemana.intro')}</Text>
        <TouchableOpacity style={[st.botao, { backgroundColor: C.primary }]} onPress={() => setForm(formVazio())}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={st.botaoTexto}>{t('cultoSemana.novo')}</Text>
        </TouchableOpacity>
        <Text style={[st.secao, { color: C.textMuted }]}>{t('cultoSemana.proximos')}</Text>
        {proximos.length ? proximos.map(cartao) : <Text style={[st.vazio, { color: C.textDim }]}>{t('cultoSemana.nenhumProximo')}</Text>}
        {anteriores.length > 0 && (
          <>
            <Text style={[st.secao, { color: C.textMuted }]}>{t('cultoSemana.anteriores')}</Text>
            {anteriores.map(cartao)}
          </>
        )}
      </View>
    );
  }

  // ─── Formulário ───────────────────────────────────────────────────────────
  const campo = (rotulo: string, valor: string, onChange: (v: string) => void, extra?: Partial<React.ComponentProps<typeof TextInput>>) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={[st.rotulo, { color: C.textMuted }]}>{rotulo}</Text>
      <TextInput
        value={valor}
        onChangeText={onChange}
        placeholderTextColor={C.textDim}
        style={[st.input, { borderColor: C.border, color: C.text, backgroundColor: C.surface ?? '#fff' }]}
        {...extra}
      />
    </View>
  );

  const passou = atual ? atual.data < hoje : false;
  const noYoutube = !!atual?.youtube_id;

  return (
    <View>
      <TouchableOpacity style={st.voltar} onPress={() => { setForm(null); carregar(); }}>
        <Ionicons name="chevron-back" size={18} color={C.purple} />
        <Text style={{ color: C.purple, fontWeight: '700' }}>{t('cultoSemana.voltar')}</Text>
      </TouchableOpacity>

      {dadosThumb && (
        <ThumbCultoView ref={thumbRef} dados={dadosThumb} onFotoFalhou={() => Alert.alert(t('common.atencao'), t('cultoSemana.fotoNaoCarregou'))} />
      )}
      <Text style={[st.dica, { color: C.textDim }]}>{t('cultoSemana.dicaThumb')}</Text>

      {noYoutube && (
        <View style={[st.status, { borderColor: atual?.youtube_erro ? '#f59e0b' : C.border }]}>
          <Ionicons name="logo-youtube" size={16} color="#e11d48" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '700' }}>{t('cultoSemana.agendadoNoYoutube')}</Text>
            {!!atual?.youtube_erro && <Text style={{ color: '#b45309', fontSize: 12, marginTop: 2 }}>⚠️ {atual.youtube_erro}</Text>}
          </View>
          <TouchableOpacity onPress={() => Linking.openURL(`https://youtu.be/${atual!.youtube_id}`)}>
            <Text style={{ color: C.purple, fontWeight: '700' }}>{t('cultoSemana.abrir')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={[st.rotulo, { color: C.textMuted }]}>{t('cultoSemana.tipo')}</Text>
      <View style={st.chips}>
        {TIPOS_CULTO.map(tp => (
          <TouchableOpacity
            key={tp.id}
            onPress={() => set('tipo')(tp.id)}
            style={[st.chip, { borderColor: form.tipo === tp.id ? tp.cor : C.border, backgroundColor: form.tipo === tp.id ? tp.cor : 'transparent' }]}
          >
            <Text style={{ color: form.tipo === tp.id ? '#fff' : C.text, fontWeight: '600', fontSize: 13 }}>{tp.nome}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={st.linhaCampos}>
        <View style={{ flex: 1.4 }}>{campo(t('cultoSemana.data'), form.data, v => set('data')(mascaraDataBR(v)), { keyboardType: 'number-pad', placeholder: 'DD/MM/AAAA', maxLength: 10 })}</View>
        <View style={{ flex: 1 }}>{campo(t('cultoSemana.hora'), form.hora, v => set('hora')(mascaraHora(v)), { keyboardType: 'number-pad', placeholder: '18:00', maxLength: 5 })}</View>
      </View>

      {campo(t('cultoSemana.tema'), form.tema, set('tema'), { placeholder: t('cultoSemana.temaExemplo'), multiline: true, maxLength: 80 })}
      {campo(t('cultoSemana.subtitulo'), form.subtitulo, set('subtitulo'), { placeholder: t('cultoSemana.subtituloExemplo'), maxLength: 60 })}
      {campo(t('cultoSemana.referencia'), form.referencia, set('referencia'), { placeholder: 'Isaías 54:1-5', maxLength: 40 })}
      {campo(t('cultoSemana.pregador'), form.pregador, set('pregador'), { maxLength: 40 })}

      <Text style={[st.rotulo, { color: C.textMuted }]}>{t('cultoSemana.foto')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
        <TouchableOpacity
          onPress={() => set('foto_path')(null)}
          style={[st.foto, { borderColor: form.foto_path === null ? C.purple : C.border }]}
        >
          <Ionicons name="close-circle-outline" size={22} color={C.textDim} />
          <Text style={{ color: C.textDim, fontSize: 11 }}>{t('cultoSemana.semFoto')}</Text>
        </TouchableOpacity>
        {fotos.map(p => (
          <TouchableOpacity key={p} onPress={() => set('foto_path')(p)} style={[st.foto, { borderColor: form.foto_path === p ? C.purple : C.border }]}>
            <Image source={{ uri: urlPublica(p)! }} style={st.fotoImg} resizeMode="contain" />
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={enviarFoto} style={[st.foto, { borderColor: C.border, borderStyle: 'dashed' }]} disabled={!!ocupado}>
          {ocupado === 'foto' ? <ActivityIndicator color={C.purple} /> : <Ionicons name="cloud-upload-outline" size={22} color={C.purple} />}
          <Text style={{ color: C.purple, fontSize: 11 }}>{t('cultoSemana.enviarFoto')}</Text>
        </TouchableOpacity>
      </ScrollView>
      <Text style={[st.dica, { color: C.textDim }]}>{t('cultoSemana.dicaFoto')}</Text>

      {campo(t('cultoSemana.observacao'), form.observacao, set('observacao'), { placeholder: t('cultoSemana.observacaoExemplo'), multiline: true, maxLength: 1500, style: [st.input, st.inputAlto, { borderColor: C.border, color: C.text, backgroundColor: C.surface ?? '#fff' }] })}

      {passou ? (
        <Text style={[st.dica, { color: C.textMuted, textAlign: 'center', marginVertical: 8 }]}>{t('cultoSemana.jaPassou')}</Text>
      ) : (
        <TouchableOpacity style={[st.botao, { backgroundColor: '#e11d48' }]} onPress={onPublicar} disabled={!!ocupado}>
          {ocupado === 'publicando' ? <ActivityIndicator color="#fff" /> : <Ionicons name="logo-youtube" size={18} color="#fff" />}
          <Text style={st.botaoTexto}>{noYoutube ? t('cultoSemana.atualizarYoutube') : t('cultoSemana.publicarYoutube')}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[st.botao, st.botaoSec, { borderColor: C.border }]} onPress={onSalvar} disabled={!!ocupado}>
        {ocupado === 'salvando' ? <ActivityIndicator color={C.purple} /> : <Ionicons name="save-outline" size={18} color={C.purple} />}
        <Text style={[st.botaoTexto, { color: C.purple }]}>{t('cultoSemana.salvarRascunho')}</Text>
      </TouchableOpacity>

      {noYoutube && !passou && (
        <TouchableOpacity style={st.linkPerigo} onPress={onRemover} disabled={!!ocupado}>
          {ocupado === 'removendo' ? <ActivityIndicator color={C.danger} /> : <Text style={{ color: C.danger, fontWeight: '600' }}>{t('cultoSemana.removerDoYoutube')}</Text>}
        </TouchableOpacity>
      )}
      {!noYoutube && (
        <TouchableOpacity style={st.linkPerigo} onPress={onExcluir} disabled={!!ocupado}>
          <Text style={{ color: C.danger, fontWeight: '600' }}>{form.id ? t('cultoSemana.excluir') : t('common.cancelar')}</Text>
        </TouchableOpacity>
      )}
      <View style={{ height: Platform.OS === 'ios' ? 40 : 24 }} />
    </View>
  );
}

const st = StyleSheet.create({
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  secao: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  vazio: { fontSize: 13, marginBottom: 8 },
  cartao: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 8, marginBottom: 8, backgroundColor: '#fff' },
  cartaoThumb: { width: 96, height: 54, borderRadius: 6 },
  cartaoData: { fontSize: 11, fontWeight: '800' },
  cartaoTema: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  cartaoStatus: { fontSize: 12 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10 },
  dica: { fontSize: 12, lineHeight: 17, marginTop: 6, marginBottom: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12, backgroundColor: '#fff' },
  rotulo: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  inputAlto: { minHeight: 80, textAlignVertical: 'top' },
  linhaCampos: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  foto: { width: 72, height: 88, borderWidth: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1740', gap: 2 },
  fotoImg: { width: 64, height: 80 },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, marginTop: 8 },
  botaoSec: { backgroundColor: 'transparent', borderWidth: 1 },
  botaoTexto: { color: '#fff', fontWeight: '800', fontSize: 15 },
  linkPerigo: { alignItems: 'center', paddingVertical: 14 },
});
