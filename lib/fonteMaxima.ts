// lib/fonteMaxima.ts
//
// Fonte grande do celular (12/11/2026): o app acompanha o tamanho de fonte
// que a pessoa escolhe no iPhone/Android, mas até um limite (1,3x). Acima
// disso as telas apertadas (calendário, chips, abas) cortavam o texto.
// Um <Text> que já define maxFontSizeMultiplier ou allowFontScaling={false}
// continua mandando nele mesmo.
//
// Importado no index.ts antes do App: troca Text e TextInput do react-native
// por uma versão que só acrescenta o limite (React 19 não aceita mais
// defaultProps em componente de função).
import React from 'react';
import * as RN from 'react-native';

export const FONTE_MAXIMA = 1.3;

function comLimite<T extends React.ComponentType<any>>(Original: T): T {
  const Envolvido = (props: any) =>
    React.createElement(Original, { maxFontSizeMultiplier: FONTE_MAXIMA, ...props });
  Object.assign(Envolvido, Original); // estáticos (ex.: TextInput.State)
  (Envolvido as any).displayName = (Original as any).displayName ?? 'Text';
  return Envolvido as unknown as T;
}

try {
  const Text = comLimite(RN.Text);
  const TextInput = comLimite(RN.TextInput);
  const alvo = require('react-native');
  Object.defineProperty(alvo, 'Text', { configurable: true, enumerable: true, get: () => Text });
  Object.defineProperty(alvo, 'TextInput', { configurable: true, enumerable: true, get: () => TextInput });
} catch {
  // se não der, o app segue com a fonte do sistema sem limite
}
