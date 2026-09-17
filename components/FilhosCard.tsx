// components/FilhosCard.tsx
//
// "Meus filhos", dentro de Meu Cadastro. É por aqui que criança entra no
// diretório da igreja.
//
// POR QUE ISTO EXISTE
// Criança não tem e-mail, então não tem conta, então nunca esteve em
// `members` — e a igreja não sabia quantas crianças tem, quem são os pais
// nem quando é o aniversário de nenhuma. O responsável cadastra aqui, e a
// partir daí a criança existe para a lista de aniversariantes, para a
// chamada da sala infantil e para a escala de professores, como qualquer
// outra pessoa da igreja.
//
// O QUE A CRIANÇA É NO BANCO
// Uma linha em `members` com `responsavel_id` apontando para o cadastro do
// responsável e `status = 'crianca'` — os dois gravados pelo banco, não por
// esta tela: a policy "Responsável gerencia seus dependentes" e o gatilho
// `members_protege_campos_trg` (migração 20260917220000) decidem isso. Aqui
// só vão nome, sobrenome, data de nascimento e sexo.
//
// TECLADO
// Nenhum subcomponente é declarado dentro do componente, e o formulário é
// inline em vez de <Modal>. As duas coisas são propositais: componente
// declarado dentro de outro ganha identidade nova a cada tecla e o React
// remonta o TextInput, derrubando o foco (ver o comentário longo no
// MeuCadastroScreen e `bug-teclado-fecha-textinput-remonta.md`); e um
// <Modal> nativo aberto por cima de uma tela que já rola brigou com o
// teclado em toda tela onde tentamos.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

export type Filho = {
  id: string;
  nome: string;
  sobrenome: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  // Ficha de segurança — o que a sala de domingo precisa saber antes do
  // lanche. `alergias` e `necessidades_especiais` são dado de saúde de um
  // menor: ficam em `members`, que é fechada, e nenhuma RPC pública os
  // devolve. Ver a migração 20260918090000.
  alergias: string | null;
  necessidades_especiais: string | null;
  info_responsavel: string | null;
};

const SEXO_OPCOES: { valor: string; chave: string }[] = [
  { valor: 'masculino', chave: 'membros.op.masculino' },
  { valor: 'feminino', chave: 'membros.op.feminino' },
];

function paleta(isDark: boolean) {
  return isDark ? {
    accent: '#F5C842', bg: '#0E0B22', surface: '#1C1940', surfaceAlt: '#241F4D',
    text: '#F1EFFA', textMuted: '#A6A0C7', textDim: '#726A99',
    border: '#332D5C', danger: '#FF6B6B', success: '#4ADE80',
  } : {
    accent: '#C8960A', bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
    text: '#1A1A2E', textMuted: '#6B7280', textDim: '#9CA3AF',
    border: '#E5E0D8', danger: '#C0392B', success: '#27AE60',
  };
}

function formatDateBR(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function parseDateISO(br: string): string {
  const [d, m, y] = br.split('/');
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Data válida de verdade, não só com a cara certa: 31/02 e 99/99 passam numa
// checagem de formato e viram uma linha impossível no banco.
function dataPlausivel(br: string): boolean {
  const iso = parseDateISO(br);
  if (!iso) return false;
  const [y, m, d] = iso.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Comparar em UTC: `new Date(y, m-1, d)` usa o fuso do aparelho e um
  // aniversário perto da meia-noite mudaria de dia conforme quem abre o app.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  const hoje = new Date();
  if (dt.getTime() > hoje.getTime()) return false;
  if (y < hoje.getUTCFullYear() - 30) return false;
  return true;
}

function idadeEmAnos(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - y;
  const mesAtual = hoje.getMonth() + 1;
  if (mesAtual < m || (mesAtual === m && hoje.getDate() < d)) anos--;
  return anos >= 0 ? anos : null;
}

export default function FilhosCard({ responsavelId }: { responsavelId: string | null }) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const [filhos, setFilhos] = useState<Filho[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [sobrenome, setSobrenome] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [sexo, setSexo] = useState('');
  const [alergias, setAlergias] = useState('');
  const [necessidades, setNecessidades] = useState('');
  const [infoExtra, setInfoExtra] = useState('');

  const carregar = useCallback(async () => {
    if (!responsavelId) { setFilhos([]); return; }
    setCarregando(true);
    const { data } = await supabase
      .from('members')
      .select('id, nome, sobrenome, data_nascimento, sexo, alergias, necessidades_especiais, info_responsavel')
      .eq('responsavel_id', responsavelId)
      .order('data_nascimento', { ascending: true });
    setFilhos((data as Filho[]) ?? []);
    setCarregando(false);
  }, [responsavelId]);

  useEffect(() => { carregar(); }, [carregar]);

  const zerarCampos = () => {
    setEditandoId(null); setNome(''); setSobrenome(''); setNascimento(''); setSexo('');
    setAlergias(''); setNecessidades(''); setInfoExtra('');
  };

  const limpar = () => { zerarCampos(); setFormAberto(false); };
  const abrirNovo = () => { zerarCampos(); setFormAberto(true); };

  const abrirEdicao = (f: Filho) => {
    setEditandoId(f.id);
    setNome(f.nome ?? '');
    setSobrenome(f.sobrenome ?? '');
    setNascimento(formatDateBR(f.data_nascimento));
    setSexo(f.sexo ?? '');
    setAlergias(f.alergias ?? '');
    setNecessidades(f.necessidades_especiais ?? '');
    setInfoExtra(f.info_responsavel ?? '');
    setFormAberto(true);
  };

  const digitarData = (texto: string) => {
    const digitos = texto.replace(/\D/g, '').slice(0, 8);
    let f = digitos;
    if (digitos.length > 4) f = `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
    else if (digitos.length > 2) f = `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
    setNascimento(f);
  };

  const salvar = async () => {
    if (!responsavelId) return;
    if (!nome.trim()) {
      Alert.alert(t('common.atencao'), t('filhos.erroNome'));
      return;
    }
    if (!dataPlausivel(nascimento)) {
      Alert.alert(t('common.atencao'), t('filhos.erroData'));
      return;
    }

    setSalvando(true);
    const campos = {
      nome: nome.trim(),
      sobrenome: sobrenome.trim() || null,
      data_nascimento: parseDateISO(nascimento),
      sexo: sexo || null,
      // `|| null` e não `|| ''`: campo vazio tem que virar nulo, senão a ficha
      // do Admin mostraria "Alergias:" seguido de nada, que se lê como "sem
      // alergia" — a leitura errada mais cara possível nesta tela.
      alergias: alergias.trim() || null,
      necessidades_especiais: necessidades.trim() || null,
      info_responsavel: infoExtra.trim() || null,
    };

    // `responsavel_id` só vai no INSERT: o gatilho do banco recusa trocá-lo
    // num update, e mandá-lo aqui só serviria para o update falhar em
    // silêncio quando alguém mexesse nessa regra.
    const { error } = editandoId
      ? await supabase.from('members').update(campos).eq('id', editandoId)
      : await supabase.from('members').insert({ ...campos, responsavel_id: responsavelId });

    setSalvando(false);
    if (error) {
      Alert.alert(t('common.erro'), t('filhos.erroSalvar'));
      return;
    }
    limpar();
    carregar();
  };

  const remover = (f: Filho) => {
    Alert.alert(
      t('filhos.removerTitulo'),
      t('filhos.removerTexto', { nome: f.nome }),
      [
        { text: t('common.cancelar'), style: 'cancel' },
        {
          text: t('filhos.remover'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('members').delete().eq('id', f.id);
            if (error) { Alert.alert(t('common.erro'), t('filhos.erroRemover')); return; }
            if (editandoId === f.id) limpar();
            carregar();
          },
        },
      ],
    );
  };

  // Sem cadastro salvo não há a quem pendurar a criança: `responsavel_id`
  // aponta para a linha do responsável em `members`, e ela só existe depois
  // do primeiro Salvar. Dizer isso é melhor do que esconder o cartão e
  // deixar a pessoa procurando onde cadastra os filhos.
  if (!responsavelId) {
    return (
      <View style={s.card}>
        <View style={s.vazioWrap}>
          <Ionicons name="happy-outline" size={30} color={C.textDim} />
          <Text style={s.vazioTexto}>{t('filhos.salvePrimeiro')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <Text style={s.explicacao}>{t('filhos.explicacao')}</Text>

      {carregando ? (
        <ActivityIndicator color={C.accent} style={{ marginVertical: 16 }} />
      ) : filhos.length === 0 && !formAberto ? (
        <View style={s.vazioWrap}>
          <Ionicons name="happy-outline" size={30} color={C.textDim} />
          <Text style={s.vazioTexto}>{t('filhos.nenhum')}</Text>
        </View>
      ) : (
        filhos.map(f => {
          const anos = idadeEmAnos(f.data_nascimento);
          return (
            <View key={f.id} style={s.linha}>
              <View style={s.avatar}>
                <Text style={s.avatarTexto}>{(f.nome?.[0] ?? '?').toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.linhaNome}>{f.nome}{f.sobrenome ? ` ${f.sobrenome}` : ''}</Text>
                  {/* Uma etiqueta vermelha na lista, não só dentro do
                      formulário: quem confere a ficha no corredor, minutos
                      antes do lanche, não vai abrir cada cadastro. */}
                  {!!f.alergias && (
                    <View style={s.tagAlergia}>
                      <Ionicons name="warning" size={10} color={C.danger} />
                      <Text style={s.tagAlergiaTexto}>{t('filhos.tagAlergia')}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.linhaSub}>
                  {formatDateBR(f.data_nascimento)}
                  {anos !== null ? ` · ${t('filhos.anos', { count: anos })}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => abrirEdicao(f)} style={s.acaoBtn} hitSlop={8}>
                <Ionicons name="pencil" size={16} color={C.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remover(f)} style={s.acaoBtn} hitSlop={8}>
                <Ionicons name="trash-outline" size={16} color={C.danger} />
              </TouchableOpacity>
            </View>
          );
        })
      )}

      {formAberto && (
        <View style={s.form}>
          <Text style={s.formTitulo}>
            {editandoId ? t('filhos.editarTitulo') : t('filhos.novoTitulo')}
          </Text>

          <Text style={s.label}>{t('filhos.nome')} *</Text>
          <TextInput
            style={s.input} value={nome} onChangeText={setNome}
            placeholder={t('filhos.nomePlaceholder')} placeholderTextColor={C.textDim}
            autoCapitalize="words"
          />

          <Text style={s.label}>{t('filhos.sobrenome')}</Text>
          <TextInput
            style={s.input} value={sobrenome} onChangeText={setSobrenome}
            placeholder={t('filhos.sobrenomePlaceholder')} placeholderTextColor={C.textDim}
            autoCapitalize="words"
          />

          <Text style={s.label}>{t('filhos.nascimento')} *</Text>
          <TextInput
            style={s.input} value={nascimento} onChangeText={digitarData}
            placeholder="DD/MM/AAAA" placeholderTextColor={C.textDim}
            keyboardType="numeric" maxLength={10}
          />

          <Text style={s.label}>{t('filhos.sexo')}</Text>
          <View style={s.pillRow}>
            {SEXO_OPCOES.map(op => (
              <TouchableOpacity
                key={op.valor}
                style={[s.pill, sexo === op.valor && s.pillAtiva]}
                onPress={() => setSexo(sexo === op.valor ? '' : op.valor)}
              >
                <Text style={[s.pillTexto, sexo === op.valor && s.pillTextoAtivo]}>{t(op.chave)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.blocoTitulo}>{t('filhos.blocoSeguranca')}</Text>
          <Text style={s.blocoAjuda}>{t('filhos.blocoSegurancaAjuda')}</Text>

          <Text style={s.label}>{t('filhos.alergias')}</Text>
          <TextInput
            style={[s.input, s.inputMulti]} value={alergias} onChangeText={setAlergias}
            placeholder={t('filhos.alergiasPlaceholder')} placeholderTextColor={C.textDim}
            multiline
          />

          <Text style={s.label}>{t('filhos.necessidades')}</Text>
          <TextInput
            style={[s.input, s.inputMulti]} value={necessidades} onChangeText={setNecessidades}
            placeholder={t('filhos.necessidadesPlaceholder')} placeholderTextColor={C.textDim}
            multiline
          />

          <Text style={s.label}>{t('filhos.infoExtra')}</Text>
          <TextInput
            style={[s.input, s.inputMulti]} value={infoExtra} onChangeText={setInfoExtra}
            placeholder={t('filhos.infoExtraPlaceholder')} placeholderTextColor={C.textDim}
            multiline
          />

          <View style={s.formBotoes}>
            <TouchableOpacity style={s.btnSecundario} onPress={limpar} disabled={salvando}>
              <Text style={s.btnSecundarioTexto}>{t('common.cancelar')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnPrimario} onPress={salvar} disabled={salvando}>
              {salvando
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnPrimarioTexto}>{t('filhos.salvar')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!formAberto && (
        <TouchableOpacity style={s.btnAdicionar} onPress={abrirNovo}>
          <Ionicons name="add-circle-outline" size={18} color={C.accent} />
          <Text style={s.btnAdicionarTexto}>{t('filhos.adicionar')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function buildStyles(C: ReturnType<typeof paleta>) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1,
      borderColor: C.border, padding: 16, marginBottom: 20,
    },
    explicacao: { fontSize: 12.5, color: C.textMuted, lineHeight: 18, marginBottom: 14 },
    vazioWrap: { alignItems: 'center', gap: 8, paddingVertical: 18 },
    vazioTexto: { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingHorizontal: 12, lineHeight: 19 },
    linha: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    avatar: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent + '22',
      alignItems: 'center', justifyContent: 'center',
    },
    avatarTexto: { fontSize: 15, fontWeight: '800', color: C.accent },
    linhaNome: { fontSize: 14.5, fontWeight: '700', color: C.text },
    linhaSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    acaoBtn: { padding: 6 },
    form: {
      backgroundColor: C.surfaceAlt, borderRadius: 12, padding: 14,
      marginTop: 14, borderWidth: 1, borderColor: C.border,
    },
    formTitulo: { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 12 },
    label: {
      fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 0.6,
      textTransform: 'uppercase', marginBottom: 6,
    },
    input: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 15,
      color: C.text, marginBottom: 12,
    },
    inputMulti: { height: 80, textAlignVertical: 'top', paddingTop: 12 },
    tagAlergia: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: C.danger + '1A', borderRadius: 6,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    tagAlergiaTexto: { fontSize: 9.5, fontWeight: '800', color: C.danger, letterSpacing: 0.3 },
    blocoTitulo: {
      fontSize: 12.5, fontWeight: '800', color: C.text,
      marginTop: 6, marginBottom: 4,
    },
    blocoAjuda: { fontSize: 11.5, color: C.textMuted, lineHeight: 16.5, marginBottom: 12 },
    pillRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    pill: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    pillAtiva: { backgroundColor: C.accent + '22', borderColor: C.accent },
    pillTexto: { fontSize: 12.5, color: C.textMuted, fontWeight: '500' },
    pillTextoAtivo: { color: C.accent, fontWeight: '700' },
    formBotoes: { flexDirection: 'row', gap: 10 },
    btnSecundario: {
      flex: 1, alignItems: 'center', justifyContent: 'center', height: 46,
      borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    },
    btnSecundarioTexto: { fontSize: 14, fontWeight: '700', color: C.textMuted },
    btnPrimario: {
      flex: 1, alignItems: 'center', justifyContent: 'center', height: 46,
      borderRadius: 12, backgroundColor: C.success,
    },
    btnPrimarioTexto: { fontSize: 14, fontWeight: '800', color: '#fff' },
    btnAdicionar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: 14, height: 46, borderRadius: 12, borderWidth: 1.5,
      borderColor: C.accent, borderStyle: 'dashed', backgroundColor: C.accent + '10',
    },
    btnAdicionarTexto: { fontSize: 14, fontWeight: '700', color: C.accent },
  });
}
