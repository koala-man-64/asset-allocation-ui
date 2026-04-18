import type { ElementType } from 'react';
import {
  Activity,
  BarChart3,
  Bug,
  Database,
  Filter,
  Folder,
  Globe,
  Layers3,
  Orbit,
  ScanSearch,
  SlidersHorizontal,
  Target
} from 'lucide-react';

export type NavSectionKey = 'market-intelligence' | 'live-operations';
export type NavZoneKey = NavSectionKey | 'pinned';

export interface NavItem {
  path: string;
  label: string;
  icon: ElementType;
  sectionKey: NavSectionKey;
}

export interface NavSection {
  key: NavSectionKey;
  title: string;
  items: NavItem[];
}

export type NavOrderBySection = Record<NavSectionKey, string[]>;

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'market-intelligence',
    title: 'MARKET INTELLIGENCE',
    items: [
      {
        path: '/stock-explorer',
        label: 'Stock Explorer',
        icon: Globe,
        sectionKey: 'market-intelligence'
      },
      {
        path: '/stock-detail',
        label: 'Live Stock View',
        icon: Target,
        sectionKey: 'market-intelligence'
      }
    ]
  },
  {
    key: 'live-operations',
    title: 'LIVE OPERATIONS',
    items: [
      {
        path: '/data-explorer',
        label: 'Data Explorer',
        icon: Folder,
        sectionKey: 'live-operations'
      },
      {
        path: '/data-quality',
        label: 'Data Quality',
        icon: ScanSearch,
        sectionKey: 'live-operations'
      },
      {
        path: '/data-profiling',
        label: 'Data Profiling',
        icon: BarChart3,
        sectionKey: 'live-operations'
      },
      {
        path: '/regimes',
        label: 'Regime Monitor',
        icon: Orbit,
        sectionKey: 'live-operations'
      },
      {
        path: '/system-status',
        label: 'System Status',
        icon: Activity,
        sectionKey: 'live-operations'
      },
      {
        path: '/debug-symbols',
        label: 'Debug Symbols',
        icon: Bug,
        sectionKey: 'live-operations'
      },
      {
        path: '/symbol-purge',
        label: 'Symbol Purge',
        icon: Filter,
        sectionKey: 'live-operations'
      },
      {
        path: '/runtime-config',
        label: 'Runtime Config',
        icon: SlidersHorizontal,
        sectionKey: 'live-operations'
      },
      {
        path: '/strategy-exploration',
        label: 'Strategy Exploration',
        icon: Target,
        sectionKey: 'live-operations'
      },
      {
        path: '/backtests',
        label: 'Backtest Runs',
        icon: BarChart3,
        sectionKey: 'live-operations'
      },
      {
        path: '/performance-review',
        label: 'Performance Review',
        icon: BarChart3,
        sectionKey: 'live-operations'
      },
      {
        path: '/strategies',
        label: 'Strategies',
        icon: Target,
        sectionKey: 'live-operations'
      },
      {
        path: '/universes',
        label: 'Universe Configurations',
        icon: Globe,
        sectionKey: 'live-operations'
      },
      {
        path: '/rankings',
        label: 'Ranking Configurations',
        icon: Layers3,
        sectionKey: 'live-operations'
      },
      {
        path: '/postgres-explorer',
        label: 'Postgres Explorer',
        icon: Database,
        sectionKey: 'live-operations'
      }
    ]
  }
];

const NAV_ITEM_BY_PATH = new Map(
  NAV_SECTIONS.flatMap((section) => section.items.map((item) => [item.path, item] as const))
);

const DEFAULT_SECTION_KEY_BY_PATH = new Map(
  NAV_SECTIONS.flatMap((section) => section.items.map((item) => [item.path, section.key] as const))
);

const NAV_PATHS_BY_SECTION = NAV_SECTIONS.reduce(
  (acc, section) => {
    acc[section.key] = new Set(section.items.map((item) => item.path));
    return acc;
  },
  {} as Record<NavSectionKey, Set<string>>
);

const KNOWN_NAV_PATHS = new Set(Array.from(NAV_ITEM_BY_PATH.keys()));

function dedupePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    if (seen.has(path)) {
      return false;
    }
    seen.add(path);
    return true;
  });
}

export function createDefaultNavOrderBySection(): NavOrderBySection {
  return NAV_SECTIONS.reduce((acc, section) => {
    acc[section.key] = section.items.map((item) => item.path);
    return acc;
  }, {} as NavOrderBySection);
}

export function hasKnownNavPath(path: string): boolean {
  return KNOWN_NAV_PATHS.has(path);
}

export function getDefaultSectionForPath(path: string): NavSectionKey | null {
  return DEFAULT_SECTION_KEY_BY_PATH.get(path) ?? null;
}

export function findNavItem(path: string): NavItem | undefined {
  return NAV_ITEM_BY_PATH.get(path);
}

export function normalizePinnedNavPaths(paths?: readonly string[] | null): string[] {
  return dedupePaths(paths ?? []).filter((path) => KNOWN_NAV_PATHS.has(path));
}

export function normalizeNavOrderBySection(
  navOrderBySection?: Partial<Record<NavSectionKey, readonly string[]>> | null
): NavOrderBySection {
  const normalizedOrder = createDefaultNavOrderBySection();

  for (const section of NAV_SECTIONS) {
    const knownPaths = NAV_PATHS_BY_SECTION[section.key];
    const savedOrder = dedupePaths([...(navOrderBySection?.[section.key] ?? [])]).filter((path) =>
      knownPaths.has(path)
    );
    const defaultOrder = normalizedOrder[section.key];

    normalizedOrder[section.key] = [
      ...savedOrder,
      ...defaultOrder.filter((path) => !savedOrder.includes(path))
    ];
  }

  return normalizedOrder;
}

export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return [...items];
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

export function moveNavItemWithinSectionOrder(
  sectionOrder: readonly string[],
  pinnedPaths: readonly string[],
  fromIndex: number,
  toIndex: number
): string[] {
  const pinnedSet = new Set(normalizePinnedNavPaths(pinnedPaths));
  const visiblePaths = sectionOrder.filter((path) => !pinnedSet.has(path));

  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= visiblePaths.length ||
    toIndex >= visiblePaths.length
  ) {
    return [...sectionOrder];
  }

  const reorderedVisiblePaths = moveItem(visiblePaths, fromIndex, toIndex);
  let visibleIndex = 0;

  return sectionOrder.map((path) =>
    pinnedSet.has(path) ? path : reorderedVisiblePaths[visibleIndex++]
  );
}

export function resolveVisibleNavSections(
  pinnedPaths: readonly string[],
  navOrderBySection: Partial<Record<NavSectionKey, readonly string[]>>
): { pinnedItems: NavItem[]; visibleSections: NavSection[] } {
  const normalizedPinnedPaths = normalizePinnedNavPaths(pinnedPaths);
  const pinnedSet = new Set(normalizedPinnedPaths);
  const normalizedNavOrder = normalizeNavOrderBySection(navOrderBySection);

  const pinnedItems = normalizedPinnedPaths
    .map((path) => findNavItem(path))
    .filter((item): item is NavItem => Boolean(item));

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: normalizedNavOrder[section.key]
      .filter((path) => !pinnedSet.has(path))
      .map((path) => findNavItem(path))
      .filter((item): item is NavItem => {
        if (!item) {
          return false;
        }

        return item.sectionKey === section.key;
      })
  })).filter((section) => section.items.length > 0);

  return { pinnedItems, visibleSections };
}
