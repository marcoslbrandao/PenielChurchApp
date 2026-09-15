import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, Share, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { montarFrequencia, percentual } from '../lib/frequencia';
import type { StatusPresenca, PessoaFrequencia } from '../lib/frequencia';

// Relatório de frequência do grupo no período — ferramenta de LÍDER, em
// português, pelo mesmo motivo do ChamadaModal.
//
// O DENOMINADOR SÃO AS AULAS COM CHAMADA FEITA, não todos os encontros do
// período. Um encontro que o líder esqueceu de chamar não pode virar falta
// para a turma inteira, e "12 de 15" com três aulas fantasma é um número
// falso que ninguém consegue auditar depois.

type Status = StatusPresenca;

type Encontro = { id: string; titulo: string; data: string; chamada_feita_em: string | null };
type LinhaRPC = { evento_id: string; data: string; membro_id: string; nome: string; sobrenome: string; status: Status; motivo: string | null };

const CORES: Record<Status, string> = { presente: '#0E9F6E', justificado: '#C27803', ausente: '#E02424' };

function paletaFreq(isDark: boolean) {
  return isDark ? {
    bg: '#1C1940', text: '#F1EFFA', textMuted: '#A69FD6', border: '#332D5C',
    inputBg: '#241F4D', placeholder: '#726A99', linhaBg: '#241F4D', vazioDot: '#3A3466',
  } : {
    bg: '#FFFFFF', text: '#1A1A2E', textMuted: '#6B7280', border: '#E5E0D8',
    inputBg: '#F7F4EE', placeholder: '#9CA3AF', linhaBg: '#FAF8F4', vazioDot: '#DEDAD2',
  };
}
type PaletaFreq = ReturnType<typeof paletaFreq>;

function isoParaBR(iso: string) {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
function brParaISO(br: string): string {
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, d, mes, a] = m;
  const iso = `${a}-${mes}-${d}`;
  const teste = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(teste.getTime())) return '';
  if (teste.getUTCDate() !== Number(d) || teste.getUTCMonth() + 1 !== Number(mes)) return '';
  return iso;
}
function diaMes(iso: string) { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }

/** 1º semestre = Jan–Jun; 2º = Jul–Dez. É como a igreja conta o calendário. */
function semestreAtual() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  return hoje.getMonth() < 6
    ? { inicio: `${ano}-01-01`, fim: `${ano}-06-30`, rotulo: `1º semestre de ${ano}` }
    : { inicio: `${ano}-07-01`, fim: `${ano}-12-31`, rotulo: `2º semestre de ${ano}` };
}
function semestreAnterior() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  return hoje.getMonth() < 6
    ? { inicio: `${ano - 1}-07-01`, fim: `${ano - 1}-12-31`, rotulo: `2º semestre de ${ano - 1}` }
    : { inicio: `${ano}-01-01`, fim: `${ano}-06-30`, rotulo: `1º semestre de ${ano}` };
}

export default function FrequenciaModal({
  visible, grupo, grupoNome, cor, onClose,
}: {
  visible: boolean;
  grupo: string;
  grupoNome: string;
  cor: string;
  onClose: () => void;
}) {
  const [inicio, setInicio] = useState(semestreAtual().inicio);
  const [fim, setFim] = useState(semestreAtual().fim);
  const [inicioTexto, setInicioTexto] = useState(isoParaBR(semestreAtual().inicio));
  const [fimTexto, setFimTexto] = useState(isoParaBR(semestreAtual().fim));
  const [encontros, setEncontros] = useState<Encontro[]>([]);
  const [linhas, setLinhas] = useState<LinhaRPC[]>([]);
  const [turma, setTurma] = useState<{ membro_id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);

  const { isDark } = useTheme();
  const C = useMemo(() => paletaFreq(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: eventosData }, { data: freqData }, { data: turmaData }] = await Promise.all([
      supabase.from('grupo_eventos')
        .select('id, titulo, data, chamada_feita_em')
        .eq('grupo', grupo).gte('data', inicio).lte('data', fim)
        .order('data', { ascending: true }),
      supabase.rpc('frequencia_do_grupo', { p_grupo: grupo, p_inicio: inicio, p_fim: fim }),
      supabase.rpc('participantes_do_grupo', { p_grupo: grupo }),
    ]);
    setEncontros((eventosData ?? []) as Encontro[]);
    setLinhas((freqData ?? []) as LinhaRPC[]);
    setTurma(((turmaData ?? []) as any[]).map(p => ({ membro_id: p.membro_id, nome: `${p.nome} ${p.sobrenome}` })));
    setLoading(false);
  }, [grupo, inicio, fim]);

  useEffect(() => { if (visible) carregar(); }, [visible, carregar]);

  // Só as aulas com chamada entram na conta — ver o comentário do topo.
  const aulas = useMemo(
    () => encontros.filter(e => e.chamada_feita_em),
    [encontros],
  );
  // Aula que ainda não aconteceu não é "chamada esquecida" — o período pode
  // ir até dezembro e ter metade das aulas no futuro. Só cobramos chamada do
  // que já passou.
  const hojeISO = new Date().toISOString().slice(0, 10);
  const semChamada = encontros.filter(e => !e.chamada_feita_em && e.data <= hojeISO).length;

  // A conta mora em lib/frequencia.ts: é a parte que erra em silêncio (um
  // denominador trocado devolve um número plausível e falso), e lá ela roda em
  // node sem React Native e tem teste.
  const { pessoas, mediaTurma } = useMemo(
    () => montarFrequencia(turma, linhas, aulas),
    [turma, linhas, aulas],
  );

  const emRisco = pessoas.filter(p => p.faltasSeguidas >= 3);

  const aplicarPeriodo = () => {
    const i = brParaISO(inicioTexto);
    const f = brParaISO(fimTexto);
    if (!i || !f) { Alert.alert('Atenção', 'As datas precisam estar no formato DD/MM/AAAA.'); return; }
    if (i > f) { Alert.alert('Atenção', 'A data inicial é depois da final.'); return; }
    setInicio(i); setFim(f);
  };

  const usarPreset = (p: { inicio: string; fim: string }) => {
    setInicio(p.inicio); setFim(p.fim);
    setInicioTexto(isoParaBR(p.inicio)); setFimTexto(isoParaBR(p.fim));
  };

  const exportar = async () => {
    if (aulas.length === 0) { Alert.alert('Nada a exportar', 'Nenhuma aula com chamada feita neste período.'); return; }
    const sep = ';'; // ponto e vírgula: é o que o Excel em português abre sem perguntar nada
    const cabecalho = ['Nome', ...aulas.map(a => diaMes(a.data)), 'Presencas', 'Justificadas', 'Faltas', 'Aulas', 'Frequencia'];
    const corpo = pessoas.map(p => [
      p.nome + (p.naTurma ? '' : ' (saiu do grupo)'),
      ...aulas.map(a => {
        const st = p.porStatus[a.id];
        // '-' é "não estava na turma nesse dia", e por isso essa aula não
        // entra nem na coluna Aulas nem no percentual.
        return st === 'presente' ? 'P' : st === 'justificado' ? 'J' : st === 'ausente' ? 'F' : '-';
      }),
      String(p.presentes), String(p.justificados), String(p.ausentes), String(p.consideradas),
      percentual(p) === null ? '-' : `${percentual(p)}%`,
    ]);
    const csv = [cabecalho, ...corpo].map(l => l.join(sep)).join('\n');
    try {
      // Share.share com texto: funciona em iOS e Android sem módulo nativo
      // novo, então entra por OTA. Colar no Numbers/Excel abre como planilha.
      await Share.share({
        message: `Frequência · ${grupoNome} · ${isoParaBR(inicio)} a ${isoParaBR(fim)}\n\n${csv}`,
        title: `Frequência ${grupoNome}`,
      });
    } catch { /* o usuário cancelou o compartilhamento */ }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxHeight: '92%' }}>
          <View style={s.sheet}>
            <View style={s.header}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={s.title}>Frequência</Text>
                <Text style={s.subtitle}>{grupoNome}</Text>
              </View>
              <TouchableOpacity onPress={exportar} style={{ marginRight: 14 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="share-outline" size={20} color={cor} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.presets}>
                {[semestreAtual(), semestreAnterior()].map(p => {
                  const ativo = inicio === p.inicio && fim === p.fim;
                  return (
                    <TouchableOpacity
                      key={p.rotulo}
                      style={[s.preset, ativo && { backgroundColor: cor + '22', borderColor: cor }]}
                      onPress={() => usarPreset(p)}
                    >
                      <Text style={[s.presetTexto, ativo && { color: cor, fontWeight: '700' }]}>{p.rotulo}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={s.datasRow}>
                <TextInput
                  style={s.dataInput} value={inicioTexto} onChangeText={setInicioTexto}
                  placeholder="DD/MM/AAAA" placeholderTextColor={C.placeholder}
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={s.ate}>até</Text>
                <TextInput
                  style={s.dataInput} value={fimTexto} onChangeText={setFimTexto}
                  placeholder="DD/MM/AAAA" placeholderTextColor={C.placeholder}
                  keyboardType="numbers-and-punctuation"
                />
                <TouchableOpacity style={[s.aplicar, { backgroundColor: cor }]} onPress={aplicarPeriodo}>
                  <Ionicons name="search" size={15} color="#fff" />
                </TouchableOpacity>
              </View>

              {loading ? (
                <ActivityIndicator color={cor} style={{ marginVertical: 40 }} />
              ) : aulas.length === 0 ? (
                <View style={s.vazio}>
                  <Ionicons name="clipboard-outline" size={28} color={C.textMuted} />
                  <Text style={s.vazioTexto}>
                    Nenhuma aula com chamada feita neste período.
                    {semChamada > 0 ? ` Há ${semChamada} ${semChamada === 1 ? 'encontro' : 'encontros'} sem chamada — faça a chamada pelo card do encontro.` : ''}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={[s.resumoCard, { borderLeftColor: cor }]}>
                    <View style={s.resumoLinha}>
                      <Text style={s.resumoNumero}>{aulas.length}</Text>
                      <Text style={s.resumoLabel}>{aulas.length === 1 ? 'aula com chamada' : 'aulas com chamada'}</Text>
                    </View>
                    <View style={s.resumoLinha}>
                      <Text style={s.resumoNumero}>{pessoas.length}</Text>
                      <Text style={s.resumoLabel}>na turma</Text>
                    </View>
                    <View style={s.resumoLinha}>
                      <Text style={[s.resumoNumero, { color: cor }]}>{mediaTurma}%</Text>
                      <Text style={s.resumoLabel}>frequência média</Text>
                    </View>
                    {semChamada > 0 && (
                      <Text style={s.resumoAviso}>
                        {semChamada} {semChamada === 1 ? 'encontro ficou' : 'encontros ficaram'} sem chamada e {semChamada === 1 ? 'não entra' : 'não entram'} na conta.
                      </Text>
                    )}
                  </View>

                  {emRisco.length > 0 && (
                    <View style={s.alertaCard}>
                      <View style={s.alertaTop}>
                        <Ionicons name="heart-outline" size={16} color="#E02424" />
                        <Text style={s.alertaTitulo}>Vale uma ligação</Text>
                      </View>
                      {emRisco.map(p => (
                        <Text key={p.membro_id} style={s.alertaTexto}>
                          {p.nome} — {p.faltasSeguidas} aulas seguidas sem aparecer
                        </Text>
                      ))}
                    </View>
                  )}

                  {pessoas.map((p: PessoaFrequencia) => {
                    const pct = percentual(p);
                    const corPct = pct === null ? C.textMuted : pct >= 75 ? CORES.presente : pct >= 50 ? CORES.justificado : CORES.ausente;
                    const expandida = aberta === p.membro_id;
                    return (
                      <TouchableOpacity
                        key={p.membro_id}
                        style={s.pessoa}
                        activeOpacity={0.8}
                        onPress={() => setAberta(expandida ? null : p.membro_id)}
                      >
                        <View style={s.pessoaTop}>
                          <Text style={s.pessoaNome} numberOfLines={1}>
                            {p.nome}{p.naTurma ? '' : ' · saiu do grupo'}
                          </Text>
                          <Text style={[s.pessoaPct, { color: corPct }]}>{pct === null ? '—' : `${pct}%`}</Text>
                        </View>
                        <Text style={s.pessoaDetalhe}>
                          {pct === null ? 'entrou depois da última chamada' : `${p.presentes} de ${p.consideradas}`}
                          {p.justificados > 0 ? ` · ${p.justificados} ${p.justificados === 1 ? 'justificada' : 'justificadas'}` : ''}
                          {p.ausentes > 0 ? ` · ${p.ausentes} ${p.ausentes === 1 ? 'falta' : 'faltas'}` : ''}
                        </Text>
                        <View style={s.tira}>
                          {aulas.map(a => {
                            const st = p.porStatus[a.id];
                            return (
                              <View
                                key={a.id}
                                style={[s.dot, { backgroundColor: st ? CORES[st] : C.vazioDot }]}
                              />
                            );
                          })}
                        </View>
                        {expandida && (
                          <View style={s.detalhes}>
                            {aulas.map(a => {
                              const st = p.porStatus[a.id];
                              return (
                                <View key={a.id} style={s.detalheLinha}>
                                  <View style={[s.dot, { backgroundColor: st ? CORES[st] : C.vazioDot }]} />
                                  <Text style={s.detalheData}>{diaMes(a.data)}</Text>
                                  <Text style={s.detalheTitulo} numberOfLines={1}>{a.titulo}</Text>
                                  <Text style={[s.detalheStatus, { color: st ? CORES[st] : C.textMuted }]}>
                                    {st === 'presente' ? 'Presente' : st === 'justificado' ? 'Justificada' : st === 'ausente' ? 'Faltou' : 'Fora da turma'}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function buildStyles(C: PaletaFreq) { return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 26 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 11, color: C.textMuted, marginTop: 3 },
  presets: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  preset: { borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.inputBg },
  presetTexto: { fontSize: 11, color: C.textMuted, fontWeight: '600' },
  datasRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  dataInput: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: C.text, backgroundColor: C.inputBg },
  ate: { fontSize: 12, color: C.textMuted },
  aplicar: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  resumoCard: { borderLeftWidth: 3, backgroundColor: C.linhaBg, borderRadius: 12, padding: 12, gap: 6, marginBottom: 12 },
  resumoLinha: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  resumoNumero: { fontSize: 18, fontWeight: '800', color: C.text, minWidth: 44 },
  resumoLabel: { fontSize: 12, color: C.textMuted },
  resumoAviso: { fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 16 },
  alertaCard: { backgroundColor: '#E024240F', borderWidth: 1, borderColor: '#E0242433', borderRadius: 12, padding: 12, marginBottom: 12, gap: 4 },
  alertaTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  alertaTitulo: { fontSize: 13, fontWeight: '800', color: '#E02424' },
  alertaTexto: { fontSize: 12, color: C.text },
  pessoa: { backgroundColor: C.linhaBg, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  pessoaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pessoaNome: { flex: 1, fontSize: 14, fontWeight: '700', color: C.text },
  pessoaPct: { fontSize: 15, fontWeight: '800' },
  pessoaDetalhe: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  tira: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  detalhes: { marginTop: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, gap: 6 },
  detalheLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detalheData: { fontSize: 11, color: C.textMuted, width: 42 },
  detalheTitulo: { flex: 1, fontSize: 12, color: C.text },
  detalheStatus: { fontSize: 11, fontWeight: '700' },
  vazio: { alignItems: 'center', gap: 10, paddingVertical: 34, paddingHorizontal: 16 },
  vazioTexto: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 19 },
}); }
