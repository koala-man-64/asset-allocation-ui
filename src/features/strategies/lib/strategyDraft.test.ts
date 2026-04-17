import { describe, expect, it } from 'vitest';
import {
  buildDefaultRegimePolicy,
  buildEmptyStrategy,
  buildExitRule,
  buildStrategyDraft,
  normalizeStrategyDetail
} from '@/features/strategies/lib/strategyDraft';

describe('strategyDraft helpers', () => {
  it('builds an empty strategy with the expected defaults', () => {
    const draft = buildEmptyStrategy();

    expect(draft.name).toBe('');
    expect(draft.type).toBe('configured');
    expect(draft.config.rebalance).toBe('monthly');
    expect(draft.config.longOnly).toBe(true);
    expect(draft.config.exits).toEqual([]);
  });

  it('normalizes incoming strategy detail and fills missing regime exposure defaults', () => {
    const strategy = normalizeStrategyDetail({
      name: 'quality-trend',
      type: 'configured',
      description: 'desk note',
      config: {
        rebalance: 'weekly',
        longOnly: true,
        topN: 15,
        lookbackWindow: 63,
        holdingPeriod: 21,
        costModel: 'default',
        intrabarConflictPolicy: 'stop_first',
        exits: [],
        regimePolicy: {
          modelName: 'desk-regime',
          blockOnTransition: false,
          blockOnUnclassified: true,
          honorHaltFlag: true,
          onBlocked: 'skip_entries',
          targetGrossExposureByRegime: {
            trending_bull: 0.8,
            high_vol: 0.1
          }
        }
      }
    });

    expect(strategy.config.regimePolicy?.modelName).toBe('desk-regime');
    expect(strategy.config.regimePolicy?.targetGrossExposureByRegime.trending_bear).toBe(0.5);
    expect(strategy.config.regimePolicy?.targetGrossExposureByRegime.high_vol).toBe(0.1);
  });

  it('builds exit rules with type-specific defaults', () => {
    const atrRule = buildExitRule('trailing_stop_atr', 'atr-1');
    const timeRule = buildExitRule('time_stop', 'time-1');

    expect(atrRule.atrColumn).toBe('atr_14d');
    expect(atrRule.reference).toBe('highest_since_entry');
    expect(timeRule.priceField).toBe('close');
    expect(timeRule.value).toBe(40);
  });

  it('creates an independent default regime policy snapshot', () => {
    const left = buildDefaultRegimePolicy();
    const right = buildDefaultRegimePolicy();

    left.targetGrossExposureByRegime.trending_bull = 0.2;

    expect(right.targetGrossExposureByRegime.trending_bull).toBe(1);
  });

  it('clears identifying fields when building a duplicate draft', () => {
    const duplicate = buildStrategyDraft('duplicate', {
      name: 'quality-trend',
      type: 'configured',
      description: 'desk note',
      updated_at: '2026-04-15T12:00:00Z',
      output_table_name: 'quality_trend_daily',
      config: {
        rebalance: 'weekly',
        longOnly: true,
        topN: 20,
        lookbackWindow: 63,
        holdingPeriod: 21,
        costModel: 'default',
        intrabarConflictPolicy: 'stop_first',
        exits: []
      }
    });

    expect(duplicate.name).toBe('');
    expect(duplicate.output_table_name).toBeUndefined();
    expect(duplicate.updated_at).toBeUndefined();
    expect(duplicate.config.rebalance).toBe('weekly');
  });
});
