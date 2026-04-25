import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test/utils';
import { TradeDeskPage } from '@/features/trade-desk/TradeDeskPage';
import type {
  TradeAccountSummary,
  TradeOrder,
  TradeOrderPreviewResponse,
  TradePosition
} from '@asset-allocation/contracts';

const mocks = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  getAccountDetail: vi.fn(),
  listPositions: vi.fn(),
  listOrders: vi.fn(),
  listHistory: vi.fn(),
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
    history: (accountId: string | null) => ['trade-desk', 'history', accountId ?? 'none']
  }
}));

const now = '2026-04-24T15:00:00Z';

const account: TradeAccountSummary = {
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
  }
};

const order: TradeOrder = {
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

const position: TradePosition = {
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

function configureSuccessMocks() {
  mocks.listAccounts.mockResolvedValue({ accounts: [account], generatedAt: now });
  mocks.getAccountDetail.mockResolvedValue({
    account,
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
        details: {}
      }
    ]
  });
  mocks.listPositions.mockResolvedValue({
    accountId: 'acct-paper',
    positions: [position],
    generatedAt: now,
    freshness: account.freshness
  });
  mocks.listOrders.mockResolvedValue({
    accountId: 'acct-paper',
    orders: [order],
    generatedAt: now
  });
  mocks.listHistory.mockResolvedValue({
    accountId: 'acct-paper',
    orders: [order],
    generatedAt: now
  });
}

describe('TradeDeskPage', () => {
  afterEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.createKey.mockImplementation((prefix = 'trade-desk') => `${prefix}-key`);
  });

  it('renders the selected account, positions, orders, and activity', async () => {
    configureSuccessMocks();

    renderWithProviders(<TradeDeskPage />);

    expect(await screen.findByText(/Core Paper is routed through Alpaca/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Trade account' })).toHaveTextContent('Core Paper');
    expect(screen.getAllByText('PAPER')[0]).toBeInTheDocument();
    expect((await screen.findAllByText('MSFT')).length).toBeGreaterThan(0);
    expect(screen.getByText('Manual order preview generated.')).toBeInTheDocument();
  });

  it('previews and submits a manual paper order with an idempotency key', async () => {
    configureSuccessMocks();
    const preview: TradeOrderPreviewResponse = {
      previewId: 'preview-1',
      accountId: 'acct-paper',
      provider: 'alpaca',
      environment: 'paper',
      order: { ...order, status: 'previewed', providerOrderId: null },
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
      freshness: account.freshness,
      confirmationRequired: false
    };
    mocks.previewOrder.mockResolvedValue(preview);
    mocks.placeOrder.mockResolvedValue({
      order,
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
    await user.click(screen.getByRole('button', { name: /preview/i }));

    await waitFor(() => expect(mocks.previewOrder).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(mocks.placeOrder).toHaveBeenCalledTimes(1));
    expect(mocks.previewOrder.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        accountId: 'acct-paper',
        symbol: 'MSFT',
        source: 'manual'
      })
    );
    expect(mocks.placeOrder.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        idempotencyKey: 'submit-key',
        previewId: 'preview-1',
        source: 'manual'
      })
    );
  });
});
