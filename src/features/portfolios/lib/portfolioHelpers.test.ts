import { describe, expect, it } from 'vitest';

import { buildPortfolioBenchmarkComparison } from '@/features/portfolios/lib/portfolioBenchmark';
import { derivePortfolioModelOutlook } from '@/features/portfolios/lib/portfolioForecast';
import { deriveNextRebalanceWindow } from '@/features/portfolios/lib/portfolioRebalance';
import type { PortfolioHistoryRow } from '@/types/portfolio';

const history: PortfolioHistoryRow[] = [
  {
    asOfDate: '2026-04-01',
    nav: 100000,
    cash: 5000,
    grossExposurePct: 95,
    netExposurePct: 95,
    drawdownPct: -1.2,
    turnoverPct: 2.1,
    costDragBps: 8
  },
  {
    asOfDate: '2026-04-10',
    nav: 102000,
    cash: 4500,
    grossExposurePct: 96,
    netExposurePct: 96,
    drawdownPct: -0.8,
    turnoverPct: 2.3,
    costDragBps: 9
  },
  {
    asOfDate: '2026-04-18',
    nav: 103500,
    cash: 4000,
    grossExposurePct: 97,
    netExposurePct: 97,
    drawdownPct: -0.6,
    turnoverPct: 2.8,
    costDragBps: 10
  }
];

describe('portfolio helper layer', () => {
  it('derives benchmark-relative performance from local portfolio history and market data only', () => {
    const comparison = buildPortfolioBenchmarkComparison(history, [
      { date: '2026-04-01', open: 500, high: 501, low: 499, close: 500, volume: 1000 },
      { date: '2026-04-10', open: 503, high: 504, low: 502, close: 503, volume: 1000 },
      { date: '2026-04-18', open: 505, high: 507, low: 504, close: 506, volume: 1000 }
    ]);

    expect(comparison.benchmarkAvailable).toBe(true);
    expect(comparison.portfolioHeadlineReturnPct).toBe(3.5);
    expect(comparison.benchmarkHeadlineReturnPct).toBe(1.2);
    expect(comparison.activeHeadlineReturnPct).toBe(2.3);
  });

  it('downgrades forecast confidence when the regime sample is thin', () => {
    const comparison = buildPortfolioBenchmarkComparison(history, [
      { date: '2026-04-01', open: 500, high: 501, low: 499, close: 500, volume: 1000 },
      { date: '2026-04-10', open: 503, high: 504, low: 502, close: 503, volume: 1000 },
      { date: '2026-04-18', open: 505, high: 507, low: 504, close: 506, volume: 1000 }
    ]);

    const outlook = derivePortfolioModelOutlook({
      history,
      comparison,
      regimeHistory: [
        {
          model_name: 'strategy-native',
          model_version: 1,
          as_of_date: '2026-04-10',
          effective_from_date: '2026-04-10',
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
      ],
      currentRegimeCode: 'trending_up',
      horizon: '1M',
      assumption: 'current',
      costDragOverrideBps: 10
    });

    expect(outlook.confidence).toBe('thin');
    expect(outlook.sampleMode).toBe('fallback-history');
  });

  it('falls back to cadence-based rebalance timing when anchor text cannot be parsed', () => {
    const nextRebalance = deriveNextRebalanceWindow({
      cadence: 'weekly',
      rebalanceAnchor: 'Strategy native cadence',
      lastBuiltAt: '2026-04-18T14:00:00Z'
    });

    expect(nextRebalance.inferred).toBe(true);
    expect(nextRebalance.basis).toBe('cadence');
    expect(nextRebalance.nextDate).toBe('2026-04-25');
  });
});
