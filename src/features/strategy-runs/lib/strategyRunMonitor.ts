import type {
  BacktestSummary,
  ClosedPositionResponse,
  RunRecordResponse,
  RunStatus,
  TimeseriesPointResponse,
  TradeResponse
} from '@/services/backtestApi';

export interface StrategyRunMonitorAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
}

export interface StrategyRunMonitorEvent {
  id: string;
  timestamp: string;
  title: string;
  detail: string;
  severity: 'default' | 'warning' | 'critical';
}

export const DEFAULT_REFRESH_MS = 15_000;
export const REFRESH_INTERVAL_OPTIONS = [
  { value: 5_000, label: '5s' },
  { value: 15_000, label: '15s' },
  { value: 30_000, label: '30s' }
] as const;

const ACTIVE_STATUSES = new Set<RunStatus>(['queued', 'running']);

function parseTimestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toCompactCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 2
  }).format(value);
}

export function buildDefaultRunDraft(now: Date = new Date()): {
  runName: string;
  startTs: string;
  endTs: string;
  barSize: string;
} {
  const end = new Date(now);
  end.setSeconds(0, 0);

  const start = new Date(end);
  start.setMonth(start.getMonth() - 3);

  return {
    runName: '',
    startTs: toDateTimeLocalValue(start),
    endTs: toDateTimeLocalValue(end),
    barSize: '5m'
  };
}

export function toDateTimeLocalValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function toIsoTimestamp(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export function isActiveRunStatus(status?: RunStatus | null): boolean {
  return status ? ACTIVE_STATUSES.has(status) : false;
}

export function sortRunsBySubmittedAt(runs: RunRecordResponse[]): RunRecordResponse[] {
  return [...runs].sort(
    (left, right) => parseTimestamp(right.submitted_at) - parseTimestamp(left.submitted_at)
  );
}

export function pickPreferredRun(runs: RunRecordResponse[]): RunRecordResponse | null {
  if (!runs.length) return null;
  return runs.find((run) => isActiveRunStatus(run.status)) ?? runs[0];
}

export function getRunLabel(run?: RunRecordResponse | null): string {
  if (!run) return 'No run selected';
  const deskLabel = String(run.run_name || '').trim();
  if (deskLabel) return deskLabel;
  return run.run_id;
}

export function getRunStatusLabel(status?: RunStatus | null): string {
  if (!status) return 'Unknown';
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export function getRunStatusTone(
  status?: RunStatus | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!status) return 'outline';
  if (status === 'failed') return 'destructive';
  if (status === 'completed') return 'secondary';
  if (status === 'running') return 'default';
  return 'outline';
}

export function formatDateTime(value?: string | null): string {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

export function formatRelativeTime(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  if (value < 1_000) return 'just now';

  const seconds = Math.floor(value / 1_000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value);
}

export function formatCompactCurrency(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return toCompactCurrency(value);
}

export function formatNumber(value?: number | null, digits: number = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return Number(value).toFixed(digits);
}

export function formatPercentDecimal(value?: number | null, digits: number = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function formatPercent(value?: number | null, digits: number = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `${Number(value).toFixed(digits)}%`;
}

export function formatBps(value?: number | null, digits: number = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `${Number(value).toFixed(digits)} bps`;
}

export function getAbsoluteValue(value?: number | null): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return Math.abs(Number(value));
}

export function buildRunAlerts({
  run,
  summary,
  latestPoint,
  freshnessMs,
  refreshMs,
  timeseriesTruncated,
  rollingTruncated
}: {
  run?: RunRecordResponse | null;
  summary?: BacktestSummary | null;
  latestPoint?: TimeseriesPointResponse | null;
  freshnessMs?: number | null;
  refreshMs: number;
  timeseriesTruncated?: boolean;
  rollingTruncated?: boolean;
}): StrategyRunMonitorAlert[] {
  const alerts: StrategyRunMonitorAlert[] = [];

  if (run?.status === 'failed') {
    alerts.push({
      id: 'run-failed',
      severity: 'critical',
      title: 'Run failed',
      message: run.error || 'The backend marked this run as failed. Review the latest blotter and logs before relaunching.'
    });
  }

  if (freshnessMs && freshnessMs > refreshMs * 5) {
    alerts.push({
      id: 'stale-critical',
      severity: 'critical',
      title: 'Snapshot is stale',
      message: `The workspace has not refreshed for ${formatRelativeTime(freshnessMs)}. Treat the metrics as delayed until the next successful update.`
    });
  } else if (freshnessMs && freshnessMs > refreshMs * 2) {
    alerts.push({
      id: 'stale-warning',
      severity: 'warning',
      title: 'Updates are lagging',
      message: `Snapshot freshness is outside the normal ${Math.round(refreshMs / 1000)} second cadence.`
    });
  }

  const absoluteDrawdown = getAbsoluteValue(summary?.max_drawdown);
  if (absoluteDrawdown !== null && absoluteDrawdown >= 0.12) {
    alerts.push({
      id: 'drawdown-limit',
      severity: 'warning',
      title: 'Drawdown pressure',
      message: `Max drawdown is ${formatPercentDecimal(absoluteDrawdown)}. That is large enough to distort live confidence and should stay front-and-center.`
    });
  }

  if ((summary?.cost_drag_bps ?? 0) >= 75) {
    alerts.push({
      id: 'cost-drag',
      severity: 'warning',
      title: 'Execution drag is material',
      message: `Cost drag is ${formatBps(summary?.cost_drag_bps)}. Slippage and commission are now large enough to challenge the edge.`
    });
  }

  const absoluteNetExposure = getAbsoluteValue(latestPoint?.net_exposure);
  const isExposureStretched =
    (latestPoint?.gross_exposure ?? 0) > 1.05 || (absoluteNetExposure ?? 0) > 1;

  if (isExposureStretched) {
    alerts.push({
      id: 'exposure-stretch',
      severity: 'warning',
      title: 'Exposure is stretched',
      message: `Gross exposure is ${formatNumber(latestPoint?.gross_exposure, 2)}x and net exposure is ${formatNumber(absoluteNetExposure, 2)}x. Validate that this matches the strategy mandate.`
    });
  }

  if ((summary?.hit_rate ?? 1) < 0.45 && (summary?.profit_factor ?? 2) < 1.05) {
    alerts.push({
      id: 'weak-edge',
      severity: 'info',
      title: 'Edge quality is soft',
      message: `Hit rate is ${formatPercentDecimal(summary?.hit_rate)} and profit factor is ${formatNumber(summary?.profit_factor, 2)}. Monitor whether returns are being carried by a small number of outliers.`
    });
  }

  if (timeseriesTruncated || rollingTruncated) {
    alerts.push({
      id: 'series-truncated',
      severity: 'info',
      title: 'Displayed history is clipped',
      message: 'One or more time-series endpoints returned truncated data. Treat the charts as a window, not a full audit trail.'
    });
  }

  return alerts;
}

export function buildRunEvents({
  run,
  trades,
  closedPositions
}: {
  run?: RunRecordResponse | null;
  trades: TradeResponse[];
  closedPositions: ClosedPositionResponse[];
}): StrategyRunMonitorEvent[] {
  const events: StrategyRunMonitorEvent[] = [];

  if (run?.submitted_at) {
    events.push({
      id: `${run.run_id}-submitted`,
      timestamp: run.submitted_at,
      title: 'Run submitted',
      detail: `${getRunLabel(run)} entered the queue as ${run.run_id}.`,
      severity: 'default'
    });
  }

  if (run?.started_at) {
    events.push({
      id: `${run.run_id}-started`,
      timestamp: run.started_at,
      title: 'Run started',
      detail: 'The backend marked the run as active and began producing metrics.',
      severity: 'default'
    });
  }

  if (run?.completed_at && run.status === 'completed') {
    events.push({
      id: `${run.run_id}-completed`,
      timestamp: run.completed_at,
      title: 'Run completed',
      detail: 'Final metrics are available for review.',
      severity: 'default'
    });
  }

  if (run?.completed_at && run.status === 'failed') {
    events.push({
      id: `${run.run_id}-failed`,
      timestamp: run.completed_at,
      title: 'Run failed',
      detail: run.error || 'The backend terminated the run before completion.',
      severity: 'critical'
    });
  }

  trades
    .slice()
    .sort((left, right) => parseTimestamp(right.execution_date) - parseTimestamp(left.execution_date))
    .slice(0, 4)
    .forEach((trade) => {
      const signedQuantity = trade.quantity > 0 ? `+${trade.quantity}` : `${trade.quantity}`;
      events.push({
        id: `${trade.execution_date}-${trade.symbol}-${trade.quantity}`,
        timestamp: trade.execution_date,
        title: `${trade.symbol} ${signedQuantity}`,
        detail: `${formatCurrency(trade.notional)} notional at ${formatCurrency(trade.price)} with ${formatCurrency(trade.slippage_cost)} slippage.`,
        severity: trade.slippage_cost > 250 ? 'warning' : 'default'
      });
    });

  closedPositions
    .slice()
    .sort((left, right) => parseTimestamp(right.closed_at) - parseTimestamp(left.closed_at))
    .slice(0, 3)
    .forEach((position) => {
      events.push({
        id: `${position.position_id}-${position.closed_at}`,
        timestamp: position.closed_at,
        title: `${position.symbol} closed`,
        detail: `${formatCurrency(position.realized_pnl)} realized over ${position.holding_period_bars} bars.`,
        severity: position.realized_pnl < 0 ? 'warning' : 'default'
      });
    });

  return events
    .sort((left, right) => parseTimestamp(right.timestamp) - parseTimestamp(left.timestamp))
    .slice(0, 8);
}
