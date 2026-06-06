import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

export const THEMES = {
  // Dark mode: deep charcoal background, MT5-style electric blue accent
  dark: {
    name: 'dark',
    bg:          '#1a1d26',   // dark gray — not pure black, easier on eyes
    bgCard:      '#20232f',   // slightly lifted card surface
    bgInput:     '#161820',   // sunken input fields
    bgHover:     '#282c3d',   // hover highlight
    border:      '#2a2e42',   // subtle border
    borderHover: '#3a3f5c',   // hovered / active border
    text:        '#c8cde8',   // primary text — soft blue-white
    textMuted:   '#7a7f9a',   // secondary label text
    textDim:     '#3c4060',   // very faint text (placeholders, dividers)
    textStrong:  '#e8ecff',   // headings and high-emphasis text
    accent:      '#4a90e2',   // MT5 blue — softer than #1848cc for dark bg
    accentDim:   '#4a90e215',
    accentBorder:'#4a90e240',
    red:         '#ff4d6d',
    redDim:      '#ff4d6d15',
    yellow:      '#facc15',
    yellowDim:   '#facc1515',
    purple:      '#818cf8',
    purpleDim:   '#818cf815',
    orange:      '#fb923c',
    sidebar:     '#20232f',
    shadow:      '0 40px 80px #00000090',
  },
  // Light mode: clean white, MT5 signature blue (#1848cc) as the brand accent
  light: {
    name: 'light',
    bg:          '#FFFFF0',   // MT5-style light blue-gray background
    bgCard:      '#E5E4E2',
    bgInput:     '#f8f9fd',
    bgHover:     '#edf1fa',
    border:      '#E5E4E2',
    borderHover: '#c0cbe8',
    text:        '#1a2240',   // deep navy text — matches MT5 dark text
    textMuted:   '#6b7499',
    textDim:     '#c0c8e0',
    textStrong:  '#0e1533',
    accent:      '#1848cc',   // MT5 signature blue
    accentDim:   '#1848cc15',
    accentBorder:'#1848cc40',
    red:         '#d93050',
    redDim:      '#d9305012',
    yellow:      '#c99a10',
    yellowDim:   '#c99a1015',
    purple:      '#5b63e8',
    purpleDim:   '#5b63e815',
    orange:      '#e06b10',
    sidebar:     '#ffffff',
    shadow:      '0 10px 40px #1848cc14',
  },
};

export const ThemeProvider = ({ children }) => {
  const [preference, setPreference] = useState(() =>
    localStorage.getItem('edge_theme') || 'system'
  );

  const getSystemTheme = () =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  const resolvedName = preference === 'system' ? getSystemTheme() : preference;
  const theme = { ...THEMES[resolvedName], preference, resolvedName };

  // Listen to system preference changes
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setPreference(p => p); // force re-render
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  // Persist preference
  useEffect(() => {
    localStorage.setItem('edge_theme', preference);
  }, [preference]);

  // Apply to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedName);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', resolvedName === 'dark' ? '#1a1d26' : '#f4f7fc'
    );
  }, [resolvedName]);

  const setTheme = useCallback((t) => {
    if (['dark', 'light', 'system'].includes(t)) setPreference(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, preference }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
