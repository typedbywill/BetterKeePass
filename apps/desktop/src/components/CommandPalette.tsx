import { useState } from 'react';
import { Card, Input } from '@heroui/react';
import type { Translations } from '../i18n/pt-BR';
import type { EntrySummary } from '../lib/tauri';
import { useUiStore } from '../store/ui';

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
  } = useUiStore();
  const [filter, setFilter] = useState('');

  if (!commandPaletteOpen) return null;

  const q = filter.trim().toLowerCase();
  const filteredEntries = entries.filter(
    (e) =>
      !q ||
      e.title.toLowerCase().includes(q) ||
      e.username.toLowerCase().includes(q),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.commandPalette}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 p-4"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <Card
        className="w-full max-w-lg border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Card.Content className="flex flex-col gap-2">
          <Input
            autoFocus
            placeholder={t.commandPalette}
            aria-label={t.commandPalette}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <ul className="max-h-64 overflow-y-auto flex flex-col gap-1">
            <li>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-slate-800"
                onClick={() => {
                  setCommandPaletteOpen(false);
                  setEntryModalOpen(true);
                }}
              >
                + {t.newEntry}
              </button>
            </li>
            <li>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-slate-800"
                onClick={() => {
                  togglePresentationMode();
                  setCommandPaletteOpen(false);
                }}
              >
                {t.presentationMode}
              </button>
            </li>
            <li>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-slate-800"
                onClick={() => {
                  setActiveView('health');
                  setCommandPaletteOpen(false);
                }}
              >
                {t.health}
              </button>
            </li>
            {filteredEntries.slice(0, 8).map((entry) => (
              <li key={entry.uuid}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-slate-800 flex justify-between"
                  onClick={() => {
                    setSelectedEntryId(entry.uuid);
                    setActiveView('vault');
                    setCommandPaletteOpen(false);
                  }}
                >
                  <span>{entry.title}</span>
                  <span className="text-xs text-slate-400">{entry.groupPath}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card.Content>
      </Card>
    </div>
  );
}
