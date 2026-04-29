export { ApiError } from '@/services/apiService';
import { request as apiRequest } from '@/services/apiService';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';
export type DataDomain = 'market' | 'earnings' | 'price-target';

export interface RunRecordResponse {
  run_id: string;
  status: RunStatus;
  submitted_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  run_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  error?: string | null;
  strategy_name?: string | null;
  strategy_version?: number | null;
  bar_size?: string | null;
  execution_name?: string | null;
  results_ready_at?: string | null;
  results_schema_version?: number | null;
  pins?: RunPinsResponse | null;
  owner?: string | null;
  submitted_by?: string | null;
  assumptions?: BacktestExecutionAssumptions | null;
}

export interface RunListResponse {
  runs: RunRecordResponse[];
  limit: number;
  offset: number;
}

export interface TimeseriesPointResponse {
  date: string;
  portfolio_value: number;
  drawdown: number;
  period_return?: number | null;
  daily_return?: number | null;
  cumulative_return?: number | null;
  cash?: number | null;
  gross_exposure?: number | null;
  net_exposure?: number | null;
  turnover?: number | null;
  commission?: number | null;
  slippage_cost?: number | null;
}

export interface BacktestResultMetadata {
  results_schema_version: number;
  bar_size: string;
  periods_per_year: number;
  strategy_scope: string;
}

export interface TimeseriesResponse {
  metadata?: BacktestResultMetadata | null;
  points: TimeseriesPointResponse[];
  total_points: number;
  truncated: boolean;
}

export interface RollingMetricPointResponse {
  date: string;
  window_days: number;
  window_periods?: number | null;
  rolling_return?: number | null;
  rolling_volatility?: number | null;
  rolling_sharpe?: number | null;
  rolling_max_drawdown?: number | null;
  turnover_sum?: number | null;
  commission_sum?: number | null;
  slippage_cost_sum?: number | null;
  n_trades_sum?: number | null;
  gross_exposure_avg?: number | null;
  net_exposure_avg?: number | null;
}

export interface RollingMetricsResponse {
  metadata?: BacktestResultMetadata | null;
  points: RollingMetricPointResponse[];
  total_points: number;
  truncated: boolean;
}

export interface JobTriggerResponse {
  jobName: string;
  status: string;
  executionId?: string | null;
  executionName?: string | null;
}

export interface JobControlResponse {
  jobName: string;
  action: 'suspend' | 'resume' | 'stop';
  command?: 'suspend' | 'resume' | 'stop' | 'run';
  runningState?: string | null;
}

export interface JobConsoleLogEntry {
  timestamp?: string | null;
  stream_s?: string | null;
  executionName?: string | null;
  message: string;
}

export interface JobLogRunResponse {
  executionName?: string | null;
  executionId?: string | null;
  status?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  tail: string[];
  consoleLogs?: JobConsoleLogEntry[];
  error?: string | null;
}

export interface JobLogsResponse {
  jobName: string;
  runsRequested: number;
  runsReturned: number;
  tailLines: number;
  runs: JobLogRunResponse[];
}

export interface StockScreenerRow {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  industry?: string | null;
  country?: string | null;
  isOptionable?: boolean | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  return1d?: number | null;
  return5d?: number | null;
  vol20d?: number | null;
  drawdown1y?: number | null;
  atr14d?: number | null;
  gapAtr?: number | null;
  sma50d?: number | null;
  sma200d?: number | null;
  trend50_200?: number | null;
  aboveSma50?: number | null;
  bbWidth20d?: number | null;
  compressionScore?: number | null;
  volumeZ20d?: number | null;
  volumePctRank252d?: number | null;
  hasSilver?: number | null;
  hasGold?: number | null;
}

export interface StockScreenerResponse {
  asOf: string;
  total: number;
  limit: number;
  offset: number;
  rows: StockScreenerRow[];
}

export interface TradeResponse {
  execution_date: string;
  symbol: string;
  quantity: number;
  price: number;
  notional: number;
  commission: number;
  slippage_cost: number;
  cash_after: number;
  position_id?: string | null;
  trade_role?: 'entry' | 'rebalance_increase' | 'rebalance_decrease' | 'exit' | null;
}

export interface TradeListResponse {
  trades: TradeResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface ClosedPositionResponse {
  position_id: string;
  symbol: string;
  opened_at: string;
  closed_at: string;
  holding_period_bars: number;
  average_cost: number;
  exit_price: number;
  max_quantity: number;
  resize_count: number;
  realized_pnl: number;
  realized_return?: number | null;
  total_commission: number;
  total_slippage_cost: number;
  total_transaction_cost: number;
  exit_reason?: string | null;
  exit_rule_id?: string | null;
}

export interface ClosedPositionListResponse {
  positions: ClosedPositionResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface StrategyReferenceInput {
  strategyName: string;
  strategyVersion?: number | null;
}

export interface BacktestExecutionAssumptions {
  initialCapital?: number | null;
  benchmarkSymbol?: string | null;
  costModel?: string | null;
  commissionBps?: number | null;
  commissionPerShare?: number | null;
  slippageBps?: number | null;
  spreadBps?: number | null;
  marketImpactBps?: number | null;
  borrowCostBps?: number | null;
  financingCostBps?: number | null;
  participationCapPct?: number | null;
  latencyBars?: number | null;
  liquidityFilters?: Record<string, unknown>;
  notes?: string;
}

export interface BacktestRunRequest {
  strategyRef?: StrategyReferenceInput | null;
  strategyConfig?: Record<string, unknown> | null;
  startTs: string;
  endTs: string;
  barSize: string;
  runName?: string | null;
  assumptions?: BacktestExecutionAssumptions | null;
}

export interface RunPinsResponse {
  strategyName?: string | null;
  strategyVersion?: number | null;
  rankingSchemaName?: string | null;
  rankingSchemaVersion?: number | null;
  universeName?: string | null;
  universeVersion?: number | null;
  regimeModelName?: string | null;
  regimeModelVersion?: number | null;
}

export interface BacktestRunResponse {
  run: RunRecordResponse;
  created: boolean;
  reusedInflight: boolean;
  streamUrl: string;
}

export type BacktestValidationVerdict = 'pass' | 'warn' | 'block';
export type BacktestValidationSeverity = 'info' | 'warning' | 'critical';

export interface BacktestValidationCheck {
  code: string;
  label: string;
  verdict: BacktestValidationVerdict;
  severity: BacktestValidationSeverity;
  message: string;
  evidence: Record<string, unknown>;
}

export interface BacktestValidationReport {
  verdict: BacktestValidationVerdict;
  checks: BacktestValidationCheck[];
  blockedReasons: string[];
  warnings: string[];
  duplicateRun?: RunRecordResponse | null;
  reusedInflightRun?: RunRecordResponse | null;
  generatedAt?: string | null;
}

export type BacktestProvenanceQuality = 'complete' | 'partial' | 'missing' | 'contradictory';

export interface BacktestDataProvenance {
  quality: BacktestProvenanceQuality;
  dataSnapshotId?: string | null;
  vendor?: string | null;
  source?: string | null;
  loadId?: string | null;
  schemaVersion?: string | null;
  adjustmentPolicy?: string | null;
  symbolMapVersion?: string | null;
  corporateActionState?: string | null;
  coveragePct?: number | null;
  nullCount?: number | null;
  gapCount?: number | null;
  staleCount?: number | null;
  quarantined: boolean;
  warnings: string[];
}

export interface BacktestRunDetailResponse {
  run: RunRecordResponse;
  request?: BacktestRunRequest | null;
  effectiveConfig: Record<string, unknown>;
  configHash?: string | null;
  requestHash?: string | null;
  owner?: string | null;
  assumptions?: BacktestExecutionAssumptions | null;
  validation?: BacktestValidationReport | null;
  provenance?: BacktestDataProvenance | null;
  links?: {
    summaryUrl: string;
    metricsTimeseriesUrl: string;
    metricsRollingUrl: string;
    tradesUrl: string;
    closedPositionsUrl: string;
  } | null;
  warnings: string[];
}

export type BacktestReplayEventType =
  | 'signal'
  | 'order_decision'
  | 'fill_assumption'
  | 'position_update'
  | 'risk_limit'
  | 'exit'
  | 'corporate_action'
  | 'data_event'
  | 'cash';

export type BacktestReplayExecutionSource =
  | 'simulated'
  | 'broker_fill'
  | 'portfolio_ledger'
  | 'unknown';

export interface BacktestReplayPositionState {
  symbol: string;
  quantity: number;
  marketValue?: number | null;
  weight?: number | null;
  averageCost?: number | null;
  unrealizedPnl?: number | null;
}

export interface BacktestReplayEvent {
  eventId: string;
  sequence: number;
  timestamp: string;
  eventType: BacktestReplayEventType;
  symbol?: string | null;
  ruleId?: string | null;
  source: BacktestReplayExecutionSource;
  summary: string;
  beforeCash?: number | null;
  afterCash?: number | null;
  beforeGrossExposure?: number | null;
  afterGrossExposure?: number | null;
  beforeNetExposure?: number | null;
  afterNetExposure?: number | null;
  beforePositions: BacktestReplayPositionState[];
  afterPositions: BacktestReplayPositionState[];
  transactionCost?: number | null;
  benchmarkPrice?: number | null;
  evidence: Record<string, unknown>;
  warnings: string[];
}

export interface BacktestReplayTimelineResponse {
  runId: string;
  events: BacktestReplayEvent[];
  total: number;
  limit: number;
  offset: number;
  nextOffset?: number | null;
  warnings: string[];
}

export interface BacktestGrossToNetBridge {
  grossReturn?: number | null;
  commissionDrag?: number | null;
  slippageDrag?: number | null;
  spreadDrag?: number | null;
  marketImpactDrag?: number | null;
  borrowFinancingDrag?: number | null;
  netReturn?: number | null;
  costDragBps?: number | null;
}

export type BacktestAttributionSliceKind =
  | 'selection'
  | 'sizing'
  | 'timing'
  | 'implementation'
  | 'sector'
  | 'factor'
  | 'regime'
  | 'symbol'
  | 'outlier';

export interface BacktestAttributionSlice {
  kind: BacktestAttributionSliceKind;
  name: string;
  contributionReturn?: number | null;
  contributionPnl?: number | null;
  exposureAvg?: number | null;
  tradeCount?: number | null;
  notes: string[];
}

export interface BacktestAttributionExposureResponse {
  runId: string;
  asOf?: string | null;
  grossToNet?: BacktestGrossToNetBridge | null;
  slices: BacktestAttributionSlice[];
  concentration: BacktestAttributionSlice[];
  grossExposureAvg?: number | null;
  netExposureAvg?: number | null;
  turnover?: number | null;
  warnings: string[];
}

export interface BacktestRunComparisonRequest {
  baselineRunId: string;
  challengerRunIds: string[];
  metricKeys?: string[];
}

export interface BacktestRunComparisonMetric {
  metric: string;
  label: string;
  unit: string;
  values: Record<string, number | null>;
  winnerRunId?: string | null;
  notes: string;
}

export interface BacktestRunComparisonResponse {
  asOf: string;
  alignment: 'aligned' | 'caveated' | 'blocked';
  baselineRunId: string;
  runs: RunRecordResponse[];
  metrics: BacktestRunComparisonMetric[];
  alignmentWarnings: string[];
  blockedReasons: string[];
}

export type GenericDataRow = Record<string, unknown>;

export interface BacktestSummary {
  run_id?: string;
  run_name?: string;
  start_date?: string;
  end_date?: string;
  total_return?: number;
  annualized_return?: number;
  annualized_volatility?: number;
  sharpe_ratio?: number;
  max_drawdown?: number;
  trades?: number;
  initial_cash?: number;
  final_equity?: number;
  gross_total_return?: number;
  gross_annualized_return?: number;
  total_commission?: number;
  total_slippage_cost?: number;
  total_transaction_cost?: number;
  cost_drag_bps?: number;
  avg_gross_exposure?: number;
  avg_net_exposure?: number;
  sortino_ratio?: number;
  calmar_ratio?: number;
  closed_positions?: number;
  winning_positions?: number;
  losing_positions?: number;
  hit_rate?: number;
  avg_win_pnl?: number;
  avg_loss_pnl?: number;
  avg_win_return?: number;
  avg_loss_return?: number;
  payoff_ratio?: number;
  profit_factor?: number;
  expectancy_pnl?: number;
  expectancy_return?: number;
  metadata?: BacktestResultMetadata | null;
  [key: string]: unknown;
}

export interface ListRunsParams {
  status?: RunStatus;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface SubmitBacktestPayload {
  strategyName: string;
  strategyVersion?: number;
  startTs: string;
  endTs: string;
  barSize: string;
  runName?: string;
}

export interface GetTimeseriesParams {
  maxPoints?: number;
}

export interface GetRollingParams {
  windowDays?: number;
  maxPoints?: number;
}

export interface GetTradesParams {
  limit?: number;
  offset?: number;
}

export interface GetClosedPositionsParams {
  limit?: number;
  offset?: number;
}

export interface GetReplayParams {
  limit?: number;
  offset?: number;
  symbol?: string;
}

export const backtestApi = {
  async submitRun(
    payload: SubmitBacktestPayload,
    signal?: AbortSignal
  ): Promise<RunRecordResponse> {
    return apiRequest<RunRecordResponse>('/backtests', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async listRuns(params: ListRunsParams = {}, signal?: AbortSignal): Promise<RunListResponse> {
    return apiRequest<RunListResponse>('/backtests', {
      params: {
        status: params.status,
        q: params.q,
        limit: params.limit ?? 200,
        offset: params.offset ?? 0
      },
      signal
    });
  },

  async validateRun(
    payload: BacktestRunRequest,
    signal?: AbortSignal
  ): Promise<BacktestValidationReport> {
    return apiRequest<BacktestValidationReport>('/backtests/validation', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async runBacktest(
    payload: BacktestRunRequest,
    signal?: AbortSignal
  ): Promise<BacktestRunResponse> {
    return apiRequest<BacktestRunResponse>('/backtests/runs', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async getRunDetail(runId: string, signal?: AbortSignal): Promise<BacktestRunDetailResponse> {
    return apiRequest<BacktestRunDetailResponse>(
      `/backtests/${encodeURIComponent(runId)}/detail`,
      {
        signal
      }
    );
  },

  async getSummary(
    runId: string,
    _params: Record<string, never> = {},
    signal?: AbortSignal
  ): Promise<BacktestSummary> {
    return apiRequest<BacktestSummary>(`/backtests/${encodeURIComponent(runId)}/summary`, {
      signal
    });
  },

  async getTimeseries(
    runId: string,
    params: GetTimeseriesParams = {},
    signal?: AbortSignal
  ): Promise<TimeseriesResponse> {
    return apiRequest<TimeseriesResponse>(
      `/backtests/${encodeURIComponent(runId)}/metrics/timeseries`,
      {
        params: {
          max_points: params.maxPoints ?? 5000
        },
        signal
      }
    );
  },

  async getRolling(
    runId: string,
    params: GetRollingParams = {},
    signal?: AbortSignal
  ): Promise<RollingMetricsResponse> {
    return apiRequest<RollingMetricsResponse>(
      `/backtests/${encodeURIComponent(runId)}/metrics/rolling`,
      {
        params: {
          window_days: params.windowDays ?? 63,
          max_points: params.maxPoints ?? 5000
        },
        signal
      }
    );
  },

  async getReplay(
    runId: string,
    params: GetReplayParams = {},
    signal?: AbortSignal
  ): Promise<BacktestReplayTimelineResponse> {
    return apiRequest<BacktestReplayTimelineResponse>(
      `/backtests/${encodeURIComponent(runId)}/replay`,
      {
        params: {
          limit: params.limit ?? 500,
          offset: params.offset ?? 0,
          symbol: params.symbol || undefined
        },
        signal
      }
    );
  },

  async getAttributionExposure(
    runId: string,
    signal?: AbortSignal
  ): Promise<BacktestAttributionExposureResponse> {
    return apiRequest<BacktestAttributionExposureResponse>(
      `/backtests/${encodeURIComponent(runId)}/attribution-exposure`,
      {
        signal
      }
    );
  },

  async compareRuns(
    payload: BacktestRunComparisonRequest,
    signal?: AbortSignal
  ): Promise<BacktestRunComparisonResponse> {
    return apiRequest<BacktestRunComparisonResponse>('/backtests/compare', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async getTrades(
    runId: string,
    params: GetTradesParams = {},
    signal?: AbortSignal
  ): Promise<TradeListResponse> {
    return apiRequest<TradeListResponse>(`/backtests/${encodeURIComponent(runId)}/trades`, {
      params: {
        limit: params.limit ?? 2000,
        offset: params.offset ?? 0
      },
      signal
    });
  },

  async getClosedPositions(
    runId: string,
    params: GetClosedPositionsParams = {},
    signal?: AbortSignal
  ): Promise<ClosedPositionListResponse> {
    return apiRequest<ClosedPositionListResponse>(
      `/backtests/${encodeURIComponent(runId)}/positions/closed`,
      {
        params: {
          limit: params.limit ?? 2000,
          offset: params.offset ?? 0
        },
        signal
      }
    );
  },

  async triggerJob(jobName: string, signal?: AbortSignal): Promise<JobTriggerResponse> {
    const encoded = encodeURIComponent(jobName);
    return apiRequest<JobTriggerResponse>(`/system/jobs/${encoded}/run`, {
      method: 'POST',
      signal
    });
  },

  async suspendJob(jobName: string, signal?: AbortSignal): Promise<JobControlResponse> {
    const encoded = encodeURIComponent(jobName);
    return apiRequest<JobControlResponse>(`/system/jobs/${encoded}/suspend`, {
      method: 'POST',
      signal
    });
  },

  async stopJob(jobName: string, signal?: AbortSignal): Promise<JobControlResponse> {
    const encoded = encodeURIComponent(jobName);
    return apiRequest<JobControlResponse>(`/system/jobs/${encoded}/stop`, {
      method: 'POST',
      signal
    });
  },

  async resumeJob(jobName: string, signal?: AbortSignal): Promise<JobControlResponse> {
    const encoded = encodeURIComponent(jobName);
    return apiRequest<JobControlResponse>(`/system/jobs/${encoded}/resume`, {
      method: 'POST',
      signal
    });
  },

  async getJobLogs(
    jobName: string,
    params: { runs?: number } = {},
    signal?: AbortSignal
  ): Promise<JobLogsResponse> {
    const encoded = encodeURIComponent(jobName);
    return apiRequest<JobLogsResponse>(`/system/jobs/${encoded}/logs`, {
      params: { runs: params.runs ?? 1 },
      signal
    });
  }
};
