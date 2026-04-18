import { useState } from 'react';
import { ArrowLeft, Clock3, PackageCheck, Route, ShieldAlert } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { PageLoader } from '@/app/components/common/PageLoader';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/components/ui/utils';
import { BacktestStatusBadge } from '@/features/backtests/components/BacktestStatusBadge';
import {
  BacktestWorkspaceStatePanel,
  BacktestWorkspaceTabContent
} from '@/features/backtests/components/BacktestWorkspacePanels';
import {
  BACKTEST_WORKSPACE_TABS,
  formatRunDateRange,
  formatRunTimestamp,
  hasPublishedResults,
  resolveWorkspaceTab
} from '@/features/backtests/lib/presentation';
import {
  useClosedPositions,
  useRolling,
  useRunStatus,
  useRunSummary,
  useTimeseries,
  useTrades
} from '@/services/backtestHooks';

export function BacktestRunWorkspacePage() {
  const { runId } = useParams<{ runId: string }>();
  const location = useLocation();
  const [windowDays, setWindowDays] = useState(63);

  if (!runId) {
    return (
      <div className="page-shell">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Backtest run id is required.
        </div>
      </div>
    );
  }

  const activeTab = resolveWorkspaceTab(location.pathname, runId);
  const statusQuery = useRunStatus(runId);
  const run = statusQuery.data;
  const analyticsReady = hasPublishedResults(run);

  const summaryQuery = useRunSummary(runId, { enabled: analyticsReady });
  const timeseriesQuery = useTimeseries(runId, {
    enabled: analyticsReady && (activeTab === 'overview' || activeTab === 'risk'),
    maxPoints: 3000
  });
  const rollingQuery = useRolling(runId, windowDays, {
    enabled: analyticsReady && activeTab === 'risk',
    maxPoints: 3000
  });
  const tradesQuery = useTrades(runId, {
    enabled: analyticsReady && activeTab === 'trades',
    limit: 2000,
    offset: 0
  });
  const positionsQuery = useClosedPositions(runId, {
    enabled: analyticsReady && activeTab === 'positions',
    limit: 2000,
    offset: 0
  });

  const heroMetadata = {
    runName: run?.run_name || runId,
    barSize: run?.bar_size || summaryQuery.data?.metadata?.bar_size || 'n/a',
    periodsPerYear: summaryQuery.data?.metadata?.periods_per_year,
    resultsSchemaVersion:
      run?.results_schema_version || summaryQuery.data?.metadata?.results_schema_version || null
  };

  const contentError =
    summaryQuery.error ||
    timeseriesQuery.error ||
    rollingQuery.error ||
    tradesQuery.error ||
    positionsQuery.error;

  let content: React.ReactNode = null;

  if (statusQuery.loading) {
    content = <PageLoader text="Loading run workspace..." className="h-[420px]" />;
  } else if (statusQuery.error || !run) {
    content = (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {statusQuery.error || 'Run not found.'}
      </div>
    );
  } else if (run.status === 'queued') {
    content = (
      <BacktestWorkspaceStatePanel
        title="Run queued"
        description="The backtest request has been accepted, but the worker has not started execution yet."
        detail={`Submitted ${formatRunTimestamp(run.submitted_at)}. Open this workspace again once the run transitions out of the queue.`}
        icon={<Clock3 className="h-5 w-5" />}
      />
    );
  } else if (run.status === 'running') {
    content = (
      <BacktestWorkspaceStatePanel
        title="Run executing"
        description="The worker is still building snapshots, applying rebalances, and evaluating exits. Portfolio analytics stay blocked until the result set is fully published."
        detail={
          run.started_at
            ? `Started ${formatRunTimestamp(run.started_at)}.`
            : 'Execution start time not available yet.'
        }
        icon={<Route className="h-5 w-5" />}
      />
    );
  } else if (run.status === 'failed') {
    content = (
      <BacktestWorkspaceStatePanel
        title="Run failed"
        description="The backtest did not complete, so the portfolio, trade audit, and closed-position analytics are unavailable."
        detail={run.error || 'Inspect the control-plane logs for the failure details.'}
        icon={<ShieldAlert className="h-5 w-5" />}
      />
    );
  } else if (!analyticsReady) {
    content = (
      <BacktestWorkspaceStatePanel
        title="Results publishing"
        description="The run is marked completed, but Postgres analytics have not finished publishing yet. Treat this as a separate state from a successful analytics workspace."
        detail={
          run.completed_at
            ? `Completed ${formatRunTimestamp(run.completed_at)}.`
            : 'Completion time not available yet.'
        }
        icon={<PackageCheck className="h-5 w-5" />}
      />
    );
  } else if (contentError) {
    content = (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {contentError}
      </div>
    );
  } else {
    content = (
      <BacktestWorkspaceTabContent
        activeTab={activeTab}
        run={run}
        summary={summaryQuery.data}
        timeseries={timeseriesQuery.data?.points || []}
        rolling={rollingQuery.data?.points || []}
        windowDays={windowDays}
        onWindowDaysChange={setWindowDays}
        trades={tradesQuery.data?.trades || []}
        positions={positionsQuery.data?.positions || []}
      />
    );
  }

  return (
    <div className="page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link to="/backtests">
            <ArrowLeft className="h-4 w-4" />
            Backtest Runs
          </Link>
        </Button>
      </div>

      <section className="mcm-panel overflow-hidden">
        <div className="border-b border-border/40 bg-[linear-gradient(135deg,rgba(255,247,233,0.98),rgba(0,128,128,0.08))] px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <BacktestStatusBadge run={run} />
                <Badge variant="outline">Long only</Badge>
                <Badge variant="outline">{heroMetadata.barSize}</Badge>
                {heroMetadata.resultsSchemaVersion ? (
                  <Badge variant="secondary">Schema v{heroMetadata.resultsSchemaVersion}</Badge>
                ) : null}
                {heroMetadata.periodsPerYear ? (
                  <Badge variant="secondary">{heroMetadata.periodsPerYear} periods / year</Badge>
                ) : null}
              </div>
              <div>
                <p className="page-kicker">Run Workspace</p>
                <h1 className="font-display text-3xl tracking-[0.04em] text-foreground">
                  {heroMetadata.runName}
                </h1>
                <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">
                  Portfolio analytics stay separate from execution rows and round-trip position
                  outcomes. Open the tab that matches the question you are asking.
                </p>
              </div>
            </div>

            <div className="grid gap-3 rounded-[1.5rem] border border-mcm-walnut/25 bg-mcm-paper/85 p-4 sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Strategy
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  {run?.strategy_name || run?.pins?.strategyName || 'Unavailable'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {run?.strategy_version || run?.pins?.strategyVersion
                    ? `Version ${run?.strategy_version || run?.pins?.strategyVersion}`
                    : 'Version unavailable'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Window
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  {run ? formatRunDateRange(run) : 'Not available'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Submitted {run ? formatRunTimestamp(run.submitted_at) : 'Not available'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Started
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  {run ? formatRunTimestamp(run.started_at) : 'Not available'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Completed
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  {run ? formatRunTimestamp(run.completed_at) : 'Not available'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-border/40 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {BACKTEST_WORKSPACE_TABS.map((tab) => {
              const href = tab.key === 'overview' ? `/backtests/${runId}` : `/backtests/${runId}/${tab.key}`;
              const isActive = activeTab === tab.key;

              return (
                <Button
                  key={tab.key}
                  asChild
                  variant={isActive ? 'secondary' : 'outline'}
                  className={cn(isActive && 'shadow-[3px_3px_0px_0px_rgba(119,63,26,0.15)]')}
                >
                  <Link to={href}>{tab.label}</Link>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="p-6">{content}</div>
      </section>
    </div>
  );
}
