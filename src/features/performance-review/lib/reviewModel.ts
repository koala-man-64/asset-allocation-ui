import type {
  BacktestSummary,
  ClosedPositionResponse,
  RollingMetricPointResponse,
  TimeseriesPointResponse,
  TradeResponse
} from '@/services/backtestApi';

export type ReviewVerdict = 'Institutional' | 'Workable' | 'Fragile' | 'Rejected';

export interface ReviewScorecardRow {
  label: string;
  score: number;
  proxy?: boolean;
  detail: string;
}

export interface ReviewModel {
  verdict: ReviewVerdict;
  verdictDetail: string;
  scorecard: ReviewScorecardRow[];
  correctiveActions: string[];
  missingEvidence: string[];
  positiveRollingSharpeShare: number | null;
  worstRollingDrawdown: number | null;
  averageRollingTurnover: number | null;
}

function clampScore(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

function scoreAscending(value: number | null | undefined, thresholds: number[]): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  let score = 1;
  thresholds.forEach((threshold, index) => {
    if (value >= threshold) {
      score = index + 2;
    }
  });
  return Math.min(score, 5);
}

function scoreDescending(value: number | null | undefined, thresholds: number[]): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  if (value <= thresholds[3]) return 5;
  if (value <= thresholds[2]) return 4;
  if (value <= thresholds[1]) return 3;
  if (value <= thresholds[0]) return 2;
  return 1;
}

function averageScores(scores: Array<number | null>): number {
  const presentScores = scores.filter((score): score is number => score !== null);
  if (!presentScores.length) {
    return 2;
  }

  return clampScore(
    presentScores.reduce((sum, score) => sum + score, 0) / presentScores.length
  );
}

function toPercentValue(value?: number | null): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return value * 100;
}

export function deriveVerdictFromSummary(summary?: BacktestSummary | null): ReviewVerdict {
  const sharpe = summary?.sharpe_ratio ?? null;
  const profitFactor = summary?.profit_factor ?? null;
  const maxDrawdownPct = Math.abs(toPercentValue(summary?.max_drawdown) ?? Number.NaN);
  const costDragBps = summary?.cost_drag_bps ?? null;

  if (
    sharpe !== null &&
    sharpe >= 1.5 &&
    profitFactor !== null &&
    profitFactor >= 1.25 &&
    maxDrawdownPct <= 15 &&
    costDragBps !== null &&
    costDragBps <= 100
  ) {
    return 'Institutional';
  }

  if (
    sharpe !== null &&
    sharpe >= 1.0 &&
    profitFactor !== null &&
    profitFactor >= 1.1 &&
    maxDrawdownPct <= 20 &&
    costDragBps !== null &&
    costDragBps <= 150
  ) {
    return 'Workable';
  }

  if (sharpe !== null && sharpe >= 0.5 && maxDrawdownPct < 30) {
    return 'Fragile';
  }

  return 'Rejected';
}

function calculateRollingStats(rolling: RollingMetricPointResponse[]) {
  const sharpePoints = rolling.filter((point) => point.rolling_sharpe !== null && point.rolling_sharpe !== undefined);
  const drawdownPoints = rolling.filter(
    (point) => point.rolling_max_drawdown !== null && point.rolling_max_drawdown !== undefined
  );
  const turnoverPoints = rolling.filter(
    (point) => point.turnover_sum !== null && point.turnover_sum !== undefined
  );

  const positiveRollingSharpeShare = sharpePoints.length
    ? sharpePoints.filter((point) => Number(point.rolling_sharpe) > 0).length / sharpePoints.length
    : null;
  const worstRollingDrawdown = drawdownPoints.length
    ? Math.abs(
        Math.min(...drawdownPoints.map((point) => Number(point.rolling_max_drawdown ?? 0))) * 100
      )
    : null;
  const averageRollingTurnover = turnoverPoints.length
    ? turnoverPoints.reduce((sum, point) => sum + Number(point.turnover_sum ?? 0), 0) /
      turnoverPoints.length
    : null;

  return {
    positiveRollingSharpeShare,
    worstRollingDrawdown,
    averageRollingTurnover
  };
}

function buildMissingEvidence() {
  return [
    'Factor, beta, and exposure attribution are not available on this surface.',
    'Contribution by sector, setup, or holding bucket is missing.',
    'Liquidity, borrow, and capacity evidence is missing.',
    'Stress and out-of-sample diagnostics are not available yet.'
  ];
}

export function deriveReviewModel({
  summary,
  rolling = [],
  trades = [],
  positions = [],
  timeseries = [],
  turnoverUpperQuartile
}: {
  summary?: BacktestSummary | null;
  rolling?: RollingMetricPointResponse[];
  trades?: TradeResponse[];
  positions?: ClosedPositionResponse[];
  timeseries?: TimeseriesPointResponse[];
  turnoverUpperQuartile?: number | null;
}): ReviewModel {
  const verdict = deriveVerdictFromSummary(summary);
  const maxDrawdownPct = Math.abs(toPercentValue(summary?.max_drawdown) ?? Number.NaN);
  const expectancyReturnPct = toPercentValue(summary?.expectancy_return) ?? null;
  const hitRatePct = toPercentValue(summary?.hit_rate) ?? null;
  const avgGrossExposure = summary?.avg_gross_exposure ?? null;
  const tradeCount = summary?.trades ?? trades.length ?? null;
  const transactionCost = summary?.total_transaction_cost ?? null;
  const avgCostPerTrade =
    transactionCost !== null && tradeCount ? transactionCost / Math.max(tradeCount, 1) : null;
  const rollingStats = calculateRollingStats(rolling);

  const edgeScore = averageScores([
    scoreAscending(summary?.sharpe_ratio, [0.5, 1.0, 1.5, 2.0]),
    scoreAscending(summary?.profit_factor, [1.0, 1.1, 1.25, 1.4]),
    scoreAscending(expectancyReturnPct, [0, 0.25, 0.75, 1.5])
  ]);

  const riskScore = averageScores([
    scoreDescending(maxDrawdownPct, [30, 20, 15, 10]),
    scoreAscending(summary?.calmar_ratio, [0.3, 0.6, 1.0, 1.5]),
    scoreAscending(summary?.sortino_ratio, [0.5, 1.0, 1.5, 2.5])
  ]);

  let executionScore = averageScores([scoreDescending(summary?.cost_drag_bps, [250, 150, 80, 35])]);
  if (avgCostPerTrade !== null && avgCostPerTrade > 25) {
    executionScore = Math.max(1, executionScore - 1);
  }

  const robustnessScore = averageScores([
    scoreAscending(
      rollingStats.positiveRollingSharpeShare === null
        ? null
        : rollingStats.positiveRollingSharpeShare * 100,
      [35, 50, 65, 80]
    ),
    scoreDescending(rollingStats.worstRollingDrawdown, [30, 20, 15, 10])
  ]);

  let scalabilityScore = averageScores([scoreDescending(tradeCount, [4000, 2500, 1200, 400])]);
  if (
    (avgGrossExposure !== null && avgGrossExposure > 1.0) ||
    (turnoverUpperQuartile !== null &&
      turnoverUpperQuartile !== undefined &&
      rollingStats.averageRollingTurnover !== null &&
      rollingStats.averageRollingTurnover >= turnoverUpperQuartile)
  ) {
    scalabilityScore = Math.max(1, scalabilityScore - 1);
  }

  const processScore = averageScores([
    scoreAscending(hitRatePct, [35, 45, 55, 60]),
    scoreAscending(summary?.payoff_ratio, [0.8, 1.0, 1.2, 1.5]),
    scoreAscending(expectancyReturnPct, [0, 0.25, 0.75, 1.5])
  ]);

  const scorecard: ReviewScorecardRow[] = [
    {
      label: 'Edge',
      score: edgeScore,
      detail: `Sharpe ${summary?.sharpe_ratio?.toFixed(2) ?? 'n/a'}, profit factor ${summary?.profit_factor?.toFixed(2) ?? 'n/a'}, expectancy ${expectancyReturnPct?.toFixed(2) ?? 'n/a'}%.`
    },
    {
      label: 'Risk',
      score: riskScore,
      detail: `Max drawdown ${Number.isFinite(maxDrawdownPct) ? maxDrawdownPct.toFixed(1) : 'n/a'}%, Calmar ${summary?.calmar_ratio?.toFixed(2) ?? 'n/a'}, Sortino ${summary?.sortino_ratio?.toFixed(2) ?? 'n/a'}.`
    },
    {
      label: 'Execution',
      score: executionScore,
      detail: `Cost drag ${summary?.cost_drag_bps?.toFixed(1) ?? 'n/a'} bps${avgCostPerTrade !== null ? `, average cost per trade $${avgCostPerTrade.toFixed(2)}` : ''}.`
    },
    {
      label: 'Robustness',
      score: robustnessScore,
      detail: `Positive rolling sharpe share ${rollingStats.positiveRollingSharpeShare !== null ? (rollingStats.positiveRollingSharpeShare * 100).toFixed(0) : 'n/a'}%, worst rolling drawdown ${rollingStats.worstRollingDrawdown !== null ? rollingStats.worstRollingDrawdown.toFixed(1) : 'n/a'}%.`
    },
    {
      label: 'Scalability',
      score: scalabilityScore,
      proxy: true,
      detail: `Trade count ${tradeCount ?? 'n/a'}, average gross exposure ${avgGrossExposure?.toFixed(2) ?? 'n/a'}${rollingStats.averageRollingTurnover !== null ? `, average rolling turnover ${rollingStats.averageRollingTurnover.toFixed(2)}` : ''}.`
    },
    {
      label: 'Process',
      score: processScore,
      proxy: true,
      detail: `Hit rate ${hitRatePct?.toFixed(1) ?? 'n/a'}%, payoff ratio ${summary?.payoff_ratio?.toFixed(2) ?? 'n/a'}, expectancy ${expectancyReturnPct?.toFixed(2) ?? 'n/a'}%.`
    }
  ];

  const correctiveActions = [
    summary?.cost_drag_bps !== null && (summary?.cost_drag_bps ?? 0) > 100
      ? 'Implementation drag is too high. Reduce turnover or tighten slippage assumptions before treating the edge as real.'
      : null,
    !Number.isFinite(maxDrawdownPct) || maxDrawdownPct > 20
      ? 'Drawdown control is not desk-ready. Cut gross exposure or tighten exits before scaling.'
      : null,
    rollingStats.positiveRollingSharpeShare !== null && rollingStats.positiveRollingSharpeShare < 0.5
      ? 'Rolling performance is unstable. Segment results by regime before calling this repeatable.'
      : null,
    summary?.profit_factor !== null && (summary?.profit_factor ?? 0) < 1.1
      ? 'Profit factor is too thin. Check whether a small number of exits are carrying the run.'
      : null,
    tradeCount !== null && tradeCount < 400
      ? 'The sample is still thin. Treat the result as provisional until it spans more trades and market windows.'
      : null,
    positions.length > 0 && timeseries.length > 0 && processScore >= 4
      ? 'Preserve the current rule set, but add attribution and stress testing before increasing allocation.'
      : 'Keep the review cadence focused on rolling stability, cost drag, and outlier dependence rather than headline return.'
  ]
    .filter((value): value is string => Boolean(value))
    .slice(0, 3);

  const verdictDetailMap: Record<ReviewVerdict, string> = {
    Institutional: 'Net risk-adjusted return, drawdown, and cost control clear the desk standard.',
    Workable: 'The edge is tradable, but it still needs tighter controls before it deserves more capital.',
    Fragile: 'There is some edge here, but the path is too regime-dependent or too soft under stress.',
    Rejected: 'The return profile does not justify live capital in its current form.'
  };

  return {
    verdict,
    verdictDetail: verdictDetailMap[verdict],
    scorecard,
    correctiveActions,
    missingEvidence: buildMissingEvidence(),
    positiveRollingSharpeShare: rollingStats.positiveRollingSharpeShare,
    worstRollingDrawdown: rollingStats.worstRollingDrawdown,
    averageRollingTurnover: rollingStats.averageRollingTurnover
  };
}
