export type ThemeMode = 'system' | 'light' | 'dark';

export type ThemePreset =
  | 'default'
  | 'grafite'
  | 'tokyo-night'
  | 'catppuccin'
  | 'nord'
  | 'atom'
  | 'keepassxc'
  | 'dracula'
  | 'gruvbox';

export interface ThemePresetMeta {
  id: ThemePreset;
  name: string;
  /** Preview swatches: [bg, surface, accent, fg] */
  lightSwatches: readonly [string, string, string, string];
  darkSwatches: readonly [string, string, string, string];
}

export const THEME_PRESETS: readonly ThemePresetMeta[] = [
  {
    id: 'default',
    name: 'BetterKeePass',
    lightSwatches: ['#fafafa', '#ffffff', '#10b981', '#171717'],
    darkSwatches: ['#0a0a0a', '#171717', '#34d399', '#fafafa'],
  },
  {
    id: 'grafite',
    name: 'Grafite',
    lightSwatches: ['#f2f3f0', '#fafbf8', '#286d55', '#252d2b'],
    darkSwatches: ['#202428', '#292e33', '#7dbaa1', '#e4e8e7'],
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    lightSwatches: ['#e1e2e7', '#e9e9ed', '#2e7de9', '#3760bf'],
    darkSwatches: ['#1a1b26', '#1f2335', '#7aa2f7', '#c0caf5'],
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    lightSwatches: ['#eff1f5', '#ffffff', '#8839ef', '#4c4f69'],
    darkSwatches: ['#1e1e2e', '#262639', '#cba6f7', '#cdd6f4'],
  },
  {
    id: 'nord',
    name: 'Nord',
    lightSwatches: ['#eceff4', '#ffffff', '#5e81ac', '#2e3440'],
    darkSwatches: ['#2e3440', '#333947', '#88c0d0', '#eceff4'],
  },
  {
    id: 'atom',
    name: 'Atom One',
    lightSwatches: ['#fafafa', '#ffffff', '#4078f2', '#383a42'],
    darkSwatches: ['#282c34', '#2c313a', '#61afef', '#abb2bf'],
  },
  {
    id: 'keepassxc',
    name: 'KeePassXC',
    lightSwatches: ['#f5f7f5', '#ffffff', '#4f8f33', '#1e241e'],
    darkSwatches: ['#1e2124', '#24282c', '#6cac4d', '#e6e9ec'],
  },
  {
    id: 'dracula',
    name: 'Dracula',
    lightSwatches: ['#f8f8f2', '#ffffff', '#7c4dff', '#1f1f29'],
    darkSwatches: ['#282a36', '#2d303e', '#bd93f9', '#f8f8f2'],
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    lightSwatches: ['#fbf1c7', '#f9f5d7', '#d65d0e', '#3c3836'],
    darkSwatches: ['#282828', '#32302f', '#fe8019', '#ebdbb2'],
  },
] as const;

const THEME_PRESET_SET = new Set<string>(THEME_PRESETS.map((p) => p.id));

export function isThemeMode(mode: string): mode is ThemeMode {
  return mode === 'system' || mode === 'light' || mode === 'dark';
}

export function isThemePreset(preset: string): preset is ThemePreset {
  return THEME_PRESET_SET.has(preset);
}

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function applyTheme(mode: ThemeMode, preset: ThemePreset = 'default'): boolean {
  const isDark = resolveDark(mode);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
    if (preset !== 'default') {
      root.setAttribute('data-theme', preset);
    } else {
      root.removeAttribute('data-theme');
    }
  }
  return isDark;
}

export function subscribeSystemTheme(mode: ThemeMode, preset: ThemePreset = 'default'): () => void {
  applyTheme(mode, preset);

  if (
    mode !== 'system' ||
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => {};
  }

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    applyTheme('system', preset);
  };

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }
  return () => {};
}
