import { create } from 'zustand';
import type { Language } from '../i18n';
import type { UiConfig } from '../lib/tauri';
import { isThemeMode, type ThemeMode } from '../lib/theme';

export type { ThemeMode };
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
const EXPANDED_GROUPS_KEY = 'bkp.expandedGroups';

function loadStringArray(key: string): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveStringArray(key: string, items: string[]) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(items));
    }
  } catch {
    // ignore storage errors
  }
}

function loadRecentVaults(): string[] {
  return loadStringArray(RECENT_VAULTS_KEY);
}

function saveRecentVaults(paths: string[]) {
  saveStringArray(RECENT_VAULTS_KEY, paths.slice(0, 5));
}

function loadExpandedGroups(): string[] {
  return loadStringArray(EXPANDED_GROUPS_KEY);
}

function saveExpandedGroups(ids: string[]) {
  saveStringArray(EXPANDED_GROUPS_KEY, ids);
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
  expandedGroups: string[];
  draggingEntryId: string | null;
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
  hydrateFromConfig: (ui: UiConfig, clipboardClearSeconds?: number, managedByNix?: boolean) => void;
  toggleGroupExpanded: (groupId: string) => void;
  setGroupExpanded: (groupId: string, expanded: boolean) => void;
  setDraggingEntryId: (uuid: string | null) => void;
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
  expandedGroups: loadExpandedGroups(),
  draggingEntryId: null,
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
  hydrateFromConfig: (ui, clipboardClearSeconds, managedByNix) =>
    set((state) => {
      const nextExpanded =
        !managedByNix && Array.isArray(ui.expandedGroups)
          ? ui.expandedGroups
          : state.expandedGroups;
      if (!managedByNix && Array.isArray(ui.expandedGroups)) {
        saveExpandedGroups(nextExpanded);
      }
      return {
        theme: isThemeMode(ui.theme) ? ui.theme : state.theme,
        language: ui.language === 'en' || ui.language === 'pt-BR' ? ui.language : state.language,
        presentationMode: Boolean(ui.presentationMode),
        sidebarCollapsed: Boolean(ui.sidebarCollapsed),
        listWidth: typeof ui.listWidth === 'number' ? clampListWidth(ui.listWidth) : state.listWidth,
        faviconsEnabled: Boolean(ui.fetchFavicons),
        sortBy: ui.sortBy === 'recent' ? 'recent' : 'title',
        clipboardClearSeconds: clipboardClearSeconds ?? state.clipboardClearSeconds,
        expandedGroups: nextExpanded,
        configHydrated: true,
      };
    }),
  toggleGroupExpanded: (groupId) =>
    set((state) => {
      const exists = state.expandedGroups.includes(groupId);
      const next = exists
        ? state.expandedGroups.filter((id) => id !== groupId)
        : [...state.expandedGroups, groupId];
      saveExpandedGroups(next);
      return { expandedGroups: next };
    }),
  setGroupExpanded: (groupId, expanded) =>
    set((state) => {
      const exists = state.expandedGroups.includes(groupId);
      if (exists === expanded) return state;
      const next = expanded
        ? [...state.expandedGroups, groupId]
        : state.expandedGroups.filter((id) => id !== groupId);
      saveExpandedGroups(next);
      return { expandedGroups: next };
    }),
  setDraggingEntryId: (draggingEntryId) => set({ draggingEntryId }),
  setActiveView: (activeView) => set({ activeView }),
  setGroupFilter: (groupFilter) => set({ groupFilter, activeView: 'vault' }),
  setSelectedEntryId: (selectedEntryId) =>
    set({ selectedEntryId, entryModalOpen: false }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setEntryModalOpen: (entryModalOpen) =>
    set((state) => ({
      entryModalOpen,
      activeView: entryModalOpen ? 'vault' : state.activeView,
    })),
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
