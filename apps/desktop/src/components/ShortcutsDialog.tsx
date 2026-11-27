import type { Translations } from '../i18n/pt-BR';
import { useUiStore } from '../store/ui';
import { Dialog, Kbd } from '../ui';

export function ShortcutsDialog({ t }: { t: Translations }) {
  const { shortcutsOpen, setShortcutsOpen } = useUiStore();

  const sections = [
    {
      title: t.shortcutsNavigation,
      items: [
        { keys: ['Ctrl+K'], label: t.shortcutPalette },
        { keys: ['/'], label: t.shortcutSearch },
        { keys: ['↑ / ↓', 'j / k'], label: t.shortcutMove },
        { keys: ['Enter'], label: t.shortcutOpenDetail },
        { keys: ['Ctrl+\\'], label: t.shortcutToggleSidebar },
      ],
    },
    {
      title: t.shortcutsActions,
      items: [
        { keys: ['Ctrl+C'], label: t.shortcutCopyPassword },
        { keys: ['Ctrl+B'], label: t.shortcutCopyUsername },
        { keys: ['Ctrl+Shift+C'], label: t.shortcutCopyTotp },
        { keys: ['Ctrl+N'], label: t.shortcutNewEntry },
        { keys: ['E', 'F2'], label: t.shortcutEdit },
        { keys: ['Del'], label: t.shortcutDelete },
      ],
    },
    {
      title: t.shortcutsGlobal,
      items: [
        { keys: ['Ctrl+Shift+P'], label: t.shortcutPresentation },
        { keys: ['Ctrl+L'], label: t.shortcutLock },
        { keys: ['?'], label: t.shortcutShortcuts },
        { keys: ['Esc'], label: t.shortcutEscape },
      ],
    },
  ];

  return (
    <Dialog
      isOpen={shortcutsOpen}
      onOpenChange={setShortcutsOpen}
      title={t.shortcutsTitle}
      closeLabel={t.close}
      size="md"
    >
      <div className="p-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              {section.title}
            </h3>
            <div className="rounded-lg border border-border bg-bg-subtle divide-y divide-border">
              {section.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-4 px-3 py-2 text-xs"
                >
                  <span className="text-fg">{item.label}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
