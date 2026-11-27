import { forwardRef, type ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { Loader2 } from 'lucide-react';
import { tv, type VariantProps } from 'tailwind-variants';
import { cn } from '../lib/cn';
import { Tooltip } from './Tooltip';

export const buttonVariants = tv({
  base: [
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap select-none cursor-pointer',
    'transition-[background-color,color,border-color,box-shadow,transform] duration-150',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
    'data-[pressed]:scale-[0.98]',
    'disabled:opacity-50 disabled:pointer-events-none',
  ],
  variants: {
    variant: {
      primary:
        'bg-accent text-accent-fg shadow-xs hover:bg-accent-hover data-[hovered]:bg-accent-hover',
      secondary:
        'bg-surface text-fg border border-border hover:bg-surface-hover data-[hovered]:bg-surface-hover',
      outline:
        'bg-transparent text-fg border border-border-strong hover:bg-surface-hover data-[hovered]:bg-surface-hover',
      ghost:
        'bg-transparent text-fg-muted hover:text-fg hover:bg-surface-hover data-[hovered]:text-fg data-[hovered]:bg-surface-hover',
      danger:
        'bg-danger-subtle text-danger border border-danger/25 hover:bg-danger hover:text-accent-fg data-[hovered]:bg-danger data-[hovered]:text-accent-fg',
    },
    size: {
      xs: 'h-6 px-2 text-xs',
      sm: 'h-7 px-2.5 text-xs',
      md: 'h-8 px-3 text-[13px]',
    },
    isIconOnly: {
      true: 'px-0',
      false: '',
    },
    fullWidth: {
      true: 'w-full',
      false: '',
    },
  },
  compoundVariants: [
    { size: 'xs', isIconOnly: true, class: 'w-6' },
    { size: 'sm', isIconOnly: true, class: 'w-7' },
    { size: 'md', isIconOnly: true, class: 'w-8' },
  ],
  defaultVariants: {
    variant: 'secondary',
    size: 'sm',
    isIconOnly: false,
    fullWidth: false,
  },
});

export interface ButtonProps
  extends Omit<AriaButtonProps, 'className' | 'children'>,
    VariantProps<typeof buttonVariants> {
  children?: ReactNode;
  className?: string;
  isLoading?: boolean;
  title?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    isIconOnly,
    fullWidth,
    isLoading = false,
    isDisabled,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <AriaButton
      ref={ref}
      isDisabled={isDisabled || isLoading}
      className={cn(buttonVariants({ variant, size, isIconOnly, fullWidth }), className)}
      {...props}
    >
      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </AriaButton>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'isIconOnly'> {
  label: string;
  shortcut?: string;
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, tooltipPlacement = 'top', children, ...props },
  ref,
) {
  return (
    <Tooltip content={label} shortcut={shortcut} placement={tooltipPlacement}>
      <Button ref={ref} isIconOnly aria-label={label} {...props}>
        {children}
      </Button>
    </Tooltip>
  );
});
