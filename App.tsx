import { StripeProvider } from '@stripe/stripe-react-native';
import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import HomeScreen from './screens/HomeScreen';
import BibleScreen from './screens/BibleScreen';
import AgendaScreen from './screens/AgendaScreen';
import PerfilScreen from './screens/PerfilScreen';
import MidiaScreen from './screens/MidiaScreen';
import AreaMembroScreen from './screens/AreaMembroScreen';
import OfertaScreen from './screens/OfertaScreen';
import NovaSenhaScreen from './screens/NovaSenhaScreen';
import MeuCadastroScreen from './screens/MeuCadastroScreen';
import DevocionaisScreen from './screens/DevocionaisScreen';
import TraducaoAoVivoScreen from './screens/TraducaoAoVivoScreen';
import AuthScreen from './screens/AuthScreen';
import AtivarMembroScreen from './screens/AtivarMembroScreen';
import BemVindoScreen from './screens/BemVindoScreen';
import { supabase } from './lib/supabase';
import i18n from 'i18next';
import { carregarIdiomaSalvo } from './lib/i18n';
import { ThemeProvider, useTheme } from './lib/theme';
import { AcessoProvider, useAcesso } from './lib/acesso';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

// ─── Deep link de recuperação de senha ────────────────────────────────────────
// O e-mail de "esqueci minha senha" abre penielchurch://reset-password com o
// token no fragmento (#) ou na query (?), dependendo do fluxo do Supabase.
//
// Este caminho continua aqui por causa dos e-mails já enviados, mas deixou de
// ser o principal: o app agora redefine a senha por CÓDIGO de 6 dígitos, na
// própria AuthScreen. Dois motivos, os dois vistos em produção:
//
//  1. ARRANQUE A FRIO. `Linking.getInitialURL()` resolve antes de a navegação
//     terminar de montar, e o código antigo checava `isReady()` uma única vez:
//     se desse falso — que é o caso quando o app é aberto PELO link — a sessão
//     era criada e a navegação simplesmente nunca acontecia. O app abria na
//     Home, sem erro nenhum, e a tela de nova senha não aparecia.
//  2. TOKEN JÁ CONSUMIDO. O token do link é de uso único, e vários provedores
//     de e-mail abrem os links antes do usuário, para escanear. Quando a
//     pessoa clica, o Supabase devolve `#error=access_denied&
//     error_code=otp_expired` — e o código antigo devolvia `false` em silêncio.
type ResultadoDeepLink = { ok: boolean; erro?: string };

async function handleAuthDeepLink(url: string | null): Promise<ResultadoDeepLink> {
  if (!url || !url.includes('reset-password')) return { ok: false };
  const [base, fragment] = url.split('#');
  const queryStr = fragment || (base.includes('?') ? base.split('?')[1] : '');
  if (!queryStr) return { ok: false };
  const params = new URLSearchParams(queryStr);

  // O Supabase manda o erro no próprio fragmento quando o token não vale mais.
  const erro = params.get('error_code') ?? params.get('error');
  if (erro) return { ok: false, erro };

  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  const token_hash = params.get('token_hash');
  const code = params.get('code');

  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return { ok: !error, erro: error?.message };
  }
  if (token_hash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'recovery' });
    return { ok: !error, erro: error?.message };
  }
  if (code) {
    // Fluxo PKCE (padrão em projetos Supabase mais novos): o link do email
    // não traz o token pronto, traz um "code" de uma tentativa que precisa
    // ser trocado por uma sessão de verdade.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { ok: !error, erro: error?.message };
  }
  return { ok: false };
}

function MainTabs() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // A aba "Membros" só existe pra quem é membro, líder ou admin. Visitante
  // não vê uma porta trancada — não vê porta. Quem tem um código de convite
  // ativa o acesso pelo card do Perfil (rota "AtivarMembro"), e a aba aparece
  // sozinha assim que o papel muda.
  const { ehMembro } = useAcesso();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.primary, borderTopColor: 'rgba(255,255,255,0.08)' },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Inicio"
        component={HomeScreen}
        options={{
          tabBarLabel: t('tabs.inicio'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Biblia"
        component={BibleScreen}
        options={{
          tabBarLabel: t('tabs.biblia'),
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Agenda"
        component={AgendaScreen}
        options={{
          tabBarLabel: t('tabs.agenda'),
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Midia"
        component={MidiaScreen}
        options={{
          tabBarLabel: t('tabs.midia'),
          tabBarIcon: ({ color, size }) => <Ionicons name="play-circle-outline" size={size} color={color} />,
        }}
      />
      {ehMembro && (
        <Tab.Screen
          name="Membros"
          component={AreaMembroScreen}
          options={{
            tabBarLabel: t('tabs.membros'),
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
        />
      )}
      <Tab.Screen
        name="Perfil"
        component={PerfilScreen}
        options={{
          tabBarLabel: t('tabs.perfil'),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  useEffect(() => { carregarIdiomaSalvo(); }, []);

  // O pedido de "abrir a tela de nova senha" fica GUARDADO até a navegação
  // existir. Era exatamente isso que faltava: no arranque a frio o link chegava
  // antes da navegação estar pronta e o pedido se perdia sem deixar rastro.
  const [novaSenhaPendente, setNovaSenhaPendente] = useState(false);
  const [navPronta, setNavPronta] = useState(false);

  useEffect(() => {
    const tratarLink = async (url: string | null) => {
      const { ok, erro } = await handleAuthDeepLink(url);
      if (ok) { setNovaSenhaPendente(true); return; }
      if (erro) {
        Alert.alert(
          i18n.t('auth.linkExpiradoTitulo'),
          i18n.t('auth.linkExpiradoMsg'),
        );
      }
    };

    Linking.getInitialURL().then(tratarLink);
    const subscription = Linking.addEventListener('url', ({ url }) => tratarLink(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (novaSenhaPendente && navPronta && navigationRef.isReady()) {
      navigationRef.navigate('NovaSenha' as never);
      setNovaSenhaPendente(false);
    }
  }, [novaSenhaPendente, navPronta]);

  return (
    <StripeProvider
      publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}
      merchantIdentifier="merchant.org.uk.penielchurch.app"
      urlScheme="penielchurch"
    >
      <SafeAreaProvider>
        <ThemeProvider>
          <AcessoProvider>
          <NavigationContainer ref={navigationRef} onReady={() => setNavPronta(true)}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="MainTabs" component={MainTabs} />
              <Stack.Screen
                name="Oferta"
                component={OfertaScreen}
                options={{ presentation: 'modal' }}
              />
              <Stack.Screen
                name="MeuCadastro"
                component={MeuCadastroScreen}
                options={{ presentation: 'modal' }}
              />
              <Stack.Screen
                name="Devocionais"
                component={DevocionaisScreen}
                options={{ presentation: 'modal' }}
              />
              <Stack.Screen
                name="TraducaoAoVivo"
                component={TraducaoAoVivoScreen}
                options={{ presentation: 'modal' }}
              />
              <Stack.Screen
                name="NovaSenha"
                component={NovaSenhaScreen}
                options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
              />
              {/* Login/cadastro deixou de morar dentro da aba Membros: agora é
                  uma rota própria, aberta pelo card do Perfil. Antes, quem
                  estava deslogado só conseguia entrar tocando numa aba que
                  parecia ser "a lista de membros da igreja". */}
              <Stack.Screen
                name="Auth"
                component={AuthScreen}
                options={{ presentation: 'modal' }}
              />
              <Stack.Screen
                name="AtivarMembro"
                component={AtivarMembroScreen}
                options={{ presentation: 'modal' }}
              />
              <Stack.Screen
                name="BemVindo"
                component={BemVindoScreen}
                options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
              />
            </Stack.Navigator>
          </NavigationContainer>
          </AcessoProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </StripeProvider>
  );
}