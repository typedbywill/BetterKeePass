import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button as AriaButton } from 'react-aria-components';
import { motion } from 'framer-motion';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Folder,
  Globe,
  History,
  MoreHorizontal,
  Paperclip,
  RotateCcw,
  ShieldCheck,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { getKeepassIcon } from '../lib/keepassIcons';
import {
  api,
  type EntryDetailsView,
  type EntryPatchPayload,
  type EntrySummary,
} from '../lib/tauri';
import { useUiStore } from '../store/ui';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Input,
  Kbd,
  Menu,
  MenuItem,
  MenuSeparator,
  PasswordGeneratorPopover,
  PasswordInput,
  Popover,
  ProgressRing,
  StrengthMeter,
  TextArea,
} from '../ui';

const QUICK_BUILTIN_ICONS = [0, 1, 3, 19, 23, 28, 30, 38, 45, 62, 65, 68];

function formatTotpCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatHistoryDate(iso: string | null, language: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function EntryDetail({
  t,
  detailRef,
  editRequestNonce = 0,
}: {
  t: Translations;
  detailRef?: RefObject<HTMLElement | null>;
  editRequestNonce?: number;
}) {
  const queryClient = useQueryClient();
  const {
    selectedEntryId,
    setSelectedEntryId,
    entryModalOpen,
    setEntryModalOpen,
    groupFilter,
    language,
    presentationMode,
    clipboardClearSeconds,
    pushToast,
    setDeleteConfirmId,
  } = useUiStore();

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const iconFileInputRef = useRef<HTMLInputElement | null>(null);

  const [totpRemaining, setTotpRemaining] = useState<number>(30);
  const [showCustomFields, setShowCustomFields] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [iconPopoverOpen, setIconPopoverOpen] = useState(false);
  const [iconBusy, setIconBusy] = useState(false);
  const [iconDraft, setIconDraft] = useState<
    | { kind: 'builtin'; iconId: number }
    | { kind: 'custom'; dataUrl: string }
    | null
  >(null);

  // Unified form drafts for both creation and view/edit modes
  const [titleDraft, setTitleDraft] = useState('');
  const [groupPathDraft, setGroupPathDraft] = useState('');
  const [tagsDraft, setTagsDraft] = useState('');
  const [usernameDraft, setUsernameDraft] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [creating, setCreating] = useState(false);

  const detailsQuery = useQuery({
    queryKey: ['entry-details', selectedEntryId],
    queryFn: () => api.getEntryDetails(selectedEntryId!),
    enabled: Boolean(selectedEntryId) && !entryModalOpen,
  });

  const passwordQuery = useQuery({
    queryKey: ['entry-password', selectedEntryId],
    queryFn: () => api.revealPassword(selectedEntryId!),
    enabled: Boolean(selectedEntryId) && !entryModalOpen && !presentationMode,
  });

  const totpQuery = useQuery({
    queryKey: ['entry-totp', selectedEntryId],
    queryFn: () => api.getTotp(selectedEntryId!),
    enabled: Boolean(selectedEntryId && !entryModalOpen && detailsQuery.data?.hasOtp && !presentationMode),
    refetchInterval: 5000,
  });

  const historyQuery = useQuery({
    queryKey: ['entry-history', selectedEntryId],
    queryFn: () => api.getHistory(selectedEntryId!),
    enabled: Boolean(selectedEntryId) && !entryModalOpen,
  });

  // Reset form when switching to creation mode
  useEffect(() => {
    if (!entryModalOpen) return;
    setTitleDraft('');
    setGroupPathDraft(typeof groupFilter === 'object' ? groupFilter.groupPath : '');
    setTagsDraft('');
    setUsernameDraft('');
    setPasswordDraft('');
    setUrlDraft('');
    setNotesDraft('');
    setIconDraft(null);
  }, [entryModalOpen, groupFilter]);

  // Reset password & icon draft when switching selected entry
  useEffect(() => {
    setPasswordDraft('');
    setIconDraft(null);
  }, [selectedEntryId]);

  // Hydrate drafts from fetched entry details
  useEffect(() => {
    if (entryModalOpen || !detailsQuery.data) return;
    const d = detailsQuery.data;
    setTitleDraft(d.summary.title);
    setGroupPathDraft(d.summary.groupPath);
    setTagsDraft(d.summary.tags.join(', '));
    setUsernameDraft(d.summary.username);
    setUrlDraft(d.summary.url);
    setNotesDraft(d.notes);
  }, [detailsQuery.data, entryModalOpen]);

  // Hydrate password draft from fetched entry password
  useEffect(() => {
    if (entryModalOpen || passwordQuery.data === undefined) return;
    setPasswordDraft(passwordQuery.data);
  }, [passwordQuery.data, entryModalOpen]);

  useEffect(() => {
    if (totpQuery.data) {
      setTotpRemaining(totpQuery.data.validForSecs);
    }
  }, [totpQuery.data]);

  useEffect(() => {
    if (!detailsQuery.data?.hasOtp || presentationMode) return;
    const timer = setInterval(() => {
      setTotpRemaining((prev) => {
        if (prev <= 1) {
          void totpQuery.refetch();
          return totpQuery.data?.periodSecs ?? 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [detailsQuery.data?.hasOtp, presentationMode, totpQuery]);

  useEffect(() => {
    if (editRequestNonce > 0) {
      titleInputRef.current?.focus();
    }
  }, [editRequestNonce]);

  const updateMutation = useMutation({
    mutationFn: ({ uuid, patch }: { uuid: string; patch: EntryPatchPayload }) =>
      api.updateEntry(uuid, patch),
    onMutate: async ({ uuid, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['entry-details', uuid] });
      const prevDetails = queryClient.getQueryData<EntryDetailsView>(['entry-details', uuid]);
      if (prevDetails) {
        queryClient.setQueryData<EntryDetailsView>(['entry-details', uuid], {
          ...prevDetails,
          notes: patch.notes ?? prevDetails.notes,
          summary: {
            ...prevDetails.summary,
            title: patch.title ?? prevDetails.summary.title,
            username: patch.username ?? prevDetails.summary.username,
            url: patch.url ?? prevDetails.summary.url,
            tags: patch.tags ?? prevDetails.summary.tags,
          },
        });
      }
      queryClient.setQueriesData<EntrySummary[]>({ queryKey: ['entries'] }, (old) =>
        old?.map((item) =>
          item.uuid === uuid
            ? {
                ...item,
                title: patch.title ?? item.title,
                username: patch.username ?? item.username,
                url: patch.url ?? item.url,
                tags: patch.tags ?? item.tags,
                hasPassword:
                  patch.password !== undefined ? patch.password.length > 0 : item.hasPassword,
                hasNotes:
                  patch.notes !== undefined ? patch.notes.trim().length > 0 : item.hasNotes,
                hasPasskey:
                  patch.tags !== undefined
                    ? patch.tags.some((tag) => tag.toLowerCase() === 'passkey')
                    : item.hasPasskey,
              }
            : item,
        ),
      );
      return { prevDetails };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.prevDetails) {
        queryClient.setQueryData(['entry-details', vars.uuid], ctx.prevDetails);
      }
    },
    onSuccess: async (_data, vars) => {
      setIconDraft(null);
      pushToast({ kind: 'success', title: t.savedToast });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entries'] }),
        queryClient.invalidateQueries({ queryKey: ['entry-details', vars.uuid] }),
        queryClient.invalidateQueries({ queryKey: ['entry-password', vars.uuid] }),
        queryClient.invalidateQueries({ queryKey: ['entry-history', vars.uuid] }),
        queryClient.invalidateQueries({ queryKey: ['custom-icon'] }),
        queryClient.invalidateQueries({ queryKey: ['group-tree'] }),
      ]);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ uuid, index }: { uuid: string; index: number }) =>
      api.restoreHistory(uuid, index),
    onSuccess: async (_data, vars) => {
      pushToast({ kind: 'success', title: t.restoredToast });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entries'] }),
        queryClient.invalidateQueries({ queryKey: ['entry-details', vars.uuid] }),
        queryClient.invalidateQueries({ queryKey: ['entry-history', vars.uuid] }),
      ]);
    },
  });

  if (!entryModalOpen && !selectedEntryId) {
    return (
      <section
        ref={detailRef}
        tabIndex={-1}
        aria-label="Detalhes da entrada"
        className="flex-1 flex items-center justify-center p-8 bg-bg-subtle/40 outline-none"
      >
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" />}
          title={t.noEntrySelectedTitle}
          description={t.noEntrySelected}
          action={
            <div className="flex items-center gap-2 text-xs text-fg-subtle">
              <span>{t.selectOrCreateHint}</span>
              <Kbd>?</Kbd>
            </div>
          }
        />
      </section>
    );
  }

  if (!entryModalOpen && selectedEntryId && detailsQuery.isError) {
    const errMsg =
      detailsQuery.error instanceof Error
        ? detailsQuery.error.message
        : String(detailsQuery.error);
    return (
      <section
        ref={detailRef}
        tabIndex={-1}
        aria-label="Detalhes da entrada"
        className="flex-1 flex items-center justify-center p-8 bg-bg-subtle/40 outline-none"
      >
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5 text-danger" aria-hidden="true" />}
          title={t.noEntrySelectedTitle}
          description={errMsg}
        />
      </section>
    );
  }

  if (!entryModalOpen && !detailsQuery.data) {
    return (
      <section
        ref={detailRef}
        tabIndex={-1}
        aria-label="Detalhes da entrada"
        className="flex-1 bg-bg p-6 lg:px-10 lg:py-7 outline-none"
      />
    );
  }

  const details = entryModalOpen ? null : detailsQuery.data!;
  const uuid = details?.summary.uuid ?? '';
  const loadedPassword = passwordQuery.data ?? '';
  const passwordDirty =
    !entryModalOpen && !presentationMode && passwordQuery.data !== undefined && passwordDraft !== loadedPassword;

  const isViewDirty = Boolean(
    details &&
      (titleDraft.trim() !== details.summary.title ||
        usernameDraft !== details.summary.username ||
        urlDraft.trim() !== details.summary.url ||
        notesDraft !== details.notes ||
        parseTags(tagsDraft).join(',') !== details.summary.tags.join(',') ||
        passwordDirty ||
        iconDraft !== null),
  );

  async function handleSave(e?: FormEvent) {
    e?.preventDefault();
    if (entryModalOpen) {
      if (!titleDraft.trim() || creating) return;
      setCreating(true);
      try {
        const createdUuid = await api.addEntry({
          title: titleDraft.trim(),
          groupPath: groupPathDraft.trim() || undefined,
          username: usernameDraft.trim() || undefined,
          password: passwordDraft || undefined,
          url: urlDraft.trim() || undefined,
          notes: notesDraft.trim() || undefined,
          tags: parseTags(tagsDraft),
          iconId: iconDraft?.kind === 'builtin' ? iconDraft.iconId : undefined,
          customIconBase64: iconDraft?.kind === 'custom' ? iconDraft.dataUrl : undefined,
        });
        setIconDraft(null);
        setEntryModalOpen(false);
        setSelectedEntryId(createdUuid);
        pushToast({ kind: 'success', title: t.savedToast });
        await queryClient.invalidateQueries({ queryKey: ['entries'] });
        await queryClient.invalidateQueries({ queryKey: ['group-tree'] });
      } finally {
        setCreating(false);
      }
      return;
    }

    if (!details || !isViewDirty || updateMutation.isPending) return;
    const patch: EntryPatchPayload = {};
    const trimmedTitle = titleDraft.trim();
    if (trimmedTitle && trimmedTitle !== details.summary.title) {
      patch.title = trimmedTitle;
    }
    if (usernameDraft !== details.summary.username) {
      patch.username = usernameDraft;
    }
    if (urlDraft.trim() !== details.summary.url) {
      patch.url = urlDraft.trim();
    }
    if (notesDraft !== details.notes) {
      patch.notes = notesDraft;
    }
    const parsedTags = parseTags(tagsDraft);
    if (parsedTags.join(',') !== details.summary.tags.join(',')) {
      patch.tags = parsedTags;
    }
    if (passwordDirty) {
      patch.password = passwordDraft;
    }
    if (iconDraft?.kind === 'custom') {
      patch.customIconBase64 = iconDraft.dataUrl;
    } else if (iconDraft?.kind === 'builtin') {
      patch.iconId = iconDraft.iconId;
    }
    if (Object.keys(patch).length > 0) {
      updateMutation.mutate({ uuid, patch });
    }
  }

  async function handleCopy(field: 'password' | 'username' | 'totp') {
    if (!uuid) return;
    await api.copySecret(uuid, field);
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
  }

  const displayedPassword = entryModalOpen
    ? passwordDraft
    : presentationMode
      ? ''
      : passwordDraft;

  async function handleDownloadFaviconFromUrl() {
    if (!urlDraft.trim() || iconBusy) return;
    setIconBusy(true);
    try {
      const dataUrl = await api.fetchFaviconFromUrl(urlDraft.trim());
      setIconDraft({ kind: 'custom', dataUrl });
      setIconPopoverOpen(false);
    } catch {
      pushToast({ kind: 'danger', title: t.iconDownloadError });
    } finally {
      setIconBusy(false);
    }
  }

  function handleCustomIconFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      setIconDraft({ kind: 'custom', dataUrl: result });
      setIconPopoverOpen(false);
    };
    reader.readAsDataURL(file);
  }

  function handleSelectBuiltinIcon(iconId: number) {
    setIconDraft({ kind: 'builtin', iconId });
    setIconPopoverOpen(false);
  }

  const previewSrc = iconDraft?.kind === 'custom' ? iconDraft.dataUrl : null;
  const effectiveIconId =
    iconDraft?.kind === 'builtin'
      ? iconDraft.iconId
      : iconDraft?.kind === 'custom'
        ? null
        : details?.summary.iconId;
  const effectiveCustomIconUuid =
    iconDraft !== null ? null : details?.summary.customIconUuid;

  return (
    <section
      ref={detailRef}
      tabIndex={-1}
      aria-label="Detalhes da entrada"
      className="flex-1 overflow-y-auto bg-bg p-6 lg:px-10 lg:py-7 outline-none"
    >
      <motion.form
        key={entryModalOpen ? 'create-entry' : uuid}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.14 }}
        onSubmit={(e) => void handleSave(e)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            void handleSave();
          }
        }}
        className="w-full flex flex-col gap-6"
      >
        {/* Header — barra de contexto/ações + título limpo */}
        <div className="flex flex-col gap-3.5 pb-5 border-b border-border/70">
          <div className="flex items-center justify-between gap-3">
            {entryModalOpen ? (
              <div className="flex items-center gap-1.5 min-w-0 max-w-xs flex-1">
                <Folder className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                <Input
                  placeholder={t.groupLabel}
                  aria-label={t.groupLabel}
                  value={groupPathDraft}
                  onChange={(e) => setGroupPathDraft(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            ) : (
              <div
                aria-label={t.groupLabel}
                className="inline-flex items-center gap-1.5 rounded-md bg-bg-subtle px-2 py-1 text-xs text-fg-muted border border-border/60 min-w-0 max-w-full"
              >
                <Folder className="h-3 w-3 shrink-0 text-fg-subtle" aria-hidden="true" />
                <span className="truncate">{groupPathDraft || 'Root'}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 shrink-0">
              {entryModalOpen && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onPress={() => setEntryModalOpen(false)}
                >
                  {t.cancel}
                </Button>
              )}

              <Button
                type="submit"
                size="sm"
                variant="primary"
                isDisabled={entryModalOpen ? !titleDraft.trim() : !isViewDirty}
                isLoading={entryModalOpen ? creating : updateMutation.isPending}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t.saveEntry}
              </Button>

              {!entryModalOpen && details && (
                <Menu
                  trigger={
                    <Button size="sm" variant="secondary" isIconOnly aria-label="Entry actions">
                      <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  }
                >
                  <MenuItem
                    icon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                    shortcut="Ctrl+C"
                    onAction={() => void handleCopy('password')}
                  >
                    {t.copyPassword}
                  </MenuItem>
                  <MenuItem
                    icon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                    shortcut="Ctrl+B"
                    onAction={() => void handleCopy('username')}
                  >
                    {t.copyUsername}
                  </MenuItem>
                  {details.hasOtp && (
                    <MenuItem
                      icon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                      shortcut="Ctrl+T"
                      onAction={() => void handleCopy('totp')}
                    >
                      {t.copyTotp}
                    </MenuItem>
                  )}
                  {urlDraft && (
                    <MenuItem
                      icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
                      shortcut="Ctrl+O"
                      onAction={() => {
                        window.open(urlDraft, '_blank', 'noopener,noreferrer');
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
                    onAction={() => setDeleteConfirmId(uuid)}
                  >
                    {t.deleteEntry}
                  </MenuItem>
                </Menu>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3.5 min-w-0">
            <>
              <input
                ref={iconFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon,.ico"
                className="hidden"
                onChange={handleCustomIconFileChange}
              />
              <Popover
                isOpen={iconPopoverOpen}
                onOpenChange={setIconPopoverOpen}
                placement="bottom start"
                className="w-72 p-3"
                trigger={
                  <AriaButton
                    aria-label={t.changeIcon}
                    className="group/avatar relative rounded-xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Avatar
                      title={titleDraft || t.newEntry}
                      url={urlDraft}
                      iconId={effectiveIconId}
                      customIconUuid={effectiveCustomIconUuid}
                      previewSrc={previewSrc}
                      size="lg"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/55 text-white opacity-0 group-hover/avatar:opacity-100 transition-opacity"
                    >
                      <Camera className="h-4 w-4" />
                    </span>
                  </AriaButton>
                }
              >
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs font-semibold text-fg">{t.changeIconTitle}</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      disabled={!urlDraft.trim() || iconBusy}
                      onClick={() => void handleDownloadFaviconFromUrl()}
                      className="flex items-start gap-2.5 rounded-lg border border-border p-2.5 text-left hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-muted text-fg">
                        {iconBusy ? (
                          <Download className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
                        ) : (
                          <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-fg">
                          {t.downloadIconFromUrl}
                        </span>
                        <span className="block text-[11px] text-fg-muted leading-snug mt-0.5">
                          {urlDraft.trim() ? t.downloadIconFromUrlDesc : t.downloadIconNeedsUrl}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={iconBusy}
                      onClick={() => iconFileInputRef.current?.click()}
                      className="flex items-start gap-2.5 rounded-lg border border-border p-2.5 text-left hover:bg-surface-hover transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-muted text-fg">
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-fg">
                          {t.uploadCustomIcon}
                        </span>
                        <span className="block text-[11px] text-fg-muted leading-snug mt-0.5">
                          {t.uploadCustomIconDesc}
                        </span>
                      </span>
                    </button>
                  </div>

                  <div className="border-t border-border pt-2.5 flex flex-col gap-1.5">
                    <p className="text-[11px] font-medium text-fg-muted">
                      {t.builtinIconsLabel}
                    </p>
                    <div className="grid grid-cols-6 gap-1">
                      {QUICK_BUILTIN_ICONS.map((iconId) => {
                        const IconComp = getKeepassIcon(iconId);
                        if (!IconComp) return null;
                        const isCurrent =
                          !previewSrc && effectiveIconId === iconId;
                        return (
                          <button
                            key={iconId}
                            type="button"
                            disabled={iconBusy}
                            onClick={() => handleSelectBuiltinIcon(iconId)}
                            className={
                              isCurrent
                                ? 'flex h-8 items-center justify-center rounded-md border border-ring bg-accent-subtle text-accent cursor-pointer'
                                : 'flex h-8 items-center justify-center rounded-md border border-transparent text-fg-muted hover:text-fg hover:bg-surface-hover cursor-pointer'
                            }
                          >
                            <IconComp className="h-4 w-4" aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Popover>
            </>
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <input
                ref={titleInputRef}
                autoFocus={entryModalOpen}
                required
                placeholder={t.titleLabel}
                aria-label={t.titleLabel}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="w-full rounded-md border border-transparent bg-transparent px-1.5 -mx-1.5 py-0.5 text-xl font-semibold tracking-tight text-fg placeholder:text-fg-subtle hover:border-border/70 focus:bg-surface focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              />
              <div className="flex items-center gap-1.5 min-w-0">
                <Tag className="h-3 w-3 shrink-0 text-fg-subtle" aria-hidden="true" />
                <input
                  placeholder={t.tagsLabel}
                  aria-label={t.tagsLabel}
                  value={tagsDraft}
                  onChange={(e) => setTagsDraft(e.target.value)}
                  className="w-full rounded border border-transparent bg-transparent px-1.5 -mx-1 py-0.5 text-xs text-fg-muted placeholder:text-fg-subtle hover:border-border/70 focus:bg-surface focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Campos principais abertos em grid responsivo (sem cards) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
          {/* Username */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <label className="text-xs font-medium text-fg-muted">{t.usernameLabel}</label>
            <div className="flex items-center gap-2">
              <Input
                placeholder={t.usernameLabel}
                aria-label={t.usernameLabel}
                value={presentationMode ? '••••••' : usernameDraft}
                disabled={presentationMode}
                onChange={(e) => setUsernameDraft(e.target.value)}
                className="font-mono h-9"
              />
              {!entryModalOpen && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0 h-9"
                  onPress={() => void handleCopy('username')}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.copyUsername}
                </Button>
              )}
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <label className="text-xs font-medium text-fg-muted">{t.passwordLabel}</label>
            <div className="flex items-center gap-2">
              <PasswordInput
                placeholder={presentationMode ? '••••••••••••' : t.passwordLabel}
                aria-label={t.passwordLabel}
                revealLabel={t.reveal}
                hideLabel={t.hide}
                capsLockLabel={t.capsLockOn}
                value={displayedPassword}
                disabled={presentationMode}
                onChange={(e) => setPasswordDraft(e.target.value)}
                className="h-9"
                generatorSlot={
                  !presentationMode ? (
                    <PasswordGeneratorPopover
                      t={t}
                      onSelect={(pw) => setPasswordDraft(pw)}
                    />
                  ) : undefined
                }
              />
              {!entryModalOpen && (
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  className="shrink-0 h-9"
                  onPress={() => void handleCopy('password')}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.copyPassword}
                </Button>
              )}
            </div>
            {displayedPassword && !presentationMode && (
              <StrengthMeter
                password={displayedPassword}
                labels={{
                  weak: t.strengthWeak,
                  fair: t.strengthFair,
                  good: t.strengthGood,
                  strong: t.strengthStrong,
                }}
              />
            )}
          </div>

          {/* URL */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <label className="text-xs font-medium text-fg-muted">{t.urlLabel}</label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="https://..."
                aria-label={t.urlLabel}
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                className="h-9"
              />
              {urlDraft.trim() && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0 h-9"
                  onPress={() => window.open(urlDraft.trim(), '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.openUrl}
                </Button>
              )}
            </div>
          </div>

          {/* TOTP */}
          {!entryModalOpen && details?.hasOtp && totpQuery.data && !presentationMode && (
            <div className="flex flex-col gap-1.5 min-w-0">
              <label className="text-xs font-medium text-fg-muted">{t.totpCode}</label>
              <div className="flex items-center justify-between gap-3 h-9">
                <p className="text-xl font-mono font-semibold tracking-wider text-accent tabular-nums">
                  {formatTotpCode(totpQuery.data.code)}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <ProgressRing
                      value={totpRemaining}
                      max={totpQuery.data.periodSecs}
                      size={26}
                    />
                    <span className="text-xs font-mono text-fg-muted tabular-nums w-7 text-right">
                      {totpRemaining}s
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onPress={() => void handleCopy('totp')}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.copyTotp}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-xs font-medium text-fg-muted">{t.notesLabel}</label>
            <TextArea
              aria-label={t.notesLabel}
              value={presentationMode ? '••••••••••••' : notesDraft}
              disabled={presentationMode}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder={t.notesLabel}
              rows={4}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 text-[11px] text-fg-subtle">
          <Kbd>Ctrl+Enter</Kbd>
          <span>{t.saveEntry}</span>
          {entryModalOpen && (
            <>
              <span>·</span>
              <Kbd>Esc</Kbd>
              <span>{t.cancel}</span>
            </>
          )}
        </div>

        {/* Custom fields — seção aberta sem card */}
        {!entryModalOpen && details && details.customFields.length > 0 && (
          <div className="border-t border-border/70 pt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowCustomFields((v) => !v)}
              className="w-full flex items-center justify-between py-1 text-xs font-semibold text-fg hover:text-accent transition-colors cursor-pointer"
            >
              <span>
                {t.customFields} ({details.customFields.length})
              </span>
              {showCustomFields ? (
                <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" aria-hidden="true" />
              )}
            </button>
            {showCustomFields && (
              <div className="divide-y divide-border/60">
                {details.customFields.map((field) => (
                  <div key={field.name} className="flex items-center justify-between gap-4 py-2 text-xs">
                    <span className="font-mono text-fg-muted truncate">{field.name}</span>
                    <span className="font-mono text-fg">
                      {field.protected || presentationMode ? '••••••••' : field.value ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Attachments — seção aberta sem card */}
        {!entryModalOpen && details && details.attachments.length > 0 && (
          <div className="border-t border-border/70 pt-4 flex flex-col gap-2.5">
            <p className="text-xs font-semibold text-fg">{t.attachments}</p>
            <div className="flex flex-wrap gap-1.5">
              {details.attachments.map((att) => (
                <Badge key={att} variant="neutral">
                  <Paperclip className="h-3 w-3" aria-hidden="true" />
                  {att}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* History timeline — seção aberta sem card */}
        {!entryModalOpen && historyQuery.data && historyQuery.data.length > 0 && (
          <div className="border-t border-border/70 pt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="w-full flex items-center justify-between py-1 text-xs font-semibold text-fg hover:text-accent transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-fg-muted" aria-hidden="true" />
                {t.history} ({historyQuery.data.length})
              </span>
              {showHistory ? (
                <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" aria-hidden="true" />
              )}
            </button>
            {showHistory && (
              <div className="divide-y divide-border/60">
                {historyQuery.data.map((h) => (
                  <div
                    key={h.index}
                    className="flex items-center justify-between gap-3 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-fg truncate">
                        #{h.index + 1} · {h.title}
                      </p>
                      <p className="text-[11px] text-fg-muted truncate">
                        {h.username || '—'} · {formatHistoryDate(h.lastModified, language)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      isLoading={restoreMutation.isPending}
                      onPress={() => restoreMutation.mutate({ uuid, index: h.index })}
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      {t.restoreVersion}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.form>
    </section>
  );
}
