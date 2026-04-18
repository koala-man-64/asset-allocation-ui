import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis
} from 'recharts';
import { ArrowUpRight, ClipboardList, Scale, ShieldAlert } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { PageLoader } from '@/app/components/common/PageLoader';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from '@/app/components/ui/chart';
import { Input } from '@/app/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { cn } from '@/app/components/ui/utils';
import { BacktestMetricCard } from '@/features/backtests/components/BacktestMetricCard';
import { BacktestStatusBadge } from '@/features/backtests/components/BacktestStatusBadge';
import {
  BacktestWorkspaceStatePanel,
  BacktestWorkspaceTabContent
} from '@/features/backtests/components/BacktestWorkspacePanels';
import {
  BACKTEST_WORKSPACE_TABS,
  type BacktestWorkspaceTab,
  formatMetricBps,
  formatMetricCurrency,
  formatMetricNumber,
  formatMetricPercent,
  formatRunTimestamp,
  hasPublishedResults
} from '@/features/backtests/lib/presentation';
import {
  deriveReviewModel,
  deriveVerdictFromSummary,
  type ReviewModel,
  type ReviewVerdict
} from '@/features/performance-review/lib/reviewModel';
import {
  useClosedPositions,
  useRolling,
  useRollingMulti,
  useRunList,
  useRunStatus,
  useRunSummaries,
  useRunSummary,
  useTimeseries,
  useTimeseriesMulti,
  useTrades
} from '@/services/backtestHooks';
import type { BacktestSummary, RunRecordResponse } from '@/services/backtestApi';

type PrimaryTab = 'compare' | 'strategy' | 'run';
type CompareSort =
  | 'completed-desc'
  | 'total-return-desc'
  | 'sharpe-desc'
  | 'drawdown-asc'
  | 'cost-drag-asc';

type CompareRow = {
  run: RunRecordResponse;
  summary: BacktestSummary | null | undefined;
  verdict: ReviewVerdict;
  totalReturn: number | null | undefined;
  sharpe: number | null | undefined;
  maxDrawdown: number | null | undefined;
  costDrag: number | null | undefined;
};

type ScoredCompareRow = CompareRow & {
  summary: BacktestSummary;
};

const PRIMARY_TABS: Array<{ key: PrimaryTab; label: string; icon: typeof Scale }> = [
  { key: 'compare', label: 'Compare', icon: Scale },
  { key: 'strategy', label: 'Strategy History', icon: ClipboardList },
  { key: 'run', label: 'Run Review', icon: ShieldAlert }
];

const COMPARE_SORT_OPTIONS: Array<{ value: CompareSort; label: string }> = [
  { value: 'completed-desc', label: 'Newest completed' },
  { value: 'total-return-desc', label: 'Net return' },
  { value: 'sharpe-desc', label: 'Sharpe' },
  { value: 'drawdown-asc', label: 'Max drawdown' },
  { value: 'cost-drag-asc', label: 'Cost drag' }
];

function resolvePrimaryTab(pathname: string): PrimaryTab | null {
  const suffix = pathname.replace('/performance-review', '').replace(/^\/+/, '');
  if (!suffix) return null;
  if (suffix.startsWith('strategy')) return 'strategy';
  if (suffix.startsWith('run')) return 'run';
  if (suffix.startsWith('compare')) return 'compare';
  return null;
}

function normalizeSection(value: string | null): BacktestWorkspaceTab {
  if (value === 'risk' || value === 'trades' || value === 'positions') {
    return value;
  }
  return 'overview';
}

function parseStrategyParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeStrategyParam(values: string[]): string | undefined {
  if (!values.length) return undefined;
  return values.join(',');
}

function withinDateRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!value) return false;
  const candidate = new Date(value).getTime();
  if (Number.isNaN(candidate)) return false;
  const fromValue = from ? new Date(from).getTime() : null;
  const toValue = to ? new Date(to).getTime() : null;
  if (fromValue !== null && candidate < fromValue) return false;
  if (toValue !== null && candidate > toValue + 24 * 60 * 60 * 1000 - 1) return false;
  return true;
}

function buildSearchParams(
  searchParams: URLSearchParams,
  updates: Record<string, string | undefined>
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  Object.entries(updates).forEach(([key, value]) => {
    if (!value) {
      next.delete(key);
      return;
    }
    next.set(key, value);
  });
  return next;
}

function getVerdictColor(verdict: ReviewVerdict): string {
  if (verdict === 'Institutional') return '#008080';
  if (verdict === 'Workable') return '#6f6600';
  if (verdict === 'Fragile') return '#e1ad01';
  return '#b42318';
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio));
  return sorted[index];
}

function averageRollingTurnover(
  points: Array<{ turnover_sum?: number | null }> | undefined
): number | null {
  const turnoverValues = (points || [])
    .map((point) => point.turnover_sum)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (!turnoverValues.length) {
    return null;
  }

  return turnoverValues.reduce((sum, value) => sum + value, 0) / turnoverValues.length;
}

function normalizeRunLabel(run: Pick<RunRecordResponse, 'run_name' | 'run_id'>): string {
  return run.run_name || run.run_id;
}

function VerdictBadge({ verdict, detail }: { verdict: ReviewVerdict; detail?: string }) {
  return (
    <div
      className="rounded-[1.5rem] border-2 px-4 py-3 shadow-[6px_6px_0px_0px_rgba(119,63,26,0.1)]"
      style={{
        borderColor: getVerdictColor(verdict),
        background: `linear-gradient(135deg, rgba(255,247,233,0.98), ${getVerdictColor(verdict)}22)`
      }}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
        Desk Verdict
      </div>
      <div className="mt-2 font-display text-2xl text-foreground">{verdict}</div>
      {detail ? <div className="mt-2 text-sm text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function ScorecardPanel({ review }: { review: ReviewModel }) {
  return (
    <section className="mcm-panel overflow-hidden">
      <div className="border-b border-border/40 px-5 py-5">
        <h2 className="font-display text-xl text-foreground">Desk Scorecard</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Score the process, not the headline P&amp;L. Proxy rows are marked.
        </p>
      </div>
      <div className="overflow-x-auto p-5">
        <Table>
          <TableHeader>
            <TableRow className="hover:[&>td]:bg-transparent">
              <TableHead>Category</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Review Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {review.scorecard.map((row) => (
              <TableRow key={row.label}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{row.label}</span>
                    {row.proxy ? <Badge variant="outline">Proxy</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="inline-flex min-w-10 items-center justify-center rounded-full border border-mcm-walnut/25 bg-mcm-paper/85 px-3 py-1 font-display text-lg">
                    {row.score}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.detail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function compareRowsBySort(rows: ScoredCompareRow[], sort: CompareSort) {
  return [...rows].sort((left, right) => {
    if (sort === 'completed-desc') {
      return (
        new Date(right.run.completed_at || right.run.submitted_at).getTime() -
        new Date(left.run.completed_at || left.run.submitted_at).getTime()
      );
    }
    if (sort === 'total-return-desc') {
      return Number(right.totalReturn ?? -Infinity) - Number(left.totalReturn ?? -Infinity);
    }
    if (sort === 'sharpe-desc') {
      return Number(right.sharpe ?? -Infinity) - Number(left.sharpe ?? -Infinity);
    }
    if (sort === 'drawdown-asc') {
      return Math.abs(Number(left.maxDrawdown ?? Infinity)) - Math.abs(Number(right.maxDrawdown ?? Infinity));
    }
    return Number(left.costDrag ?? Infinity) - Number(right.costDrag ?? Infinity);
  });
}

function buildHistoryOverlay(
  runs: RunRecordResponse[],
  timeseriesByRunId: Record<string, { points: Array<{ portfolio_value: number }> } | undefined>
) {
  const selectedRuns = runs.slice(0, 3);
  const series = selectedRuns
    .map((run) => {
      const points = timeseriesByRunId[run.run_id]?.points || [];
      if (!points.length || !points[0]?.portfolio_value) {
        return null;
      }

      const base = points[0].portfolio_value;
      return {
        runId: run.run_id,
        label: normalizeRunLabel(run),
        points: points.slice(0, 180).map((point, index) => ({
          step: index + 1,
          value: point.portfolio_value / base - 1
        }))
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const maxLength = Math.max(0, ...series.map((item) => item.points.length));
  return Array.from({ length: maxLength }, (_, index) => {
    const row: Record<string, number> = { step: index + 1 };
    series.forEach((item) => {
      const point = item.points[index];
      if (point) {
        row[item.runId] = point.value;
      }
    });
    return row;
  });
}

function RunReviewSummary({
  review,
  latestCompletedRun
}: {
  review: ReviewModel;
  latestCompletedRun: RunRecordResponse | null;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.1fr)]">
      <VerdictBadge verdict={review.verdict} detail={review.verdictDetail} />
      <section className="mcm-panel overflow-hidden">
        <div className="border-b border-border/40 px-5 py-5">
          <h2 className="font-display text-xl text-foreground">Corrective Actions</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Tighten the process before treating this run as scalable.
          </p>
        </div>
        <div className="space-y-3 p-5">
          {review.correctiveActions.map((action) => (
            <div
              key={action}
              className="rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-cream/70 px-4 py-3 text-sm text-foreground"
            >
              {action}
            </div>
          ))}
          {!review.correctiveActions.length && latestCompletedRun ? (
            <div className="rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-cream/70 px-4 py-3 text-sm text-foreground">
              The run is broadly controlled. Keep review cadence focused on stability and attribution.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function PerformanceReviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [compareSearchText, setCompareSearchText] = useState('');
  const [runWindowDays, setRunWindowDays] = useState(63);
  const deferredCompareSearchText = useDeferredValue(compareSearchText);

  const activePrimaryTab = resolvePrimaryTab(location.pathname);
  if (!activePrimaryTab) {
    return <Navigate to="/performance-review/compare" replace />;
  }

  const updateQuery = (updates: Record<string, string | undefined>, replace: boolean = false) => {
    setSearchParams(buildSearchParams(searchParams, updates), { replace });
  };

  const navigateTab = (
    tab: PrimaryTab,
    updates: Record<string, string | undefined> = {},
    replace: boolean = false
  ) => {
    const nextSearch = buildSearchParams(searchParams, updates);
    navigate(
      {
        pathname: `/performance-review/${tab}`,
        search: nextSearch.toString() ? `?${nextSearch.toString()}` : ''
      },
      { replace }
    );
  };

  const runListQuery = useRunList({ status: 'completed', limit: 200 });
  const completedRuns = runListQuery.runs;
  const strategyOptions = useMemo(
    () =>
      Array.from(
        new Set(completedRuns.map((run) => run.strategy_name).filter(Boolean) as string[])
      ).sort((left, right) => left.localeCompare(right)),
    [completedRuns]
  );

  const selectedStrategies = parseStrategyParam(searchParams.get('strategy'));
  const cadenceFilter = searchParams.get('cadence') || 'all';
  const compareSort = (searchParams.get('sort') as CompareSort) || 'completed-desc';
  const fromDate = searchParams.get('from') || '';
  const toDate = searchParams.get('to') || '';
  const verdictFilter = searchParams.get('verdict') || 'all';
  const selectedRunId = searchParams.get('runId') || completedRuns[0]?.run_id || '';
  const activeSection = normalizeSection(searchParams.get('section'));
  const effectiveHistoryStrategy = selectedStrategies[0] || strategyOptions[0] || '';

  useEffect(() => {
    if (activePrimaryTab === 'strategy' && effectiveHistoryStrategy && !selectedStrategies.length) {
      updateQuery({ strategy: effectiveHistoryStrategy }, true);
    }
  }, [activePrimaryTab, effectiveHistoryStrategy, selectedStrategies.length]);

  useEffect(() => {
    if (activePrimaryTab === 'run') {
      const updates: Record<string, string | undefined> = {};
      if (!selectedRunId && completedRuns[0]?.run_id) {
        updates.runId = completedRuns[0].run_id;
      }
      if (!searchParams.get('section')) {
        updates.section = 'overview';
      }
      if (Object.keys(updates).length > 0) {
        updateQuery(updates, true);
      }
    }
  }, [activePrimaryTab, completedRuns, searchParams, selectedRunId]);

  const filteredCompareRuns = useMemo(() => {
    const normalizedSearch = deferredCompareSearchText.trim().toLowerCase();
    return completedRuns.filter((run) => {
      const matchesSearch =
        !normalizedSearch ||
        normalizeRunLabel(run).toLowerCase().includes(normalizedSearch) ||
        run.run_id.toLowerCase().includes(normalizedSearch) ||
        (run.strategy_name || '').toLowerCase().includes(normalizedSearch);
      const matchesStrategy =
        !selectedStrategies.length ||
        (run.strategy_name ? selectedStrategies.includes(run.strategy_name) : false);
      const matchesCadence = cadenceFilter === 'all' || run.bar_size === cadenceFilter;
      const matchesDate =
        (!fromDate && !toDate) || withinDateRange(run.completed_at || run.submitted_at, fromDate, toDate);
      return matchesSearch && matchesStrategy && matchesCadence && matchesDate;
    });
  }, [
    cadenceFilter,
    completedRuns,
    deferredCompareSearchText,
    fromDate,
    selectedStrategies,
    toDate
  ]);

  const compareCandidateRuns = useMemo(
    () =>
      [...filteredCompareRuns]
        .sort(
          (left, right) =>
            new Date(right.completed_at || right.submitted_at).getTime() -
            new Date(left.completed_at || left.submitted_at).getTime()
        )
        .slice(0, 30),
    [filteredCompareRuns]
  );

  const compareSummariesQuery = useRunSummaries(
    compareCandidateRuns.map((run) => run.run_id),
    { enabled: activePrimaryTab === 'compare' }
  );

  const compareCandidateRows = useMemo<CompareRow[]>(
    () =>
      compareCandidateRuns.map((run) => {
        const summary = compareSummariesQuery.summaries[run.run_id];
        return {
          run,
          summary,
          verdict: summary ? deriveVerdictFromSummary(summary) : 'Rejected',
          totalReturn: summary?.total_return,
          sharpe: summary?.sharpe_ratio,
          maxDrawdown: summary?.max_drawdown,
          costDrag: summary?.cost_drag_bps
        };
      }),
    [compareCandidateRuns, compareSummariesQuery.summaries]
  );

  const compareScoredRows = useMemo(
    () =>
      compareCandidateRows.filter(
        (row): row is ScoredCompareRow => row.summary !== undefined && row.summary !== null
      ),
    [compareCandidateRows]
  );

  const comparePublishingCount = compareCandidateRows.length - compareScoredRows.length;

  const compareRows = useMemo(
    () =>
      compareRowsBySort(
        compareScoredRows.filter((row) => verdictFilter === 'all' || row.verdict === verdictFilter),
        compareSort
      ),
    [compareScoredRows, compareSort, verdictFilter]
  );

  const compareVerdictCounts = useMemo(() => {
    const counts: Record<ReviewVerdict, number> = {
      Institutional: 0,
      Workable: 0,
      Fragile: 0,
      Rejected: 0
    };
    compareRows.forEach((row) => {
      counts[row.verdict] += 1;
    });
    return counts;
  }, [compareRows]);

  const strategyRuns = useMemo(
    () =>
      completedRuns
        .filter((run) => run.strategy_name === effectiveHistoryStrategy)
        .sort(
          (left, right) =>
            new Date(right.completed_at || right.submitted_at).getTime() -
            new Date(left.completed_at || left.submitted_at).getTime()
        ),
    [completedRuns, effectiveHistoryStrategy]
  );

  const historySummariesQuery = useRunSummaries(
    strategyRuns.map((run) => run.run_id),
    { enabled: activePrimaryTab === 'strategy' && strategyRuns.length > 0 }
  );
  const historyOverlayRuns = strategyRuns.slice(0, 3);
  const historyTimeseriesQuery = useTimeseriesMulti(
    historyOverlayRuns.map((run) => run.run_id),
    { enabled: activePrimaryTab === 'strategy' && historyOverlayRuns.length > 0, maxPoints: 3000 }
  );

  const historyRows = useMemo(
    () =>
      strategyRuns.map((run) => {
        const summary = historySummariesQuery.summaries[run.run_id];
        return {
          run,
          summary,
          verdict: summary ? deriveVerdictFromSummary(summary) : 'Rejected'
        };
      }),
    [historySummariesQuery.summaries, strategyRuns]
  );

  const historyScoredRows = useMemo(
    () =>
      historyRows.filter(
        (row): row is typeof row & { summary: BacktestSummary } =>
          row.summary !== undefined && row.summary !== null
      ),
    [historyRows]
  );
  const historySummaryUnavailable =
    strategyRuns.length > 0 && !historySummariesQuery.loading && !historyRows[0]?.summary;
  const latestHistoryRow = historyScoredRows[0];
  const priorHistoryRows = historyScoredRows.slice(1);
  const priorMedian = useMemo(
    () => ({
      totalReturn: median(
        priorHistoryRows
          .map((row) => row.summary?.total_return)
          .filter((value): value is number => typeof value === 'number')
      ),
      sharpe: median(
        priorHistoryRows
          .map((row) => row.summary?.sharpe_ratio)
          .filter((value): value is number => typeof value === 'number')
      ),
      maxDrawdown: median(
        priorHistoryRows
          .map((row) => row.summary?.max_drawdown)
          .filter((value): value is number => typeof value === 'number')
      ),
      costDrag: median(
        priorHistoryRows
          .map((row) => row.summary?.cost_drag_bps)
          .filter((value): value is number => typeof value === 'number')
      )
    }),
    [priorHistoryRows]
  );

  const historyOverlayData = useMemo(
    () => buildHistoryOverlay(historyOverlayRuns, historyTimeseriesQuery.timeseriesByRunId),
    [historyOverlayRuns, historyTimeseriesQuery.timeseriesByRunId]
  );

  const runStatusQuery = useRunStatus(selectedRunId, {
    enabled: activePrimaryTab === 'run' && Boolean(selectedRunId)
  });
  const selectedRun = runStatusQuery.data;
  const runAnalyticsReady = hasPublishedResults(selectedRun);
  const runSummaryQuery = useRunSummary(selectedRunId, {
    enabled: activePrimaryTab === 'run' && runAnalyticsReady
  });
  const runTimeseriesQuery = useTimeseries(selectedRunId, {
    enabled: activePrimaryTab === 'run' && runAnalyticsReady,
    maxPoints: 3000
  });
  const runRollingQuery = useRolling(selectedRunId, runWindowDays, {
    enabled: activePrimaryTab === 'run' && runAnalyticsReady,
    maxPoints: 3000
  });
  const runTradesQuery = useTrades(selectedRunId, {
    enabled: activePrimaryTab === 'run' && runAnalyticsReady,
    limit: 2000,
    offset: 0
  });
  const runPositionsQuery = useClosedPositions(selectedRunId, {
    enabled: activePrimaryTab === 'run' && runAnalyticsReady,
    limit: 2000,
    offset: 0
  });
  const benchmarkRunIds = useMemo(
    () =>
      Array.from(
        new Set(
          [
            selectedRunId,
            ...(compareCandidateRuns.length
              ? compareCandidateRuns.map((run) => run.run_id)
              : completedRuns.slice(0, 30).map((run) => run.run_id))
          ].filter(Boolean)
        )
      ) as string[],
    [compareCandidateRuns, completedRuns, selectedRunId]
  );
  const benchmarkRollingQuery = useRollingMulti(benchmarkRunIds, runWindowDays, {
    enabled: activePrimaryTab === 'run' && benchmarkRunIds.length > 0,
    maxPoints: 3000
  });
  const turnoverUpperQuartile = useMemo(
    () =>
      percentile(
        benchmarkRunIds
          .map((runId) =>
            averageRollingTurnover(benchmarkRollingQuery.rollingByRunId[runId]?.points)
          )
          .filter((value): value is number => value !== null),
        0.75
      ),
    [benchmarkRollingQuery.rollingByRunId, benchmarkRunIds]
  );

  const runReview = useMemo(
    () =>
      deriveReviewModel({
        summary: runSummaryQuery.data,
        rolling: runRollingQuery.data?.points || [],
        trades: runTradesQuery.data?.trades || [],
        positions: runPositionsQuery.data?.positions || [],
        timeseries: runTimeseriesQuery.data?.points || [],
        turnoverUpperQuartile
      }),
    [
      runPositionsQuery.data?.positions,
      runRollingQuery.data?.points,
      runSummaryQuery.data,
      runTimeseriesQuery.data?.points,
      runTradesQuery.data?.trades,
      turnoverUpperQuartile
    ]
  );

  const performanceReviewError =
    compareSummariesQuery.error ||
    historySummariesQuery.error ||
    historyTimeseriesQuery.error ||
    runStatusQuery.error ||
    runSummaryQuery.error ||
    runTimeseriesQuery.error ||
    runRollingQuery.error ||
    benchmarkRollingQuery.error ||
    runTradesQuery.error ||
    runPositionsQuery.error;

  if (runListQuery.loading && !completedRuns.length) {
    return <PageLoader text="Loading performance review..." className="h-[420px]" />;
  }

  return (
    <div className="page-shell">
      <div className="page-header-row gap-6">
        <div className="page-header">
          <p className="page-kicker">Performance Review</p>
          <h1 className="page-title">Strategy Performance Review Board</h1>
          <p className="page-subtitle">
            Rank the frozen run ledger, inspect one strategy through time, or drill into a single
            run with desk-grade review criteria.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4 text-sm text-muted-foreground">
          {completedRuns.length} completed runs loaded for review.
        </div>
      </div>

      <section className="mcm-panel overflow-hidden">
        <div className="border-b border-border/40 bg-[linear-gradient(135deg,rgba(255,247,233,0.98),rgba(0,128,128,0.08))] px-6 py-5">
          <div className="flex flex-wrap gap-2">
            {PRIMARY_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activePrimaryTab === tab.key;
              return (
                <Button
                  key={tab.key}
                  variant={isActive ? 'secondary' : 'outline'}
                  className={cn(isActive && 'shadow-[3px_3px_0px_0px_rgba(119,63,26,0.15)]')}
                  onClick={() => navigateTab(tab.key)}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-6 p-6">
          {performanceReviewError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {performanceReviewError}
            </div>
          ) : null}
          {activePrimaryTab === 'compare' ? (
            <>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
                <section className="mcm-panel overflow-hidden">
                  <div className="border-b border-border/40 px-5 py-5">
                    <h2 className="font-display text-xl text-foreground">Review Filters</h2>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      <label className="grid gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Search
                        </span>
                        <Input
                          value={compareSearchText}
                          onChange={(event) => setCompareSearchText(event.target.value)}
                          placeholder="Run, id, or strategy"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Cadence
                        </span>
                        <select
                          value={cadenceFilter}
                          onChange={(event) =>
                            updateQuery({
                              cadence: event.target.value === 'all' ? undefined : event.target.value
                            })
                          }
                          className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
                        >
                          <option value="all">All cadences</option>
                          {Array.from(
                            new Set(
                              completedRuns.map((run) => run.bar_size).filter(Boolean) as string[]
                            )
                          ).map((barSize) => (
                            <option key={barSize} value={barSize}>
                              {barSize}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Verdict
                        </span>
                        <select
                          value={verdictFilter}
                          onChange={(event) =>
                            updateQuery({
                              verdict: event.target.value === 'all' ? undefined : event.target.value
                            })
                          }
                          className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
                        >
                          <option value="all">All verdicts</option>
                          {(['Institutional', 'Workable', 'Fragile', 'Rejected'] as ReviewVerdict[]).map((verdict) => (
                            <option key={verdict} value={verdict}>
                              {verdict}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          From
                        </span>
                        <Input
                          type="date"
                          value={fromDate}
                          onChange={(event) => updateQuery({ from: event.target.value || undefined })}
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          To
                        </span>
                        <Input
                          type="date"
                          value={toDate}
                          onChange={(event) => updateQuery({ to: event.target.value || undefined })}
                        />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                        Strategy Filter
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {strategyOptions.map((strategyName) => {
                          const selected = selectedStrategies.includes(strategyName);
                          return (
                            <Button
                              key={strategyName}
                              variant={selected ? 'secondary' : 'outline'}
                              onClick={() => {
                                const nextStrategies = selected
                                  ? selectedStrategies.filter((value) => value !== strategyName)
                                  : [...selectedStrategies, strategyName];
                                updateQuery({ strategy: serializeStrategyParam(nextStrategies) });
                              }}
                            >
                              {strategyName}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="mcm-panel overflow-hidden">
                  <div className="border-b border-border/40 px-5 py-5">
                    <h2 className="font-display text-xl text-foreground">Verdict Mix</h2>
                  </div>
                  <div className="grid gap-4 p-5 md:grid-cols-2">
                    {(['Institutional', 'Workable', 'Fragile', 'Rejected'] as ReviewVerdict[]).map((verdict) => (
                      <BacktestMetricCard
                        key={verdict}
                        label={verdict}
                        value={`${compareVerdictCounts[verdict]}`}
                        detail="Runs in the current filtered compare set."
                        emphasis={verdict === 'Institutional' ? 'accent' : 'default'}
                      />
                    ))}
                  </div>
                </section>
              </div>

              {compareSummariesQuery.loading && compareCandidateRuns.length > 0 && !compareScoredRows.length ? (
                <PageLoader text="Loading compare summaries..." className="h-[320px]" />
              ) : compareScoredRows.length === 0 && compareCandidateRuns.length > 0 ? (
                <div className="rounded-[1.7rem] border-2 border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-8 text-sm text-muted-foreground">
                  Summary unavailable while results are still publishing.
                </div>
              ) : compareRows.length === 0 ? (
                <div className="rounded-[1.7rem] border-2 border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-8 text-sm text-muted-foreground">
                  No completed runs to score.
                </div>
              ) : (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
                  <section className="mcm-panel overflow-hidden">
                    <div className="border-b border-border/40 px-5 py-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="font-display text-xl text-foreground">League Table</h2>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Sorted on the latest 30 completed runs after filters.
                          </p>
                          {comparePublishingCount > 0 ? (
                            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                              {comparePublishingCount} run
                              {comparePublishingCount === 1 ? '' : 's'} excluded while summaries
                              publish.
                            </p>
                          ) : null}
                        </div>
                        <select
                          value={compareSort}
                          onChange={(event) => updateQuery({ sort: event.target.value })}
                          className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
                        >
                          {COMPARE_SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="overflow-x-auto p-5">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:[&>td]:bg-transparent">
                            <TableHead>Run</TableHead>
                            <TableHead>Strategy</TableHead>
                            <TableHead>Verdict</TableHead>
                            <TableHead>Net Return</TableHead>
                            <TableHead>Sharpe</TableHead>
                            <TableHead>Max DD</TableHead>
                            <TableHead>Cost Drag</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {compareRows.map((row) => (
                            <TableRow
                              key={row.run.run_id}
                              className="cursor-pointer"
                              onClick={() =>
                                navigateTab('run', { runId: row.run.run_id, section: 'overview' })
                              }
                            >
                              <TableCell>
                                <div className="font-display text-base text-foreground">
                                  {normalizeRunLabel(row.run)}
                                </div>
                                <div className="text-xs text-muted-foreground">{row.run.run_id}</div>
                              </TableCell>
                              <TableCell>{row.run.strategy_name || 'Unavailable'}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  style={{
                                    borderColor: getVerdictColor(row.verdict),
                                    color: getVerdictColor(row.verdict)
                                  }}
                                >
                                  {row.verdict}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatMetricPercent(row.summary?.total_return)}</TableCell>
                              <TableCell>{formatMetricNumber(row.summary?.sharpe_ratio)}</TableCell>
                              <TableCell>{formatMetricPercent(row.summary?.max_drawdown)}</TableCell>
                              <TableCell>{formatMetricBps(row.summary?.cost_drag_bps)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </section>

                  <section className="mcm-panel overflow-hidden">
                    <div className="border-b border-border/40 px-5 py-5">
                      <h2 className="font-display text-xl text-foreground">Return vs Drawdown</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Better runs should sit higher and further left.
                      </p>
                    </div>
                    <div className="p-5">
                      <ChartContainer
                        className="h-[360px] w-full"
                        config={{
                          totalReturnPct: { label: 'Net return', color: 'var(--color-mcm-teal)' }
                        }}
                      >
                        <ScatterChart margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            type="number"
                            dataKey="maxDrawdownPct"
                            name="Max drawdown"
                            tickFormatter={(value) => `${value}%`}
                          />
                          <YAxis
                            type="number"
                            dataKey="totalReturnPct"
                            name="Net return"
                            tickFormatter={(value) => `${value}%`}
                          />
                          <ChartTooltip
                            content={({ active, payload }) => {
                              const point = payload?.[0]?.payload as
                                | {
                                    label: string;
                                    strategy: string;
                                    verdict: ReviewVerdict;
                                    totalReturnPct: number;
                                    maxDrawdownPct: number;
                                  }
                                | undefined;
                              if (!active || !point) return null;
                              return (
                                <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                                  <div className="font-medium">{point.label}</div>
                                  <div className="mt-1 text-muted-foreground">{point.strategy}</div>
                                  <div className="mt-2">Return {point.totalReturnPct.toFixed(1)}%</div>
                                  <div>Drawdown {point.maxDrawdownPct.toFixed(1)}%</div>
                                  <div>Verdict {point.verdict}</div>
                                </div>
                              );
                            }}
                          />
                          <Scatter
                            data={compareRows
                              .filter(
                                (row) =>
                                  row.summary?.total_return !== undefined &&
                                  row.summary?.max_drawdown !== undefined
                              )
                              .map((row) => ({
                                label: normalizeRunLabel(row.run),
                                strategy: row.run.strategy_name || 'Unavailable',
                                verdict: row.verdict,
                                totalReturnPct: Number(
                                  ((row.summary?.total_return || 0) * 100).toFixed(2)
                                ),
                                maxDrawdownPct: Number(
                                  Math.abs((row.summary?.max_drawdown || 0) * 100).toFixed(2)
                                )
                              }))}
                          >
                            {compareRows
                              .filter(
                                (row) =>
                                  row.summary?.total_return !== undefined &&
                                  row.summary?.max_drawdown !== undefined
                              )
                              .map((row) => (
                                <Cell key={row.run.run_id} fill={getVerdictColor(row.verdict)} />
                              ))}
                          </Scatter>
                        </ScatterChart>
                      </ChartContainer>
                    </div>
                  </section>
                </div>
              )}
            </>
          ) : null}
          {activePrimaryTab === 'strategy' ? (
            !effectiveHistoryStrategy || strategyRuns.length === 0 ? (
              <div className="rounded-[1.7rem] border-2 border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-8 text-sm text-muted-foreground">
                No historical runs for this strategy.
              </div>
            ) : historySummariesQuery.loading && !historyScoredRows.length ? (
              <PageLoader text="Loading strategy history..." className="h-[320px]" />
            ) : historySummaryUnavailable ? (
              <div className="rounded-[1.7rem] border-2 border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-8 text-sm text-muted-foreground">
                Summary unavailable while results are still publishing.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <label className="grid gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                      Strategy
                    </span>
                    <select
                      value={effectiveHistoryStrategy}
                      onChange={(event) => updateQuery({ strategy: event.target.value })}
                      className="h-11 min-w-[260px] rounded-xl border border-input bg-background px-3 text-sm"
                    >
                      {strategyOptions.map((strategyName) => (
                        <option key={strategyName} value={strategyName}>
                          {strategyName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="text-sm text-muted-foreground">
                    Exact match only. `alpha` does not include `alpha-plus`.
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <BacktestMetricCard
                    label="Latest Run"
                    value={formatMetricPercent(latestHistoryRow?.summary?.total_return)}
                    detail={`Net return for ${normalizeRunLabel(latestHistoryRow?.run || { run_id: '', run_name: '' })}.`}
                    emphasis="accent"
                  />
                  <BacktestMetricCard
                    label="Sharpe vs Median"
                    value={
                      latestHistoryRow?.summary?.sharpe_ratio !== undefined && priorMedian.sharpe !== null
                        ? `${(latestHistoryRow.summary.sharpe_ratio - priorMedian.sharpe).toFixed(2)}`
                        : formatMetricNumber(latestHistoryRow?.summary?.sharpe_ratio)
                    }
                    detail="Delta versus the prior-run median when history exists."
                  />
                  <BacktestMetricCard
                    label="Drawdown vs Median"
                    value={
                      latestHistoryRow?.summary?.max_drawdown !== undefined && priorMedian.maxDrawdown !== null
                        ? formatMetricPercent(
                            latestHistoryRow.summary.max_drawdown - priorMedian.maxDrawdown
                          )
                        : formatMetricPercent(latestHistoryRow?.summary?.max_drawdown)
                    }
                    detail="Negative is better on this card."
                  />
                  <BacktestMetricCard
                    label="Cost Drag vs Median"
                    value={
                      latestHistoryRow?.summary?.cost_drag_bps !== undefined && priorMedian.costDrag !== null
                        ? `${(latestHistoryRow.summary.cost_drag_bps - priorMedian.costDrag).toFixed(1)} bps`
                        : formatMetricBps(latestHistoryRow?.summary?.cost_drag_bps)
                    }
                    detail="Implementation drag versus the prior-run median."
                  />
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.85fr)]">
                  <section className="mcm-panel overflow-hidden">
                    <div className="border-b border-border/40 px-5 py-5">
                      <h2 className="font-display text-xl text-foreground">Normalized Equity Overlay</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Latest three completed runs, aligned by bar index.
                      </p>
                    </div>
                    <div className="p-5">
                      <ChartContainer
                        className="h-[360px] w-full"
                        config={Object.fromEntries(
                          historyOverlayRuns.map((run, index) => [
                            run.run_id,
                            {
                              label: normalizeRunLabel(run),
                              color: ['#008080', '#6f6600', '#e1ad01'][index] || '#b36a2d'
                            }
                          ])
                        )}
                      >
                        <LineChart
                          data={historyOverlayData}
                          margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="step" />
                          <YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                          <ChartTooltip
                            content={({ active, payload, label, coordinate, accessibilityLayer, activeIndex }) => (
                              <ChartTooltipContent
                                active={active}
                                payload={payload}
                                label={label}
                                coordinate={coordinate}
                                accessibilityLayer={accessibilityLayer}
                                activeIndex={activeIndex}
                                formatter={(value) => formatMetricPercent(Number(value), 2)}
                                labelFormatter={(tooltipLabel) => `Bar ${tooltipLabel}`}
                              />
                            )}
                          />
                          <ChartLegend content={<ChartLegendContent />} />
                          {historyOverlayRuns.map((run) => (
                            <Line
                              key={run.run_id}
                              type="monotone"
                              dataKey={run.run_id}
                              stroke={`var(--color-${run.run_id})`}
                              dot={false}
                              strokeWidth={2}
                            />
                          ))}
                        </LineChart>
                      </ChartContainer>
                    </div>
                  </section>

                  <section className="mcm-panel overflow-hidden">
                    <div className="border-b border-border/40 px-5 py-5">
                      <h2 className="font-display text-xl text-foreground">Latest Verdict</h2>
                    </div>
                    <div className="p-5">
                      <VerdictBadge
                        verdict={latestHistoryRow?.verdict || 'Rejected'}
                        detail={
                          latestHistoryRow?.summary
                            ? deriveReviewModel({ summary: latestHistoryRow.summary }).verdictDetail
                            : 'No summary loaded.'
                        }
                      />
                    </div>
                  </section>
                </div>

                <section className="mcm-panel overflow-hidden">
                  <div className="border-b border-border/40 px-5 py-5">
                    <h2 className="font-display text-xl text-foreground">Run History</h2>
                  </div>
                  <div className="overflow-x-auto p-5">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:[&>td]:bg-transparent">
                          <TableHead>Run</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Verdict</TableHead>
                          <TableHead>Net Return</TableHead>
                          <TableHead>Sharpe</TableHead>
                          <TableHead>Max DD</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyScoredRows.map((row) => (
                          <TableRow
                            key={row.run.run_id}
                            className="cursor-pointer"
                            onClick={() =>
                              navigateTab('run', { runId: row.run.run_id, section: 'overview' })
                            }
                          >
                            <TableCell>
                              <div className="font-display text-base text-foreground">
                                {normalizeRunLabel(row.run)}
                              </div>
                              <div className="text-xs text-muted-foreground">{row.run.run_id}</div>
                            </TableCell>
                            <TableCell>{formatRunTimestamp(row.run.completed_at)}</TableCell>
                            <TableCell>{row.verdict}</TableCell>
                            <TableCell>{formatMetricPercent(row.summary?.total_return)}</TableCell>
                            <TableCell>{formatMetricNumber(row.summary?.sharpe_ratio)}</TableCell>
                            <TableCell>{formatMetricPercent(row.summary?.max_drawdown)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              </>
            )
          ) : null}
          {activePrimaryTab === 'run' ? (
            !selectedRunId ? (
              <div className="rounded-[1.7rem] border-2 border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-8 text-sm text-muted-foreground">
                No completed runs to score.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <label className="grid gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                      Run
                    </span>
                    <select
                      value={selectedRunId}
                      onChange={(event) => updateQuery({ runId: event.target.value })}
                      className="h-11 min-w-[320px] rounded-xl border border-input bg-background px-3 text-sm"
                    >
                      {completedRuns.map((run) => (
                        <option key={run.run_id} value={run.run_id}>
                          {normalizeRunLabel(run)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedRun ? (
                    <Button asChild variant="outline">
                      <Link to={`/backtests/${selectedRun.run_id}`}>
                        Open Workspace
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                </div>

                {runStatusQuery.loading ? (
                  <PageLoader text="Loading selected run..." className="h-[320px]" />
                ) : !selectedRun ? (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    Run not found.
                  </div>
                ) : runAnalyticsReady && runSummaryQuery.loading && !runSummaryQuery.data ? (
                  <PageLoader text="Loading run review..." className="h-[320px]" />
                ) : (
                  <>
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.78fr)]">
                      <section className="mcm-panel overflow-hidden">
                        <div className="border-b border-border/40 px-5 py-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <BacktestStatusBadge run={selectedRun} />
                            {selectedRun.bar_size ? (
                              <Badge variant="outline">{selectedRun.bar_size}</Badge>
                            ) : null}
                          </div>
                          <div className="mt-4">
                            <p className="page-kicker">Run Review</p>
                            <h2 className="font-display text-3xl text-foreground">
                              {normalizeRunLabel(selectedRun)}
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {selectedRun.strategy_name || 'Strategy unavailable'} - completed{' '}
                              {formatRunTimestamp(selectedRun.completed_at)}
                            </p>
                          </div>
                        </div>
                        <div className="p-5">
                          <RunReviewSummary review={runReview} latestCompletedRun={completedRuns[0] || null} />
                        </div>
                      </section>
                      <ScorecardPanel review={runReview} />
                    </div>

                    <section className="mcm-panel overflow-hidden">
                      <div className="border-b border-border/40 px-5 py-5">
                        <h2 className="font-display text-xl text-foreground">Missing Evidence</h2>
                      </div>
                      <div className="grid gap-3 p-5 md:grid-cols-2">
                        {runReview.missingEvidence.map((item) => (
                          <div
                            key={item}
                            className="rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-cream/70 px-4 py-3 text-sm text-muted-foreground"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </section>

                    <div className="flex flex-wrap gap-2">
                      {BACKTEST_WORKSPACE_TABS.map((tab) => (
                        <Button
                          key={tab.key}
                          variant={activeSection === tab.key ? 'secondary' : 'outline'}
                          className={cn(
                            activeSection === tab.key &&
                              'shadow-[3px_3px_0px_0px_rgba(119,63,26,0.15)]'
                          )}
                          onClick={() => updateQuery({ section: tab.key })}
                        >
                          {tab.label}
                        </Button>
                      ))}
                    </div>

                    {selectedRun.status === 'failed' ? (
                      <BacktestWorkspaceStatePanel
                        title="Run failed"
                        description="The selected run did not complete, so the review board cannot score the portfolio surface."
                        detail={selectedRun.error || 'Inspect the execution logs for the failure details.'}
                        icon={<ShieldAlert className="h-5 w-5" />}
                      />
                    ) : !runAnalyticsReady ? (
                      <BacktestWorkspaceStatePanel
                        title="Results publishing"
                        description="Summary unavailable while results are still publishing."
                        detail={
                          selectedRun.completed_at
                            ? `Completed ${formatRunTimestamp(selectedRun.completed_at)}.`
                            : 'Completion time not available yet.'
                        }
                        icon={<ShieldAlert className="h-5 w-5" />}
                      />
                    ) : !runSummaryQuery.data ? (
                      <BacktestWorkspaceStatePanel
                        title="Results publishing"
                        description="Summary unavailable while results are still publishing."
                        detail="The run is marked completed, but the review payload has not landed yet."
                        icon={<ShieldAlert className="h-5 w-5" />}
                      />
                    ) : (
                      <BacktestWorkspaceTabContent
                        activeTab={activeSection}
                        run={selectedRun}
                        summary={runSummaryQuery.data}
                        timeseries={runTimeseriesQuery.data?.points || []}
                        rolling={runRollingQuery.data?.points || []}
                        windowDays={runWindowDays}
                        onWindowDaysChange={setRunWindowDays}
                        trades={runTradesQuery.data?.trades || []}
                        positions={runPositionsQuery.data?.positions || []}
                      />
                    )}
                  </>
                )}
              </>
            )
          ) : null}
        </div>
      </section>
    </div>
  );
}
