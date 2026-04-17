import type {
  ExitRule,
  ExitRulePriceField,
  ExitRuleType,
  IntrabarConflictPolicy,
  RegimeBlockedAction,
  RegimeCode,
  RegimePolicy,
  StrategyDetail,
  TargetGrossExposureByRegime
} from '@/types/strategy';

export type StrategyEditorMode = 'create' | 'edit' | 'duplicate';

type StrategyDetailDraftInput = Omit<StrategyDetail, 'config'> & {
  config: Omit<StrategyDetail['config'], 'regimePolicy'> & {
    regimePolicy?: Omit<NonNullable<StrategyDetail['config']['regimePolicy']>, 'targetGrossExposureByRegime'> & {
      targetGrossExposureByRegime?: Partial<TargetGrossExposureByRegime>;
    };
  };
};

export const EXIT_RULE_OPTIONS: Array<{ value: ExitRuleType; label: string }> = [
  { value: 'stop_loss_fixed', label: 'Fixed Stop Loss' },
  { value: 'take_profit_fixed', label: 'Fixed Take Profit' },
  { value: 'trailing_stop_pct', label: 'Trailing Stop %' },
  { value: 'trailing_stop_atr', label: 'Trailing Stop ATR' },
  { value: 'time_stop', label: 'Time Stop' }
];

export const PRICE_FIELD_OPTIONS: Array<{ value: ExitRulePriceField; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'close', label: 'Close' }
];

export const INTRABAR_OPTIONS: Array<{ value: IntrabarConflictPolicy; label: string }> = [
  { value: 'stop_first', label: 'Stop First' },
  { value: 'take_profit_first', label: 'Take Profit First' },
  { value: 'priority_order', label: 'Priority Order' }
];

export const DEFAULT_REGIME_EXPOSURES: TargetGrossExposureByRegime = {
  trending_bull: 1.0,
  trending_bear: 0.5,
  choppy_mean_reversion: 0.75,
  high_vol: 0.0,
  unclassified: 0.0
};

export const REGIME_CODES: Array<{ value: RegimeCode; label: string }> = [
  { value: 'trending_bull', label: 'Trending Bull' },
  { value: 'trending_bear', label: 'Trending Bear' },
  { value: 'choppy_mean_reversion', label: 'Choppy Mean Reversion' },
  { value: 'high_vol', label: 'High Vol' },
  { value: 'unclassified', label: 'Unclassified' }
];

export const REGIME_BLOCKED_ACTIONS: Array<{ value: RegimeBlockedAction; label: string }> = [
  { value: 'skip_entries', label: 'Skip Entries' },
  { value: 'skip_rebalance', label: 'Skip Rebalance' }
];

const DEFAULT_REGIME_POLICY: RegimePolicy = {
  modelName: 'default-regime',
  targetGrossExposureByRegime: DEFAULT_REGIME_EXPOSURES,
  blockOnTransition: true,
  blockOnUnclassified: true,
  honorHaltFlag: true,
  onBlocked: 'skip_entries'
};

export function buildDefaultRegimePolicy(): RegimePolicy {
  return {
    ...DEFAULT_REGIME_POLICY,
    targetGrossExposureByRegime: { ...DEFAULT_REGIME_EXPOSURES }
  };
}

export function buildEmptyStrategy(): StrategyDetail {
  return {
    name: '',
    type: 'configured',
    description: '',
    config: {
      universeConfigName: undefined,
      rebalance: 'monthly',
      longOnly: true,
      topN: 20,
      lookbackWindow: 63,
      holdingPeriod: 21,
      costModel: 'default',
      intrabarConflictPolicy: 'stop_first',
      regimePolicy: undefined,
      exits: []
    }
  };
}

export function normalizeStrategyDetail(strategy: StrategyDetailDraftInput): StrategyDetail {
  const base = buildEmptyStrategy();
  const incomingPolicy = strategy.config.regimePolicy;

  return {
    ...base,
    ...strategy,
    config: {
      ...base.config,
      ...strategy.config,
      regimePolicy: incomingPolicy
        ? {
            ...buildDefaultRegimePolicy(),
            ...incomingPolicy,
            targetGrossExposureByRegime: {
              ...DEFAULT_REGIME_EXPOSURES,
              ...(incomingPolicy.targetGrossExposureByRegime || {})
            }
          }
        : undefined,
      exits: strategy.config.exits || []
    }
  };
}

export function buildDuplicateStrategy(strategy: StrategyDetail): StrategyDetail {
  const normalized = normalizeStrategyDetail(strategy);
  return {
    ...normalized,
    name: '',
    updated_at: undefined,
    output_table_name: undefined
  };
}

export function buildStrategyDraft(
  mode: StrategyEditorMode,
  strategy?: StrategyDetail | null
): StrategyDetail {
  if (!strategy) {
    return buildEmptyStrategy();
  }

  if (mode === 'duplicate') {
    return buildDuplicateStrategy(strategy);
  }

  return normalizeStrategyDetail(strategy);
}

export function getNextRuleId(type: ExitRuleType, existingRules: ExitRule[]): string {
  const used = new Set(existingRules.map((rule) => rule.id));
  let counter = 1;

  while (used.has(`${type}-${counter}`)) {
    counter += 1;
  }

  return `${type}-${counter}`;
}

export function buildExitRule(
  type: ExitRuleType,
  id: string,
  overrides: Partial<ExitRule> = {}
): ExitRule {
  const baseRule: ExitRule = {
    id,
    type,
    scope: 'position',
    action: 'exit_full',
    minHoldBars: 0,
    priority: 0
  };

  if (type === 'stop_loss_fixed') {
    return {
      ...baseRule,
      value: 0.08,
      reference: 'entry_price',
      priceField: 'low',
      ...overrides
    };
  }

  if (type === 'take_profit_fixed') {
    return {
      ...baseRule,
      value: 0.15,
      reference: 'entry_price',
      priceField: 'high',
      ...overrides
    };
  }

  if (type === 'trailing_stop_pct') {
    return {
      ...baseRule,
      value: 0.07,
      reference: 'highest_since_entry',
      priceField: 'low',
      ...overrides
    };
  }

  if (type === 'trailing_stop_atr') {
    return {
      ...baseRule,
      value: 3,
      atrColumn: 'atr_14d',
      reference: 'highest_since_entry',
      priceField: 'low',
      ...overrides
    };
  }

  return {
    ...baseRule,
    value: 40,
    priceField: 'close',
    ...overrides
  };
}

export function getRuleValueLabel(type: ExitRuleType): string {
  if (type === 'time_stop') {
    return 'Bars';
  }

  if (type === 'trailing_stop_atr') {
    return 'ATR Multiple';
  }

  return 'Value';
}

export function toOptionalNumber(value: string): number | undefined {
  const trimmed = String(value).trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
