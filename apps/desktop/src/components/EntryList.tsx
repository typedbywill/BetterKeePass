import { Button, Chip, Input } from '@heroui/react';
import { Command, KeyRound, Plus, Search } from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import type { EntrySummary } from '../lib/tauri';
import { useUiStore } from '../store/ui';

export function EntryList({
  t,
  entries,
}: {
  t: Translations;
  entries: EntrySummary[];
}) {
  const {
    searchQuery,
    setSearchQuery,
    selectedEntryId,
    setSelectedEntryId,
    presentationMode,
    setEntryModalOpen,
    setCommandPaletteOpen,
  } = useUiStore();

  return (
    <section
      aria-label="Lista de entradas"
      className="w-80 shrink-0 border-r border-slate-800 flex flex-col bg-slate-950/50"
    >
      <div className="p-3 border-b border-slate-800 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
              className="pl-8"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            isIconOnly
            aria-label={t.commandPalette}
            onPress={() => setCommandPaletteOpen(true)}
          >
            <Command className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="primary"
            isIconOnly
            aria-label={t.newEntry}
            onPress={() => setEntryModalOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
        {entries.map((entry) => {
          const selected = entry.uuid === selectedEntryId;
          const isPasskey = entry.tags.includes('Passkey');
          return (
            <li key={entry.uuid}>
              <button
                type="button"
                onClick={() => setSelectedEntryId(entry.uuid)}
                className={`w-full text-left p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  selected ? 'bg-slate-800/80' : 'hover:bg-slate-900/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{entry.title}</span>
                  {isPasskey && (
                    <Chip size="sm" color="accent" variant="soft">
                      <KeyRound className="h-3 w-3 mr-1" aria-hidden="true" />
                      Passkey
                    </Chip>
                  )}
                </div>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {presentationMode ? '••••••' : entry.username || entry.url || entry.groupPath}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
