import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioDetail } from '@/types/portfolio';

type PortfolioApiModule = typeof import('@/services/portfolioApi');

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const savedDetail: PortfolioDetail = {
  accountId: 'acct-core',
  portfolioName: 'macro-core',
  name: 'macro-core',
  description: 'Desk note',
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
  buildStatus: 'completed',
  lastBuiltAt: '2026-04-18T14:00:00Z',
  updated_at: '2026-04-18T14:10:00Z',
  updated_by: 'desk-op',
  notes: 'Desk note',
  recentLedgerEvents: [],
  freshness: [],
  activeAssignment: {
    assignmentId: 'asn-1',
    accountVersion: 2,
    portfolioName: 'macro-core',
    portfolioVersion: 4,
    effectiveFrom: '2026-01-02',
    status: 'active',
    notes: 'Pinned mix'
  },
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

describe('portfolioApi', () => {
  const fetchMock = vi.fn();
  const windowWithConfig = window as typeof window & {
    __API_UI_CONFIG__?: { apiBaseUrl?: string };
  };

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    windowWithConfig.__API_UI_CONFIG__ = { apiBaseUrl: '/api' };
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete windowWithConfig.__API_UI_CONFIG__;
  });

  async function importPortfolioApi(): Promise<PortfolioApiModule> {
    return import('@/services/portfolioApi');
  }

  function mockWarmup(): void {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
  }

  it('lists account workspaces through the portfolio account directory and portfolio detail endpoint', async () => {
    mockWarmup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            {
              accountId: 'acct-core',
              name: 'macro-core',
              description: 'Desk note',
              status: 'active',
              mode: 'internal_model_managed',
              accountingDepth: 'position_level',
              cadenceMode: 'strategy_native',
              baseCurrency: 'USD',
              benchmarkSymbol: 'SPY',
              inceptionDate: '2026-01-02',
              mandate: 'Compound capital',
              activePortfolioName: 'macro-core',
              activePortfolioVersion: 4,
              lastMaterializedAt: '2026-04-18T14:00:00Z',
              openAlertCount: 1
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          portfolio: {
            name: 'macro-core',
            description: 'Desk note',
            benchmarkSymbol: 'SPY',
            status: 'active',
            latestVersion: 4,
            activeVersion: 4
          },
          activeRevision: {
            portfolioName: 'macro-core',
            version: 4,
            allocations: [
              {
                sleeveId: 'macro-trend',
                sleeveName: 'Macro Trend',
                strategy: { strategyName: 'macro-trend', strategyVersion: 7 },
                targetWeight: 0.55,
                minWeight: 0.35,
                maxWeight: 0.65,
                enabled: true
              }
            ]
          }
        })
      );

    const { portfolioApi } = await importPortfolioApi();
    const result = await portfolioApi.listPortfolios();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/healthz');

    const directoryUrl = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
    const detailUrl = new URL(fetchMock.mock.calls[2]?.[0] as string, 'http://localhost');
    expect(directoryUrl.pathname).toBe('/api/portfolio-accounts');
    expect(detailUrl.pathname).toBe('/api/portfolios/macro-core');
    expect(result[0]?.accountId).toBe('acct-core');
    expect(result[0]?.sleeveCount).toBe(1);
  });

  it('hydrates a saved workspace by resolving the account and active portfolio detail', async () => {
    mockWarmup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            {
              accountId: 'acct-core',
              name: 'macro-core',
              description: 'Desk note',
              status: 'active',
              mode: 'internal_model_managed',
              accountingDepth: 'position_level',
              cadenceMode: 'strategy_native',
              baseCurrency: 'USD',
              benchmarkSymbol: 'SPY',
              inceptionDate: '2026-01-02',
              mandate: 'Compound capital',
              activePortfolioName: 'macro-core',
              activePortfolioVersion: 4
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          account: {
            accountId: 'acct-core',
            name: 'macro-core',
            description: 'Desk note',
            status: 'active',
            mode: 'internal_model_managed',
            accountingDepth: 'position_level',
            cadenceMode: 'strategy_native',
            baseCurrency: 'USD',
            benchmarkSymbol: 'SPY',
            inceptionDate: '2026-01-02',
            mandate: 'Compound capital',
            activePortfolioName: 'macro-core',
            activePortfolioVersion: 4
          },
          activeAssignment: {
            assignmentId: 'asn-1',
            accountId: 'acct-core',
            accountVersion: 2,
            portfolioName: 'macro-core',
            portfolioVersion: 4,
            effectiveFrom: '2026-01-02',
            status: 'active'
          },
          recentLedgerEvents: []
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          portfolio: {
            name: 'macro-core',
            description: 'Desk note',
            benchmarkSymbol: 'SPY',
            status: 'active',
            latestVersion: 4,
            activeVersion: 4
          },
          activeRevision: {
            portfolioName: 'macro-core',
            version: 4,
            notes: 'Desk note',
            allocations: [
              {
                sleeveId: 'macro-trend',
                sleeveName: 'Macro Trend',
                strategy: { strategyName: 'macro-trend', strategyVersion: 7 },
                targetWeight: 0.55,
                minWeight: 0.35,
                maxWeight: 0.65,
                enabled: true
              }
            ]
          }
        })
      );

    const { portfolioApi } = await importPortfolioApi();
    const result = await portfolioApi.getPortfolioDetail('macro-core');

    expect(result.accountId).toBe('acct-core');
    expect(result.portfolioName).toBe('macro-core');
    expect(result.config.sleeves[0]?.strategyVersion).toBe(7);
  });

  it('creates the portfolio, account, and assignment when saving', async () => {
    mockWarmup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          portfolio: {
            name: 'macro-core',
            description: 'Desk note',
            benchmarkSymbol: 'SPY',
            status: 'active',
            latestVersion: 4,
            activeVersion: 4
          },
          activeRevision: {
            portfolioName: 'macro-core',
            version: 4,
            allocations: []
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          account: {
            accountId: 'acct-core',
            name: 'macro-core',
            description: 'Desk note',
            status: 'active',
            mode: 'internal_model_managed',
            accountingDepth: 'position_level',
            cadenceMode: 'strategy_native',
            baseCurrency: 'USD',
            benchmarkSymbol: 'SPY',
            inceptionDate: '2026-01-02',
            mandate: 'Compound capital',
            activeRevision: 2,
            latestRevision: 2,
            activePortfolioName: 'macro-core',
            activePortfolioVersion: 4
          },
          recentLedgerEvents: []
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          assignmentId: 'asn-1',
          accountId: 'acct-core',
          accountVersion: 2,
          portfolioName: 'macro-core',
          portfolioVersion: 4,
          effectiveFrom: '2026-01-02',
          status: 'active'
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            {
              accountId: 'acct-core',
              name: 'macro-core',
              description: 'Desk note',
              status: 'active',
              mode: 'internal_model_managed',
              accountingDepth: 'position_level',
              cadenceMode: 'strategy_native',
              baseCurrency: 'USD',
              benchmarkSymbol: 'SPY',
              inceptionDate: '2026-01-02',
              mandate: 'Compound capital',
              activePortfolioName: 'macro-core',
              activePortfolioVersion: 4
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          account: {
            accountId: 'acct-core',
            name: 'macro-core',
            description: 'Desk note',
            status: 'active',
            mode: 'internal_model_managed',
            accountingDepth: 'position_level',
            cadenceMode: 'strategy_native',
            baseCurrency: 'USD',
            benchmarkSymbol: 'SPY',
            inceptionDate: '2026-01-02',
            mandate: 'Compound capital',
            activePortfolioName: 'macro-core',
            activePortfolioVersion: 4
          },
          recentLedgerEvents: []
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          portfolio: {
            name: 'macro-core',
            description: 'Desk note',
            benchmarkSymbol: 'SPY',
            status: 'active',
            latestVersion: 4,
            activeVersion: 4
          },
          activeRevision: {
            portfolioName: 'macro-core',
            version: 4,
            allocations: []
          }
        })
      );

    const { portfolioApi } = await importPortfolioApi();
    const result = await portfolioApi.savePortfolio(savedDetail);

    const createPortfolioUrl = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
    const createAccountUrl = new URL(fetchMock.mock.calls[2]?.[0] as string, 'http://localhost');
    const assignmentUrl = new URL(fetchMock.mock.calls[3]?.[0] as string, 'http://localhost');
    expect(createPortfolioUrl.pathname).toBe('/api/portfolios');
    expect(createAccountUrl.pathname).toBe('/api/portfolio-accounts/acct-core');
    expect(assignmentUrl.pathname).toBe('/api/portfolio-accounts/acct-core/assignments');
    expect(result.portfolio.accountId).toBe('acct-core');
  });

  it('uses a client-side preview when the draft has not been saved yet', async () => {
    const draft: PortfolioDetail = {
      ...savedDetail,
      accountId: undefined,
      status: 'draft',
      recentLedgerEvents: [],
      freshness: []
    };

    const { portfolioApi } = await importPortfolioApi();
    const result = await portfolioApi.previewPortfolio({
      portfolio: draft,
      asOfDate: '2026-04-18'
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(result.summary.targetWeightPct).toBe(95);
    expect(result.summary.residualCashPct).toBe(5);
    expect(result.previewSource).toBe('inferred');
    expect(result.tradeProposals).toEqual([]);
  });

  it('maps live preview trade proposals into the local preview model', async () => {
    mockWarmup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          proposalId: 'proposal-1',
          accountId: 'acct-core',
          asOf: '2026-04-18',
          portfolioName: 'macro-core',
          portfolioVersion: 4,
          blocked: false,
          warnings: ['Desk warning'],
          blockedReasons: [],
          estimatedCashImpact: -21500,
          estimatedTurnover: 0.042,
          trades: [
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
          ]
        })
      );

    const { portfolioApi } = await importPortfolioApi();
    const result = await portfolioApi.previewPortfolio({
      portfolio: savedDetail,
      asOfDate: '2026-04-18'
    });

    const previewUrl = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
    expect(previewUrl.pathname).toBe('/api/portfolio-accounts/acct-core/rebalances/preview');
    expect(result.previewSource).toBe('live-proposal');
    expect(result.tradeProposals).toEqual([
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
    ]);
  });

  it('reads materialization state through the internal rebuild status surface', async () => {
    mockWarmup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            {
              accountId: 'acct-core',
              name: 'macro-core',
              description: 'Desk note',
              status: 'active',
              mode: 'internal_model_managed',
              accountingDepth: 'position_level',
              cadenceMode: 'strategy_native',
              baseCurrency: 'USD',
              benchmarkSymbol: 'SPY',
              inceptionDate: '2026-01-02',
              mandate: 'Compound capital',
              activePortfolioName: 'macro-core',
              activePortfolioVersion: 4
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            {
              accountId: 'acct-core',
              status: 'claimed',
              claimToken: 'claim-1',
              claimedBy: 'desk-op',
              claimedAt: '2026-04-18T14:00:00Z',
              lastSnapshotAsOf: '2026-04-18'
            }
          ],
          count: 1
        })
      );

    const { portfolioApi } = await importPortfolioApi();
    const result = await portfolioApi.listBuildRuns({ portfolioName: 'macro-core' });

    const url = new URL(fetchMock.mock.calls[2]?.[0] as string, 'http://localhost');
    expect(url.pathname).toBe('/api/internal/portfolio-materializations/stale');
    expect(result.runs[0]?.status).toBe('running');
  });

  it('queues a materialization rebuild through the internal rebuild endpoint', async () => {
    mockWarmup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [
            {
              accountId: 'acct-core',
              name: 'macro-core',
              description: 'Desk note',
              status: 'active',
              mode: 'internal_model_managed',
              accountingDepth: 'position_level',
              cadenceMode: 'strategy_native',
              baseCurrency: 'USD',
              benchmarkSymbol: 'SPY',
              inceptionDate: '2026-01-02',
              mandate: 'Compound capital',
              activePortfolioName: 'macro-core',
              activePortfolioVersion: 4
            }
          ]
        })
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', accountIds: ['acct-core'], count: 1 }));

    const { portfolioApi } = await importPortfolioApi();
    const result = await portfolioApi.triggerBuild('macro-core', {
      asOfDate: '2026-04-18',
      buildScope: 'rebalance',
      force: true
    });

    const url = new URL(fetchMock.mock.calls[2]?.[0] as string, 'http://localhost');
    const options = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(url.pathname).toBe('/api/internal/portfolio-materializations/rebuild');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ accountId: 'acct-core' }));
    expect(result.status).toBe('queued');
  });
});
