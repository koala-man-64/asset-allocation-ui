export type StrategyAnalyticsSource =
  | 'control_plane'
  | 'backtest'
  | 'portfolio'
  | 'trade_desk'
  | 'broker';

export type StrategyComparisonRole = 'baseline' | 'challenger' | 'candidate';
export type StrategyMetricUnit = 'ratio' | 'currency' | 'count' | 'bps' | 'days' | 'score';
export type StrategyForecastConfidence = 'high' | 'medium' | 'low' | 'thin';
export type StrategyForecastSampleMode =
  | 'regime_conditioned'
  | 'fallback_history'
  | 'insufficient_history';
export type StrategyTradeHistorySource =
  | 'backtest'
  | 'portfolio_ledger'
  | 'trade_order'
  | 'broker_fill';
export type StrategyAllocationExposureStatus = 'active' | 'staged' | 'paused' | 'missing';

export interface StrategyRiskPolicy {
  grossExposureLimit?: number | null;
  netExposureLimit?: number | null;
  singleNameMaxWeight?: number | null;
  sectorMaxWeight?: number | null;
  turnoverBudget?: number | null;
  maxDrawdownLimit?: number | null;
  liquidityParticipationRate?: number | null;
  maxTradeNotionalBaseCcy?: number | null;
  notes: string;
}

export interface StrategyAnalyticsReference {
  strategyName: string;
  strategyVersion?: number | null;
  runId?: string | null;
  role: StrategyComparisonRole;
  label?: string | null;
}

export interface StrategyComparisonRequest {
  strategies: StrategyAnalyticsReference[];
  startDate: string;
  endDate: string;
  benchmarkSymbol?: string | null;
  costModel: string;
  barSize: string;
  regimeModelName?: string | null;
  scenarioAssumption?: string | null;
  includeForecast: boolean;
}

export interface StrategyComparisonMetricRow {
  metric: string;
  label: string;
  unit: StrategyMetricUnit;
  values: Record<string, number | null>;
  winnerStrategyName?: string | null;
  notes: string;
}

export interface StrategyComparisonRunEvidence {
  strategyName: string;
  strategyVersion?: number | null;
  runId?: string | null;
  startDate: string;
  endDate: string;
  barSize: string;
  costModel: string;
  resultSchemaVersion?: number | null;
  warnings: string[];
}

export interface StrategyComparisonResponse {
  asOf: string;
  benchmarkSymbol?: string | null;
  costModel: string;
  barSize: string;
  strategies: StrategyAnalyticsReference[];
  metrics: StrategyComparisonMetricRow[];
  runEvidence: StrategyComparisonRunEvidence[];
  warnings: string[];
  blockedReasons: string[];
}

export interface StrategyScenarioForecastRequest {
  strategies: StrategyAnalyticsReference[];
  asOfDate?: string | null;
  horizon: string;
  regimeModelName?: string | null;
  regimeAssumption: string;
  costDragOverrideBps?: number | null;
  tunableParameters: Record<string, string | number | boolean | null>;
}

export interface StrategyForecastRow {
  strategyName: string;
  strategyVersion?: number | null;
  expectedReturn?: number | null;
  expectedActiveReturn?: number | null;
  downside?: number | null;
  upside?: number | null;
  confidence: StrategyForecastConfidence;
  sampleSize: number;
  sampleMode: StrategyForecastSampleMode;
  appliedRegimeCode: string;
  source: StrategyAnalyticsSource;
  notes: string[];
}

export interface StrategyScenarioForecastResponse {
  asOf: string;
  horizon: string;
  regimeAssumption: string;
  source: StrategyAnalyticsSource;
  forecasts: StrategyForecastRow[];
  warnings: string[];
}

export interface StrategyAllocationExposureRequest {
  strategyName: string;
  strategyVersion?: number | null;
  accountIds: string[];
  includePositions: boolean;
}

export interface StrategyAllocationExposureRow {
  accountId: string;
  accountName: string;
  portfolioName: string;
  portfolioVersion?: number | null;
  sleeveId: string;
  sleeveName: string;
  strategyName: string;
  strategyVersion: number;
  asOf: string;
  targetWeight?: number | null;
  actualWeight?: number | null;
  drift?: number | null;
  marketValue?: number | null;
  grossExposure?: number | null;
  netExposure?: number | null;
  status: StrategyAllocationExposureStatus;
}

export interface StrategyAllocationPositionRow {
  accountId: string;
  portfolioName: string;
  sleeveId: string;
  symbol: string;
  asOf: string;
  quantity: number;
  marketValue: number;
  weight: number;
}

export interface StrategyAllocationExposureResponse {
  strategyName: string;
  strategyVersion?: number | null;
  asOf: string;
  totalMarketValue?: number | null;
  aggregateTargetWeight?: number | null;
  aggregateActualWeight?: number | null;
  aggregateGrossExposure?: number | null;
  aggregateNetExposure?: number | null;
  exposures: StrategyAllocationExposureRow[];
  positions: StrategyAllocationPositionRow[];
  warnings: string[];
}

export interface StrategyTradeHistoryRequest {
  strategyName: string;
  strategyVersion?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  sources: StrategyTradeHistorySource[];
  limit: number;
  offset: number;
}

export interface StrategyTradeHistoryRow {
  source: StrategyTradeHistorySource;
  timestamp: string;
  symbol: string;
  side?: 'buy' | 'sell' | null;
  quantity: number;
  price?: number | null;
  notional?: number | null;
  commission: number;
  slippageCost: number;
  realizedPnl?: number | null;
  accountId?: string | null;
  portfolioName?: string | null;
  runId?: string | null;
  orderId?: string | null;
  eventId?: string | null;
}

export interface StrategyTradeHistoryResponse {
  strategyName: string;
  strategyVersion?: number | null;
  trades: StrategyTradeHistoryRow[];
  total: number;
  limit: number;
  offset: number;
  warnings: string[];
}
