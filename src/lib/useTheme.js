import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'star-rupture:theme';
const DEFAULT = 'dark';

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch (_) {}
  return DEFAULT;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// Theme state is reflected onto <html data-theme="..."> so CSS variables in
// app.css can switch with a single attribute selector. Cytoscape doesn't read
// CSS variables natively — consumers should subscribe to `theme` and rebuild
// the stylesheet when it changes (see App.jsx).
export function useTheme() {
  const [theme, setTheme] = useState(readStored);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {}
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle, setTheme };
}
