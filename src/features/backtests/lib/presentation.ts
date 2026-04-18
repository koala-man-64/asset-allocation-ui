import type { RunRecordResponse, RunStatusResponse } from '@/services/backtestApi';
import { formatCurrency, formatNumber, formatPercentDecimal } from '@/utils/format';

export type BacktestWorkspaceTab = 'overview' | 'risk' | 'trades' | 'positions';

export const BACKTEST_WORKSPACE_TABS: ReadonlyArray<{
  key: BacktestWorkspaceTab;
  label: string;
}> = [
  { key: 'overview', label: 'Overview' },
  { key: 'risk', label: 'Equity & Risk' },
  { key: 'trades', label: 'Trade Audit' },
  { key: 'positions', label: 'Closed Positions' }
];

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium'
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

export function resolveWorkspaceTab(pathname: string, runId: string): BacktestWorkspaceTab {
  const suffix = pathname.replace(`/backtests/${runId}`, '').replace(/^\/+/, '');

  if (suffix === 'risk') return 'risk';
  if (suffix === 'trades') return 'trades';
  if (suffix === 'positions') return 'positions';
  return 'overview';
}

export function formatRunTimestamp(value?: string | null): string {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return DATETIME_FORMATTER.format(parsed);
}

export function formatRunDate(value?: string | null): string {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return DATE_FORMATTER.format(parsed);
}

export function formatRunDateRange(run: Pick<RunRecordResponse, 'start_date' | 'end_date'>): string {
  return `${formatRunDate(run.start_date)} to ${formatRunDate(run.end_date)}`;
}

export function formatMetricPercent(value?: number | null, digits: number = 1): string {
  return formatPercentDecimal(value, digits);
}

export function formatMetricCurrency(value?: number | null): string {
  return formatCurrency(value);
}

export function formatMetricNumber(value?: number | null, digits: number = 2): string {
  return formatNumber(value, digits);
}

export function formatMetricInteger(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function formatMetricBps(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(1)} bps`;
}

export function formatSnakeCaseLabel(value?: string | null): string {
  if (!value) return '—';
  return value.replaceAll('_', ' ');
}

export function getRunStatusTone(
  run?: Pick<RunStatusResponse, 'status' | 'results_ready_at'> | null
): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (!run) {
    return { label: 'unknown', variant: 'outline' };
  }

  if (run.status === 'failed') {
    return { label: 'failed', variant: 'destructive' };
  }

  if (run.status === 'completed' && !run.results_ready_at) {
    return { label: 'publishing', variant: 'secondary' };
  }

  if (run.status === 'completed') {
    return { label: 'completed', variant: 'default' };
  }

  if (run.status === 'running') {
    return { label: 'running', variant: 'secondary' };
  }

  return { label: 'queued', variant: 'outline' };
}

export function hasPublishedResults(run?: Pick<RunStatusResponse, 'status' | 'results_ready_at'> | null): boolean {
  return run?.status === 'completed' && Boolean(run.results_ready_at);
}
