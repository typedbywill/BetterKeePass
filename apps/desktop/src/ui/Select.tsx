import {
  Button as AriaButton,
  Label as AriaLabel,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
} from 'react-aria-components';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';

export interface SelectOption {
  id: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  ariaLabel?: string;
  options: SelectOption[];
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  isDisabled?: boolean;
  className?: string;
}

export function Select({
  label,
  ariaLabel,
  options,
  selectedKey,
  onSelectionChange,
  isDisabled,
  className,
}: SelectProps) {
  return (
    <AriaSelect
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (key !== null) onSelectionChange(String(key));
      }}
      isDisabled={isDisabled}
      aria-label={ariaLabel ?? label}
      className={cn('flex flex-col gap-1', className)}
    >
      {label && <AriaLabel className="text-xs font-medium text-fg-muted">{label}</AriaLabel>}
      <AriaButton className="inline-flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] text-fg outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 cursor-pointer">
        <AriaSelectValue className="truncate" />
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
      </AriaButton>
      <AriaPopover
        offset={4}
        className="z-50 min-w-[var(--trigger-width)] rounded-lg border border-border-strong bg-surface p-1 shadow-xl outline-none"
      >
        <AriaListBox className="max-h-60 overflow-y-auto outline-none">
          {options.map((opt) => (
            <AriaListBoxItem
              key={opt.id}
              id={opt.id}
              textValue={opt.label}
              className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-fg outline-none cursor-pointer data-[focused]:bg-surface-hover data-[selected]:text-accent"
            >
              {({ isSelected }) => (
                <>
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />}
                </>
              )}
            </AriaListBoxItem>
          ))}
        </AriaListBox>
      </AriaPopover>
    </AriaSelect>
  );
}
