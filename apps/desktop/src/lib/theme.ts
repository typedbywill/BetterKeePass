import type { ThemeMode } from '../store/ui';

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function applyTheme(mode: ThemeMode): boolean {
  const isDark = resolveDark(mode);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
  }
  return isDark;
}

export function subscribeSystemTheme(mode: ThemeMode): () => void {
  applyTheme(mode);

  if (
    mode !== 'system' ||
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => {};
  }

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    applyTheme('system');
  };

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }
  return () => {};
}
