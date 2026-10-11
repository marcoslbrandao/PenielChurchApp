import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../lib/useAuth';
import { useTheme } from '../lib/theme';
import { permissaoDoSistema } from '../lib/useNotifications';
import LembreteNotificacoes from '../components/LembreteNotificacoes';

// ─── Boas-vindas ─────────────────────────────────────────────────────────────
// Aberta uma vez, logo depois de confirmar o e-mail. De propósito NÃO pergunta
// "você é visitante ou membro?": quem acabou de chegar ainda não sabe o que
// cada opção significa, e quem escolhesse "membro" sem ter código bateria numa
// parede na primeira tela do app. A ativação de membro fica disponível pra
// sempre no Perfil — é uma ação, não uma pergunta de cadastro.
function paletaBemVindo(isDark: boolean) {
  return isDark ? {
    bg: '#0E0B22', surface: '#1C1940', border: '#332D5C',
    primary: '#8F79FF', accent: '#F5C842', text: '#F1EFFA', textMuted: '#A6A0C7',
  } : {
    bg: '#1A1740', surface: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.14)',
    primary: '#7B61FF', accent: '#F5C842', text: '#FFFFFF', textMuted: 'rgba(255,255,255,0.65)',
  };
}
type PaletaBemVindo = ReturnType<typeof paletaBemVindo>;

const PONTOS: { icone: keyof typeof Ionicons.glyphMap; chave: string }[] = [
  { icone: 'book-outline', chave: 'bemVindo.pontoBiblia' },
  { icone: 'calendar-outline', chave: 'bemVindo.pontoAgenda' },
  { icone: 'notifications-outline', chave: 'bemVindo.pontoAvisos' },
];

export default function BemVindoScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const C = useMemo(() => paletaBemVindo(isDark), [isDark]);
  const s = useMemo(() => buildStyles(C), [C]);

  // Ao tocar em "Explorar", quem ainda não recebe notificações vê o lembrete
  // antes de entrar no app (pedido do Marcos, 10/10/2026). Quem já deu a
  // permissão segue direto.
  const [lembreteAberto, setLembreteAberto] = useState(false);
  const explorar = async () => {
    const permissao = await permissaoDoSistema().catch(() => 'concedida' as const);
    if (permissao === 'concedida') { navigation.goBack(); return; }
    setLembreteAberto(true);
  };
  const fecharLembrete = () => { setLembreteAberto(false); navigation.goBack(); };

  const nomeCompleto = (user?.user_metadata as any)?.full_name ?? '';
  const primeiroNome = nomeCompleto.split(' ')[0] ?? '';

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Image
          source={require('../assets/peniel-logo.png')}
          style={s.logo}
          resizeMode="cover"
        />

        <Text style={s.titulo}>
          {primeiroNome ? t('bemVindo.tituloComNome', { nome: primeiroNome }) : t('bemVindo.titulo')}
        </Text>
        <Text style={s.subtitulo}>{t('bemVindo.subtitulo')}</Text>

        <View style={s.lista}>
          {PONTOS.map(p => (
            <View key={p.chave} style={s.item}>
              <View style={s.itemIcone}>
                <Ionicons name={p.icone} size={19} color={C.accent} />
              </View>
              <Text style={s.itemTexto}>{t(p.chave)}</Text>
            </View>
          ))}
        </View>

        {/* Menção discreta à Área do Membro: comunica que o app é híbrido sem
            rotular quem está chegando como "de fora". */}
        <View style={s.notaMembro}>
          <Ionicons name="key-outline" size={16} color={C.accent} />
          <Text style={s.notaMembroTexto}>{t('bemVindo.notaMembro')}</Text>
        </View>

        <TouchableOpacity style={s.botao} onPress={explorar} activeOpacity={0.85}>
          <Text style={s.botaoTexto}>{t('bemVindo.explorar')}</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </ScrollView>
      <LembreteNotificacoes visible={lembreteAberto} userId={user?.id} onFechar={fecharLembrete} />
    </SafeAreaView>
  );
}

function buildStyles(C: PaletaBemVindo) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30, paddingVertical: 40 },
    logo: { width: 84, height: 84, borderRadius: 42, marginBottom: 22 },
    titulo: { fontSize: 26, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 10 },
    subtitulo: { fontSize: 15, color: C.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
    lista: { width: '100%', gap: 12 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 14, paddingHorizontal: 16 },
    itemIcone: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(245,200,66,0.15)', alignItems: 'center', justifyContent: 'center' },
    itemTexto: { flex: 1, fontSize: 14.5, color: C.text, lineHeight: 21 },
    notaMembro: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 22, paddingHorizontal: 4 },
    notaMembroTexto: { flex: 1, fontSize: 13, color: C.textMuted, lineHeight: 19 },
    botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, width: '100%', marginTop: 30 },
    botaoTexto: { fontSize: 16.5, fontWeight: '700', color: '#fff' },
  });
}
