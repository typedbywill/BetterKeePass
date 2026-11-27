import type { ReactNode } from 'react';
import { Checkbox as AriaCheckbox, type CheckboxProps as AriaCheckboxProps } from 'react-aria-components';
import { Check } from 'lucide-react';
import { cn } from '../lib/cn';

export interface CheckboxProps extends Omit<AriaCheckboxProps, 'className' | 'children'> {
  children?: ReactNode;
  className?: string;
}

export function Checkbox({ children, className, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox
      className={cn(
        'group inline-flex items-center gap-2 text-[13px] text-fg cursor-pointer select-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      {({ isSelected }) => (
        <>
          <span
            className={cn(
              'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150',
              'group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-ring',
              isSelected
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-border-strong bg-surface',
            )}
          >
            {isSelected && <Check className="h-3 w-3 stroke-[2.5]" aria-hidden="true" />}
          </span>
          {children}
        </>
      )}
    </AriaCheckbox>
  );
}
