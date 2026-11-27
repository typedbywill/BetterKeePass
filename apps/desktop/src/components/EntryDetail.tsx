import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip } from '@heroui/react';
import { Copy, Eye, EyeOff, KeyRound, Paperclip, Trash2 } from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';

export function EntryDetail({ t }: { t: Translations }) {
  const queryClient = useQueryClient();
  const { selectedEntryId, setSelectedEntryId, presentationMode } = useUiStore();
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [copiedBanner, setCopiedBanner] = useState(false);

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
    setCopiedBanner(false);
  }, [selectedEntryId]);

  useEffect(() => {
    if (!revealedPassword) return;
    const timer = setTimeout(() => setRevealedPassword(null), 10000);
    return () => clearTimeout(timer);
  }, [revealedPassword]);

  if (!selectedEntryId || !detailsQuery.data) {
    return (
      <section className="flex-1 flex items-center justify-center p-8 text-slate-400 text-sm">
        {t.noEntrySelected}
      </section>
    );
  }

  const details = detailsQuery.data;

  async function handleToggleReveal() {
    if (revealedPassword) {
      setRevealedPassword(null);
      return;
    }
    const secret = await api.revealPassword(details.summary.uuid);
    setRevealedPassword(secret);
  }

  async function handleCopy(field: 'password' | 'username') {
    await api.copySecret(details.summary.uuid, field);
    setCopiedBanner(true);
    setTimeout(() => setCopiedBanner(false), 3000);
  }

  async function handleDelete() {
    await api.deleteEntry(details.summary.uuid);
    setSelectedEntryId(null);
    await queryClient.invalidateQueries({ queryKey: ['entries'] });
    await queryClient.invalidateQueries({ queryKey: ['group-tree'] });
  }

  return (
    <section aria-label="Detalhes da entrada" className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{details.summary.title}</h2>
            <p className="text-sm text-slate-400">{details.summary.groupPath || 'Root'}</p>
          </div>
          <Button variant="danger" size="sm" onPress={handleDelete}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t.deleteEntry}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {details.summary.tags.map((tag) => (
            <Chip key={tag} size="sm" variant="soft">
              {tag === 'Passkey' && <KeyRound className="h-3 w-3 mr-1" aria-hidden="true" />}
              {tag}
            </Chip>
          ))}
        </div>

        {copiedBanner && (
          <p role="status" className="text-xs text-emerald-400 bg-emerald-950/50 p-2 rounded">
            {t.copiedNotice}
          </p>
        )}

        <Card className="border border-slate-800 bg-slate-900/60">
          <Card.Content className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-400">{t.usernameLabel}</p>
                <p className="text-sm font-mono">
                  {presentationMode ? '••••••' : details.summary.username || '—'}
                </p>
              </div>
              <Button size="sm" variant="secondary" onPress={() => handleCopy('username')}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {t.copyUsername}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-3">
              <div>
                <p className="text-xs text-slate-400">{t.passwordLabel}</p>
                <p className="text-sm font-mono">
                  {presentationMode || !revealedPassword ? '••••••••••••' : revealedPassword}
                </p>
              </div>
              <div className="flex gap-2">
                {!presentationMode && (
                  <Button size="sm" variant="secondary" onPress={handleToggleReveal}>
                    {revealedPassword ? (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {revealedPassword ? t.hide : t.reveal}
                  </Button>
                )}
                <Button size="sm" variant="primary" onPress={() => handleCopy('password')}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.copyPassword}
                </Button>
              </div>
            </div>

            {details.summary.url && (
              <div className="border-t border-slate-800 pt-3">
                <p className="text-xs text-slate-400">{t.urlLabel}</p>
                <p className="text-sm break-all">{details.summary.url}</p>
              </div>
            )}

            {details.hasOtp && totpQuery.data && !presentationMode && (
              <div className="border-t border-slate-800 pt-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">{t.totpCode}</p>
                  <p className="text-lg font-mono tracking-widest text-emerald-400">
                    {totpQuery.data.code}
                  </p>
                </div>
                <span className="text-xs text-slate-400">{totpQuery.data.validForSecs}s</span>
              </div>
            )}
          </Card.Content>
        </Card>

        {details.customFields.length > 0 && (
          <Card className="border border-slate-800 bg-slate-900/60">
            <Card.Header>
              <Card.Title className="text-sm">{t.customFields}</Card.Title>
            </Card.Header>
            <Card.Content className="flex flex-col gap-2 text-xs">
              {details.customFields.map((field) => (
                <div key={field.name} className="flex justify-between gap-4">
                  <span className="font-mono text-slate-400">{field.name}</span>
                  <span className="font-mono">
                    {field.protected || presentationMode ? '••••••••' : field.value ?? '—'}
                  </span>
                </div>
              ))}
            </Card.Content>
          </Card>
        )}

        {details.attachments.length > 0 && (
          <Card className="border border-slate-800 bg-slate-900/60">
            <Card.Header>
              <Card.Title className="text-sm">{t.attachments}</Card.Title>
            </Card.Header>
            <Card.Content className="flex flex-wrap gap-2">
              {details.attachments.map((att) => (
                <Chip key={att} size="sm" variant="soft">
                  <Paperclip className="h-3 w-3 mr-1" aria-hidden="true" />
                  {att}
                </Chip>
              ))}
            </Card.Content>
          </Card>
        )}

        {historyQuery.data && historyQuery.data.length > 0 && (
          <Card className="border border-slate-800 bg-slate-900/60">
            <Card.Header>
              <Card.Title className="text-sm">{t.history}</Card.Title>
            </Card.Header>
            <Card.Content className="flex flex-col gap-1 text-xs text-slate-400">
              {historyQuery.data.map((h) => (
                <div key={h.index}>
                  #{h.index + 1} — {h.title} ({h.lastModified ?? '-'})
                </div>
              ))}
            </Card.Content>
          </Card>
        )}
      </div>
    </section>
  );
}
