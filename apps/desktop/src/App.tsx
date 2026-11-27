import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeOff } from 'lucide-react';
import { CommandPalette } from './components/CommandPalette';
import { EntryDetail } from './components/EntryDetail';
import { EntryList } from './components/EntryList';
import { HealthView } from './components/HealthView';
import { SettingsView } from './components/SettingsView';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { Sidebar } from './components/Sidebar';
import { UnlockScreen } from './components/UnlockScreen';
import { useHotkeys } from './hooks/useHotkeys';
import { getTranslations } from './i18n';
import { api } from './lib/tauri';
import { subscribeSystemTheme } from './lib/theme';
import { useUiStore } from './store/ui';
import { AlertDialog, ResizeHandle, ToastViewport } from './ui';

export function App() {
  const queryClient = useQueryClient();
  const {
    unlocked,
    theme,
    language,
    presentationMode,
    sidebarCollapsed,
    listWidth,
    faviconsEnabled,
    sortBy,
    expandedGroups,
    configHydrated,
    clipboardClearSeconds,
    activeView,
    groupFilter,
    searchQuery,
    selectedEntryId,
    commandPaletteOpen,
    entryModalOpen,
    shortcutsOpen,
    deleteConfirmId,
    setListWidth,
    setSelectedEntryId,
    setCommandPaletteOpen,
    setEntryModalOpen,
    setShortcutsOpen,
    setDeleteConfirmId,
    toggleSidebar,
    togglePresentationMode,
    setUnlocked,
    hydrateFromConfig,
    pushToast,
  } = useUiStore();

  const t = getTranslations(language);
  const detailRef = useRef<HTMLElement | null>(null);
  const [editRequestNonce, setEditRequestNonce] = useState(0);

  // Apply theme for both UnlockScreen and unlocked shell, reacting to OS theme changes.
  useEffect(() => {
    return subscribeSystemTheme(theme);
  }, [theme]);

  const configQuery = useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.getConfig(),
  });

  useEffect(() => {
    if (configQuery.data && !configHydrated) {
      hydrateFromConfig(
        configQuery.data.ui,
        configQuery.data.clipboard.clearAfterSeconds,
        configQuery.data.managedByNix,
      );
    }
  }, [configQuery.data, configHydrated, hydrateFromConfig]);

  const faviconsWereEnabled = useRef(faviconsEnabled);

  // Persist discrete UI preferences immediately so toggles (e.g. favicons, expandedGroups)
  // never race with backend checks or app shutdown.
  useEffect(() => {
    if (!configHydrated || configQuery.data?.managedByNix) return;
    // Só refaz a busca quando os favicons acabaram de ser ligados.
    const faviconsTurnedOn = faviconsEnabled && !faviconsWereEnabled.current;
    faviconsWereEnabled.current = faviconsEnabled;
    void api
      .setUiConfig({
        theme,
        language,
        presentationMode,
        sidebarCollapsed,
        listWidth,
        fetchFavicons: faviconsEnabled,
        sortBy,
        expandedGroups,
      })
      .then(() => {
        if (faviconsTurnedOn) {
          void queryClient.invalidateQueries({ queryKey: ['favicon'] });
        }
      });
  }, [
    configHydrated,
    configQuery.data?.managedByNix,
    queryClient,
    theme,
    language,
    presentationMode,
    sidebarCollapsed,
    faviconsEnabled,
    sortBy,
    expandedGroups,
    // listWidth is intentionally excluded here and debounced below
  ]);

  // Debounce listWidth persistence separately while dragging the resize handle.
  useEffect(() => {
    if (!configHydrated || configQuery.data?.managedByNix) return;
    const timer = setTimeout(() => {
      void api.setUiConfig({
        theme,
        language,
        presentationMode,
        sidebarCollapsed,
        listWidth,
        fetchFavicons: faviconsEnabled,
        sortBy,
        expandedGroups,
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [listWidth]);

  const allEntriesQuery = useQuery({
    queryKey: ['entries', ''],
    queryFn: () => api.listEntries(''),
    enabled: unlocked,
  });

  const entriesQuery = useQuery({
    queryKey: ['entries', searchQuery],
    queryFn: () => api.listEntries(searchQuery),
    enabled: unlocked,
    placeholderData: keepPreviousData,
  });

  const treeQuery = useQuery({
    queryKey: ['group-tree'],
    queryFn: () => api.getGroupTree(),
    enabled: unlocked,
  });

  const sidebarCounts = useMemo(() => {
    const all = allEntriesQuery.data ?? [];
    return {
      all: all.filter((e) => !e.groupPath.startsWith('Recycle Bin')).length,
      passkeys: all.filter((e) => e.tags.includes('Passkey')).length,
      trash: all.filter((e) => e.groupPath.startsWith('Recycle Bin')).length,
    };
  }, [allEntriesQuery.data]);

  const visibleEntries = useMemo(() => {
    const list = entriesQuery.data ?? [];
    const filtered =
      groupFilter === 'all'
        ? list.filter((e) => !e.groupPath.startsWith('Recycle Bin'))
        : groupFilter === 'passkeys'
          ? list.filter((e) => e.tags.includes('Passkey'))
          : groupFilter === 'trash'
            ? list.filter((e) => e.groupPath.startsWith('Recycle Bin'))
            : list.filter(
                (e) =>
                  e.groupPath === groupFilter.groupPath ||
                  e.groupPath.startsWith(`${groupFilter.groupPath}/`),
              );

    if (sortBy === 'title') {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    return [...filtered].reverse();
  }, [entriesQuery.data, groupFilter, sortBy]);

  const moveSelection = useCallback(
    (delta: -1 | 1) => {
      if (visibleEntries.length === 0) return;
      const idx = visibleEntries.findIndex((e) => e.uuid === selectedEntryId);
      if (idx < 0) {
        setSelectedEntryId(delta > 0 ? visibleEntries[0].uuid : visibleEntries[visibleEntries.length - 1].uuid);
        return;
      }
      const next = Math.max(0, Math.min(visibleEntries.length - 1, idx + delta));
      setSelectedEntryId(visibleEntries[next].uuid);
    },
    [visibleEntries, selectedEntryId, setSelectedEntryId],
  );

  const copySelected = useCallback(
    async (field: 'password' | 'username' | 'totp') => {
      if (!selectedEntryId) return;
      await api.copySecret(selectedEntryId, field);
      pushToast({
        kind: 'clipboard',
        title:
          field === 'password'
            ? t.copiedPasswordToast
            : field === 'username'
              ? t.copiedUsernameToast
              : t.copiedTotpToast,
        clearAfterSeconds: clipboardClearSeconds,
      });
    },
    [selectedEntryId, pushToast, t, clipboardClearSeconds],
  );

  useHotkeys({
    enabled: unlocked,
    hasOpenModal:
      commandPaletteOpen || entryModalOpen || shortcutsOpen || Boolean(deleteConfirmId),
    onOpenPalette: () => setCommandPaletteOpen(true),
    onFocusSearch: () => setCommandPaletteOpen(true),
    onMoveSelection: moveSelection,
    onFocusDetail: () => detailRef.current?.focus(),
    onCopyPassword: () => void copySelected('password'),
    onCopyUsername: () => void copySelected('username'),
    onCopyTotp: () => void copySelected('totp'),
    onNewEntry: () => setEntryModalOpen(true),
    onEditEntry: () => {
      if (selectedEntryId) setEditRequestNonce((n) => n + 1);
    },
    onDeleteEntry: () => {
      if (selectedEntryId) setDeleteConfirmId(selectedEntryId);
    },
    onLockVault: () => {
      void api.lockVault().then(() => setUnlocked(false));
    },
    onToggleSidebar: toggleSidebar,
    onTogglePresentation: togglePresentationMode,
    onOpenShortcuts: () => setShortcutsOpen(true),
    onEscape: () => {
      if (commandPaletteOpen) setCommandPaletteOpen(false);
      else if (entryModalOpen) setEntryModalOpen(false);
      else if (shortcutsOpen) setShortcutsOpen(false);
      else if (deleteConfirmId) setDeleteConfirmId(null);
    },
  });

  async function handleConfirmDelete() {
    if (!deleteConfirmId) return;
    const targetId = deleteConfirmId;
    await api.deleteEntry(targetId);
    if (selectedEntryId === targetId) {
      setSelectedEntryId(null);
    }
    pushToast({ kind: 'info', title: t.deletedToast });
    await queryClient.invalidateQueries({ queryKey: ['entries'] });
    await queryClient.invalidateQueries({ queryKey: ['group-tree'] });
  }

  if (!unlocked) {
    return (
      <>
        <UnlockScreen t={t} />
        <ToastViewport clearingLabel={t.clipboardClearingIn} />
      </>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg text-fg overflow-hidden">
      {presentationMode && (
        <div
          role="status"
          className="flex items-center justify-center py-1 px-3 border-b border-border bg-bg-subtle"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-subtle px-2.5 py-0.5 text-[11px] font-medium text-warning">
            <EyeOff className="h-3 w-3" aria-hidden="true" />
            {t.presentationActive}
          </span>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <Sidebar t={t} tree={treeQuery.data} counts={sidebarCounts} />

        {activeView === 'vault' && (
          <main className="flex-1 flex min-w-0">
            <EntryList
              t={t}
              entries={visibleEntries}
              isLoading={entriesQuery.isLoading}
            />
            <ResizeHandle
              value={listWidth}
              min={220}
              max={480}
              onChange={setListWidth}
            />
            <EntryDetail
              t={t}
              detailRef={detailRef}
              editRequestNonce={editRequestNonce}
            />
          </main>
        )}

        {activeView === 'health' && <HealthView t={t} />}
        {activeView === 'settings' && <SettingsView t={t} />}
      </div>

      <CommandPalette t={t} entries={allEntriesQuery.data ?? []} />
      <ShortcutsDialog t={t} />
      <AlertDialog
        isOpen={Boolean(deleteConfirmId)}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
        title={t.deleteConfirmTitle}
        description={t.deleteConfirmDesc}
        confirmLabel={t.deleteConfirmAction}
        cancelLabel={t.cancel}
        variant="danger"
        onConfirm={handleConfirmDelete}
      />
      <ToastViewport clearingLabel={t.clipboardClearingIn} />
    </div>
  );
}
