import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  EyeOff,
  HeartPulse,
  HelpCircle,
  KeyRound,
  Lock,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { cn } from '../lib/cn';
import { api, type EntrySummary } from '../lib/tauri';
import { useUiStore } from '../store/ui';
import { Avatar, Badge, Dialog, Kbd } from '../ui';

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const hay = text.toLowerCase();
  const needle = query.toLowerCase();
  if (hay.includes(needle)) return true;
  let qi = 0;
  for (let i = 0; i < hay.length && qi < needle.length; i += 1) {
    if (hay[i] === needle[qi]) qi += 1;
  }
  return qi === needle.length;
}

type PaletteItem =
  | {
      kind: 'command';
      id: string;
      label: string;
      icon: ReactNode;
      shortcut?: string;
      run: () => void;
    }
  | {
      kind: 'entry';
      id: string;
      entry: EntrySummary;
    };

export function CommandPalette({
  t,
  entries,
}: {
  t: Translations;
  entries: EntrySummary[];
}) {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setSelectedEntryId,
    togglePresentationMode,
    setActiveView,
    setEntryModalOpen,
    setShortcutsOpen,
    setTheme,
    setUnlocked,
    presentationMode,
    clipboardClearSeconds,
    pushToast,
  } = useUiStore();

  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (commandPaletteOpen) {
      setFilter('');
      setActiveIndex(0);
    }
  }, [commandPaletteOpen]);

  const commands = useMemo<Extract<PaletteItem, { kind: 'command' }>[]>(
    () => [
      {
        kind: 'command',
        id: 'new-entry',
        label: t.newEntry,
        icon: <Plus className="h-3.5 w-3.5 text-accent" aria-hidden="true" />,
        shortcut: 'Ctrl+N',
        run: () => {
          setCommandPaletteOpen(false);
          setEntryModalOpen(true);
        },
      },
      {
        kind: 'command',
        id: 'presentation',
        label: t.presentationMode,
        icon: <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />,
        shortcut: 'Ctrl+Shift+P',
        run: () => {
          togglePresentationMode();
          setCommandPaletteOpen(false);
        },
      },
      {
        kind: 'command',
        id: 'health',
        label: t.health,
        icon: <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />,
        run: () => {
          setActiveView('health');
          setCommandPaletteOpen(false);
        },
      },
      {
        kind: 'command',
        id: 'settings',
        label: t.settings,
        icon: <Settings className="h-3.5 w-3.5" aria-hidden="true" />,
        run: () => {
          setActiveView('settings');
          setCommandPaletteOpen(false);
        },
      },
      {
        kind: 'command',
        id: 'theme-light',
        label: `${t.themeLabel}: ${t.themeLight}`,
        icon: <Sun className="h-3.5 w-3.5" aria-hidden="true" />,
        run: () => {
          setTheme('light');
          setCommandPaletteOpen(false);
        },
      },
      {
        kind: 'command',
        id: 'theme-dark',
        label: `${t.themeLabel}: ${t.themeDark}`,
        icon: <Moon className="h-3.5 w-3.5" aria-hidden="true" />,
        run: () => {
          setTheme('dark');
          setCommandPaletteOpen(false);
        },
      },
      {
        kind: 'command',
        id: 'theme-system',
        label: `${t.themeLabel}: ${t.themeSystem}`,
        icon: <Monitor className="h-3.5 w-3.5" aria-hidden="true" />,
        run: () => {
          setTheme('system');
          setCommandPaletteOpen(false);
        },
      },
      {
        kind: 'command',
        id: 'shortcuts',
        label: t.shortcutsTitle,
        icon: <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />,
        shortcut: '?',
        run: () => {
          setCommandPaletteOpen(false);
          setShortcutsOpen(true);
        },
      },
      {
        kind: 'command',
        id: 'lock',
        label: t.lockVault,
        icon: <Lock className="h-3.5 w-3.5" aria-hidden="true" />,
        shortcut: 'Ctrl+L',
        run: () => {
          void api.lockVault().then(() => {
            setCommandPaletteOpen(false);
            setUnlocked(false);
          });
        },
      },
    ],
    [
      t,
      setCommandPaletteOpen,
      setEntryModalOpen,
      togglePresentationMode,
      setActiveView,
      setTheme,
      setShortcutsOpen,
      setUnlocked,
    ],
  );

  const q = filter.trim();

  const filteredCommands = useMemo(
    () => commands.filter((c) => fuzzyMatch(c.label, q)),
    [commands, q],
  );

  const filteredEntries = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            fuzzyMatch(e.title, q) ||
            fuzzyMatch(e.username, q) ||
            fuzzyMatch(e.url, q) ||
            fuzzyMatch(e.groupPath, q),
        )
        .slice(0, 8),
    [entries, q],
  );

  const flatItems = useMemo<PaletteItem[]>(() => {
    const entryItems: PaletteItem[] = filteredEntries.map((entry) => ({
      kind: 'entry',
      id: entry.uuid,
      entry,
    }));
    // When searching, show matching entries first; when empty, show commands first.
    return q ? [...entryItems, ...filteredCommands] : [...filteredCommands, ...entryItems];
  }, [filteredCommands, filteredEntries, q]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filter]);

  async function executeItem(item: PaletteItem, openOnly: boolean) {
    if (item.kind === 'command') {
      item.run();
      return;
    }
    if (openOnly) {
      setSelectedEntryId(item.entry.uuid);
      setActiveView('vault');
      setCommandPaletteOpen(false);
      return;
    }
    await api.copySecret(item.entry.uuid, 'password');
    setSelectedEntryId(item.entry.uuid);
    setActiveView('vault');
    setCommandPaletteOpen(false);
    pushToast({
      kind: 'clipboard',
      title: `${item.entry.title} · ${t.copiedPasswordToast}`,
      clearAfterSeconds: clipboardClearSeconds,
    });
  }

  const commandSlice = flatItems.filter((i) => i.kind === 'command');
  const entrySlice = flatItems.filter((i) => i.kind === 'entry');

  function renderItem(item: PaletteItem) {
    const idx = flatItems.indexOf(item);
    const active = idx === activeIndex;

    if (item.kind === 'command') {
      return (
        <li key={item.id}>
          <button
            type="button"
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => void executeItem(item, false)}
            className={cn(
              'w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] rounded-lg transition-colors cursor-pointer text-left',
              active ? 'bg-surface-hover text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            <span className="flex items-center gap-2.5 truncate">
              {item.icon}
              <span className="truncate">{item.label}</span>
            </span>
            {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
          </button>
        </li>
      );
    }

    const { entry } = item;
    return (
      <li key={item.id}>
        <button
          type="button"
          onMouseEnter={() => setActiveIndex(idx)}
          onClick={(e) => void executeItem(item, !(e.ctrlKey || e.metaKey) && false)}
          className={cn(
            'w-full flex items-center justify-between gap-3 px-3 py-2 text-[13px] rounded-lg transition-colors cursor-pointer text-left',
            active ? 'bg-surface-hover text-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Avatar
              title={entry.title}
              url={entry.url}
              iconId={entry.iconId}
              customIconUuid={entry.customIconUuid}
              size="sm"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="font-medium text-fg truncate">{entry.title}</span>
                {entry.tags.includes('Passkey') && (
                  <Badge variant="accent">
                    <KeyRound className="h-2.5 w-2.5" aria-hidden="true" />
                    Passkey
                  </Badge>
                )}
              </span>
              <span className="text-[11px] text-fg-subtle truncate block">
                {presentationMode ? '••••••' : entry.username || entry.url || entry.groupPath}
              </span>
            </span>
          </span>
          <span className="text-[11px] text-fg-subtle shrink-0">
            {entry.groupPath || 'Root'}
          </span>
        </button>
      </li>
    );
  }

  return (
    <Dialog
      isOpen={commandPaletteOpen}
      onOpenChange={setCommandPaletteOpen}
      ariaLabel={t.commandPalette}
      placement="top"
      size="md"
      showCloseButton={false}
    >
      <div
        className="flex flex-col overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => (flatItems.length ? (i + 1) % flatItems.length : 0));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) =>
              flatItems.length ? (i - 1 + flatItems.length) % flatItems.length : 0,
            );
          } else if (e.key === 'Enter' && flatItems[activeIndex]) {
            e.preventDefault();
            void executeItem(flatItems[activeIndex], e.ctrlKey || e.metaKey);
          }
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
          <Search className="h-4 w-4 text-fg-subtle shrink-0" aria-hidden="true" />
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t.commandPalettePlaceholder}
            aria-label={t.commandPalette}
            className="w-full bg-transparent text-[13px] text-fg placeholder:text-fg-subtle outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 flex flex-col gap-3">
          {flatItems.length === 0 ? (
            <p className="py-8 text-center text-xs text-fg-muted">{t.noCommandResults}</p>
          ) : q ? (
            <>
              {entrySlice.length > 0 && (
                <div>
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                    {t.entriesSection}
                  </p>
                  <ul className="flex flex-col gap-0.5">{entrySlice.map(renderItem)}</ul>
                </div>
              )}
              {commandSlice.length > 0 && (
                <div>
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                    {t.commandsSection}
                  </p>
                  <ul className="flex flex-col gap-0.5">{commandSlice.map(renderItem)}</ul>
                </div>
              )}
            </>
          ) : (
            <>
              {commandSlice.length > 0 && (
                <div>
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                    {t.commandsSection}
                  </p>
                  <ul className="flex flex-col gap-0.5">{commandSlice.map(renderItem)}</ul>
                </div>
              )}
              {entrySlice.length > 0 && (
                <div>
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                    {t.entriesSection}
                  </p>
                  <ul className="flex flex-col gap-0.5">{entrySlice.map(renderItem)}</ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-bg-subtle px-3.5 py-2 text-[11px] text-fg-subtle">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd>Enter</Kbd>
              <span>{t.copyPasswordHint}</span>
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Ctrl+Enter</Kbd>
              <span>{t.openEntryHint}</span>
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </span>
        </div>
      </div>
    </Dialog>
  );
}
