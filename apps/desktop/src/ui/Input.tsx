import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import {
  Input as AriaInput,
  SearchField as AriaSearchField,
  Button as AriaButton,
} from 'react-aria-components';
import { Check, Copy, Eye, EyeOff, Search, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { Kbd } from './Kbd';

const baseFieldClass =
  'w-full rounded-md border border-border bg-surface text-fg placeholder:text-fg-subtle text-[13px] transition-colors duration-150 outline-none focus:border-ring focus:ring-2 focus:ring-ring/25 disabled:opacity-50 disabled:cursor-not-allowed';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leftSlot, rightSlot, ...props },
  ref,
) {
  if (!leftSlot && !rightSlot) {
    return (
      <AriaInput
        ref={ref}
        className={cn(baseFieldClass, 'h-8 px-2.5', className)}
        {...props}
      />
    );
  }
  return (
    <div className="relative flex items-center w-full">
      {leftSlot && (
        <span className="absolute left-2.5 flex items-center text-fg-subtle pointer-events-none">
          {leftSlot}
        </span>
      )}
      <AriaInput
        ref={ref}
        className={cn(
          baseFieldClass,
          'h-8 px-2.5',
          leftSlot ? 'pl-8' : '',
          rightSlot ? 'pr-9' : '',
          className,
        )}
        {...props}
      />
      {rightSlot && (
        <span className="absolute right-1.5 flex items-center gap-0.5">{rightSlot}</span>
      )}
    </div>
  );
});

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCopy?: () => void;
  generatorSlot?: ReactNode;
  capsLockLabel?: string;
  revealLabel?: string;
  hideLabel?: string;
  copyLabel?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    {
      className,
      onCopy,
      generatorSlot,
      capsLockLabel,
      revealLabel = 'Reveal',
      hideLabel = 'Hide',
      copyLabel = 'Copy',
      onKeyUp,
      onKeyDown,
      ...props
    },
    ref,
  ) {
    const [visible, setVisible] = useState(false);
    const [copied, setCopied] = useState(false);
    const [capsLock, setCapsLock] = useState(false);

    function checkCaps(e: KeyboardEvent<HTMLInputElement>) {
      if (typeof e.getModifierState === 'function') {
        setCapsLock(e.getModifierState('CapsLock'));
      }
    }

    function handleCopy() {
      onCopy?.();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }

    return (
      <div className="flex flex-col gap-1 w-full">
        <div className="relative flex items-center w-full">
          <AriaInput
            ref={ref}
            type={visible ? 'text' : 'password'}
            className={cn(baseFieldClass, 'h-8 pl-2.5 pr-20 font-mono', className)}
            onKeyDown={(e) => {
              checkCaps(e);
              onKeyDown?.(e);
            }}
            onKeyUp={(e) => {
              checkCaps(e);
              onKeyUp?.(e);
            }}
            {...props}
          />
          <div className="absolute right-1 flex items-center gap-0.5">
            {generatorSlot}
            {onCopy && (
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copyLabel}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors cursor-pointer"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? hideLabel : revealLabel}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors cursor-pointer"
            >
              {visible ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {capsLock && capsLockLabel && (
          <p className="text-[11px] text-warning flex items-center gap-1" role="status">
            {capsLockLabel}
          </p>
        )}
      </div>
    );
  },
);

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, autoGrow = true, value, onChange, rows = 3, ...props },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!autoGrow || !el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 64)}px`;
  }, [value, autoGrow]);

  return (
    <textarea
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      rows={rows}
      value={value}
      onChange={onChange}
      className={cn(baseFieldClass, 'px-2.5 py-2 resize-none leading-relaxed', className)}
      {...props}
    />
  );
});

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  shortcutHint?: string;
  clearLabel?: string;
  className?: string;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  {
    value,
    onChange,
    placeholder,
    ariaLabel,
    shortcutHint = '/',
    clearLabel = 'Clear',
    className,
  },
  ref,
) {
  return (
    <AriaSearchField
      value={value}
      onChange={onChange}
      aria-label={ariaLabel ?? placeholder ?? 'Search'}
      className={cn('relative flex items-center w-full group', className)}
    >
      <Search
        className="h-3.5 w-3.5 text-fg-subtle absolute left-2.5 pointer-events-none"
        aria-hidden="true"
      />
      <AriaInput
        ref={ref}
        placeholder={placeholder}
        className={cn(baseFieldClass, 'h-8 pl-8 pr-10')}
      />
      {value ? (
        <AriaButton
          aria-label={clearLabel}
          onPress={() => onChange('')}
          className="absolute right-1.5 inline-flex h-5 w-5 items-center justify-center rounded text-fg-subtle hover:text-fg hover:bg-surface-hover cursor-pointer outline-none"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </AriaButton>
      ) : (
        shortcutHint && (
          <span className="absolute right-2 pointer-events-none hidden sm:inline-flex">
            <Kbd>{shortcutHint}</Kbd>
          </span>
        )
      )}
    </AriaSearchField>
  );
});
