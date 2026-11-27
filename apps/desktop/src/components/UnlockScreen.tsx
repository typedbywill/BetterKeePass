import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { FileKey2, FolderOpen, KeyRound, ShieldCheck } from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';
import { Button, Input, PasswordInput, SegmentedControl } from '../ui';

export function UnlockScreen({ t }: { t: Translations }) {
  const { setUnlocked, recentVaults, addRecentVault } = useUiStore();
  const [mode, setMode] = useState<'open' | 'create'>('open');
  const [vaultPath, setVaultPath] = useState(recentVaults[0] || './cofre.kdbx');
  const [password, setPassword] = useState('');
  const [keyfile, setKeyfile] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0);
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
      addRecentVault(vaultPath);
      setUnlocked(true, vaultPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setErrorNonce((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-bg text-fg">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
      >
        <div className="flex flex-col gap-1.5 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle text-accent border border-accent/25">
              <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-fg">{t.appName}</h1>
          </div>
          <p className="text-xs text-fg-muted leading-relaxed">{t.subtitle}</p>
        </div>

        <div className="mb-4" role="tablist" aria-label="Modo do cofre">
          <SegmentedControl<'open' | 'create'>
            ariaLabel="Modo do cofre"
            value={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
            }}
            className="w-full grid grid-cols-2"
            options={[
              { value: 'open', label: t.unlockTitle },
              { value: 'create', label: t.createTitle },
            ]}
          />
        </div>

        {recentVaults.length > 0 && mode === 'open' && (
          <div className="mb-3 flex flex-col gap-1">
            <span className="text-[11px] font-medium text-fg-subtle">{t.recentVaults}</span>
            <div className="flex flex-wrap gap-1.5">
              {recentVaults.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => setVaultPath(path)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-subtle px-2 py-1 text-[11px] font-mono text-fg-muted hover:text-fg hover:border-border-strong transition-colors cursor-pointer truncate max-w-full"
                >
                  <FolderOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{path}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <motion.form
          key={errorNonce}
          animate={errorNonce > 0 ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
          transition={{ duration: 0.25 }}
          onSubmit={handleSubmit}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t.vaultPath}
            <Input
              value={vaultPath}
              onChange={(e) => setVaultPath(e.target.value)}
              aria-label={t.vaultPath}
              className="font-mono"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
            {t.masterPassword}
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label={t.masterPassword}
              revealLabel={t.reveal}
              hideLabel={t.hide}
              capsLockLabel={t.capsLockOn}
              autoFocus
            />
          </label>

          {mode === 'open' && (
            <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
              {t.keyfilePath}
              <Input
                value={keyfile}
                onChange={(e) => setKeyfile(e.target.value)}
                aria-label={t.keyfilePath}
                leftSlot={<FileKey2 className="h-3.5 w-3.5" aria-hidden="true" />}
                className="font-mono"
              />
            </label>
          )}

          {error && (
            <p
              role="alert"
              className="text-xs text-danger bg-danger-subtle border border-danger/25 px-3 py-2 rounded-md"
            >
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" size="md" isLoading={busy} className="mt-1">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {mode === 'open' ? t.unlockBtn : t.createBtn}
          </Button>
        </motion.form>

        <p className="mt-4 text-[11px] text-fg-subtle border-t border-border pt-3 leading-relaxed">
          {t.onboardingTip}
        </p>
      </motion.div>
    </main>
  );
}
