import type {
  BrokerAccountAlert,
  BrokerAccountSummary,
  BrokerHealthTone,
  BrokerTradeReadiness,
  BrokerStrategyAllocationSummary,
  BrokerVendor
} from '@/types/brokerAccounts';
import type { TradeAccountSummaryView } from '@/services/tradeDeskModels';

export function formatCurrency(value?: number | null, currency: string = 'USD'): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2
  }).format(value);
}

export function formatNumber(value?: number | null, digits: number = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function formatPercent(value?: number | null, digits: number = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  return `${formatNumber(value, digits)}%`;
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

export function compactMetricToneClass(tone: BrokerHealthTone): string {
  if (tone === 'critical') {
    return 'border-destructive/30 bg-destructive/10';
  }

  if (tone === 'warning') {
    return 'border-mcm-mustard/35 bg-mcm-mustard/12';
  }

  return 'border-mcm-teal/25 bg-mcm-teal/10';
}

export function statusBadgeVariant(
  status?: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (
    status === 'critical' ||
    status === 'failed' ||
    status === 'blocked' ||
    status === 'disconnected' ||
    status === 'reconnect_required' ||
    status === 'expired'
  ) {
    return 'destructive';
  }

  if (
    status === 'warning' ||
    status === 'review' ||
    status === 'stale' ||
    status === 'paused' ||
    status === 'degraded' ||
    status === 'expires_soon' ||
    status === 'syncing'
  ) {
    return 'secondary';
  }

  if (!status || status === 'not_connected' || status === 'never_synced') {
    return 'outline';
  }

  return 'default';
}

function allocationModeLabel(
  summary: BrokerStrategyAllocationSummary,
  baseCurrency: string
): string {
  if (summary.allocationMode === 'notional_base_ccy') {
    return formatCurrency(summary.allocatedNotionalBaseCcy, baseCurrency);
  }
  return formatPercent(summary.allocatedPercent);
}

export function accountAssignmentTitle(account: BrokerAccountSummary): string {
  return (
    account.allocationSummary?.portfolioName ||
    account.activePortfolioName ||
    'No portfolio assignment'
  );
}

export function accountAssignmentDetail(account: BrokerAccountSummary): string {
  const summary = account.allocationSummary;
  if (!summary) {
    return account.strategyLabel || 'No strategy allocation configured';
  }

  const strategyCountLabel = `${summary.items.length} ${summary.items.length === 1 ? 'strategy' : 'strategies'}`;
  return [strategyCountLabel, allocationModeLabel(summary, account.baseCurrency)]
    .filter(Boolean)
    .join(' · ');
}

export function brokerAccentClass(broker: BrokerVendor): string {
  if (broker === 'alpaca') {
    return 'border-l-mcm-teal bg-[linear-gradient(90deg,rgba(0,128,128,0.14),transparent_22%)]';
  }

  if (broker === 'schwab') {
    return 'border-l-mcm-mustard bg-[linear-gradient(90deg,rgba(225,173,1,0.16),transparent_22%)]';
  }

  return 'border-l-mcm-olive bg-[linear-gradient(90deg,rgba(111,102,0,0.14),transparent_22%)]';
}

export function tradeReadinessLabel(readiness: BrokerTradeReadiness): string {
  if (readiness === 'ready') {
    return 'Trade Ready';
  }

  if (readiness === 'blocked') {
    return 'Blocked';
  }

  return 'Review';
}

export function alertToneClass(severity: BrokerAccountAlert['severity']): string {
  if (severity === 'critical') {
    return 'border-destructive/30 bg-destructive/10';
  }

  if (severity === 'warning') {
    return 'border-mcm-mustard/35 bg-mcm-mustard/12';
  }

  return 'border-mcm-teal/25 bg-mcm-teal/10';
}

export function getAccountSearchText(
  account: BrokerAccountSummary,
  tradeAccount?: TradeAccountSummaryView | null
): string {
  return [
    account.name,
    account.broker,
    account.accountNumberMasked,
    account.activePortfolioName,
    account.strategyLabel,
    account.allocationSummary?.portfolioName,
    ...(account.allocationSummary?.items || []).flatMap((item) => [
      item.sleeveName,
      item.strategy.strategyName
    ]),
    account.tradeReadinessReason,
    account.connectionHealth.staleReason,
    account.connectionHealth.failureMessage,
    tradeAccount?.name,
    tradeAccount?.provider,
    tradeAccount?.environment,
    tradeAccount?.readiness,
    tradeAccount?.readinessReason,
    tradeAccount?.accountNumberMasked,
    tradeAccount?.capabilities.unsupportedReason,
    tradeAccount?.freshness.balancesState,
    tradeAccount?.freshness.positionsState,
    tradeAccount?.freshness.ordersState,
    tradeAccount?.freshness.staleReason
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function alertPriority(account: BrokerAccountSummary): number {
  if (account.highestAlertSeverity === 'critical') {
    return 3;
  }

  if (account.highestAlertSeverity === 'warning') {
    return 2;
  }

  if (account.highestAlertSeverity === 'info') {
    return 1;
  }

  return 0;
}

function syncPriority(account: BrokerAccountSummary): number {
  const { connectionState, syncStatus } = account.connectionHealth;

  if (connectionState === 'reconnect_required' || connectionState === 'disconnected') {
    return 4;
  }

  if (syncStatus === 'failed') {
    return 3;
  }

  if (syncStatus === 'stale') {
    return 2;
  }

  if (syncStatus === 'paused') {
    return 1;
  }

  return 0;
}

function tradePriority(account: BrokerAccountSummary): number {
  if (account.tradeReadiness === 'blocked') {
    return 2;
  }

  if (account.tradeReadiness === 'review') {
    return 1;
  }

  return 0;
}

export function sortAccountsByPriority(
  accounts: readonly BrokerAccountSummary[]
): BrokerAccountSummary[] {
  return [...accounts].sort((left, right) => {
    const alertDelta = alertPriority(right) - alertPriority(left);
    if (alertDelta !== 0) {
      return alertDelta;
    }

    const syncDelta = syncPriority(right) - syncPriority(left);
    if (syncDelta !== 0) {
      return syncDelta;
    }

    const tradeDelta = tradePriority(right) - tradePriority(left);
    if (tradeDelta !== 0) {
      return tradeDelta;
    }

    const rightSize = Math.max(right.buyingPower, right.equity);
    const leftSize = Math.max(left.buyingPower, left.equity);
    if (rightSize !== leftSize) {
      return rightSize - leftSize;
    }

    return left.name.localeCompare(right.name);
  });
}
