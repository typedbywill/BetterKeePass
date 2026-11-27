import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-10 gap-2.5',
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-fg-muted shadow-xs">
        {icon}
      </div>
      <div className="flex flex-col gap-1 max-w-xs">
        <p className="text-[13px] font-medium text-fg">{title}</p>
        {description && <p className="text-xs text-fg-muted leading-relaxed">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
