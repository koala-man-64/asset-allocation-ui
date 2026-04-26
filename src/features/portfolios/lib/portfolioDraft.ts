import type { PortfolioDetail, PortfolioSleeveDefinition, PortfolioSummary } from '@/types/portfolio';

const DEFAULT_RISK_LIMITS = {
  grossExposurePct: 110,
  netExposurePct: 100,
  singleNameMaxPct: 8,
  sectorMaxPct: 28,
  turnoverBudgetPct: 18,
  driftRebalanceThresholdPct: 3
} as const;

const DEFAULT_EXECUTION_POLICY = {
  participationRatePct: 12,
  maxTradeNotionalUsd: 250000,
  staggerMinutes: 45
} as const;

const DEFAULT_OVERLAYS = {
  regimeModelName: 'strategy-native',
  riskModelName: 'core-risk-v1',
  honorHaltFlag: true
} as const;

export function buildEmptyPortfolioSleeve(index: number): PortfolioSleeveDefinition {
  return {
    sleeveId: `sleeve-${index + 1}`,
    label: `Sleeve ${index + 1}`,
    strategyName: '',
    strategyVersion: 1,
    allocationMode: 'percent',
    targetWeightPct: 0,
    targetNotionalBaseCcy: null,
    derivedWeightPct: null,
    minWeightPct: 0,
    maxWeightPct: 35,
    rebalanceBandPct: 2,
    rebalancePriority: index,
    expectedHoldings: 25,
    status: 'staged',
    notes: ''
  };
}

export function buildEmptyPortfolioDetail(): PortfolioDetail {
  return {
    accountId: undefined,
    name: '',
    portfolioName: '',
    description: '',
    mandate: '',
    status: 'draft',
    version: 1,
    benchmarkSymbol: 'SPY',
    baseCurrency: 'USD',
    sleeveCount: 2,
    targetGrossExposurePct: 100,
    cashReservePct: 100,
    inceptionDate: new Date().toISOString().slice(0, 10),
    openingCash: 100000,
    buildStatus: null,
    lastBuiltAt: null,
    updated_at: null,
    updated_by: null,
    notes: '',
    recentLedgerEvents: [],
    freshness: [],
    activeAssignment: null,
    config: {
      benchmarkSymbol: 'SPY',
      baseCurrency: 'USD',
      allocationMode: 'percent',
      allocatableCapital: null,
      rebalanceCadence: 'weekly',
      rebalanceAnchor: 'Strategy native cadence',
      targetGrossExposurePct: 100,
      cashReservePct: 100,
      maxNames: 60,
      sleeves: [buildEmptyPortfolioSleeve(0), buildEmptyPortfolioSleeve(1)],
      riskLimits: { ...DEFAULT_RISK_LIMITS },
      executionPolicy: { ...DEFAULT_EXECUTION_POLICY },
      overlays: { ...DEFAULT_OVERLAYS }
    }
  };
}

export function serializePortfolioDetail(detail: PortfolioDetail): string {
  return JSON.stringify(detail);
}

export function getPortfolioSearchText(summary: PortfolioSummary): string {
  return [
    summary.name,
    summary.description,
    summary.mandate,
    summary.portfolioName,
    summary.benchmarkSymbol,
    summary.status
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function sortPortfolios(portfolios: readonly PortfolioSummary[]): PortfolioSummary[] {
  return [...portfolios].sort((left, right) => {
    const leftTime = left.updated_at ? Date.parse(left.updated_at) : 0;
    const rightTime = right.updated_at ? Date.parse(right.updated_at) : 0;

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return left.name.localeCompare(right.name);
  });
}

export function getTargetWeightTotal(detail: PortfolioDetail): number {
  return detail.config.sleeves.reduce(
    (total, sleeve) => total + (sleeve.derivedWeightPct ?? sleeve.targetWeightPct),
    0
  );
}

export function getRemainingWeightPct(detail: PortfolioDetail): number {
  return Number(Math.max(0, 100 - getTargetWeightTotal(detail)).toFixed(2));
}
