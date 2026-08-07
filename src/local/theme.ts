// Theme helper - dark mode persistant (comme RECEPTION-SALFA)
export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'salfa-theme';

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getStoredTheme(): ThemeMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
    return null;
  } catch { return null; }
}

export function storeTheme(t: ThemeMode) {
  try { localStorage.setItem(STORAGE_KEY, t); } catch {}
}

export function applyThemeClass(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  // meta theme-color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f172a' : '#1A365D');
}

export function initTheme(): ThemeMode {
  const stored = getStoredTheme();
  const initial: ThemeMode = stored || (getSystemPrefersDark() ? 'dark' : 'light');
  applyThemeClass(initial);
  return initial;
}
