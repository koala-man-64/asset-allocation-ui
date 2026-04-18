import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PerformanceReviewPage } from '@/features/performance-review/PerformanceReviewPage';
import type {
  BacktestSummary,
  ClosedPositionListResponse,
  RollingMetricsResponse,
  RunRecordResponse,
  RunStatusResponse,
  TimeseriesResponse,
  TradeListResponse
} from '@/services/backtestApi';
import {
  useClosedPositions,
  useRolling,
  useRollingMulti,
  useRunList,
  useRunStatus,
  useRunSummaries,
  useRunSummary,
  useTimeseries,
  useTimeseriesMulti,
  useTrades
} from '@/services/backtestHooks';

vi.mock('recharts', () => {
  const MockPrimitive = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  return {
    CartesianGrid: MockPrimitive,
    Cell: MockPrimitive,
    Line: MockPrimitive,
    LineChart: MockPrimitive,
    Scatter: MockPrimitive,
    ScatterChart: MockPrimitive,
    XAxis: MockPrimitive,
    YAxis: MockPrimitive
  };
});

vi.mock('@/app/components/ui/chart', () => ({
  ChartContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ChartLegend: () => <div>Legend</div>,
  ChartLegendContent: () => <div>Legend Content</div>,
  ChartTooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ChartTooltipContent: () => <div>Tooltip Content</div>
}));

vi.mock('@/features/backtests/components/BacktestMetricCard', () => ({
  BacktestMetricCard: ({
    label,
    value,
    detail
  }: {
    label: string;
    value: string;
    detail?: string;
  }) => (
    <div>
      <div>{label}</div>
      <div>{value}</div>
      {detail ? <div>{detail}</div> : null}
    </div>
  )
}));

vi.mock('@/features/backtests/components/BacktestStatusBadge', () => ({
  BacktestStatusBadge: ({ run }: { run?: Pick<RunStatusResponse, 'status'> | null }) => (
    <div>{run?.status || 'unknown'}</div>
  )
}));

vi.mock('@/features/backtests/components/BacktestWorkspacePanels', () => ({
  BacktestWorkspaceStatePanel: ({
    title,
    description,
    detail
  }: {
    title: string;
    description: string;
    detail: string;
  }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
      <div>{detail}</div>
    </div>
  ),
  BacktestWorkspaceTabContent: ({ activeTab }: { activeTab: string }) => (
    <div>{`Workspace Tab: ${activeTab}`}</div>
  )
}));

vi.mock('@/services/backtestHooks', () => ({
  useRunList: vi.fn(),
  useRunStatus: vi.fn(),
  useRunSummary: vi.fn(),
  useRunSummaries: vi.fn(),
  useTimeseries: vi.fn(),
  useTimeseriesMulti: vi.fn(),
  useRolling: vi.fn(),
  useRollingMulti: vi.fn(),
  useTrades: vi.fn(),
  useClosedPositions: vi.fn()
}));

const completedRuns: RunRecordResponse[] = [
  {
    run_id: 'run-4',
    run_name: 'Alpha Latest',
    strategy_name: 'alpha',
    bar_size: '1d',
    status: 'completed',
    submitted_at: '2026-04-04T13:50:00Z',
    completed_at: '2026-04-04T14:05:00Z'
  },
  {
    run_id: 'run-3',
    run_name: 'Alpha Follow Up',
    strategy_name: 'alpha',
    bar_size: '1d',
    status: 'completed',
    submitted_at: '2026-04-03T13:50:00Z',
    completed_at: '2026-04-03T14:05:00Z'
  },
  {
    run_id: 'run-2',
    run_name: 'Alpha Spring',
    strategy_name: 'alpha',
    bar_size: '1d',
    status: 'completed',
    submitted_at: '2026-04-02T13:50:00Z',
    completed_at: '2026-04-02T14:05:00Z'
  },
  {
    run_id: 'run-1',
    run_name: 'Alpha Archive',
    strategy_name: 'alpha',
    bar_size: '1d',
    status: 'completed',
    submitted_at: '2026-04-01T13:50:00Z',
    completed_at: '2026-04-01T14:05:00Z'
  },
  {
    run_id: 'run-5',
    run_name: 'Alpha Plus',
    strategy_name: 'alpha-plus',
    bar_size: '1d',
    status: 'completed',
    submitted_at: '2026-03-31T13:50:00Z',
    completed_at: '2026-03-31T14:05:00Z'
  }
];

const summariesByRunId: Record<string, BacktestSummary> = {
  'run-4': {
    total_return: 0.18,
    annualized_return: 0.16,
    sharpe_ratio: 1.7,
    max_drawdown: -0.1,
    profit_factor: 1.3,
    cost_drag_bps: 60,
    expectancy_return: 0.011,
    calmar_ratio: 1.2,
    sortino_ratio: 2.2,
    hit_rate: 0.58,
    payoff_ratio: 1.35,
    trades: 650,
    avg_gross_exposure: 0.92
  },
  'run-3': {
    total_return: 0.12,
    annualized_return: 0.11,
    sharpe_ratio: 1.25,
    max_drawdown: -0.12,
    profit_factor: 1.18,
    cost_drag_bps: 85,
    expectancy_return: 0.008,
    calmar_ratio: 0.9,
    sortino_ratio: 1.6,
    hit_rate: 0.56,
    payoff_ratio: 1.25,
    trades: 720,
    avg_gross_exposure: 0.9
  },
  'run-2': {
    total_return: 0.08,
    annualized_return: 0.07,
    sharpe_ratio: 0.95,
    max_drawdown: -0.16,
    profit_factor: 1.12,
    cost_drag_bps: 110,
    expectancy_return: 0.006,
    calmar_ratio: 0.6,
    sortino_ratio: 1.2,
    hit_rate: 0.52,
    payoff_ratio: 1.1,
    trades: 850,
    avg_gross_exposure: 0.89
  },
  'run-1': {
    total_return: 0.05,
    annualized_return: 0.04,
    sharpe_ratio: 0.7,
    max_drawdown: -0.18,
    profit_factor: 1.05,
    cost_drag_bps: 140,
    expectancy_return: 0.004,
    calmar_ratio: 0.45,
    sortino_ratio: 0.95,
    hit_rate: 0.49,
    payoff_ratio: 0.95,
    trades: 910,
    avg_gross_exposure: 0.88
  },
  'run-5': {
    total_return: 0.09,
    annualized_return: 0.08,
    sharpe_ratio: 1.05,
    max_drawdown: -0.13,
    profit_factor: 1.16,
    cost_drag_bps: 90,
    expectancy_return: 0.007,
    calmar_ratio: 0.75,
    sortino_ratio: 1.35,
    hit_rate: 0.55,
    payoff_ratio: 1.2,
    trades: 500,
    avg_gross_exposure: 0.91
  }
};

const runStatusById: Record<string, RunStatusResponse> = Object.fromEntries(
  completedRuns.map((run) => [
    run.run_id,
    {
      ...run,
      results_ready_at: '2026-04-04T14:10:00Z',
      results_schema_version: 3,
      strategy_version: 2,
      pins: {
        strategyName: run.strategy_name,
        strategyVersion: 2
      }
    }
  ])
) as Record<string, RunStatusResponse>;

const timeseriesByRunId: Record<string, TimeseriesResponse> = Object.fromEntries(
  completedRuns.map((run, index) => [
    run.run_id,
    {
      points: [
        {
          date: `2026-04-0${index + 1}T00:00:00Z`,
          portfolio_value: 100000,
          drawdown: 0,
          cumulative_return: 0,
          turnover: 0.12 + index * 0.01
        },
        {
          date: `2026-04-0${index + 2}T00:00:00Z`,
          portfolio_value: 102500 + index * 400,
          drawdown: -0.01,
          cumulative_return: 0.025 + index * 0.002,
          turnover: 0.15 + index * 0.01
        }
      ],
      total_points: 2,
      truncated: false
    }
  ])
) as Record<string, TimeseriesResponse>;

const rollingByRunId: Record<string, RollingMetricsResponse> = Object.fromEntries(
  completedRuns.map((run, index) => [
    run.run_id,
    {
      points: [
        {
          date: `2026-04-0${index + 1}T00:00:00Z`,
          window_days: 63,
          rolling_return: 0.04 + index * 0.002,
          rolling_sharpe: 0.7 + index * 0.1,
          rolling_max_drawdown: -0.08 - index * 0.005,
          turnover_sum: 0.3 + index * 0.04
        },
        {
          date: `2026-04-0${index + 2}T00:00:00Z`,
          window_days: 63,
          rolling_return: 0.05 + index * 0.002,
          rolling_sharpe: 0.8 + index * 0.1,
          rolling_max_drawdown: -0.09 - index * 0.005,
          turnover_sum: 0.34 + index * 0.04
        }
      ],
      total_points: 2,
      truncated: false
    }
  ])
) as Record<string, RollingMetricsResponse>;

const tradesByRunId: Record<string, TradeListResponse> = Object.fromEntries(
  completedRuns.map((run) => [
    run.run_id,
    {
      trades: [
        {
          execution_date: '2026-04-04T14:00:00Z',
          symbol: 'AAPL',
          quantity: 100,
          price: 150,
          notional: 15000,
          commission: 4,
          slippage_cost: 2,
          cash_after: 85000,
          position_id: 'pos-1',
          trade_role: 'entry'
        }
      ],
      total: 1,
      limit: 2000,
      offset: 0
    }
  ])
) as Record<string, TradeListResponse>;

const positionsByRunId: Record<string, ClosedPositionListResponse> = Object.fromEntries(
  completedRuns.map((run) => [
    run.run_id,
    {
      positions: [
        {
          position_id: 'pos-1',
          symbol: 'AAPL',
          opened_at: '2026-04-01T14:00:00Z',
          closed_at: '2026-04-04T14:00:00Z',
          holding_period_bars: 3,
          average_cost: 150,
          exit_price: 156,
          max_quantity: 100,
          resize_count: 0,
          realized_pnl: 600,
          realized_return: 0.04,
          total_commission: 4,
          total_slippage_cost: 2,
          total_transaction_cost: 6,
          exit_reason: 'time_stop',
          exit_rule_id: 'time-stop'
        }
      ],
      total: 1,
      limit: 2000,
      offset: 0
    }
  ])
) as Record<string, ClosedPositionListResponse>;

function renderPerformanceReview(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/performance-review/*" element={<PerformanceReviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PerformanceReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useRunList).mockReturnValue({
      response: { runs: completedRuns, limit: 200, offset: 0 },
      runs: completedRuns,
      loading: false,
      error: undefined,
      refresh: vi.fn()
    });

    vi.mocked(useRunSummaries).mockImplementation((runIds: string[]) => ({
      summaries: Object.fromEntries(runIds.map((runId) => [runId, summariesByRunId[runId]])),
      loading: false,
      error: undefined
    }));

    vi.mocked(useTimeseriesMulti).mockImplementation((runIds: string[]) => ({
      timeseriesByRunId: Object.fromEntries(runIds.map((runId) => [runId, timeseriesByRunId[runId]])),
      loading: false,
      error: undefined
    }));

    vi.mocked(useRunStatus).mockImplementation((runId?: string) => ({
      data: runId ? runStatusById[runId] : undefined,
      loading: false,
      error: undefined,
      refresh: vi.fn()
    }));

    vi.mocked(useRunSummary).mockImplementation((runId?: string) => ({
      data: runId ? summariesByRunId[runId] : undefined,
      loading: false,
      error: undefined
    }));

    vi.mocked(useTimeseries).mockImplementation((runId?: string) => ({
      data: runId ? timeseriesByRunId[runId] : undefined,
      loading: false,
      error: undefined
    }));

    vi.mocked(useRolling).mockImplementation((runId?: string) => ({
      data: runId ? rollingByRunId[runId] : undefined,
      loading: false,
      error: undefined
    }));

    vi.mocked(useRollingMulti).mockImplementation((runIds: string[]) => ({
      rollingByRunId: Object.fromEntries(runIds.map((runId) => [runId, rollingByRunId[runId]])),
      loading: false,
      error: undefined
    }));

    vi.mocked(useTrades).mockImplementation((runId?: string) => ({
      data: runId ? tradesByRunId[runId] : undefined,
      loading: false,
      error: undefined
    }));

    vi.mocked(useClosedPositions).mockImplementation((runId?: string) => ({
      data: runId ? positionsByRunId[runId] : undefined,
      loading: false,
      error: undefined
    }));
  });

  it('opens run review when a compare row is selected', async () => {
    const user = userEvent.setup();

    renderPerformanceReview('/performance-review/compare');

    expect(screen.getByText('League Table')).toBeInTheDocument();

    const runRow = screen.getByText('Alpha Latest').closest('tr');
    expect(runRow).not.toBeNull();

    await user.click(runRow!);

    await waitFor(() => {
      expect(screen.getByText('Open Workspace')).toBeInTheDocument();
      expect(screen.getByText('Workspace Tab: overview')).toBeInTheDocument();
    });
  });

  it('filters strategy history by exact strategy name and limits the overlay to three runs', () => {
    renderPerformanceReview('/performance-review/strategy?strategy=alpha');

    expect(screen.getByText('Exact match only. `alpha` does not include `alpha-plus`.')).toBeInTheDocument();
    expect(screen.getAllByText('Alpha Latest').length).toBeGreaterThan(0);
    expect(screen.queryByText('Alpha Plus')).not.toBeInTheDocument();
    expect(useTimeseriesMulti).toHaveBeenCalledWith(
      ['run-4', 'run-3', 'run-2'],
      expect.objectContaining({ enabled: true, maxPoints: 3000 })
    );
  });

  it('shows the run-review secondary navigation and swaps the active section', async () => {
    const user = userEvent.setup();

    renderPerformanceReview('/performance-review/run?runId=run-4&section=risk');

    expect(screen.getByText('Workspace Tab: risk')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trade Audit' }));

    await waitFor(() => {
      expect(screen.getByText('Workspace Tab: trades')).toBeInTheDocument();
    });
  });

  it('shows a publishing-state message when compare summaries are unavailable', () => {
    vi.mocked(useRunSummaries).mockReturnValue({
      summaries: {},
      loading: false,
      error: undefined
    });

    renderPerformanceReview('/performance-review/compare');

    expect(
      screen.getByText('Summary unavailable while results are still publishing.')
    ).toBeInTheDocument();
  });
});
