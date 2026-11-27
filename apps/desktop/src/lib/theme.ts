export type BaseThemeMode = 'system' | 'light' | 'dark';

export type CustomThemeId =
  | 'tokyo-night'
  | 'catppuccin-mocha'
  | 'catppuccin-latte'
  | 'nord'
  | 'atom-one-dark'
  | 'keepassxc'
  | 'dracula'
  | 'gruvbox-dark';

export type ThemeMode = BaseThemeMode | CustomThemeId;

export interface CustomThemeMeta {
  id: CustomThemeId;
  name: string;
  isDark: boolean;
  /** Preview swatches: [bg, surface, accent, fg] */
  swatches: readonly [string, string, string, string];
}

export const CUSTOM_THEMES: readonly CustomThemeMeta[] = [
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    isDark: true,
    swatches: ['#1a1b26', '#1f2335', '#7aa2f7', '#c0caf5'],
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    isDark: true,
    swatches: ['#1e1e2e', '#262639', '#cba6f7', '#cdd6f4'],
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    isDark: false,
    swatches: ['#eff1f5', '#ffffff', '#8839ef', '#4c4f69'],
  },
  {
    id: 'nord',
    name: 'Nord',
    isDark: true,
    swatches: ['#2e3440', '#333947', '#88c0d0', '#eceff4'],
  },
  {
    id: 'atom-one-dark',
    name: 'Atom One Dark',
    isDark: true,
    swatches: ['#282c34', '#2c313a', '#61afef', '#abb2bf'],
  },
  {
    id: 'keepassxc',
    name: 'KeePassXC',
    isDark: true,
    swatches: ['#1e2124', '#24282c', '#6cac4d', '#e6e9ec'],
  },
  {
    id: 'dracula',
    name: 'Dracula',
    isDark: true,
    swatches: ['#282a36', '#2d303e', '#bd93f9', '#f8f8f2'],
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    isDark: true,
    swatches: ['#282828', '#32302f', '#fe8019', '#ebdbb2'],
  },
] as const;

const CUSTOM_THEME_MAP = new Map<string, CustomThemeMeta>(
  CUSTOM_THEMES.map((theme) => [theme.id, theme]),
);

export function isCustomTheme(mode: string): mode is CustomThemeId {
  return CUSTOM_THEME_MAP.has(mode);
}

export function isThemeMode(mode: string): mode is ThemeMode {
  return mode === 'system' || mode === 'light' || mode === 'dark' || isCustomTheme(mode);
}

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  const custom = CUSTOM_THEME_MAP.get(mode);
  if (custom) return custom.isDark;
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
    if (isCustomTheme(mode)) {
      root.setAttribute('data-theme', mode);
    } else {
      root.removeAttribute('data-theme');
    }
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
