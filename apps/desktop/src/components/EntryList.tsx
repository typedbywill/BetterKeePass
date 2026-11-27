import type { RefObject } from 'react';
import {
  ArrowDownAZ,
  Clock,
  Copy,
  ExternalLink,
  FolderOpen,
  KeyRound,
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
  Badge,
  Button,
  EmptyState,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  SearchField,
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

export function EntryList({
  t,
  entries,
  isLoading,
  searchInputRef,
}: {
  t: Translations;
  entries: EntrySummary[];
  isLoading?: boolean;
  searchInputRef?: RefObject<HTMLInputElement | null>;
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
    setDraggingEntryId,
    pushToast,
    setDeleteConfirmId,
  } = useUiStore();

  const filterTitle =
    groupFilter === 'all'
      ? t.allEntries
      : groupFilter === 'passkeys'
        ? t.passkeysOnly
        : groupFilter === 'trash'
          ? t.recycleBin
          : groupFilter.groupPath.split('/').pop() || groupFilter.groupPath;

  async function handleQuickCopy(uuid: string, field: 'password' | 'username') {
    await api.copySecret(uuid, field);
    pushToast({
      kind: 'clipboard',
      title: field === 'password' ? t.copiedPasswordToast : t.copiedUsernameToast,
      clearAfterSeconds: clipboardClearSeconds,
    });
  }

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

        <SearchField
          ref={searchInputRef}
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t.searchPlaceholder}
          ariaLabel={t.searchPlaceholder}
          clearLabel={t.clearSearch}
          shortcutHint="/"
        />
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
          {entries.map((entry) => {
            const selected = entry.uuid === selectedEntryId;
            const isPasskey = entry.tags.includes('Passkey');
            const hasOtpTag = entry.tags.some(
              (tag) => tag.toLowerCase() === 'otp' || tag.toLowerCase() === 'totp',
            );
            const subtitle = presentationMode
              ? '••••••'
              : entry.username || entry.url || entry.groupPath || '—';

            const isDragging = draggingEntryId === entry.uuid;

            return (
              <li key={entry.uuid} className="group relative">
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', entry.uuid);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggingEntryId(entry.uuid);
                  }}
                  onDragEnd={() => setDraggingEntryId(null)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg p-2 transition-colors',
                    selected
                      ? 'bg-surface border border-border shadow-xs'
                      : 'border border-transparent hover:bg-surface-hover/70',
                    isDragging && 'opacity-50',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedEntryId(entry.uuid)}
                    className="flex flex-1 items-center gap-2.5 min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md cursor-pointer"
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
                        {isPasskey && (
                          <Badge variant="accent" className="shrink-0">
                            <KeyRound className="h-2.5 w-2.5" aria-hidden="true" />
                            Passkey
                          </Badge>
                        )}
                        {hasOtpTag && (
                          <Badge variant="neutral" className="shrink-0">
                            OTP
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-fg-muted truncate mt-0.5">
                        <HighlightMatch text={subtitle} query={searchQuery} />
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
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
          })}
        </ul>
      )}
    </section>
  );
}
