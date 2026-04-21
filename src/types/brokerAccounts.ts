// Temporary local bridge until the published contracts package exports the
// broker-account surface consumed by the account-operations UI.

export type BrokerVendor = 'alpaca' | 'schwab' | 'etrade';
export type BrokerHealthTone = 'healthy' | 'warning' | 'critical';
export type BrokerConnectionState =
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'reconnect_required';
export type BrokerAuthStatus =
  | 'authenticated'
  | 'expires_soon'
  | 'expired'
  | 'reauth_required'
  | 'not_connected';
export type BrokerSyncStatus =
  | 'fresh'
  | 'stale'
  | 'syncing'
  | 'paused'
  | 'failed'
  | 'never_synced';
export type BrokerTradeReadiness = 'ready' | 'review' | 'blocked';
export type BrokerAccountType = 'cash' | 'margin' | 'retirement' | 'paper' | 'other';
export type BrokerAlertSeverity = 'info' | 'warning' | 'critical';
export type BrokerAlertStatus = 'open' | 'acknowledged' | 'resolved';
export type BrokerSyncTrigger = 'scheduled' | 'manual' | 'reconnect' | 'backfill';
export type BrokerSyncScope = 'balances' | 'positions' | 'orders' | 'full';
export type BrokerSyncRunStatus = 'queued' | 'running' | 'completed' | 'failed';
export type BrokerAccountActionType =
  | 'reconnect'
  | 'pause_sync'
  | 'resume_sync'
  | 'refresh'
  | 'acknowledge_alert';
export type BrokerAccountActionStatus = 'accepted' | 'in_progress' | 'completed' | 'failed';

export interface BrokerConnectionHealth {
  overallStatus: BrokerHealthTone;
  authStatus: BrokerAuthStatus;
  connectionState: BrokerConnectionState;
  syncStatus: BrokerSyncStatus;
  lastCheckedAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastFailedSyncAt?: string | null;
  authExpiresAt?: string | null;
  staleReason?: string | null;
  failureMessage?: string | null;
  syncPaused: boolean;
}

export interface BrokerCapabilityFlags {
  canReadBalances: boolean;
  canReadPositions: boolean;
  canReadOrders: boolean;
  canTrade: boolean;
  canReconnect: boolean;
  canPauseSync: boolean;
  canRefresh: boolean;
  canAcknowledgeAlerts: boolean;
}

export interface BrokerAccountAlert {
  alertId: string;
  accountId: string;
  severity: BrokerAlertSeverity;
  status: BrokerAlertStatus;
  code: string;
  title: string;
  message: string;
  observedAt: string;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  resolvedAt?: string | null;
  asOfDate?: string | null;
}

export interface BrokerSyncRun {
  runId: string;
  accountId: string;
  trigger: BrokerSyncTrigger;
  scope: BrokerSyncScope;
  status: BrokerSyncRunStatus;
  requestedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  warningCount: number;
  rowsSynced?: number | null;
  summary?: string | null;
  errorMessage?: string | null;
}

export interface BrokerAccountActivity {
  activityId: string;
  accountId: string;
  activityType: BrokerAccountActionType;
  status: BrokerAccountActionStatus;
  requestedAt: string;
  completedAt?: string | null;
  actor?: string | null;
  summary: string;
  note?: string | null;
  relatedAlertId?: string | null;
}

export interface BrokerAccountSummary {
  accountId: string;
  broker: BrokerVendor;
  name: string;
  accountNumberMasked?: string | null;
  baseCurrency: string;
  overallStatus: BrokerHealthTone;
  tradeReadiness: BrokerTradeReadiness;
  tradeReadinessReason?: string | null;
  highestAlertSeverity?: BrokerAlertSeverity | null;
  connectionHealth: BrokerConnectionHealth;
  equity: number;
  cash: number;
  buyingPower: number;
  openPositionCount: number;
  openOrderCount: number;
  lastSyncedAt?: string | null;
  snapshotAsOf?: string | null;
  activePortfolioName?: string | null;
  strategyLabel?: string | null;
  alertCount: number;
}

export interface BrokerAccountDetail {
  account: BrokerAccountSummary;
  capabilities: BrokerCapabilityFlags;
  accountType: BrokerAccountType;
  tradingBlocked: boolean;
  tradingBlockedReason?: string | null;
  unsettledFunds?: number | null;
  dayTradeBuyingPower?: number | null;
  maintenanceExcess?: number | null;
  alerts: BrokerAccountAlert[];
  syncRuns: BrokerSyncRun[];
  recentActivity: BrokerAccountActivity[];
}

export interface BrokerAccountListResponse {
  accounts: BrokerAccountSummary[];
  generatedAt?: string | null;
}

export interface ReconnectBrokerAccountRequest {
  reason: string;
}

export interface PauseBrokerSyncRequest {
  paused: boolean;
  reason: string;
}

export interface RefreshBrokerAccountRequest {
  scope: BrokerSyncScope;
  force: boolean;
  reason: string;
}

export interface AcknowledgeBrokerAlertRequest {
  note: string;
}

export interface BrokerAccountActionResponse {
  actionId: string;
  accountId: string;
  action: BrokerAccountActionType;
  status: BrokerAccountActionStatus;
  requestedAt: string;
  message?: string | null;
  resultingConnectionHealth?: BrokerConnectionHealth | null;
  tradeReadiness?: BrokerTradeReadiness | null;
  syncPaused?: boolean | null;
}
