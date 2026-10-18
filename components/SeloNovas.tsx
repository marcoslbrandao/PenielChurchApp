// components/SeloNovas.tsx
//
// Selo âmbar com o número de mensagens novas, pulsando de leve (18/10/2026).
// Usado na "Conversa" do culto (cartão do culto e botão Conversa). Ideia do
// Marcos: "a tab Conversa poderia ficar piscando com uma cor âmbar". Pulsar
// suave em vez de piscar: chama a atenção sem cansar, e para sozinho quando a
// pessoa abre a conversa (o número vira zero e o selo some).

import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, Easing } from 'react-native';

export const AMBAR = '#F2A93B';

export default function SeloNovas({ n, pequeno }: { n: number; pequeno?: boolean }) {
  const pulso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (n <= 0) return;
    const laco = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    laco.start();
    return () => laco.stop();
  }, [n > 0]);

  if (n <= 0) return null;
  const escala = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const opacidade = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] });
  return (
    <Animated.View
      style={[st.selo, pequeno && st.pequeno, { transform: [{ scale: escala }], opacity: opacidade }]}
      accessibilityLabel={`${n} novas`}
    >
      <Text style={[st.texto, pequeno && { fontSize: 10 }]}>{n > 99 ? '99+' : n}</Text>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  selo: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: AMBAR, alignItems: 'center', justifyContent: 'center' },
  pequeno: { minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4 },
  texto: { color: '#1A1A2E', fontSize: 11, fontWeight: '800' },
});
