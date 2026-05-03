import type {
  BrokerAccountSummary,
  BrokerAlertStatus,
  BrokerCapabilityFlags,
  BrokerHealthTone,
  BrokerTradeReadiness,
  BrokerVendor
} from '@/types/brokerAccounts';
import type { TradeAccountSummaryView } from '@/services/tradeDeskModels';
import { getAccountSearchText } from '@/features/accounts/lib/accountPresentation';

export type AccountBoardScope =
  | 'all'
  | 'needs_action'
  | 'blocked'
  | 'disconnected'
  | 'paused'
  | 'live'
  | 'paper';

export type AccountStatusFilter = 'all' | BrokerHealthTone | BrokerTradeReadiness;
export type BrokerFilter = 'all' | BrokerVendor;

export interface AccountMonitoringSnapshot {
  account: BrokerAccountSummary;
  tradeAccount: TradeAccountSummaryView | null;
}

export type AccountActionKind =
  | 'refresh'
  | 'reconnect'
  | 'pause_sync'
  | 'resume_sync'
  | 'acknowledge_alert';

export interface AccountActionAvailability {
  allowed: boolean;
  reason: string | null;
}

export interface AccountActionAvailabilityInput {
  account: BrokerAccountSummary;
  action: AccountActionKind;
  capabilities?: BrokerCapabilityFlags | null;
  capabilitiesLoading?: boolean;
  capabilitiesError?: unknown;
  busy?: boolean;
  alertStatus?: BrokerAlertStatus | null;
}

export interface AccountBoardFilters {
  searchTerm: string;
  broker: BrokerFilter;
  status: AccountStatusFilter;
  scope: AccountBoardScope;
}

export function getAccountActionAvailability({
  account,
  action,
  capabilities,
  capabilitiesLoading = false,
  capabilitiesError,
  busy = false,
  alertStatus
}: AccountActionAvailabilityInput): AccountActionAvailability {
  if (busy) {
    return { allowed: false, reason: 'Another account operation is still processing.' };
  }

  if (capabilitiesLoading) {
    return { allowed: false, reason: 'Loading account capabilities.' };
  }

  if (capabilitiesError || !capabilities) {
    return { allowed: false, reason: 'Account capabilities are unavailable.' };
  }

  if (action === 'refresh') {
    if (!capabilities.canRefresh) {
      return { allowed: false, reason: 'Refresh is not supported for this account.' };
    }
    if (account.connectionHealth.syncPaused) {
      return { allowed: false, reason: 'Resume sync before requesting a refresh.' };
    }
    return { allowed: true, reason: null };
  }

  if (action === 'reconnect') {
    if (!capabilities.canReconnect) {
      return { allowed: false, reason: 'Reconnect is not supported for this account.' };
    }
    if (account.connectionHealth.connectionState === 'connected') {
      return { allowed: false, reason: 'The broker connection is already connected.' };
    }
    return { allowed: true, reason: null };
  }

  if (action === 'pause_sync' || action === 'resume_sync') {
    if (!capabilities.canPauseSync) {
      return {
        allowed: false,
        reason: 'Sync pause and resume are not supported for this account.'
      };
    }
    return { allowed: true, reason: null };
  }

  if (!capabilities.canAcknowledgeAlerts) {
    return { allowed: false, reason: 'Alert acknowledgement is not supported for this account.' };
  }

  if (alertStatus && alertStatus !== 'open') {
    return { allowed: false, reason: 'Only open alerts can be acknowledged.' };
  }

  return { allowed: true, reason: null };
}

export function accountMatchesBoardFilters(
  snapshot: AccountMonitoringSnapshot,
  filters: AccountBoardFilters
): boolean {
  const { account, tradeAccount } = snapshot;
  const search = filters.searchTerm.trim().toLowerCase();

  if (filters.broker !== 'all' && account.broker !== filters.broker) {
    return false;
  }

  if (
    filters.status !== 'all' &&
    account.overallStatus !== filters.status &&
    account.tradeReadiness !== filters.status &&
    tradeAccount?.readiness !== filters.status
  ) {
    return false;
  }

  if (search && !getAccountSearchText(account, tradeAccount).includes(search)) {
    return false;
  }

  if (filters.scope === 'all') {
    return true;
  }

  if (filters.scope === 'needs_action') {
    return (
      account.overallStatus !== 'healthy' ||
      account.tradeReadiness !== 'ready' ||
      tradeAccount?.readiness !== 'ready' ||
      Boolean(tradeAccount?.killSwitchActive) ||
      Boolean(tradeAccount?.capabilities.readOnly) ||
      (tradeAccount?.unresolvedAlertCount ?? 0) > 0
    );
  }

  if (filters.scope === 'blocked') {
    return (
      account.tradeReadiness === 'blocked' ||
      tradeAccount?.readiness === 'blocked' ||
      Boolean(tradeAccount?.killSwitchActive)
    );
  }

  if (filters.scope === 'disconnected') {
    return account.connectionHealth.connectionState !== 'connected';
  }

  if (filters.scope === 'paused') {
    return account.connectionHealth.syncPaused;
  }

  if (filters.scope === 'live') {
    return tradeAccount?.environment === 'live';
  }

  return tradeAccount?.environment === 'paper' || tradeAccount?.environment === 'sandbox';
}
