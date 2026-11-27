import { cn } from '../lib/cn';

export function evaluatePasswordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  kind: 'empty' | 'weak' | 'fair' | 'good' | 'strong';
} {
  if (!password) return { score: 0, kind: 'empty' };
  let pts = 0;
  if (password.length >= 8) pts += 1;
  if (password.length >= 12) pts += 1;
  if (password.length >= 16) pts += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) pts += 1;
  if (/\d/.test(password)) pts += 1;
  if (/[^a-zA-Z0-9]/.test(password)) pts += 1;

  if (pts <= 2) return { score: 1, kind: 'weak' };
  if (pts <= 3) return { score: 2, kind: 'fair' };
  if (pts <= 4) return { score: 3, kind: 'good' };
  return { score: 4, kind: 'strong' };
}

export interface StrengthMeterProps {
  password: string;
  labels?: {
    weak: string;
    fair: string;
    good: string;
    strong: string;
  };
  className?: string;
}

export function StrengthMeter({
  password,
  labels = { weak: 'Weak', fair: 'Fair', good: 'Good', strong: 'Strong' },
  className,
}: StrengthMeterProps) {
  const { score, kind } = evaluatePasswordStrength(password);
  if (score === 0) return null;

  const label = labels[kind as 'weak' | 'fair' | 'good' | 'strong'];
  const activeColor =
    score === 1
      ? 'bg-danger'
      : score === 2
        ? 'bg-warning'
        : 'bg-accent';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((seg) => (
          <span
            key={seg}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-150',
              seg <= score ? activeColor : 'bg-bg-muted',
            )}
          />
        ))}
      </div>
      <span
        className={cn(
          'text-[11px] font-medium',
          score === 1 ? 'text-danger' : score === 2 ? 'text-warning' : 'text-accent',
        )}
      >
        {label}
      </span>
    </div>
  );
}
