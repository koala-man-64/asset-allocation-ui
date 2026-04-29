import type {
  BacktestValidationVerdict,
  RunRecordResponse,
  RunStatus
} from '@/services/backtestApi';

export function formatPercent(value?: number | null, digits = 1): string {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function formatNumber(value?: number | null, digits = 2): string {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

export function formatInteger(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return Math.round(Number(value)).toLocaleString('en-US');
}

export function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });
}

export function formatBps(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `${Number(value).toFixed(1)} bps`;
}

export function formatTimestamp(value?: string | null): string {
  if (!value) {
    return 'n/a';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatWindow(run?: RunRecordResponse | null): string {
  if (!run) {
    return 'n/a';
  }
  return `${run.start_date || 'unknown'} to ${run.end_date || 'unknown'}`;
}

export function statusBadgeVariant(status?: RunStatus | string | null) {
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'running') return 'secondary';
  return 'outline';
}

export function validationBadgeVariant(verdict?: BacktestValidationVerdict | null) {
  if (verdict === 'pass') return 'default';
  if (verdict === 'block') return 'destructive';
  return 'secondary';
}

export function compactRunLabel(run?: RunRecordResponse | null): string {
  if (!run) {
    return 'No run selected';
  }
  return run.run_name || run.execution_name || run.run_id;
}

export function compactStrategyLabel(run?: RunRecordResponse | null): string {
  if (!run?.strategy_name) {
    return 'unassigned';
  }
  return run.strategy_version
    ? `${run.strategy_name} v${run.strategy_version}`
    : run.strategy_name;
}

