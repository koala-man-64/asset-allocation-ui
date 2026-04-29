import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BarChart3, GitCompareArrows, LineChart, RefreshCw } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/app/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { backtestApi } from '@/services/backtestApi';
import { strategyAnalyticsApi } from '@/services/strategyAnalyticsApi';
import type { RunRecordResponse } from '@/services/backtestApi';
import type { StrategyDetail, StrategySummary } from '@/types/strategy';
import type {
  StrategyAnalyticsReference,
  StrategyComparisonResponse,
  StrategyScenarioForecastResponse
} from '@/types/strategyAnalytics';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

interface StrategyExplorerPanelProps {
  selectedStrategyName: string | null;
  strategy: StrategyDetail | undefined;
  strategies: StrategySummary[];
  recentRuns: RunRecordResponse[];
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatPct(value?: number | null): string {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value?: number | null): string {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

function buildReferences(
  selectedNames: string[],
  selectedStrategyName: string | null
): StrategyAnalyticsReference[] {
  return selectedNames.map((strategyName, index) => ({
    strategyName,
    role:
      strategyName === selectedStrategyName
        ? 'baseline'
        : index === 1
          ? 'challenger'
          : 'candidate'
  }));
}

function EmptyPanel({ children }: { children: string }) {
  return (
    <div className="rounded-[1.3rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/65 p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ExplorerCard({
  title,
  description,
  badge,
  children
}: {
  title: string;
  description: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-[1.8rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
      {children}
    </section>
  );
}

function ComparisonTable({ response }: { response: StrategyComparisonResponse }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            {response.strategies.map((strategy) => (
              <TableHead key={strategy.strategyName} className="text-right">
                {strategy.strategyName}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {response.metrics.map((metric) => (
            <TableRow key={metric.metric}>
              <TableCell>
                <div className="font-medium">{metric.label}</div>
                <div className="text-xs text-muted-foreground">
                  {metric.unit}
                  {metric.winnerStrategyName ? ` | winner ${metric.winnerStrategyName}` : ''}
                </div>
              </TableCell>
              {response.strategies.map((strategy) => (
                <TableCell key={strategy.strategyName} className="text-right">
                  {formatNumber(metric.values[strategy.strategyName])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ForecastPanel({ response }: { response: StrategyScenarioForecastResponse }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">Source: {response.source}</Badge>
        <Badge variant="outline">Horizon: {response.horizon}</Badge>
        <Badge variant="outline">Regime: {response.regimeAssumption}</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Strategy</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Downside</TableHead>
              <TableHead className="text-right">Upside</TableHead>
              <TableHead>Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {response.forecasts.map((row) => (
              <TableRow key={`${row.strategyName}-${row.appliedRegimeCode}`}>
                <TableCell className="font-medium">{row.strategyName}</TableCell>
                <TableCell className="text-right">{formatPct(row.expectedReturn)}</TableCell>
                <TableCell className="text-right">{formatPct(row.downside)}</TableCell>
                <TableCell className="text-right">{formatPct(row.upside)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{row.confidence}</Badge>
                    <Badge variant="outline">{row.sampleSize} samples</Badge>
                    <Badge variant="outline">{row.sampleMode}</Badge>
                  </div>
                  {row.notes.length ? (
                    <div className="mt-1 text-xs text-muted-foreground">{row.notes.join(' ')}</div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {response.warnings.length ? (
        <div className="rounded-[1.2rem] border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          {response.warnings.join(' ')}
        </div>
      ) : null}
    </div>
  );
}

export function StrategyExplorerPanel({
  selectedStrategyName,
  strategy,
  strategies,
  recentRuns
}: StrategyExplorerPanelProps) {
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('2020-01-01');
  const [endDate, setEndDate] = useState(todayIsoDate);
  const [benchmarkSymbol, setBenchmarkSymbol] = useState('SPY');
  const [costModel, setCostModel] = useState('default');
  const [barSize, setBarSize] = useState('1d');
  const [horizon, setHorizon] = useState('3M');
  const [regimeAssumption, setRegimeAssumption] = useState('current');
  const [costDragOverrideBps, setCostDragOverrideBps] = useState(0);
  const [topNOverride, setTopNOverride] = useState<number | ''>('');

  useEffect(() => {
    if (!selectedStrategyName) {
      setSelectedNames([]);
      return;
    }

    setSelectedNames((current) => {
      const availableNames = new Set(strategies.map((candidate) => candidate.name));
      const retained = current.filter((name) => availableNames.has(name));
      if (retained.includes(selectedStrategyName)) {
        return retained;
      }

      const firstOther = strategies.find((candidate) => candidate.name !== selectedStrategyName)?.name;
      return [selectedStrategyName, firstOther].filter(Boolean) as string[];
    });
  }, [selectedStrategyName, strategies]);

  const references = useMemo(
    () => buildReferences(selectedNames, selectedStrategyName),
    [selectedNames, selectedStrategyName]
  );
  const latestCompletedRun =
    recentRuns.find((run) => run.status === 'completed') || recentRuns[0] || null;

  const summaryQuery = useQuery({
    queryKey: ['backtest', 'summary', latestCompletedRun?.run_id],
    queryFn: ({ signal }) => backtestApi.getSummary(String(latestCompletedRun?.run_id), {}, signal),
    enabled: Boolean(latestCompletedRun?.run_id)
  });

  const timeseriesQuery = useQuery({
    queryKey: ['backtest', 'timeseries', latestCompletedRun?.run_id],
    queryFn: ({ signal }) =>
      backtestApi.getTimeseries(String(latestCompletedRun?.run_id), { maxPoints: 500 }, signal),
    enabled: Boolean(latestCompletedRun?.run_id)
  });

  const rollingQuery = useQuery({
    queryKey: ['backtest', 'rolling', latestCompletedRun?.run_id],
    queryFn: ({ signal }) =>
      backtestApi.getRolling(String(latestCompletedRun?.run_id), { windowDays: 63, maxPoints: 500 }, signal),
    enabled: Boolean(latestCompletedRun?.run_id)
  });

  const allocationsQuery = useQuery({
    queryKey: ['strategies', 'analytics', 'allocations', selectedStrategyName],
    queryFn: ({ signal }) =>
      strategyAnalyticsApi.getAllocationExposure(
        {
          strategyName: String(selectedStrategyName),
          accountIds: [],
          includePositions: true
        },
        signal
      ),
    enabled: Boolean(selectedStrategyName)
  });

  const tradeHistoryQuery = useQuery({
    queryKey: ['strategies', 'analytics', 'trades', selectedStrategyName, startDate, endDate],
    queryFn: ({ signal }) =>
      strategyAnalyticsApi.getTradeHistory(
        {
          strategyName: String(selectedStrategyName),
          startDate,
          endDate,
          sources: ['backtest', 'portfolio_ledger', 'trade_order', 'broker_fill'],
          limit: 100,
          offset: 0
        },
        signal
      ),
    enabled: Boolean(selectedStrategyName)
  });

  const comparisonMutation = useMutation({
    mutationFn: () =>
      strategyAnalyticsApi.compareStrategies({
        strategies: references,
        startDate,
        endDate,
        benchmarkSymbol,
        costModel,
        barSize,
        regimeModelName: strategy?.config.regimePolicy?.modelName || null,
        scenarioAssumption: regimeAssumption,
        includeForecast: true
      })
  });

  const forecastMutation = useMutation({
    mutationFn: () =>
      strategyAnalyticsApi.getScenarioForecast({
        strategies: references.length ? references : buildReferences([String(selectedStrategyName)], selectedStrategyName),
        asOfDate: endDate,
        horizon,
        regimeModelName: strategy?.config.regimePolicy?.modelName || null,
        regimeAssumption,
        costDragOverrideBps,
        tunableParameters: {
          topN: topNOverride === '' ? null : topNOverride,
          costModel,
          barSize
        }
      })
  });

  const toggleStrategy = (strategyName: string) => {
    setSelectedNames((current) =>
      current.includes(strategyName)
        ? current.filter((name) => name !== strategyName)
        : [...current, strategyName]
    );
  };

  const equalWeight = selectedNames.length ? 1 / selectedNames.length : 0;
  const comparisonError = comparisonMutation.error
    ? formatSystemStatusText(comparisonMutation.error)
    : '';
  const forecastError = forecastMutation.error ? formatSystemStatusText(forecastMutation.error) : '';
  const allocationError = allocationsQuery.error ? formatSystemStatusText(allocationsQuery.error) : '';
  const tradeError = tradeHistoryQuery.error ? formatSystemStatusText(tradeHistoryQuery.error) : '';

  return (
    <aside className="mcm-panel flex min-h-[760px] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Strategy Explorer Panel
            </p>
            <h2 className="font-display text-xl text-foreground">Evidence And Comparison</h2>
            <p className="text-sm text-muted-foreground">
              Compare strategies on aligned assumptions and request server-backed analytics without fabricating local forecasts.
            </p>
          </div>
          {selectedStrategyName ? <Badge variant="secondary">{selectedStrategyName}</Badge> : null}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {!selectedStrategyName ? (
          <EmptyPanel>Select a strategy to load historical performance, allocations, trades, and comparison controls.</EmptyPanel>
        ) : (
          <>
            <ExplorerCard
              title="Combination"
              description="Build a portfolio-backed sleeve set for comparison. Persisting sleeve weights remains a portfolio workflow."
              badge={`${selectedNames.length} selected`}
            >
              <div className="space-y-3">
                {strategies.map((candidate) => (
                  <label
                    key={candidate.name}
                    className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-cream/55 p-3 text-sm"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedNames.includes(candidate.name)}
                        onChange={() => toggleStrategy(candidate.name)}
                      />
                      <span className="font-medium text-foreground">{candidate.name}</span>
                    </span>
                    <Badge variant={candidate.name === selectedStrategyName ? 'default' : 'outline'}>
                      {candidate.name === selectedStrategyName ? 'baseline' : 'sleeve'}
                    </Badge>
                  </label>
                ))}
              </div>
              {selectedNames.length ? (
                <div className="rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-paper/80 p-4 text-sm text-muted-foreground">
                  Equal-weight preview: {selectedNames.map((name) => `${name} ${formatPct(equalWeight)}`).join(' | ')}
                </div>
              ) : null}
            </ExplorerCard>

            <ExplorerCard
              title="Comparison Setup"
              description="Comparison requires aligned date range, benchmark, cost model, and bar size."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="strategy-compare-start">Start Date</Label>
                  <Input
                    id="strategy-compare-start"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="strategy-compare-end">End Date</Label>
                  <Input
                    id="strategy-compare-end"
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="strategy-compare-benchmark">Benchmark</Label>
                  <Input
                    id="strategy-compare-benchmark"
                    value={benchmarkSymbol}
                    onChange={(event) => setBenchmarkSymbol(event.target.value.toUpperCase())}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="strategy-compare-cost">Cost Model</Label>
                  <Input
                    id="strategy-compare-cost"
                    value={costModel}
                    onChange={(event) => setCostModel(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="strategy-compare-bar-size">Bar Size</Label>
                  <Input
                    id="strategy-compare-bar-size"
                    value={barSize}
                    onChange={(event) => setBarSize(event.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={() => comparisonMutation.mutate()}
                disabled={comparisonMutation.isPending || selectedNames.length < 2}
              >
                <GitCompareArrows className="h-4 w-4" />
                {comparisonMutation.isPending ? 'Comparing...' : 'Compare Strategies'}
              </Button>
              {selectedNames.length < 2 ? (
                <EmptyPanel>Select at least two strategies to compare baseline and challenger.</EmptyPanel>
              ) : null}
              {comparisonError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {comparisonError}
                </div>
              ) : null}
              {comparisonMutation.data ? (
                comparisonMutation.data.metrics.length ? (
                  <ComparisonTable response={comparisonMutation.data} />
                ) : (
                  <EmptyPanel>The comparison API returned no metric rows for the aligned setup.</EmptyPanel>
                )
              ) : null}
            </ExplorerCard>

            <ExplorerCard
              title="Historical Performance"
              description="Backtest summary, timeseries, and rolling metrics come from the latest available run."
              badge={latestCompletedRun?.run_id || 'No run'}
            >
              {!latestCompletedRun ? (
                <EmptyPanel>No backtest runs are available for this strategy.</EmptyPanel>
              ) : summaryQuery.error || timeseriesQuery.error || rollingQuery.error ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {formatSystemStatusText(summaryQuery.error || timeseriesQuery.error || rollingQuery.error)}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                      <BarChart3 className="h-4 w-4" />
                      Summary
                    </div>
                    <div className="mt-3 grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total return</span>
                        <span className="font-medium">{formatPct(summaryQuery.data?.total_return)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sharpe</span>
                        <span className="font-medium">{formatNumber(summaryQuery.data?.sharpe_ratio)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Max drawdown</span>
                        <span className="font-medium">{formatPct(summaryQuery.data?.max_drawdown)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cost drag</span>
                        <span className="font-medium">{formatNumber(summaryQuery.data?.cost_drag_bps)} bps</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                      <LineChart className="h-4 w-4" />
                      Samples
                    </div>
                    <div className="mt-3 grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span>Timeseries points</span>
                        <span className="font-medium">{timeseriesQuery.data?.total_points ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Rolling windows</span>
                        <span className="font-medium">{rollingQuery.data?.total_points ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trades</span>
                        <span className="font-medium">{summaryQuery.data?.trades ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Closed positions</span>
                        <span className="font-medium">{summaryQuery.data?.closed_positions ?? 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </ExplorerCard>

            <ExplorerCard
              title="Conditional Outlook"
              description="Server forecast response must identify source, confidence, sample size, and fallback mode."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="strategy-forecast-horizon">Horizon</Label>
                  <Select value={horizon} onValueChange={setHorizon}>
                    <SelectTrigger id="strategy-forecast-horizon">
                      <SelectValue placeholder="Horizon" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1M">1M</SelectItem>
                      <SelectItem value="3M">3M</SelectItem>
                      <SelectItem value="6M">6M</SelectItem>
                      <SelectItem value="12M">12M</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="strategy-forecast-regime">Regime Assumption</Label>
                  <Input
                    id="strategy-forecast-regime"
                    value={regimeAssumption}
                    onChange={(event) => setRegimeAssumption(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="strategy-forecast-cost">Cost Drag Override Bps</Label>
                  <Input
                    id="strategy-forecast-cost"
                    type="number"
                    value={costDragOverrideBps}
                    onChange={(event) => setCostDragOverrideBps(Number(event.target.value) || 0)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="strategy-forecast-topn">Top N Override</Label>
                  <Input
                    id="strategy-forecast-topn"
                    type="number"
                    value={topNOverride}
                    onChange={(event) =>
                      setTopNOverride(event.target.value === '' ? '' : Number(event.target.value))
                    }
                  />
                </div>
              </div>
              <Button onClick={() => forecastMutation.mutate()} disabled={forecastMutation.isPending}>
                <RefreshCw className="h-4 w-4" />
                {forecastMutation.isPending ? 'Requesting...' : 'Request Forecast'}
              </Button>
              {forecastError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {forecastError}
                </div>
              ) : null}
              {forecastMutation.data ? (
                forecastMutation.data.forecasts.length ? (
                  <ForecastPanel response={forecastMutation.data} />
                ) : (
                  <EmptyPanel>The forecast API returned no outlook rows for this scenario.</EmptyPanel>
                )
              ) : (
                <EmptyPanel>No forecast has been requested in this workspace session.</EmptyPanel>
              )}
            </ExplorerCard>

            <ExplorerCard
              title="Current Allocations"
              description="Allocations are portfolio-backed exposures from account snapshots."
            >
              {allocationsQuery.isLoading ? (
                <EmptyPanel>Loading portfolio-backed exposure...</EmptyPanel>
              ) : allocationError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {allocationError}
                </div>
              ) : allocationsQuery.data?.exposures.length ? (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Market Value</div>
                      <div className="mt-2 font-semibold">{formatCurrency(allocationsQuery.data.totalMarketValue)}</div>
                    </div>
                    <div className="rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Target</div>
                      <div className="mt-2 font-semibold">{formatPct(allocationsQuery.data.aggregateTargetWeight)}</div>
                    </div>
                    <div className="rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Actual</div>
                      <div className="mt-2 font-semibold">{formatPct(allocationsQuery.data.aggregateActualWeight)}</div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead>Portfolio</TableHead>
                          <TableHead>Sleeve</TableHead>
                          <TableHead className="text-right">Actual</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allocationsQuery.data.exposures.map((row) => (
                          <TableRow key={`${row.accountId}-${row.sleeveId}`}>
                            <TableCell>{row.accountName}</TableCell>
                            <TableCell>{row.portfolioName}</TableCell>
                            <TableCell>{row.sleeveName || row.sleeveId}</TableCell>
                            <TableCell className="text-right">{formatPct(row.actualWeight)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{row.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <EmptyPanel>No portfolio exposure exists for this strategy in the current snapshots.</EmptyPanel>
              )}
            </ExplorerCard>

            <ExplorerCard
              title="Trade History"
              description="Unified trade history separates source labels for backtests, ledgers, orders, and broker fills."
              badge={`${tradeHistoryQuery.data?.total ?? 0} rows`}
            >
              {tradeHistoryQuery.isLoading ? (
                <EmptyPanel>Loading unified trade history...</EmptyPanel>
              ) : tradeError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {tradeError}
                </div>
              ) : tradeHistoryQuery.data?.trades.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Notional</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tradeHistoryQuery.data.trades.map((trade) => (
                        <TableRow key={`${trade.timestamp}-${trade.source}-${trade.symbol}-${trade.eventId || trade.orderId || trade.runId || trade.quantity}`}>
                          <TableCell>{trade.timestamp}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{trade.source}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{trade.symbol}</TableCell>
                          <TableCell>{trade.side || 'n/a'}</TableCell>
                          <TableCell className="text-right">{formatNumber(trade.quantity)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(trade.notional)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyPanel>No unified trade-history rows were returned for the selected window.</EmptyPanel>
              )}
            </ExplorerCard>
          </>
        )}
      </div>
    </aside>
  );
}
