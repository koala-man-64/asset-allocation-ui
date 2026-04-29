import type { ComponentType, ElementType } from 'react';
import {
  Activity,
  BarChart3,
  BadgeDollarSign,
  Briefcase,
  Bug,
  Database,
  Filter,
  Folder,
  Globe,
  History,
  Landmark,
  LogIn,
  Orbit,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  Target
} from 'lucide-react';

import { STOCK_DETAIL_BASE_PATH, STOCK_DETAIL_ROUTE } from '@/features/stocks/stockRoutes';

export type NavSectionKey = 'market-intelligence' | 'live-operations' | 'access';
export type NavSubgroupKey =
  | 'data-access'
  | 'monitoring'
  | 'data-hygiene'
  | 'strategy-setup'
  | 'portfolio-trading'
  | 'ops-tools';

export interface AppRouteNavigationMeta {
  path?: string;
  label: string;
  icon: ElementType;
  sectionKey: NavSectionKey;
  subgroupKey?: NavSubgroupKey;
}

export interface AppNavigationItemDefinition {
  path: string;
  label: string;
  icon: ElementType;
  sectionKey: NavSectionKey;
  subgroupKey?: NavSubgroupKey;
}

export interface AppRouteDefinition {
  key: string;
  path: string;
  load: () => Promise<{ default: ComponentType }>;
  nav?: AppRouteNavigationMeta;
}

export const DEFAULT_APP_ROUTE_PATH = '/system-status';

export const NAV_SECTION_TITLES: Record<NavSectionKey, string> = {
  'market-intelligence': 'MARKET INTELLIGENCE',
  'live-operations': 'LIVE OPERATIONS',
  access: 'ACCESS'
};

export const NAV_SUBGROUP_TITLES: Record<NavSubgroupKey, string> = {
  'data-access': 'DATA ACCESS',
  monitoring: 'MONITORING',
  'data-hygiene': 'DATA HYGIENE',
  'strategy-setup': 'STRATEGY SETUP',
  'portfolio-trading': 'PORTFOLIO & TRADING',
  'ops-tools': 'OPS TOOLS'
};

export const NAV_SUBGROUP_ORDER_BY_SECTION: Partial<Record<NavSectionKey, NavSubgroupKey[]>> = {
  'live-operations': [
    'data-access',
    'monitoring',
    'data-hygiene',
    'strategy-setup',
    'portfolio-trading',
    'ops-tools'
  ]
};

export const APP_ROUTE_REGISTRY: AppRouteDefinition[] = [
  {
    key: 'data-explorer',
    path: '/data-explorer',
    load: () =>
      import('@/features/data-explorer/DataExplorerPage').then((module) => ({
        default: module.DataExplorerPage
      })),
    nav: {
      label: 'Data Explorer',
      icon: Folder,
      sectionKey: 'live-operations',
      subgroupKey: 'data-access'
    }
  },
  {
    key: 'regimes',
    path: '/regimes',
    load: () =>
      import('@/features/regimes/RegimeMonitorPage').then((module) => ({
        default: module.RegimeMonitorPage
      })),
    nav: {
      label: 'Regime Monitor',
      icon: Orbit,
      sectionKey: 'live-operations',
      subgroupKey: 'monitoring'
    }
  },
  {
    key: 'intraday-monitor',
    path: '/intraday-monitor',
    load: () =>
      import('@/features/intraday-monitor/IntradayMonitorPage').then((module) => ({
        default: module.IntradayMonitorPage
      })),
    nav: {
      label: 'Intraday Monitor',
      icon: Activity,
      sectionKey: 'live-operations',
      subgroupKey: 'monitoring'
    }
  },
  {
    key: 'data-quality',
    path: '/data-quality',
    load: () =>
      import('@/features/data-quality/DataQualityPage').then((module) => ({
        default: module.DataQualityPage
      })),
    nav: {
      label: 'Data Quality',
      icon: ScanSearch,
      sectionKey: 'live-operations',
      subgroupKey: 'data-hygiene'
    }
  },
  {
    key: 'data-profiling',
    path: '/data-profiling',
    load: () =>
      import('@/features/data-profiling/DataProfilingPage').then((module) => ({
        default: module.DataProfilingPage
      })),
    nav: {
      label: 'Data Profiling',
      icon: BarChart3,
      sectionKey: 'live-operations',
      subgroupKey: 'data-hygiene'
    }
  },
  {
    key: 'system-status',
    path: '/system-status',
    load: () =>
      import('@/features/system-status/SystemStatusPage').then((module) => ({
        default: module.SystemStatusPage
      })),
    nav: {
      label: 'System Status',
      icon: Activity,
      sectionKey: 'live-operations',
      subgroupKey: 'monitoring'
    }
  },
  {
    key: 'debug-symbols',
    path: '/debug-symbols',
    load: () =>
      import('@/features/debug-symbols/DebugSymbolsPage').then((module) => ({
        default: module.DebugSymbolsPage
      })),
    nav: {
      label: 'Debug Symbols',
      icon: Bug,
      sectionKey: 'live-operations',
      subgroupKey: 'ops-tools'
    }
  },
  {
    key: 'runtime-config',
    path: '/runtime-config',
    load: () =>
      import('@/features/runtime-config/RuntimeConfigPage').then((module) => ({
        default: module.RuntimeConfigPage
      })),
    nav: {
      label: 'Runtime Config',
      icon: SlidersHorizontal,
      sectionKey: 'live-operations',
      subgroupKey: 'ops-tools'
    }
  },
  {
    key: 'symbol-purge',
    path: '/symbol-purge',
    load: () =>
      import('@/features/symbol-purge/SymbolPurgeByCriteriaPage').then((module) => ({
        default: module.SymbolPurgeByCriteriaPage
      })),
    nav: {
      label: 'Symbol Purge',
      icon: Filter,
      sectionKey: 'live-operations',
      subgroupKey: 'data-hygiene'
    }
  },
  {
    key: 'symbol-enrichment',
    path: '/symbol-enrichment',
    load: () =>
      import('@/features/symbol-enrichment/SymbolEnrichmentPage').then((module) => ({
        default: module.SymbolEnrichmentPage
      })),
    nav: {
      label: 'Symbol Enrichment',
      icon: Sparkles,
      sectionKey: 'live-operations',
      subgroupKey: 'data-hygiene'
    }
  },
  {
    key: 'stock-explorer',
    path: '/stock-explorer',
    load: () =>
      import('@/features/stocks/StockExplorerPage').then((module) => ({
        default: module.StockExplorerPage
      })),
    nav: {
      label: 'Stock Explorer',
      icon: Globe,
      sectionKey: 'market-intelligence'
    }
  },
  {
    key: 'stock-detail',
    path: STOCK_DETAIL_ROUTE,
    load: () =>
      import('@/features/stocks/StockDetailPage').then((module) => ({
        default: module.StockDetailPage
      })),
    nav: {
      path: STOCK_DETAIL_BASE_PATH,
      label: 'Live Stock View',
      icon: Target,
      sectionKey: 'market-intelligence'
    }
  },
  {
    key: 'strategies',
    path: '/strategies',
    load: () =>
      import('@/features/strategies/StrategyConfigPage').then((module) => ({
        default: module.StrategyConfigPage
      })),
    nav: {
      label: 'Strategies',
      icon: Target,
      sectionKey: 'live-operations',
      subgroupKey: 'strategy-setup'
    }
  },
  {
    key: 'backtests',
    path: '/backtests',
    load: () =>
      import('@/features/backtests/BacktestWorkspacePage').then((module) => ({
        default: module.BacktestWorkspacePage
      })),
    nav: {
      label: 'Backtests',
      icon: History,
      sectionKey: 'live-operations',
      subgroupKey: 'strategy-setup'
    }
  },
  {
    key: 'accounts',
    path: '/accounts',
    load: () =>
      import('@/features/accounts/AccountOperationsPage').then((module) => ({
        default: module.AccountOperationsPage
      })),
    nav: {
      label: 'Account Operations',
      icon: Landmark,
      sectionKey: 'live-operations',
      subgroupKey: 'portfolio-trading'
    }
  },
  {
    key: 'trade-desk',
    path: '/trade-desk',
    load: () =>
      import('@/features/trade-desk/TradeDeskPage').then((module) => ({
        default: module.TradeDeskPage
      })),
    nav: {
      label: 'Trade Desk',
      icon: BadgeDollarSign,
      sectionKey: 'live-operations',
      subgroupKey: 'portfolio-trading'
    }
  },
  {
    key: 'trade-monitor',
    path: '/trade-monitor',
    load: () =>
      import('@/features/trade-desk/TradeMonitorPage').then((module) => ({
        default: module.TradeMonitorPage
      })),
    nav: {
      label: 'Trade Monitor',
      icon: BarChart3,
      sectionKey: 'live-operations',
      subgroupKey: 'portfolio-trading'
    }
  },
  {
    key: 'portfolios',
    path: '/portfolios',
    load: () =>
      import('@/features/portfolios/PortfolioWorkspacePage').then((module) => ({
        default: module.PortfolioWorkspacePage
      })),
    nav: {
      label: 'Portfolio Workspace',
      icon: Briefcase,
      sectionKey: 'live-operations',
      subgroupKey: 'portfolio-trading'
    }
  },
  {
    key: 'universes',
    path: '/universes',
    load: () =>
      import('@/features/universes/UniverseConfigPage').then((module) => ({
        default: module.UniverseConfigPage
      }))
  },
  {
    key: 'rankings',
    path: '/rankings',
    load: () =>
      import('@/features/rankings/RankingConfigPage').then((module) => ({
        default: module.RankingConfigPage
      }))
  },
  {
    key: 'postgres-explorer',
    path: '/postgres-explorer',
    load: () =>
      import('@/features/postgres-explorer/PostgresExplorerPage').then((module) => ({
        default: module.PostgresExplorerPage
      })),
    nav: {
      label: 'Postgres Explorer',
      icon: Database,
      sectionKey: 'live-operations',
      subgroupKey: 'data-access'
    }
  }
];

const NAVIGATION_ONLY_ITEMS: AppNavigationItemDefinition[] = [
  {
    path: '/login',
    label: 'Login',
    icon: LogIn,
    sectionKey: 'access'
  }
];

export const APP_NAVIGATION_REGISTRY: AppNavigationItemDefinition[] = [
  ...APP_ROUTE_REGISTRY.flatMap((route) => {
    if (!route.nav) {
      return [];
    }

    return [
      {
        path: route.nav.path ?? route.path,
        label: route.nav.label,
        icon: route.nav.icon,
        sectionKey: route.nav.sectionKey,
        subgroupKey: route.nav.subgroupKey
      }
    ];
  }),
  ...NAVIGATION_ONLY_ITEMS
];
