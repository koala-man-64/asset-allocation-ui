import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowUpRight, Clock3, Layers3, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { PageLoader } from '@/app/components/common/PageLoader';
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
import { BacktestStatusBadge } from '@/features/backtests/components/BacktestStatusBadge';
import {
  formatMetricInteger,
  formatRunDateRange,
  formatRunTimestamp
} from '@/features/backtests/lib/presentation';
import { useRunList } from '@/services/backtestHooks';
import type { RunStatus } from '@/services/backtestApi';

const RUN_STATUS_FILTERS: ReadonlyArray<{ value: 'all' | RunStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' }
];

function formatStrategyVersion(value?: number | null): string {
  if (!value) return 'version not pinned';
  return `v${value}`;
}

export function BacktestRunsPage() {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RunStatus>('all');
  const deferredSearchText = useDeferredValue(searchText);

  const { runs, loading, error } = useRunList({
    q: deferredSearchText.trim() || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 200,
    offset: 0
  });

  const runCounts = useMemo(() => {
    const queued = runs.filter((run) => run.status === 'queued').length;
    const running = runs.filter((run) => run.status === 'running').length;
    const completed = runs.filter((run) => run.status === 'completed').length;
    const failed = runs.filter((run) => run.status === 'failed').length;

    return {
      total: runs.length,
      active: queued + running,
      completed,
      failed
    };
  }, [runs]);

  return (
    <div className="page-shell">
      <div className="page-header-row gap-6">
        <div className="page-header">
          <p className="page-kicker">Backtest Runs</p>
          <h1 className="page-title">Frozen Run Ledger</h1>
          <p className="page-subtitle">
            Review queued, running, completed, and failed runs without collapsing strategy logic
            into analytics. Cadence, pinned strategy version, and run state stay visible before you
            open a workspace.
          </p>
        </div>

        <div className="mcm-panel flex w-full max-w-xl flex-col gap-4 p-4 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="sr-only">Search runs</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                className="pl-10"
                placeholder="Search run name, id, or strategy"
              />
            </div>
          </label>

          <label className="grid gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | RunStatus)}
              className="h-11 min-w-[180px] rounded-xl border border-input bg-background px-3 text-sm"
            >
              {RUN_STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="mcm-panel p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Total Runs
          </div>
          <div className="mt-3 font-display text-3xl text-foreground">
            {formatMetricInteger(runCounts.total)}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Frozen executions available to review or reopen.
          </div>
        </div>
        <div className="mcm-panel p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Active Queue
          </div>
          <div className="mt-3 font-display text-3xl text-foreground">
            {formatMetricInteger(runCounts.active)}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Queued and running jobs still resolving or executing.
          </div>
        </div>
        <div className="mcm-panel p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Completed
          </div>
          <div className="mt-3 font-display text-3xl text-foreground">
            {formatMetricInteger(runCounts.completed)}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Runs eligible for analytics once Postgres results are published.
          </div>
        </div>
        <div className="mcm-panel p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Failed
          </div>
          <div className="mt-3 font-display text-3xl text-foreground">
            {formatMetricInteger(runCounts.failed)}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Runs that failed fast on data coverage, scheduling, or runtime execution.
          </div>
        </div>
      </div>

      <section className="mcm-panel overflow-hidden">
        <div className="border-b border-border/40 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Run Queue
              </p>
              <h2 className="mt-1 font-display text-xl text-foreground">Backtest Inventory</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Open any run to inspect portfolio performance, trade audit, and closed-position
                outcomes on separate surfaces.
              </p>
            </div>
            <Badge variant="secondary">{formatMetricInteger(runs.length)} visible</Badge>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <PageLoader text="Loading backtest runs..." className="h-64" />
          ) : error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-mcm-walnut/35 bg-mcm-cream/70 p-8 text-sm text-muted-foreground">
              No runs match the current filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:[&>td]:bg-transparent">
                  <TableHead>Run</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow
                    key={run.run_id}
                    onClick={() => navigate(`/backtests/${run.run_id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-display text-base text-foreground">
                          {run.run_name || run.run_id}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">{run.run_id}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">
                          {run.strategy_name || 'Strategy unavailable'}
                        </div>
                        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                          <Layers3 className="h-3.5 w-3.5" />
                          {formatStrategyVersion(run.strategy_version)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{run.bar_size || 'n/a'}</Badge>
                    </TableCell>
                    <TableCell>{formatRunDateRange(run)}</TableCell>
                    <TableCell>{formatRunTimestamp(run.submitted_at)}</TableCell>
                    <TableCell>
                      {run.completed_at ? (
                        formatRunTimestamp(run.completed_at)
                      ) : (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <Clock3 className="h-3.5 w-3.5" />
                          in flight
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <BacktestStatusBadge
                          run={{
                            status: run.status,
                            results_ready_at: run.status === 'completed' ? run.completed_at : null
                          }}
                        />
                        {run.error ? (
                          <div className="max-w-[24ch] whitespace-normal text-xs text-destructive">
                            {run.error}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        className="justify-end"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/backtests/${run.run_id}`);
                        }}
                      >
                        Open
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
