import type { ReactNode } from 'react';
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuTrigger as AriaMenuTrigger,
  Popover as AriaPopover,
  Separator as AriaSeparator,
} from 'react-aria-components';
import { cn } from '../lib/cn';

export interface MenuProps {
  trigger: ReactNode;
  children: ReactNode;
  placement?: 'bottom end' | 'bottom start' | 'top end' | 'top start';
  className?: string;
}

export function Menu({
  trigger,
  children,
  placement = 'bottom end',
  className,
}: MenuProps) {
  return (
    <AriaMenuTrigger>
      {trigger}
      <AriaPopover
        placement={placement}
        offset={4}
        className={cn(
          'z-50 min-w-44 rounded-lg border border-border-strong bg-surface p-1 shadow-xl outline-none',
          className,
        )}
      >
        <AriaMenu className="outline-none flex flex-col gap-0.5">{children}</AriaMenu>
      </AriaPopover>
    </AriaMenuTrigger>
  );
}

export interface MenuItemProps {
  id?: string;
  onAction?: () => void;
  variant?: 'default' | 'danger';
  icon?: ReactNode;
  shortcut?: string;
  children: ReactNode;
}

export function MenuItem({
  id,
  onAction,
  variant = 'default',
  icon,
  shortcut,
  children,
}: MenuItemProps) {
  return (
    <AriaMenuItem
      id={id}
      onAction={onAction}
      className={cn(
        'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium outline-none cursor-pointer transition-colors',
        variant === 'danger'
          ? 'text-danger data-[focused]:bg-danger-subtle'
          : 'text-fg data-[focused]:bg-surface-hover',
      )}
    >
      <span className="flex items-center gap-2 truncate">
        {icon && <span className="shrink-0 opacity-80">{icon}</span>}
        <span className="truncate">{children}</span>
      </span>
      {shortcut && <span className="text-[10px] font-mono text-fg-subtle">{shortcut}</span>}
    </AriaMenuItem>
  );
}

export function MenuSeparator() {
  return <AriaSeparator className="my-1 h-px bg-border" />;
}
