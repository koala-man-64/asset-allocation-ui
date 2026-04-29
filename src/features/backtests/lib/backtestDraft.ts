import type { BacktestRunRequest } from '@/services/backtestApi';

export interface BacktestDraft {
  runName: string;
  strategyName: string;
  strategyVersion: string;
  startTs: string;
  endTs: string;
  barSize: string;
  initialCapital: string;
  benchmarkSymbol: string;
  costModel: string;
  commissionBps: string;
  slippageBps: string;
  spreadBps: string;
  marketImpactBps: string;
  borrowCostBps: string;
  financingCostBps: string;
  participationCapPct: string;
  latencyBars: string;
  liquidityFilters: string;
  notes: string;
}

export function buildDefaultBacktestDraft(strategyName = ''): BacktestDraft {
  return {
    runName: '',
    strategyName,
    strategyVersion: '',
    startTs: '',
    endTs: '',
    barSize: '5m',
    initialCapital: '1000000',
    benchmarkSymbol: 'SPY',
    costModel: 'desk-default',
    commissionBps: '1',
    slippageBps: '2',
    spreadBps: '',
    marketImpactBps: '',
    borrowCostBps: '',
    financingCostBps: '',
    participationCapPct: '0.1',
    latencyBars: '0',
    liquidityFilters: '',
    notes: ''
  };
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function intOrNull(value: string): number | null {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function parseLiquidityFilters(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Liquidity filters must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

export function buildBacktestRunRequest(draft: BacktestDraft): BacktestRunRequest {
  const strategyName = optionalText(draft.strategyName);
  if (!strategyName) {
    throw new Error('Strategy name is required.');
  }

  const startTs = optionalText(draft.startTs);
  const endTs = optionalText(draft.endTs);
  if (!startTs || !endTs) {
    throw new Error('Start and end timestamps are required.');
  }

  const strategyVersion = intOrNull(draft.strategyVersion);

  return {
    strategyRef: {
      strategyName,
      strategyVersion: strategyVersion || undefined
    },
    startTs: new Date(startTs).toISOString(),
    endTs: new Date(endTs).toISOString(),
    barSize: optionalText(draft.barSize) || '5m',
    runName: optionalText(draft.runName) || undefined,
    assumptions: {
      initialCapital: numberOrNull(draft.initialCapital),
      benchmarkSymbol: optionalText(draft.benchmarkSymbol),
      costModel: optionalText(draft.costModel) || 'default',
      commissionBps: numberOrNull(draft.commissionBps),
      slippageBps: numberOrNull(draft.slippageBps),
      spreadBps: numberOrNull(draft.spreadBps),
      marketImpactBps: numberOrNull(draft.marketImpactBps),
      borrowCostBps: numberOrNull(draft.borrowCostBps),
      financingCostBps: numberOrNull(draft.financingCostBps),
      participationCapPct: numberOrNull(draft.participationCapPct),
      latencyBars: intOrNull(draft.latencyBars),
      liquidityFilters: parseLiquidityFilters(draft.liquidityFilters),
      notes: draft.notes.trim()
    }
  };
}

