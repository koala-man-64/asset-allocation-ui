import type { ExitRule, StrategyDetail, StrategySummary } from '@/types/strategy';

export type StrategyLibrarySort = 'updated-desc' | 'name-asc' | 'type-asc';

export const STRATEGY_SORT_OPTIONS: Array<{ value: StrategyLibrarySort; label: string }> = [
  { value: 'updated-desc', label: 'Recently updated' },
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'type-asc', label: 'Type' }
];

export function formatStrategyTimestamp(value?: string): string {
  if (!value) {
    return 'Never synced';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

export function formatStrategyType(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatRuleType(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function summarizeExitRule(rule: ExitRule): string {
  if (rule.type === 'time_stop') {
    return `${String(rule.value ?? '')} bars on close`;
  }

  if (rule.type === 'trailing_stop_atr') {
    return `${String(rule.value ?? '')} ATR using ${rule.atrColumn || 'missing column'}`;
  }

  return `${String(rule.value ?? '')} via ${rule.priceField || 'n/a'}`;
}

export function summarizeExitStack(strategy: StrategyDetail): string {
  const exits = strategy.config.exits || [];
  if (!exits.length) {
    return 'No exit rules configured.';
  }

  return exits.map((rule) => `${formatRuleType(rule.type)}: ${summarizeExitRule(rule)}`).join(' | ');
}

export function describeStrategySelection(strategy: StrategyDetail): string {
  return `Top ${strategy.config.topN} with ${strategy.config.lookbackWindow}-bar lookback`;
}

export function describeStrategyExecution(strategy: StrategyDetail): string {
  return `${strategy.config.longOnly ? 'Long only' : 'Long/short'} | hold ${strategy.config.holdingPeriod} bars`;
}

export function describeRegimePolicy(strategy: StrategyDetail): string {
  const policy = strategy.config.regimePolicy;
  if (!policy) {
    return 'No regime gating configured.';
  }

  return [policy.modelName, policy.mode.replaceAll('_', ' ')].filter(Boolean).join(' | ');
}

export function getStrategySearchText(strategy: StrategySummary): string {
  return [strategy.name, strategy.type, strategy.description || '', strategy.updated_at || '']
    .join(' ')
    .toLowerCase();
}

export function sortStrategies(
  strategies: StrategySummary[],
  sort: StrategyLibrarySort
): StrategySummary[] {
  const sorted = [...strategies];

  if (sort === 'name-asc') {
    return sorted.sort((left, right) => left.name.localeCompare(right.name));
  }

  if (sort === 'type-asc') {
    return sorted.sort(
      (left, right) =>
        left.type.localeCompare(right.type) || left.name.localeCompare(right.name)
    );
  }

  return sorted.sort((left, right) => {
    const leftTime = left.updated_at ? new Date(left.updated_at).getTime() : Number.NEGATIVE_INFINITY;
    const rightTime = right.updated_at
      ? new Date(right.updated_at).getTime()
      : Number.NEGATIVE_INFINITY;

    if (leftTime === rightTime) {
      return left.name.localeCompare(right.name);
    }

    return rightTime - leftTime;
  });
}
