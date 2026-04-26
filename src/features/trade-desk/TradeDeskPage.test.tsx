import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test/utils';
import { TradeDeskPage } from '@/features/trade-desk/TradeDeskPage';
import type {
  TradeOrder,
  TradeOrderPreviewResponse,
  TradePosition
} from '@asset-allocation/contracts';
import type {
  TradeAccountDetailView,
  TradeAccountSummaryView
} from '@/services/tradeDeskModels';

const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  getAccountDetail: vi.fn(),
  listPositions: vi.fn(),
  listOrders: vi.fn(),
  listHistory: vi.fn(),
  listBlotter: vi.fn(),
  previewOrder: vi.fn(),
  placeOrder: vi.fn(),
  cancelOrder: vi.fn(),
  createKey: vi.fn((prefix = 'trade-desk') => `${prefix}-key`)
}));

vi.mock('@/services/tradeDeskApi', () => ({
  createTradeDeskIdempotencyKey: mocks.createKey,
  tradeDeskApi: {
    listAccounts: mocks.listAccounts,
    getAccountDetail: mocks.getAccountDetail,
    listPositions: mocks.listPositions,
    listOrders: mocks.listOrders,
    listHistory: mocks.listHistory,
    listBlotter: mocks.listBlotter,
    previewOrder: mocks.previewOrder,
    placeOrder: mocks.placeOrder,
    cancelOrder: mocks.cancelOrder
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
    realizedPnl: 2200,
    unrealizedPnl: -140,
    dayPnl: -20,
    grossExposure: 55000,
    netExposure: 42000,
    asOf: now
  },
  lastTradeAt: now
};

const paperOrder: TradeOrder = {
  orderId: 'order-1',
  accountId: 'acct-paper',
  provider: 'alpaca',
  environment: 'paper',
  status: 'accepted',
  symbol: 'MSFT',
  side: 'buy',
  orderType: 'market',
  timeInForce: 'day',
  assetClass: 'equity',
  clientRequestId: 'client-1',
  idempotencyKey: 'idem-1',
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
};

const paperPosition: TradePosition = {
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
    recentAuditEvents: [
      {
        eventId: 'audit-1',
        accountId: 'acct-paper',
        provider: 'alpaca',
        environment: 'paper',
        eventType: 'preview',
        severity: 'info',
        occurredAt: now,
        actor: 'desk@example.com',
        orderId: 'order-1',
        providerOrderId: null,
        clientRequestId: 'client-1',
        idempotencyKey: null,
        statusBefore: null,
        statusAfter: 'previewed',
        summary: 'Manual order preview generated.',
        sanitizedError: null,
        grantedRoles: [],
        details: {}
      }
    ],
    alerts: []
  },
  'acct-live': {
    account: liveAccount,
    restrictions: [],
    riskLimits: {
      maxOrderNotional: 75000,
      maxDailyNotional: 150000,
      maxShareQuantity: 2500,
      allowedAssetClasses: ['equity'],
      allowedOrderTypes: ['market', 'limit', 'stop'],
      liveTradingAllowed: true,
      liveTradingReason: null
    },
    unresolvedAlerts: ['Awaiting supervisor acknowledgement'],
    recentAuditEvents: [],
    alerts: [
      {
        alertId: 'alert-live-1',
        accountId: 'acct-live',
        severity: 'warning',
        status: 'open',
        code: 'SUPERVISOR_ACK',
        title: 'Awaiting supervisor acknowledgement',
        message: 'Live routing requires supervisor acknowledgement before submission.',
        blocking: true,
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
    positions: accountId === 'acct-paper' ? [paperPosition] : [],
    generatedAt: now,
    freshness: (accountId === 'acct-paper' ? paperAccount : liveAccount).freshness
  }));
  mocks.listOrders.mockImplementation(async (accountId: string) => ({
    accountId,
    orders: accountId === 'acct-paper' ? [paperOrder] : [],
    generatedAt: now
  }));
}

describe('TradeDeskPage', () => {
  afterEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.createKey.mockImplementation((prefix = 'trade-desk') => `${prefix}-key`);
    window.history.pushState({}, '', '/');
  });

  it('renders the selected account workspace and monitor handoff link', async () => {
    configureSuccessMocks();

    renderWithProviders(<TradeDeskPage />);

    expect(await screen.findByText(/Core Paper is routed through Alpaca/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Trade account' })).toHaveTextContent('Core Paper');
    expect(screen.getByRole('link', { name: 'View in Trade Monitor' })).toHaveAttribute(
      'href',
      '/trade-monitor?accountId=acct-paper'
    );
    expect((await screen.findAllByText('MSFT')).length).toBeGreaterThan(0);
    expect(screen.getByText('Manual order preview generated.')).toBeInTheDocument();
  });

  it('previews and submits a manual paper order with idempotency keys', async () => {
    configureSuccessMocks();
    const preview: TradeOrderPreviewResponse = {
      previewId: 'preview-1',
      accountId: 'acct-paper',
      provider: 'alpaca',
      environment: 'paper',
      order: { ...paperOrder, status: 'previewed', providerOrderId: null },
      generatedAt: now,
      expiresAt: '2026-04-24T15:05:00Z',
      estimatedCost: null,
      estimatedFees: 0,
      cashAfter: null,
      buyingPowerAfter: null,
      riskChecks: [],
      warnings: [],
      blocked: false,
      blockReason: null,
      freshness: paperAccount.freshness,
      confirmationRequired: false
    };
    mocks.previewOrder.mockResolvedValue(preview);
    mocks.placeOrder.mockResolvedValue({
      order: paperOrder,
      submitted: true,
      replayed: false,
      reconciliationRequired: false,
      auditEventId: 'audit-2',
      message: 'accepted'
    });

    const user = userEvent.setup();
    renderWithProviders(<TradeDeskPage />);

    await user.type(await screen.findByLabelText('Symbol'), 'msft');
    await user.type(screen.getByLabelText('Quantity'), '1');
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => expect(mocks.previewOrder).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(mocks.placeOrder).toHaveBeenCalledTimes(1));
    expect(mocks.previewOrder.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        accountId: 'acct-paper',
        symbol: 'MSFT',
        clientRequestId: 'preview-key',
        source: 'manual'
      })
    );
    expect(mocks.placeOrder.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        idempotencyKey: 'submit-key',
        clientRequestId: 'submit-client-key',
        previewId: 'preview-1',
        source: 'manual'
      })
    );
    expect(await screen.findByText('The order was accepted for execution.')).toBeInTheDocument();
  });

  it('requires warning acknowledgement before submit', async () => {
    configureSuccessMocks();
    const preview: TradeOrderPreviewResponse = {
      previewId: 'preview-2',
      accountId: 'acct-paper',
      provider: 'alpaca',
      environment: 'paper',
      order: { ...paperOrder, status: 'previewed', providerOrderId: null },
      generatedAt: now,
      expiresAt: '2026-04-24T15:05:00Z',
      estimatedCost: null,
      estimatedFees: 0,
      cashAfter: null,
      buyingPowerAfter: null,
      riskChecks: [
        {
          checkId: 'warning-1',
          code: 'PRICE_BAND_ACK',
          label: 'Price band',
          status: 'warning',
          severity: 'warning',
          blocking: false,
          message: 'The price band is within tolerance but needs operator acknowledgement.',
          metadata: { headroomPct: 0.14 }
        }
      ],
      warnings: ['Review the price-band warning before submission.'],
      blocked: false,
      blockReason: null,
      freshness: paperAccount.freshness,
      confirmationRequired: false
    };
    mocks.previewOrder.mockResolvedValue(preview);
    mocks.placeOrder.mockResolvedValue({
      order: paperOrder,
      submitted: true,
      replayed: false,
      reconciliationRequired: false,
      auditEventId: 'audit-3',
      message: 'accepted'
    });

    const user = userEvent.setup();
    renderWithProviders(<TradeDeskPage />);

    await user.type(await screen.findByLabelText('Symbol'), 'msft');
    await user.type(screen.getByLabelText('Quantity'), '1');
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => expect(mocks.previewOrder).toHaveBeenCalledTimes(1));

    const submitButton = screen.getByRole('button', { name: 'Submit' });
    expect(submitButton).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);
    await waitFor(() => expect(mocks.placeOrder).toHaveBeenCalledTimes(1));
    expect(mocks.placeOrder.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        confirmedRiskCheckIds: ['warning-1']
      })
    );
  });
});
