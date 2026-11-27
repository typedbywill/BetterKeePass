import { create } from 'zustand';
import type { Language } from '../i18n';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ActiveView = 'vault' | 'health' | 'settings';
export type GroupFilter = 'all' | 'passkeys' | 'trash' | { groupPath: string };

interface UiState {
  unlocked: boolean;
  vaultPath: string;
  theme: ThemeMode;
  language: Language;
  presentationMode: boolean;
  activeView: ActiveView;
  groupFilter: GroupFilter;
  selectedEntryId: string | null;
  searchQuery: string;
  commandPaletteOpen: boolean;
  entryModalOpen: boolean;
  setUnlocked: (unlocked: boolean, vaultPath?: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  togglePresentationMode: () => void;
  setActiveView: (view: ActiveView) => void;
  setGroupFilter: (filter: GroupFilter) => void;
  setSelectedEntryId: (uuid: string | null) => void;
  setSearchQuery: (query: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setEntryModalOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  unlocked: false,
  vaultPath: '',
  theme: 'system',
  language: 'pt-BR',
  presentationMode: false,
  activeView: 'vault',
  groupFilter: 'all',
  selectedEntryId: null,
  searchQuery: '',
  commandPaletteOpen: false,
  entryModalOpen: false,
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
  setActiveView: (activeView) => set({ activeView }),
  setGroupFilter: (groupFilter) => set({ groupFilter, activeView: 'vault' }),
  setSelectedEntryId: (selectedEntryId) => set({ selectedEntryId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setEntryModalOpen: (entryModalOpen) => set({ entryModalOpen }),
}));
