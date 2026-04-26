export type PortfolioStatus = 'draft' | 'active' | 'archived';
export type PortfolioBuildStatus = 'queued' | 'running' | 'completed' | 'failed' | 'partial';
export type PortfolioAlertSeverity = 'critical' | 'warning' | 'info';
export type PortfolioHealthTone = 'healthy' | 'warning' | 'critical';
export type PortfolioBuildScope = 'rebalance' | 'allocation-refresh' | 'materialization';
export type PortfolioRebalanceCadence = 'daily' | 'weekly' | 'monthly';
export type PortfolioSleeveStatus = 'active' | 'staged' | 'paused';
export type PortfolioAllocationMode = 'percent' | 'notional_base_ccy';

export interface PortfolioSummary {
  accountId?: string;
  portfolioName?: string;
  description?: string;
  mandate?: string;
  status: PortfolioStatus;
  version: number;
  benchmarkSymbol: string;
  baseCurrency: string;
  sleeveCount: number;
  targetGrossExposurePct: number;
  cashReservePct: number;
  inceptionDate?: string;
  openingCash?: number | null;
  lastBuiltAt?: string | null;
  buildStatus?: PortfolioBuildStatus | null;
  updated_at?: string | null;
  updated_by?: string | null;
  openAlertCount?: number;
  name: string;
}

export interface PortfolioSleeveDefinition {
  sleeveId: string;
  label: string;
  strategyName: string;
  strategyVersion: number;
  allocationMode?: PortfolioAllocationMode;
  targetWeightPct: number;
  targetNotionalBaseCcy?: number | null;
  derivedWeightPct?: number | null;
  minWeightPct: number;
  maxWeightPct: number;
  rebalanceBandPct: number;
  rebalancePriority: number;
  expectedHoldings: number;
  status: PortfolioSleeveStatus;
  notes?: string;
}

export interface PortfolioRiskLimits {
  grossExposurePct: number;
  netExposurePct: number;
  singleNameMaxPct: number;
  sectorMaxPct: number;
  turnoverBudgetPct: number;
  driftRebalanceThresholdPct: number;
}

export interface PortfolioExecutionPolicy {
  participationRatePct: number;
  maxTradeNotionalUsd: number;
  staggerMinutes: number;
}

export interface PortfolioOverlayConfig {
  regimeModelName?: string;
  riskModelName?: string;
  honorHaltFlag: boolean;
}

export interface PortfolioConfig {
  benchmarkSymbol: string;
  baseCurrency: string;
  allocationMode?: PortfolioAllocationMode;
  allocatableCapital?: number | null;
  rebalanceCadence: PortfolioRebalanceCadence;
  rebalanceAnchor: string;
  targetGrossExposurePct: number;
  cashReservePct: number;
  maxNames: number;
  sleeves: PortfolioSleeveDefinition[];
  riskLimits: PortfolioRiskLimits;
  executionPolicy: PortfolioExecutionPolicy;
  overlays: PortfolioOverlayConfig;
}

export interface PortfolioAssignmentSummary {
  assignmentId: string;
  accountVersion: number;
  portfolioName: string;
  portfolioVersion: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: 'scheduled' | 'active' | 'ended';
  notes?: string;
}

export interface PortfolioLedgerEventRow {
  eventId?: string;
  effectiveAt: string;
  eventType: string;
  currency: string;
  cashAmount: number;
  symbol?: string | null;
  quantity?: number | null;
  price?: number | null;
  commission?: number | null;
  slippageCost?: number | null;
  description?: string;
}

export interface PortfolioFreshnessRow {
  domain: string;
  state: 'fresh' | 'stale' | 'error' | 'missing';
  asOf?: string | null;
  checkedAt?: string | null;
  reason?: string;
}

export interface PortfolioDetail extends PortfolioSummary {
  portfolioName: string;
  accountId?: string;
  mandate: string;
  inceptionDate: string;
  openingCash?: number | null;
  notes?: string;
  config: PortfolioConfig;
  activeAssignment?: PortfolioAssignmentSummary | null;
  recentLedgerEvents: PortfolioLedgerEventRow[];
  freshness: PortfolioFreshnessRow[];
}

export interface PortfolioPreviewAllocation {
  sleeveId: string;
  label: string;
  strategyName: string;
  strategyVersion: number;
  targetWeightPct: number;
  projectedWeightPct: number;
  projectedGrossExposurePct: number;
  projectedTurnoverPct: number;
  expectedHoldings: number;
  status: PortfolioSleeveStatus;
}

export interface PortfolioPreviewSummary {
  targetWeightPct: number;
  residualCashPct: number;
  projectedGrossExposurePct: number;
  projectedNetExposurePct: number;
  projectedTurnoverPct: number;
  projectedPositionCount: number;
}

export interface PortfolioPreviewTradeProposal {
  sleeveId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  estimatedPrice: number;
  estimatedNotional: number;
  estimatedCommission: number;
  estimatedSlippageCost: number;
}

export interface PortfolioPreviewResponse {
  portfolioName: string;
  asOfDate: string;
  summary: PortfolioPreviewSummary;
  allocations: PortfolioPreviewAllocation[];
  warnings: string[];
  tradeProposals: PortfolioPreviewTradeProposal[];
  previewSource: 'live-proposal' | 'inferred';
  blocked: boolean;
  blockedReasons: string[];
}

export interface PortfolioAlert {
  alertId?: string;
  severity: PortfolioAlertSeverity;
  status?: 'open' | 'acknowledged' | 'resolved';
  code?: string;
  title: string;
  message: string;
  observedAt: string;
  asOfDate?: string | null;
}

export interface PortfolioSleeveMonitorRow {
  sleeveId: string;
  label: string;
  strategyName: string;
  strategyVersion: number;
  targetWeightPct: number;
  liveWeightPct: number;
  driftPct: number;
  marketValue?: number | null;
  returnContributionPct?: number | null;
  status: PortfolioHealthTone;
  lastSignalAt?: string | null;
}

export interface PortfolioPositionContributor {
  sleeveId: string;
  strategyName: string;
  strategyVersion: number;
  quantity: number;
  marketValue: number;
  weightPct: number;
}

export interface PortfolioPositionRow {
  asOfDate: string;
  symbol: string;
  quantity: number;
  marketValue: number;
  weightPct: number;
  averageCost?: number | null;
  lastPrice?: number | null;
  unrealizedPnl?: number | null;
  realizedPnl?: number | null;
  contributors: PortfolioPositionContributor[];
}

export interface PortfolioHistoryRow {
  asOfDate: string;
  nav: number;
  cash: number;
  grossExposurePct: number;
  netExposurePct: number;
  periodPnl?: number | null;
  periodReturnPct?: number | null;
  cumulativePnl?: number | null;
  cumulativeReturnPct?: number | null;
  drawdownPct?: number | null;
  turnoverPct?: number | null;
  costDragBps?: number | null;
}

export interface PortfolioMonitorSnapshot {
  accountId: string;
  accountName: string;
  portfolioName: string;
  mandate: string;
  benchmarkSymbol: string;
  baseCurrency: string;
  asOfDate: string;
  activeVersion?: number | null;
  buildHealth: PortfolioHealthTone;
  buildWindowLabel: string;
  nav: number;
  cash: number;
  cashPct: number;
  grossExposurePct: number;
  netExposurePct: number;
  sinceInceptionPnl: number;
  sinceInceptionReturnPct: number;
  currentDrawdownPct: number;
  maxDrawdownPct?: number | null;
  largestPositionPct: number;
  realizedTurnoverPct: number;
  driftPct: number;
  alerts: PortfolioAlert[];
  sleeves: PortfolioSleeveMonitorRow[];
  positions: PortfolioPositionRow[];
  history: PortfolioHistoryRow[];
  ledgerEvents: PortfolioLedgerEventRow[];
  freshness: PortfolioFreshnessRow[];
}

export interface PortfolioBuildRunSummary {
  runId: string;
  portfolioName: string;
  accountId?: string;
  status: PortfolioBuildStatus;
  buildScope: PortfolioBuildScope;
  triggeredBy: string;
  asOfDate: string;
  submittedAt: string;
  completedAt?: string | null;
  targetGrossExposurePct?: number | null;
  liveGrossExposurePct?: number | null;
  driftPct?: number | null;
  tradeCount?: number | null;
  error?: string | null;
}

export interface PortfolioBuildListResponse {
  runs: PortfolioBuildRunSummary[];
  limit: number;
  offset: number;
  total: number;
}

export interface TriggerPortfolioBuildPayload {
  asOfDate?: string;
  buildScope?: PortfolioBuildScope;
  force?: boolean;
}

export interface TriggerPortfolioBuildResponse {
  status: string;
  message?: string;
  run: PortfolioBuildRunSummary;
}
