import type { ReactNode } from 'react';
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from 'react-aria-components';
import { cn } from '../lib/cn';

export interface SwitchProps extends Omit<AriaSwitchProps, 'className' | 'children'> {
  children?: ReactNode;
  className?: string;
}

export function Switch({ children, className, ...props }: SwitchProps) {
  return (
    <AriaSwitch
      className={cn(
        'group inline-flex items-center gap-2.5 text-[13px] text-fg cursor-pointer select-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {({ isSelected }) => (
        <>
          <span
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150',
              'group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-ring group-data-[focus-visible]:ring-offset-1 group-data-[focus-visible]:ring-offset-bg',
              isSelected
                ? 'border-accent bg-accent'
                : 'border-border-strong bg-bg-muted',
            )}
          >
            <span
              className={cn(
                'inline-block h-3.5 w-3.5 rounded-full bg-surface shadow-xs transition-transform duration-150',
                isSelected ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </span>
          {children}
        </>
      )}
    </AriaSwitch>
  );
}
