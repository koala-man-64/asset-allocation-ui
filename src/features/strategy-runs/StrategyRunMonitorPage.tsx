import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Gauge,
  Layers3,
  Radar,
  ShieldAlert,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis
} from 'recharts';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { PageLoader } from '@/app/components/common/PageLoader';
import { Alert, AlertDescription, AlertTitle } from '@/app/components/ui/alert';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/app/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from '@/app/components/ui/chart';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { useRealtime } from '@/hooks/useRealtime';
import { backtestApi, type RunRecordResponse } from '@/services/backtestApi';
import { backtestKeys } from '@/services/backtestHooks';
import { strategyApi } from '@/services/strategyApi';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

import {
  DEFAULT_REFRESH_MS,
  REFRESH_INTERVAL_OPTIONS,
  buildDefaultRunDraft,
  buildRunAlerts,
  buildRunEvents,
  formatBps,
  formatCompactCurrency,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPercentDecimal,
  formatRelativeTime,
  getAbsoluteValue,
  getRunLabel,
  getRunStatusLabel,
  getRunStatusTone,
  isActiveRunStatus,
  pickPreferredRun,
  sortRunsBySubmittedAt,
  toIsoTimestamp
} from './lib/strategyRunMonitor';

interface MetricCardProps {
  title: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone?: 'default' | 'warning';
}

function formatChartDateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(parsed);
}

function MetricCard({ title, value, detail, icon: Icon, tone = 'default' }: MetricCardProps) {
  return (
    <Card className="mcm-panel h-full overflow-hidden">
      <CardContent className="relative flex h-full flex-col gap-4 p-5">
        <div
          className={`absolute inset-x-0 top-0 h-1 ${
            tone === 'warning' ? 'bg-destructive' : 'bg-mcm-teal'
          }`}
        />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              {title}
            </p>
            <div className="font-display text-3xl font-black tracking-tight text-foreground">
              {value}
            </div>
          </div>
          <div className="rounded-full border-2 border-mcm-walnut/35 bg-mcm-cream p-2">
            <Icon className={`h-5 w-5 ${tone === 'warning' ? 'text-destructive' : 'text-mcm-teal'}`} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function RunSelectorCard({
  runs,
  selectedRunId,
  onSelectRun
}: {
  runs: RunRecordResponse[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}) {
  return (
    <Card className="mcm-panel overflow-hidden">
      <CardHeader className="border-b border-border/40">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock3 className="h-5 w-5 text-mcm-olive" />
          Recent Runs
        </CardTitle>
        <CardDescription>Desk-labeled runs for the selected strategy.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        {runs.length ? (
          runs.map((run) => {
            const isSelected = run.run_id === selectedRunId;
            return (
              <button
                key={run.run_id}
                type="button"
                onClick={() => onSelectRun(run.run_id)}
                className={`w-full rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? 'border-mcm-walnut bg-mcm-mustard/18 shadow-[6px_6px_0px_0px_rgba(119,63,26,0.1)]'
                    : 'border-mcm-walnut/25 bg-mcm-paper/70 hover:bg-mcm-cream'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground">{getRunLabel(run)}</div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      {run.run_id}
                    </div>
                  </div>
                  <Badge variant={getRunStatusTone(run.status)}>{getRunStatusLabel(run.status)}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Submitted {formatDateTime(run.submitted_at)}</span>
                  {run.completed_at ? <span>Finished {formatDateTime(run.completed_at)}</span> : null}
                </div>
              </button>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/40 px-4 py-6 text-sm text-muted-foreground">
            No runs have been launched for this strategy yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StrategyRunMonitorPage() {
  const queryClient = useQueryClient();
  const [selectedStrategyName, setSelectedStrategyName] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshMs, setRefreshMs] = useState(DEFAULT_REFRESH_MS);
  const [draft, setDraft] = useState(() => buildDefaultRunDraft());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useRealtime({ enabled: autoRefresh });

  useEffect(() => {
    const handle = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(handle);
  }, []);

  const {
    data: strategies = [],
    isLoading: strategiesLoading,
    error: strategiesError
  } = useQuery({
    queryKey: ['strategies'],
    queryFn: ({ signal }) => strategyApi.listStrategies(signal)
  });

  useEffect(() => {
    if (!strategies.length) {
      setSelectedStrategyName(null);
      return;
    }

    if (selectedStrategyName && strategies.some((strategy) => strategy.name === selectedStrategyName)) {
      return;
    }

    setSelectedStrategyName(strategies[0].name);
  }, [selectedStrategyName, strategies]);

  const strategyDetailQuery = useQuery({
    queryKey: ['strategies', 'detail', selectedStrategyName],
    queryFn: ({ signal }) => strategyApi.getStrategyDetail(String(selectedStrategyName), signal),
    enabled: Boolean(selectedStrategyName)
  });

  const runsQuery = useQuery({
    queryKey: backtestKeys.runList({
      q: selectedStrategyName ?? undefined,
      limit: 24,
      offset: 0
    }),
    queryFn: ({ signal }) =>
      backtestApi.listRuns(
        {
          q: selectedStrategyName ?? undefined,
          limit: 24,
          offset: 0
        },
        signal
      ),
    enabled: Boolean(selectedStrategyName),
    refetchInterval: autoRefresh ? refreshMs : false,
    placeholderData: keepPreviousData
  });

  const runs = sortRunsBySubmittedAt(runsQuery.data?.runs ?? []);

  useEffect(() => {
    if (!runs.length) {
      setSelectedRunId(null);
      return;
    }

    if (selectedRunId && runs.some((run) => run.run_id === selectedRunId)) {
      return;
    }

    setSelectedRunId(pickPreferredRun(runs)?.run_id ?? runs[0].run_id);
  }, [runs, selectedRunId]);

  const selectedRun = runs.find((run) => run.run_id === selectedRunId) ?? null;
  const runIsActive = isActiveRunStatus(selectedRun?.status);
  const dataRefetchInterval = autoRefresh && runIsActive ? refreshMs : false;

  const summaryQuery = useQuery({
    queryKey: selectedRunId ? backtestKeys.summary(selectedRunId) : ['backtest', 'summary', 'none'],
    queryFn: ({ signal }) => backtestApi.getSummary(String(selectedRunId), {}, signal),
    enabled: Boolean(selectedRunId),
    refetchInterval: dataRefetchInterval,
    placeholderData: keepPreviousData
  });

  const timeseriesQuery = useQuery({
    queryKey: selectedRunId
      ? backtestKeys.timeseries(selectedRunId, 5000)
      : ['backtest', 'timeseries', 'none'],
    queryFn: ({ signal }) =>
      backtestApi.getTimeseries(String(selectedRunId), { maxPoints: 5000 }, signal),
    enabled: Boolean(selectedRunId),
    refetchInterval: dataRefetchInterval,
    placeholderData: keepPreviousData
  });

  const rollingQuery = useQuery({
    queryKey: selectedRunId
      ? backtestKeys.rolling(selectedRunId, 63, 5000)
      : ['backtest', 'rolling', 'none'],
    queryFn: ({ signal }) =>
      backtestApi.getRolling(String(selectedRunId), { windowDays: 63, maxPoints: 5000 }, signal),
    enabled: Boolean(selectedRunId),
    refetchInterval: dataRefetchInterval,
    placeholderData: keepPreviousData
  });

  const tradesQuery = useQuery({
    queryKey: selectedRunId
      ? backtestKeys.trades(selectedRunId, 12, 0)
      : ['backtest', 'trades', 'none'],
    queryFn: ({ signal }) => backtestApi.getTrades(String(selectedRunId), { limit: 12, offset: 0 }, signal),
    enabled: Boolean(selectedRunId),
    refetchInterval: dataRefetchInterval,
    placeholderData: keepPreviousData
  });

  const positionsQuery = useQuery({
    queryKey: selectedRunId
      ? backtestKeys.closedPositions(selectedRunId, 12, 0)
      : ['backtest', 'closed-positions', 'none'],
    queryFn: ({ signal }) =>
      backtestApi.getClosedPositions(String(selectedRunId), { limit: 12, offset: 0 }, signal),
    enabled: Boolean(selectedRunId),
    refetchInterval: dataRefetchInterval,
    placeholderData: keepPreviousData
  });

  const launchMutation = useMutation({
    mutationFn: async () => {
      const startTs = toIsoTimestamp(draft.startTs);
      const endTs = toIsoTimestamp(draft.endTs);

      if (!selectedStrategyName) {
        throw new Error('Select a strategy before launching a run.');
      }

      if (!startTs || !endTs) {
        throw new Error('Enter valid start and end timestamps.');
      }

      return backtestApi.submitRun({
        strategyName: selectedStrategyName,
        startTs,
        endTs,
        barSize: draft.barSize.trim() || '5m',
        runName: draft.runName.trim() || undefined
      });
    },
    onSuccess: async (run) => {
      await queryClient.invalidateQueries({ queryKey: backtestKeys.all });
      setSelectedRunId(run.run_id);
      setDraft(buildDefaultRunDraft());
      toast.success(`Run ${run.run_id} entered the queue`);
    },
    onError: (error) => {
      toast.error(formatSystemStatusText(error));
    }
  });

  const latestPoint = (() => {
    const points = timeseriesQuery.data?.points ?? [];
    return points.length ? points[points.length - 1] : null;
  })();

  const equitySeries = (timeseriesQuery.data?.points ?? []).map((point) => ({
    date: point.date,
    equity: point.portfolio_value,
    drawdownPct: (getAbsoluteValue(point.drawdown) ?? 0) * 100
  }));

  const rollingSeries = (rollingQuery.data?.points ?? []).map((point) => ({
    date: point.date,
    rollingSharpe: point.rolling_sharpe ?? null,
    rollingMaxDrawdown: (getAbsoluteValue(point.rolling_max_drawdown) ?? 0) * 100,
    turnover: point.turnover_sum ?? null
  }));

  const importantUpdatedAts = [
    runsQuery.dataUpdatedAt,
    summaryQuery.dataUpdatedAt,
    timeseriesQuery.dataUpdatedAt,
    rollingQuery.dataUpdatedAt,
    tradesQuery.dataUpdatedAt,
    positionsQuery.dataUpdatedAt
  ].filter((value) => value > 0);

  const freshnessMs =
    selectedRun && importantUpdatedAts.length ? nowMs - Math.min(...importantUpdatedAts) : null;

  const alerts = buildRunAlerts({
    run: selectedRun,
    summary: summaryQuery.data,
    latestPoint,
    freshnessMs,
    refreshMs,
    timeseriesTruncated: timeseriesQuery.data?.truncated,
    rollingTruncated: rollingQuery.data?.truncated
  });

  const events = buildRunEvents({
    run: selectedRun,
    trades: tradesQuery.data?.trades ?? [],
    closedPositions: positionsQuery.data?.positions ?? []
  });

  const resultMetadata =
    summaryQuery.data?.metadata ?? timeseriesQuery.data?.metadata ?? rollingQuery.data?.metadata ?? null;

  const strategyConfig = strategyDetailQuery.data?.config;
  const strategyFacts = [
    { label: 'Universe', value: strategyConfig?.universeConfigName || 'Not assigned' },
    { label: 'Ranking', value: strategyConfig?.rankingSchemaName || 'Not assigned' },
    { label: 'Rebalance', value: strategyConfig?.rebalance || 'Not assigned' },
    {
      label: 'Position Count',
      value: strategyConfig?.topN ? `${strategyConfig.topN} names` : 'Not assigned'
    },
    {
      label: 'Holding Period',
      value: strategyConfig?.holdingPeriod ? `${strategyConfig.holdingPeriod} bars` : 'Not assigned'
    },
    {
      label: 'Regime Gate',
      value: strategyConfig?.regimePolicy?.modelName || 'No regime model'
    }
  ];

  const metricCards = [
    {
      title: 'Net Return',
      value: formatPercentDecimal(summaryQuery.data?.total_return),
      detail: `Final equity ${formatCompactCurrency(summaryQuery.data?.final_equity)}`,
      icon: TrendingUp,
      tone:
        (summaryQuery.data?.total_return ?? 0) < 0 ? ('warning' as const) : ('default' as const)
    },
    {
      title: 'Max Drawdown',
      value: formatPercentDecimal(getAbsoluteValue(summaryQuery.data?.max_drawdown)),
      detail: 'Desk comfort line for staying with the run',
      icon: TrendingDown,
      tone:
        (getAbsoluteValue(summaryQuery.data?.max_drawdown) ?? 0) >= 0.12
          ? ('warning' as const)
          : ('default' as const)
    },
    {
      title: 'Sharpe',
      value: formatNumber(summaryQuery.data?.sharpe_ratio, 2),
      detail: `Sortino ${formatNumber(summaryQuery.data?.sortino_ratio, 2)}`,
      icon: Gauge
    },
    {
      title: 'Cost Drag',
      value: formatBps(summaryQuery.data?.cost_drag_bps),
      detail: `Txn cost ${formatCompactCurrency(summaryQuery.data?.total_transaction_cost)}`,
      icon: ShieldAlert,
      tone:
        (summaryQuery.data?.cost_drag_bps ?? 0) >= 75
          ? ('warning' as const)
          : ('default' as const)
    },
    {
      title: 'Gross Exposure',
      value: `${formatNumber(latestPoint?.gross_exposure, 2)}x`,
      detail: `Net ${formatNumber(latestPoint?.net_exposure, 2)}x`,
      icon: Radar
    },
    {
      title: 'Trade Count',
      value: formatNumber(summaryQuery.data?.trades, 0),
      detail: `Hit rate ${formatPercentDecimal(summaryQuery.data?.hit_rate)}`,
      icon: Layers3
    }
  ];

  const globalError =
    formatSystemStatusText(strategiesError) || formatSystemStatusText(runsQuery.error) || '';
  const detailError = formatSystemStatusText(strategyDetailQuery.error);
  const summaryError = formatSystemStatusText(summaryQuery.error);
  const timeseriesError = formatSystemStatusText(timeseriesQuery.error);
  const rollingError = formatSystemStatusText(rollingQuery.error);
  const tradesError = formatSystemStatusText(tradesQuery.error);
  const positionsError = formatSystemStatusText(positionsQuery.error);

  const liveModeLabel = autoRefresh
    ? runIsActive
      ? `Live invalidation + ${Math.round(refreshMs / 1000)}s polling`
      : 'Realtime invalidation enabled'
    : 'Manual refresh mode';

  if (strategiesLoading && !strategies.length) {
    return <PageLoader text="Loading strategy run workspace..." />;
  }

  return (
    <div className="page-shell">
      <div className="page-header-row">
        <div className="page-header">
          <p className="page-kicker">Execution Control</p>
          <h1 className="page-title flex items-center gap-2">
            <Radar className="h-6 w-6 text-mcm-teal" />
            Strategy Run Monitor
          </h1>
          <p className="page-subtitle">
            Launch a strategy run, auto-follow the active snapshot, and keep the desk view focused
            on PnL path, drawdown pressure, exposure, and execution drag without leaving the
            backtest surface.
          </p>
        </div>

        <div className="grid w-full max-w-xl gap-3 rounded-[1.75rem] border-2 border-mcm-walnut bg-mcm-paper/90 p-4 shadow-[8px_8px_0px_0px_rgba(119,63,26,0.12)] sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getRunStatusTone(selectedRun?.status)}>
                {getRunStatusLabel(selectedRun?.status)}
              </Badge>
              <Badge variant="outline">{liveModeLabel}</Badge>
            </div>
            <div className="font-display text-xl font-black tracking-tight text-foreground">
              {selectedRun ? getRunLabel(selectedRun) : 'Select a strategy to begin'}
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedRun
                ? `Snapshot updated ${formatRelativeTime(freshnessMs)}`
                : 'Choose a strategy, launch a run, and the dashboard will auto-follow the most relevant run.'}
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-end gap-2">
            <Button variant="outline" asChild>
              <Link to="/strategies">Strategy Workspace</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: backtestKeys.all });
              }}
            >
              Refresh Snapshot
            </Button>
          </div>
        </div>
      </div>

      {globalError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Workspace data is unavailable</AlertTitle>
          <AlertDescription>{globalError}</AlertDescription>
        </Alert>
      ) : null}

      {alerts.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {alerts.map((alert) => (
            <Alert key={alert.id} variant={alert.severity === 'critical' ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
        <div className="space-y-6 xl:sticky xl:top-8 xl:self-start">
          <Card className="mcm-panel overflow-hidden">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-mcm-teal" />
                Launch Run
              </CardTitle>
              <CardDescription>
                Inline controls for backtest-style runs using the existing API surface.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="grid gap-2">
                <Label htmlFor="run-strategy">Strategy</Label>
                <select
                  id="run-strategy"
                  className="h-10 rounded-xl border-2 border-mcm-walnut bg-input-background px-3 text-sm font-semibold"
                  value={selectedStrategyName ?? ''}
                  onChange={(event) => {
                    setSelectedStrategyName(event.target.value);
                    setSelectedRunId(null);
                  }}
                >
                  {strategies.map((strategy) => (
                    <option key={strategy.name} value={strategy.name}>
                      {strategy.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="run-name">Desk Label</Label>
                <Input
                  id="run-name"
                  value={draft.runName}
                  onChange={(event) => setDraft({ ...draft, runName: event.target.value })}
                  placeholder="opening auction replay"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="run-start">Start</Label>
                  <Input
                    id="run-start"
                    type="datetime-local"
                    value={draft.startTs}
                    onChange={(event) => setDraft({ ...draft, startTs: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="run-end">End</Label>
                  <Input
                    id="run-end"
                    type="datetime-local"
                    value={draft.endTs}
                    onChange={(event) => setDraft({ ...draft, endTs: event.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="run-bar-size">Bar Size</Label>
                  <Input
                    id="run-bar-size"
                    value={draft.barSize}
                    onChange={(event) => setDraft({ ...draft, barSize: event.target.value })}
                    placeholder="5m"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="run-refresh">Refresh Cadence</Label>
                  <select
                    id="run-refresh"
                    className="h-10 rounded-xl border-2 border-mcm-walnut bg-input-background px-3 text-sm font-semibold"
                    value={String(refreshMs)}
                    onChange={(event) => setRefreshMs(Number(event.target.value))}
                  >
                    {REFRESH_INTERVAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-mcm-walnut/20 bg-mcm-cream/70 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Auto-refresh</div>
                  <div className="text-xs text-muted-foreground">
                    Use websocket invalidation and polling while a run is active.
                  </div>
                </div>
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
              </div>

              <Button
                className="w-full"
                disabled={launchMutation.isPending || !selectedStrategyName}
                onClick={() => launchMutation.mutate()}
              >
                {launchMutation.isPending ? 'Launching...' : 'Launch Run'}
              </Button>
            </CardContent>
          </Card>

          <Card className="mcm-panel overflow-hidden">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers3 className="h-5 w-5 text-mcm-olive" />
                Strategy Context
              </CardTitle>
              <CardDescription>
                The monitor keeps the strategy shape visible while the run evolves.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              {detailError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Strategy detail unavailable</AlertTitle>
                  <AlertDescription>{detailError}</AlertDescription>
                </Alert>
              ) : null}

              {strategyFacts.map((fact) => (
                <div
                  key={fact.label}
                  className="flex items-center justify-between rounded-2xl border border-mcm-walnut/20 bg-mcm-paper/60 px-4 py-3"
                >
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    {fact.label}
                  </span>
                  <span className="max-w-[55%] text-right text-sm font-semibold text-foreground">
                    {fact.value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <RunSelectorCard runs={runs} selectedRunId={selectedRunId} onSelectRun={setSelectedRunId} />
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {metricCards.map((metric) => (
              <MetricCard key={metric.title} {...metric} />
            ))}
          </div>

          <Card className="mcm-panel overflow-hidden">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-mcm-teal" />
                Equity vs Drawdown
              </CardTitle>
              <CardDescription>
                Net equity stays center-stage, while drawdown rides the secondary axis so regime
                damage is visible immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              {timeseriesError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Timeseries unavailable</AlertTitle>
                  <AlertDescription>{timeseriesError}</AlertDescription>
                </Alert>
              ) : equitySeries.length ? (
                <ChartContainer
                  className="h-[320px] w-full"
                  config={{
                    equity: { label: 'Portfolio Value', color: 'var(--color-chart-1)' },
                    drawdownPct: { label: 'Drawdown', color: 'var(--color-chart-5)' }
                  }}
                >
                  <ComposedChart data={equitySeries} margin={{ left: 10, right: 10, top: 8 }}>
                    <defs>
                      <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-equity)" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="var(--color-equity)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={formatChartDateLabel}
                      minTickGap={32}
                    />
                    <YAxis
                      yAxisId="equity"
                      tickLine={false}
                      axisLine={false}
                      width={96}
                      tickFormatter={(value: number) => formatCompactCurrency(value)}
                    />
                    <YAxis
                      yAxisId="drawdown"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      tickFormatter={(value: number) => formatPercent(value, 1)}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <>
                              <span className="text-muted-foreground">{String(name)}</span>
                              <span className="font-mono font-medium text-foreground">
                                {name === 'equity'
                                  ? formatCurrency(Number(value))
                                  : formatPercent(Number(value), 1)}
                              </span>
                            </>
                          )}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <ReferenceLine
                      yAxisId="drawdown"
                      y={0}
                      stroke="var(--color-border)"
                      strokeDasharray="4 4"
                    />
                    <Area
                      yAxisId="equity"
                      type="monotone"
                      dataKey="equity"
                      stroke="var(--color-equity)"
                      strokeWidth={2.25}
                      fill="url(#equityFill)"
                    />
                    <Line
                      yAxisId="drawdown"
                      type="monotone"
                      dataKey="drawdownPct"
                      stroke="var(--color-drawdownPct)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ChartContainer>
              ) : selectedRunId ? (
                <div className="rounded-2xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/40 px-4 py-16 text-center text-sm text-muted-foreground">
                  The run does not have enough time-series data yet.
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/40 px-4 py-16 text-center text-sm text-muted-foreground">
                  Launch a run or select one from the recent list to populate the chart.
                </div>
              )}
            </CardContent>
          </Card>
 
          <Card className="mcm-panel overflow-hidden">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gauge className="h-5 w-5 text-mcm-olive" />
                Rolling Desk Quality
              </CardTitle>
              <CardDescription>
                The second chart answers whether quality is improving or whether returns are being
                purchased with more turnover and deeper windows of pain.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              {rollingError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Rolling metrics unavailable</AlertTitle>
                  <AlertDescription>{rollingError}</AlertDescription>
                </Alert>
              ) : rollingSeries.length ? (
                <ChartContainer
                  className="h-[280px] w-full"
                  config={{
                    rollingSharpe: { label: 'Rolling Sharpe', color: 'var(--color-chart-2)' },
                    rollingMaxDrawdown: { label: 'Rolling Max DD', color: 'var(--color-chart-5)' },
                    turnover: { label: 'Turnover', color: 'var(--color-chart-3)' }
                  }}
                >
                  <ComposedChart data={rollingSeries} margin={{ left: 10, right: 10, top: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={formatChartDateLabel}
                      minTickGap={32}
                    />
                    <YAxis yAxisId="quality" tickLine={false} axisLine={false} width={72} />
                    <YAxis
                      yAxisId="risk"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      tickFormatter={(value: number) => formatPercent(value, 1)}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <>
                              <span className="text-muted-foreground">{String(name)}</span>
                              <span className="font-mono font-medium text-foreground">
                                {name === 'rollingMaxDrawdown'
                                  ? formatPercent(Number(value), 1)
                                  : formatNumber(Number(value), 2)}
                              </span>
                            </>
                          )}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <ReferenceLine
                      yAxisId="quality"
                      y={0}
                      stroke="var(--color-border)"
                      strokeDasharray="4 4"
                    />
                    <Line
                      yAxisId="quality"
                      type="monotone"
                      dataKey="rollingSharpe"
                      stroke="var(--color-rollingSharpe)"
                      strokeWidth={2.1}
                      dot={false}
                    />
                    <Line
                      yAxisId="risk"
                      type="monotone"
                      dataKey="rollingMaxDrawdown"
                      stroke="var(--color-rollingMaxDrawdown)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="quality"
                      type="monotone"
                      dataKey="turnover"
                      stroke="var(--color-turnover)"
                      strokeDasharray="5 4"
                      strokeWidth={1.75}
                      dot={false}
                    />
                  </ComposedChart>
                </ChartContainer>
              ) : (
                <div className="rounded-2xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/40 px-4 py-14 text-center text-sm text-muted-foreground">
                  Rolling metrics will appear once the run has enough observations.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mcm-panel overflow-hidden">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-mcm-teal" />
                Execution Ledger
              </CardTitle>
              <CardDescription>
                Keep the most recent trades and closed positions on the same page so PnL is not
                reviewed without the blotter.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <Tabs defaultValue="trades" className="gap-4">
                <TabsList>
                  <TabsTrigger value="trades">Trade Blotter</TabsTrigger>
                  <TabsTrigger value="positions">Closed Positions</TabsTrigger>
                </TabsList>

                <TabsContent value="trades">
                  {tradesError ? (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Trade blotter unavailable</AlertTitle>
                      <AlertDescription>{tradesError}</AlertDescription>
                    </Alert>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Notional</TableHead>
                          <TableHead>Slippage</TableHead>
                          <TableHead>Cash After</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(tradesQuery.data?.trades ?? []).length ? (
                          (tradesQuery.data?.trades ?? []).map((trade) => (
                            <TableRow key={`${trade.execution_date}-${trade.symbol}-${trade.quantity}`}>
                              <TableCell>{formatDateTime(trade.execution_date)}</TableCell>
                              <TableCell className="font-semibold">{trade.symbol}</TableCell>
                              <TableCell>{formatNumber(trade.quantity, 0)}</TableCell>
                              <TableCell>{formatCurrency(trade.notional)}</TableCell>
                              <TableCell>{formatCurrency(trade.slippage_cost)}</TableCell>
                              <TableCell>{formatCurrency(trade.cash_after)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              No trades recorded yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="positions">
                  {positionsError ? (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Closed positions unavailable</AlertTitle>
                      <AlertDescription>{positionsError}</AlertDescription>
                    </Alert>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Closed</TableHead>
                          <TableHead>Bars Held</TableHead>
                          <TableHead>Realized PnL</TableHead>
                          <TableHead>Return</TableHead>
                          <TableHead>Txn Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(positionsQuery.data?.positions ?? []).length ? (
                          (positionsQuery.data?.positions ?? []).map((position) => (
                            <TableRow key={position.position_id}>
                              <TableCell className="font-semibold">{position.symbol}</TableCell>
                              <TableCell>{formatDateTime(position.closed_at)}</TableCell>
                              <TableCell>{formatNumber(position.holding_period_bars, 0)}</TableCell>
                              <TableCell>{formatCurrency(position.realized_pnl)}</TableCell>
                              <TableCell>{formatPercentDecimal(position.realized_return)}</TableCell>
                              <TableCell>{formatCurrency(position.total_transaction_cost)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              No closed positions yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="mcm-panel overflow-hidden">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                Desk Flags
              </CardTitle>
              <CardDescription>
                Head-trader style warnings that keep process and risk visible instead of buried
                under a strong equity curve.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              {alerts.length ? (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`rounded-2xl border px-4 py-3 ${
                      alert.severity === 'critical'
                        ? 'border-destructive/50 bg-destructive/8'
                        : alert.severity === 'warning'
                          ? 'border-mcm-mustard/50 bg-mcm-mustard/10'
                          : 'border-mcm-teal/35 bg-mcm-cream/70'
                    }`}
                  >
                    <div className="text-sm font-semibold text-foreground">{alert.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{alert.message}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/40 px-4 py-6 text-sm text-muted-foreground">
                  No desk-level warnings are active for the selected run.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mcm-panel overflow-hidden">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock3 className="h-5 w-5 text-mcm-olive" />
                Snapshot Facts
              </CardTitle>
              <CardDescription>
                Core run metadata and the freshness context for the current snapshot.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              {[
                { label: 'Submitted', value: formatDateTime(selectedRun?.submitted_at) },
                { label: 'Started', value: formatDateTime(selectedRun?.started_at) },
                { label: 'Completed', value: formatDateTime(selectedRun?.completed_at) },
                {
                  label: 'Window',
                  value:
                    selectedRun?.start_date && selectedRun?.end_date
                      ? `${selectedRun.start_date} to ${selectedRun.end_date}`
                      : 'Not available'
                },
                { label: 'Bar Size', value: resultMetadata?.bar_size || draft.barSize },
                {
                  label: 'Periods / Year',
                  value: resultMetadata?.periods_per_year
                    ? String(resultMetadata.periods_per_year)
                    : 'Not available'
                },
                { label: 'Scope', value: resultMetadata?.strategy_scope || 'Strategy run' },
                { label: 'Freshness', value: selectedRun ? formatRelativeTime(freshnessMs) : 'n/a' }
              ].map((fact) => (
                <div
                  key={fact.label}
                  className="flex items-center justify-between rounded-2xl border border-mcm-walnut/20 bg-mcm-paper/60 px-4 py-3"
                >
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    {fact.label}
                  </span>
                  <span className="max-w-[58%] text-right text-sm font-semibold text-foreground">
                    {fact.value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="mcm-panel overflow-hidden">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-mcm-teal" />
                Event Feed
              </CardTitle>
              <CardDescription>
                A compact timeline for the latest state transitions, trades, and closed positions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {events.length ? (
                events.map((event) => (
                  <div key={event.id} className="relative pl-6">
                    <span
                      className={`absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-mcm-walnut ${
                        event.severity === 'critical'
                          ? 'bg-destructive'
                          : event.severity === 'warning'
                            ? 'bg-mcm-mustard'
                            : 'bg-mcm-teal'
                      }`}
                    />
                    <div className="rounded-2xl border border-mcm-walnut/20 bg-mcm-paper/60 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-foreground">{event.title}</div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          {formatDateTime(event.timestamp)}
                        </div>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{event.detail}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-mcm-walnut/35 bg-mcm-paper/40 px-4 py-6 text-sm text-muted-foreground">
                  No event feed yet for this run.
                </div>
              )}
            </CardContent>
          </Card>

          {(summaryError && !summaryQuery.data) || selectedRun?.error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Run detail degraded</AlertTitle>
              <AlertDescription>{summaryError || selectedRun?.error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}
