import { memo } from 'react';
import {
  ArrowDownAZ,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  KeyRound,
  Lock,
  MoreHorizontal,
  Plus,
  SearchX,
  Trash2,
  User,
} from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { cn } from '../lib/cn';
import { api, type EntrySummary } from '../lib/tauri';
import { useUiStore } from '../store/ui';
import {
  Avatar,
  Button,
  EmptyState,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  Skeleton,
} from '../ui';

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const clean = query.trim();
  if (!clean || clean.includes(':')) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(clean.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-xs bg-accent-subtle text-accent px-0.5">
        {text.slice(idx, idx + clean.length)}
      </mark>
      {text.slice(idx + clean.length)}
    </>
  );
}

// Memoizado: cada linha é cara (menu, tooltips, avatar) e só deve re-renderizar quando mudar.
const EntryRow = memo(function EntryRow({
  t,
  entry,
  selected,
  isDragging,
  presentationMode,
  searchQuery,
  clipboardClearSeconds,
}: {
  t: Translations;
  entry: EntrySummary;
  selected: boolean;
  isDragging: boolean;
  presentationMode: boolean;
  searchQuery: string;
  clipboardClearSeconds: number;
}) {
  // Seletores individuais: ações são estáveis e não disparam re-render.
  const setSelectedEntryId = useUiStore((s) => s.setSelectedEntryId);
  const setDraggingEntryId = useUiStore((s) => s.setDraggingEntryId);
  const setDeleteConfirmId = useUiStore((s) => s.setDeleteConfirmId);
  const pushToast = useUiStore((s) => s.pushToast);

  async function handleQuickCopy(uuid: string, field: 'password' | 'username') {
    await api.copySecret(uuid, field);
    pushToast({
      kind: 'clipboard',
      title: field === 'password' ? t.copiedPasswordToast : t.copiedUsernameToast,
      clearAfterSeconds: clipboardClearSeconds,
    });
  }

  const hasUsername = Boolean(entry.username);
  const hasPassword = Boolean(entry.hasPassword);
  const hasTotp =
    Boolean(entry.hasOtp) ||
    entry.tags.some((tag) => tag.toLowerCase() === 'otp' || tag.toLowerCase() === 'totp');
  const hasPasskey =
    Boolean(entry.hasPasskey) ||
    entry.tags.some((tag) => tag.toLowerCase() === 'passkey');
  const hasNotes = Boolean(entry.hasNotes);
  const hasUrl = Boolean(entry.url);

  const indicators = [
    hasUsername && { key: 'username', label: t.usernameLabel, Icon: User },
    hasPassword && { key: 'password', label: t.passwordLabel, Icon: Lock },
    hasTotp && { key: 'totp', label: 'TOTP', Icon: Clock },
    hasPasskey && { key: 'passkey', label: 'Passkey', Icon: KeyRound },
    hasNotes && { key: 'notes', label: t.notesLabel, Icon: FileText },
    hasUrl && { key: 'url', label: t.urlLabel, Icon: Globe },
  ].filter(Boolean) as Array<{ key: string; label: string; Icon: typeof User }>;

  const subtitle = presentationMode
    ? '••••••'
    : entry.username || entry.url || entry.groupPath || '—';

  return (
    <li className="group relative shrink-0 [content-visibility:auto] [contain-intrinsic-size:auto_50px]">
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', entry.uuid);
          e.dataTransfer.effectAllowed = 'move';
          setDraggingEntryId(entry.uuid);
        }}
        onDragEnd={() => setDraggingEntryId(null)}
        className={cn(
          'relative flex items-center rounded-lg transition-colors',
          selected
            ? 'bg-surface border border-border shadow-xs'
            : 'border border-transparent hover:bg-surface-hover/70',
          isDragging && 'opacity-50',
        )}
      >
        <button
          type="button"
          onMouseDown={(e) => {
            if (e.button === 0) {
              setSelectedEntryId(entry.uuid);
            }
          }}
          onClick={() => setSelectedEntryId(entry.uuid)}
          className="flex flex-1 items-center gap-2.5 min-w-0 p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg cursor-pointer"
        >
          <Avatar
            title={entry.title}
            url={entry.url}
            iconId={entry.iconId}
            customIconUuid={entry.customIconUuid}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-[13px] text-fg truncate">
                <HighlightMatch text={entry.title} query={searchQuery} />
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-xs text-fg-muted truncate">
                <HighlightMatch text={subtitle} query={searchQuery} />
              </p>
              {indicators.length > 0 && (
                <div
                  className="flex items-center gap-1 shrink-0 text-fg-subtle group-hover:opacity-0 transition-opacity"
                  aria-label={indicators.map((i) => i.label).join(', ')}
                >
                  {indicators.map(({ key, label, Icon }) => (
                    <span
                      key={key}
                      title={label}
                      aria-label={label}
                      className="inline-flex items-center justify-center"
                    >
                      <Icon className="h-3 w-3" aria-hidden="true" />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </button>

        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 flex items-center gap-0.5 rounded-md bg-surface/95 px-0.5 py-0.5 shadow-xs border border-border/60 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity">
          <IconButton
            size="xs"
            variant="ghost"
            label={t.copyUsername}
            onPress={() => void handleQuickCopy(entry.uuid, 'username')}
          >
            <User className="h-3 w-3" aria-hidden="true" />
          </IconButton>
          <IconButton
            size="xs"
            variant="ghost"
            label={t.copyPassword}
            onPress={() => void handleQuickCopy(entry.uuid, 'password')}
          >
            <Copy className="h-3 w-3" aria-hidden="true" />
          </IconButton>
          <Menu
            trigger={
              <Button
                size="xs"
                variant="ghost"
                isIconOnly
                aria-label={`${entry.title} menu`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            }
          >
            <MenuItem
              icon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              shortcut="Ctrl+C"
              onAction={() => void handleQuickCopy(entry.uuid, 'password')}
            >
              {t.copyPassword}
            </MenuItem>
            <MenuItem
              icon={<User className="h-3.5 w-3.5" aria-hidden="true" />}
              shortcut="Ctrl+B"
              onAction={() => void handleQuickCopy(entry.uuid, 'username')}
            >
              {t.copyUsername}
            </MenuItem>
            {entry.url && (
              <MenuItem
                icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
                onAction={() => {
                  window.open(entry.url, '_blank', 'noopener,noreferrer');
                }}
              >
                {t.openUrl}
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem
              variant="danger"
              icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
              shortcut="Del"
              onAction={() => setDeleteConfirmId(entry.uuid)}
            >
              {t.deleteEntry}
            </MenuItem>
          </Menu>
        </div>
      </div>
    </li>
  );
});

export function EntryList({
  t,
  entries,
  isLoading,
}: {
  t: Translations;
  entries: EntrySummary[];
  isLoading?: boolean;
}) {
  const {
    searchQuery,
    setSearchQuery,
    selectedEntryId,
    setSelectedEntryId,
    presentationMode,
    setEntryModalOpen,
    groupFilter,
    sortBy,
    setSortBy,
    listWidth,
    clipboardClearSeconds,
    draggingEntryId,
  } = useUiStore();

  const filterTitle =
    groupFilter === 'all'
      ? t.allEntries
      : groupFilter === 'passkeys'
        ? t.passkeysOnly
        : groupFilter === 'trash'
          ? t.recycleBin
          : groupFilter.groupPath.split('/').pop() || groupFilter.groupPath;

  return (
    <section
      aria-label="Lista de entradas"
      style={{ width: listWidth }}
      className="shrink-0 flex flex-col bg-bg overflow-hidden"
    >
      <div className="px-3 pt-3 pb-2.5 border-b border-border flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-[13px] font-semibold text-fg truncate">{filterTitle}</h2>
            <span className="rounded-full bg-bg-muted px-1.5 py-0.5 text-[10px] font-mono text-fg-muted tabular-nums">
              {entries.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              size="xs"
              variant="ghost"
              label={`${t.sortLabel}: ${sortBy === 'title' ? t.sortTitle : t.sortRecent}`}
              onPress={() => setSortBy(sortBy === 'title' ? 'recent' : 'title')}
            >
              {sortBy === 'title' ? (
                <ArrowDownAZ className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </IconButton>
            <IconButton
              size="xs"
              variant="primary"
              label={t.newEntry}
              shortcut="Ctrl+N"
              onPress={() => setEntryModalOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-2 flex flex-col gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex items-center gap-2.5 p-2 rounded-lg">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <div className="flex-1 flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          {searchQuery.trim() ? (
            <EmptyState
              icon={<SearchX className="h-5 w-5" aria-hidden="true" />}
              title={t.emptySearchTitle}
              description={t.emptySearchDesc}
              action={
                <Button size="xs" variant="secondary" onPress={() => setSearchQuery('')}>
                  {t.clearSearch}
                </Button>
              }
            />
          ) : groupFilter === 'trash' ? (
            <EmptyState
              icon={<Trash2 className="h-5 w-5" aria-hidden="true" />}
              title={t.emptyTrashTitle}
              description={t.emptyTrashDesc}
            />
          ) : (
            <EmptyState
              icon={<FolderOpen className="h-5 w-5" aria-hidden="true" />}
              title={t.emptyVaultTitle}
              description={t.emptyVaultDesc}
              action={
                <Button size="xs" variant="primary" onPress={() => setEntryModalOpen(true)}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.newEntry}
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          {entries.map((entry) => (
            <EntryRow
              key={entry.uuid}
              t={t}
              entry={entry}
              selected={entry.uuid === selectedEntryId}
              isDragging={draggingEntryId === entry.uuid}
              presentationMode={presentationMode}
              searchQuery={searchQuery}
              clipboardClearSeconds={clipboardClearSeconds}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
