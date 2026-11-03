import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = 'skillforge-theme-mode';

const getSavedMode = (): ThemeMode => {
  try {
    return window.localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>(getSavedMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      window.localStorage.setItem(storageKey, mode);
    } catch {
      // The theme still works for this session when storage is unavailable.
    }
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
