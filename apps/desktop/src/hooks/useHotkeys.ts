import { useEffect } from 'react';

export interface HotkeyHandlers {
  enabled: boolean;
  hasOpenModal: boolean;
  onOpenPalette: () => void;
  onFocusSearch: () => void;
  onMoveSelection: (delta: -1 | 1) => void;
  onFocusDetail: () => void;
  onCopyPassword: () => void;
  onCopyUsername: () => void;
  onCopyTotp: () => void;
  onCopyUrl: () => void;
  onOpenUrl: () => void;
  onNewEntry: () => void;
  onEditEntry: () => void;
  onDeleteEntry: () => void;
  onLockVault: () => void;
  onToggleSidebar: () => void;
  onTogglePresentation: () => void;
  onOpenShortcuts: () => void;
  onEscape: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

export function useHotkeys(handlers: HotkeyHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const editable = isEditableTarget(event.target);

      if (event.key === 'Escape') {
        handlers.onEscape();
        return;
      }

      if (!handlers.enabled) return;

      // Combos com modificador funcionam mesmo quando o foco está em inputs.
      if (mod && key === 'k') {
        event.preventDefault();
        handlers.onOpenPalette();
        return;
      }
      if (mod && key === 'n') {
        event.preventDefault();
        handlers.onNewEntry();
        return;
      }
      if (mod && key === 'l') {
        event.preventDefault();
        handlers.onLockVault();
        return;
      }
      if (mod && event.key === '\\') {
        event.preventDefault();
        handlers.onToggleSidebar();
        return;
      }
      if (mod && event.shiftKey && key === 'p') {
        event.preventDefault();
        handlers.onTogglePresentation();
        return;
      }
      if ((mod && event.shiftKey && key === 'c') || (mod && !event.shiftKey && key === 't')) {
        event.preventDefault();
        handlers.onCopyTotp();
        return;
      }
      if (mod && !event.shiftKey && key === 'u') {
        event.preventDefault();
        handlers.onCopyUrl();
        return;
      }
      if (mod && !event.shiftKey && key === 'o') {
        event.preventDefault();
        handlers.onOpenUrl();
        return;
      }
      if (mod && !event.shiftKey && key === 'b') {
        event.preventDefault();
        handlers.onCopyUsername();
        return;
      }
      if (mod && !event.shiftKey && key === 'c' && !editable) {
        const selectedText = window.getSelection?.()?.toString() ?? '';
        if (!selectedText) {
          event.preventDefault();
          handlers.onCopyPassword();
          return;
        }
      }

      // Atalhos sem modificador são ignorados em campos de texto ou quando há modal aberto.
      if (editable || handlers.hasOpenModal || mod || event.altKey) return;

      if (event.key === '/') {
        event.preventDefault();
        handlers.onFocusSearch();
      } else if (event.key === '?') {
        event.preventDefault();
        handlers.onOpenShortcuts();
      } else if (event.key === 'ArrowDown' || key === 'j') {
        event.preventDefault();
        handlers.onMoveSelection(1);
      } else if (event.key === 'ArrowUp' || key === 'k') {
        event.preventDefault();
        handlers.onMoveSelection(-1);
      } else if (event.key === 'Enter') {
        handlers.onFocusDetail();
      } else if (key === 'e' || event.key === 'F2') {
        event.preventDefault();
        handlers.onEditEntry();
      } else if (event.key === 'Delete') {
        event.preventDefault();
        handlers.onDeleteEntry();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}
