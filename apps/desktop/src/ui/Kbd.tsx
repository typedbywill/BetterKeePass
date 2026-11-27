import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Kbd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded border border-border-strong bg-bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-fg-muted shadow-[0_1px_0_0_var(--border)]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
