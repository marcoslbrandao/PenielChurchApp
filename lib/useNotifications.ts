import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import type { EventSubscription } from 'expo-modules-core';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';

// Preferência de push deste APARELHO. Fica no aparelho, e não no perfil, de
// propósito: quem tem o app no celular e no tablet pode querer receber só num
// deles. O padrão é ligado — é o que a pessoa já autorizou no sistema quando
// instalou.
const CHAVE_PUSH = '@peniel:push_ativo';

export async function pushEstaAtivo(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CHAVE_PUSH)) !== 'false';
  } catch {
    return true;
  }
}

// Apaga o token DESTE aparelho da tabela. É o que realmente interrompe o
// push: o servidor manda para tokens, não para contas. Chamado ao desligar o
// interruptor no Perfil e ao sair da conta.
export async function removerTokenDesteAparelho(): Promise<void> {
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    if (!token) return;
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch (err) {
    console.log('Não foi possível remover o token de push:', err);
  }
}

// Liga ou desliga o push neste aparelho. Desligar apaga o token; ligar
// registra de novo.
export async function definirPush(ativo: boolean, userId?: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_PUSH, ativo ? 'true' : 'false');
  } catch {
    // Sem armazenamento local a preferência não sobrevive ao fechar o app,
    // mas o efeito imediato abaixo vale do mesmo jeito.
  }
  if (ativo) {
    if (userId) await registerForPushNotifications(userId);
  } else {
    await removerTokenDesteAparelho();
  }
}

// Configura como as notificações aparecem quando o app está aberto.
// No SDK 54 o `shouldShowAlert` foi depreciado e substituído por dois campos
// obrigatórios: `shouldShowBanner` (o balão que desce no topo) e
// `shouldShowList` (a entrada na central de notificações). Sem eles a
// notificação chegava mas não aparecia com o app em primeiro plano.
const PROJECT_ID = 'f53e9e07-9556-4ea8-80e0-da4487b38e56';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function useNotifications(userId: string | undefined) {
  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);

  useEffect(() => {
    if (!userId) return;

    registerForPushNotifications(userId);

    // Escuta notificações recebidas com app aberto
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notificação recebida:', notification);
    });

    // Escuta quando usuário toca na notificação
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notificação tocada:', response);
    });

    return () => {
      // `Notifications.removeNotificationSubscription()` foi REMOVIDA do
      // expo-notifications no SDK 54. Chamá-la lançava TypeError toda vez que
      // o efeito era limpo (logout, troca de conta, unmount). A API atual é
      // chamar `.remove()` na própria subscription devolvida pelo listener.
      notificationListener.current?.remove();
      responseListener.current?.remove();
      notificationListener.current = null;
      responseListener.current = null;
    };
  }, [userId]);
}

async function registerForPushNotifications(userId: string) {
  // Quem desligou o interruptor no Perfil não é reinscrito na próxima
  // abertura do app — era isso que fazia o interruptor "voltar sozinho".
  if (!(await pushEstaAtivo())) return;

  if (!Device.isDevice) {
    console.log('Push notifications só funcionam em dispositivo físico.');
    return;
  }

  // Pede permissão
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Permissão de notificação negada.');
    return;
  }

  // Configuração Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    if (!token) return;

    // Salva o token no Supabase. onConflict é o token (o aparelho), não o
    // user_id — assim, se essa pessoa logar com outra conta no mesmo
    // aparelho depois, a MESMA linha é atualizada pro novo user_id em vez
    // de criar uma linha nova (o que causava notificação duplicada: um
    // aparelho registrado em várias contas recebia o mesmo push várias
    // vezes). Ver migração 20260823120000_push_tokens_unico_por_token.sql.
    // O idioma vai junto pra que a notificação do versículo do dia (mandada
    // pelo servidor às 7h do Reino Unido) saia na língua de cada aparelho.
    await supabase.from('push_tokens').upsert(
      { user_id: userId, token, idioma: i18n.language?.slice(0, 2) ?? 'pt' },
      { onConflict: 'token' }
    );

    console.log('Push token registrado:', token);
  } catch (err) {
    console.log('Erro ao obter push token:', err);
  }
}