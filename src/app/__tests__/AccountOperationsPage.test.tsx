import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountOperationsPage } from '@/features/accounts/AccountOperationsPage';
import { accountOperationsApi } from '@/services/accountOperationsApi';
import { DataService } from '@/services/DataService';
import { tradeDeskApi } from '@/services/tradeDeskApi';
import { ApiError } from '@/services/apiService';
import { renderWithProviders } from '@/test/utils';
import { toast } from 'sonner';
import type {
  TradeAccountDetailView,
  TradeAccountSummaryView,
  TradeBlotterRow
} from '@/services/tradeDeskModels';
import type {
  BrokerAccountActionResponse,
  BrokerAccountConfiguration,
  BrokerAccountDetail,
  BrokerAccountListResponse,
  BrokerAccountOnboardingCandidateListResponse,
  BrokerAccountOnboardingResponse,
  BrokerAccountSummary
} from '@/types/brokerAccounts';
import type { TradeOrder, TradePosition } from '@asset-allocation/contracts';

const ACCOUNT_POLICY_WRITE_ROLE = 'AssetAllocation.AccountPolicy.Write';

const mockConfig = vi.hoisted(() => ({
  authRequired: false
}));

vi.mock('@/services/accountOperationsApi', () => ({
  accountOperationsApi: {
    listAccounts: vi.fn(),
    getAccountDetail: vi.fn(),
    getConfiguration: vi.fn(),
    listOnboardingCandidates: vi.fn(),
    onboardAccount: vi.fn(),
    reconnectAccount: vi.fn(),
    setSyncPaused: vi.fn(),
    refreshAccount: vi.fn(),
    acknowledgeAlert: vi.fn(),
    saveTradingPolicy: vi.fn(),
    saveAllocation: vi.fn()
  },
  accountOperationsKeys: {
    all: () => ['account-operations'],
    list: () => ['account-operations', 'list'],
    detail: (accountId: string | null) => ['account-operations', 'detail', accountId ?? 'none'],
    configuration: (accountId: string | null) => [
      'account-operations',
      'configuration',
      accountId ?? 'none'
    ],
    onboardingCandidates: (provider: string | null, environment: string | null) => [
      'account-operations',
      'onboarding-candidates',
      provider ?? 'none',
      environment ?? 'none'
    ]
  }
}));

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    getAuthSessionStatusWithMeta: vi.fn()
  }
}));

vi.mock('@/services/tradeDeskApi', () => ({
  tradeDeskApi: {
    listAccounts: vi.fn(),
    getAccountDetail: vi.fn(),
    listPositions: vi.fn(),
    listOrders: vi.fn(),
    listHistory: vi.fn(),
    listBlotter: vi.fn()
  },
  tradeDeskKeys: {
    all: () => ['trade-desk'],
    accounts: () => ['trade-desk', 'accounts'],
    detail: (accountId: string | null) => ['trade-desk', 'detail', accountId ?? 'none'],
    positions: (accountId: string | null) => ['trade-desk', 'positions', accountId ?? 'none'],
    orders: (accountId: string | null) => ['trade-desk', 'orders', accountId ?? 'none'],
    history: (accountId: string | null) => ['trade-desk', 'history', accountId ?? 'none'],
    blotter: (accountId: string | null) => ['trade-desk', 'blotter', accountId ?? 'none']
  }
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();

const disconnectedAccount: BrokerAccountSummary = {
  accountId: 'acct-schwab-1',
  broker: 'schwab',
  name: 'Schwab Core',
  accountNumberMasked: '****4421',
  baseCurrency: 'USD',
  overallStatus: 'critical',
  tradeReadiness: 'blocked',
  tradeReadinessReason: 'Broker session expired and order permissions are stale.',
  highestAlertSeverity: 'critical',
  connectionHealth: {
    overallStatus: 'critical',
    authStatus: 'expired',
    connectionState: 'reconnect_required',
    syncStatus: 'failed',
    lastCheckedAt: '2026-04-20T13:45:00Z',
    lastSuccessfulSyncAt: '2026-04-20T12:00:00Z',
    lastFailedSyncAt: '2026-04-20T13:40:00Z',
    authExpiresAt: '2026-04-20T13:30:00Z',
    staleReason: 'Broker session expired.',
    failureMessage: 'Reconnect required before trade posture can be trusted.',
    syncPaused: false
  },
  equity: 520000,
  cash: 110000,
  buyingPower: 250000,
  openPositionCount: 18,
  openOrderCount: 3,
  lastSyncedAt: '2026-04-20T12:00:00Z',
  snapshotAsOf: '2026-04-20T12:00:00Z',
  activePortfolioName: 'Macro Core',
  strategyLabel: 'Core Rotation',
  configurationVersion: 7,
  allocationSummary: {
    portfolioName: 'Macro Core',
    portfolioVersion: 4,
    allocationMode: 'percent',
    allocatableCapital: 250000,
    allocatedPercent: 100,
    allocatedNotionalBaseCcy: 250000,
    remainingPercent: 0,
    remainingNotionalBaseCcy: 0,
    sharedActivePortfolio: false,
    effectiveFrom: '2026-04-20T00:00:00Z',
    items: [
      {
        sleeveId: 'macro-core',
        sleeveName: 'Macro Core',
        strategy: {
          strategyName: 'core-rotation',
          strategyVersion: 2
        },
        allocationMode: 'percent',
        targetWeightPct: 100,
        targetNotionalBaseCcy: null,
        derivedWeightPct: 100,
        enabled: true,
        notes: 'Primary strategy allocation.'
      }
    ]
  },
  alertCount: 2
};

const warningAccount: BrokerAccountSummary = {
  accountId: 'acct-etrade-1',
  broker: 'etrade',
  name: 'E*TRADE Income',
  accountNumberMasked: '****9918',
  baseCurrency: 'USD',
  overallStatus: 'warning',
  tradeReadiness: 'review',
  tradeReadinessReason: 'Balances are stale ahead of the next rebalance window.',
  highestAlertSeverity: 'warning',
  connectionHealth: {
    overallStatus: 'warning',
    authStatus: 'expires_soon',
    connectionState: 'degraded',
    syncStatus: 'stale',
    lastCheckedAt: '2026-04-20T13:48:00Z',
    lastSuccessfulSyncAt: '2026-04-20T12:55:00Z',
    lastFailedSyncAt: null,
    authExpiresAt: '2026-04-20T18:30:00Z',
    staleReason: 'Last sync missed the freshness threshold.',
    failureMessage: null,
    syncPaused: false
  },
  equity: 310000,
  cash: 42000,
  buyingPower: 160000,
  openPositionCount: 12,
  openOrderCount: 1,
  lastSyncedAt: '2026-04-20T12:55:00Z',
  snapshotAsOf: '2026-04-20T12:55:00Z',
  activePortfolioName: 'Income Sleeve',
  strategyLabel: 'Carry Basket',
  alertCount: 1
};

const healthyAccount: BrokerAccountSummary = {
  accountId: 'acct-alpaca-1',
  broker: 'alpaca',
  name: 'Alpaca Momentum',
  accountNumberMasked: '****1104',
  baseCurrency: 'USD',
  overallStatus: 'healthy',
  tradeReadiness: 'ready',
  tradeReadinessReason: null,
  highestAlertSeverity: null,
  connectionHealth: {
    overallStatus: 'healthy',
    authStatus: 'authenticated',
    connectionState: 'connected',
    syncStatus: 'fresh',
    lastCheckedAt: '2026-04-20T13:49:00Z',
    lastSuccessfulSyncAt: '2026-04-20T13:45:00Z',
    lastFailedSyncAt: null,
    authExpiresAt: '2026-04-21T14:00:00Z',
    staleReason: null,
    failureMessage: null,
    syncPaused: false
  },
  equity: 640000,
  cash: 140000,
  buyingPower: 550000,
  openPositionCount: 25,
  openOrderCount: 4,
  lastSyncedAt: '2026-04-20T13:45:00Z',
  snapshotAsOf: '2026-04-20T13:45:00Z',
  activePortfolioName: 'Momentum Sleeve',
  strategyLabel: 'Trend Engine',
  alertCount: 0
};

const listResponse: BrokerAccountListResponse = {
  accounts: [healthyAccount, warningAccount, disconnectedAccount],
  generatedAt: '2026-04-20T13:50:00Z'
};

const onboardingCandidatesResponse: BrokerAccountOnboardingCandidateListResponse = {
  candidates: [
    {
      candidateId: 'alpaca:paper:123',
      provider: 'alpaca',
      environment: 'paper',
      suggestedAccountId: 'alpaca-paper',
      displayName: 'Alpaca Paper',
      accountNumberMasked: '***6789',
      baseCurrency: 'USD',
      state: 'available',
      stateReason: null,
      existingAccountId: null,
      allowedExecutionPostures: ['monitor_only', 'paper'],
      blockedExecutionPostureReasons: {
        live: 'Live posture requires environment=live.'
      },
      canOnboard: true
    }
  ],
  discoveryStatus: 'completed',
  message: '',
  generatedAt: '2026-04-20T13:50:00Z'
};

const onboardedAccount: BrokerAccountSummary = {
  accountId: 'alpaca-paper',
  broker: 'alpaca',
  name: 'Alpaca Paper',
  accountNumberMasked: '***6789',
  baseCurrency: 'USD',
  overallStatus: 'warning',
  tradeReadiness: 'review',
  tradeReadinessReason: 'Seeded through broker onboarding; refresh required.',
  highestAlertSeverity: null,
  connectionHealth: {
    overallStatus: 'warning',
    authStatus: 'authenticated',
    connectionState: 'degraded',
    syncStatus: 'never_synced',
    lastCheckedAt: '2026-04-20T13:50:00Z',
    lastSuccessfulSyncAt: null,
    lastFailedSyncAt: null,
    authExpiresAt: null,
    staleReason: 'Seeded through broker onboarding; initial refresh pending.',
    failureMessage: null,
    syncPaused: false
  },
  equity: 0,
  cash: 0,
  buyingPower: 0,
  openPositionCount: 0,
  openOrderCount: 0,
  lastSyncedAt: null,
  snapshotAsOf: '2026-04-20T13:50:00Z',
  activePortfolioName: null,
  strategyLabel: null,
  configurationVersion: null,
  allocationSummary: null,
  alertCount: 0
};

const onboardingResponse: BrokerAccountOnboardingResponse = {
  account: onboardedAccount,
  configuration: null,
  created: true,
  reenabled: false,
  refreshAction: null,
  audit: null,
  message: 'Broker account onboarded.',
  generatedAt: '2026-04-20T13:50:00Z'
};

const configurationResponse: BrokerAccountConfiguration = {
  accountId: disconnectedAccount.accountId,
  accountName: disconnectedAccount.name,
  baseCurrency: disconnectedAccount.baseCurrency,
  configurationVersion: 7,
  requestedPolicy: {
    maxOpenPositions: 20,
    maxSinglePositionExposure: {
      mode: 'pct_of_allocatable_capital',
      value: 12.5
    },
    allowedSides: ['long'],
    allowedAssetClasses: ['equity', 'option'],
    requireOrderConfirmation: true
  },
  effectivePolicy: {
    maxOpenPositions: 20,
    maxSinglePositionExposure: {
      mode: 'pct_of_allocatable_capital',
      value: 12.5
    },
    allowedSides: ['long'],
    allowedAssetClasses: ['equity'],
    requireOrderConfirmation: true
  },
  capabilities: {
    canReadBalances: true,
    canReadPositions: true,
    canReadOrders: true,
    canTrade: false,
    canReconnect: true,
    canPauseSync: true,
    canRefresh: true,
    canAcknowledgeAlerts: true,
    canReadTradingPolicy: true,
    canWriteTradingPolicy: true,
    canReadAllocation: true,
    canWriteAllocation: true,
    canReleaseTradeConfirmation: false,
    readOnlyReason: null
  },
  allocation: disconnectedAccount.allocationSummary!,
  warnings: ['Current book exceeds the tighter max-open-positions rule.'],
  updatedAt: '2026-04-20T13:58:00Z',
  updatedBy: 'desk-op',
  audit: [
    {
      auditId: 'audit-1',
      accountId: disconnectedAccount.accountId,
      category: 'trading_policy',
      outcome: 'saved',
      requestedAt: '2026-04-20T13:58:00Z',
      actor: 'desk-op',
      requestId: 'req-1',
      grantedRoles: ['AssetAllocation.AccountPolicy.Write'],
      summary: 'Updated trading policy from account operations.',
      before: {},
      after: {},
      denialReason: null
    }
  ]
};

const detailResponse: BrokerAccountDetail = {
  account: disconnectedAccount,
  capabilities: {
    canReadBalances: true,
    canReadPositions: true,
    canReadOrders: true,
    canTrade: false,
    canReconnect: true,
    canPauseSync: true,
    canRefresh: true,
    canAcknowledgeAlerts: true,
    canReadTradingPolicy: true,
    canWriteTradingPolicy: true,
    canReadAllocation: true,
    canWriteAllocation: true,
    canReleaseTradeConfirmation: false,
    readOnlyReason: null
  },
  accountType: 'margin',
  tradingBlocked: true,
  tradingBlockedReason: 'Reconnect is required before routing any orders.',
  unsettledFunds: 12000,
  dayTradeBuyingPower: 180000,
  maintenanceExcess: 45000,
  alerts: [
    {
      alertId: 'alert-1',
      accountId: disconnectedAccount.accountId,
      severity: 'critical',
      status: 'open',
      code: 'broker_session_expired',
      title: 'Broker session expired',
      message: 'Reconnect the Schwab session before the next rebalance cycle.',
      observedAt: '2026-04-20T13:40:00Z',
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      asOfDate: '2026-04-20'
    },
    {
      alertId: 'alert-2',
      accountId: disconnectedAccount.accountId,
      severity: 'warning',
      status: 'acknowledged',
      code: 'permissions_review',
      title: 'Trading permissions under review',
      message: 'Desk operator flagged the account for a quick permissions check.',
      observedAt: '2026-04-20T13:10:00Z',
      acknowledgedAt: '2026-04-20T13:20:00Z',
      acknowledgedBy: 'desk-op',
      resolvedAt: null,
      asOfDate: '2026-04-20'
    }
  ],
  syncRuns: [
    {
      runId: 'sync-1',
      accountId: disconnectedAccount.accountId,
      trigger: 'manual',
      scope: 'full',
      status: 'failed',
      requestedAt: '2026-04-20T13:35:00Z',
      startedAt: '2026-04-20T13:35:02Z',
      completedAt: '2026-04-20T13:35:15Z',
      warningCount: 0,
      rowsSynced: null,
      summary: null,
      errorMessage: 'Session refresh failed at the broker boundary.'
    }
  ],
  recentActivity: [
    {
      activityId: 'act-1',
      accountId: disconnectedAccount.accountId,
      activityType: 'reconnect',
      status: 'accepted',
      requestedAt: '2026-04-20T13:41:00Z',
      completedAt: null,
      actor: 'desk-op',
      summary: 'Reconnect request submitted from the operations board.',
      note: null,
      relatedAlertId: 'alert-1'
    }
  ],
  configuration: configurationResponse
};

const tradeCapabilities = {
  canReadAccount: true,
  canReadPositions: true,
  canReadOrders: true,
  canReadHistory: true,
  canPreview: true,
  canSubmitPaper: true,
  canSubmitSandbox: false,
  canSubmitLive: false,
  canCancel: true,
  supportsMarketOrders: true,
  supportsLimitOrders: true,
  supportsStopOrders: false,
  supportsFractionalQuantity: true,
  supportsNotionalOrders: true,
  supportsEquities: true,
  supportsEtfs: true,
  supportsOptions: false,
  readOnly: false,
  unsupportedReason: null
};

const tradeFreshness = {
  balancesState: 'stale',
  positionsState: 'fresh',
  ordersState: 'fresh',
  balancesAsOf: '2026-04-20T12:00:00Z',
  positionsAsOf: '2026-04-20T13:45:00Z',
  ordersAsOf: '2026-04-20T13:46:00Z',
  maxAgeSeconds: 900,
  staleReason: 'Balances missed the freshness threshold.'
} as const;

const disconnectedTradeAccount: TradeAccountSummaryView = {
  accountId: disconnectedAccount.accountId,
  name: disconnectedAccount.name,
  provider: 'schwab',
  environment: 'live',
  accountNumberMasked: disconnectedAccount.accountNumberMasked,
  baseCurrency: disconnectedAccount.baseCurrency,
  readiness: 'blocked',
  readinessReason: 'Broker session expired and order permissions are stale.',
  capabilities: {
    ...tradeCapabilities,
    canSubmitLive: false,
    readOnly: true,
    unsupportedReason: 'Reconnect required before live routing.'
  },
  cash: disconnectedAccount.cash,
  buyingPower: disconnectedAccount.buyingPower,
  equity: disconnectedAccount.equity,
  openOrderCount: 3,
  positionCount: 18,
  unresolvedAlertCount: 2,
  killSwitchActive: true,
  pnl: {
    realizedPnl: 2100,
    unrealizedPnl: -5200,
    dayPnl: -1250,
    grossExposure: 410000,
    netExposure: 285000,
    asOf: '2026-04-20T13:45:00Z'
  },
  lastSyncedAt: disconnectedAccount.lastSyncedAt,
  lastTradeAt: '2026-04-20T13:15:00Z',
  snapshotAsOf: disconnectedAccount.snapshotAsOf,
  freshness: tradeFreshness,
  policyVersion: 7,
  projectedTradingPolicy: null,
  confirmationRequired: true
};

const warningTradeAccount: TradeAccountSummaryView = {
  ...disconnectedTradeAccount,
  accountId: warningAccount.accountId,
  name: warningAccount.name,
  provider: 'etrade',
  environment: 'paper',
  accountNumberMasked: warningAccount.accountNumberMasked,
  readiness: 'review',
  readinessReason: warningAccount.tradeReadinessReason,
  capabilities: tradeCapabilities,
  cash: warningAccount.cash,
  buyingPower: warningAccount.buyingPower,
  equity: warningAccount.equity,
  openOrderCount: 1,
  positionCount: 12,
  unresolvedAlertCount: 1,
  killSwitchActive: false,
  pnl: {
    realizedPnl: 800,
    unrealizedPnl: 1100,
    dayPnl: 200,
    grossExposure: 180000,
    netExposure: 92000,
    asOf: '2026-04-20T13:45:00Z'
  },
  lastSyncedAt: warningAccount.lastSyncedAt,
  lastTradeAt: '2026-04-20T12:30:00Z',
  snapshotAsOf: warningAccount.snapshotAsOf,
  freshness: {
    ...tradeFreshness,
    balancesState: 'stale',
    positionsState: 'stale',
    ordersState: 'fresh'
  },
  confirmationRequired: false
};

const healthyTradeAccount: TradeAccountSummaryView = {
  ...disconnectedTradeAccount,
  accountId: healthyAccount.accountId,
  name: healthyAccount.name,
  provider: 'alpaca',
  environment: 'paper',
  accountNumberMasked: healthyAccount.accountNumberMasked,
  readiness: 'ready',
  readinessReason: null,
  capabilities: tradeCapabilities,
  cash: healthyAccount.cash,
  buyingPower: healthyAccount.buyingPower,
  equity: healthyAccount.equity,
  openOrderCount: 4,
  positionCount: 25,
  unresolvedAlertCount: 0,
  killSwitchActive: false,
  pnl: {
    realizedPnl: 12000,
    unrealizedPnl: 6400,
    dayPnl: 750,
    grossExposure: 500000,
    netExposure: 360000,
    asOf: '2026-04-20T13:45:00Z'
  },
  lastSyncedAt: healthyAccount.lastSyncedAt,
  lastTradeAt: '2026-04-20T13:20:00Z',
  snapshotAsOf: healthyAccount.snapshotAsOf,
  freshness: {
    ...tradeFreshness,
    balancesState: 'fresh',
    positionsState: 'fresh',
    ordersState: 'fresh',
    staleReason: null
  },
  confirmationRequired: false
};

const kalshiTradeAccount: TradeAccountSummaryView = {
  ...healthyTradeAccount,
  accountId: 'acct-kalshi-1',
  name: 'Kalshi Forecasts',
  provider: 'kalshi' as TradeAccountSummaryView['provider'],
  environment: 'live',
  accountNumberMasked: 'KLSH-01',
  readiness: 'review',
  readinessReason: 'Event-contract venue is enabled for monitoring only.',
  capabilities: {
    ...tradeCapabilities,
    canPreview: false,
    canSubmitPaper: false,
    canCancel: false,
    supportsMarketOrders: false,
    supportsLimitOrders: false,
    supportsEquities: false,
    supportsEtfs: false,
    readOnly: true,
    unsupportedReason: 'Kalshi account operations are monitoring-only.'
  },
  cash: 25000,
  buyingPower: 25000,
  equity: 25000,
  openOrderCount: 1,
  positionCount: 2,
  unresolvedAlertCount: 0,
  killSwitchActive: false,
  pnl: null,
  lastTradeAt: null,
  confirmationRequired: false
};

const tradeAccountList = {
  accounts: [healthyTradeAccount, warningTradeAccount, disconnectedTradeAccount],
  generatedAt: '2026-04-20T13:50:00Z'
};

const positionRows: TradePosition[] = [
  {
    accountId: disconnectedAccount.accountId,
    symbol: 'MSFT',
    assetClass: 'equity',
    quantity: 10,
    marketValue: 4200,
    averageEntryPrice: 380,
    lastPrice: 420,
    costBasis: 3800,
    unrealizedPnl: 400,
    unrealizedPnlPercent: 10.53,
    dayPnl: 125,
    weight: 0.01,
    asOf: '2026-04-20T13:45:00Z'
  }
];

const openOrderRows: TradeOrder[] = [
  {
    orderId: 'order-open-1',
    accountId: disconnectedAccount.accountId,
    provider: 'schwab',
    environment: 'live',
    status: 'accepted',
    symbol: 'AAPL',
    side: 'buy',
    orderType: 'limit',
    timeInForce: 'day',
    assetClass: 'equity',
    clientRequestId: 'client-open-1',
    idempotencyKey: 'idem-open-1',
    correlationId: null,
    providerOrderId: 'provider-open-1',
    providerCorrelationId: null,
    quantity: 5,
    notional: null,
    limitPrice: 180,
    stopPrice: null,
    estimatedPrice: null,
    estimatedNotional: 900,
    filledQuantity: 0,
    averageFillPrice: null,
    submittedAt: '2026-04-20T13:30:00Z',
    acceptedAt: '2026-04-20T13:30:05Z',
    filledAt: null,
    cancelledAt: null,
    expiresAt: null,
    createdAt: '2026-04-20T13:30:00Z',
    updatedAt: '2026-04-20T13:30:05Z',
    statusReason: null,
    riskChecks: [],
    reconciliationRequired: false
  }
];

const historyRows: TradeOrder[] = [
  ...openOrderRows,
  {
    ...openOrderRows[0],
    orderId: 'order-filled-1',
    status: 'filled',
    symbol: 'NVDA',
    filledQuantity: 2,
    averageFillPrice: 900,
    filledAt: '2026-04-20T13:40:00Z',
    updatedAt: '2026-04-20T13:40:00Z'
  }
];

const blotterRows: TradeBlotterRow[] = [
  {
    rowId: 'blotter-1',
    accountId: disconnectedAccount.accountId,
    provider: 'schwab',
    environment: 'live',
    eventType: 'fill',
    occurredAt: '2026-04-20T13:40:00Z',
    orderId: 'order-filled-1',
    providerOrderId: 'provider-filled-1',
    clientRequestId: 'client-filled-1',
    symbol: 'NVDA',
    side: 'buy',
    status: 'filled',
    quantity: 2,
    price: 900,
    fees: 1.5,
    realizedPnl: 125,
    cashImpact: -1801.5,
    note: null
  }
];

const tradeDetailResponse: TradeAccountDetailView = {
  account: disconnectedTradeAccount,
  restrictions: ['Reconnect required before execution.'],
  riskLimits: {
    maxOrderNotional: 50000,
    maxDailyNotional: 100000,
    maxShareQuantity: 1000,
    allowedAssetClasses: ['equity'],
    allowedOrderTypes: ['market', 'limit'],
    liveTradingAllowed: false,
    liveTradingReason: 'Live routing is blocked while the broker session is expired.'
  },
  unresolvedAlerts: ['Broker session expired.'],
  alerts: [],
  recentAuditEvents: [
    {
      eventId: 'trade-audit-1',
      accountId: disconnectedAccount.accountId,
      provider: 'schwab',
      environment: 'live',
      eventType: 'submit',
      severity: 'warning',
      occurredAt: '2026-04-20T13:40:00Z',
      actor: 'desk-op',
      orderId: 'order-filled-1',
      providerOrderId: 'provider-filled-1',
      clientRequestId: 'client-filled-1',
      idempotencyKey: 'idem-filled-1',
      previewId: null,
      confirmationTokenId: null,
      requestId: 'req-trade-1',
      statusBefore: 'accepted',
      statusAfter: 'filled',
      summary: 'Live trade filled under supervisory review.',
      sanitizedError: null,
      denialReason: null,
      grantedRoles: ['AssetAllocation.Trade.Read'],
      details: {}
    }
  ]
};

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function cloneConfiguration(
  overrides: Partial<BrokerAccountConfiguration> = {}
): BrokerAccountConfiguration {
  return {
    ...cloneJson(configurationResponse),
    ...overrides
  };
}

function detailWithConfiguration(configuration: BrokerAccountConfiguration): BrokerAccountDetail {
  return {
    ...cloneJson(detailResponse),
    capabilities: configuration.capabilities,
    configuration
  };
}

function mockLoadedConfiguration(configuration: BrokerAccountConfiguration): void {
  vi.mocked(accountOperationsApi.getAccountDetail).mockResolvedValue(
    detailWithConfiguration(configuration)
  );
  vi.mocked(accountOperationsApi.getConfiguration).mockResolvedValue(configuration);
}

function buildActionResponse(
  action: BrokerAccountActionResponse['action']
): BrokerAccountActionResponse {
  return {
    actionId: `${action}-1`,
    accountId: disconnectedAccount.accountId,
    action,
    status: 'accepted',
    requestedAt: '2026-04-20T13:55:00Z',
    message: null,
    resultingConnectionHealth: disconnectedAccount.connectionHealth,
    tradeReadiness: disconnectedAccount.tradeReadiness,
    syncPaused: false
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function authSessionWithRoles(grantedRoles: string[]) {
  return {
    data: {
      authMode: 'oidc',
      subject: 'desk-op',
      displayName: 'Desk Operator',
      username: 'desk@example.com',
      requiredRoles: ['AssetAllocation.Access'],
      grantedRoles
    },
    meta: {
      requestId: 'session-req-1',
      status: 200,
      durationMs: 12,
      url: '/api/auth/session'
    }
  };
}

describe('AccountOperationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.authRequired = false;
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue(
      authSessionWithRoles([ACCOUNT_POLICY_WRITE_ROLE])
    );
    vi.mocked(accountOperationsApi.listAccounts).mockResolvedValue(listResponse);
    vi.mocked(accountOperationsApi.getAccountDetail).mockResolvedValue(detailResponse);
    vi.mocked(accountOperationsApi.getConfiguration).mockResolvedValue(configurationResponse);
    vi.mocked(accountOperationsApi.listOnboardingCandidates).mockResolvedValue(
      onboardingCandidatesResponse
    );
    vi.mocked(accountOperationsApi.onboardAccount).mockResolvedValue(onboardingResponse);
    vi.mocked(accountOperationsApi.refreshAccount).mockResolvedValue(
      buildActionResponse('refresh')
    );
    vi.mocked(accountOperationsApi.reconnectAccount).mockResolvedValue(
      buildActionResponse('reconnect')
    );
    vi.mocked(accountOperationsApi.setSyncPaused).mockResolvedValue(
      buildActionResponse('pause_sync')
    );
    vi.mocked(accountOperationsApi.acknowledgeAlert).mockResolvedValue(
      buildActionResponse('acknowledge_alert')
    );
    vi.mocked(accountOperationsApi.saveTradingPolicy).mockResolvedValue(configurationResponse);
    vi.mocked(accountOperationsApi.saveAllocation).mockResolvedValue(configurationResponse);
    vi.mocked(tradeDeskApi.listAccounts).mockResolvedValue(tradeAccountList);
    vi.mocked(tradeDeskApi.getAccountDetail).mockResolvedValue(tradeDetailResponse);
    vi.mocked(tradeDeskApi.listPositions).mockResolvedValue({
      accountId: disconnectedAccount.accountId,
      positions: positionRows,
      generatedAt: '2026-04-20T13:50:00Z',
      freshness: tradeFreshness
    });
    vi.mocked(tradeDeskApi.listOrders).mockResolvedValue({
      accountId: disconnectedAccount.accountId,
      orders: openOrderRows,
      generatedAt: '2026-04-20T13:50:00Z'
    });
    vi.mocked(tradeDeskApi.listHistory).mockResolvedValue({
      accountId: disconnectedAccount.accountId,
      orders: historyRows,
      generatedAt: '2026-04-20T13:50:00Z'
    });
    vi.mocked(tradeDeskApi.listBlotter).mockResolvedValue({
      accountId: disconnectedAccount.accountId,
      rows: blotterRows,
      generatedAt: '2026-04-20T13:50:00Z'
    });
  });

  it('renders the board summary and sorts the board by exception priority', async () => {
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    expect(screen.getByText('Configured Accounts')).toBeInTheDocument();
    expect(screen.getAllByText('Trade Ready').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Needs Action').length).toBeGreaterThan(0);
    expect(screen.getByText('$960,000')).toBeInTheDocument();
    expect(
      screen.getByText(/1 currently connected in the visible account set/i)
    ).toBeInTheDocument();

    const cardIds = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="account-card-"]')
    ).map((element) => element.dataset.testid);

    expect(cardIds).toEqual([
      'account-card-acct-schwab-1',
      'account-card-acct-etrade-1',
      'account-card-acct-alpaca-1'
    ]);
  });

  it('renders board-header search and scope controls that filter the account queue', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Account search')).toBeInTheDocument();
    expect(screen.getByLabelText('Broker filter')).toBeInTheDocument();
    expect(screen.getByLabelText('Status filter')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Account scope' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Account search'), 'alpaca');

    await waitFor(() => {
      expect(screen.getByTestId('account-card-acct-alpaca-1')).toBeInTheDocument();
      expect(screen.queryByTestId('account-card-acct-schwab-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('account-card-acct-etrade-1')).not.toBeInTheDocument();
    });
  });

  it('opens the account dossier and renders the detail tabs including configuration', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /open dossier/i })[0]);

    expect(await screen.findByRole('heading', { name: /schwab core/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(accountOperationsApi.getAccountDetail).toHaveBeenCalledWith(
        disconnectedAccount.accountId,
        expect.anything()
      );
    });

    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Connectivity' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Risk' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Monitoring' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Configuration' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Connectivity' }));
    expect(await screen.findByText(/capability flags/i)).toBeInTheDocument();
    expect(screen.getByText('Read Balances')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Risk' }));
    expect(
      await screen.findByText(/reconnect the schwab session before the next rebalance cycle/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(await screen.findByText(/reconnect request submitted/i)).toBeInTheDocument();
  });

  it('renders account-scoped monitoring with positions, orders, history, blotter, freshness, and links', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /open dossier/i })[0]);
    await user.click(await screen.findByRole('tab', { name: 'Monitoring' }));

    expect(await screen.findByText(/positions, orders, fills, p&l/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open in trade desk/i })).toHaveAttribute(
      'href',
      '/trade-desk?accountId=acct-schwab-1'
    );
    expect(screen.getByRole('link', { name: /open in trade monitor/i })).toHaveAttribute(
      'href',
      '/trade-monitor?accountId=acct-schwab-1'
    );
    expect(screen.getByText(/balances feed/i)).toBeInTheDocument();
    expect(screen.getByText(/trade risk controls/i)).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Open Orders' }));
    expect(await screen.findByText('AAPL')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(await screen.findByText('NVDA')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Blotter/Fills' }));
    expect(await screen.findByText(/cash impact/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Trade Activity' }));
    expect(
      await screen.findByText(/live trade filled under supervisory review/i)
    ).toBeInTheDocument();
  });

  it('loads and saves account configuration from the configuration tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /open dossier/i })[0]);
    await user.click(screen.getByRole('tab', { name: 'Configuration' }));

    expect(await screen.findByText(/execution guardrails/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(accountOperationsApi.getConfiguration).toHaveBeenCalledWith(
        disconnectedAccount.accountId,
        expect.anything()
      );
    });

    const maxOpenPositionsInput = screen.getByLabelText(/max open positions/i);
    await user.clear(maxOpenPositionsInput);
    await user.type(maxOpenPositionsInput, '24');

    await user.click(screen.getByRole('button', { name: /save trading policy/i }));

    await waitFor(() => {
      expect(accountOperationsApi.saveTradingPolicy).toHaveBeenCalledWith(
        disconnectedAccount.accountId,
        expect.objectContaining({
          expectedConfigurationVersion: configurationResponse.configurationVersion,
          requestedPolicy: expect.objectContaining({
            maxOpenPositions: 24
          })
        })
      );
    });
  });

  it('validates trading policy inputs before saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /open dossier/i })[0]);
    await user.click(screen.getByRole('tab', { name: 'Configuration' }));

    await user.click(await screen.findByRole('button', { name: 'long' }));
    expect(screen.getByText(/select at least one allowed side/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save trading policy/i }));

    expect(
      screen.getByText(/resolve the inline validation errors before saving/i)
    ).toBeInTheDocument();
    expect(accountOperationsApi.saveTradingPolicy).not.toHaveBeenCalled();
  });

  it('disables trading policy controls when policy writes are not allowed', async () => {
    const readOnlyConfiguration = cloneConfiguration({
      capabilities: {
        ...configurationResponse.capabilities,
        canWriteTradingPolicy: false,
        readOnlyReason: 'Broker account is read-only during permissions review.'
      }
    });
    mockLoadedConfiguration(readOnlyConfiguration);

    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /open dossier/i })[0]);
    await user.click(screen.getByRole('tab', { name: 'Configuration' }));

    expect(await screen.findByText(/broker account is read-only/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max open positions/i)).toBeDisabled();
    expect(screen.getByLabelText(/max single-position exposure/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'long' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'option' })).toBeDisabled();
  });

  it('blocks retry after a stale trading policy save until the draft is discarded', async () => {
    vi.mocked(accountOperationsApi.saveTradingPolicy).mockRejectedValueOnce(
      new ApiError(409, 'Configuration version conflict')
    );

    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /open dossier/i })[0]);
    await user.click(screen.getByRole('tab', { name: 'Configuration' }));

    const maxOpenPositionsInput = await screen.findByLabelText(/max open positions/i);
    await user.clear(maxOpenPositionsInput);
    await user.type(maxOpenPositionsInput, '24');
    await user.click(screen.getByRole('button', { name: /save trading policy/i }));

    expect(await screen.findByText(/configuration changed on the server/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save trading policy/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /discard changes/i }));
    expect(screen.getByRole('button', { name: /no changes/i })).toBeDisabled();
  });

  it('saves policy before allocation and passes the returned version to allocation', async () => {
    const savedPolicyConfiguration = cloneConfiguration({
      configurationVersion: 8,
      requestedPolicy: {
        ...configurationResponse.requestedPolicy,
        maxOpenPositions: 24
      },
      effectivePolicy: {
        ...configurationResponse.effectivePolicy,
        maxOpenPositions: 24
      }
    });
    const savedAllocationConfiguration = cloneConfiguration({
      configurationVersion: 9
    });
    vi.mocked(accountOperationsApi.saveTradingPolicy).mockResolvedValueOnce(
      savedPolicyConfiguration
    );
    vi.mocked(accountOperationsApi.saveAllocation).mockResolvedValueOnce(
      savedAllocationConfiguration
    );

    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /open dossier/i })[0]);
    await user.click(screen.getByRole('tab', { name: 'Configuration' }));

    const maxOpenPositionsInput = await screen.findByLabelText(/max open positions/i);
    await user.clear(maxOpenPositionsInput);
    await user.type(maxOpenPositionsInput, '24');
    await user.type(screen.getByLabelText(/allocation notes/i), 'rebalance review');

    await user.click(screen.getByRole('button', { name: /save configuration/i }));

    await waitFor(() => {
      expect(accountOperationsApi.saveTradingPolicy).toHaveBeenCalled();
      expect(accountOperationsApi.saveAllocation).toHaveBeenCalledWith(
        disconnectedAccount.accountId,
        expect.objectContaining({
          expectedConfigurationVersion: 8,
          notes: 'rebalance review'
        })
      );
    });
    expect(
      vi.mocked(accountOperationsApi.saveTradingPolicy).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(accountOperationsApi.saveAllocation).mock.invocationCallOrder[0]);
  });

  it('requires an operator reason before queueing refresh and carries scope in the payload', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<BrokerAccountActionResponse>();
    vi.mocked(accountOperationsApi.refreshAccount).mockReturnValueOnce(deferred.promise);

    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    const refreshButton = screen.getAllByRole('button', { name: /refresh now/i })[0];
    await waitFor(() => {
      expect(refreshButton).not.toBeDisabled();
    });
    await user.click(refreshButton);

    const submitButton = await screen.findByRole('button', { name: /queue refresh/i });
    expect(submitButton).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: /refresh requested before rebalance review/i })
    );
    expect(submitButton).not.toBeDisabled();
    await user.click(submitButton);

    await waitFor(() => {
      expect(accountOperationsApi.refreshAccount).toHaveBeenCalledWith(
        disconnectedAccount.accountId,
        expect.objectContaining({
          scope: 'full',
          force: true,
          reason: 'Refresh requested before rebalance review.'
        })
      );
      expect(submitButton).toBeDisabled();
    });

    deferred.resolve(buildActionResponse('refresh'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Refresh queued.');
    });
  });

  it('disables board actions when prefetched capabilities deny the operation', async () => {
    vi.mocked(accountOperationsApi.getAccountDetail).mockResolvedValue({
      ...detailResponse,
      capabilities: {
        ...detailResponse.capabilities,
        canRefresh: false
      }
    });

    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    const refreshButton = screen.getAllByRole('button', { name: /refresh now/i })[0];

    await waitFor(() => {
      expect(refreshButton).toBeDisabled();
      expect(refreshButton).toHaveAttribute('title', 'Refresh is not supported for this account.');
    });
  });

  it('requires an acknowledgement note before acknowledging account alerts', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /open dossier/i })[0]);
    await user.click(await screen.findByRole('tab', { name: 'Risk' }));

    await user.click(await screen.findByRole('button', { name: 'Acknowledge' }));
    const submitButton = await screen.findByRole('button', { name: /acknowledge alert/i });
    expect(submitButton).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /acknowledged for active desk review/i }));
    await user.click(submitButton);

    await waitFor(() => {
      expect(accountOperationsApi.acknowledgeAlert).toHaveBeenCalledWith(
        disconnectedAccount.accountId,
        'alert-1',
        {
          note: 'Acknowledged for active desk review.'
        }
      );
    });
  });

  it('shows an empty state when no accounts are configured', async () => {
    vi.mocked(accountOperationsApi.listAccounts).mockResolvedValue({
      accounts: [],
      generatedAt: '2026-04-20T13:50:00Z'
    });
    vi.mocked(tradeDeskApi.listAccounts).mockResolvedValue({
      accounts: [],
      generatedAt: '2026-04-20T13:50:00Z'
    });

    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/no configured accounts/i)).toBeInTheDocument();
  });

  it('populates existing trade accounts when broker account rows are missing', async () => {
    vi.mocked(accountOperationsApi.listAccounts).mockResolvedValue({
      accounts: [],
      generatedAt: '2026-04-20T13:50:00Z'
    });

    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByTestId('account-card-acct-alpaca-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-card-acct-etrade-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-card-acct-schwab-1')).toBeInTheDocument();
    expect(screen.queryByText(/no configured accounts/i)).not.toBeInTheDocument();
    expect(accountOperationsApi.onboardAccount).not.toHaveBeenCalled();
  });

  it('renders and filters Kalshi trade account rows when broker account rows are missing', async () => {
    vi.mocked(accountOperationsApi.listAccounts).mockResolvedValue({
      accounts: [],
      generatedAt: '2026-04-20T13:50:00Z'
    });
    vi.mocked(tradeDeskApi.listAccounts).mockResolvedValue({
      accounts: [kalshiTradeAccount],
      generatedAt: '2026-04-20T13:50:00Z'
    });

    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByTestId('account-card-acct-kalshi-1')).toBeInTheDocument();
    expect(screen.getAllByText('Kalshi').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('combobox', { name: /broker filter/i }));
    await user.click(await screen.findByRole('option', { name: 'Kalshi' }));

    expect(screen.getByTestId('account-card-acct-kalshi-1')).toBeInTheDocument();
  });

  it('onboards a discovered broker account from the empty state and renders it on the board', async () => {
    vi.mocked(accountOperationsApi.listAccounts)
      .mockResolvedValueOnce({
        accounts: [],
        generatedAt: '2026-04-20T13:50:00Z'
      })
      .mockResolvedValue({
        accounts: [onboardedAccount],
        generatedAt: '2026-04-20T13:51:00Z'
      });
    vi.mocked(accountOperationsApi.getAccountDetail).mockResolvedValue({
      ...detailResponse,
      account: onboardedAccount,
      accountType: 'paper',
      tradingBlocked: false,
      tradingBlockedReason: null,
      alerts: [],
      syncRuns: [],
      recentActivity: []
    });
    vi.mocked(tradeDeskApi.listAccounts).mockResolvedValue({
      accounts: [],
      generatedAt: '2026-04-20T13:50:00Z'
    });

    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/no configured accounts/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /add account/i })[0]);
    await user.click(await screen.findByRole('button', { name: /discover accounts/i }));

    await user.click(await screen.findByText('Alpaca Paper'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: /paper paper execution posture/i }));
    await user.click(screen.getByRole('button', { name: 'Review' }));
    await user.type(screen.getByLabelText(/operator reason/i), 'Create monitored paper account.');
    await user.click(screen.getByRole('button', { name: /onboard account/i }));

    await waitFor(() => {
      expect(accountOperationsApi.onboardAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: 'alpaca:paper:123',
          provider: 'alpaca',
          environment: 'paper',
          displayName: 'Alpaca Paper',
          readiness: 'review',
          executionPosture: 'paper',
          initialRefresh: true,
          reason: 'Create monitored paper account.'
        })
      );
    });
    expect(await screen.findByTestId('account-card-alpaca-paper')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Account onboarded.');
  });

  it('blocks add account discovery when the current session lacks account policy write', async () => {
    mockConfig.authRequired = true;
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue(
      authSessionWithRoles(['AssetAllocation.AccountPolicy.Read'])
    );

    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(
      await screen.findByText(/Add Account requires AssetAllocation\.AccountPolicy\.Write/i)
    ).toBeInTheDocument();
    const addAccountButton = screen.getByRole('button', { name: /add account/i });
    expect(addAccountButton).toBeDisabled();

    await user.click(addAccountButton);

    expect(accountOperationsApi.listOnboardingCandidates).not.toHaveBeenCalled();
  });

  it('keeps add account discovery available when the current session has account policy write', async () => {
    mockConfig.authRequired = true;
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue(
      authSessionWithRoles([ACCOUNT_POLICY_WRITE_ROLE])
    );

    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    const addAccountButton = await screen.findByRole('button', { name: /add account/i });
    await waitFor(() => expect(addAccountButton).not.toBeDisabled());
    await user.click(addAccountButton);
    await user.click(await screen.findByRole('button', { name: /discover accounts/i }));

    expect(await screen.findByText('Alpaca Paper')).toBeInTheDocument();
    expect(accountOperationsApi.listOnboardingCandidates).toHaveBeenCalled();
  });

  it('shows a friendly missing-role message when discovery returns a write-role 403', async () => {
    vi.mocked(accountOperationsApi.listOnboardingCandidates).mockRejectedValueOnce(
      new ApiError(
        403,
        `API Error: 403 Forbidden [requestId=req-403] - {"detail":"Missing required roles: ${ACCOUNT_POLICY_WRITE_ROLE}."}`
      )
    );

    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    await user.click(await screen.findByRole('button', { name: /add account/i }));
    await user.click(await screen.findByRole('button', { name: /discover accounts/i }));

    expect(
      await screen.findByText(/Add Account requires AssetAllocation\.AccountPolicy\.Write/i)
    ).toBeInTheDocument();
    expect(screen.getByText('req-403')).toBeInTheDocument();
    expect(screen.queryByText(/ApiError: API Error/i)).not.toBeInTheDocument();
  });

  it('does not allow an already configured discovered account to be added again', async () => {
    vi.mocked(accountOperationsApi.listOnboardingCandidates).mockResolvedValue({
      ...onboardingCandidatesResponse,
      candidates: [
        {
          ...onboardingCandidatesResponse.candidates[0],
          state: 'already_configured',
          stateReason: 'Account is already configured.',
          canOnboard: false
        }
      ]
    });

    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add account/i }));
    await user.click(await screen.findByRole('button', { name: /discover accounts/i }));

    expect(await screen.findByText(/account is already configured/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(accountOperationsApi.onboardAccount).not.toHaveBeenCalled();
  });

  it('shows blocked execution postures with explicit reasons during onboarding setup', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add account/i }));
    await user.click(await screen.findByRole('button', { name: /discover accounts/i }));
    await user.click(await screen.findByText('Alpaca Paper'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const liveButton = screen.getByRole('button', {
      name: /live live posture requires environment=live/i
    });
    expect(liveButton).toBeDisabled();
    expect(liveButton).toHaveAttribute('title', 'Live posture requires environment=live.');
  });

  it('shows an unavailable panel when the account list request fails', async () => {
    vi.mocked(accountOperationsApi.listAccounts).mockRejectedValue(
      new Error('API Error: 404 - Not Found')
    );

    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account operations unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/api error: 404 - not found/i)).toBeInTheDocument();
  });

  it('keeps the board visible when the selected account detail request fails', async () => {
    const user = userEvent.setup();
    vi.mocked(accountOperationsApi.getAccountDetail).mockRejectedValue(new Error('detail failed'));

    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /open dossier/i })[0]);

    expect(await screen.findByText(/account dossier unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/detail failed/i)).toBeInTheDocument();
  });

  it('renders adjacent workflow links in the desk verdict rail', async () => {
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/exception brief/i)).toBeInTheDocument();

    const adjacentSurfaceCard = screen.getByText('Adjacent Surfaces').parentElement;
    expect(adjacentSurfaceCard).not.toBeNull();
    expect(
      within(adjacentSurfaceCard as HTMLElement).getByRole('link', { name: /portfolio workspace/i })
    ).toHaveAttribute('href', '/portfolios');
    expect(
      within(adjacentSurfaceCard as HTMLElement).getByRole('link', { name: /runtime config/i })
    ).toHaveAttribute('href', '/runtime-config');
  });
});
