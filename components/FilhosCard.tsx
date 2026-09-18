// components/FilhosCard.tsx
//
// "Meus filhos", dentro de Meu Cadastro. É por aqui que criança entra no
// diretório da igreja: criança não tem e-mail, logo não tem conta, logo nunca
// esteve em `members` — e a igreja não sabia quantas crianças tem, quem são os
// pais nem quando é o aniversário de nenhuma.
//
// UM BOTÃO SÓ (reescrito em 18/09)
// A primeira versão tinha um "Salvar" DENTRO do formulário do filho e o
// "Salvar" verde do cadastro logo abaixo. O Marcos preencheu um filho, apertou
// o verde, e o cadastro dele foi salvo enquanto o do filho era descartado em
// silêncio: nenhuma linha no banco, nenhuma mensagem. Dois botões com o mesmo
// nome, um dentro do outro, é um convite ao engano — e a observação dele foi a
// certa: "no final é um só cadastro".
//
// Agora este cartão não grava nada sozinho. Ele mantém os filhos em estado
// local e expõe `salvar(responsavelId)` por ref; quem chama é o handleSave do
// MeuCadastroScreen, depois de gravar o cadastro do responsável. Três coisas
// saem de graça desse desenho:
//
//   • o pai pode preencher o próprio cadastro E os filhos na primeira vez,
//     numa tacada — antes era preciso salvar, voltar e só então adicionar
//     filhos, porque `responsavel_id` precisa do id do responsável;
//   • um campo deixado pela metade não some sem aviso: a validação acontece
//     no Salvar e diz o que falta;
//   • não existe mais estado "digitado mas não confirmado".
//
// O QUE A CRIANÇA É NO BANCO
// Uma linha em `members` com `responsavel_id` apontando para o cadastro do
// responsável e `status = 'crianca'` — os dois gravados pelo BANCO, não por
// esta tela: a policy "Responsável gerencia seus dependentes" e o gatilho
// `members_protege_campos_trg` decidem isso (migração 20260917220000).
//
// TECLADO
// Nenhum subcomponente é declarado dentro do componente, e nada aqui é
// <Modal>. As duas coisas são propositais: componente declarado dentro de
// outro ganha identidade nova a cada tecla e o React remonta o TextInput,
// derrubando o foco (ver `bug-teclado-fecha-textinput-remonta.md`).

import React, {
  useState, useEffect, useCallback, useMemo, useRef,
  forwardRef, useImperativeHandle,
} from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

export type ResultadoSalvar = { ok: boolean; erro?: string };

export type FilhosCardRef = {
  /** Grava tudo: apaga os removidos, insere os novos, atualiza os alterados.
   *  Chamado pelo handleSave do MeuCadastroScreen. */
  salvar: (responsavelId: string) => Promise<ResultadoSalvar>;
};

/** Um filho em edição. `idBanco` nulo = ainda não existe em `members`. */
type FilhoEdit = {
  key: string;
  idBanco: string | null;
  nome: string;
  sobrenome: string;
  nascimento: string;   // DD/MM/AAAA, como a pessoa digita
  sexo: string;
  alergias: string;
  necessidades: string;
  infoExtra: string;
  sujo: boolean;
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
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function parseDateISO(br: string): string {
  const [d, m, y] = br.split('/');
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Data válida de verdade: 31/02 e 99/99 passam numa checagem de formato e
 *  viram uma linha impossível no banco. */
function dataPlausivel(br: string): boolean {
  const iso = parseDateISO(br);
  if (!iso) return false;
  const [y, m, d] = iso.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Em UTC: `new Date(y, m-1, d)` usa o fuso do aparelho, e uma data de
  // calendário não tem fuso.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  if (dt.getTime() > Date.now()) return false;
  if (y < new Date().getUTCFullYear() - 30) return false;
  return true;
}

function idadeEmAnos(br: string): number | null {
  const iso = parseDateISO(br);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const hoje = new Date();
  let anos = hoje.getFullYear() - y;
  const mesAtual = hoje.getMonth() + 1;
  if (mesAtual < m || (mesAtual === m && hoje.getDate() < d)) anos--;
  return anos >= 0 ? anos : null;
}

function vazio(f: FilhoEdit): boolean {
  return !f.nome.trim() && !f.sobrenome.trim() && !f.nascimento.trim()
    && !f.alergias.trim() && !f.necessidades.trim() && !f.infoExtra.trim();
}

/** A mensagem do Supabase, sem inventar. Um erro de RLS não diz "violates row
 *  level security" para o usuário, mas o código fica visível para o suporte —
 *  foi a falta disso que custou meia hora de SQL no diagnóstico de 18/09. */
function descreveErro(e: any): string {
  const partes = [e?.message, e?.details, e?.hint, e?.code && `(${e.code})`];
  return partes.filter(Boolean).join(' · ') || 'erro desconhecido';
}

let contador = 0;
function novaChave() { return `novo-${++contador}`; }

function filhoVazio(): FilhoEdit {
  return {
    key: novaChave(), idBanco: null,
    nome: '', sobrenome: '', nascimento: '', sexo: '',
    alergias: '', necessidades: '', infoExtra: '', sujo: true,
  };
}

const FilhosCard = forwardRef<FilhosCardRef, { responsavelId: string | null }>(
function FilhosCard({ responsavelId }, ref) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const [filhos, setFilhos] = useState<FilhoEdit[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [mostrandoSeguranca, setMostrandoSeguranca] = useState<Record<string, boolean>>({});
  const [carregando, setCarregando] = useState(false);

  // O estado vive aqui, mas quem salva é o botão do rodapé — então o ref
  // precisa enxergar sempre a versão mais nova, não a do render em que foi
  // montado.
  const filhosRef = useRef(filhos);
  const removidosRef = useRef(removidos);
  filhosRef.current = filhos;
  removidosRef.current = removidos;

  const carregar = useCallback(async () => {
    if (!responsavelId) { setFilhos([]); return; }
    setCarregando(true);
    const { data } = await supabase
      .from('members')
      .select('id, nome, sobrenome, data_nascimento, sexo, alergias, necessidades_especiais, info_responsavel')
      .eq('responsavel_id', responsavelId)
      .order('data_nascimento', { ascending: true });
    setFilhos((data ?? []).map((f: any) => ({
      key: f.id,
      idBanco: f.id,
      nome: f.nome ?? '',
      sobrenome: f.sobrenome ?? '',
      nascimento: formatDateBR(f.data_nascimento),
      sexo: f.sexo ?? '',
      alergias: f.alergias ?? '',
      necessidades: f.necessidades_especiais ?? '',
      infoExtra: f.info_responsavel ?? '',
      sujo: false,
    })));
    setCarregando(false);
  }, [responsavelId]);

  useEffect(() => { carregar(); }, [carregar]);

  const mexer = (key: string, campo: keyof FilhoEdit, valor: string) => {
    setFilhos(atual => atual.map(f =>
      f.key === key ? { ...f, [campo]: valor, sujo: true } : f));
  };

  const digitarData = (key: string, texto: string) => {
    const digitos = texto.replace(/\D/g, '').slice(0, 8);
    let v = digitos;
    if (digitos.length > 4) v = `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
    else if (digitos.length > 2) v = `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
    mexer(key, 'nascimento', v);
  };

  const adicionar = () => {
    const novo = filhoVazio();
    setFilhos(atual => [...atual, novo]);
    setExpandido(novo.key);
  };

  const remover = (f: FilhoEdit) => {
    const tirar = () => {
      if (f.idBanco) setRemovidos(r => [...r, f.idBanco!]);
      setFilhos(atual => atual.filter(x => x.key !== f.key));
    };
    // Um cartão em branco some sem perguntar: não há o que confirmar.
    if (vazio(f)) { tirar(); return; }
    Alert.alert(
      t('filhos.removerTitulo'),
      t('filhos.removerTexto', { nome: f.nome.trim() || t('filhos.semNome') }),
      [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('filhos.remover'), style: 'destructive', onPress: tirar },
      ],
    );
  };

  useImperativeHandle(ref, () => ({
    async salvar(idResponsavel: string): Promise<ResultadoSalvar> {
      const atuais = filhosRef.current;
      const paraApagar = removidosRef.current;

      // Cartões em branco são descartados, não viram erro: a pessoa tocou em
      // "Adicionar filho" e mudou de ideia.
      const valendo = atuais.filter(f => !vazio(f));

      for (const f of valendo) {
        if (!f.nome.trim()) return { ok: false, erro: t('filhos.erroNome') };
        if (!dataPlausivel(f.nascimento)) {
          return { ok: false, erro: t('filhos.erroDataDe', { nome: f.nome.trim() }) };
        }
      }

      if (paraApagar.length > 0) {
        const { error } = await supabase.from('members').delete().in('id', paraApagar);
        if (error) return { ok: false, erro: descreveErro(error) };
        setRemovidos([]);
      }

      for (const f of valendo) {
        const campos = {
          nome: f.nome.trim(),
          sobrenome: f.sobrenome.trim() || null,
          data_nascimento: parseDateISO(f.nascimento),
          sexo: f.sexo || null,
          // `|| null` e não `|| ''`: campo vazio tem que virar nulo, senão a
          // ficha do Admin mostra "Alergias:" seguido de nada, que se lê como
          // "sem alergia" — a leitura errada mais cara possível nesta tela.
          alergias: f.alergias.trim() || null,
          necessidades_especiais: f.necessidades.trim() || null,
          info_responsavel: f.infoExtra.trim() || null,
        };

        if (f.idBanco) {
          if (!f.sujo) continue;
          const { error } = await supabase.from('members').update(campos).eq('id', f.idBanco);
          if (error) return { ok: false, erro: descreveErro(error) };
        } else {
          // `responsavel_id` só no INSERT: o gatilho do banco recusa trocá-lo
          // num update.
          const { error } = await supabase
            .from('members')
            .insert({ ...campos, responsavel_id: idResponsavel });
          if (error) return { ok: false, erro: descreveErro(error) };
        }
      }

      await carregar();
      return { ok: true };
    },
  }), [carregar, t]);

  // Sem cadastro salvo ainda, os filhos digitados aqui são gravados junto no
  // primeiro Salvar — `responsavel_id` precisa do id do responsável, que só
  // existe depois dele. Por isso o cartão continua editável.
  return (
    <View style={s.card}>
      <Text style={s.explicacao}>{t('filhos.explicacao')}</Text>
      {!responsavelId && <Text style={s.avisoPrimeiroSalvar}>{t('filhos.primeiroSalvar')}</Text>}

      {carregando ? (
        <ActivityIndicator color={C.accent} style={{ marginVertical: 16 }} />
      ) : filhos.length === 0 ? (
        <View style={s.vazioWrap}>
          <Ionicons name="happy-outline" size={30} color={C.textDim} />
          <Text style={s.vazioTexto}>{t('filhos.nenhum')}</Text>
        </View>
      ) : (
        filhos.map(f => {
          const aberto = expandido === f.key;
          const anos = idadeEmAnos(f.nascimento);
          return (
            <View key={f.key} style={[s.filhoBox, aberto && s.filhoBoxAberto]}>
              <TouchableOpacity
                style={s.filhoCabecalho}
                onPress={() => setExpandido(aberto ? null : f.key)}
                activeOpacity={0.7}
              >
                <View style={s.avatar}>
                  <Text style={s.avatarTexto}>{(f.nome.trim()[0] ?? '?').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.filhoNome} numberOfLines={1}>
                      {f.nome.trim() || t('filhos.novoTitulo')}{f.sobrenome.trim() ? ` ${f.sobrenome.trim()}` : ''}
                    </Text>
                    {/* Etiqueta na linha fechada: quem confere a ficha no
                        corredor, minutos antes do lanche, não vai abrir cada
                        cadastro. */}
                    {!!f.alergias.trim() && (
                      <View style={s.tagAlergia}>
                        <Ionicons name="warning" size={10} color={C.danger} />
                        <Text style={s.tagAlergiaTexto}>{t('filhos.tagAlergia')}</Text>
                      </View>
                    )}
                  </View>
                  {!!f.nascimento && (
                    <Text style={s.filhoSub}>
                      {f.nascimento}{anos !== null ? ` · ${t('filhos.anos', { count: anos })}` : ''}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => remover(f)} style={s.acaoBtn} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={C.danger} />
                </TouchableOpacity>
                <Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
              </TouchableOpacity>

              {aberto && (
                <View style={s.filhoCorpo}>
                  <Text style={s.label}>{t('filhos.nome')} *</Text>
                  <TextInput
                    style={s.input} value={f.nome} onChangeText={v => mexer(f.key, 'nome', v)}
                    placeholder={t('filhos.nomePlaceholder')} placeholderTextColor={C.textDim}
                    autoCapitalize="words"
                  />

                  <Text style={s.label}>{t('filhos.sobrenome')}</Text>
                  <TextInput
                    style={s.input} value={f.sobrenome} onChangeText={v => mexer(f.key, 'sobrenome', v)}
                    placeholder={t('filhos.sobrenomePlaceholder')} placeholderTextColor={C.textDim}
                    autoCapitalize="words"
                  />

                  <Text style={s.label}>{t('filhos.nascimento')} *</Text>
                  <TextInput
                    style={s.input} value={f.nascimento} onChangeText={v => digitarData(f.key, v)}
                    placeholder="DD/MM/AAAA" placeholderTextColor={C.textDim}
                    keyboardType="numeric" maxLength={10}
                  />

                  <Text style={s.label}>{t('filhos.sexo')}</Text>
                  <View style={s.pillRow}>
                    {SEXO_OPCOES.map(op => (
                      <TouchableOpacity
                        key={op.valor}
                        style={[s.pill, f.sexo === op.valor && s.pillAtiva]}
                        onPress={() => mexer(f.key, 'sexo', f.sexo === op.valor ? '' : op.valor)}
                      >
                        <Text style={[s.pillTexto, f.sexo === op.valor && s.pillTextoAtivo]}>{t(op.chave)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* A ficha de segurança fica atrás de um toque: três campos
                      multilinha abertos por filho fariam a tela crescer de um
                      jeito que esconde o botão Salvar. */}
                  <TouchableOpacity
                    style={s.segurancaToggle}
                    onPress={() => setMostrandoSeguranca(m => ({ ...m, [f.key]: !m[f.key] }))}
                  >
                    <Ionicons
                      name={mostrandoSeguranca[f.key] ? 'chevron-down' : 'chevron-forward'}
                      size={14} color={C.accent}
                    />
                    <Text style={s.segurancaToggleTexto}>{t('filhos.blocoSeguranca')}</Text>
                  </TouchableOpacity>

                  {mostrandoSeguranca[f.key] && (
                    <View>
                      <Text style={s.blocoAjuda}>{t('filhos.blocoSegurancaAjuda')}</Text>

                      <Text style={s.label}>{t('filhos.alergias')}</Text>
                      <TextInput
                        style={[s.input, s.inputMulti]} value={f.alergias}
                        onChangeText={v => mexer(f.key, 'alergias', v)}
                        placeholder={t('filhos.alergiasPlaceholder')} placeholderTextColor={C.textDim}
                        multiline
                      />

                      <Text style={s.label}>{t('filhos.necessidades')}</Text>
                      <TextInput
                        style={[s.input, s.inputMulti]} value={f.necessidades}
                        onChangeText={v => mexer(f.key, 'necessidades', v)}
                        placeholder={t('filhos.necessidadesPlaceholder')} placeholderTextColor={C.textDim}
                        multiline
                      />

                      <Text style={s.label}>{t('filhos.infoExtra')}</Text>
                      <TextInput
                        style={[s.input, s.inputMulti]} value={f.infoExtra}
                        onChangeText={v => mexer(f.key, 'infoExtra', v)}
                        placeholder={t('filhos.infoExtraPlaceholder')} placeholderTextColor={C.textDim}
                        multiline
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}

      <TouchableOpacity style={s.btnAdicionar} onPress={adicionar}>
        <Ionicons name="add-circle-outline" size={18} color={C.accent} />
        <Text style={s.btnAdicionarTexto}>{t('filhos.adicionar')}</Text>
      </TouchableOpacity>

      {filhos.length > 0 && (
        <Text style={s.rodape}>{t('filhos.salvoComOCadastro')}</Text>
      )}
    </View>
  );
});

export default FilhosCard;

function buildStyles(C: ReturnType<typeof paleta>) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1,
      borderColor: C.border, padding: 16, marginBottom: 20,
    },
    explicacao: { fontSize: 12.5, color: C.textMuted, lineHeight: 18, marginBottom: 14 },
    avisoPrimeiroSalvar: {
      fontSize: 12, color: C.accent, lineHeight: 17, marginBottom: 14,
      backgroundColor: C.accent + '14', borderRadius: 8, padding: 10,
    },
    vazioWrap: { alignItems: 'center', gap: 8, paddingVertical: 18 },
    vazioTexto: { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingHorizontal: 12, lineHeight: 19 },
    filhoBox: {
      borderWidth: 1, borderColor: C.border, borderRadius: 12,
      marginBottom: 10, backgroundColor: C.surfaceAlt, overflow: 'hidden',
    },
    filhoBoxAberto: { borderColor: C.accent + '77' },
    filhoCabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
    avatar: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent + '22',
      alignItems: 'center', justifyContent: 'center',
    },
    avatarTexto: { fontSize: 15, fontWeight: '800', color: C.accent },
    filhoNome: { fontSize: 14.5, fontWeight: '700', color: C.text, flexShrink: 1 },
    filhoSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    acaoBtn: { padding: 6 },
    filhoCorpo: { paddingHorizontal: 12, paddingBottom: 12 },
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
    segurancaToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
    segurancaToggleTexto: { fontSize: 12.5, fontWeight: '800', color: C.accent },
    blocoAjuda: { fontSize: 11.5, color: C.textMuted, lineHeight: 16.5, marginBottom: 12 },
    pillRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
    pill: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    },
    pillAtiva: { backgroundColor: C.accent + '22', borderColor: C.accent },
    pillTexto: { fontSize: 12.5, color: C.textMuted, fontWeight: '500' },
    pillTextoAtivo: { color: C.accent, fontWeight: '700' },
    btnAdicionar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: 4, height: 46, borderRadius: 12, borderWidth: 1.5,
      borderColor: C.accent, borderStyle: 'dashed', backgroundColor: C.accent + '10',
    },
    btnAdicionarTexto: { fontSize: 14, fontWeight: '700', color: C.accent },
    rodape: { fontSize: 11.5, color: C.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 16 },
  });
}
