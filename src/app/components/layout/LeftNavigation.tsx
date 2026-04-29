import { Fragment, useState, type DragEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cookie,
  GripVertical,
  Pin,
  PinOff
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar
} from '@/app/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import { cn } from '@/app/components/ui/utils';
import {
  getNavSubgroupTitle,
  resolveVisibleNavSections,
  type NavItem,
  type NavSection,
  type NavZoneKey
} from '@/app/navigationModel';
import { useUIStore } from '@/stores/useUIStore';
import { prefetchNavigationData } from '@/app/components/layout/prefetchNavigationData';
import { useLegacyPinnedNavMigration } from '@/app/components/layout/useLegacyPinnedNavMigration';
import { useNavigationClock } from '@/app/components/layout/useNavigationClock';
import { clearAssociatedAuthCookies } from '@/services/authCookieCleanup';
import { DataService } from '@/services/DataService';

interface DragState {
  index: number;
  path: string;
  zoneKey: NavZoneKey;
}

export function LeftNavigation() {
  const { isMobile, setOpen, setOpenMobile, state } = useSidebar();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [isClearingAuthCookies, setIsClearingAuthCookies] = useState(false);
  const [authCookieStatus, setAuthCookieStatus] = useState('');
  const queryClient = useQueryClient();
  const pinnedPaths = useUIStore((store) => store.pinnedNavPaths);
  const navOrderBySection = useUIStore((store) => store.navOrderBySection);
  const togglePinnedNavItem = useUIStore((store) => store.togglePinnedNavItem);
  const moveNavItemWithinSection = useUIStore((store) => store.moveNavItemWithinSection);
  const movePinnedNavItem = useUIStore((store) => store.movePinnedNavItem);

  const collapsed = !isMobile && state === 'collapsed';
  const centralClock = useNavigationClock();

  useLegacyPinnedNavMigration();
  const { pinnedItems, visibleSections } = resolveVisibleNavSections(
    pinnedPaths,
    navOrderBySection
  );

  const clearDragState = () => {
    setDragState(null);
    setDropTargetPath(null);
  };

  const handleClearAuthCookies = async () => {
    setIsClearingAuthCookies(true);
    setAuthCookieStatus('');

    let serverSessionCleared = true;
    try {
      await DataService.deleteAuthSession();
    } catch (error) {
      serverSessionCleared = false;
      console.warn('[LeftNavigation] failed to clear server auth session', error);
    } finally {
      clearAssociatedAuthCookies();
      setIsClearingAuthCookies(false);
    }

    const message = serverSessionCleared
      ? 'Auth cookies cleared.'
      : 'Local auth cookies cleared; server session reset failed.';
    setAuthCookieStatus(message);

    if (serverSessionCleared) {
      toast.success(message);
    } else {
      toast.warning(message);
    }
  };

  const handleDragStart = (item: NavItem, zoneKey: NavZoneKey, index: number) => {
    if (collapsed || isMobile) {
      return;
    }

    setDragState({
      path: item.path,
      zoneKey,
      index
    });
    setDropTargetPath(item.path);
  };

  const handleDragOver = (event: DragEvent<HTMLLIElement>, zoneKey: NavZoneKey) => {
    if (
      !dragState ||
      dragState.zoneKey !== zoneKey ||
      dragState.path === event.currentTarget.dataset.navPath
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetPath(event.currentTarget.dataset.navPath ?? null);
  };

  const handleDrop = (zoneKey: NavZoneKey, index: number) => {
    if (!dragState || dragState.zoneKey !== zoneKey) {
      clearDragState();
      return;
    }

    if (dragState.index === index) {
      clearDragState();
      return;
    }

    if (zoneKey === 'pinned') {
      movePinnedNavItem(dragState.index, index);
    } else {
      moveNavItemWithinSection(zoneKey, dragState.index, index);
    }

    clearDragState();
  };

  const renderNavItem = (item: NavItem, zoneKey: NavZoneKey, index: number, itemCount: number) => {
    const isPinned = pinnedPaths.includes(item.path);
    const isDragSource = dragState?.path === item.path;
    const isDropTarget = dropTargetPath === item.path && dragState?.path !== item.path;
    const canMoveUp = index > 0;
    const canMoveDown = index < itemCount - 1;

    const moveItemUp = () => {
      if (!canMoveUp) {
        return;
      }
      if (zoneKey === 'pinned') {
        movePinnedNavItem(index, index - 1);
        return;
      }
      moveNavItemWithinSection(zoneKey, index, index - 1);
    };

    const moveItemDown = () => {
      if (!canMoveDown) {
        return;
      }
      if (zoneKey === 'pinned') {
        movePinnedNavItem(index, index + 1);
        return;
      }
      moveNavItemWithinSection(zoneKey, index, index + 1);
    };

    return (
      <SidebarMenuItem
        key={item.path}
        data-nav-path={item.path}
        onDragOver={(event) => handleDragOver(event, zoneKey)}
        onDrop={() => handleDrop(zoneKey, index)}
        className={cn(
          'group/nav-item relative rounded-md',
          isDragSource && 'opacity-55',
          isDropTarget && 'bg-sidebar-accent/70 ring-1 ring-sidebar-ring/30'
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              to={item.path}
              aria-label={item.label}
              onMouseEnter={() => prefetchNavigationData(queryClient, item.path)}
              onClick={() => {
                if (isMobile) {
                  setOpenMobile(false);
                }
              }}
              className={({ isActive }) =>
                cn(
                  'peer/menu-button flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-mcm-walnut outline-hidden ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-mcm-walnut focus-visible:ring-2',
                  isActive && 'bg-sidebar-accent font-medium text-mcm-walnut',
                  !collapsed && 'pr-16',
                  collapsed && 'justify-center px-2'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn('h-4 w-4 shrink-0', isActive && 'text-sidebar-primary')}
                  />
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                </>
              )}
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={!collapsed || isMobile}>
            {item.label}
          </TooltipContent>
        </Tooltip>

        {!collapsed && (
          <div
            className={cn(
              'absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1',
              isMobile
                ? 'opacity-100'
                : 'opacity-0 transition-opacity group-hover/nav-item:opacity-100 focus-within:opacity-100'
            )}
          >
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                togglePinnedNavItem(item.path);
              }}
              className={cn(
                'rounded-sm p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar hover:text-sidebar-foreground',
                isPinned && 'text-sidebar-primary'
              )}
              title={isPinned ? 'Unpin' : 'Pin to top'}
              aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label} to top`}
            >
              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>

            {!isMobile && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    moveItemUp();
                  }}
                  disabled={!canMoveUp}
                  className="rounded-sm p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  title={`Move ${item.label} up`}
                  aria-label={`Move ${item.label} up`}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    moveItemDown();
                  }}
                  disabled={!canMoveDown}
                  className="rounded-sm p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  title={`Move ${item.label} down`}
                  aria-label={`Move ${item.label} down`}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  draggable
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', item.path);
                    handleDragStart(item, zoneKey, index);
                  }}
                  onDragEnd={clearDragState}
                  className="cursor-grab rounded-sm p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar hover:text-sidebar-foreground active:cursor-grabbing"
                  title={`Drag to reorder ${item.label}`}
                  aria-label={`Reorder ${item.label}`}
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </SidebarMenuItem>
    );
  };

  const renderSubgroupLabel = (title: string, itemPath: string, isFirstSubgroup: boolean) => (
    <SidebarMenuItem
      key={`subgroup-${itemPath}`}
      className={cn('px-3 pb-1 pt-3', isFirstSubgroup && 'pt-1', collapsed && 'hidden')}
    >
      <span className="block truncate text-[10px] font-black uppercase tracking-[0.16em] text-mcm-walnut/60">
        {title}
      </span>
    </SidebarMenuItem>
  );

  const renderSectionMenuItems = (section: NavSection) => {
    let previousSubgroupKey: string | undefined;

    return section.items.map((item, index) => {
      const subgroupTitle = getNavSubgroupTitle(item.subgroupKey);
      const showSubgroupLabel = subgroupTitle !== null && item.subgroupKey !== previousSubgroupKey;

      previousSubgroupKey = item.subgroupKey;

      return (
        <Fragment key={item.path}>
          {showSubgroupLabel && subgroupTitle
            ? renderSubgroupLabel(subgroupTitle, item.path, index === 0)
            : null}
          {renderNavItem(item, section.key, index, section.items.length)}
        </Fragment>
      );
    });
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/40">
      <SidebarHeader className="border-b border-sidebar-border/40 px-3 py-3">
        <div
          className={cn(
            'flex items-center gap-3',
            collapsed ? 'justify-center' : 'justify-between'
          )}
        >
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-mcm-walnut/65">
                Asset Allocation
              </div>
              <div className="truncate font-display text-lg text-mcm-walnut">Operations Desk</div>
            </div>
          )}

          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setOpen(state === 'collapsed')}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-4 py-4">
        {pinnedItems.length > 0 && (
          <SidebarGroup className="px-3">
            <SidebarGroupLabel className="gap-2 px-2 text-[11px] font-semibold tracking-[0.18em] text-mcm-walnut/65">
              <Pin className="h-3 w-3" />
              <span>PINNED</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {pinnedItems.map((item, index) =>
                  renderNavItem(item, 'pinned', index, pinnedItems.length)
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleSections.map((section) => (
          <SidebarGroup key={section.title} className="px-3">
            <SidebarGroupLabel className="px-2 text-[11px] font-semibold tracking-[0.18em] text-mcm-walnut/65">
              {section.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderSectionMenuItems(section)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {!collapsed && (
        <SidebarFooter className="border-t border-sidebar-border/40 px-4 py-3">
          <div className="space-y-3">
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="flex flex-col gap-1 text-left text-mcm-walnut/65"
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                UPTIME CLOCK
              </span>
              <span className="font-mono text-xs text-mcm-walnut">
                {centralClock.time} {centralClock.tz}
              </span>
            </div>

            <div className="border-t border-sidebar-border/30 pt-2">
              <button
                type="button"
                onClick={() => {
                  void handleClearAuthCookies();
                }}
                disabled={isClearingAuthCookies}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-mcm-walnut/65 underline-offset-4 transition-colors hover:text-mcm-walnut hover:underline disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Cookie className="h-3 w-3" />
                {isClearingAuthCookies ? 'Clearing cookies...' : 'Clear auth cookies'}
              </button>
              {authCookieStatus ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="mt-1 text-[10px] leading-4 text-mcm-walnut/55"
                >
                  {authCookieStatus}
                </p>
              ) : null}
            </div>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
