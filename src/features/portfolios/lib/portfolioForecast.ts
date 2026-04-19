import type { RegimeSnapshot } from '@/types/regime';
import type { PortfolioHistoryRow } from '@/types/portfolio';

import type { PortfolioBenchmarkComparison } from './portfolioBenchmark';

export const MODEL_OUTLOOK_HORIZONS = ['1M', '3M', '6M'] as const;
export const MODEL_OUTLOOK_ASSUMPTIONS = [
  'current',
  'trending_bull',
  'trending_bear',
  'choppy_mean_reversion',
  'high_vol',
  'unclassified'
] as const;

export type ModelOutlookHorizon = (typeof MODEL_OUTLOOK_HORIZONS)[number];
export type ModelOutlookAssumption = (typeof MODEL_OUTLOOK_ASSUMPTIONS)[number];
export type ModelOutlookConfidence = 'high' | 'medium' | 'low' | 'thin';

export interface PortfolioModelOutlook {
  expectedReturnPct: number | null;
  expectedActiveReturnPct: number | null;
  downsidePct: number | null;
  upsidePct: number | null;
  confidence: ModelOutlookConfidence;
  confidenceLabel: string;
  sampleSize: number;
  sampleMode: 'regime-conditioned' | 'fallback-history' | 'insufficient-history';
  appliedRegimeCode: string;
  notes: string[];
}

interface PortfolioForecastSample {
  date: string;
  regimeCode: string;
  portfolioReturnPct: number;
  activeReturnPct: number | null;
}

const HORIZON_WINDOWS: Record<ModelOutlookHorizon, number> = {
  '1M': 21,
  '3M': 63,
  '6M': 126
};

function normalizeRegimeCode(value?: string | null): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll(' ', '_');
  if (normalized === 'choppy') {
    return 'choppy_mean_reversion';
  }
  return normalized || 'unclassified';
}

function getRegimeDate(row: RegimeSnapshot): string {
  return row.as_of_date || row.effective_from_date || '';
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * quantile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = sorted[lowerIndex]!;
  const upper = sorted[upperIndex]!;

  if (lowerIndex === upperIndex) {
    return lower;
  }

  const weight = index - lowerIndex;
  return lower + (upper - lower) * weight;
}

function average(values: readonly number[]): number | null {
  if (!values.length) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function buildRegimeLookup(regimeHistory: readonly RegimeSnapshot[]) {
  const sortedRows = [...regimeHistory]
    .filter((row) => Boolean(getRegimeDate(row)))
    .sort((left, right) => Date.parse(getRegimeDate(left)) - Date.parse(getRegimeDate(right)));

  return (date: string): string => {
    let resolved = 'unclassified';
    for (const row of sortedRows) {
      if (Date.parse(getRegimeDate(row)) <= Date.parse(date)) {
        resolved = normalizeRegimeCode(row.regime_code);
      } else {
        break;
      }
    }
    return resolved;
  };
}

function buildSamples(
  history: readonly PortfolioHistoryRow[],
  comparison: PortfolioBenchmarkComparison | null,
  regimeHistory: readonly RegimeSnapshot[],
  horizon: ModelOutlookHorizon
): { samples: PortfolioForecastSample[]; windowLength: number; truncatedWindow: boolean } {
  const sortedHistory = [...history].sort(
    (left, right) => Date.parse(left.asOfDate) - Date.parse(right.asOfDate)
  );
  const requestedWindow = HORIZON_WINDOWS[horizon];
  const windowLength = Math.min(requestedWindow, Math.max(2, sortedHistory.length - 1));
  const truncatedWindow = windowLength < requestedWindow;
  if (sortedHistory.length <= windowLength) {
    return { samples: [], windowLength, truncatedWindow };
  }

  const benchmarkByDate = new Map(
    (comparison?.points || []).map((point) => [point.date, point.benchmarkIndexed] as const)
  );
  const regimeForDate = buildRegimeLookup(regimeHistory);
  const samples: PortfolioForecastSample[] = [];

  for (let startIndex = 0; startIndex + windowLength < sortedHistory.length; startIndex += 1) {
    const start = sortedHistory[startIndex]!;
    const end = sortedHistory[startIndex + windowLength]!;
    if (!start.nav || !end.nav) {
      continue;
    }

    const portfolioReturnPct = Number((((end.nav / start.nav) - 1) * 100).toFixed(2));
    const startBenchmark = benchmarkByDate.get(start.asOfDate);
    const endBenchmark = benchmarkByDate.get(end.asOfDate);
    const benchmarkReturnPct =
      startBenchmark && endBenchmark
        ? Number((((endBenchmark / startBenchmark) - 1) * 100).toFixed(2))
        : null;

    samples.push({
      date: end.asOfDate,
      regimeCode: regimeForDate(end.asOfDate),
      portfolioReturnPct,
      activeReturnPct:
        benchmarkReturnPct === null
          ? null
          : Number((portfolioReturnPct - benchmarkReturnPct).toFixed(2))
    });
  }

  return { samples, windowLength, truncatedWindow };
}

function toConfidence(
  sampleSize: number,
  sampleMode: PortfolioModelOutlook['sampleMode'],
  truncatedWindow: boolean
): { confidence: ModelOutlookConfidence; confidenceLabel: string } {
  let confidence: ModelOutlookConfidence;
  if (sampleSize >= 18 && sampleMode === 'regime-conditioned' && !truncatedWindow) {
    confidence = 'high';
  } else if (sampleSize >= 10 && sampleMode === 'regime-conditioned') {
    confidence = 'medium';
  } else if (sampleSize >= 4) {
    confidence = 'low';
  } else {
    confidence = 'thin';
  }

  return {
    confidence,
    confidenceLabel:
      confidence === 'high'
        ? 'High confidence'
        : confidence === 'medium'
          ? 'Medium confidence'
          : confidence === 'low'
            ? 'Low confidence'
            : 'Thin sample'
  };
}

export function derivePortfolioModelOutlook(input: {
  history: readonly PortfolioHistoryRow[];
  comparison: PortfolioBenchmarkComparison | null;
  regimeHistory: readonly RegimeSnapshot[];
  currentRegimeCode?: string | null;
  horizon: ModelOutlookHorizon;
  assumption: ModelOutlookAssumption;
  costDragOverrideBps?: number | null;
}): PortfolioModelOutlook {
  const {
    history,
    comparison,
    regimeHistory,
    currentRegimeCode,
    horizon,
    assumption,
    costDragOverrideBps
  } = input;
  const appliedRegimeCode = normalizeRegimeCode(
    assumption === 'current' ? currentRegimeCode : assumption
  );
  const { samples, truncatedWindow } = buildSamples(history, comparison, regimeHistory, horizon);
  const notes: string[] = [];

  if (!samples.length) {
    return {
      expectedReturnPct: null,
      expectedActiveReturnPct: null,
      downsidePct: null,
      upsidePct: null,
      confidence: 'thin',
      confidenceLabel: 'Thin sample',
      sampleSize: 0,
      sampleMode: 'insufficient-history',
      appliedRegimeCode,
      notes: ['Insufficient portfolio history for this horizon.']
    };
  }

  let selectedSamples = samples.filter((sample) => sample.regimeCode === appliedRegimeCode);
  let sampleMode: PortfolioModelOutlook['sampleMode'] = 'regime-conditioned';
  if (selectedSamples.length < 4) {
    selectedSamples = samples;
    sampleMode = 'fallback-history';
    notes.push('Regime sample is thin; falling back to all available history.');
  }
  if (truncatedWindow) {
    notes.push('The requested horizon exceeds available history; using the longest local window.');
  }

  const returnSamples = selectedSamples.map((sample) => sample.portfolioReturnPct);
  const activeSamples = selectedSamples
    .map((sample) => sample.activeReturnPct)
    .filter((value): value is number => value !== null);
  const dragAdjustmentPct = Number(((costDragOverrideBps ?? 0) / 100).toFixed(2));

  const expectedReturn = average(returnSamples);
  const expectedActive = average(activeSamples);
  const downside = percentile(returnSamples, 0.2);
  const upside = percentile(returnSamples, 0.8);
  const { confidence, confidenceLabel } = toConfidence(
    selectedSamples.length,
    sampleMode,
    truncatedWindow
  );

  return {
    expectedReturnPct:
      expectedReturn === null ? null : Number((expectedReturn - dragAdjustmentPct).toFixed(2)),
    expectedActiveReturnPct:
      expectedActive === null ? null : Number((expectedActive - dragAdjustmentPct).toFixed(2)),
    downsidePct: downside === null ? null : Number((downside - dragAdjustmentPct).toFixed(2)),
    upsidePct: upside === null ? null : Number((upside - dragAdjustmentPct).toFixed(2)),
    confidence,
    confidenceLabel,
    sampleSize: selectedSamples.length,
    sampleMode,
    appliedRegimeCode,
    notes
  };
}
