import { RefreshCcw, Search } from 'lucide-react';

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
import type { RunRecordResponse, RunStatus } from '@/services/backtestApi';
import {
  compactRunLabel,
  compactStrategyLabel,
  formatTimestamp,
  formatWindow,
  statusBadgeVariant
} from '@/features/backtests/lib/backtestPresentation';

export interface BacktestRunFilters {
  query: string;
  status: 'all' | RunStatus;
  strategy: string;
  barSize: string;
  benchmark: string;
  costModel: string;
  schemaVersion: string;
  owner: string;
}

interface BacktestRunRailProps {
  runs: RunRecordResponse[];
  selectedRunId: string | null;
  filters: BacktestRunFilters;
  loading: boolean;
  error?: string;
  onFiltersChange: (filters: BacktestRunFilters) => void;
  onSelectRun: (runId: string) => void;
  onRefresh: () => void;
}

export function BacktestRunRail({
  runs,
  selectedRunId,
  filters,
  loading,
  error,
  onFiltersChange,
  onSelectRun,
  onRefresh
}: BacktestRunRailProps) {
  const updateFilter = <Key extends keyof BacktestRunFilters>(
    key: Key,
    value: BacktestRunFilters[Key]
  ) => onFiltersChange({ ...filters, [key]: value });

  return (
    <aside className="mcm-panel flex min-h-[760px] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Run Inventory
            </p>
            <h2 className="text-lg">Backtests</h2>
          </div>
          <Button type="button" variant="outline" size="icon" aria-label="Refresh backtest runs" onClick={onRefresh}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4 border-b border-border/30 p-5">
        <div className="grid gap-2">
          <Label htmlFor="backtest-run-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="backtest-run-search"
              className="pl-9"
              value={filters.query}
              onChange={(event) => updateFilter('query', event.target.value)}
              placeholder="Run, strategy, owner"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select
              value={filters.status}
              onValueChange={(value) => updateFilter('status', value as BacktestRunFilters['status'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="backtest-filter-strategy">Strategy</Label>
            <Input
              id="backtest-filter-strategy"
              value={filters.strategy}
              onChange={(event) => updateFilter('strategy', event.target.value)}
              placeholder="quality-trend"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="backtest-filter-owner">Owner</Label>
            <Input
              id="backtest-filter-owner"
              value={filters.owner}
              onChange={(event) => updateFilter('owner', event.target.value)}
              placeholder="pm@example.com"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="backtest-filter-bar-size">Bar size</Label>
            <Input
              id="backtest-filter-bar-size"
              value={filters.barSize}
              onChange={(event) => updateFilter('barSize', event.target.value)}
              placeholder="5m"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="backtest-filter-benchmark">Benchmark</Label>
            <Input
              id="backtest-filter-benchmark"
              value={filters.benchmark}
              onChange={(event) => updateFilter('benchmark', event.target.value)}
              placeholder="SPY"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="backtest-filter-cost-model">Cost model</Label>
            <Input
              id="backtest-filter-cost-model"
              value={filters.costModel}
              onChange={(event) => updateFilter('costModel', event.target.value)}
              placeholder="desk-default"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="backtest-filter-schema">Schema</Label>
            <Input
              id="backtest-filter-schema"
              value={filters.schemaVersion}
              onChange={(event) => updateFilter('schemaVersion', event.target.value)}
              placeholder="4"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/30 bg-mcm-cream/65 p-4 text-sm text-muted-foreground">
            Loading backtest runs...
          </div>
        ) : error ? (
          <div className="rounded-[1.5rem] border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-mcm-walnut/30 bg-mcm-cream/65 p-4 text-sm text-muted-foreground">
            No runs match the active filters.
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <button
                key={run.run_id}
                type="button"
                className={`w-full rounded-[1.4rem] border p-4 text-left transition hover:bg-mcm-cream/80 ${
                  selectedRunId === run.run_id
                    ? 'border-mcm-walnut bg-mcm-mustard/15 shadow-[4px_4px_0px_0px_rgba(119,63,26,0.12)]'
                    : 'border-mcm-walnut/20 bg-mcm-paper/75'
                }`}
                onClick={() => onSelectRun(run.run_id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {compactRunLabel(run)}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {compactStrategyLabel(run)}
                    </div>
                  </div>
                  <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                </div>
                <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                  <span>{formatWindow(run)}</span>
                  <span>{run.bar_size || 'bar n/a'} · {formatTimestamp(run.submitted_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
