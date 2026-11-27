import { Button } from '@heroui/react';
import {
  EyeOff,
  Folder,
  HeartPulse,
  KeyRound,
  Lock,
  Settings,
  Shield,
  Trash2,
} from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import type { GroupNode } from '../lib/tauri';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';

export function Sidebar({ t, tree }: { t: Translations; tree?: GroupNode }) {
  const {
    groupFilter,
    activeView,
    presentationMode,
    setGroupFilter,
    setActiveView,
    togglePresentationMode,
    setUnlocked,
  } = useUiStore();

  async function handleLock() {
    await api.lockVault();
    setUnlocked(false);
  }

  return (
    <aside
      aria-label="Navegação do cofre"
      className="w-64 shrink-0 border-r border-slate-800 bg-slate-900/60 p-3 flex flex-col justify-between gap-4"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <Shield className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          <span className="font-semibold text-sm">{t.appName}</span>
        </div>

        <Button
          variant={activeView === 'vault' && groupFilter === 'all' ? 'primary' : 'ghost'}
          size="sm"
          className="justify-start"
          onPress={() => setGroupFilter('all')}
        >
          <Folder className="h-4 w-4" aria-hidden="true" />
          {t.allEntries}
        </Button>

        <Button
          variant={activeView === 'vault' && groupFilter === 'passkeys' ? 'primary' : 'ghost'}
          size="sm"
          className="justify-start"
          onPress={() => setGroupFilter('passkeys')}
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {t.passkeysOnly}
        </Button>

        <Button
          variant={activeView === 'vault' && groupFilter === 'trash' ? 'primary' : 'ghost'}
          size="sm"
          className="justify-start"
          onPress={() => setGroupFilter('trash')}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t.recycleBin}
        </Button>

        {tree && tree.children.length > 0 && (
          <div className="mt-4">
            <p className="px-2 text-xs uppercase tracking-wider text-slate-400 mb-1">
              {t.groups}
            </p>
            <ul className="flex flex-col gap-1">
              {tree.children
                .filter((c) => !c.isRecycleBin)
                .map((group) => {
                  const isActive =
                    activeView === 'vault' &&
                    typeof groupFilter === 'object' &&
                    groupFilter.groupPath === group.path;
                  return (
                    <li key={group.uuid}>
                      <Button
                        variant={isActive ? 'primary' : 'ghost'}
                        size="sm"
                        fullWidth
                        className="justify-between"
                        onPress={() => setGroupFilter({ groupPath: group.path })}
                      >
                        <span className="truncate">{group.name}</span>
                        <span className="text-xs opacity-70">{group.entryCount}</span>
                      </Button>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-slate-800 pt-3">
        <Button
          variant={activeView === 'health' ? 'primary' : 'ghost'}
          size="sm"
          className="justify-start"
          onPress={() => setActiveView('health')}
        >
          <HeartPulse className="h-4 w-4" aria-hidden="true" />
          {t.health}
        </Button>

        <Button
          variant={activeView === 'settings' ? 'primary' : 'ghost'}
          size="sm"
          className="justify-start"
          onPress={() => setActiveView('settings')}
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          {t.settings}
        </Button>

        <Button
          variant={presentationMode ? 'primary' : 'ghost'}
          size="sm"
          className="justify-start"
          onPress={togglePresentationMode}
        >
          <EyeOff className="h-4 w-4" aria-hidden="true" />
          {t.presentationMode}
        </Button>

        <Button variant="ghost" size="sm" className="justify-start" onPress={handleLock}>
          <Lock className="h-4 w-4" aria-hidden="true" />
          {t.lockVault}
        </Button>
      </div>
    </aside>
  );
}
