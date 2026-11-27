import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input } from '@heroui/react';
import { Sparkles, X } from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';

export function EntryModal({ t }: { t: Translations }) {
  const queryClient = useQueryClient();
  const { entryModalOpen, setEntryModalOpen, setSelectedEntryId } = useUiStore();
  const [title, setTitle] = useState('');
  const [groupPath, setGroupPath] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

  if (!entryModalOpen) return null;

  async function handleGeneratePassword() {
    setPassword(await api.generatePassword(20));
  }

  async function handleGeneratePassphrase() {
    setPassword(await api.generatePassphrase(5));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const uuid = await api.addEntry({
      title: title.trim(),
      groupPath: groupPath.trim() || undefined,
      username: username.trim() || undefined,
      password: password || undefined,
      url: url.trim() || undefined,
      notes: notes.trim() || undefined,
      tags: [],
    });
    setTitle('');
    setPassword('');
    setEntryModalOpen(false);
    setSelectedEntryId(uuid);
    await queryClient.invalidateQueries({ queryKey: ['entries'] });
    await queryClient.invalidateQueries({ queryKey: ['group-tree'] });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.newEntry}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <Card className="w-full max-w-lg border border-slate-800 bg-slate-900">
        <Card.Header className="flex flex-row items-center justify-between">
          <Card.Title>{t.newEntry}</Card.Title>
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label={t.cancel}
            onPress={() => setEntryModalOpen(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Card.Header>
        <Card.Content>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              placeholder={t.titleLabel}
              aria-label={t.titleLabel}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <Input
              placeholder={t.groupLabel}
              aria-label={t.groupLabel}
              value={groupPath}
              onChange={(e) => setGroupPath(e.target.value)}
            />
            <Input
              placeholder={t.usernameLabel}
              aria-label={t.usernameLabel}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <div className="flex flex-col gap-2">
              <Input
                type="password"
                placeholder={t.passwordLabel}
                aria-label={t.passwordLabel}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onPress={handleGeneratePassword}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.generatePassword}
                </Button>
                <Button size="sm" variant="secondary" onPress={handleGeneratePassphrase}>
                  {t.generatePassphrase}
                </Button>
              </div>
            </div>
            <Input
              placeholder={t.urlLabel}
              aria-label={t.urlLabel}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Input
              placeholder={t.notesLabel}
              aria-label={t.notesLabel}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="ghost" onPress={() => setEntryModalOpen(false)}>
                {t.cancel}
              </Button>
              <Button type="submit" variant="primary">
                {t.saveEntry}
              </Button>
            </div>
          </form>
        </Card.Content>
      </Card>
    </div>
  );
}
