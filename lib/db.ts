// lib/db.ts
import { Alert } from 'react-native';
import i18n from 'i18next';
import { supabase } from './supabase';

// Apaga uma linha AVISANDO quando o banco recusa.
//
// POR QUE ISTO EXISTE
// O padrão espalhado pelo app era `await supabase.from(...).delete()` seguido
// de um fetch da lista. O cliente do Supabase NÃO lança quando a RLS recusa:
// devolve `{ error }` e segue. Com o erro descartado, o fetch trazia a linha
// de volta e a lixeira "simplesmente não funcionava" — sem mensagem, sem log,
// sem pista. Quem mexia ficava tocando no botão achando que era o toque que
// não pegava.
//
// De propósito NÃO muda o fluxo de quem chama: o refresh da lista continua
// acontecendo (e é o certo — a lista volta a refletir o banco). O que muda é
// que a pessoa passa a saber por que a linha continua ali.
export async function apagarLinha(
  tabela: string,
  valor: string,
  coluna = 'id',
): Promise<boolean> {
  const { error } = await supabase.from(tabela).delete().eq(coluna, valor);
  if (error) {
    console.log(`Falha ao apagar ${tabela}.${coluna}=${valor}:`, error);
    Alert.alert(i18n.t('common.removerFalhouTitulo'), error.message);
    return false;
  }
  return true;
}
