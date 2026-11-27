import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  Folder,
  HeartPulse,
  HelpCircle,
  KeyRound,
  Lock,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shield,
  Sun,
  Trash2,
} from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { cn } from '../lib/cn';
import { api, type GroupNode } from '../lib/tauri';
import { useUiStore, type ThemeMode } from '../store/ui';
import { IconButton, Kbd, SegmentedControl, Tooltip } from '../ui';

interface NavRowProps {
  active: boolean;
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  shortcut?: string;
  onClick: () => void;
}

function NavRow({
  active,
  collapsed,
  icon,
  label,
  count,
  shortcut,
  onClick,
}: NavRowProps) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring w-full',
        collapsed ? 'justify-center px-0 h-8' : 'justify-between',
        active ? 'text-fg' : 'text-fg-muted hover:text-fg hover:bg-surface-hover/70',
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="absolute inset-0 rounded-md bg-surface shadow-xs border border-border -z-0"
        />
      )}
      <span className="relative z-10 flex items-center gap-2 min-w-0">
        <span className={cn('shrink-0', active && 'text-accent')}>{icon}</span>
        {!collapsed && <span className="truncate">{label}</span>}
      </span>
      {!collapsed && typeof count === 'number' && (
        <span className="relative z-10 text-[11px] font-mono text-fg-subtle tabular-nums">
          {count}
        </span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip content={label} shortcut={shortcut} placement="right">
        {button}
      </Tooltip>
    );
  }
  return button;
}

function GroupTreeItem({
  node,
  depth,
}: {
  node: GroupNode;
  depth: number;
}) {
  const { activeView, groupFilter, setGroupFilter } = useUiStore();
  const [expanded, setExpanded] = useState(true);

  const visibleChildren = node.children.filter((c) => !c.isRecycleBin);
  const hasChildren = visibleChildren.length > 0;
  const isActive =
    activeView === 'vault' &&
    typeof groupFilter === 'object' &&
    groupFilter.groupPath === node.path;

  return (
    <li>
      <div
        className={cn(
          'relative flex items-center rounded-md text-[13px] transition-colors',
          isActive ? 'text-fg font-medium' : 'text-fg-muted hover:text-fg hover:bg-surface-hover/70',
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {isActive && (
          <motion.span
            layoutId="sidebar-active"
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute inset-0 rounded-md bg-surface shadow-xs border border-border -z-0"
          />
        )}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={node.name}
            aria-expanded={expanded}
            className="relative z-10 inline-flex h-5 w-4 items-center justify-center text-fg-subtle hover:text-fg cursor-pointer"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => setGroupFilter({ groupPath: node.path })}
          className="relative z-10 flex flex-1 items-center justify-between gap-2 py-1.5 pr-2 pl-1 min-w-0 text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Folder
              className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-accent' : 'text-fg-subtle')}
              aria-hidden="true"
            />
            <span className="truncate">{node.name}</span>
          </span>
          <span className="text-[11px] font-mono text-fg-subtle tabular-nums">
            {node.entryCount}
          </span>
        </button>
      </div>
      {hasChildren && expanded && (
        <ul className="flex flex-col gap-0.5 mt-0.5">
          {visibleChildren.map((child) => (
            <GroupTreeItem key={child.uuid} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export interface SidebarCounts {
  all: number;
  passkeys: number;
  trash: number;
}

export function Sidebar({
  t,
  tree,
  counts,
}: {
  t: Translations;
  tree?: GroupNode;
  counts: SidebarCounts;
}) {
  const {
    theme,
    setTheme,
    groupFilter,
    activeView,
    presentationMode,
    sidebarCollapsed,
    toggleSidebar,
    setGroupFilter,
    setActiveView,
    togglePresentationMode,
    setCommandPaletteOpen,
    setShortcutsOpen,
    setUnlocked,
  } = useUiStore();

  async function handleLock() {
    await api.lockVault();
    setUnlocked(false);
  }

  const rootGroups = tree?.children.filter((c) => !c.isRecycleBin) ?? [];

  return (
    <aside
      aria-label="Navegação do cofre"
      className={cn(
        'shrink-0 border-r border-border bg-bg-subtle flex flex-col justify-between transition-[width] duration-150 ease-out select-none',
        sidebarCollapsed ? 'w-14 p-2' : 'w-60 p-3',
      )}
    >
      <div className="flex flex-col gap-2 min-h-0 flex-1">
        <div
          className={cn(
            'flex items-center gap-2 py-1',
            sidebarCollapsed ? 'justify-center' : 'justify-between px-1',
          )}
        >
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent border border-accent/25">
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
              <span className="font-semibold text-[13px] tracking-tight truncate">
                {t.appName}
              </span>
            </div>
          )}
          <IconButton
            size="xs"
            variant="ghost"
            label={sidebarCollapsed ? t.expandSidebar : t.collapseSidebar}
            shortcut="Ctrl+\"
            tooltipPlacement="right"
            onPress={toggleSidebar}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </IconButton>
        </div>

        {sidebarCollapsed ? (
          <IconButton
            size="sm"
            variant="secondary"
            label={t.commandPalette}
            shortcut="Ctrl+K"
            tooltipPlacement="right"
            className="w-full"
            onPress={() => setCommandPaletteOpen(true)}
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        ) : (
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center justify-between gap-2 h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg-subtle hover:text-fg hover:border-border-strong transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{t.commandsSection}</span>
            </span>
            <Kbd>Ctrl K</Kbd>
          </button>
        )}

        <nav className="flex flex-col gap-0.5 mt-1">
          <NavRow
            active={activeView === 'vault' && groupFilter === 'all'}
            collapsed={sidebarCollapsed}
            icon={<Folder className="h-4 w-4" aria-hidden="true" />}
            label={t.allEntries}
            count={counts.all}
            onClick={() => setGroupFilter('all')}
          />
          <NavRow
            active={activeView === 'vault' && groupFilter === 'passkeys'}
            collapsed={sidebarCollapsed}
            icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
            label={t.passkeysOnly}
            count={counts.passkeys}
            onClick={() => setGroupFilter('passkeys')}
          />
          <NavRow
            active={activeView === 'vault' && groupFilter === 'trash'}
            collapsed={sidebarCollapsed}
            icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            label={t.recycleBin}
            count={counts.trash}
            onClick={() => setGroupFilter('trash')}
          />
        </nav>

        {!sidebarCollapsed && rootGroups.length > 0 && (
          <div className="mt-3 flex flex-col min-h-0 flex-1">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle mb-1">
              {t.groups}
            </p>
            <ul className="flex flex-col gap-0.5 overflow-y-auto pr-0.5">
              {rootGroups.map((group) => (
                <GroupTreeItem key={group.uuid} node={group} depth={0} />
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-2.5">
        {!sidebarCollapsed && (
          <div className="flex items-center justify-between px-1 pb-1.5">
            <span className="text-[11px] text-fg-subtle">{t.themeLabel}</span>
            <SegmentedControl<ThemeMode>
              size="xs"
              iconOnly
              ariaLabel={t.themeLabel}
              value={theme}
              onChange={setTheme}
              options={[
                {
                  value: 'system',
                  label: t.themeSystem,
                  icon: <Monitor className="h-3 w-3" aria-hidden="true" />,
                },
                {
                  value: 'light',
                  label: t.themeLight,
                  icon: <Sun className="h-3 w-3" aria-hidden="true" />,
                },
                {
                  value: 'dark',
                  label: t.themeDark,
                  icon: <Moon className="h-3 w-3" aria-hidden="true" />,
                },
              ]}
            />
          </div>
        )}

        <NavRow
          active={activeView === 'health'}
          collapsed={sidebarCollapsed}
          icon={<HeartPulse className="h-4 w-4" aria-hidden="true" />}
          label={t.health}
          onClick={() => setActiveView('health')}
        />
        <NavRow
          active={activeView === 'settings'}
          collapsed={sidebarCollapsed}
          icon={<Settings className="h-4 w-4" aria-hidden="true" />}
          label={t.settings}
          onClick={() => setActiveView('settings')}
        />
        <NavRow
          active={presentationMode}
          collapsed={sidebarCollapsed}
          icon={<EyeOff className="h-4 w-4" aria-hidden="true" />}
          label={t.presentationMode}
          shortcut="Ctrl+Shift+P"
          onClick={togglePresentationMode}
        />
        <div className={cn('flex gap-1', sidebarCollapsed ? 'flex-col' : 'items-center')}>
          <div className="flex-1">
            <NavRow
              active={false}
              collapsed={sidebarCollapsed}
              icon={<Lock className="h-4 w-4" aria-hidden="true" />}
              label={t.lockVault}
              shortcut="Ctrl+L"
              onClick={() => void handleLock()}
            />
          </div>
          <IconButton
            size="sm"
            variant="ghost"
            label={t.shortcutsTitle}
            shortcut="?"
            tooltipPlacement="right"
            onPress={() => setShortcutsOpen(true)}
          >
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </aside>
  );
}
