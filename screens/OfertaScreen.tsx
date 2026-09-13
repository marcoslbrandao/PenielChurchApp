import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/theme';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { supabase } from '../lib/supabase';

// Paleta local — header, card do valor e card do versículo já são roxo
// escuro por design e funcionam nos dois temas sem mudar. Só os blocos
// "claros" (cards brancos de tipo/recorrência/resumo e o fundo da tela)
// precisam inverter no modo escuro.
function paletaOferta(isDark: boolean) {
  return isDark ? {
    bg: '#0E0B22',
    cardBg: '#1C1940',
    cardBorder: '#332D5C',
    textPrimary: '#F1EFFA',
    textMuted: '#A69FD6',
    cardAtivoBg: '#2A2560',
    abasBg: '#241F4D',
  } : {
    bg: '#F9F8FF',
    cardBg: '#FFFFFF',
    cardBorder: 'rgba(83,74,183,0.13)',
    textPrimary: '#1A1740',
    textMuted: '#8B83D4',
    cardAtivoBg: '#EEEDFE',
    abasBg: '#EEEDFE',
  };
}
type PaletaOferta = ReturnType<typeof paletaOferta>;

// ─── Config ───────────────────────────────────────────────────────────────────
const valores = [10, 25, 50, 100, 200];

export default function OfertaScreen({ navigation }: { navigation?: any }) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const C = useMemo(() => paletaOferta(isDark), [isDark]);
  const styles = useMemo(() => buildStyles(C), [C]);
  const tipos = [
    { id: 'dizimo', nome: t('oferta.dizimoNome'), sub: t('oferta.dizimoSub'), icone: 'star-outline' },
    { id: 'oferta', nome: t('oferta.ofertaNome'), sub: t('oferta.ofertaSub'), icone: 'heart-outline' },
    // Missões e Construção voltam quando tivermos essas campanhas ativas.
  ];
  // Os botões de valor SOMAM em vez de escolher: tocar 3x em £10 dá £30.
  // Começa em zero porque somar a partir de um valor pré-escolhido faria o
  // primeiro toque em £10 virar £35, que ninguém espera.
  const [valorAcumulado, setValorAcumulado] = useState(0);
  const [outroAtivo, setOutroAtivo] = useState(false);
  const [valorCustom, setValorCustom] = useState('');
  const [tipoSelecionado, setTipoSelecionado] = useState('dizimo');

  // ─── Pagamento via Stripe (PaymentSheet) ──────────────────────────────────
  // Um único botão que cobre cartão + Apple Pay + Google Pay, tudo dentro da
  // mesma folha nativa do Stripe — não depende de haver cartão configurado
  // na Wallet do dispositivo (quem não tem Apple/Google Pay simplesmente
  // digita o cartão na mesma tela). Substitui o antigo par SumUp + Apple/
  // Google Pay por um fluxo único, só Stripe.
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const [processandoPagamento, setProcessandoPagamento] = useState(false);

  // "Outro" substitui o total em vez de somar: enquanto a pessoa digita, um
  // valor parcial somado ao acumulado mostraria números que mudam sozinhos.
  const valorFinal = outroAtivo ? Number(valorCustom.replace(',', '.')) || 0 : valorAcumulado;

  const somarPreset = (v: number) => {
    // Sair do "Outro" descarta o que estava digitado e recomeça a soma dali.
    if (outroAtivo) { setOutroAtivo(false); setValorCustom(''); setValorAcumulado(v); return; }
    setValorAcumulado(atual => atual + v);
  };

  const selecionarOutro = () => {
    setOutroAtivo(true);
  };

  const limparValor = () => {
    setValorAcumulado(0);
    setOutroAtivo(false);
    setValorCustom('');
  };

  // Busca o client_secret na Edge Function, monta a PaymentSheet (cartão +
  // Apple Pay + Google Pay juntos) e apresenta pro usuário.
  const handleContribuir = async () => {
    if (valorFinal <= 0) {
      Alert.alert(t('common.atencao'), t('oferta.informeValorValido'));
      return;
    }

    setProcessandoPagamento(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-payment-intent', {
        body: { valor: valorFinal, tipo: tipoSelecionado, moeda: 'gbp' },
      });

      if (fnError || !data?.clientSecret) {
        throw new Error(fnError?.message || 'Não foi possível iniciar o pagamento.');
      }

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Peniel Church',
        paymentIntentClientSecret: data.clientSecret,
        applePay: {
          merchantCountryCode: 'GB',
        },
        googlePay: {
          merchantCountryCode: 'GB',
          currencyCode: 'GBP',
          testEnv: false,
        },
      });

      if (initError) {
        throw new Error(initError.message);
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert(t('common.atencao'), presentError.message);
        }
        return;
      }

      Alert.alert(t('oferta.modalTitulo'), t('oferta.pagamentoConfirmado') || 'Contribuição recebida. Obrigado!');
    } catch (e: any) {
      Alert.alert(t('common.atencao'), e?.message || 'Erro ao processar pagamento.');
    } finally {
      setProcessandoPagamento(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>{t('oferta.contribuaComAObra')}</Text>
          <Text style={styles.headerTitulo}>{t('oferta.titulo')}</Text>
        </View>
        {navigation && (
          <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Valor ─────────────────────────────────────────────────────────── */}
        <View style={styles.valorCard}>
          <Text style={styles.valorLabel}>{t('oferta.valorDaOferta')}</Text>
          <View style={styles.valorLinha}>
            <Text style={styles.valorDisplay}>
              {valorFinal > 0 ? '£ ' + valorFinal : '£ --'}
            </Text>
            {valorFinal > 0 && (
              <TouchableOpacity style={styles.limparBtn} onPress={limparValor} hitSlop={8}>
                <Ionicons name="close-circle" size={15} color={C.textMuted} />
                <Text style={styles.limparTexto}>{t('oferta.limpar')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.presetsGrid}>
            {valores.map((v) => (
              <TouchableOpacity
                key={v}
                style={styles.presetBtn}
                onPress={() => somarPreset(v)}
              >
                <Text style={styles.presetTexto}>£{v}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.presetBtn, outroAtivo && styles.presetBtnAtivo]}
              onPress={selecionarOutro}
            >
              <Text style={[styles.presetTexto, outroAtivo && styles.presetTextoAtivo]}>
                {t('oferta.outro')}
              </Text>
            </TouchableOpacity>
          </View>
          {!outroAtivo && <Text style={styles.somaDica}>{t('oferta.toqueParaSomar')}</Text>}
          {outroAtivo && (
            <View style={styles.outroInputWrap}>
              <Text style={styles.outroInputPrefixo}>£</Text>
              <TextInput
                style={styles.outroInput}
                value={valorCustom}
                onChangeText={setValorCustom}
                placeholder="0.00"
                placeholderTextColor="rgba(255,255,255,0.35)"
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
          )}
        </View>

        {/* ── Tipo ──────────────────────────────────────────────────────────── */}
        <Text style={styles.secaoTitulo}>{t('oferta.tipoDeContribuicao')}</Text>
        <View style={styles.tiposGrid}>
          {tipos.map((tipo) => (
            <TouchableOpacity
              key={tipo.id}
              style={[styles.tipoCard, tipoSelecionado === tipo.id && styles.tipoCardAtivo]}
              onPress={() => setTipoSelecionado(tipo.id)}
            >
              <Ionicons
                name={tipo.icone as any}
                size={20}
                color={tipoSelecionado === tipo.id ? '#534AB7' : C.textMuted}
              />
              <Text style={[styles.tipoNome, tipoSelecionado === tipo.id && styles.tipoNomeAtivo]}>
                {tipo.nome}
              </Text>
              <Text style={styles.tipoSub}>{tipo.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Resumo ────────────────────────────────────────────────────────── */}
        <View style={styles.resumoCard}>
          <View style={styles.resumoLinha}>
            <Text style={styles.resumoLabel}>{t('oferta.resumoTipo')}</Text>
            <Text style={styles.resumoValor}>{tipos.find(tp => tp.id === tipoSelecionado)?.nome}</Text>
          </View>
          {/* A linha "Frequência" saiu junto com a opção "Mensal" (13 Set):
              sem escolha nenhuma, dizer "uma vez" era só ocupar espaço. A
              opção Mensal prometia débito mensal mas criava um PaymentIntent
              avulso — volta quando houver Stripe Subscriptions de verdade. */}
          <View style={[styles.resumoLinha, { borderBottomWidth: 0 }]}>
            <Text style={styles.resumoLabel}>{t('oferta.resumoValor')}</Text>
            <Text style={[styles.resumoValor, { color: '#534AB7', fontWeight: '700' }]}>
              {valorFinal > 0 ? '£ ' + valorFinal : t('oferta.aDefinir')}
            </Text>
          </View>
        </View>

        {/* ── Botão contribuir (Stripe — cartão + Apple Pay + Google Pay) ─────── */}
        <TouchableOpacity
          style={[styles.btnContribuir, processandoPagamento && { opacity: 0.6 }]}
          onPress={handleContribuir}
          activeOpacity={0.85}
          disabled={processandoPagamento}
        >
          <Ionicons name="card-outline" size={20} color="#fff" />
          <Text style={styles.btnContribuirTexto}>{t('oferta.contribuirComSeguranca')}</Text>
        </TouchableOpacity>

        {/* ── Selos de segurança ────────────────────────────────────────────── */}
        <View style={styles.selosRow}>
          <View style={styles.selo}>
            <Ionicons name="lock-closed-outline" size={14} color="#8B83D4" />
            <Text style={styles.seloTexto}>{t('oferta.ssl')}</Text>
          </View>
          <View style={styles.selo}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#8B83D4" />
            <Text style={styles.seloTexto}>{t('oferta.sumupSeguro')}</Text>
          </View>
          <View style={styles.selo}>
            <Ionicons name="card-outline" size={14} color="#8B83D4" />
            <Text style={styles.seloTexto}>{t('oferta.visaMastercard')}</Text>
          </View>
        </View>

        {/* ── Versículo ─────────────────────────────────────────────────────── */}
        <View style={styles.versiculoCard}>
          <Text style={styles.versiculoTexto}>
            {t('oferta.versiculoOferta')}
          </Text>
          <Text style={styles.versiculoRef}>{t('oferta.versiculoRef')}</Text>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

function buildStyles(C: PaletaOferta) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: '#1A1740', paddingTop: 55, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  headerTitulo: { fontSize: 18, fontWeight: '500', color: '#fff', marginTop: 2 },
  // Valor
  valorCard: { backgroundColor: '#1A1740', margin: 14, borderRadius: 16, padding: 20 },
  valorLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 8 },
  valorDisplay: { fontSize: 48, fontWeight: '700', color: '#F5C842', textAlign: 'center', marginBottom: 20 },
  presetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  presetBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, minWidth: 70, alignItems: 'center' },
  presetBtnAtivo: { backgroundColor: '#534AB7', borderColor: '#534AB7' },
  presetTexto: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.7)' },
  presetTextoAtivo: { color: '#fff', fontWeight: '700' },
  valorLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  limparBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  limparTexto: { fontSize: 12, fontWeight: '600', color: C.textMuted },
  somaDica: { fontSize: 11, color: C.textMuted, marginTop: 10, textAlign: 'center' },
  outroInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: '#534AB7', borderRadius: 10, paddingHorizontal: 14, height: 46, marginTop: 12 },
  outroInputPrefixo: { fontSize: 16, fontWeight: '700', color: '#F5C842', marginRight: 8 },
  outroInput: { flex: 1, fontSize: 16, color: '#fff', fontWeight: '600' },
  // Tipos
  secaoTitulo: { fontSize: 14, fontWeight: '500', color: C.textPrimary, marginHorizontal: 14, marginBottom: 10 },
  tiposGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 14, marginBottom: 16 },
  tipoCard: { backgroundColor: C.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: C.cardBorder, padding: 14, width: '47%', gap: 5 },
  tipoCardAtivo: { borderWidth: 1.5, borderColor: '#534AB7', backgroundColor: C.cardAtivoBg },
  tipoNome: { fontSize: 13, fontWeight: '500', color: C.textPrimary },
  tipoNomeAtivo: { color: '#534AB7' },
  tipoSub: { fontSize: 11, color: C.textMuted },
  // Recorrência
  // Resumo
  resumoCard: { backgroundColor: C.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: C.cardBorder, marginHorizontal: 14, marginBottom: 16, overflow: 'hidden' },
  resumoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: C.cardBorder },
  resumoLabel: { fontSize: 13, color: C.textMuted },
  resumoValor: { fontSize: 13, fontWeight: '500', color: C.textPrimary },
  // Botão
  btnContribuir: { backgroundColor: '#534AB7', borderRadius: 14, marginHorizontal: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  btnContribuirTexto: { fontSize: 16, fontWeight: '700', color: '#fff' },
  // Selos
  selosRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12, marginBottom: 16 },
  selo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  seloTexto: { fontSize: 11, color: C.textMuted },
  // Versículo
  versiculoCard: { backgroundColor: '#1A1740', borderRadius: 16, marginHorizontal: 14, padding: 18 },
  versiculoTexto: { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 20, fontStyle: 'italic' },
  versiculoRef: { fontSize: 11, color: '#F5C842', marginTop: 8 },
}); }