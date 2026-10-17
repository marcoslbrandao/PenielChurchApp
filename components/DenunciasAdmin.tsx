// components/DenunciasAdmin.tsx
//
// Painel Admin → aba "Denúncias" (17/10/2026).
//
// A fila dos três chats (Igreja, grupos, Banda): cada mensagem denunciada
// aparece uma vez, com quantas pessoas denunciaram e o motivo. O Admin pode:
//   • Apagar a mensagem   (some do chat para todos)
//   • Suspender o autor   (não escreve em nenhum chat até ser liberado)
//   • Manter              (fecha a denúncia sem apagar)
// Embaixo, quem está suspenso, com "Liberar".
//
// A Apple (diretriz 1.2) pede "resposta rápida" às denúncias: o push
// "🚩 Denúncia no chat" chega aos admins na hora e abre esta aba.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { alternarSuspensao } from '../lib/moderacao';

type Denuncia = {
  id: string;
  chat: 'geral' | 'grupo' | 'banda';
  grupo: string | null;
  mensagem_id: string;
  autor_id: string | null;
  autor_nome: string | null;
  texto: string | null;
  midia_path: string | null;
  motivo: string | null;
  status: 'aberta' | 'resolvida';
  resolucao: string | null;
  created_at: string;
};

type Grupo = { chave: string; primeira: Denuncia; total: number; motivos: string[]; ultima: string };
type Suspenso = { user_id: string; nome: string; desde: string };

const TABELA: Record<Denuncia['chat'], string> = {
  geral: 'chat_geral_mensagens',
  grupo: 'grupo_chat_mensagens',
  banda: 'banda_chat_mensagens',
};

function dataHora(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function DenunciasAdmin({ C, onMudou }: {
  C: { text: string; textMuted: string; textDim: string; surface?: string; card?: string; border: string; primary: string; purple: string; danger: string };
  /** Avisa o AdminScreen para atualizar o pontinho da aba. */
  onMudou?: (abertas: number) => void;
}) {
  const { t } = useTranslation();
  const [denuncias, setDenuncias] = useState<Denuncia[]>([]);
  const [suspensos, setSuspensos] = useState<Suspenso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarResolvidas, setMostrarResolvidas] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [d, s] = await Promise.all([
      supabase.from('chat_denuncias').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.rpc('chat_suspensos'),
    ]);
    const lista = (d.data ?? []) as Denuncia[];
    setDenuncias(lista);
    setSuspensos((s.data ?? []) as Suspenso[]);
    setCarregando(false);
    onMudou?.(new Set(lista.filter(x => x.status === 'aberta').map(x => `${x.chat}:${x.mensagem_id}`)).size);
  }, [onMudou]);

  useEffect(() => { carregar(); }, [carregar]);

  // Uma linha por mensagem denunciada.
  const grupos = useMemo(() => {
    const mapa = new Map<string, Grupo>();
    for (const d of denuncias) {
      if ((d.status === 'aberta') === mostrarResolvidas) continue;
      const chave = `${d.chat}:${d.mensagem_id}`;
      const g = mapa.get(chave);
      if (g) {
        g.total++;
        if (d.motivo && !g.motivos.includes(d.motivo)) g.motivos.push(d.motivo);
      } else {
        mapa.set(chave, { chave, primeira: d, total: 1, motivos: d.motivo ? [d.motivo] : [], ultima: d.created_at });
      }
    }
    return [...mapa.values()];
  }, [denuncias, mostrarResolvidas]);

  const resolver = async (g: Grupo, resolucao: 'apagada' | 'mantida' | 'suspenso') => {
    const { error } = await supabase.from('chat_denuncias')
      .update({ status: 'resolvida', resolucao, resolvida_em: new Date().toISOString() })
      .eq('chat', g.primeira.chat).eq('mensagem_id', g.primeira.mensagem_id).eq('status', 'aberta');
    if (error) { Alert.alert(t('common.erro'), error.message); return; }
    carregar();
  };

  const apagar = (g: Grupo) => {
    Alert.alert(t('moderacao.adminApagarTitulo'), t('moderacao.adminApagarTexto'), [
      { text: t('common.cancelar'), style: 'cancel' },
      {
        text: t('moderacao.apagar'), style: 'destructive', onPress: async () => {
          // Se a mensagem já tinha sumido (autor apagou, ou passou dos 15
          // dias), apagar zero linhas é normal: só fecha a denúncia.
          const { error } = await supabase.from(TABELA[g.primeira.chat]).delete().eq('id', g.primeira.mensagem_id);
          if (error) { Alert.alert(t('common.erro'), error.message); return; }
          resolver(g, 'apagada');
        },
      },
    ]);
  };

  const suspender = (g: Grupo) => {
    const autor = g.primeira.autor_id;
    if (!autor) return;
    alternarSuspensao(autor, g.primeira.autor_nome ?? '', false, t, () => resolver(g, 'suspenso'));
  };

  const onde = (d: Denuncia) =>
    d.chat === 'geral' ? t('moderacao.ondeIgreja')
      : d.chat === 'banda' ? t('moderacao.ondeBanda')
        : t('moderacao.ondeGrupo', { grupo: d.grupo ?? '' });

  const motivoTexto = (m: string) => (m === 'ofensivo' ? t('moderacao.motivoOfensivo') : t('moderacao.motivoOutro'));

  if (carregando) return <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} />;

  const fundoCartao = C.card ?? C.surface ?? 'transparent';

  return (
    <View>
      <Text style={[st.ajuda, { color: C.textMuted }]}>{t('moderacao.adminAjuda')}</Text>

      <View style={st.filtros}>
        {[false, true].map(res => (
          <TouchableOpacity
            key={String(res)}
            onPress={() => setMostrarResolvidas(res)}
            style={[st.filtro, { borderColor: C.border }, mostrarResolvidas === res && { backgroundColor: C.purple, borderColor: C.purple }]}
          >
            <Text style={[st.filtroTexto, { color: mostrarResolvidas === res ? '#fff' : C.text }]}>
              {res ? t('moderacao.adminResolvidas') : t('moderacao.adminAbertas')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {grupos.length === 0 ? (
        <View style={st.vazio}>
          <Ionicons name="shield-checkmark-outline" size={40} color={C.textDim} />
          <Text style={[st.vazioTexto, { color: C.textMuted }]}>
            {mostrarResolvidas ? t('moderacao.adminNenhumaResolvida') : t('moderacao.adminNenhumaAberta')}
          </Text>
        </View>
      ) : grupos.map(g => (
        <View key={g.chave} style={[st.cartao, { backgroundColor: fundoCartao, borderColor: C.border }]}>
          <View style={st.cartaoTopo}>
            <Ionicons name="flag" size={14} color={C.danger} />
            <Text style={[st.onde, { color: C.danger }]}>{onde(g.primeira)}</Text>
            <Text style={[st.data, { color: C.textDim }]}>{dataHora(g.ultima)}</Text>
          </View>
          <Text style={[st.autor, { color: C.text }]}>{g.primeira.autor_nome ?? '—'}</Text>
          <Text style={[st.texto, { color: C.text }]}>
            {g.primeira.midia_path ? '📎 ' : ''}{g.primeira.texto || t('moderacao.adminSemTexto')}
          </Text>
          <Text style={[st.meta, { color: C.textMuted }]}>
            {t('moderacao.adminQuantas', { count: g.total })}
            {g.motivos.length ? ` · ${g.motivos.map(motivoTexto).join(', ')}` : ''}
            {g.primeira.resolucao ? ` · ${t(`moderacao.resolucao_${g.primeira.resolucao}`)}` : ''}
          </Text>

          {!mostrarResolvidas && (
            <View style={st.acoes}>
              <TouchableOpacity style={[st.acao, { borderColor: C.danger }]} onPress={() => apagar(g)}>
                <Ionicons name="trash-outline" size={15} color={C.danger} />
                <Text style={[st.acaoTexto, { color: C.danger }]}>{t('moderacao.apagar')}</Text>
              </TouchableOpacity>
              {!!g.primeira.autor_id && (
                <TouchableOpacity style={[st.acao, { borderColor: C.border }]} onPress={() => suspender(g)}>
                  <Ionicons name="volume-mute-outline" size={15} color={C.text} />
                  <Text style={[st.acaoTexto, { color: C.text }]}>{t('moderacao.suspender')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[st.acao, { borderColor: C.border }]} onPress={() => resolver(g, 'mantida')}>
                <Ionicons name="checkmark" size={15} color={C.text} />
                <Text style={[st.acaoTexto, { color: C.text }]}>{t('moderacao.manter')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      <Text style={[st.secao, { color: C.text }]}>{t('moderacao.adminSuspensos')}</Text>
      {suspensos.length === 0 ? (
        <Text style={[st.ajuda, { color: C.textMuted }]}>{t('moderacao.adminNinguemSuspenso')}</Text>
      ) : suspensos.map(s => (
        <View key={s.user_id} style={[st.suspenso, { backgroundColor: fundoCartao, borderColor: C.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[st.autor, { color: C.text }]}>{s.nome}</Text>
            <Text style={[st.meta, { color: C.textMuted }]}>{t('moderacao.adminDesde', { data: dataHora(s.desde) })}</Text>
          </View>
          <TouchableOpacity
            style={[st.acao, { borderColor: C.purple }]}
            onPress={() => alternarSuspensao(s.user_id, s.nome, true, t, carregar)}
          >
            <Text style={[st.acaoTexto, { color: C.purple }]}>{t('moderacao.liberar')}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  ajuda: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  filtros: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filtro: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  filtroTexto: { fontSize: 13, fontWeight: '700' },
  vazio: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  vazioTexto: { fontSize: 13, textAlign: 'center' },
  cartao: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  cartaoTopo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  onde: { fontSize: 12, fontWeight: '800', flex: 1 },
  data: { fontSize: 11 },
  autor: { fontSize: 14, fontWeight: '800' },
  texto: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  meta: { fontSize: 12, marginTop: 6 },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  acao: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  acaoTexto: { fontSize: 13, fontWeight: '700' },
  secao: { fontSize: 15, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  suspenso: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
});
