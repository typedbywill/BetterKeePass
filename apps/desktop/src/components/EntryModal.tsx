import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Translations } from '../i18n/pt-BR';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';
import {
  Button,
  Dialog,
  Input,
  Kbd,
  PasswordGeneratorPopover,
  PasswordInput,
  StrengthMeter,
  TextArea,
} from '../ui';

export function EntryModal({ t }: { t: Translations }) {
  const queryClient = useQueryClient();
  const { entryModalOpen, setEntryModalOpen, setSelectedEntryId, pushToast } = useUiStore();
  const [title, setTitle] = useState('');
  const [groupPath, setGroupPath] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function saveEntry() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const tags = tagsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const uuid = await api.addEntry({
        title: title.trim(),
        groupPath: groupPath.trim() || undefined,
        username: username.trim() || undefined,
        password: password || undefined,
        url: url.trim() || undefined,
        notes: notes.trim() || undefined,
        tags,
      });
      setTitle('');
      setGroupPath('');
      setUsername('');
      setPassword('');
      setUrl('');
      setTagsRaw('');
      setNotes('');
      setEntryModalOpen(false);
      setSelectedEntryId(uuid);
      pushToast({ kind: 'success', title: t.savedToast });
      await queryClient.invalidateQueries({ queryKey: ['entries'] });
      await queryClient.invalidateQueries({ queryKey: ['group-tree'] });
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void saveEntry();
  }

  return (
    <Dialog
      isOpen={entryModalOpen}
      onOpenChange={setEntryModalOpen}
      title={t.newEntry}
      closeLabel={t.close}
      size="md"
    >
      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            void saveEntry();
          }
        }}
        className="p-4 flex flex-col gap-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t.titleLabel}
            <Input
              autoFocus
              placeholder={t.titleLabel}
              aria-label={t.titleLabel}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t.groupLabel}
            <Input
              placeholder={t.groupLabel}
              aria-label={t.groupLabel}
              value={groupPath}
              onChange={(e) => setGroupPath(e.target.value)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t.usernameLabel}
          <Input
            placeholder={t.usernameLabel}
            aria-label={t.usernameLabel}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t.passwordLabel}
            <PasswordInput
              placeholder={t.passwordLabel}
              aria-label={t.passwordLabel}
              revealLabel={t.reveal}
              hideLabel={t.hide}
              capsLockLabel={t.capsLockOn}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              generatorSlot={<PasswordGeneratorPopover t={t} onSelect={setPassword} />}
            />
          </label>
          <StrengthMeter
            password={password}
            labels={{
              weak: t.strengthWeak,
              fair: t.strengthFair,
              good: t.strengthGood,
              strong: t.strengthStrong,
            }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t.urlLabel}
            <Input
              placeholder="https://..."
              aria-label={t.urlLabel}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t.tagsLabel}
            <Input
              placeholder="Dev, Passkey"
              aria-label={t.tagsLabel}
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t.notesLabel}
          <TextArea
            placeholder={t.notesLabel}
            aria-label={t.notesLabel}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </label>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <span className="text-[11px] text-fg-subtle flex items-center gap-1">
            <Kbd>Ctrl+Enter</Kbd>
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onPress={() => setEntryModalOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" variant="primary" isLoading={saving}>
              {t.saveEntry}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
