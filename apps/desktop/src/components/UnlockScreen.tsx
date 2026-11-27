import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, Clock3, FileKey2, FolderOpen, KeyRound, LockKeyhole, Plus, ShieldCheck } from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import type { Translations } from '../i18n/pt-BR';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';
import { Button, Checkbox, Input, PasswordInput } from '../ui';

export function UnlockScreen({ t }: { t: Translations }) {
  const queryClient = useQueryClient();
  const { setUnlocked, recentVaults, addRecentVault } = useUiStore();
  const configQuery = useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.getConfig(),
  });
  const [mode, setMode] = useState<'open' | 'create'>('open');
  const [vaultPath, setVaultPath] = useState(recentVaults[0] || './cofre.kdbx');
  const [password, setPassword] = useState('');
  const [keyfile, setKeyfile] = useState('');
  const [keepOpen, setKeepOpen] = useState(false);
  const [rememberSession, setRememberSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (configQuery.data) {
      setRememberSession(configQuery.data.security.rememberSession);
    }
  }, [configQuery.data]);

  async function browseVault() {
    try {
      const path = await api.chooseVaultFile(mode === 'create');
      if (path) { setVaultPath(path); setError(null); }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function browseKeyfile() {
    try {
      const path = await api.chooseKeyFile();
      if (path) setKeyfile(path);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'open') {
        await api.openVault(vaultPath, password, keyfile || undefined, keepOpen, rememberSession);
      } else {
        await api.createVault(vaultPath, password, 'BetterKeePass', keepOpen, rememberSession);
      }
      setPassword('');
      addRecentVault(vaultPath);
      await queryClient.invalidateQueries({ queryKey: ['app-config'] });
      setUnlocked(true, vaultPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-bg text-fg flex flex-col">
      <header className="flex items-center gap-2.5 px-8 py-6 sm:px-12">
        <BrandIcon className="h-9 w-9" />
        <span className="font-semibold tracking-tight">{t.appName}</span>
      </header>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
        className="w-full max-w-5xl mx-auto flex-1 px-8 sm:px-12 py-8 sm:py-14">
        <div className="max-w-xl mb-12">
          <span className="text-[11px] font-semibold tracking-[0.16em] text-accent">{t.localOnly}</span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">{t.welcomeTitle}</h1>
          <p className="mt-3 text-sm leading-6 text-fg-muted">{t.welcomeDesc}</p>
        </div>
        <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-16">
          <section aria-label={t.recentVaults}>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-[11px] font-semibold tracking-[0.14em] text-fg-subtle">{t.yourVaults}</h2>
              <Clock3 className="h-4 w-4 text-fg-subtle" aria-hidden="true" />
            </div>
            {recentVaults.length ? (
              <ul className="mt-2">
                {recentVaults.map((path) => (
                  <li key={path}>
                    <button type="button" onClick={() => { setMode('open'); setVaultPath(path); setError(null); }}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-ring ${mode === 'open' && vaultPath === path ? 'bg-accent-subtle' : 'hover:bg-surface-hover'}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface border border-border text-accent"><LockKeyhole className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{path.split(/[\\/]/).pop() || path}</span><span className="block truncate text-xs text-fg-subtle mt-0.5">{path}</span></span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="py-6 text-sm text-fg-subtle leading-relaxed">{t.noRecentVaults}</p>}
            <button type="button" onClick={() => { setMode('open'); setError(null); void api.chooseVaultFile().then(path => { if (path) setVaultPath(path); }).catch(err => setError(String(err))); }}
              className="mt-3 flex w-full items-center gap-3 rounded-lg border border-dashed border-border-strong px-3 py-3 text-sm text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">
              <FolderOpen className="h-4 w-4 text-accent" aria-hidden="true" />{t.browseVault}
            </button>
          </section>
          <section>
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <h2 className="text-base font-semibold tracking-tight">{mode === 'open' ? t.unlockTitle : t.createTitle}</h2>
              <button type="button" onClick={() => { setMode(mode === 'open' ? 'create' : 'open'); setError(null); }} className="text-xs font-medium text-accent hover:underline cursor-pointer">
                {mode === 'open' ? t.createTitle : t.unlockTitle}
              </button>
            </div>
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
                {t.selectedVault}
                <span className="flex gap-2"><Input value={vaultPath} onChange={e => setVaultPath(e.target.value)} aria-label={t.vaultPath} className="font-mono min-w-0" required /><Button type="button" variant="secondary" size="md" onPress={() => void browseVault()} aria-label={t.browseVault}><FolderOpen className="h-4 w-4" /></Button></span>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
                {t.masterPassword}
                <PasswordInput value={password} onChange={e => setPassword(e.target.value)} aria-label={t.masterPassword} revealLabel={t.reveal} hideLabel={t.hide} capsLockLabel={t.capsLockOn} autoFocus />
              </label>
              {mode === 'open' && <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
                {t.keyfilePath}
                <span className="flex gap-2"><Input value={keyfile} onChange={e => setKeyfile(e.target.value)} aria-label={t.keyfilePath} leftSlot={<FileKey2 className="h-3.5 w-3.5" aria-hidden="true" />} className="font-mono min-w-0" /><Button type="button" variant="secondary" size="md" onPress={() => void browseKeyfile()} aria-label={t.browseKeyfile}><FolderOpen className="h-4 w-4" /></Button></span>
              </label>}
              <div><Checkbox isSelected={keepOpen} onChange={setKeepOpen}>{t.keepOpen}</Checkbox><p className="mt-1 ml-6 text-xs text-fg-subtle leading-relaxed">{t.keepOpenDesc}</p></div>
              <div><Checkbox isSelected={rememberSession} onChange={setRememberSession}>{t.rememberSession}</Checkbox><p className="mt-1 ml-6 text-xs text-fg-subtle leading-relaxed">{t.rememberSessionDesc}</p></div>
              {error && <p role="alert" className="text-xs text-danger bg-danger-subtle border border-danger/25 px-3 py-2 rounded-md">{error}</p>}
              <Button type="submit" variant="primary" size="md" isLoading={busy} className="w-full mt-1">{mode === 'open' ? <KeyRound className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}{mode === 'open' ? t.unlockBtn : t.createBtn}</Button>
            </form>
          </section>
        </div>
      </motion.div>
      <footer className="flex items-center gap-2 px-8 sm:px-12 py-6 text-xs text-fg-subtle"><ShieldCheck className="h-4 w-4 text-accent shrink-0" aria-hidden="true" />{t.onboardingTip}</footer>
    </main>
  );
}
