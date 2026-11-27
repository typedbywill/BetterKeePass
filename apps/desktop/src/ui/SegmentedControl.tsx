import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Tooltip } from './Tooltip';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  iconOnly?: boolean;
  isDisabled?: boolean;
  size?: 'xs' | 'sm';
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  iconOnly = false,
  isDisabled = false,
  size = 'sm',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-bg-muted p-0.5 gap-0.5',
        isDisabled && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const btn = (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.label}
            disabled={isDisabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
              size === 'xs' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs',
              iconOnly && (size === 'xs' ? 'w-6 px-0' : 'w-7 px-0'),
              selected
                ? 'bg-surface text-fg shadow-xs'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {opt.icon}
            {!iconOnly && <span>{opt.label}</span>}
          </button>
        );

        return iconOnly ? (
          <Tooltip key={opt.value} content={opt.label}>
            {btn}
          </Tooltip>
        ) : (
          btn
        );
      })}
    </div>
  );
}
