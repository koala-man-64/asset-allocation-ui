import { describe, expect, it } from 'vitest';
import {
  describeRegimePolicy,
  sortStrategies,
  summarizeExitStack
} from '@/features/strategies/lib/strategySummary';

describe('strategySummary helpers', () => {
  it('sorts strategy summaries by recent update', () => {
    const sorted = sortStrategies(
      [
        { name: 'beta', type: 'configured', updated_at: '2026-04-14T00:00:00Z' },
        { name: 'alpha', type: 'configured', updated_at: '2026-04-15T00:00:00Z' },
        { name: 'gamma', type: 'configured' }
      ],
      'updated-desc'
    );

    expect(sorted.map((item) => item.name)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('summarizes exit stacks into desk-readable copy', () => {
    const summary = summarizeExitStack({
      name: 'quality-trend',
      type: 'configured',
      config: {
        rebalance: 'weekly',
        longOnly: true,
        topN: 20,
        lookbackWindow: 63,
        holdingPeriod: 21,
        costModel: 'default',
        intrabarConflictPolicy: 'stop_first',
        exits: [
          {
            id: 'stop-8',
            type: 'stop_loss_fixed',
            scope: 'position',
            action: 'exit_full',
            minHoldBars: 0,
            reference: 'entry_price',
            priceField: 'low',
            value: 0.08
          }
        ]
      }
    });

    expect(summary).toContain('Stop Loss Fixed');
    expect(summary).toContain('0.08 via low');
  });

  it('describes regime policy constraints when present', () => {
    const description = describeRegimePolicy({
      name: 'quality-trend',
      type: 'configured',
      config: {
        rebalance: 'weekly',
        longOnly: true,
        topN: 20,
        lookbackWindow: 63,
        holdingPeriod: 21,
        costModel: 'default',
        intrabarConflictPolicy: 'stop_first',
        exits: [],
        regimePolicy: {
          modelName: 'desk-regime',
          blockOnTransition: true,
          blockOnUnclassified: true,
          honorHaltFlag: false,
          onBlocked: 'skip_entries',
          targetGrossExposureByRegime: {
            trending_bull: 1,
            trending_bear: 0.5,
            choppy_mean_reversion: 0.75,
            high_vol: 0,
            unclassified: 0
          }
        }
      }
    });

    expect(description).toContain('desk-regime');
    expect(description).toContain('blocks transitions');
    expect(description).toContain('blocked action skip_entries');
  });
});
