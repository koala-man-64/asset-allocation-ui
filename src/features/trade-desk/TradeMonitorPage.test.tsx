import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test/utils';
import { TradeMonitorPage } from '@/features/trade-desk/TradeMonitorPage';
import type { TradeOrder, TradePosition } from '@asset-allocation/contracts';
import type {
  TradeAccountDetailView,
  TradeAccountSummaryView,
  TradeBlotterRow
} from '@/services/tradeDeskModels';

const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  getAccountDetail: vi.fn(),
  listPositions: vi.fn(),
  listOrders: vi.fn(),
  listHistory: vi.fn(),
  listBlotter: vi.fn()
}));

vi.mock('@/services/tradeDeskApi', () => ({
  tradeDeskApi: {
    listAccounts: mocks.listAccounts,
    getAccountDetail: mocks.getAccountDetail,
    listPositions: mocks.listPositions,
    listOrders: mocks.listOrders,
    listHistory: mocks.listHistory,
    listBlotter: mocks.listBlotter
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

const now = '2026-04-24T15:00:00Z';

const paperAccount: TradeAccountSummaryView = {
  accountId: 'acct-paper',
  name: 'Core Paper',
  provider: 'alpaca',
  environment: 'paper',
  accountNumberMasked: '****1234',
  baseCurrency: 'USD',
  readiness: 'ready',
  readinessReason: null,
  capabilities: {
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
    supportsFractionalQuantity: false,
    supportsNotionalOrders: true,
    supportsEquities: true,
    supportsEtfs: true,
    supportsOptions: false,
    readOnly: false,
    unsupportedReason: null
  },
  cash: 100000,
  buyingPower: 100000,
  equity: 125000,
  openOrderCount: 1,
  positionCount: 1,
  unresolvedAlertCount: 0,
  killSwitchActive: false,
  confirmationRequired: false,
  lastSyncedAt: now,
  snapshotAsOf: now,
  freshness: {
    balancesState: 'fresh',
    positionsState: 'fresh',
    ordersState: 'fresh',
    balancesAsOf: now,
    positionsAsOf: now,
    ordersAsOf: now,
    maxAgeSeconds: 300,
    staleReason: null
  },
  pnl: {
    realizedPnl: 1200,
    unrealizedPnl: 100,
    dayPnl: 45,
    grossExposure: 21000,
    netExposure: 18000,
    asOf: now
  },
  lastTradeAt: now
};

const liveAccount: TradeAccountSummaryView = {
  accountId: 'acct-live',
  name: 'Live Alpha',
  provider: 'schwab',
  environment: 'live',
  accountNumberMasked: '****9876',
  baseCurrency: 'USD',
  readiness: 'review',
  readinessReason: 'Supervisor acknowledgement required before live execution.',
  capabilities: {
    canReadAccount: true,
    canReadPositions: true,
    canReadOrders: true,
    canReadHistory: true,
    canPreview: true,
    canSubmitPaper: false,
    canSubmitSandbox: false,
    canSubmitLive: true,
    canCancel: true,
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsStopOrders: true,
    supportsFractionalQuantity: false,
    supportsNotionalOrders: false,
    supportsEquities: true,
    supportsEtfs: true,
    supportsOptions: false,
    readOnly: false,
    unsupportedReason: null
  },
  cash: 250000,
  buyingPower: 250000,
  equity: 300000,
  openOrderCount: 2,
  positionCount: 2,
  unresolvedAlertCount: 1,
  killSwitchActive: false,
  confirmationRequired: true,
  lastSyncedAt: now,
  snapshotAsOf: now,
  freshness: {
    balancesState: 'fresh',
    positionsState: 'fresh',
    ordersState: 'stale',
    balancesAsOf: now,
    positionsAsOf: now,
    ordersAsOf: now,
    maxAgeSeconds: 300,
    staleReason: 'Order feed lag is under review.'
  },
  pnl: {
    realizedPnl: 3200,
    unrealizedPnl: -240,
    dayPnl: -60,
    grossExposure: 61000,
    netExposure: 45000,
    asOf: now
  },
  lastTradeAt: now
};

const positionsByAccountId: Record<string, TradePosition[]> = {
  'acct-paper': [
    {
      accountId: 'acct-paper',
      symbol: 'MSFT',
      assetClass: 'equity',
      quantity: 10,
      marketValue: 1000,
      averageEntryPrice: 90,
      lastPrice: 100,
      costBasis: 900,
      unrealizedPnl: 100,
      unrealizedPnlPercent: 0.11,
      dayPnl: 5,
      weight: 0.01,
      asOf: now
    }
  ],
  'acct-live': [
    {
      accountId: 'acct-live',
      symbol: 'TSLA',
      assetClass: 'equity',
      quantity: 20,
      marketValue: 4200,
      averageEntryPrice: 205,
      lastPrice: 210,
      costBasis: 4100,
      unrealizedPnl: 100,
      unrealizedPnlPercent: 0.02,
      dayPnl: -35,
      weight: 0.04,
      asOf: now
    }
  ]
};

const ordersByAccountId: Record<string, TradeOrder[]> = {
  'acct-paper': [
    {
      orderId: 'order-paper-1',
      accountId: 'acct-paper',
      provider: 'alpaca',
      environment: 'paper',
      status: 'accepted',
      symbol: 'MSFT',
      side: 'buy',
      orderType: 'market',
      timeInForce: 'day',
      assetClass: 'equity',
      clientRequestId: 'client-paper-1',
      idempotencyKey: 'idem-paper-1',
      correlationId: null,
      providerOrderId: 'alpaca-paper-1',
      providerCorrelationId: null,
      quantity: 1,
      notional: null,
      limitPrice: null,
      stopPrice: null,
      estimatedPrice: null,
      estimatedNotional: null,
      filledQuantity: 0,
      averageFillPrice: null,
      submittedAt: now,
      acceptedAt: now,
      filledAt: null,
      cancelledAt: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
      statusReason: null,
      riskChecks: [],
      reconciliationRequired: false
    }
  ],
  'acct-live': [
    {
      orderId: 'order-live-1',
      accountId: 'acct-live',
      provider: 'schwab',
      environment: 'live',
      status: 'accepted',
      symbol: 'TSLA',
      side: 'sell',
      orderType: 'limit',
      timeInForce: 'day',
      assetClass: 'equity',
      clientRequestId: 'client-live-1',
      idempotencyKey: 'idem-live-1',
      correlationId: null,
      providerOrderId: 'schwab-live-1',
      providerCorrelationId: null,
      quantity: 5,
      notional: null,
      limitPrice: 215,
      stopPrice: null,
      estimatedPrice: null,
      estimatedNotional: 1075,
      filledQuantity: 0,
      averageFillPrice: null,
      submittedAt: now,
      acceptedAt: now,
      filledAt: null,
      cancelledAt: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
      statusReason: null,
      riskChecks: [],
      reconciliationRequired: false
    }
  ]
};

const blotterByAccountId: Record<string, TradeBlotterRow[]> = {
  'acct-paper': [
    {
      rowId: 'blotter-paper-1',
      accountId: 'acct-paper',
      provider: 'alpaca',
      environment: 'paper',
      eventType: 'fill',
      occurredAt: now,
      orderId: 'order-paper-0',
      providerOrderId: 'alpaca-fill-1',
      clientRequestId: 'client-fill-1',
      symbol: 'AAPL',
      side: 'buy',
      status: 'filled',
      quantity: 2,
      price: 180,
      fees: 0,
      realizedPnl: null,
      cashImpact: -360,
      note: null
    }
  ],
  'acct-live': [
    {
      rowId: 'blotter-live-1',
      accountId: 'acct-live',
      provider: 'schwab',
      environment: 'live',
      eventType: 'fill',
      occurredAt: now,
      orderId: 'order-live-0',
      providerOrderId: 'schwab-fill-1',
      clientRequestId: 'client-live-fill-1',
      symbol: 'TSLA',
      side: 'sell',
      status: 'filled',
      quantity: 3,
      price: 212,
      fees: 1.25,
      realizedPnl: 48,
      cashImpact: 634.75,
      note: null
    }
  ]
};

const detailsByAccountId: Record<string, TradeAccountDetailView> = {
  'acct-paper': {
    account: paperAccount,
    restrictions: [],
    riskLimits: {
      maxOrderNotional: 50000,
      maxDailyNotional: 100000,
      maxShareQuantity: 1000,
      allowedAssetClasses: ['equity'],
      allowedOrderTypes: ['market', 'limit'],
      liveTradingAllowed: false,
      liveTradingReason: null
    },
    unresolvedAlerts: [],
    recentAuditEvents: [],
    alerts: []
  },
  'acct-live': {
    account: liveAccount,
    restrictions: ['Heightened supervision is active for live routing.'],
    riskLimits: {
      maxOrderNotional: 75000,
      maxDailyNotional: 150000,
      maxShareQuantity: 2500,
      allowedAssetClasses: ['equity'],
      allowedOrderTypes: ['market', 'limit', 'stop'],
      liveTradingAllowed: true,
      liveTradingReason: null
    },
    unresolvedAlerts: ['Awaiting margin review'],
    recentAuditEvents: [
      {
        eventId: 'audit-live-1',
        accountId: 'acct-live',
        provider: 'schwab',
        environment: 'live',
        eventType: 'submit',
        severity: 'warning',
        occurredAt: now,
        actor: 'trader@example.com',
        orderId: 'order-live-1',
        providerOrderId: 'schwab-live-1',
        clientRequestId: 'client-live-1',
        idempotencyKey: 'idem-live-1',
        statusBefore: 'previewed',
        statusAfter: 'accepted',
        summary: 'Live trade submitted under supervisory review.',
        sanitizedError: null,
        details: {}
      }
    ],
    alerts: [
      {
        alertId: 'alert-live-1',
        accountId: 'acct-live',
        severity: 'warning',
        status: 'open',
        code: 'MARGIN_REVIEW',
        title: 'Awaiting margin review',
        message: 'Awaiting margin review before expanding live exposure.',
        blocking: false,
        observedAt: now
      }
    ]
  }
};

function configureSuccessMocks() {
  mocks.listAccounts.mockResolvedValue({
    accounts: [paperAccount, liveAccount],
    generatedAt: now
  });
  mocks.getAccountDetail.mockImplementation(async (accountId: string) => detailsByAccountId[accountId]);
  mocks.listPositions.mockImplementation(async (accountId: string) => ({
    accountId,
    positions: positionsByAccountId[accountId] ?? [],
    generatedAt: now,
    freshness: (accountId === 'acct-paper' ? paperAccount : liveAccount).freshness
  }));
  mocks.listOrders.mockImplementation(async (accountId: string) => ({
    accountId,
    orders: ordersByAccountId[accountId] ?? [],
    generatedAt: now
  }));
  mocks.listHistory.mockImplementation(async (accountId: string) => ({
    accountId,
    orders: ordersByAccountId[accountId] ?? [],
    generatedAt: now
  }));
  mocks.listBlotter.mockImplementation(async (accountId: string) => ({
    accountId,
    rows: blotterByAccountId[accountId] ?? [],
    generatedAt: now
  }));
}

describe('TradeMonitorPage', () => {
  afterEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    window.history.pushState({}, '', '/');
  });

  it('renders the cross-account board and selected account detail tabs', async () => {
    configureSuccessMocks();
    window.history.pushState({}, '', '/trade-monitor?accountId=acct-live');

    renderWithProviders(<TradeMonitorPage />);

    expect(await screen.findByRole('heading', { name: 'Trade Monitor' })).toBeInTheDocument();
    expect(screen.getByText('All Accounts')).toBeInTheDocument();
    expect(screen.getAllByText('Live Alpha').length).toBeGreaterThan(0);
    expect(
      await screen.findByText('Awaiting margin review before expanding live exposure.')
    ).toBeInTheDocument();

    const deskLinks = screen
      .getAllByRole('link', { name: 'Open in Trade Desk' })
      .map((link) => link.getAttribute('href'));
    expect(deskLinks).toContain('/trade-desk?accountId=acct-live');

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Blotter' }));
    expect(await screen.findByText('TSLA')).toBeInTheDocument();
  });
});
