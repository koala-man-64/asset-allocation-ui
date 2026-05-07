import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, GitCompareArrows, History, Play, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PageHero } from '@/app/components/common/PageHero';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { backtestApi, type RunRecordResponse } from '@/services/backtestApi';
import {
  backtestKeys,
  useAttributionExposure,
  useClosedPositions,
  useReplayTimeline,
  useRolling,
  useRunDetail,
  useRunList,
  useRunSummary,
  useTimeseries,
  useTrades
} from '@/services/backtestHooks';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';
import { BacktestCharts } from '@/features/backtests/components/BacktestCharts';
import { BacktestClosedPositionTable } from '@/features/backtests/components/BacktestClosedPositionTable';
import { BacktestConfigPanel } from '@/features/backtests/components/BacktestConfigPanel';
import { BacktestDiagnosticsPanel } from '@/features/backtests/components/BacktestDiagnosticsPanel';
import { BacktestReplayPanel } from '@/features/backtests/components/BacktestReplayPanel';
import { BacktestRunDossier } from '@/features/backtests/components/BacktestRunDossier';
import {
  BacktestRunFilters,
  BacktestRunRail
} from '@/features/backtests/components/BacktestRunRail';
import { BacktestTradeTable } from '@/features/backtests/components/BacktestTradeTable';
import {
  buildBacktestRunRequest,
  buildDefaultBacktestDraft
} from '@/features/backtests/lib/backtestDraft';
import {
  compactRunLabel,
  formatBps,
  formatPercent,
  statusBadgeVariant
} from '@/features/backtests/lib/backtestPresentation';

type BacktestWorkspaceTab =
  | 'overview'
  | 'performance'
  | 'trades'
  | 'positions'
  | 'replay'
  | 'diagnostics';

const DEFAULT_FILTERS: BacktestRunFilters = {
  query: '',
  status: 'all',
  strategy: '',
  barSize: '',
  benchmark: '',
  costModel: '',
  schemaVersion: '',
  owner: ''
};

function runMatchesFilters(run: RunRecordResponse, filters: BacktestRunFilters): boolean {
  const query = filters.query.trim().toLowerCase();
  const strategy = filters.strategy.trim().toLowerCase();
  const barSize = filters.barSize.trim().toLowerCase();
  const owner = filters.owner.trim().toLowerCase();
  const benchmark = filters.benchmark.trim().toLowerCase();
  const costModel = filters.costModel.trim().toLowerCase();
  const schemaVersion = filters.schemaVersion.trim();
  const haystack = [
    run.run_id,
    run.run_name,
    run.strategy_name,
    run.execution_name,
    run.bar_size,
    run.status
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (filters.status !== 'all' && run.status !== filters.status) return false;
  if (query && !haystack.includes(query)) return false;
  if (strategy && !String(run.strategy_name || '').toLowerCase().includes(strategy)) return false;
  if (barSize && String(run.bar_size || '').toLowerCase() !== barSize) return false;
  if (
    owner &&
    (run.owner || run.submitted_by) &&
    !String(run.owner || run.submitted_by || '').toLowerCase().includes(owner)
  ) {
    return false;
  }
  if (
    benchmark &&
    run.assumptions &&
    !String(run.assumptions?.benchmarkSymbol || '').toLowerCase().includes(benchmark)
  ) {
    return false;
  }
  if (
    costModel &&
    run.assumptions &&
    !String(run.assumptions?.costModel || '').toLowerCase().includes(costModel)
  ) {
    return false;
  }
  if (schemaVersion && String(run.results_schema_version || '') !== schemaVersion) return false;
  return true;
}

export function BacktestWorkspacePage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const strategyParam = searchParams.get('strategy') || '';
  const initialRunId = searchParams.get('run') || '';
  const [filters, setFilters] = useState<BacktestRunFilters>(() => ({
    ...DEFAULT_FILTERS,
    strategy: strategyParam
  }));
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId || null);
  const [activeTab, setActiveTab] = useState<BacktestWorkspaceTab>('overview');
  const [draft, setDraft] = useState(() => buildDefaultBacktestDraft(strategyParam));
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replaySymbol, setReplaySymbol] = useState('');
  const [comparisonRunId, setComparisonRunId] = useState('');

  const listParams = useMemo(
    () => ({
      status: filters.status === 'all' ? undefined : filters.status,
      q: filters.query.trim() || filters.strategy.trim() || undefined,
      limit: 250,
      offset: 0
    }),
    [filters.query, filters.status, filters.strategy]
  );
  const runList = useRunList(listParams);

  const filteredRuns = useMemo(
    () => runList.runs.filter((run) => runMatchesFilters(run, filters)),
    [filters, runList.runs]
  );
  const selectedListRun = filteredRuns.find((run) => run.run_id === selectedRunId) ?? null;

  useEffect(() => {
    if (strategyParam && !filters.strategy) {
      setFilters((current) => ({ ...current, strategy: strategyParam }));
    }
  }, [filters.strategy, strategyParam]);

  useEffect(() => {
    if (!selectedRunId && filteredRuns.length) {
      setSelectedRunId(filteredRuns[0].run_id);
    }
  }, [filteredRuns, selectedRunId]);

  useEffect(() => {
    if (strategyParam) {
      setDraft((current) => ({
        ...current,
        strategyName: current.strategyName || strategyParam
      }));
    }
  }, [strategyParam]);

  const detailQuery = useRunDetail(selectedRunId || undefined);
  const canFetchPublishedResults =
    detailQuery.data?.run.status === 'completed' && Boolean(detailQuery.data?.run.results_ready_at);
  const summaryQuery = useRunSummary(selectedRunId || undefined, {
    enabled: canFetchPublishedResults
  });
  const timeseriesQuery = useTimeseries(selectedRunId || undefined, {
    enabled: canFetchPublishedResults,
    maxPoints: 5000
  });
  const rollingQuery = useRolling(selectedRunId || undefined, 63, {
    enabled: canFetchPublishedResults,
    maxPoints: 5000
  });
  const tradesQuery = useTrades(selectedRunId || undefined, {
    enabled: canFetchPublishedResults,
    limit: 1000,
    offset: 0
  });
  const closedPositionsQuery = useClosedPositions(selectedRunId || undefined, {
    enabled: canFetchPublishedResults,
    limit: 1000,
    offset: 0
  });
  const replayQuery = useReplayTimeline(selectedRunId || undefined, {
    enabled: canFetchPublishedResults,
    limit: 500,
    offset: 0,
    symbol: replaySymbol
  });
  const attributionQuery = useAttributionExposure(selectedRunId || undefined, {
    enabled: canFetchPublishedResults
  });

  useEffect(() => {
    setReplayIndex(0);
    setReplayPlaying(false);
  }, [selectedRunId, replaySymbol, replayQuery.data?.events.length]);

  useEffect(() => {
    const eventCount = replayQuery.data?.events.length ?? 0;
    if (!replayPlaying || eventCount === 0) {
      return;
    }

    const intervalMs = Math.max(250, 1000 / Math.max(0.25, replaySpeed));
    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        const next = current + 1;
        if (next >= eventCount) {
          setReplayPlaying(false);
          return current;
        }
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [replayPlaying, replayQuery.data?.events.length, replaySpeed]);

  const validationMutation = useMutation({
    mutationFn: () => backtestApi.validateRun(buildBacktestRunRequest(draft)),
    onSuccess: () => {
      toast.success('Backtest validation completed');
    },
    onError: (error) => {
      toast.error(`Validation failed: ${formatSystemStatusText(error)}`);
    }
  });

  const runMutation = useMutation({
    mutationFn: () => backtestApi.runBacktest(buildBacktestRunRequest(draft)),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: backtestKeys.all });
      setSelectedRunId(result.run.run_id);
      setActiveTab('overview');
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('run', result.run.run_id);
        if (result.run.strategy_name) {
          next.set('strategy', result.run.strategy_name);
        }
        return next;
      });
      toast.success(result.reusedInflight ? 'Reused inflight backtest run' : 'Backtest run queued');
    },
    onError: (error) => {
      toast.error(`Backtest submission failed: ${formatSystemStatusText(error)}`);
    }
  });

  const comparisonMutation = useMutation({
    mutationFn: () => {
      if (!selectedRunId || !comparisonRunId.trim()) {
        throw new Error('Select a baseline and enter a challenger run id.');
      }
      return backtestApi.compareRuns({
        baselineRunId: selectedRunId,
        challengerRunIds: [comparisonRunId.trim()],
        metricKeys: ['total_return', 'gross_total_return', 'sharpe_ratio', 'max_drawdown', 'cost_drag_bps']
      });
    },
    onError: (error) => {
      toast.error(`Comparison failed: ${formatSystemStatusText(error)}`);
    }
  });

  const selectRun = (runId: string) => {
    setSelectedRunId(runId);
    setActiveTab('overview');
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('run', runId);
      return next;
    });
  };

  const selectedRun = detailQuery.data?.run ?? selectedListRun;
  const heroMetrics = [
    {
      label: 'Runs Loaded',
      value: String(filteredRuns.length),
      detail: `${runList.response?.limit ?? 250} row request window.`,
      icon: <History className="h-4 w-4 text-mcm-teal" />
    },
    {
      label: 'Selected Status',
      value: selectedRun?.status || 'n/a',
      detail: compactRunLabel(selectedRun),
      icon: <ShieldAlert className="h-4 w-4 text-mcm-olive" />
    },
    {
      label: 'Cost Drag',
      value: formatBps(summaryQuery.data?.cost_drag_bps),
      detail: `Net ${formatPercent(summaryQuery.data?.total_return)} after backend-owned costs.`,
      icon: <BarChart3 className="h-4 w-4 text-mcm-mustard" />
    }
  ];

  const renderTab = () => {
    if (activeTab === 'overview') {
      return (
        <BacktestRunDossier
          detail={detailQuery.data}
          summary={summaryQuery.data}
          attribution={attributionQuery.data}
          loading={detailQuery.loading}
          error={detailQuery.error}
        />
      );
    }

    if (activeTab === 'performance') {
      return (
        <BacktestCharts
          timeseries={timeseriesQuery.data}
          rolling={rollingQuery.data}
          loading={timeseriesQuery.loading || rollingQuery.loading}
          error={timeseriesQuery.error || rollingQuery.error}
        />
      );
    }

    if (activeTab === 'trades') {
      return (
        <BacktestTradeTable
          data={tradesQuery.data}
          loading={tradesQuery.loading}
          error={tradesQuery.error}
        />
      );
    }

    if (activeTab === 'positions') {
      return (
        <BacktestClosedPositionTable
          data={closedPositionsQuery.data}
          loading={closedPositionsQuery.loading}
          error={closedPositionsQuery.error}
        />
      );
    }

    if (activeTab === 'replay') {
      const events = replayQuery.data?.events ?? [];
      const currentEvent = events[replayIndex] ?? null;
      return (
        <div className="space-y-4">
          <BacktestReplayPanel
            events={events}
            total={replayQuery.data?.total ?? 0}
            currentIndex={replayIndex}
            playing={replayPlaying}
            speed={replaySpeed}
            symbolFilter={replaySymbol}
            loading={replayQuery.loading}
            error={replayQuery.error}
            warnings={replayQuery.data?.warnings}
            onCurrentIndexChange={setReplayIndex}
            onPlayingChange={setReplayPlaying}
            onSpeedChange={setReplaySpeed}
            onSymbolFilterChange={setReplaySymbol}
          />
          {currentEvent ? (
            <section className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Current Event
                  </div>
                  <h3 className="mt-2 text-lg">{currentEvent.summary}</h3>
                </div>
                <Badge variant={currentEvent.source === 'broker_fill' ? 'default' : 'secondary'}>
                  {currentEvent.source}
                </Badge>
              </div>
              <pre className="mt-4 max-h-[22rem] overflow-auto rounded-xl border border-mcm-walnut/20 bg-mcm-paper/75 p-4 text-xs text-foreground">
                {JSON.stringify(currentEvent.evidence, null, 2)}
              </pre>
            </section>
          ) : null}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <BacktestDiagnosticsPanel
          detail={detailQuery.data}
          validation={validationMutation.data}
          attribution={attributionQuery.data}
          loading={detailQuery.loading || attributionQuery.loading}
          error={detailQuery.error || attributionQuery.error}
        />

        <section className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-cream/60 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="compare-run-id">Challenger run</Label>
              <Input
                id="compare-run-id"
                value={comparisonRunId}
                onChange={(event) => setComparisonRunId(event.target.value)}
                placeholder="run id"
              />
            </div>
            <Button
              type="button"
              onClick={() => comparisonMutation.mutate()}
              disabled={!selectedRunId || !comparisonRunId.trim() || comparisonMutation.isPending}
            >
              <GitCompareArrows className="h-4 w-4" />
              {comparisonMutation.isPending ? 'Comparing...' : 'Compare'}
            </Button>
          </div>
          {comparisonMutation.data ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    comparisonMutation.data.alignment === 'aligned'
                      ? 'default'
                      : comparisonMutation.data.alignment === 'blocked'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {comparisonMutation.data.alignment}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Winners are omitted when assumptions or alignment differ.
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {comparisonMutation.data.metrics.map((metric) => (
                  <div
                    key={metric.metric}
                    className="rounded-xl border border-mcm-walnut/15 bg-mcm-paper/75 p-3 text-sm"
                  >
                    <div className="font-semibold">{metric.label}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Winner {metric.winnerRunId || 'n/a'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    );
  };

  return (
    <div className="page-shell">
      <PageHero
        kicker="Strategy Setup"
        title={
          <span className="flex items-center gap-2">
            <History className="h-6 w-6 text-mcm-teal" />
            Backtesting Workspace
          </span>
        }
        subtitle="Run review, configuration validation, evidence replay, and diagnostics for published backtests."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {selectedRun ? (
              <Badge variant={statusBadgeVariant(selectedRun.status)}>{selectedRun.status}</Badge>
            ) : null}
            <Button asChild variant="outline">
              <Link to="/strategies">Strategies</Link>
            </Button>
            <Button type="button" onClick={() => setActiveTab('replay')} disabled={!selectedRunId}>
              <Play className="h-4 w-4" />
              Replay
            </Button>
          </div>
        }
        metrics={heroMetrics}
      />

      <div className="grid gap-6 2xl:grid-cols-[320px_minmax(0,1fr)_390px]">
        <BacktestRunRail
          runs={filteredRuns}
          selectedRunId={selectedRunId}
          filters={filters}
          loading={runList.loading}
          error={runList.error}
          onFiltersChange={setFilters}
          onSelectRun={selectRun}
          onRefresh={() => runList.refresh()}
        />

        <section className="mcm-panel min-h-[760px] overflow-hidden">
          <div className="border-b border-border/40 px-5 py-4">
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as BacktestWorkspaceTab)}
            >
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="trades">Trades</TabsTrigger>
                <TabsTrigger value="positions">Positions</TabsTrigger>
                <TabsTrigger value="replay">Replay</TabsTrigger>
                <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="p-5">
            {!selectedRunId && !runList.loading ? (
              <StatePanel
                tone="empty"
                title="No Backtest Selected"
                message="Run inventory is empty for the active filter set."
              />
            ) : (
              renderTab()
            )}
          </div>
        </section>

        <div className="space-y-4">
          <BacktestConfigPanel
            draft={draft}
            detail={detailQuery.data}
            validation={validationMutation.data}
            validationError={formatSystemStatusText(validationMutation.error)}
            validatePending={validationMutation.isPending}
            runPending={runMutation.isPending}
            onDraftChange={setDraft}
            onValidate={() => validationMutation.mutate()}
            onRun={() => runMutation.mutate()}
          />
          <BacktestReplayPanel
            events={replayQuery.data?.events ?? []}
            total={replayQuery.data?.total ?? 0}
            currentIndex={replayIndex}
            playing={replayPlaying}
            speed={replaySpeed}
            symbolFilter={replaySymbol}
            loading={replayQuery.loading}
            error={replayQuery.error}
            warnings={replayQuery.data?.warnings}
            onCurrentIndexChange={setReplayIndex}
            onPlayingChange={setReplayPlaying}
            onSpeedChange={setReplaySpeed}
            onSymbolFilterChange={setReplaySymbol}
          />
        </div>
      </div>
    </div>
  );
}

export default BacktestWorkspacePage;
