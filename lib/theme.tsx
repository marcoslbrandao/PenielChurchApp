import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemeColors = {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  primary: string;
  primaryDeep: string;
  primaryLight: string;
  // Cor de ÍCONE e de texto de destaque sobre `surface`. Existe porque
  // `primary` é uma cor de FUNDO (cabeçalho, botão cheio): no tema escuro ela
  // é #100D28 e, usada como cor de ícone sobre `surface` (#1C1940), dá
  // contraste de 1,14:1 — o ícone some. Quem desenha um ícone ou um número
  // sobre o fundo da tela usa `icone`; quem pinta um bloco usa `primary`.
  icone: string;
  accent: string;
  accentDim: string;
  text: string;
  textMuted: string;
  textDim: string;
  danger: string;
  success: string;
  statusBarStyle: 'light-content' | 'dark-content';
};

// Paleta clara = identidade visual oficial da Peniel Church. Não muda —
// continua sendo o padrão pra quem não mexer na preferência.
const paletaClara: ThemeColors = {
  scheme: 'light',
  bg: '#F7F4EE',
  surface: '#FFFFFF',
  surfaceAlt: '#F0EDE8',
  border: '#E5E0D8',
  primary: '#1A1740',
  primaryDeep: '#1A1542',
  primaryLight: '#7B61FF',
  icone: '#1A1740', // no claro é o próprio primary: 13,9:1 sobre o branco
  accent: '#F5C842',
  accentDim: '#7A6010',
  text: '#1A1A2E',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  danger: '#C0392B',
  success: '#27AE60',
  statusBarStyle: 'light-content', // headers usam C.primary (escuro) de fundo
};

// Paleta escura = mesmos acentos de marca (violeta/dourado), fundo e
// superfícies invertidos pra continuar legível e com a mesma identidade.
const paletaEscura: ThemeColors = {
  scheme: 'dark',
  bg: '#0E0B22',
  surface: '#1C1940',
  surfaceAlt: '#241F4D',
  border: '#332D5C',
  primary: '#100D28',
  primaryDeep: '#0A0818',
  primaryLight: '#8F79FF',
  icone: '#B9A9FF', // 7,4:1 sobre surface (#1C1940) — passa em AA e AAA
  accent: '#F5C842',
  accentDim: '#C9A227',
  text: '#F1EFFA',
  textMuted: '#A6A0C7',
  textDim: '#726A99',
  danger: '#FF6B6B',
  success: '#4ADE80',
  statusBarStyle: 'light-content',
};

const STORAGE_KEY = '@peniel_theme_mode';

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  isDark: boolean;
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  setMode: () => {},
  isDark: false,
  colors: paletaClara,
});

// Provider único, montado uma vez no topo do App. Guarda a preferência do
// usuário (claro/escuro/segue o sistema) no AsyncStorage — sobrevive a
// reabrir o app, igual ao idioma.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sistemaEscuro = useColorScheme() === 'dark';
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => {
      if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
    });
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  };

  const isDark = mode === 'system' ? sistemaEscuro : mode === 'dark';
  const colors = isDark ? paletaEscura : paletaClara;

  const value = useMemo(() => ({ mode, setMode, isDark, colors }), [mode, isDark, colors]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
