import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLoader } from '@/app/components/common/PageLoader';
import { STOCK_DETAIL_ROUTE } from '@/features/stocks/stockRoutes';

const DataExplorerPage = lazy(() =>
  import('@/features/data-explorer/DataExplorerPage').then((m) => ({ default: m.DataExplorerPage }))
);
const RegimeMonitorPage = lazy(() =>
  import('@/features/regimes/RegimeMonitorPage').then((m) => ({ default: m.RegimeMonitorPage }))
);
const SystemStatusPage = lazy(() =>
  import('@/features/system-status/SystemStatusPage').then((m) => ({ default: m.SystemStatusPage }))
);
const DataQualityPage = lazy(() =>
  import('@/features/data-quality/DataQualityPage').then((m) => ({ default: m.DataQualityPage }))
);
const DataProfilingPage = lazy(() =>
  import('@/features/data-profiling/DataProfilingPage').then((m) => ({
    default: m.DataProfilingPage
  }))
);
const StockExplorerPage = lazy(() =>
  import('@/features/stocks/StockExplorerPage').then((m) => ({ default: m.StockExplorerPage }))
);
const StockDetailPage = lazy(() =>
  import('@/features/stocks/StockDetailPage').then((m) => ({ default: m.StockDetailPage }))
);
const PostgresExplorerPage = lazy(() =>
  import('@/features/postgres-explorer/PostgresExplorerPage').then((m) => ({
    default: m.PostgresExplorerPage
  }))
);
const DebugSymbolsPage = lazy(() =>
  import('@/features/debug-symbols/DebugSymbolsPage').then((m) => ({
    default: m.DebugSymbolsPage
  }))
);
const RuntimeConfigPage = lazy(() =>
  import('@/features/runtime-config/RuntimeConfigPage').then((m) => ({
    default: m.RuntimeConfigPage
  }))
);
const StrategyConfigPage = lazy(() =>
  import('@/features/strategies/StrategyConfigPage').then((m) => ({
    default: m.StrategyConfigPage
  }))
);
const PortfolioWorkspacePage = lazy(() =>
  import('@/features/portfolios/PortfolioWorkspacePage').then((m) => ({
    default: m.PortfolioWorkspacePage
  }))
);
const UniverseConfigPage = lazy(() =>
  import('@/features/universes/UniverseConfigPage').then((m) => ({
    default: m.UniverseConfigPage
  }))
);
const RankingConfigPage = lazy(() =>
  import('@/features/rankings/RankingConfigPage').then((m) => ({
    default: m.RankingConfigPage
  }))
);
const StrategyDataCatalogPage = lazy(() =>
  import('@/features/strategy-exploration/StrategyDataCatalogPage').then((m) => ({
    default: m.StrategyDataCatalogPage
  }))
);
const SymbolPurgeByCriteriaPage = lazy(() =>
  import('@/features/symbol-purge/SymbolPurgeByCriteriaPage').then((m) => ({
    default: m.SymbolPurgeByCriteriaPage
  }))
);
const SymbolEnrichmentPage = lazy(() =>
  import('@/features/symbol-enrichment/SymbolEnrichmentPage').then((m) => ({
    default: m.SymbolEnrichmentPage
  }))
);
const IntradayMonitorPage = lazy(() =>
  import('@/features/intraday-monitor/IntradayMonitorPage').then((m) => ({
    default: m.IntradayMonitorPage
  }))
);

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader text="Loading workspace..." variant="panel" />}>
      <Routes>
        <Route path="/" element={<Navigate to="/system-status" replace />} />
        <Route path="/data-explorer" element={<DataExplorerPage />} />
        <Route path="/regimes" element={<RegimeMonitorPage />} />
        <Route path="/data-quality" element={<DataQualityPage />} />
        <Route path="/data-profiling" element={<DataProfilingPage />} />
        <Route path="/system-status" element={<SystemStatusPage />} />
        <Route path="/intraday-monitor" element={<IntradayMonitorPage />} />
        <Route path="/debug-symbols" element={<DebugSymbolsPage />} />
        <Route path="/runtime-config" element={<RuntimeConfigPage />} />
        <Route path="/symbol-purge" element={<SymbolPurgeByCriteriaPage />} />
        <Route path="/symbol-enrichment" element={<SymbolEnrichmentPage />} />
        <Route path="/stock-explorer" element={<StockExplorerPage />} />
        <Route path="/strategies" element={<StrategyConfigPage />} />
        <Route path="/portfolios" element={<PortfolioWorkspacePage />} />
        <Route path="/universes" element={<UniverseConfigPage />} />
        <Route path="/rankings" element={<RankingConfigPage />} />
        <Route path="/strategy-exploration" element={<StrategyDataCatalogPage />} />
        <Route path="/postgres-explorer" element={<PostgresExplorerPage />} />
        <Route path={STOCK_DETAIL_ROUTE} element={<StockDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
