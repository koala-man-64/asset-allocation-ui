export const portfolioKeys = {
  all: () => ['portfolios'] as const,
  detail: (name: string | null) => [...portfolioKeys.all(), 'detail', name ?? 'none'] as const,
  monitor: (name: string | null) => [...portfolioKeys.all(), 'monitor', name ?? 'none'] as const,
  builds: (name: string | null) => [...portfolioKeys.all(), 'builds', name ?? 'none'] as const,
  strategies: () => [...portfolioKeys.all(), 'strategies'] as const,
  regimeCurrent: (modelName?: string | null) =>
    [...portfolioKeys.all(), 'regime', 'current', modelName ?? 'default'] as const,
  regimeHistory: (modelName?: string | null, startDate?: string | null, endDate?: string | null) =>
    [
      ...portfolioKeys.all(),
      'regime',
      'history',
      modelName ?? 'default',
      startDate ?? 'none',
      endDate ?? 'none'
    ] as const,
  benchmark: (name: string | null, symbol?: string | null) =>
    [...portfolioKeys.all(), 'benchmark', name ?? 'none', symbol ?? 'none'] as const,
  forecast: (
    accountId: string | null | undefined,
    modelName: string | null | undefined,
    horizon: string,
    assumption: string,
    costDragOverrideBps: string | number
  ) =>
    [
      ...portfolioKeys.all(),
      'forecast',
      accountId ?? 'none',
      modelName ?? 'default',
      horizon,
      assumption,
      costDragOverrideBps
    ] as const,
  strategyDetail: (strategyName: string | null) =>
    [...portfolioKeys.all(), 'strategy-detail', strategyName ?? 'none'] as const,
  strategyBacktestRuns: (strategyName: string | null) =>
    [...portfolioKeys.all(), 'strategy-backtest-runs', strategyName ?? 'none'] as const,
  strategyBacktestSummary: (runId: string | null) =>
    [...portfolioKeys.all(), 'strategy-backtest-summary', runId ?? 'none'] as const
};

export const rankingKeys = {
  all: () => ['ranking-schemas'] as const,
  catalog: () => ['ranking-catalog'] as const,
  detail: (name: string | null) => [...rankingKeys.all(), 'detail', name ?? 'none'] as const
};

export const strategyKeys = {
  all: () => ['strategies'] as const,
  detail: (name: string | null) => [...strategyKeys.all(), 'detail', name ?? 'none'] as const,
  universeCatalog: () => [...strategyKeys.all(), 'universe-catalog'] as const,
  analyticsAllocations: (name: string | null) =>
    [...strategyKeys.all(), 'analytics', 'allocations', name ?? 'none'] as const,
  analyticsTrades: (name: string | null, startDate?: string | null, endDate?: string | null) =>
    [
      ...strategyKeys.all(),
      'analytics',
      'trades',
      name ?? 'none',
      startDate ?? 'none',
      endDate ?? 'none'
    ] as const
};

export const universeKeys = {
  all: () => ['universe-configs'] as const,
  detail: (name: string | null) => [...universeKeys.all(), 'detail', name ?? 'none'] as const
};

export const regimeKeys = {
  all: () => ['regimes'] as const,
  models: () => [...regimeKeys.all(), 'models'] as const,
  model: (name: string | null) => [...regimeKeys.models(), name ?? 'none'] as const,
  current: (name: string | null) => [...regimeKeys.all(), 'current', name ?? 'none'] as const,
  history: (name: string | null) => [...regimeKeys.all(), 'history', name ?? 'none'] as const
};

export const configurationKeys = {
  regimePolicies: () => ['regime-policies'] as const,
  regimePolicy: (name: string | null) =>
    [...configurationKeys.regimePolicies(), 'detail', name ?? 'none'] as const,
  rebalancePolicies: () => ['rebalance-policies'] as const,
  rebalancePolicy: (name: string | null) =>
    [...configurationKeys.rebalancePolicies(), 'detail', name ?? 'none'] as const,
  riskPolicies: () => ['risk-policies'] as const,
  riskPolicy: (name: string | null) =>
    [...configurationKeys.riskPolicies(), 'detail', name ?? 'none'] as const,
  exitRuleSets: () => ['exit-rule-sets'] as const,
  exitRuleSet: (name: string | null) =>
    [...configurationKeys.exitRuleSets(), 'detail', name ?? 'none'] as const
};

export const dataQualityKeys = {
  all: () => ['data-quality'] as const,
  storageUsage: () => [...dataQualityKeys.all(), 'storage-usage'] as const,
  validation: (layer: string, domain: string) =>
    [...dataQualityKeys.all(), 'validation', layer, domain] as const,
  symbolSyncState: () => ['symbol-sync-state'] as const
};

export const symbolEnrichmentKeys = {
  all: () => ['symbol-enrichment'] as const,
  summary: () => [...symbolEnrichmentKeys.all(), 'summary'] as const,
  runs: () => [...symbolEnrichmentKeys.all(), 'runs'] as const,
  symbols: (search: string) => [...symbolEnrichmentKeys.all(), 'symbols', search] as const,
  detail: (symbol: string | null) =>
    [...symbolEnrichmentKeys.all(), 'detail', symbol ?? 'none'] as const
};
