import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CommandPalette } from './components/CommandPalette';
import { EntryDetail } from './components/EntryDetail';
import { EntryList } from './components/EntryList';
import { EntryModal } from './components/EntryModal';
import { HealthView } from './components/HealthView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { UnlockScreen } from './components/UnlockScreen';
import { getTranslations } from './i18n';
import { api } from './lib/tauri';
import { useUiStore } from './store/ui';

export function App() {
  const {
    unlocked,
    theme,
    language,
    presentationMode,
    activeView,
    groupFilter,
    searchQuery,
    setCommandPaletteOpen,
  } = useUiStore();

  const t = getTranslations(language);

  useEffect(() => {
    const prefersDark =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, [theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (unlocked) setCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [unlocked, setCommandPaletteOpen]);

  const entriesQuery = useQuery({
    queryKey: ['entries', searchQuery],
    queryFn: () => api.listEntries(searchQuery),
    enabled: unlocked,
  });

  const treeQuery = useQuery({
    queryKey: ['group-tree'],
    queryFn: () => api.getGroupTree(),
    enabled: unlocked,
  });

  const visibleEntries = useMemo(() => {
    const list = entriesQuery.data ?? [];
    if (groupFilter === 'all') {
      return list.filter((e) => !e.groupPath.startsWith('Recycle Bin'));
    }
    if (groupFilter === 'passkeys') {
      return list.filter((e) => e.tags.includes('Passkey'));
    }
    if (groupFilter === 'trash') {
      return list.filter((e) => e.groupPath.startsWith('Recycle Bin'));
    }
    return list.filter(
      (e) =>
        e.groupPath === groupFilter.groupPath ||
        e.groupPath.startsWith(`${groupFilter.groupPath}/`),
    );
  }, [entriesQuery.data, groupFilter]);

  if (!unlocked) {
    return <UnlockScreen t={t} />;
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {presentationMode && (
        <div
          role="status"
          className="bg-amber-900/70 text-amber-100 text-xs text-center py-1 px-3 border-b border-amber-700"
        >
          {t.presentationActive}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <Sidebar t={t} tree={treeQuery.data} />

        {activeView === 'vault' && (
          <main className="flex-1 flex min-w-0">
            <EntryList t={t} entries={visibleEntries} />
            <EntryDetail t={t} />
          </main>
        )}

        {activeView === 'health' && <HealthView t={t} />}
        {activeView === 'settings' && <SettingsView t={t} />}
      </div>

      <CommandPalette t={t} entries={entriesQuery.data ?? []} />
      <EntryModal t={t} />
    </div>
  );
}
