import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import {
  ChevronRight,
  EyeOff,
  Folder,
  FolderOpen,
  HeartPulse,
  HelpCircle,
  KeyRound,
  Lock,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
} from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import type { Translations } from '../i18n/pt-BR';
import { cn } from '../lib/cn';
import { getKeepassIcon } from '../lib/keepassIcons';
import { api, type GroupNode } from '../lib/tauri';
import { useUiStore, type ThemeMode } from '../store/ui';
import { Dialog, IconButton, Kbd, SegmentedControl, Tooltip } from '../ui';

interface NavRowProps {
  active: boolean;
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
  shortcut?: string;
  onClick: () => void;
}

function GroupChildren({ children }: { children: ReactNode }) {
  const isPresent = useIsPresent();
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'easeOut' }}
      className="overflow-hidden"
      aria-hidden={!isPresent || undefined}
      inert={!isPresent || undefined}
    >
      <ul className="flex flex-col gap-0.5 mt-0.5">{children}</ul>
    </motion.div>
  );
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
        <span
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

function GroupIcon({
  node,
  expanded,
  isActive,
}: {
  node: GroupNode;
  expanded: boolean;
  isActive: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const customIconQuery = useQuery({
    queryKey: ['custom-icon', node.customIconUuid],
    queryFn: () => api.getCustomIcon(node.customIconUuid!),
    enabled: Boolean(node.customIconUuid),
    staleTime: Infinity,
  });

  if (node.customIconUuid && customIconQuery.data && !imgFailed) {
    return (
      <img
        src={customIconQuery.data}
        alt=""
        className="h-3.5 w-3.5 shrink-0 object-contain rounded-[2px]"
        onError={() => setImgFailed(true)}
      />
    );
  }

  const BuiltInIcon =
    node.iconId !== null &&
    node.iconId !== undefined &&
    node.iconId !== 48 &&
    node.iconId !== 49
      ? getKeepassIcon(node.iconId)
      : null;

  if (BuiltInIcon) {
    return (
      <BuiltInIcon
        className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-accent' : 'text-fg-subtle')}
        aria-hidden="true"
      />
    );
  }

  const FolderIcon = expanded ? FolderOpen : Folder;
  return (
    <FolderIcon
      className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-accent' : 'text-fg-subtle')}
      aria-hidden="true"
    />
  );
}

function InlineNewGroupInput({
  t,
  depth,
  onSubmit,
  onCancel,
}: {
  t: Translations;
  depth: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (trimmed) onSubmit(trimmed);
        else onCancel();
      }}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      className="flex items-center gap-1 pr-2 py-1"
    >
      <Folder className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
      <input
        autoFocus
        type="text"
        value={name}
        placeholder={t.newGroupPlaceholder}
        aria-label={t.newGroup}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed) onSubmit(trimmed);
          else onCancel();
        }}
        className="w-full min-w-0 rounded border border-ring bg-surface px-1.5 py-0.5 text-xs text-fg outline-none"
      />
    </form>
  );
}

function GroupTreeItem({
  t,
  node,
  depth,
}: {
  t: Translations;
  node: GroupNode;
  depth: number;
}) {
  const queryClient = useQueryClient();
  const {
    activeView,
    groupFilter,
    setGroupFilter,
    expandedGroups,
    toggleGroupExpanded,
    setGroupExpanded,
    draggingEntryId,
    setDraggingEntryId,
    pushToast,
  } = useUiStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [creatingChild, setCreatingChild] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const dragDepthRef = useRef(0);

  const visibleChildren = node.children.filter((c) => !c.isRecycleBin);
  const hasChildren = visibleChildren.length > 0;
  const expanded = expandedGroups.includes(node.uuid);
  const isActive =
    activeView === 'vault' &&
    typeof groupFilter === 'object' &&
    groupFilter.groupPath === node.path;

  async function handleDropEntry(entryUuid: string) {
    if (!entryUuid) return;
    await api.moveEntry(entryUuid, node.path);
    await queryClient.invalidateQueries({ queryKey: ['entries'] });
    await queryClient.invalidateQueries({ queryKey: ['group-tree'] });
    pushToast({ kind: 'success', title: t.movedEntryToast });
  }

  async function handleCreateSubgroup(name: string) {
    setCreatingChild(false);
    const fullPath = node.path ? `${node.path}/${name}` : name;
    await api.createGroup(fullPath);
    setGroupExpanded(node.uuid, true);
    setGroupFilter({ groupPath: fullPath });
    await queryClient.invalidateQueries({ queryKey: ['group-tree'] });
    pushToast({ kind: 'success', title: t.groupCreatedToast });
  }

  async function handleGroupIcon(iconId: number) {
    try {
      await api.setGroupIcon(node.path, iconId);
      await queryClient.invalidateQueries({ queryKey: ['group-tree'] });
      setIconDialogOpen(false);
      pushToast({ kind: 'success', title: t.iconUpdatedToast });
    } catch {
      pushToast({ kind: 'danger', title: t.groupIconError });
    }
  }

  return (
    <li>
      <div
        data-group-path={node.path}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 180), y: Math.min(e.clientY, window.innerHeight - 48) });
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepthRef.current += 1;
          setIsDragOver(true);
        }}
        onDragLeave={() => {
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) {
            setIsDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepthRef.current = 0;
          setIsDragOver(false);
          const droppedUuid = e.dataTransfer.getData('text/plain') || draggingEntryId;
          setDraggingEntryId(null);
          if (droppedUuid) {
            void handleDropEntry(droppedUuid);
          }
        }}
        className={cn(
          'group/row relative flex items-center rounded-md text-[13px] transition-colors',
          isActive ? 'text-fg font-medium' : 'text-fg-muted hover:text-fg hover:bg-surface-hover/70',
          isDragOver && 'ring-2 ring-accent bg-accent-subtle/60 text-fg',
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {isActive && (
          <span
            className="absolute inset-0 rounded-md bg-surface shadow-xs border border-border -z-0"
          />
        )}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleGroupExpanded(node.uuid);
            }}
            aria-label={node.name}
            aria-expanded={expanded}
            className="relative z-10 inline-flex h-5 w-4 items-center justify-center text-fg-subtle hover:text-fg cursor-pointer"
          >
            <ChevronRight className={cn('h-3 w-3 transition-transform duration-200 motion-reduce:transition-none', expanded && 'rotate-90')} aria-hidden="true" />
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => {
            setGroupFilter({ groupPath: node.path });
            if (hasChildren) {
              toggleGroupExpanded(node.uuid);
            }
          }}
          className="relative z-10 flex flex-1 items-center justify-between gap-2 py-1.5 pr-2 pl-1 min-w-0 text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <GroupIcon node={node} expanded={hasChildren && expanded} isActive={isActive} />
            <span className="truncate">{node.name}</span>
          </span>
          <span className="text-[11px] font-mono text-fg-subtle tabular-nums group-hover/row:opacity-0 transition-opacity">
            {node.entryCount}
          </span>
        </button>
        <button
          type="button"
          title={t.newGroup}
          aria-label={`${t.newGroup} em ${node.name}`}
          onClick={(e) => {
            e.stopPropagation();
            setGroupExpanded(node.uuid, true);
            setCreatingChild(true);
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 inline-flex h-5 w-5 items-center justify-center rounded bg-surface/90 text-fg-subtle hover:text-fg hover:bg-surface-hover opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-opacity cursor-pointer"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      {creatingChild && (
        <InlineNewGroupInput
          t={t}
          depth={depth + 1}
          onSubmit={(name) => void handleCreateSubgroup(name)}
          onCancel={() => setCreatingChild(false)}
        />
      )}
      <AnimatePresence initial={false}>
        {hasChildren && expanded && (
          <GroupChildren key="children">
            {visibleChildren.map((child) => (
              <GroupTreeItem key={child.uuid} t={t} node={child} depth={depth + 1} />
            ))}
          </GroupChildren>
        )}
      </AnimatePresence>
      {contextMenu && createPortal(
        <div className="fixed inset-0 z-50" onMouseDown={() => setContextMenu(null)} onKeyDown={(e) => { if (e.key === 'Escape') setContextMenu(null); }}>
          <div role="menu" style={{ left: contextMenu.x, top: contextMenu.y }} className="fixed min-w-44 rounded-lg border border-border-strong bg-surface p-1 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <button autoFocus type="button" role="menuitem" className="w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-fg hover:bg-surface-hover focus:bg-surface-hover outline-none" onClick={() => { setContextMenu(null); setIconDialogOpen(true); }}>
              {t.changeIcon}
            </button>
          </div>
        </div>, document.body,
      )}
      <Dialog isOpen={iconDialogOpen} onOpenChange={setIconDialogOpen} title={t.changeIcon} closeLabel={t.close} size="sm">
        <div className="grid grid-cols-8 gap-1 p-4 max-h-80 overflow-y-auto">
          {Array.from({ length: 69 }, (_, iconId) => {
            const Icon = getKeepassIcon(iconId);
            return Icon && <button key={iconId} type="button" aria-label={`${t.builtinIconNumber} ${iconId}`} aria-pressed={node.iconId === iconId} title={`${t.builtinIconNumber} ${iconId}`} onClick={() => void handleGroupIcon(iconId)} className={cn('flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring outline-none', node.iconId === iconId && 'bg-accent-subtle text-accent')}><Icon className="h-4 w-4" aria-hidden="true" /></button>;
          })}
        </div>
      </Dialog>
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
  const queryClient = useQueryClient();
  const [creatingRootGroup, setCreatingRootGroup] = useState(false);
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
    pushToast,
  } = useUiStore();

  async function handleCreateRootGroup(name: string) {
    setCreatingRootGroup(false);
    await api.createGroup(name);
    setGroupFilter({ groupPath: name });
    await queryClient.invalidateQueries({ queryKey: ['group-tree'] });
    pushToast({ kind: 'success', title: t.groupCreatedToast });
  }

  async function handleLock() {
    await api.lockVault();
    setUnlocked(false);
  }

  const rootGroups = tree?.children.filter((c) => !c.isRecycleBin) ?? [];

  return (
    <aside
      aria-label="Navegação do cofre"
      className={cn(
        'shrink-0 border-r border-border bg-bg-subtle flex flex-col justify-between select-none overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none',
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
              <BrandIcon className="h-6 w-6 shrink-0" />
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

        {!sidebarCollapsed && (
          <div className="mt-3 flex flex-col min-h-0 flex-1">
            <div className="group/header flex items-center justify-between px-2 mb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                {t.groups}
              </p>
              <button
                type="button"
                title={t.newGroup}
                aria-label={t.newGroup}
                onClick={() => setCreatingRootGroup(true)}
                className="inline-flex h-4 w-4 items-center justify-center rounded text-fg-subtle hover:text-fg hover:bg-surface-hover opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
            {creatingRootGroup && (
              <InlineNewGroupInput
                t={t}
                depth={0}
                onSubmit={(name) => void handleCreateRootGroup(name)}
                onCancel={() => setCreatingRootGroup(false)}
              />
            )}
            <ul className="flex flex-col gap-0.5 overflow-y-auto -mx-3 px-3 pb-1">
              {rootGroups.map((group) => (
                <GroupTreeItem key={group.uuid} t={t} node={group} depth={0} />
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
