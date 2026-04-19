import type { MarketData } from '@/types/data';
import type { PortfolioHistoryRow } from '@/types/portfolio';

export interface PortfolioBenchmarkPoint {
  date: string;
  nav: number;
  portfolioIndexed: number;
  benchmarkClose: number | null;
  benchmarkIndexed: number | null;
  portfolioReturnPct: number | null;
  benchmarkReturnPct: number | null;
  activeReturnPct: number | null;
  drawdownPct: number | null;
  turnoverPct: number | null;
  costDragBps: number | null;
}

export interface PortfolioBenchmarkComparison {
  points: PortfolioBenchmarkPoint[];
  benchmarkAvailable: boolean;
  portfolioHeadlineReturnPct: number | null;
  benchmarkHeadlineReturnPct: number | null;
  activeHeadlineReturnPct: number | null;
}

function sortHistory(history: readonly PortfolioHistoryRow[]): PortfolioHistoryRow[] {
  return [...history].sort((left, right) => Date.parse(left.asOfDate) - Date.parse(right.asOfDate));
}

function sortMarketData(rows: readonly MarketData[]): MarketData[] {
  return [...rows].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
}

export function buildPortfolioBenchmarkComparison(
  history: readonly PortfolioHistoryRow[],
  benchmarkHistory: readonly MarketData[]
): PortfolioBenchmarkComparison {
  const sortedHistory = sortHistory(history);
  if (!sortedHistory.length) {
    return {
      points: [],
      benchmarkAvailable: false,
      portfolioHeadlineReturnPct: null,
      benchmarkHeadlineReturnPct: null,
      activeHeadlineReturnPct: null
    };
  }

  const sortedBenchmark = sortMarketData(benchmarkHistory);
  const benchmarkSeries: Array<{ date: string; close: number }> = sortedBenchmark
    .filter((row) => Number.isFinite(row.close))
    .map((row) => ({ date: row.date, close: row.close }));

  const portfolioBaseline = sortedHistory.find((point) => point.nav > 0)?.nav ?? null;
  let benchmarkIndex = 0;
  let matchedBenchmarkClose: number | null = null;
  let benchmarkBaseline: number | null = null;

  const points = sortedHistory.map((point) => {
    while (
      benchmarkIndex < benchmarkSeries.length &&
      Date.parse(benchmarkSeries[benchmarkIndex]!.date) <= Date.parse(point.asOfDate)
    ) {
      matchedBenchmarkClose = benchmarkSeries[benchmarkIndex]!.close;
      benchmarkIndex += 1;
      if (benchmarkBaseline === null && matchedBenchmarkClose > 0) {
        benchmarkBaseline = matchedBenchmarkClose;
      }
    }

    const portfolioReturnPct =
      portfolioBaseline && portfolioBaseline > 0
        ? Number((((point.nav / portfolioBaseline) - 1) * 100).toFixed(2))
        : null;
    const portfolioIndexed =
      portfolioBaseline && portfolioBaseline > 0
        ? Number(((point.nav / portfolioBaseline) * 100).toFixed(2))
        : 100;
    const benchmarkReturnPct =
      benchmarkBaseline && matchedBenchmarkClose
        ? Number((((matchedBenchmarkClose / benchmarkBaseline) - 1) * 100).toFixed(2))
        : null;
    const benchmarkIndexed =
      benchmarkBaseline && matchedBenchmarkClose
        ? Number(((matchedBenchmarkClose / benchmarkBaseline) * 100).toFixed(2))
        : null;

    return {
      date: point.asOfDate,
      nav: point.nav,
      portfolioIndexed,
      benchmarkClose: matchedBenchmarkClose,
      benchmarkIndexed,
      portfolioReturnPct,
      benchmarkReturnPct,
      activeReturnPct:
        portfolioReturnPct !== null && benchmarkReturnPct !== null
          ? Number((portfolioReturnPct - benchmarkReturnPct).toFixed(2))
          : null,
      drawdownPct: point.drawdownPct ?? null,
      turnoverPct: point.turnoverPct ?? null,
      costDragBps: point.costDragBps ?? null
    };
  });

  const lastPoint = points.at(-1) ?? null;
  const benchmarkAvailable = points.filter((point) => point.benchmarkIndexed !== null).length >= 2;

  return {
    points,
    benchmarkAvailable,
    portfolioHeadlineReturnPct: lastPoint?.portfolioReturnPct ?? null,
    benchmarkHeadlineReturnPct: lastPoint?.benchmarkReturnPct ?? null,
    activeHeadlineReturnPct: lastPoint?.activeReturnPct ?? null
  };
}
