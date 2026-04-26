import { ApiError } from '@/services/apiService';
import type {
  TradeEnvironment,
  TradeOrderStatus
} from '@asset-allocation/contracts';
import type { TradeAccountSummaryView } from '@/services/tradeDeskModels';

export function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Not available';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 0 : 2
  }).format(value);
}

export function formatNumber(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Not available';
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

export function formatTimestamp(value?: string | null): string {
  if (!value) {
    return 'Not available';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

export function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export function environmentVariant(environment: TradeEnvironment) {
  if (environment === 'live') return 'destructive' as const;
  if (environment === 'sandbox') return 'secondary' as const;
  return 'outline' as const;
}

export function readinessVariant(readiness: TradeAccountSummaryView['readiness']) {
  if (readiness === 'ready') return 'default' as const;
  if (readiness === 'review') return 'secondary' as const;
  return 'destructive' as const;
}

export function orderStatusVariant(status: TradeOrderStatus) {
  if (status === 'filled' || status === 'accepted') return 'default' as const;
  if (status === 'rejected' || status === 'unknown_reconcile_required') {
    return 'destructive' as const;
  }
  if (status === 'cancel_pending' || status === 'partially_filled') return 'secondary' as const;
  return 'outline' as const;
}

export function brokerLabel(provider: TradeAccountSummaryView['provider']): string {
  if (provider === 'etrade') return 'E*TRADE';
  if (provider === 'schwab') return 'Schwab';
  return 'Alpaca';
}

export function buildTradeDeskPath(accountId?: string | null): string {
  if (!accountId) {
    return '/trade-desk';
  }
  return `/trade-desk?accountId=${encodeURIComponent(accountId)}`;
}

export function buildTradeMonitorPath(accountId?: string | null): string {
  if (!accountId) {
    return '/trade-monitor';
  }
  return `/trade-monitor?accountId=${encodeURIComponent(accountId)}`;
}

export function extractTradeDeskErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (error instanceof ApiError) {
    const requestIdMatch = error.message.match(/\[requestId=([^\]]+)\]/);
    const requestId = requestIdMatch?.[1] ?? null;
    const bodyStart = error.message.indexOf(' - ');
    const rawBody = bodyStart >= 0 ? error.message.slice(bodyStart + 3).trim() : '';

    try {
      const parsed = rawBody ? JSON.parse(rawBody) : null;
      const serviceMessage =
        parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string'
          ? parsed.message
          : null;
      if (serviceMessage) {
        return requestId ? `${serviceMessage} Reference ${requestId}.` : serviceMessage;
      }
    } catch {
      // Fall through to sanitized transport text.
    }

    if (requestId) {
      return `${fallback} Reference ${requestId}.`;
    }
    return fallback;
  }

  return error.message || fallback;
}

export function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
