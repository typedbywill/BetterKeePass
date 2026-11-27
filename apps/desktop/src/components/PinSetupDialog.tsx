import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';
import { Button, Dialog, PasswordInput } from '../ui';

interface PinSetupDialogProps {
  t: Translations;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function PinSetupDialog({ t, isOpen, onOpenChange, onComplete }: PinSetupDialogProps) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setPin('');
    setConfirmPin('');
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pin.trim().length < 4) {
      setError(t.pinTooShort);
      return;
    }
    if (pin !== confirmPin) {
      setError(t.pinMismatch);
      return;
    }
    setBusy(true);
    try {
      await api.setSessionPin(pin);
      await queryClient.invalidateQueries({ queryKey: ['pin-status'] });
      await queryClient.invalidateQueries({ queryKey: ['app-config'] });
      pushToast({ kind: 'success', title: t.pinSavedToast });
      reset();
      onOpenChange(false);
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
      title={t.pinSetupTitle}
      closeLabel={t.close}
      size="sm"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="p-5 flex flex-col gap-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-accent/25 bg-accent-subtle p-3 text-xs text-fg leading-relaxed">
          <ShieldCheck className="h-4 w-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
          <span>{t.pinSetupDesc}</span>
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
          {t.pinLabel}
          <PasswordInput
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            aria-label={t.pinLabel}
            revealLabel={t.reveal}
            hideLabel={t.hide}
            capsLockLabel={t.capsLockOn}
            autoFocus
            required
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
          {t.pinConfirmLabel}
          <PasswordInput
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            aria-label={t.pinConfirmLabel}
            revealLabel={t.reveal}
            hideLabel={t.hide}
            capsLockLabel={t.capsLockOn}
            required
          />
        </label>

        {error && (
          <p role="alert" className="text-xs text-danger bg-danger-subtle border border-danger/25 px-3 py-2 rounded-md">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onPress={() => {
              reset();
              onOpenChange(false);
            }}
          >
            {t.pinSkipBtn}
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={busy}>
            {t.pinCreateBtn}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
