import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PortfolioWorkspacePage } from '@/features/portfolios/PortfolioWorkspacePage';
import { portfolioApi } from '@/services/portfolioApi';
import { renderWithProviders } from '@/test/utils';
import type {
  PortfolioBuildListResponse,
  PortfolioDetail,
  PortfolioMonitorSnapshot,
  PortfolioPreviewResponse,
  PortfolioSummary,
  TriggerPortfolioBuildResponse
} from '@/types/portfolio';

vi.mock('@/services/portfolioApi', () => ({
  portfolioApi: {
    listPortfolios: vi.fn(),
    getPortfolioDetail: vi.fn(),
    previewPortfolio: vi.fn(),
    savePortfolio: vi.fn(),
    listBuildRuns: vi.fn(),
    getMonitorSnapshot: vi.fn(),
    triggerBuild: vi.fn()
  }
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

const summary: PortfolioSummary = {
  accountId: 'acct-core',
  portfolioName: 'macro-core',
  name: 'macro-core',
  description: 'Cross-asset core sleeve stack',
  mandate: 'Compound capital with controlled cash drag.',
  status: 'active',
  version: 4,
  benchmarkSymbol: 'SPY',
  baseCurrency: 'USD',
  sleeveCount: 2,
  targetGrossExposurePct: 95,
  cashReservePct: 5,
  inceptionDate: '2026-01-02',
  openingCash: 250000,
  lastBuiltAt: '2026-04-18T14:00:00Z',
  buildStatus: 'completed',
  updated_at: '2026-04-18T14:10:00Z',
  updated_by: 'desk-op',
  openAlertCount: 1
};

const detail: PortfolioDetail = {
  ...summary,
  accountId: 'acct-core',
  portfolioName: 'macro-core',
  mandate: 'Compound capital with controlled cash drag.',
  inceptionDate: '2026-01-02',
  openingCash: 250000,
  notes: 'Desk note',
  activeAssignment: {
    assignmentId: 'asn-1',
    accountVersion: 2,
    portfolioName: 'macro-core',
    portfolioVersion: 4,
    effectiveFrom: '2026-01-02',
    status: 'active',
    notes: 'Pinned sleeve stack'
  },
  recentLedgerEvents: [
    {
      eventId: 'evt-1',
      effectiveAt: '2026-01-02T14:30:00Z',
      eventType: 'opening_balance',
      currency: 'USD',
      cashAmount: 250000,
      description: 'Initial funding'
    }
  ],
  freshness: [
    {
      domain: 'valuation',
      state: 'fresh',
      checkedAt: '2026-04-18T14:00:00Z',
      reason: ''
    }
  ],
  config: {
    benchmarkSymbol: 'SPY',
    baseCurrency: 'USD',
    rebalanceCadence: 'weekly',
    rebalanceAnchor: 'Strategy native cadence',
    targetGrossExposurePct: 95,
    cashReservePct: 5,
    maxNames: 60,
    sleeves: [
      {
        sleeveId: 'macro-trend',
        label: 'Macro Trend',
        strategyName: 'macro-trend',
        strategyVersion: 7,
        targetWeightPct: 55,
        minWeightPct: 35,
        maxWeightPct: 65,
        rebalanceBandPct: 3,
        rebalancePriority: 0,
        expectedHoldings: 24,
        status: 'active',
        notes: 'Primary sleeve'
      },
      {
        sleeveId: 'quality-carry',
        label: 'Quality Carry',
        strategyName: 'quality-carry',
        strategyVersion: 5,
        targetWeightPct: 40,
        minWeightPct: 20,
        maxWeightPct: 50,
        rebalanceBandPct: 2,
        rebalancePriority: 1,
        expectedHoldings: 18,
        status: 'active',
        notes: 'Diversifier'
      }
    ],
    riskLimits: {
      grossExposurePct: 110,
      netExposurePct: 100,
      singleNameMaxPct: 8,
      sectorMaxPct: 28,
      turnoverBudgetPct: 18,
      driftRebalanceThresholdPct: 3
    },
    executionPolicy: {
      participationRatePct: 12,
      maxTradeNotionalUsd: 250000,
      staggerMinutes: 45
    },
    overlays: {
      regimeModelName: 'strategy-native',
      riskModelName: 'core-risk-v1',
      honorHaltFlag: true
    }
  }
};

const preview: PortfolioPreviewResponse = {
  portfolioName: 'macro-core',
  asOfDate: '2026-04-18',
  summary: {
    targetWeightPct: 95,
    residualCashPct: 5,
    projectedGrossExposurePct: 95,
    projectedNetExposurePct: 95,
    projectedTurnoverPct: 4.2,
    projectedPositionCount: 42
  },
  allocations: [
    {
      sleeveId: 'macro-trend',
      label: 'Macro Trend',
      strategyName: 'macro-trend',
      strategyVersion: 7,
      targetWeightPct: 55,
      projectedWeightPct: 54,
      projectedGrossExposurePct: 54,
      projectedTurnoverPct: 2,
      expectedHoldings: 24,
      status: 'active'
    }
  ],
  warnings: ['Residual cash is carrying the full reserve buffer.']
};

const monitorSnapshot: PortfolioMonitorSnapshot = {
  accountId: 'acct-core',
  accountName: 'macro-core',
  portfolioName: 'macro-core',
  mandate: 'Compound capital with controlled cash drag.',
  benchmarkSymbol: 'SPY',
  baseCurrency: 'USD',
  asOfDate: '2026-04-18',
  activeVersion: 4,
  buildHealth: 'healthy',
  buildWindowLabel: 'macro-core v4',
  nav: 281500,
  cash: 16500,
  cashPct: 5.9,
  grossExposurePct: 94.1,
  netExposurePct: 94.1,
  sinceInceptionPnl: 31500,
  sinceInceptionReturnPct: 12.6,
  currentDrawdownPct: -3.2,
  maxDrawdownPct: -8.1,
  largestPositionPct: 7.2,
  realizedTurnoverPct: 3.4,
  driftPct: 2.5,
  alerts: [
    {
      alertId: 'alert-1',
      severity: 'warning',
      status: 'open',
      code: 'drift',
      title: 'Sleeve drift building',
      message: 'Quality Carry is approaching the drift threshold.',
      observedAt: '2026-04-18T13:55:00Z'
    }
  ],
  sleeves: [
    {
      sleeveId: 'macro-trend',
      label: 'Macro Trend',
      strategyName: 'macro-trend',
      strategyVersion: 7,
      targetWeightPct: 55,
      liveWeightPct: 54,
      driftPct: 1,
      marketValue: 152000,
      returnContributionPct: 5.2,
      status: 'healthy',
      lastSignalAt: '2026-04-18'
    },
    {
      sleeveId: 'quality-carry',
      label: 'Quality Carry',
      strategyName: 'quality-carry',
      strategyVersion: 5,
      targetWeightPct: 40,
      liveWeightPct: 37.5,
      driftPct: 2.5,
      marketValue: 105000,
      returnContributionPct: 3.4,
      status: 'warning',
      lastSignalAt: '2026-04-18'
    }
  ],
  positions: [
    {
      asOfDate: '2026-04-18',
      symbol: 'MSFT',
      quantity: 220,
      marketValue: 94200,
      weightPct: 33.4,
      averageCost: 401.5,
      lastPrice: 428.18,
      unrealizedPnl: 5869,
      realizedPnl: 0,
      contributors: [
        {
          sleeveId: 'macro-trend',
          strategyName: 'macro-trend',
          strategyVersion: 7,
          quantity: 220,
          marketValue: 94200,
          weightPct: 33.4
        }
      ]
    }
  ],
  history: [
    {
      asOfDate: '2026-04-17',
      nav: 279200,
      cash: 17200,
      grossExposurePct: 93.4,
      netExposurePct: 93.4,
      cumulativeReturnPct: 11.8,
      drawdownPct: -3.6,
      turnoverPct: 3.1
    },
    {
      asOfDate: '2026-04-18',
      nav: 281500,
      cash: 16500,
      grossExposurePct: 94.1,
      netExposurePct: 94.1,
      cumulativeReturnPct: 12.6,
      drawdownPct: -3.2,
      turnoverPct: 3.4
    }
  ],
  ledgerEvents: detail.recentLedgerEvents,
  freshness: detail.freshness
};

const buildRuns: PortfolioBuildListResponse = {
  runs: [
    {
      runId: 'rebuild-acct-core-1',
      portfolioName: 'macro-core',
      accountId: 'acct-core',
      status: 'completed',
      buildScope: 'materialization',
      triggeredBy: 'desk-op',
      asOfDate: '2026-04-18',
      submittedAt: '2026-04-18T14:00:00Z',
      completedAt: '2026-04-18T14:02:00Z',
      driftPct: 2.5,
      tradeCount: 11,
      error: null
    }
  ],
  limit: 8,
  offset: 0,
  total: 1
};

const triggerResponse: TriggerPortfolioBuildResponse = {
  status: 'queued',
  run: {
    runId: 'rebuild-acct-core-2',
    portfolioName: 'macro-core',
    accountId: 'acct-core',
    status: 'queued',
    buildScope: 'materialization',
    triggeredBy: 'desk-op',
    asOfDate: '2026-04-18',
    submittedAt: '2026-04-18T14:10:00Z'
  }
};

describe('PortfolioWorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(portfolioApi.listPortfolios).mockResolvedValue([summary]);
    vi.mocked(portfolioApi.getPortfolioDetail).mockResolvedValue(detail);
    vi.mocked(portfolioApi.previewPortfolio).mockResolvedValue(preview);
    vi.mocked(portfolioApi.savePortfolio).mockResolvedValue({
      status: 'ok',
      message: 'saved',
      portfolio: summary
    });
    vi.mocked(portfolioApi.listBuildRuns).mockResolvedValue(buildRuns);
    vi.mocked(portfolioApi.getMonitorSnapshot).mockResolvedValue(monitorSnapshot);
    vi.mocked(portfolioApi.triggerBuild).mockResolvedValue(triggerResponse);
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('loads the saved workspace into builder mode and renders account controls', async () => {
    renderWithProviders(<PortfolioWorkspacePage />);

    expect(await screen.findByDisplayValue('macro-core')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Compound capital with controlled cash drag.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-01-02')).toBeInTheDocument();
    expect(screen.getByDisplayValue('macro-trend')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /builder mode/i })).toBeInTheDocument();
  });

  it('runs an allocation preview from builder mode', async () => {
    renderWithProviders(<PortfolioWorkspacePage />);

    expect(await screen.findByDisplayValue('macro-core')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /preview allocation stack/i }));

    await waitFor(() => {
      expect(portfolioApi.previewPortfolio).toHaveBeenCalledWith(
        expect.objectContaining({
          asOfDate: expect.stringMatching(/\d{4}-\d{2}-\d{2}/),
          portfolio: expect.objectContaining({ accountId: 'acct-core', name: 'macro-core' })
        })
      );
    });

    expect(await screen.findByText(/preview warnings/i)).toBeInTheDocument();
    expect(screen.getByText(/residual cash is carrying the full reserve buffer/i)).toBeInTheDocument();
  });

  it('switches to monitor mode and shows performance, positions, and materialization controls', async () => {
    renderWithProviders(<PortfolioWorkspacePage />);

    expect(await screen.findByDisplayValue('macro-core')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /monitor mode/i }));

    expect(await screen.findByText(/performance history/i)).toBeInTheDocument();
    expect(screen.getByText(/current positions/i)).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /refresh materialization/i }));

    await waitFor(() => {
      expect(portfolioApi.triggerBuild).toHaveBeenCalledWith(
        'macro-core',
        expect.objectContaining({
          buildScope: 'rebalance'
        })
      );
    });
  });
});
