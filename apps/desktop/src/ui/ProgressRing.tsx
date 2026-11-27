import { cn } from '../lib/cn';

export interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function ProgressRing({
  value,
  max,
  size = 28,
  strokeWidth = 2.5,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const dashOffset = circumference * (1 - ratio);
  const urgent = value <= 5;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className={cn('-rotate-90 shrink-0', className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={urgent ? 'var(--warning)' : 'var(--accent)'}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset,stroke] duration-300 ease-linear"
      />
    </svg>
  );
}
