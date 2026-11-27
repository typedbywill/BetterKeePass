import { useState, type FormEvent } from 'react';
import { Button, Card, Input } from '@heroui/react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';

export function UnlockScreen({ t }: { t: Translations }) {
  const setUnlocked = useUiStore((s) => s.setUnlocked);
  const [mode, setMode] = useState<'open' | 'create'>('open');
  const [vaultPath, setVaultPath] = useState('./cofre.kdbx');
  const [password, setPassword] = useState('');
  const [keyfile, setKeyfile] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'open') {
        await api.openVault(vaultPath, password, keyfile || undefined);
      } else {
        await api.createVault(vaultPath, password, 'BetterKeePass');
      }
      setPassword('');
      setUnlocked(true, vaultPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-slate-100">
      <Card className="w-full max-w-md border border-slate-800 bg-slate-900/90 shadow-2xl">
        <Card.Header className="flex flex-col items-start gap-2 pb-2">
          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-white">{t.appName}</h1>
          </div>
          <p className="text-sm text-slate-400">{t.subtitle}</p>
        </Card.Header>
        <Card.Content>
          <div className="flex gap-2 mb-4" role="tablist" aria-label="Modo do cofre">
            <Button
              size="sm"
              variant={mode === 'open' ? 'primary' : 'secondary'}
              onPress={() => setMode('open')}
            >
              {t.unlockTitle}
            </Button>
            <Button
              size="sm"
              variant={mode === 'create' ? 'primary' : 'secondary'}
              onPress={() => setMode('create')}
            >
              {t.createTitle}
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-300">
              {t.vaultPath}
              <Input
                value={vaultPath}
                onChange={(e) => setVaultPath(e.target.value)}
                aria-label={t.vaultPath}
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-slate-300">
              {t.masterPassword}
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label={t.masterPassword}
                autoFocus
              />
            </label>

            {mode === 'open' && (
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-300">
                {t.keyfilePath}
                <Input
                  value={keyfile}
                  onChange={(e) => setKeyfile(e.target.value)}
                  aria-label={t.keyfilePath}
                />
              </label>
            )}

            {error && (
              <p role="alert" className="text-xs text-rose-400 bg-rose-950/50 p-2 rounded">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" isDisabled={busy} className="mt-2">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {mode === 'open' ? t.unlockBtn : t.createBtn}
            </Button>
          </form>

          <p className="mt-4 text-xs text-slate-400 border-t border-slate-800 pt-3">
            {t.onboardingTip}
          </p>
        </Card.Content>
      </Card>
    </main>
  );
}
