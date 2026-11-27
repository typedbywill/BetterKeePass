import type { ReactNode } from 'react';
import {
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
  type TooltipTriggerComponentProps,
} from 'react-aria-components';
import { cn } from '../lib/cn';
import { Kbd } from './Kbd';

export interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  shortcut?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
  isDisabled?: boolean;
}

export function Tooltip({
  children,
  content,
  shortcut,
  placement = 'top',
  delay = 350,
  className,
  isDisabled,
}: TooltipProps) {
  const triggerProps: Omit<TooltipTriggerComponentProps, 'children'> = {
    delay,
    closeDelay: 0,
    isDisabled,
  };

  return (
    <AriaTooltipTrigger {...triggerProps}>
      {children}
      <AriaTooltip
        placement={placement}
        offset={6}
        className={cn(
          'z-50 inline-flex items-center gap-2 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-fg shadow-lg outline-none',
          'entering:animate-in entering:fade-in-0 exiting:animate-out exiting:fade-out-0',
          className,
        )}
      >
        <span>{content}</span>
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </AriaTooltip>
    </AriaTooltipTrigger>
  );
}
