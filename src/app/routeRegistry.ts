import type { ComponentType, ElementType } from 'react';
import {
  Activity,
  BarChart3,
  Briefcase,
  Bug,
  Database,
  Filter,
  Folder,
  Globe,
  Layers3,
  Orbit,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  Target
} from 'lucide-react';

import { STOCK_DETAIL_BASE_PATH, STOCK_DETAIL_ROUTE } from '@/features/stocks/stockRoutes';

export type NavSectionKey = 'market-intelligence' | 'live-operations';

export interface AppRouteNavigationMeta {
  path?: string;
  label: string;
  icon: ElementType;
  sectionKey: NavSectionKey;
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
  'live-operations': 'LIVE OPERATIONS'
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
      sectionKey: 'live-operations'
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
      sectionKey: 'live-operations'
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
      sectionKey: 'live-operations'
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
      sectionKey: 'live-operations'
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
      sectionKey: 'live-operations'
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
      sectionKey: 'live-operations'
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
      sectionKey: 'live-operations'
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
      sectionKey: 'live-operations'
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
      sectionKey: 'live-operations'
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
      sectionKey: 'live-operations'
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
      sectionKey: 'live-operations'
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
      sectionKey: 'live-operations'
    }
  },
  {
    key: 'universes',
    path: '/universes',
    load: () =>
      import('@/features/universes/UniverseConfigPage').then((module) => ({
        default: module.UniverseConfigPage
      })),
    nav: {
      label: 'Universe Configurations',
      icon: Globe,
      sectionKey: 'live-operations'
    }
  },
  {
    key: 'rankings',
    path: '/rankings',
    load: () =>
      import('@/features/rankings/RankingConfigPage').then((module) => ({
        default: module.RankingConfigPage
      })),
    nav: {
      label: 'Ranking Configurations',
      icon: Layers3,
      sectionKey: 'live-operations'
    }
  },
  {
    key: 'strategy-exploration',
    path: '/strategy-exploration',
    load: () =>
      import('@/features/strategy-exploration/StrategyDataCatalogPage').then((module) => ({
        default: module.StrategyDataCatalogPage
      })),
    nav: {
      label: 'Strategy Exploration',
      icon: Target,
      sectionKey: 'live-operations'
    }
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
      sectionKey: 'live-operations'
    }
  }
];
