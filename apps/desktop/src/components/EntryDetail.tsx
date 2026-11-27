import { useEffect, useState, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  KeyRound,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { api, type EntryDetailsView, type EntryPatchPayload, type EntrySummary } from '../lib/tauri';
import { useUiStore } from '../store/ui';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Kbd,
  Menu,
  MenuItem,
  MenuSeparator,
  PasswordGeneratorPopover,
  PasswordInput,
  ProgressRing,
  StrengthMeter,
  TextArea,
} from '../ui';

type EditingField = 'title' | 'username' | 'password' | 'url' | null;

function formatTotpCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
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
    presentationMode,
    clipboardClearSeconds,
    pushToast,
    setDeleteConfirmId,
  } = useUiStore();

  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [draftValue, setDraftValue] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [totpRemaining, setTotpRemaining] = useState<number>(30);
  const [showCustomFields, setShowCustomFields] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const detailsQuery = useQuery({
    queryKey: ['entry-details', selectedEntryId],
    queryFn: () => api.getEntryDetails(selectedEntryId!),
    enabled: Boolean(selectedEntryId),
  });

  const totpQuery = useQuery({
    queryKey: ['entry-totp', selectedEntryId],
    queryFn: () => api.getTotp(selectedEntryId!),
    enabled: Boolean(selectedEntryId && detailsQuery.data?.hasOtp && !presentationMode),
    refetchInterval: 5000,
  });

  const historyQuery = useQuery({
    queryKey: ['entry-history', selectedEntryId],
    queryFn: () => api.getHistory(selectedEntryId!),
    enabled: Boolean(selectedEntryId),
  });

  useEffect(() => {
    setRevealedPassword(null);
    setEditingField(null);
    setNotesDirty(false);
  }, [selectedEntryId]);

  useEffect(() => {
    if (detailsQuery.data && !notesDirty) {
      setNotesDraft(detailsQuery.data.notes);
    }
  }, [detailsQuery.data, notesDirty]);

  useEffect(() => {
    if (!revealedPassword) return;
    const timer = setTimeout(() => setRevealedPassword(null), 10000);
    return () => clearTimeout(timer);
  }, [revealedPassword]);

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
    if (editRequestNonce > 0 && detailsQuery.data) {
      setEditingField('title');
      setDraftValue(detailsQuery.data.summary.title);
    }
  }, [editRequestNonce]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (vars.patch.password !== undefined) {
        setRevealedPassword(vars.patch.password);
      }
      pushToast({ kind: 'success', title: t.savedToast });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entries'] }),
        queryClient.invalidateQueries({ queryKey: ['entry-details', vars.uuid] }),
        queryClient.invalidateQueries({ queryKey: ['entry-history', vars.uuid] }),
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

  if (!selectedEntryId || !detailsQuery.data) {
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

  const details = detailsQuery.data;
  const uuid = details.summary.uuid;

  async function handleToggleReveal() {
    if (revealedPassword !== null) {
      setRevealedPassword(null);
      return;
    }
    const secret = await api.revealPassword(uuid);
    setRevealedPassword(secret);
  }

  async function startPasswordEdit() {
    const secret = revealedPassword ?? (await api.revealPassword(uuid));
    setDraftValue(secret);
    setEditingField('password');
  }

  async function handleCopy(field: 'password' | 'username' | 'totp') {
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

  function commitInlineEdit(field: Exclude<EditingField, null>, value: string) {
    setEditingField(null);
    const trimmed = value.trim();
    if (field === 'title') {
      if (!trimmed || trimmed === details.summary.title) return;
      updateMutation.mutate({ uuid, patch: { title: trimmed } });
    } else if (field === 'username') {
      if (value === details.summary.username) return;
      updateMutation.mutate({ uuid, patch: { username: value } });
    } else if (field === 'url') {
      if (trimmed === details.summary.url) return;
      updateMutation.mutate({ uuid, patch: { url: trimmed } });
    } else if (field === 'password') {
      updateMutation.mutate({ uuid, patch: { password: value } });
    }
  }

  function cancelInlineEdit() {
    setEditingField(null);
  }

  return (
    <section
      ref={detailRef}
      tabIndex={-1}
      aria-label="Detalhes da entrada"
      className="flex-1 overflow-y-auto bg-bg-subtle/40 p-6 outline-none"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={uuid}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.14 }}
          className="max-w-2xl mx-auto flex flex-col gap-5"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <Avatar title={details.summary.title} url={details.summary.url} size="lg" />
              <div className="min-w-0 flex-1">
                {editingField === 'title' ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={draftValue}
                      aria-label={t.titleLabel}
                      onChange={(e) => setDraftValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitInlineEdit('title', draftValue);
                        } else if (e.key === 'Escape') {
                          cancelInlineEdit();
                        }
                      }}
                      onBlur={() => commitInlineEdit('title', draftValue)}
                      className="text-base font-semibold h-8"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingField('title');
                      setDraftValue(details.summary.title);
                    }}
                    title={t.inlineEditHint}
                    className="group/title inline-flex items-center gap-2 text-left rounded-md px-1 -ml-1 hover:bg-surface-hover transition-colors cursor-text max-w-full"
                  >
                    <h2 className="text-xl font-semibold text-fg tracking-tight truncate">
                      {details.summary.title}
                    </h2>
                    <Pencil
                      className="h-3.5 w-3.5 text-fg-subtle opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0"
                      aria-hidden="true"
                    />
                  </button>
                )}

                <p className="text-xs text-fg-muted mt-0.5 flex items-center gap-1.5">
                  <span>{details.summary.groupPath || 'Root'}</span>
                </p>

                {details.summary.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {details.summary.tags.map((tag) => (
                      <Badge key={tag} variant={tag === 'Passkey' ? 'accent' : 'neutral'}>
                        {tag === 'Passkey' && <KeyRound className="h-3 w-3" aria-hidden="true" />}
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <IconButton
                size="sm"
                variant="secondary"
                label={t.editField}
                shortcut="E"
                onPress={() => {
                  setEditingField('title');
                  setDraftValue(details.summary.title);
                }}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </IconButton>

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
                    shortcut="Ctrl+Shift+C"
                    onAction={() => void handleCopy('totp')}
                  >
                    {t.copyTotp}
                  </MenuItem>
                )}
                {details.summary.url && (
                  <MenuItem
                    icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
                    onAction={() => {
                      window.open(details.summary.url, '_blank', 'noopener,noreferrer');
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

              <Button
                variant="danger"
                size="sm"
                onPress={() => setDeleteConfirmId(uuid)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t.deleteEntry}
              </Button>
            </div>
          </div>

          {/* Primary credentials panel */}
          <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden shadow-xs">
            {/* Username row */}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-fg-subtle">{t.usernameLabel}</p>
                {editingField === 'username' ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Input
                      autoFocus
                      value={draftValue}
                      aria-label={t.usernameLabel}
                      onChange={(e) => setDraftValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitInlineEdit('username', draftValue);
                        } else if (e.key === 'Escape') {
                          cancelInlineEdit();
                        }
                      }}
                      onBlur={() => commitInlineEdit('username', draftValue)}
                      className="font-mono h-7"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingField('username');
                      setDraftValue(details.summary.username);
                    }}
                    title={t.inlineEditHint}
                    className="mt-0.5 text-[13px] font-mono text-fg hover:text-accent transition-colors text-left truncate block max-w-full cursor-text"
                  >
                    {presentationMode ? '••••••' : details.summary.username || '—'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <IconButton
                  size="xs"
                  variant="ghost"
                  label={t.editField}
                  onPress={() => {
                    setEditingField('username');
                    setDraftValue(details.summary.username);
                  }}
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                </IconButton>
                <Button size="sm" variant="secondary" onPress={() => void handleCopy('username')}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.copyUsername}
                </Button>
              </div>
            </div>

            {/* Password row */}
            <div className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-fg-subtle">{t.passwordLabel}</p>
                  {editingField === 'password' ? (
                    <div className="flex flex-col gap-2 mt-1">
                      <div className="flex items-center gap-1.5">
                        <PasswordInput
                          autoFocus
                          value={draftValue}
                          aria-label={t.passwordLabel}
                          revealLabel={t.reveal}
                          hideLabel={t.hide}
                          capsLockLabel={t.capsLockOn}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitInlineEdit('password', draftValue);
                            } else if (e.key === 'Escape') {
                              cancelInlineEdit();
                            }
                          }}
                          generatorSlot={
                            <PasswordGeneratorPopover t={t} onSelect={setDraftValue} />
                          }
                        />
                        <IconButton
                          size="sm"
                          variant="primary"
                          label={t.saveEntry}
                          onPress={() => commitInlineEdit('password', draftValue)}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          size="sm"
                          variant="ghost"
                          label={t.cancel}
                          onPress={cancelInlineEdit}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </IconButton>
                      </div>
                      <StrengthMeter
                        password={draftValue}
                        labels={{
                          weak: t.strengthWeak,
                          fair: t.strengthFair,
                          good: t.strengthGood,
                          strong: t.strengthStrong,
                        }}
                      />
                    </div>
                  ) : (
                    <p className="mt-0.5 text-[13px] font-mono text-fg break-all">
                      {presentationMode || revealedPassword === null
                        ? '••••••••••••'
                        : revealedPassword || '—'}
                    </p>
                  )}
                </div>

                {editingField !== 'password' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!presentationMode && (
                      <>
                        <IconButton
                          size="xs"
                          variant="ghost"
                          label={t.editField}
                          onPress={() => void startPasswordEdit()}
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                        </IconButton>
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => void handleToggleReveal()}
                        >
                          {revealedPassword !== null ? (
                            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {revealedPassword !== null ? t.hide : t.reveal}
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="primary" onPress={() => void handleCopy('password')}>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      {t.copyPassword}
                    </Button>
                  </div>
                )}
              </div>

              {editingField !== 'password' && revealedPassword !== null && !presentationMode && (
                <StrengthMeter
                  password={revealedPassword}
                  labels={{
                    weak: t.strengthWeak,
                    fair: t.strengthFair,
                    good: t.strengthGood,
                    strong: t.strengthStrong,
                  }}
                />
              )}
            </div>

            {/* TOTP row */}
            {details.hasOtp && totpQuery.data && !presentationMode && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-[11px] font-medium text-fg-subtle">{t.totpCode}</p>
                  <p className="text-xl font-mono font-semibold tracking-wider text-accent tabular-nums mt-0.5">
                    {formatTotpCode(totpQuery.data.code)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <ProgressRing
                      value={totpRemaining}
                      max={totpQuery.data.periodSecs}
                      size={28}
                    />
                    <span className="text-xs font-mono text-fg-muted tabular-nums w-7 text-right">
                      {totpRemaining}s
                    </span>
                  </div>
                  <Button size="sm" variant="secondary" onPress={() => void handleCopy('totp')}>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.copyTotp}
                  </Button>
                </div>
              </div>
            )}

            {/* URL row */}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-fg-subtle">{t.urlLabel}</p>
                {editingField === 'url' ? (
                  <Input
                    autoFocus
                    value={draftValue}
                    aria-label={t.urlLabel}
                    onChange={(e) => setDraftValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitInlineEdit('url', draftValue);
                      } else if (e.key === 'Escape') {
                        cancelInlineEdit();
                      }
                    }}
                    onBlur={() => commitInlineEdit('url', draftValue)}
                    className="mt-1 h-7"
                  />
                ) : details.summary.url ? (
                  <a
                    href={details.summary.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-accent hover:underline break-all"
                  >
                    <span>{details.summary.url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingField('url');
                      setDraftValue('');
                    }}
                    className="mt-0.5 text-[13px] text-fg-subtle hover:text-fg cursor-text"
                  >
                    —
                  </button>
                )}
              </div>
              <IconButton
                size="xs"
                variant="ghost"
                label={t.editField}
                onPress={() => {
                  setEditingField('url');
                  setDraftValue(details.summary.url);
                }}
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
              </IconButton>
            </div>

            {/* Notes row */}
            <div className="px-4 py-3 flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-fg-subtle">{t.notesLabel}</p>
              <TextArea
                aria-label={t.notesLabel}
                value={presentationMode ? '••••••••••••' : notesDraft}
                disabled={presentationMode}
                onChange={(e) => {
                  setNotesDraft(e.target.value);
                  setNotesDirty(true);
                }}
                onBlur={() => {
                  if (notesDirty && notesDraft !== details.notes) {
                    updateMutation.mutate({ uuid, patch: { notes: notesDraft } });
                  }
                  setNotesDirty(false);
                }}
                placeholder="—"
                rows={2}
                className="bg-bg-subtle/60 border-transparent focus:border-ring focus:bg-surface"
              />
            </div>
          </div>

          {/* Custom fields */}
          {details.customFields.length > 0 && (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCustomFields((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-fg hover:bg-surface-hover/50 transition-colors cursor-pointer"
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
                <div className="border-t border-border divide-y divide-border px-4">
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

          {/* Attachments */}
          {details.attachments.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-2.5">
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

          {/* History timeline */}
          {historyQuery.data && historyQuery.data.length > 0 && (
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-fg hover:bg-surface-hover/50 transition-colors cursor-pointer"
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
                <div className="border-t border-border divide-y divide-border">
                  {historyQuery.data.map((h) => (
                    <div
                      key={h.index}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-fg truncate">
                          #{h.index + 1} · {h.title}
                        </p>
                        <p className="text-[11px] text-fg-muted truncate">
                          {h.username || '—'} · {h.lastModified ?? '—'}
                        </p>
                      </div>
                      <Button
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
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
