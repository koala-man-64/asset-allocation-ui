import { Suspense, lazy, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import type { PortfolioBenchmarkComparison } from '@/features/portfolios/lib/portfolioBenchmark';
import {
  MODEL_OUTLOOK_ASSUMPTIONS,
  MODEL_OUTLOOK_HORIZONS,
  derivePortfolioModelOutlook,
  type ModelOutlookAssumption,
  type ModelOutlookHorizon
} from '@/features/portfolios/lib/portfolioForecast';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  titleCaseWords
} from '@/features/portfolios/lib/portfolioPresentation';
import { portfolioApi } from '@/services/portfolioApi';
import type { PortfolioMonitorSnapshot } from '@/types/portfolio';
import type { RegimeSnapshot } from '@/types/regime';

interface PortfolioPerformanceTabProps {
  monitorSnapshot: PortfolioMonitorSnapshot | null;
  benchmarkComparison: PortfolioBenchmarkComparison | null;
  benchmarkError?: string;
  regimeHistory: readonly RegimeSnapshot[];
  regimeHistoryError?: string;
  currentRegimeCode?: string | null;
  regimeModelName?: string;
}

const PortfolioPerformanceTrendCharts = lazy(() =>
  import('@/features/portfolios/components/PortfolioPerformanceTrendCharts').then((module) => ({
    default: module.PortfolioPerformanceTrendCharts
  }))
);

const PortfolioPerformanceRiskCharts = lazy(() =>
  import('@/features/portfolios/components/PortfolioPerformanceRiskCharts').then((module) => ({
    default: module.PortfolioPerformanceRiskCharts
  }))
);

function PanelCard({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-5">
      <div>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function PerformanceChartsLoader() {
  return <PageLoader text="Loading chart views..." variant="panel" className="min-h-[18rem]" />;
}

export function PortfolioPerformanceTab({
  monitorSnapshot,
  benchmarkComparison,
  benchmarkError,
  regimeHistory,
  regimeHistoryError,
  currentRegimeCode,
  regimeModelName
}: PortfolioPerformanceTabProps) {
  const [selectedHorizon, setSelectedHorizon] = useState<ModelOutlookHorizon>('3M');
  const [selectedAssumption, setSelectedAssumption] = useState<ModelOutlookAssumption>('current');
  const [costDragOverrideBps, setCostDragOverrideBps] = useState('0');

  const fallbackOutlook = useMemo(
    () =>
      derivePortfolioModelOutlook({
        history: monitorSnapshot?.history || [],
        comparison: benchmarkComparison,
        regimeHistory,
        currentRegimeCode,
        horizon: selectedHorizon,
        assumption: selectedAssumption,
        costDragOverrideBps: Number(costDragOverrideBps || 0)
      }),
    [
      benchmarkComparison,
      costDragOverrideBps,
      currentRegimeCode,
      monitorSnapshot?.history,
      regimeHistory,
      selectedAssumption,
      selectedHorizon
    ]
  );
  const forecastQuery = useQuery({
    queryKey: [
      'portfolios',
      'forecast',
      monitorSnapshot?.accountId,
      regimeModelName,
      selectedHorizon,
      selectedAssumption,
      costDragOverrideBps
    ],
    queryFn: ({ signal }) =>
      portfolioApi.getForecast(
        {
          accountId: String(monitorSnapshot?.accountId),
          modelName: regimeModelName,
          horizon: selectedHorizon,
          assumption: selectedAssumption,
          costDragOverrideBps: Number(costDragOverrideBps || 0)
        },
        signal
      ),
    enabled: Boolean(monitorSnapshot?.accountId)
  });
  const outlook = forecastQuery.data ?? fallbackOutlook;
  const outlookSource = forecastQuery.data ? 'control-plane' : 'local fallback';

  if (!monitorSnapshot || monitorSnapshot.history.length === 0) {
    return (
      <StatePanel
        tone="empty"
        title="Performance History Unavailable"
        message="A monitor snapshot with portfolio history is required before performance and forecast analytics can render."
      />
    );
  }

  const chartPoints = benchmarkComparison?.points || [];

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          Performance
        </div>
        <h2 className="mt-2 font-display text-2xl">
          NAV, benchmark, attribution, and model outlook
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Replace table-only performance history with benchmark-relative context, drawdown
          visibility, turnover and cost drag trends, and a forecast surface with explicit
          confidence.
        </p>
      </div>

      {benchmarkError ? (
        <StatePanel
          tone="error"
          title="Benchmark Market Data Unavailable"
          message={benchmarkError}
        />
      ) : null}
      {regimeHistoryError ? (
        <StatePanel tone="error" title="Regime History Unavailable" message={regimeHistoryError} />
      ) : null}
      {forecastQuery.error ? (
        <StatePanel
          tone="warning"
          title="Authoritative Forecast Unavailable"
          message={`Falling back to the local outlook model: ${String((forecastQuery.error as Error)?.message || forecastQuery.error)}`}
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Suspense fallback={<PerformanceChartsLoader />}>
          <PortfolioPerformanceTrendCharts chartPoints={chartPoints} />
        </Suspense>
        <Suspense fallback={<PerformanceChartsLoader />}>
          <PortfolioPerformanceRiskCharts chartPoints={chartPoints} />
        </Suspense>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <PanelCard
          title="Sleeve Attribution"
          description="Return contribution, market value, and target-vs-live weight make sleeve-level performance and drift visible in one place."
        >
          {monitorSnapshot.sleeves.length === 0 ? (
            <StatePanel
              tone="empty"
              title="No sleeve attribution"
              message="Sleeve attribution publishes once a monitor snapshot includes slice-level data."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sleeve</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead className="text-right">Return contribution</TableHead>
                    <TableHead className="text-right">Market value</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Live</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monitorSnapshot.sleeves.map((sleeve) => (
                    <TableRow key={sleeve.sleeveId}>
                      <TableCell className="font-medium">{sleeve.label}</TableCell>
                      <TableCell>{sleeve.strategyName}</TableCell>
                      <TableCell className="text-right">
                        {formatPercent(sleeve.returnContributionPct ?? null)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(sleeve.marketValue ?? null, monitorSnapshot.baseCurrency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPercent(sleeve.targetWeightPct)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPercent(sleeve.liveWeightPct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </PanelCard>

        <div className="rounded-3xl border border-mcm-walnut/15 bg-background/35 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Model Outlook
              </div>
              <h3 className="mt-2 font-display text-xl">Regime-conditioned forecast</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={outlook.confidence === 'thin' ? 'secondary' : 'default'}>
                {outlook.confidenceLabel}
              </Badge>
              <Badge variant={forecastQuery.data ? 'default' : 'secondary'}>
                {outlookSource}
              </Badge>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Horizon
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {MODEL_OUTLOOK_HORIZONS.map((horizon) => (
                  <Button
                    key={horizon}
                    type="button"
                    variant={selectedHorizon === horizon ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedHorizon(horizon)}
                  >
                    {horizon}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Regime assumption
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {MODEL_OUTLOOK_ASSUMPTIONS.map((assumption) => (
                  <Button
                    key={assumption}
                    type="button"
                    variant={selectedAssumption === assumption ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedAssumption(assumption)}
                  >
                    {assumption === 'current' ? 'Current' : titleCaseWords(assumption)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <label
                htmlFor="model-outlook-cost-drag"
                className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
              >
                Cost-drag override (bps)
              </label>
              <Input
                id="model-outlook-cost-drag"
                type="number"
                value={costDragOverrideBps}
                onChange={(event) => setCostDragOverrideBps(event.target.value)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Expected portfolio return</div>
                <div className="mt-2 font-display text-2xl">
                  {formatPercent(outlook.expectedReturnPct)}
                </div>
              </div>
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Expected active return</div>
                <div className="mt-2 font-display text-2xl">
                  {formatPercent(outlook.expectedActiveReturnPct)}
                </div>
              </div>
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Downside band</div>
                <div className="mt-2 font-display text-2xl">
                  {formatPercent(outlook.downsidePct)}
                </div>
              </div>
              <div className="rounded-2xl border border-mcm-walnut/12 bg-mcm-paper/70 p-3">
                <div className="text-sm text-muted-foreground">Upside band</div>
                <div className="mt-2 font-display text-2xl">{formatPercent(outlook.upsidePct)}</div>
              </div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <div>
                Applied regime{' '}
                <span className="font-medium text-foreground">
                  {titleCaseWords(outlook.appliedRegimeCode)}
                </span>
              </div>
              <div>
                Sample size{' '}
                <span className="font-medium text-foreground">
                  {formatNumber(outlook.sampleSize, 0)}
                </span>{' '}
                windows
              </div>
              <div>
                Sample mode{' '}
                <span className="font-medium text-foreground">
                  {titleCaseWords(outlook.sampleMode)}
                </span>
              </div>
              {outlook.notes.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
