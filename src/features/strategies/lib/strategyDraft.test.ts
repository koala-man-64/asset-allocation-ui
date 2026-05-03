import { describe, expect, it } from 'vitest';
import {
  buildDefaultRegimePolicy,
  buildEmptyStrategy,
  buildExitRule,
  buildStrategyDraft,
  normalizeStrategyComponentRefs,
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

  it('normalizes incoming strategy detail and preserves published regime policy fields', () => {
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
          mode: 'observe_only'
        }
      }
    });

    expect(strategy.config.regimePolicy?.modelName).toBe('desk-regime');
    expect(strategy.config.regimePolicy?.mode).toBe('observe_only');
  });

  it('normalizes component refs as the canonical reusable pins while dual-writing legacy fields', () => {
    const config = normalizeStrategyComponentRefs({
      universeConfigName: 'legacy-universe',
      universeConfigVersion: 1,
      rankingSchemaName: 'legacy-ranking',
      rankingSchemaVersion: 2,
      regimePolicyConfigName: 'legacy-regime',
      regimePolicyConfigVersion: 3,
      riskPolicyName: 'legacy-risk',
      riskPolicyVersion: 4,
      exitRuleSetName: 'legacy-exits',
      exitRuleSetVersion: 5,
      rebalance: 'monthly',
      longOnly: true,
      topN: 20,
      lookbackWindow: 63,
      holdingPeriod: 21,
      costModel: 'default',
      intrabarConflictPolicy: 'stop_first',
      exits: [],
      componentRefs: {
        universe: { name: 'component-universe', version: 7 },
        rebalance: { name: 'monthly-last-trading-day', version: 1 }
      }
    });

    expect(config.componentRefs?.universe).toEqual({ name: 'component-universe', version: 7 });
    expect(config.componentRefs?.ranking).toEqual({ name: 'legacy-ranking', version: 2 });
    expect(config.componentRefs?.rebalance).toEqual({
      name: 'monthly-last-trading-day',
      version: 1
    });
    expect(config.universeConfigName).toBe('component-universe');
    expect(config.universeConfigVersion).toBe(7);
    expect(config.rankingSchemaName).toBe('legacy-ranking');
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

    left.modelName = 'custom-regime';

    expect(right.modelName).toBe('default-regime');
    expect(right.mode).toBe('observe_only');
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
