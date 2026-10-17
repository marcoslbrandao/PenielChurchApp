// lib/folgaDoTeclado.ts
//
// Quanto o teclado do ANDROID cobre de uma área da tela (17/10/2026).
//
// O PROBLEMA
// O app usa edge-to-edge no Android (app.json `edgeToEdgeEnabled`). Nesse
// modo o sistema NÃO encolhe mais a janela quando o teclado abre (o
// `adjustResize` deixa de ter efeito). Os chats usavam
// `<KeyboardAvoidingView behavior={iOS ? 'padding' : undefined}>`, contando
// com o Android encolher a tela sozinho — e o teclado passou a cobrir a caixa
// de digitar. Reclamação de membro com Android em 17/10/2026.
//
// A SOLUÇÃO
// Medir de verdade: quando o teclado abre, ver onde fica o fundo da área
// (`measureInWindow`) e onde começa o teclado (`screenY`). A diferença é o
// quanto ele cobre, e vira `paddingBottom`. Se em algum aparelho o sistema
// AINDA encolher a janela, a área já termina acima do teclado e a folga dá
// zero — nunca empurra em dobro. No iPhone devolve sempre 0 (lá o
// KeyboardAvoidingView com 'padding' continua cuidando).

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Keyboard, Platform, type View } from 'react-native';

export function useFolgaDoTeclado(ref: RefObject<View | null>, ativo = true): number {
  const [folga, setFolga] = useState(0);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    if (Platform.OS !== 'android' || !ativo) { setFolga(0); return; }

    const medir = (topoDoTeclado: number) => {
      // Um quadro depois: dá tempo de o sistema terminar de reposicionar a
      // janela (nos aparelhos em que ele ainda faz isso).
      requestAnimationFrame(() => {
        ref.current?.measureInWindow((_x, y, _w, h) => {
          if (!vivo.current) return;
          const fundo = y + h;
          const cobre = Math.max(0, Math.round(fundo - topoDoTeclado));
          setFolga(atual => (atual === cobre ? atual : cobre));
        });
      });
    };

    const s1 = Keyboard.addListener('keyboardDidShow', e => medir(e.endCoordinates.screenY));
    const s2 = Keyboard.addListener('keyboardDidHide', () => setFolga(0));
    return () => { vivo.current = false; s1.remove(); s2.remove(); };
  }, [ref, ativo]);

  return folga;
}
