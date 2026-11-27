import type { ReactNode } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { cn } from '../lib/cn';

const badgeVariants = tv({
  base: 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none border',
  variants: {
    variant: {
      neutral: 'bg-bg-muted text-fg-muted border-border',
      accent: 'bg-accent-subtle text-accent border-accent/25',
      warning: 'bg-warning-subtle text-warning border-warning/25',
      danger: 'bg-danger-subtle text-danger border-danger/25',
    },
  },
  defaultVariants: {
    variant: 'neutral',
  },
});

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: ReactNode;
  className?: string;
}

export function Badge({ variant, className, children }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}

export const Tag = Badge;
