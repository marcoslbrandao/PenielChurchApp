import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

// Chamada de um encontro — ferramenta de LÍDER, e por isso em português,
// igual ao GrupoAdminModal ao lado. O que a turma inteira vê (a aula, as
// perguntas, as anotações) passa por t() nos quatro idiomas; o painel de
// quem lidera segue o padrão que já existe aqui.

export type Status = 'presente' | 'justificado' | 'ausente';

type Participante = { id: string; membro_id: string; nome: string; sobrenome: string };
type Marca = { status: Status; motivo: string };

function paletaChamada(isDark: boolean) {
  return isDark ? {
    bg: '#1C1940', text: '#F1EFFA', textMuted: '#A69FD6', border: '#332D5C',
    inputBg: '#241F4D', placeholder: '#726A99', linhaBg: '#241F4D',
  } : {
    bg: '#FFFFFF', text: '#1A1A2E', textMuted: '#6B7280', border: '#E5E0D8',
    inputBg: '#F7F4EE', placeholder: '#9CA3AF', linhaBg: '#FAF8F4',
  };
}
type PaletaChamada = ReturnType<typeof paletaChamada>;

const CORES: Record<Status, string> = {
  presente: '#0E9F6E',
  justificado: '#C27803',
  ausente: '#E02424',
};
const ROTULOS: Record<Status, string> = {
  presente: 'Presente',
  justificado: 'Justificada',
  ausente: 'Faltou',
};
const ICONES: Record<Status, keyof typeof Ionicons.glyphMap> = {
  presente: 'checkmark-circle',
  justificado: 'alert-circle',
  ausente: 'close-circle',
};

function dataPorExtenso(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  const texto = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function ChamadaModal({
  visible, evento, grupo, cor, onClose, onSaved,
}: {
  visible: boolean;
  evento: { id: string; titulo: string; dataISO: string } | null;
  grupo: string;
  cor: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [marcas, setMarcas] = useState<Record<string, Marca>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jaTinhaChamada, setJaTinhaChamada] = useState(false);

  const { isDark } = useTheme();
  const C = useMemo(() => paletaChamada(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const carregar = useCallback(async () => {
    if (!evento) return;
    setLoading(true);
    const [{ data: lista }, { data: presencas }] = await Promise.all([
      supabase.rpc('participantes_do_grupo', { p_grupo: grupo }),
      supabase.from('grupo_presenca').select('membro_id, status, motivo').eq('evento_id', evento.id),
    ]);

    setParticipantes((lista ?? []) as Participante[]);

    const iniciais: Record<string, Marca> = {};
    (presencas ?? []).forEach((p: any) => {
      iniciais[p.membro_id] = { status: p.status as Status, motivo: p.motivo ?? '' };
    });
    setMarcas(iniciais);
    setJaTinhaChamada((presencas ?? []).length > 0);
    setLoading(false);
  }, [evento?.id, grupo]);

  useEffect(() => {
    if (!visible) { setParticipantes([]); setMarcas({}); setJaTinhaChamada(false); setLoading(true); return; }
    carregar();
  }, [visible, carregar]);

  const marcar = (membroId: string, status: Status) => {
    setMarcas(atual => {
      const anterior = atual[membroId];
      // Tocar de novo no que já está marcado desmarca — mesmo gesto da barra
      // de presença da Banda, e é como se corrige um toque errado.
      if (anterior?.status === status) {
        const copia = { ...atual };
        delete copia[membroId];
        return copia;
      }
      return { ...atual, [membroId]: { status, motivo: status === 'justificado' ? (anterior?.motivo ?? '') : '' } };
    });
  };

  const escreverMotivo = (membroId: string, motivo: string) => {
    setMarcas(atual => ({ ...atual, [membroId]: { status: atual[membroId]?.status ?? 'justificado', motivo } }));
  };

  const todosPresentes = () => {
    const novo: Record<string, Marca> = {};
    participantes.forEach(p => { novo[p.membro_id] = { status: 'presente', motivo: '' }; });
    setMarcas(novo);
  };

  const contagem = useMemo(() => {
    const c = { presente: 0, justificado: 0, ausente: 0 };
    participantes.forEach(p => {
      const m = marcas[p.membro_id];
      if (m) c[m.status] += 1;
    });
    return c;
  }, [participantes, marcas]);

  const faltamMarcar = participantes.length - (contagem.presente + contagem.justificado + contagem.ausente);

  const salvar = async () => {
    if (!evento) return;
    if (participantes.length === 0) {
      Alert.alert('Turma vazia', 'Este grupo ainda não tem participantes. Adicione a turma em Participantes antes de fazer a chamada.');
      return;
    }
    if (faltamMarcar > 0) {
      Alert.alert(
        'Falta gente na chamada',
        `${faltamMarcar} ${faltamMarcar === 1 ? 'pessoa ainda não foi marcada' : 'pessoas ainda não foram marcadas'}. Marque todo mundo — o relatório precisa saber a diferença entre "faltou" e "o líder não chegou a marcar".`,
      );
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const linhas = participantes.map(p => ({
      evento_id: evento.id,
      membro_id: p.membro_id,
      status: marcas[p.membro_id].status,
      motivo: marcas[p.membro_id].status === 'justificado'
        ? (marcas[p.membro_id].motivo.trim() || null)
        : null,
      registrado_por: user?.id ?? null,
    }));

    const { error } = await supabase
      .from('grupo_presenca')
      .upsert(linhas, { onConflict: 'evento_id,membro_id' });

    if (error) { setSaving(false); Alert.alert('Erro', error.message); return; }

    // Carimbo do encontro: é ele que tira a aula da lista de "chamada
    // pendente" e é ele que entra no denominador do relatório. Uma aula sem
    // chamada não pode contar como falta para a turma inteira.
    const { error: carimboError } = await supabase
      .from('grupo_eventos')
      .update({ chamada_feita_em: new Date().toISOString() })
      .eq('id', evento.id);

    setSaving(false);
    if (carimboError) { Alert.alert('Erro', carimboError.message); return; }

    Alert.alert(
      'Chamada salva',
      `${contagem.presente} ${contagem.presente === 1 ? 'presente' : 'presentes'} · ${contagem.justificado} ${contagem.justificado === 1 ? 'justificada' : 'justificadas'} · ${contagem.ausente} ${contagem.ausente === 1 ? 'falta' : 'faltas'}.`,
    );
    onSaved?.();
    onClose();
  };

  if (!evento) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '92%' }}>
          <View style={s.sheet}>
            <View style={s.header}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={s.title}>Chamada</Text>
                <Text style={s.subtitle}>{evento.titulo} · {dataPorExtenso(evento.dataISO)}</Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator color={cor} style={{ marginVertical: 40 }} />
            ) : participantes.length === 0 ? (
              <View style={s.vazio}>
                <Ionicons name="people-outline" size={28} color={C.textMuted} />
                <Text style={s.vazioTexto}>
                  Nenhum participante neste grupo ainda. Adicione a turma pelo botão de pessoas no topo da aba.
                </Text>
              </View>
            ) : (
              <>
                <View style={s.resumoBar}>
                  <View style={s.resumoNumeros}>
                    {(['presente', 'justificado', 'ausente'] as Status[]).map(st => (
                      <View key={st} style={s.resumoItem}>
                        <Ionicons name={ICONES[st]} size={14} color={CORES[st]} />
                        <Text style={[s.resumoTexto, { color: CORES[st] }]}>{contagem[st]}</Text>
                      </View>
                    ))}
                    {faltamMarcar > 0 && (
                      <Text style={s.resumoPendente}>· {faltamMarcar} sem marcar</Text>
                    )}
                  </View>
                  <TouchableOpacity style={[s.atalho, { borderColor: cor }]} onPress={todosPresentes}>
                    <Ionicons name="checkmark-done" size={14} color={cor} />
                    <Text style={[s.atalhoTexto, { color: cor }]}>Todos presentes</Text>
                  </TouchableOpacity>
                </View>

                {jaTinhaChamada && (
                  <Text style={s.hint}>
                    Esta aula já tinha chamada — o que você mudar aqui substitui o que estava salvo.
                  </Text>
                )}

                <ScrollView style={{ marginTop: 6 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {participantes.map(p => {
                    const m = marcas[p.membro_id];
                    return (
                      <View key={p.membro_id} style={s.linha}>
                        <Text style={s.nome} numberOfLines={1}>{p.nome} {p.sobrenome}</Text>
                        <View style={s.botoes}>
                          {(['presente', 'justificado', 'ausente'] as Status[]).map(st => {
                            const ativo = m?.status === st;
                            return (
                              <TouchableOpacity
                                key={st}
                                style={[s.botao, ativo && { backgroundColor: CORES[st] + '1F', borderColor: CORES[st] }]}
                                onPress={() => marcar(p.membro_id, st)}
                              >
                                <Ionicons
                                  name={ICONES[st]}
                                  size={16}
                                  color={ativo ? CORES[st] : C.textMuted}
                                />
                                <Text style={[s.botaoTexto, ativo && { color: CORES[st], fontWeight: '700' }]}>
                                  {ROTULOS[st]}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        {m?.status === 'justificado' && (
                          <TextInput
                            style={s.motivo}
                            placeholder="Motivo (opcional) — ex: viagem de trabalho"
                            placeholderTextColor={C.placeholder}
                            value={m.motivo}
                            onChangeText={txt => escreverMotivo(p.membro_id, txt)}
                            maxLength={200}
                          />
                        )}
                      </View>
                    );
                  })}
                  <View style={{ height: 14 }} />
                </ScrollView>

                <TouchableOpacity
                  style={[s.saveBtn, { backgroundColor: cor }, saving && { opacity: 0.7 }]}
                  onPress={salvar}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="save-outline" size={18} color="#fff" />
                      <Text style={s.saveBtnText}>Salvar chamada</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function buildStyles(C: PaletaChamada) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 26 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 11, color: C.textMuted, marginTop: 3 },
  resumoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border },
  resumoNumeros: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  resumoItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  resumoTexto: { fontSize: 13, fontWeight: '800' },
  resumoPendente: { fontSize: 11, color: C.textMuted, flexShrink: 1 },
  atalho: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  atalhoTexto: { fontSize: 11, fontWeight: '700' },
  hint: { fontSize: 11, color: C.textMuted, marginTop: 8, lineHeight: 16 },
  linha: { backgroundColor: C.linhaBg, borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  nome: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 },
  botoes: { flexDirection: 'row', gap: 6 },
  botao: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 8, backgroundColor: C.inputBg },
  botaoTexto: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  motivo: { marginTop: 8, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: C.text, backgroundColor: C.inputBg },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 10 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  vazio: { alignItems: 'center', gap: 10, paddingVertical: 34, paddingHorizontal: 20 },
  vazioTexto: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
}); }
