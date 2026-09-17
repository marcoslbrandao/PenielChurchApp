// screens/AniversariantesScreen.tsx
//
// "Quem faz aniversário em outubro?" — para qualquer membro logado, não só
// para o admin.
//
// POR QUE NÃO LÊ `members` DIRETO
// `members` é fechada para admin desde a migração 20260908203000: tem
// telefone, endereço, data de nascimento completa e as observações internas
// da liderança. Esta tela usa a RPC `aniversariantes_do_mes`, que é
// `security definer` e devolve quatro campos — nome, sobrenome, dia e mês.
// Mesmo padrão de `participantes_do_grupo` e `membros_para_grupo`: a função
// é a permissão, a tabela continua trancada.
//
// SEM O ANO, DE PROPÓSITO
// A lista responde "quem faz aniversário este mês" sem publicar a data de
// nascimento completa de ninguém. Vale para adulto e vale duas vezes para
// criança, que entra aqui pelo cadastro do responsável e nunca escolheu
// aparecer. O admin continua vendo a data inteira na aba Membros, que é
// onde esse dado tem uso.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

type Aniversariante = {
  id: string;
  nome: string;
  sobrenome: string;
  dia: number;
  mes: number;
  eh_crianca: boolean;
};

const MESES_CHAVE = [
  'meses.janeiro', 'meses.fevereiro', 'meses.marco', 'meses.abril',
  'meses.maio', 'meses.junho', 'meses.julho', 'meses.agosto',
  'meses.setembro', 'meses.outubro', 'meses.novembro', 'meses.dezembro',
];

function paleta(isDark: boolean) {
  return isDark ? {
    primary: '#100D28', accent: '#F5C842',
    bg: '#0E0B22', surface: '#1C1940', surfaceAlt: '#241F4D',
    text: '#F1EFFA', textMuted: '#A6A0C7', textDim: '#726A99',
    border: '#332D5C',
  } : {
    primary: '#1A1740', accent: '#C8960A',
    bg: '#F7F4EE', surface: '#FFFFFF', surfaceAlt: '#F0EDE8',
    text: '#1A1A2E', textMuted: '#6B7280', textDim: '#9CA3AF',
    border: '#E5E0D8',
  };
}

/** Mês e dia de HOJE em Londres — a igreja é no Reino Unido, e o aparelho
 *  pode estar em qualquer fuso (é comum estar no Brasil em viagem). Sem
 *  isto, "hoje" na lista discordaria do push que chega no mesmo dia. */
function hojeEmLondres(): { dia: number; mes: number } {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: '2-digit', month: '2-digit',
  }).formatToParts(new Date());
  const p = (tipo: string) => Number(partes.find(x => x.type === tipo)?.value ?? 0);
  return { dia: p('day'), mes: p('month') };
}

export default function AniversariantesScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paleta(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  const hoje = useMemo(() => hojeEmLondres(), []);
  const [mes, setMes] = useState(hoje.mes);
  const [lista, setLista] = useState<Aniversariante[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async (mesAlvo: number) => {
    setErro(false);
    const { data, error } = await supabase.rpc('aniversariantes_do_mes', { p_mes: mesAlvo });
    if (error) setErro(true);
    setLista((data as Aniversariante[]) ?? []);
    setCarregando(false);
    setAtualizando(false);
  }, []);

  useEffect(() => { setCarregando(true); carregar(mes); }, [mes, carregar]);

  const adultos = lista.filter(a => !a.eh_crianca);
  const criancas = lista.filter(a => a.eh_crianca);

  const renderLinha = (a: Aniversariante) => {
    const ehHoje = a.mes === hoje.mes && a.dia === hoje.dia;
    return (
      <View key={a.id} style={[s.linha, ehHoje && s.linhaHoje]}>
        <View style={[s.diaBox, ehHoje && s.diaBoxHoje]}>
          <Text style={[s.diaNumero, ehHoje && s.diaNumeroHoje]}>{a.dia}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.nome}>{a.nome}{a.sobrenome ? ` ${a.sobrenome}` : ''}</Text>
          {ehHoje && <Text style={s.hojeTexto}>{t('aniversariantes.ehHoje')}</Text>}
        </View>
        {ehHoje && <Text style={{ fontSize: 18 }}>🎂</Text>}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('aniversariantes.titulo')}</Text>
        <View style={s.backBtn} />
      </View>

      {/* Seletor de mês: doze pílulas roláveis. Um <Picker> nativo esconde a
          lista atrás de um toque e some com a noção de "o ano inteiro está
          aqui"; doze pílulas cabem numa faixa e o mês atual já vem marcado. */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.mesesScroll} contentContainerStyle={s.mesesRow}
      >
        {MESES_CHAVE.map((chave, i) => {
          const numero = i + 1;
          const ativo = numero === mes;
          return (
            <TouchableOpacity
              key={chave}
              style={[s.mesPill, ativo && s.mesPillAtiva]}
              onPress={() => setMes(numero)}
            >
              <Text
                allowFontScaling={false}
                style={[s.mesTexto, ativo && s.mesTextoAtivo]}
              >
                {t(chave)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {carregando ? (
        <View style={s.centro}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : erro ? (
        <View style={s.centro}>
          <Ionicons name="cloud-offline-outline" size={40} color={C.textDim} />
          <Text style={s.vazioTexto}>{t('aniversariantes.erro')}</Text>
          <TouchableOpacity style={s.tentarBtn} onPress={() => { setCarregando(true); carregar(mes); }}>
            <Text style={s.tentarTexto}>{t('common.tentarNovamente')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.lista}
          refreshControl={
            <RefreshControl
              refreshing={atualizando}
              onRefresh={() => { setAtualizando(true); carregar(mes); }}
            />
          }
        >
          <Text style={s.contador}>
            {t('aniversariantes.contador', { count: lista.length, mes: t(MESES_CHAVE[mes - 1]) })}
          </Text>

          {lista.length === 0 ? (
            <View style={s.centro}>
              <Ionicons name="gift-outline" size={40} color={C.textDim} />
              <Text style={s.vazioTexto}>{t('aniversariantes.nenhum')}</Text>
            </View>
          ) : (
            <>
              {adultos.map(renderLinha)}

              {criancas.length > 0 && (
                <>
                  <Text style={s.subtitulo}>{t('aniversariantes.criancas')}</Text>
                  {criancas.map(renderLinha)}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function buildStyles(C: ReturnType<typeof paleta>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 12,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
    mesesScroll: { maxHeight: 54, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
    mesesRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: 'center' },
    mesPill: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border,
    },
    mesPillAtiva: { backgroundColor: C.accent + '22', borderColor: C.accent },
    mesTexto: { fontSize: 12.5, color: C.textMuted, fontWeight: '600' },
    mesTextoAtivo: { color: C.accent, fontWeight: '800' },
    lista: { padding: 16, paddingBottom: 40 },
    contador: { fontSize: 12.5, color: C.textMuted, marginBottom: 14, fontWeight: '600' },
    subtitulo: {
      fontSize: 11, color: C.textMuted, fontWeight: '800', letterSpacing: 0.8,
      textTransform: 'uppercase', marginTop: 22, marginBottom: 10,
    },
    linha: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface, borderRadius: 12, borderWidth: 1,
      borderColor: C.border, padding: 12, marginBottom: 8,
    },
    linhaHoje: { borderColor: C.accent, borderWidth: 1.5, backgroundColor: C.accent + '0F' },
    diaBox: {
      width: 42, height: 42, borderRadius: 10, backgroundColor: C.surfaceAlt,
      alignItems: 'center', justifyContent: 'center',
    },
    diaBoxHoje: { backgroundColor: C.accent + '28' },
    diaNumero: { fontSize: 17, fontWeight: '800', color: C.text },
    diaNumeroHoje: { color: C.accent },
    nome: { fontSize: 15, fontWeight: '700', color: C.text },
    hojeTexto: { fontSize: 11.5, color: C.accent, fontWeight: '700', marginTop: 2 },
    centro: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 10 },
    vazioTexto: { fontSize: 14, color: C.textMuted, textAlign: 'center', paddingHorizontal: 30, lineHeight: 20 },
    tentarBtn: {
      marginTop: 6, paddingHorizontal: 20, paddingVertical: 10,
      borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
    },
    tentarTexto: { fontSize: 13, fontWeight: '700', color: C.text },
  });
}
