import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PortfolioWorkspacePage } from '@/features/portfolios/PortfolioWorkspacePage';
import type { PortfolioModelOutlook } from '@/features/portfolios/lib/portfolioForecast';
import { DataService } from '@/services/DataService';
import { backtestApi } from '@/services/backtestApi';
import { portfolioApi } from '@/services/portfolioApi';
import { regimeApi } from '@/services/regimeApi';
import { strategyApi } from '@/services/strategyApi';
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
    getForecast: vi.fn(),
    getMonitorSnapshot: vi.fn(),
    triggerBuild: vi.fn()
  }
}));

vi.mock('@/services/strategyApi', () => ({
  strategyApi: {
    listStrategies: vi.fn(),
    getStrategyDetail: vi.fn()
  }
}));

vi.mock('@/services/backtestApi', () => ({
  backtestApi: {
    listRuns: vi.fn(),
    getSummary: vi.fn()
  }
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    getMarketData: vi.fn()
  }
}));

vi.mock('@/services/regimeApi', () => ({
  regimeApi: {
    getCurrent: vi.fn(),
    getHistory: vi.fn()
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
      effectiveAt: '2026-04-18T14:30:00Z',
      eventType: 'rebalance_fill',
      currency: 'USD',
      cashAmount: -21500,
      symbol: 'MSFT',
      quantity: 50,
      price: 430,
      commission: 18,
      slippageCost: 9,
      description: 'Rebalance fill'
    },
    {
      eventId: 'evt-2',
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
    rebalanceAnchor: 'Monday close',
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

const livePreview: PortfolioPreviewResponse = {
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
  warnings: ['Residual cash is carrying the full reserve buffer.'],
  tradeProposals: [
    {
      sleeveId: 'macro-trend',
      symbol: 'MSFT',
      side: 'buy',
      quantity: 50,
      estimatedPrice: 430,
      estimatedNotional: 21500,
      estimatedCommission: 18,
      estimatedSlippageCost: 9
    }
  ],
  previewSource: 'live-proposal',
  blocked: false,
  blockedReasons: []
};

const inferredPreview: PortfolioPreviewResponse = {
  ...livePreview,
  tradeProposals: [],
  previewSource: 'inferred',
  warnings: ['Synthetic preview fallback in use.']
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
      turnoverPct: 3.1,
      costDragBps: 8
    },
    {
      asOfDate: '2026-04-18',
      nav: 281500,
      cash: 16500,
      grossExposurePct: 94.1,
      netExposurePct: 94.1,
      cumulativeReturnPct: 12.6,
      drawdownPct: -3.2,
      turnoverPct: 3.4,
      costDragBps: 9
    }
  ],
  ledgerEvents: detail.recentLedgerEvents,
  freshness: detail.freshness,
  nextRebalance: {
    accountId: 'acct-core',
    asOf: '2026-04-18',
    rebalanceCadence: 'weekly',
    anchorText: 'Monday close',
    nextDate: '2026-04-20',
    inferred: false,
    basis: 'anchor',
    reason: 'Weekly cadence is anchored to the parsed weekday in the rebalance anchor.'
  }
};
const forecast: PortfolioModelOutlook = {
  expectedReturnPct: 3.4,
  expectedActiveReturnPct: 1.1,
  downsidePct: -2.2,
  upsidePct: 6.8,
  confidence: 'thin',
  confidenceLabel: 'Thin sample',
  sampleSize: 3,
  sampleMode: 'fallback-history',
  appliedRegimeCode: 'trending_up',
  notes: ['Regime sample is thin; falling back to all available history.']
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
    vi.mocked(portfolioApi.previewPortfolio).mockResolvedValue(livePreview);
    vi.mocked(portfolioApi.savePortfolio).mockResolvedValue({
      status: 'ok',
      message: 'saved',
      portfolio: summary
    });
    vi.mocked(portfolioApi.listBuildRuns).mockResolvedValue(buildRuns);
    vi.mocked(portfolioApi.getForecast).mockResolvedValue(forecast);
    vi.mocked(portfolioApi.getMonitorSnapshot).mockResolvedValue(monitorSnapshot);
    vi.mocked(portfolioApi.triggerBuild).mockResolvedValue(triggerResponse);
    vi.mocked(strategyApi.listStrategies).mockResolvedValue([
      {
        name: 'macro-trend',
        type: 'configured',
        description: 'Primary trend sleeve',
        updated_at: '2026-04-15T12:00:00Z'
      },
      {
        name: 'quality-carry',
        type: 'configured',
        description: 'Diversifying carry sleeve',
        updated_at: '2026-04-15T12:00:00Z'
      },
      {
        name: 'quality-carry-v2',
        type: 'configured',
        description: 'Updated carry sleeve',
        updated_at: '2026-04-16T12:00:00Z'
      }
    ]);
    vi.mocked(strategyApi.getStrategyDetail).mockImplementation(async (name: string) => ({
      name,
      type: 'configured',
      description: `${name} desk summary`,
      updated_at: '2026-04-15T12:00:00Z',
      output_table_name: `${name}_daily`,
      config: {
        universeConfigName: 'large-cap',
        rebalance: 'weekly',
        longOnly: true,
        topN: 25,
        lookbackWindow: 90,
        holdingPeriod: 30,
        costModel: 'default',
        rankingSchemaName: 'quality',
        intrabarConflictPolicy: 'stop_first',
        regimePolicy: {
          modelName: 'strategy-native',
          mode: 'observe_only'
        },
        exits: []
      }
    }));
    vi.mocked(backtestApi.listRuns).mockResolvedValue({
      runs: [
        {
          run_id: 'run-1',
          status: 'completed',
          submitted_at: '2026-04-10T12:00:00Z'
        }
      ],
      limit: 1,
      offset: 0
    });
    vi.mocked(backtestApi.getSummary).mockResolvedValue({
      run_id: 'run-1',
      total_return: 0.18,
      sharpe_ratio: 1.4,
      max_drawdown: -0.09,
      cost_drag_bps: 14
    });
    vi.mocked(DataService.getMarketData).mockResolvedValue([
      { date: '2026-04-17', open: 505, high: 507, low: 503, close: 506, volume: 1000 },
      { date: '2026-04-18', open: 507, high: 510, low: 506, close: 509, volume: 1000 }
    ]);
    vi.mocked(regimeApi.getCurrent).mockResolvedValue({
      model_name: 'strategy-native',
      model_version: 1,
      as_of_date: '2026-04-18',
      effective_from_date: '2026-04-18',
      active_regimes: ['trending_up'],
      signals: [
        {
          regime_code: 'trending_up',
          display_name: 'Trending Up',
          signal_state: 'active',
          score: 0.88,
          activation_threshold: 0.6,
          is_active: true,
          matched_rule_id: 'trend-positive',
          evidence: {}
        }
      ],
      halt_flag: false
    });
    vi.mocked(regimeApi.getHistory).mockResolvedValue({
      modelName: 'strategy-native',
      modelVersion: 1,
      limit: 400,
      rows: [
        {
          model_name: 'strategy-native',
          model_version: 1,
          as_of_date: '2026-04-17',
          effective_from_date: '2026-04-17',
          active_regimes: ['trending_up'],
          signals: [
            {
              regime_code: 'trending_up',
              display_name: 'Trending Up',
              signal_state: 'active',
              score: 0.84,
              activation_threshold: 0.6,
              is_active: true,
              matched_rule_id: 'trend-positive',
              evidence: {}
            }
          ],
          halt_flag: false
        },
        {
          model_name: 'strategy-native',
          model_version: 1,
          as_of_date: '2026-04-18',
          effective_from_date: '2026-04-18',
          active_regimes: ['trending_up'],
          signals: [
            {
              regime_code: 'trending_up',
              display_name: 'Trending Up',
              signal_state: 'active',
              score: 0.88,
              activation_threshold: 0.6,
              is_active: true,
              matched_rule_id: 'trend-positive',
              evidence: {}
            }
          ],
          halt_flag: false
        }
      ]
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('defaults to the overview tab and renders regime, drift, and next rebalance metrics', async () => {
    renderWithProviders(<PortfolioWorkspacePage />);

    expect(await screen.findByText(/desk verdict/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /overview/i })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText(/trending up/i)).toBeInTheDocument();
    expect(screen.getByText(/current allocation/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/apr 20, 2026/i).length).toBeGreaterThan(0);
    });
  });

  it('switches to construction, lets the user pick a strategy, and renders a live rebalance trade list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PortfolioWorkspacePage />);

    expect(await screen.findByText(/desk verdict/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /construction/i }));

    expect(await screen.findByText(/portfolio builder/i)).toBeInTheDocument();
    expect(screen.getByText(/allocated vs residual cash/i)).toBeInTheDocument();
    expect(screen.getAllByText(/95.0%/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5.0%/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('combobox', { name: /select strategy for quality-carry/i }));
    await user.click(await screen.findByText('quality-carry-v2'));
    expect(await screen.findByRole('combobox', { name: /select strategy for quality-carry/i })).toHaveTextContent(
      /quality-carry-v2/i
    );

    await user.click(screen.getByRole('button', { name: /preview allocation stack/i }));

    await waitFor(() => {
      expect(portfolioApi.previewPortfolio).toHaveBeenCalledWith(
        expect.objectContaining({
          asOfDate: expect.stringMatching(/\d{4}-\d{2}-\d{2}/),
          portfolio: expect.objectContaining({ accountId: 'acct-core', name: 'macro-core' })
        })
      );
    });

    expect(await screen.findByText(/proposed rebalance trades/i)).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getAllByText(/live proposal/i).length).toBeGreaterThan(0);
  });

  it('shows inferred preview disclosure and marks the preview stale after the draft changes', async () => {
    const user = userEvent.setup();
    vi.mocked(portfolioApi.previewPortfolio).mockResolvedValueOnce(inferredPreview);

    renderWithProviders(<PortfolioWorkspacePage />);

    expect(await screen.findByText(/desk verdict/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /construction/i }));
    await user.click(screen.getByRole('button', { name: /preview allocation stack/i }));

    expect((await screen.findAllByText(/inferred preview/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/synthetic preview fallback in use/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/mandate/i), {
      target: { value: 'Updated mandate text' }
    });

    expect(await screen.findByText(/draft changed since preview/i)).toBeInTheDocument();
  });

  it('renders the performance tab with thin-sample forecast confidence', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PortfolioWorkspacePage />);

    expect(await screen.findByText(/desk verdict/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /performance/i }));

    expect(await screen.findByText(/regime-conditioned forecast/i)).toBeInTheDocument();
    expect(screen.getByText(/thin sample/i)).toBeInTheDocument();
    expect(screen.getByText(/applied regime/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(portfolioApi.getForecast).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acct-core',
          horizon: '3M',
          assumption: 'current',
          modelName: 'strategy-native'
        }),
        expect.anything()
      );
    });
  });

  it('renders the trading blotter and refreshes materialization from the next rebalance module', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PortfolioWorkspacePage />);

    expect(await screen.findByText(/desk verdict/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /trading/i }));

    expect(await screen.findByRole('button', { name: /refresh materialization/i })).toBeInTheDocument();
    expect(screen.getByText(/executed trade \/ ledger blotter/i)).toBeInTheDocument();
    expect(screen.getAllByText('MSFT').length).toBeGreaterThan(0);
    expect(screen.getByText(/rebalance fill/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /refresh materialization/i }));

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
