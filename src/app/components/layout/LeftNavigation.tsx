import { useEffect, useState, type DragEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, GripVertical, Pin, PinOff } from 'lucide-react';
import Cookies from 'js-cookie';

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
import { getCentralClockParts } from '@/app/components/pages/system-status/systemStatusClock';
import {
  normalizePinnedNavPaths,
  resolveVisibleNavSections,
  type NavItem,
  type NavZoneKey
} from '@/app/navigationModel';
import { queryKeys } from '@/hooks/useDataQueries';
import { DataService } from '@/services/DataService';
import { UI_STORAGE_KEY, useUIStore } from '@/stores/useUIStore';

const LEGACY_PINNED_TABS_COOKIE = 'ag_pinned_tabs';

interface DragState {
  index: number;
  path: string;
  zoneKey: NavZoneKey;
}

function hasPersistedNavCustomizationSnapshot(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const rawPersistedState = window.localStorage.getItem(UI_STORAGE_KEY);
  if (!rawPersistedState) {
    return false;
  }

  try {
    const parsedState = JSON.parse(rawPersistedState) as {
      state?: Record<string, unknown>;
    };

    return Boolean(
      parsedState.state &&
      ('pinnedNavPaths' in parsedState.state || 'navOrderBySection' in parsedState.state)
    );
  } catch {
    return false;
  }
}

function prefetchNavigationData(
  queryClient: ReturnType<typeof useQueryClient>,
  path: string
): void {
  if (path === '/data-quality') {
    queryClient.prefetchQuery({
      queryKey: queryKeys.systemHealth(),
      queryFn: async () => {
        const response = await DataService.getSystemHealthWithMeta();
        return response.data;
      },
      staleTime: 30000
    });
  }

  if (path === '/system-status') {
    queryClient.prefetchQuery({
      queryKey: queryKeys.systemStatusView(),
      queryFn: async () => DataService.getSystemStatusView(),
      staleTime: 30000
    });
  }
}

export function LeftNavigation() {
  const { isMobile, setOpen, setOpenMobile, state } = useSidebar();
  const [clockNow, setClockNow] = useState(() => new Date());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const pinnedPaths = useUIStore((store) => store.pinnedNavPaths);
  const navOrderBySection = useUIStore((store) => store.navOrderBySection);
  const togglePinnedNavItem = useUIStore((store) => store.togglePinnedNavItem);
  const moveNavItemWithinSection = useUIStore((store) => store.moveNavItemWithinSection);
  const movePinnedNavItem = useUIStore((store) => store.movePinnedNavItem);

  const collapsed = !isMobile && state === 'collapsed';

  useEffect(() => {
    if (hasPersistedNavCustomizationSnapshot()) {
      return;
    }

    const savedPinnedTabs = Cookies.get(LEGACY_PINNED_TABS_COOKIE);
    if (!savedPinnedTabs) {
      return;
    }

    try {
      useUIStore.setState({
        pinnedNavPaths: normalizePinnedNavPaths(JSON.parse(savedPinnedTabs))
      });
      Cookies.remove(LEGACY_PINNED_TABS_COOKIE);
    } catch (error) {
      console.error('Failed to parse pinned tabs cookie', error);
    }
  }, []);

  useEffect(() => {
    const handle = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(handle);
  }, []);

  const centralClock = getCentralClockParts(clockNow);
  const { pinnedItems, visibleSections } = resolveVisibleNavSections(
    pinnedPaths,
    navOrderBySection
  );

  const clearDragState = () => {
    setDragState(null);
    setDropTargetPath(null);
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

  const renderNavItem = (item: NavItem, zoneKey: NavZoneKey, index: number) => {
    const isPinned = pinnedPaths.includes(item.path);
    const isDragSource = dragState?.path === item.path;
    const isDropTarget = dropTargetPath === item.path && dragState?.path !== item.path;

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
                  'peer/menu-button flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/75 outline-hidden ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2',
                  isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
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
            )}
          </div>
        )}
      </SidebarMenuItem>
    );
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
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sidebar-foreground/55">
                Asset Allocation
              </div>
              <div className="truncate font-display text-lg text-sidebar-foreground">
                Operations Desk
              </div>
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
            <SidebarGroupLabel className="gap-2 px-2 text-[11px] font-semibold tracking-[0.18em] text-sidebar-foreground/60">
              <Pin className="h-3 w-3" />
              <span>PINNED</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {pinnedItems.map((item, index) => renderNavItem(item, 'pinned', index))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleSections.map((section) => (
          <SidebarGroup key={section.title} className="px-3">
            <SidebarGroupLabel className="px-2 text-[11px] font-semibold tracking-[0.18em] text-sidebar-foreground/60">
              {section.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item, index) => renderNavItem(item, section.key, index))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {!collapsed && (
        <SidebarFooter className="border-t border-sidebar-border/40 px-4 py-3">
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="flex flex-col gap-1 text-left text-sidebar-foreground/80"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
              UPTIME CLOCK
            </span>
            <span className="font-mono text-xs text-sidebar-foreground">
              {centralClock.time} {centralClock.tz}
            </span>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
