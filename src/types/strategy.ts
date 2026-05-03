// Core data types for the Strategy & Backtest Evaluation Dashboard

import type {
  ExitRule,
  IntrabarConflictPolicy,
  RankingSchemaConfig,
  RebalancePolicy,
  RegimePolicy,
  StrategyConfig,
  StrategyComponentRefs,
  UniverseConditionOperator as ContractUniverseConditionOperator,
  UniverseSource,
  UniverseValue
} from '@asset-allocation/contracts';

export type {
  ConfigIdentity,
  ConfigReference,
  ExitRule,
  ExitRuleAction,
  ExitRulePriceField,
  ExitRuleReference,
  ExitRuleScope,
  ExitRuleType,
  IntrabarConflictPolicy,
  RankingDirection,
  RankingFactor,
  RankingGroup,
  RankingMissingValuePolicy,
  RankingSchemaConfig,
  RankingTransform,
  RankingTransformType,
  RebalancePolicy,
  RebalancePolicyPreset,
  RegimeCode,
  RegimePolicy,
  RegimePolicyMode,
  ReusableConfigIntendedUse,
  ReusableConfigStatus,
  ReusableRebalanceAnchor,
  ReusableRebalanceCadence,
  ReusableRebalanceDayRule,
  StrategyConfig,
  StrategyComponentRefs,
  UniverseSource,
  UniverseValue
} from '@asset-allocation/contracts';

export type UniverseConditionOperator = ContractUniverseConditionOperator;
export type RegimePolicyWithVersion = RegimePolicy & { modelVersion?: number | null };

export type StrategyRiskPolicyScope = 'strategy' | 'sleeve';
export type StrategyRiskStopLossBasis = 'strategy_nav_drawdown' | 'sleeve_nav_drawdown';
export type StrategyRiskTakeProfitBasis = 'strategy_nav_gain' | 'sleeve_nav_gain';
export type StrategyRiskStopLossAction = 'reduce_exposure' | 'liquidate' | 'freeze_buys';
export type StrategyRiskTakeProfitAction = 'reduce_exposure' | 'rebalance_to_target';

export interface StrategyRiskStopLossPolicy {
  id: string;
  enabled: boolean;
  basis: StrategyRiskStopLossBasis;
  thresholdPct: number;
  action: StrategyRiskStopLossAction;
  reductionPct?: number | null;
}

export interface StrategyRiskTakeProfitPolicy {
  id: string;
  enabled: boolean;
  basis: StrategyRiskTakeProfitBasis;
  thresholdPct: number;
  action: StrategyRiskTakeProfitAction;
  reductionPct?: number | null;
}

export interface StrategyRiskReentryPolicy {
  cooldownBars: number;
  requireApproval: boolean;
}

export interface StrategyRiskPolicy {
  enabled: boolean;
  scope: StrategyRiskPolicyScope;
  stopLoss?: StrategyRiskStopLossPolicy | null;
  takeProfit?: StrategyRiskTakeProfitPolicy | null;
  reentry: StrategyRiskReentryPolicy;
}

export type UniverseGroupOperator = 'and' | 'or';
export type StrategyConfigWithRiskPolicy = StrategyConfig & {
  componentRefs?: StrategyComponentRefs | null;
  universeConfigVersion?: number | null;
  rankingSchemaVersion?: number | null;
  regimePolicyConfigName?: string | null;
  regimePolicyConfigVersion?: number | null;
  riskPolicyName?: string | null;
  riskPolicyVersion?: number | null;
  exitRuleSetName?: string | null;
  exitRuleSetVersion?: number | null;
  regimePolicy?: RegimePolicyWithVersion | null;
  riskPolicy?: StrategyRiskPolicy | null;
  strategyRiskPolicy?: StrategyRiskPolicy | null;
  rebalancePolicy?: RebalancePolicy | null;
};

export interface ConfigSaveResponse {
  status: string;
  message: string;
  version: number;
}

export interface ConfigMutationResponse {
  status: string;
  message: string;
}

export interface ConfigRevisionSummary<ConfigShape> {
  name: string;
  version: number;
  description?: string;
  config: ConfigShape;
  configHash?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
}

export interface ReusableConfigMetadata {
  status?: 'draft' | 'active' | 'deprecated';
  intendedUse?: 'research' | 'validation' | 'production_candidate';
  thesis?: string;
  whatToMonitor?: string[];
}

export interface RegimePolicyConfig {
  modelName: string;
  modelVersion?: number | null;
  mode: 'observe_only';
}

export interface RegimePolicyConfigSummary extends ReusableConfigMetadata {
  name: string;
  description?: string;
  version: number;
  archived?: boolean;
  usageCount?: number;
  modelName?: string;
  modelVersion?: number | null;
  mode?: 'observe_only';
  updatedAt?: string | null;
}

export type RegimePolicyConfigRevision = ConfigRevisionSummary<RegimePolicyConfig>;

export interface RegimePolicyConfigDetail {
  policy: RegimePolicyConfigSummary;
  activeRevision?: RegimePolicyConfigRevision | null;
  revisions: RegimePolicyConfigRevision[];
}

export interface RegimePolicyConfigUpsertRequest extends ReusableConfigMetadata {
  name: string;
  description?: string;
  config: RegimePolicyConfig;
}

export interface RiskPolicyConfig {
  policy: StrategyRiskPolicy;
}

export interface RiskPolicyConfigSummary extends ReusableConfigMetadata {
  name: string;
  description?: string;
  version: number;
  archived?: boolean;
  usageCount?: number;
  updatedAt?: string | null;
}

export type RiskPolicyConfigRevision = ConfigRevisionSummary<RiskPolicyConfig>;

export interface RiskPolicyConfigDetail {
  policy: RiskPolicyConfigSummary;
  activeRevision?: RiskPolicyConfigRevision | null;
  revisions: RiskPolicyConfigRevision[];
}

export interface RiskPolicyConfigUpsertRequest extends ReusableConfigMetadata {
  name: string;
  description?: string;
  config: RiskPolicyConfig;
}

export interface ExitRuleSetConfig {
  intrabarConflictPolicy: IntrabarConflictPolicy;
  exits: ExitRule[];
}

export interface ExitRuleSetSummary extends ReusableConfigMetadata {
  name: string;
  description?: string;
  version: number;
  archived?: boolean;
  usageCount?: number;
  ruleCount?: number;
  updatedAt?: string | null;
}

export type ExitRuleSetRevision = ConfigRevisionSummary<ExitRuleSetConfig>;

export interface ExitRuleSetDetail {
  ruleSet: ExitRuleSetSummary;
  activeRevision?: ExitRuleSetRevision | null;
  revisions: ExitRuleSetRevision[];
}

export interface ExitRuleSetUpsertRequest extends ReusableConfigMetadata {
  name: string;
  description?: string;
  config: ExitRuleSetConfig;
}

export type RebalancePolicyConfig = RebalancePolicy;

export interface RebalancePolicySummary extends ReusableConfigMetadata {
  name: string;
  description?: string;
  version: number;
  archived?: boolean;
  usageCount?: number;
  cadence?: RebalancePolicy['cadence'];
  dayRule?: RebalancePolicy['dayRule'];
  anchor?: RebalancePolicy['anchor'];
  updatedAt?: string | null;
}

export type RebalancePolicyRevision = ConfigRevisionSummary<RebalancePolicyConfig>;

export interface RebalancePolicyDetail {
  policy: RebalancePolicySummary;
  activeRevision?: RebalancePolicyRevision | null;
  revisions: RebalancePolicyRevision[];
}

export interface RebalancePolicyUpsertRequest extends ReusableConfigMetadata {
  name: string;
  description?: string;
  config: RebalancePolicyConfig | { policy: RebalancePolicyConfig };
}

export type JobCategory = 'data-pipeline' | 'strategy-compute' | 'operational-support';
export type JobMetadataSource = 'tags' | 'legacy-catalog' | 'unknown';
export type JobMetadataStatus = 'valid' | 'fallback' | 'invalid';

export interface UniverseCondition {
  kind: 'condition';
  field: string;
  operator: UniverseConditionOperator;
  value?: UniverseValue;
  values?: UniverseValue[];
}

export interface UniverseGroup {
  kind: 'group';
  operator: UniverseGroupOperator;
  clauses: UniverseNode[];
}

export type UniverseNode = UniverseCondition | UniverseGroup;

export interface UniverseDefinition {
  source: UniverseSource;
  root: UniverseGroup;
}
export interface StrategyRun {
  id: string;
  name: string;
  tags: string[];
  startDate: string;
  endDate: string;
  // Metrics
  cagr: number;
  annVol: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  maxDD: number;
  timeToRecovery: number; // days
  turnoverAnn: number; // %
  avgLeverage: number;
  netGrossDelta: number; // bps
  betaToBenchmark: number;
  avgCorrelation: number;
  // Flags
  regimeFragility: boolean;
  costSensitive: boolean;
  tailRisk: boolean;
  // Series data
  equityCurve: TimeSeriesPoint[];
  drawdownCurve: TimeSeriesPoint[];
  monthlyReturns: MonthlyReturn[];
  rollingMetrics: RollingMetrics;
  // Holdings
  holdings: HoldingSnapshot[];
  trades: Trade[];
  // Attribution
  contributions: Contribution[];
  // Config
  config: StrategyConfig;
  // Audit
  audit: AuditTrail;
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface MonthlyReturn {
  year: number;
  month: number;
  return: number;
}

export interface RollingMetrics {
  sharpe: TimeSeriesPoint[];
  volatility: TimeSeriesPoint[];
  beta: TimeSeriesPoint[];
  correlation: TimeSeriesPoint[];
  maxDD: TimeSeriesPoint[];
  turnover: TimeSeriesPoint[];
}

export interface HoldingSnapshot {
  date: string;
  symbol: string;
  weight: number;
  sector: string;
  marketCap: number;
}

export interface Trade {
  date: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  shares: number;
  price: number;
  commission: number;
  slippage: number;
  pnl?: number; // Realized P&L for this trade (for sells)
  pnlPercent?: number; // P&L as percentage of entry price
  entryPrice?: number;
  exitPrice?: number;
  exitReason?: string;
  exitRuleId?: string;
  barsHeld?: number;
  intrabarConflictCount?: number;
}

export interface Contribution {
  name: string; // symbol, sector, or factor
  type: 'symbol' | 'sector' | 'factor';
  contribution: number; // total P&L
}

export type UniverseValueKind = 'string' | 'number' | 'boolean' | 'date' | 'datetime';
export type RankingCatalogValueKind = 'number' | 'boolean';

export interface UniverseFieldDefinition {
  field: string;
  dataType: string;
  valueKind: UniverseValueKind;
  operators: UniverseConditionOperator[];
}

export interface UniverseCatalogResponse {
  source: UniverseSource;
  fields: UniverseFieldDefinition[];
}

export interface UniversePreviewResponse {
  source: UniverseSource;
  symbolCount: number;
  sampleSymbols: string[];
  fieldsUsed: string[];
  warnings: string[];
}

export interface StrategySummary {
  name: string;
  type: string;
  description?: string;
  output_table_name?: string;
  updated_at?: string;
}

export interface StrategyDetail extends StrategySummary {
  config: StrategyConfigWithRiskPolicy;
}

export interface UniverseConfigSummary {
  name: string;
  description?: string;
  version: number;
  updated_at?: string;
}

export interface UniverseConfigDetail extends UniverseConfigSummary {
  config: UniverseDefinition;
}

export interface RankingSchemaSummary {
  name: string;
  description?: string;
  version: number;
  updated_at?: string;
}

export interface RankingSchemaDetail extends RankingSchemaSummary {
  config: RankingSchemaConfig;
}

export interface RankingCatalogColumn {
  name: string;
  dataType: string;
  valueKind: RankingCatalogValueKind;
}

export interface RankingCatalogTable {
  name: string;
  asOfColumn: string;
  columns: RankingCatalogColumn[];
}

export interface RankingCatalogResponse {
  source: UniverseSource;
  tables: RankingCatalogTable[];
}

export interface RankingPreviewRow {
  symbol: string;
  rank: number;
  score: number;
}

export interface RankingPreviewResponse {
  strategyName: string;
  asOfDate: string;
  rowCount: number;
  rows: RankingPreviewRow[];
  warnings: string[];
}

export interface RankingMaterializationSummary {
  strategyName: string;
  outputTableName: string;
  rowCount: number;
  dateCount: number;
  warnings?: string[];
}

export interface AuditTrail {
  gitSha: string;
  dataVersionId: string;
  configHash: string;
  createdAt: string;
  runDate: string;
  warnings: string[];
}

export interface Drawdown {
  startDate: string;
  troughDate: string;
  endDate?: string;
  depth: number;
  duration: number; // days
  recovery?: number; // days
}

export interface StressEvent {
  name: string;
  date: string;
  strategyReturn: number;
  benchmarkReturn: number;
}

export interface DataDomain {
  name: string;
  type: 'blob' | 'delta';
  path: string;
  lastUpdated: string | null;
  status: 'healthy' | 'stale' | 'error';
  version?: number | null;
  description?: string;
  portalUrl?: string;
  jobUrl?: string | null;
  jobName?: string | null;
  triggerUrl?: string | null;
  frequency?: string;
  cron?: string;
  maxAgeSeconds?: number;
}

export interface DomainDateRange {
  min?: string | null;
  max?: string | null;
  column?: string | null;
  source?: 'partition' | 'stats' | 'artifact' | null;
}

export interface DomainMetadata {
  layer: 'bronze' | 'silver' | 'gold' | 'platinum';
  domain: string;
  container: string;
  type: 'blob' | 'delta';
  computedAt: string;
  folderLastModified?: string | null;
  cachedAt?: string | null;
  cacheSource?: 'snapshot' | 'live-refresh' | null;
  symbolCount?: number | null;
  columns?: string[];
  columnCount?: number | null;
  financeSubfolderSymbolCounts?: Record<
    'balance_sheet' | 'income_statement' | 'cash_flow' | 'valuation',
    number
  > | null;
  blacklistedSymbolCount?: number | null;
  metadataPath?: string | null;
  metadataSource?: 'artifact' | 'scan' | null;
  dateRange?: DomainDateRange | null;
  totalRows?: number | null;
  fileCount?: number | null;
  totalBytes?: number | null;
  deltaVersion?: number | null;
  tablePath?: string | null;
  prefix?: string | null;
  warnings?: string[];
}

export interface DataLayer {
  name: string;
  description: string;
  status: 'healthy' | 'stale' | 'error' | 'degraded' | 'critical' | 'warning';
  lastUpdated: string;
  dataVersion?: string;
  recordCount?: number;
  refreshFrequency: string;
  maxAgeSeconds?: number;
  nextExpectedUpdate?: string;
  domains?: DataDomain[];
  portalUrl?: string;
  jobUrl?: string;
  triggerUrl?: string;
}

export interface JobRunMetadata {
  retrySymbols?: string[];
  retrySymbolCount?: number;
  retrySymbolsTruncated?: boolean;
  retrySymbolsUpdatedAt?: string | null;
}

export interface JobRun {
  jobName: string;
  jobType: string;
  jobCategory?: JobCategory;
  jobKey?: string;
  jobRole?: string;
  triggerOwner?: string;
  metadataSource?: JobMetadataSource;
  metadataStatus?: JobMetadataStatus;
  metadataErrors?: string[];
  status: 'success' | 'warning' | 'failed' | 'running' | 'pending';
  statusCode?: string;
  startTime: string;
  duration?: number; // seconds
  recordsProcessed?: number;
  gitSha?: string;
  triggeredBy: string;
  errors?: string[];
  warnings?: string[];
  metadata?: JobRunMetadata;
  executionId?: string | null;
  executionName?: string | null;
}

export interface SystemAlert {
  id?: string;
  severity: 'critical' | 'error' | 'warning' | 'info';
  title?: string;
  component: string;
  timestamp: string;
  message: string;
}

export interface ResourceHealth {
  name: string;
  resourceType: string;
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  jobCategory?: JobCategory;
  jobKey?: string;
  jobRole?: string;
  triggerOwner?: string;
  metadataSource?: JobMetadataSource;
  metadataStatus?: JobMetadataStatus;
  metadataErrors?: string[];
  lastChecked: string;
  details?: string;
  azureId?: string;
  runningState?: string;
  lastModifiedAt?: string | null;
  signals?: ResourceSignal[];
}

export interface ResourceSignal {
  name: string;
  value: number | null;
  unit: string;
  timestamp: string;
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  source?: 'metrics' | 'logs';
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  dataLayers: DataLayer[];
  recentJobs: JobRun[];
  alerts: SystemAlert[];
  resources?: ResourceHealth[];
}

export interface TradingSignal {
  id: string;
  date: string;
  generatedAt?: string;
  symbol: string;
  strategy?: string;
  strategyId?: string;
  strategyName?: string;
  signal?: number; // -1 to 1
  signalType?: string;
  strength?: number;
  confidence?: number;
  rank?: number;
  nSymbols?: number;
  score?: number | null;
  direction?: 'LONG' | 'SHORT' | 'FLAT';
  sector?: string;
  targetPrice?: number;
  stopLoss?: number;
  expectedReturn?: number;
  timeHorizon?: string;
  positionSize?: number;
  riskScore?: number;
  catalysts?: string[];
  currentPrice?: number;
  priceChange24h?: number;
}
