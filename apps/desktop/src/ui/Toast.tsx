import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Info, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { useUiStore, type ToastItem } from '../store/ui';

function ToastRow({
  toast,
  clearingLabel,
  onDismiss,
}: {
  toast: ToastItem;
  clearingLabel: string;
  onDismiss: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current - toast.createdAt >= toast.durationMs) {
        onDismiss();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [toast.createdAt, toast.durationMs, onDismiss]);

  const elapsedMs = Math.max(0, now - toast.createdAt);
  const progress = Math.max(0, Math.min(1, 1 - elapsedMs / toast.durationMs));
  const remainingSecs = Math.max(
    0,
    Math.ceil(((toast.clearAfterSeconds ?? 0) * 1000 - elapsedMs) / 1000),
  );

  const icon =
    toast.kind === 'clipboard' ? (
      <ClipboardCheck className="h-4 w-4 text-accent shrink-0" aria-hidden="true" />
    ) : toast.kind === 'success' ? (
      <CheckCircle2 className="h-4 w-4 text-accent shrink-0" aria-hidden="true" />
    ) : toast.kind === 'warning' || toast.kind === 'danger' ? (
      <AlertTriangle
        className={cn(
          'h-4 w-4 shrink-0',
          toast.kind === 'danger' ? 'text-danger' : 'text-warning',
        )}
        aria-hidden="true"
      />
    ) : (
      <Info className="h-4 w-4 text-fg-muted shrink-0" aria-hidden="true" />
    );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.16 }}
      role="status"
      aria-live="polite"
      className="relative overflow-hidden w-80 rounded-lg border border-border-strong bg-surface text-fg shadow-xl"
    >
      <div className="flex items-start gap-2.5 p-3">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-fg">{toast.title}</p>
          {toast.kind === 'clipboard' && toast.clearAfterSeconds ? (
            <p className="text-[11px] text-fg-muted mt-0.5 font-mono tabular-nums">
              {clearingLabel} {remainingSecs}s
            </p>
          ) : (
            toast.description && (
              <p className="text-[11px] text-fg-muted mt-0.5">{toast.description}</p>
            )
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-fg-subtle hover:text-fg hover:bg-surface-hover cursor-pointer"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      {toast.kind === 'clipboard' && (
        <div className="h-0.5 w-full bg-bg-muted">
          <div
            className="h-full bg-accent transition-[width] duration-200 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </motion.div>
  );
}

export function ToastViewport({ clearingLabel }: { clearingLabel: string }) {
  const { toasts, dismissToast } = useUiStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastRow
              toast={toast}
              clearingLabel={clearingLabel}
              onDismiss={() => dismissToast(toast.id)}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
