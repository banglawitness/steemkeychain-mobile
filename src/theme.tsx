import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';

export type Palette = {
  background: string;
  card: string;
  text: string;
  muted: string;
  accent: string;
  accentDeep: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
  dangerSoft: string;
  line: string;
};

export const darkColors: Palette = {
  background: '#0c1118',
  card: '#161d2a',
  text: '#f4fbfa',
  muted: '#93b5b3',
  accent: '#00d3cc',
  accentDeep: '#7df6f0',
  accentSoft: '#123633',
  onAccent: '#042826',
  danger: '#ef5d6b',
  dangerSoft: '#3a1d24',
  line: '#234340',
};

export const lightColors: Palette = {
  background: '#eef4f3',
  card: '#ffffff',
  text: '#142422',
  muted: '#5c7875',
  accent: '#0c8f88',
  accentDeep: '#0b6d68',
  accentSoft: '#dff4f2',
  onAccent: '#042826',
  danger: '#d23b4a',
  dangerSoft: '#fde8eb',
  line: '#d5e4e2',
};

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'steem.theme';

type ThemeValue = {
  mode: ThemeMode;
  colors: Palette;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeValue>({
  mode: 'dark',
  colors: darkColors,
  setMode: () => undefined,
});

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark') setModeState(saved);
    }).catch(() => undefined);
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  };

  const value = useMemo<ThemeValue>(() => ({
    mode,
    colors: mode === 'light' ? lightColors : darkColors,
    setMode,
  }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useColors() {
  return useContext(ThemeContext).colors;
}

export function useThemedStyles<T>(factory: (colors: Palette) => T): T {
  const colors = useColors();
  return useMemo(() => factory(colors), [colors, factory]);
}
