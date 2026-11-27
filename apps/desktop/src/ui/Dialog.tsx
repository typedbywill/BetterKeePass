import type { ReactNode } from 'react';
import {
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from 'react-aria-components';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './Button';

export interface DialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  placement?: 'center' | 'top';
  showCloseButton?: boolean;
  closeLabel?: string;
  className?: string;
  children: ReactNode;
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Dialog({
  isOpen,
  onOpenChange,
  title,
  ariaLabel,
  size = 'md',
  placement = 'center',
  showCloseButton = true,
  closeLabel = 'Close',
  className,
  children,
}: DialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <AriaModalOverlay
          isOpen
          onOpenChange={onOpenChange}
          isDismissable
          className={cn(
            'fixed inset-0 z-50 flex justify-center bg-bg/75 backdrop-blur-xs p-4 overflow-y-auto',
            placement === 'top' ? 'items-start pt-16 sm:pt-20' : 'items-center',
          )}
        >
          <AriaModal className={cn('w-full outline-none', sizeMap[size])}>
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 4 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
            >
              <AriaDialog
                aria-label={ariaLabel ?? title}
                className={cn(
                  'relative rounded-xl border border-border-strong bg-surface text-fg shadow-2xl outline-none',
                  className,
                )}
              >
                {({ close }) => (
                  <>
                    {(title || showCloseButton) && (
                      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                        {title ? (
                          <AriaHeading slot="title" className="text-sm font-semibold text-fg">
                            {title}
                          </AriaHeading>
                        ) : (
                          <span />
                        )}
                        {showCloseButton && (
                          <Button
                            size="xs"
                            variant="ghost"
                            isIconOnly
                            aria-label={closeLabel}
                            onPress={close}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    )}
                    {children}
                  </>
                )}
              </AriaDialog>
            </motion.div>
          </AriaModal>
        </AriaModalOverlay>
      )}
    </AnimatePresence>
  );
}

export interface AlertDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
}

export function AlertDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  onConfirm,
}: AlertDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      showCloseButton={false}
    >
      <div className="p-4 flex flex-col gap-4">
        <p className="text-[13px] text-fg-muted leading-relaxed">{description}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onPress={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            size="sm"
            onPress={async () => {
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
