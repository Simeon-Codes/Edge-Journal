import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

export const THEMES = {
  dark: {
    name: 'dark',
    bg:         '#0c0e1a',
    bgCard:     '#0e1120',
    bgInput:    '#0a0c18',
    bgHover:    '#1a1d2e',
    border:     '#1e2240',
    borderHover:'#2e3260',
    text:       '#c8cde8',
    textMuted:  '#8a8fa8',
    textDim:    '#3a3d5a',
    textStrong: '#e2e6ff',
    accent:     '#00e5a0',
    accentDim:  '#00e5a015',
    accentBorder:'#00e5a040',
    red:        '#ff4d6d',
    redDim:     '#ff4d6d15',
    yellow:     '#facc15',
    yellowDim:  '#facc1515',
    purple:     '#818cf8',
    purpleDim:  '#818cf815',
    orange:     '#fb923c',
    sidebar:    '#0e1120',
    shadow:     '0 40px 80px #00000080',
  },
  light: {
    name: 'light',
    bg:         '#f0f2f8',
    bgCard:     '#ffffff',
    bgInput:    '#f8f9fc',
    bgHover:    '#edf0f7',
    border:     '#dde2f0',
    borderHover:'#c8d0e8',
    text:       '#3a3d5a',
    textMuted:  '#8a8fa8',
    textDim:    '#c8cde8',
    textStrong: '#1a1d2e',
    accent:     '#00b87d',
    accentDim:  '#00b87d15',
    accentBorder:'#00b87d40',
    red:        '#e8334a',
    redDim:     '#e8334a12',
    yellow:     '#d4a017',
    yellowDim:  '#d4a01715',
    purple:     '#6366f1',
    purpleDim:  '#6366f115',
    orange:     '#ea7c1e',
    sidebar:    '#ffffff',
    shadow:     '0 10px 40px #00000018',
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
      'content', resolvedName === 'dark' ? '#0c0e1a' : '#f0f2f8'
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
