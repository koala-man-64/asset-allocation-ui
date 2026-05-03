import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountOperationsPage } from '@/features/accounts/AccountOperationsPage';
import { accountOperationsApi } from '@/services/accountOperationsApi';
import { ApiError } from '@/services/apiService';
import { renderWithProviders } from '@/test/utils';
import { toast } from 'sonner';
import type {
  BrokerAccountActionResponse,
  BrokerAccountConfiguration,
  BrokerAccountDetail,
  BrokerAccountListResponse,
  BrokerAccountSummary
} from '@/types/brokerAccounts';

vi.mock('@/services/accountOperationsApi', () => ({
  accountOperationsApi: {
    listAccounts: vi.fn(),
    getAccountDetail: vi.fn(),
    getConfiguration: vi.fn(),
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
    ]
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

describe('AccountOperationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(accountOperationsApi.listAccounts).mockResolvedValue(listResponse);
    vi.mocked(accountOperationsApi.getAccountDetail).mockResolvedValue(detailResponse);
    vi.mocked(accountOperationsApi.getConfiguration).mockResolvedValue(configurationResponse);
    vi.mocked(accountOperationsApi.refreshAccount).mockResolvedValue(buildActionResponse('refresh'));
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
  });

  it('renders the board summary and sorts the board by exception priority', async () => {
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    expect(screen.getByText('Connected Accounts')).toBeInTheDocument();
    expect(screen.getAllByText('Trade Ready').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Needs Action').length).toBeGreaterThan(0);
    expect(screen.getByText('$960,000')).toBeInTheDocument();
    expect(screen.getByText('3 tracked accounts on the board.')).toBeInTheDocument();

    const cardIds = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="account-card-"]')
    ).map((element) => element.dataset.testid);

    expect(cardIds).toEqual([
      'account-card-acct-schwab-1',
      'account-card-acct-etrade-1',
      'account-card-acct-alpaca-1'
    ]);
  });

  it('filters the board by broker from the left rail', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Schwab/ }));

    await waitFor(() => {
      const visibleCards = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid^="account-card-"]')
      ).map((element) => element.dataset.testid);

      expect(visibleCards).toEqual(['account-card-acct-schwab-1']);
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

    expect(screen.getByText(/resolve the inline validation errors before saving/i)).toBeInTheDocument();
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

    expect(
      await screen.findByText(/configuration changed on the server/i)
    ).toBeInTheDocument();
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

  it('disables the refresh action while a refresh mutation is pending', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<BrokerAccountActionResponse>();
    vi.mocked(accountOperationsApi.refreshAccount).mockReturnValueOnce(deferred.promise);

    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/account board/i)).toBeInTheDocument();
    const refreshButton = screen.getAllByRole('button', { name: /refresh now/i })[0];
    await user.click(refreshButton);

    await waitFor(() => {
      expect(refreshButton).toBeDisabled();
    });

    deferred.resolve(buildActionResponse('refresh'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Refresh queued.');
    });
  });

  it('shows an empty state when no accounts are connected', async () => {
    vi.mocked(accountOperationsApi.listAccounts).mockResolvedValue({
      accounts: [],
      generatedAt: '2026-04-20T13:50:00Z'
    });

    renderWithProviders(<AccountOperationsPage />);

    expect(await screen.findByText(/no connected accounts/i)).toBeInTheDocument();
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
    expect(within(adjacentSurfaceCard as HTMLElement).getByRole('link', { name: /portfolio workspace/i })).toHaveAttribute(
      'href',
      '/portfolios'
    );
    expect(within(adjacentSurfaceCard as HTMLElement).getByRole('link', { name: /runtime config/i })).toHaveAttribute(
      'href',
      '/runtime-config'
    );
  });
});
