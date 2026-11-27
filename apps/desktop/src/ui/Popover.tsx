import type { ReactNode } from 'react';
import {
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from 'react-aria-components';
import { cn } from '../lib/cn';

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'bottom end' | 'bottom start';
  className?: string;
}

export function Popover({
  trigger,
  children,
  isOpen,
  onOpenChange,
  placement = 'bottom end',
  className,
}: PopoverProps) {
  return (
    <AriaDialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger}
      <AriaPopover
        placement={placement}
        offset={6}
        className={cn(
          'z-50 rounded-xl border border-border-strong bg-surface text-fg shadow-xl outline-none',
          className,
        )}
      >
        <AriaDialog className="outline-none">
          {({ close }) => (typeof children === 'function' ? children(close) : children)}
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  );
}
