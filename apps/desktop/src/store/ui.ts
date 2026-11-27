import { create } from 'zustand';
import type { Language } from '../i18n';
import type { UiConfig } from '../lib/tauri';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ActiveView = 'vault' | 'health' | 'settings';
export type GroupFilter = 'all' | 'passkeys' | 'trash' | { groupPath: string };
export type SortBy = 'title' | 'recent';

export interface ToastItem {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'danger' | 'clipboard';
  title: string;
  description?: string;
  durationMs: number;
  clearAfterSeconds?: number;
  createdAt: number;
}

const RECENT_VAULTS_KEY = 'bkp.recentVaults';

function loadRecentVaults(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(RECENT_VAULTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecentVaults(paths: string[]) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RECENT_VAULTS_KEY, JSON.stringify(paths.slice(0, 5)));
    }
  } catch {
    // ignore storage errors
  }
}

export function clampListWidth(width: number): number {
  return Math.max(220, Math.min(480, Math.round(width)));
}

interface UiState {
  unlocked: boolean;
  vaultPath: string;
  theme: ThemeMode;
  language: Language;
  presentationMode: boolean;
  sidebarCollapsed: boolean;
  listWidth: number;
  sortBy: SortBy;
  faviconsEnabled: boolean;
  clipboardClearSeconds: number;
  configHydrated: boolean;
  activeView: ActiveView;
  groupFilter: GroupFilter;
  selectedEntryId: string | null;
  searchQuery: string;
  commandPaletteOpen: boolean;
  entryModalOpen: boolean;
  shortcutsOpen: boolean;
  deleteConfirmId: string | null;
  toasts: ToastItem[];
  recentVaults: string[];
  setUnlocked: (unlocked: boolean, vaultPath?: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  togglePresentationMode: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setListWidth: (width: number) => void;
  setSortBy: (sortBy: SortBy) => void;
  setFaviconsEnabled: (enabled: boolean) => void;
  setClipboardClearSeconds: (seconds: number) => void;
  hydrateFromConfig: (ui: UiConfig, clipboardClearSeconds?: number) => void;
  setActiveView: (view: ActiveView) => void;
  setGroupFilter: (filter: GroupFilter) => void;
  setSelectedEntryId: (uuid: string | null) => void;
  setSearchQuery: (query: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setEntryModalOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setDeleteConfirmId: (uuid: string | null) => void;
  pushToast: (toast: Omit<ToastItem, 'id' | 'createdAt' | 'durationMs'> & { durationMs?: number }) => string;
  dismissToast: (id: string) => void;
  addRecentVault: (path: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  unlocked: false,
  vaultPath: '',
  theme: 'system',
  language: 'pt-BR',
  presentationMode: false,
  sidebarCollapsed: false,
  listWidth: 320,
  sortBy: 'title',
  faviconsEnabled: false,
  clipboardClearSeconds: 15,
  configHydrated: false,
  activeView: 'vault',
  groupFilter: 'all',
  selectedEntryId: null,
  searchQuery: '',
  commandPaletteOpen: false,
  entryModalOpen: false,
  shortcutsOpen: false,
  deleteConfirmId: null,
  toasts: [],
  recentVaults: loadRecentVaults(),
  setUnlocked: (unlocked, vaultPath) =>
    set((state) => ({
      unlocked,
      vaultPath: vaultPath ?? state.vaultPath,
      selectedEntryId: unlocked ? state.selectedEntryId : null,
      activeView: 'vault',
    })),
  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
  togglePresentationMode: () =>
    set((state) => ({ presentationMode: !state.presentationMode })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setListWidth: (width) => set({ listWidth: clampListWidth(width) }),
  setSortBy: (sortBy) => set({ sortBy }),
  setFaviconsEnabled: (faviconsEnabled) => set({ faviconsEnabled }),
  setClipboardClearSeconds: (clipboardClearSeconds) => set({ clipboardClearSeconds }),
  hydrateFromConfig: (ui, clipboardClearSeconds) =>
    set((state) => ({
      theme:
        ui.theme === 'light' || ui.theme === 'dark' || ui.theme === 'system'
          ? ui.theme
          : state.theme,
      language: ui.language === 'en' || ui.language === 'pt-BR' ? ui.language : state.language,
      presentationMode: Boolean(ui.presentationMode),
      sidebarCollapsed: Boolean(ui.sidebarCollapsed),
      listWidth: typeof ui.listWidth === 'number' ? clampListWidth(ui.listWidth) : state.listWidth,
      faviconsEnabled: Boolean(ui.fetchFavicons),
      sortBy: ui.sortBy === 'recent' ? 'recent' : 'title',
      clipboardClearSeconds: clipboardClearSeconds ?? state.clipboardClearSeconds,
      configHydrated: true,
    })),
  setActiveView: (activeView) => set({ activeView }),
  setGroupFilter: (groupFilter) => set({ groupFilter, activeView: 'vault' }),
  setSelectedEntryId: (selectedEntryId) => set({ selectedEntryId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setEntryModalOpen: (entryModalOpen) => set({ entryModalOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setDeleteConfirmId: (deleteConfirmId) => set({ deleteConfirmId }),
  pushToast: (toast) => {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    const durationMs =
      toast.durationMs ??
      (toast.kind === 'clipboard' && toast.clearAfterSeconds
        ? Math.max(4000, toast.clearAfterSeconds * 1000)
        : 3200);
    const next: ToastItem = {
      ...toast,
      id,
      durationMs,
      createdAt: Date.now(),
    };
    set((state) => {
      const base =
        toast.kind === 'clipboard'
          ? state.toasts.filter((t) => t.kind !== 'clipboard')
          : state.toasts;
      return { toasts: [...base.slice(-3), next] };
    });
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  addRecentVault: (path) =>
    set((state) => {
      const trimmed = path.trim();
      if (!trimmed) return state;
      const next = [trimmed, ...state.recentVaults.filter((p) => p !== trimmed)].slice(0, 5);
      saveRecentVaults(next);
      return { recentVaults: next };
    }),
}));
