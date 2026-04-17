import { useEffect, useState, type DragEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/useDataQueries';
import { DataService } from '@/services/DataService';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/components/ui/utils';
import { getCentralClockParts } from '@/app/components/pages/system-status/systemStatusClock';
import { useUIStore, UI_STORAGE_KEY } from '@/stores/useUIStore';
import {
  resolveVisibleNavSections,
  normalizePinnedNavPaths,
  type NavItem,
  type NavZoneKey
} from '@/app/navigationModel';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/app/components/ui/tooltip';
import { ChevronLeft, ChevronRight, Pin, PinOff, GripVertical } from 'lucide-react';
import Cookies from 'js-cookie';

const LEGACY_PINNED_TABS_COOKIE = 'ag_pinned_tabs';
const EXPANDED_NAV_WIDTH_CLASS = 'w-[280px]';

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

export function LeftNavigation() {
  const [collapsed, setCollapsed] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const pinnedPaths = useUIStore((state) => state.pinnedNavPaths);
  const navOrderBySection = useUIStore((state) => state.navOrderBySection);
  const togglePinnedNavItem = useUIStore((state) => state.togglePinnedNavItem);
  const moveNavItemWithinSection = useUIStore((state) => state.moveNavItemWithinSection);
  const movePinnedNavItem = useUIStore((state) => state.movePinnedNavItem);

  useEffect(() => {
    if (hasPersistedNavCustomizationSnapshot()) {
      return;
    }

    const savedPinnedTabs = Cookies.get(LEGACY_PINNED_TABS_COOKIE);
    if (savedPinnedTabs) {
      try {
        useUIStore.setState({
          pinnedNavPaths: normalizePinnedNavPaths(JSON.parse(savedPinnedTabs))
        });
        Cookies.remove(LEGACY_PINNED_TABS_COOKIE);
      } catch (e) {
        console.error('Failed to parse pinned tabs cookie', e);
      }
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
    if (collapsed) {
      return;
    }

    setDragState({
      path: item.path,
      zoneKey,
      index
    });
    setDropTargetPath(item.path);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, zoneKey: NavZoneKey) => {
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
      <div
        key={item.path}
        data-nav-path={item.path}
        onDragOver={(event) => handleDragOver(event, zoneKey)}
        onDrop={() => handleDrop(zoneKey, index)}
        className={cn(
          'group/nav-item relative flex items-center rounded-md',
          isDragSource && 'opacity-55',
          isDropTarget && 'bg-accent/60 ring-1 ring-primary/40'
        )}
      >
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink
                to={item.path}
                onMouseEnter={() => {
                  if (item.path === '/data-quality' || item.path === '/system-status') {
                    if (item.path === '/data-quality') {
                      queryClient.prefetchQuery({
                        queryKey: queryKeys.systemHealth(),
                        queryFn: async () => {
                          const response = await DataService.getSystemHealthWithMeta();
                          return response.data;
                        },
                        staleTime: 30000
                      });
                    }
                    if (item.path === '/system-status') {
                      queryClient.prefetchQuery({
                        queryKey: queryKeys.systemStatusView(),
                        queryFn: async () => DataService.getSystemStatusView(),
                        staleTime: 30000
                      });
                    }
                  }
                }}
                className={({ isActive }) =>
                  cn(
                    'w-full px-3 py-2 rounded-md transition-colors',
                    'hover:bg-accent/50 group-hover/nav-item:pr-16',
                    isActive
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                    collapsed && 'justify-center px-2'
                  )
                }
              >
                {({ isActive }) => (
                  <span
                    className={cn('flex min-w-0 items-center gap-3', collapsed && 'justify-center')}
                  >
                    <item.icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} />
                    {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                  </span>
                )}
              </NavLink>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" className="flex items-center gap-4">
                {item.label}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {!collapsed && (
          <div className="absolute right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/nav-item:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                togglePinnedNavItem(item.path);
              }}
              className={cn(
                'rounded-sm p-1 text-muted-foreground/60 transition-colors hover:bg-background/80 hover:text-foreground',
                isPinned && 'text-primary'
              )}
              title={isPinned ? 'Unpin' : 'Pin to top'}
              aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label} to top`}
            >
              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
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
              className="cursor-grab rounded-sm p-1 text-muted-foreground/60 transition-colors hover:bg-background/80 hover:text-foreground active:cursor-grabbing"
              title={`Drag to reorder ${item.label}`}
              aria-label={`Reorder ${item.label}`}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        'group/sidebar flex flex-col border-r bg-card h-full transition-all duration-300 ease-in-out',
        collapsed ? 'w-[64px]' : EXPANDED_NAV_WIDTH_CLASS
      )}
    >
      <div className="flex h-14 items-center border-b px-3 justify-between">
        {!collapsed && <span className="font-semibold px-2">Asset Allocation</span>}
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', collapsed && 'mx-auto')}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 gap-6 flex flex-col">
        {/* HOTLIST SECTION */}
        {pinnedItems.length > 0 && (
          <div className="px-3">
            {!collapsed && (
              <h4 className="mb-2 px-2 text-xs font-semibold text-muted-foreground/50 tracking-wider flex items-center gap-2">
                <Pin className="h-3 w-3" /> PINNED
              </h4>
            )}
            <div className="space-y-1">
              {pinnedItems.map((item, index) => renderNavItem(item, 'pinned', index))}
            </div>
            {!collapsed && <div className="my-4 border-b border-border/40" />}
          </div>
        )}

        {visibleSections.map((section) => (
          <div key={section.title} className="px-3">
            {!collapsed && (
              <h4 className="mb-2 px-2 text-xs font-semibold text-muted-foreground/70 tracking-wider">
                {section.title}
              </h4>
            )}
            <div className="space-y-1">
              {section.items.map((item, index) => renderNavItem(item, section.key, index))}
            </div>
          </div>
        ))}
      </div>

      {!collapsed && (
        <div className="border-t px-4 py-3">
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="flex flex-col gap-1 text-left text-muted-foreground/80"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
              UPTIME CLOCK
            </span>
            <span className="font-mono text-xs text-foreground/75">
              {centralClock.time} {centralClock.tz}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
