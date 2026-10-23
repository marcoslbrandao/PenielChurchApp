import { useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { EventSubscription } from 'expo-modules-core';
import * as Device from 'expo-device';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';

// Preferência de push deste APARELHO. Fica no aparelho, e não no perfil, de
// propósito: quem tem o app no celular e no tablet pode querer receber só num
// deles.
const CHAVE_PUSH = '@peniel:push_ativo';
const PROJECT_ID = 'f53e9e07-9556-4ea8-80e0-da4487b38e56';

// SDK 54: `shouldShowBanner` + `shouldShowList` substituem `shouldShowAlert`.
// Sem eles a notificação chegava mas não aparecia com o app em primeiro plano.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Permissão do sistema ─────────────────────────────────────────────────────
// 'concedida'       → o celular deixa receber
// 'pode_perguntar'  → a pergunta do sistema ainda pode aparecer
// 'so_nos_ajustes'  → já foi negada; o sistema não pergunta mais, só nos Ajustes
export type PermissaoPush = 'concedida' | 'pode_perguntar' | 'so_nos_ajustes';

export async function permissaoDoSistema(): Promise<PermissaoPush> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return 'concedida';
    return p.canAskAgain ? 'pode_perguntar' : 'so_nos_ajustes';
  } catch {
    return 'pode_perguntar';
  }
}

async function preferenciaLigada(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CHAVE_PUSH)) !== 'false';
  } catch {
    return true;
  }
}

async function salvarPreferencia(ativo: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_PUSH, ativo ? 'true' : 'false');
  } catch {
    // Sem armazenamento local a preferência não sobrevive ao fechar o app.
  }
}

// O interruptor só mostra "ligado" quando as duas coisas são verdade: a pessoa
// quer (preferência) E o celular deixa (permissão do sistema). Antes ele dizia
// "ligado" mesmo com o sistema bloqueando — e o push nunca chegava.
export async function pushEstaAtivo(): Promise<boolean> {
  if (!(await preferenciaLigada())) return false;
  return (await permissaoDoSistema()) === 'concedida';
}

// ─── Ligar / desligar (Perfil, lembrete pós-cadastro e cartão da Home) ───────
// 'ligado'           → tudo certo, token salvo
// 'desligado'        → a pessoa desligou
// 'negado'           → a pessoa acabou de dizer "não" na pergunta do sistema
// 'precisa_ajustes'  → bloqueado antes; a tela deve oferecer "Abrir Ajustes"
export type ResultadoPush = 'ligado' | 'desligado' | 'negado' | 'precisa_ajustes';

export async function definirPush(ativo: boolean, userId?: string): Promise<ResultadoPush> {
  if (!ativo) {
    await salvarPreferencia(false);
    await removerTokenDesteAparelho();
    return 'desligado';
  }

  await salvarPreferencia(true);
  // No Android 13+ o canal precisa existir antes de pedir a permissão.
  await garantirCanalAndroid();

  const antes = await permissaoDoSistema();
  if (antes === 'so_nos_ajustes') return 'precisa_ajustes';

  if (antes === 'pode_perguntar') {
    const r = await Notifications.requestPermissionsAsync();
    if (!r.granted) return r.canAskAgain ? 'negado' : 'precisa_ajustes';
  }

  if (userId) await salvarToken(userId);
  return 'ligado';
}

// Ligar com ajuda: o mesmo `definirPush(true)`, mas quando o sistema já não
// pergunta mais (negado antes), explica e oferece levar a pessoa direto à
// página do app nos Ajustes do celular. Usado pelo Perfil, pelo lembrete
// pós-cadastro e pelo cartão da Home — os três se comportam igual.
export async function ativarNotificacoesComAjuda(userId?: string): Promise<ResultadoPush> {
  const r = await definirPush(true, userId);
  if (r === 'precisa_ajustes') {
    Alert.alert(
      i18n.t('perfil.notificacoesBloqueadasTitulo'),
      i18n.t('perfil.notificacoesBloqueadasTexto'),
      [
        { text: i18n.t('common.cancelar'), style: 'cancel' },
        { text: i18n.t('perfil.abrirAjustes'), onPress: () => { Linking.openSettings().catch(() => {}); } },
      ],
    );
  }
  return r;
}

// ─── Cartão "Notificações desligadas" da Home ─────────────────────────────────
// Aparece para quem está logado, NÃO desligou de propósito no Perfil
// (preferência ligada) e mesmo assim não recebe — o celular não permite. É o
// caso de quem tocou em "Agora não" no lembrete, e de quem negou a pergunta do
// sistema no passado. O "x" esconde o cartão por 14 dias neste aparelho.
const CHAVE_CARTAO_ADIADO = '@peniel:cartao_push_adiado_ate';

export async function deveMostrarCartaoPush(): Promise<boolean> {
  if (!Device.isDevice) return false;
  if (!(await preferenciaLigada())) return false;
  if ((await permissaoDoSistema()) === 'concedida') return false;
  try {
    const ate = Number(await AsyncStorage.getItem(CHAVE_CARTAO_ADIADO));
    if (ate && Date.now() < ate) return false;
  } catch {}
  return true;
}

export async function adiarCartaoPush(dias = 14): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_CARTAO_ADIADO, String(Date.now() + dias * 86400_000));
  } catch {}
}

// Confere o estado SEM mostrar a pergunta do sistema. Roda ao abrir o app e
// sempre que ele volta ao primeiro plano (ex.: a pessoa voltou dos Ajustes).
export async function sincronizarPush(userId?: string): Promise<boolean> {
  const ativo = await pushEstaAtivo();
  if (ativo && userId) await salvarToken(userId);
  return ativo;
}

// Apaga o token DESTE aparelho. É o que realmente interrompe o push: o
// servidor manda para tokens, não para contas. Usado ao desligar e ao sair.
export async function removerTokenDesteAparelho(): Promise<void> {
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    if (!token) return;
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch (err) {
    console.log('Não foi possível remover o token de push:', err);
  }
}

// ─── Hook usado com a pessoa logada ───────────────────────────────────────────
export function useNotifications(userId: string | undefined) {
  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Notificacao ligada por padrao (pedido do Marcos, 23/10): na primeira
    // vez que alguem logado abre o app e o celular ainda nunca perguntou, o
    // app mostra a pergunta do sistema ("Permitir notificacoes?") uma unica
    // vez. Quem ja respondeu (sim ou nao) nao e perguntado de novo — o
    // cartao da Home e o Perfil continuam para quem disse nao.
    sincronizarPush(userId).then(() => perguntarNaPrimeiraVez(userId));

    const appState = AppState.addEventListener('change', estado => {
      if (estado === 'active') sincronizarPush(userId);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notificação recebida:', notification);
    });
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notificação tocada:', response);
    });

    return () => {
      // SDK 54: `removeNotificationSubscription()` não existe mais; usar
      // `.remove()` na própria subscription.
      appState.remove();
      notificationListener.current?.remove();
      responseListener.current?.remove();
      notificationListener.current = null;
      responseListener.current = null;
    };
  }, [userId]);
}

const CHAVE_PERGUNTA_AUTOMATICA = '@peniel:push_pergunta_automatica';
async function perguntarNaPrimeiraVez(userId: string): Promise<void> {
  try {
    if (!Device.isDevice) return;
    if (!(await preferenciaLigada())) return;
    if ((await permissaoDoSistema()) !== 'pode_perguntar') return;
    if (await AsyncStorage.getItem(CHAVE_PERGUNTA_AUTOMATICA)) return;
    await AsyncStorage.setItem(CHAVE_PERGUNTA_AUTOMATICA, String(Date.now()));
    await definirPush(true, userId);
  } catch {}
}

// ─── Internos ─────────────────────────────────────────────────────────────────
async function garantirCanalAndroid(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch {}
}

async function salvarToken(userId: string): Promise<void> {
  if (!Device.isDevice) {
    console.log('Push só funciona em dispositivo físico.');
    return;
  }
  try {
    await garantirCanalAndroid();
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    if (!token) return;
    // onConflict pelo token (o aparelho), não pelo user_id: evita push
    // duplicado quando o mesmo aparelho troca de conta. Ver migração
    // 20260823120000_push_tokens_unico_por_token.sql. O idioma vai junto para
    // o versículo do dia sair na língua de cada aparelho.
    const idioma = i18n.language?.slice(0, 2) ?? 'pt';
    // RPC (23/10): o upsert direto falhava calado quando o token deste
    // aparelho ainda estava em OUTRA conta (perfil duplicado, troca de conta)
    // — a RLS nao deixa ver a linha alheia. A funcao grava sempre na conta
    // logada. O upsert fica de reserva para o caso da funcao nao existir.
    const { error } = await supabase.rpc('registrar_push_token', { p_token: token, p_idioma: idioma });
    if (error) {
      console.log('registrar_push_token falhou, tentando upsert:', error.message);
      const r = await supabase.from('push_tokens').upsert(
        { user_id: userId, token, idioma },
        { onConflict: 'token' }
      );
      if (r.error) console.log('Erro ao salvar push token:', r.error.message);
    }
  } catch (err) {
    console.log('Erro ao obter push token:', err);
  }
}
