import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BacktestRunWorkspacePage } from '@/features/backtests/BacktestRunWorkspacePage';
import type { RunStatusResponse } from '@/services/backtestApi';
import {
  useClosedPositions,
  useRolling,
  useRunStatus,
  useRunSummary,
  useTimeseries,
  useTrades
} from '@/services/backtestHooks';

vi.mock('@/services/backtestHooks', () => ({
  useRunStatus: vi.fn(),
  useRunSummary: vi.fn(),
  useTimeseries: vi.fn(),
  useRolling: vi.fn(),
  useTrades: vi.fn(),
  useClosedPositions: vi.fn()
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function buildRun(overrides: Partial<RunStatusResponse> = {}): RunStatusResponse {
  return {
    run_id: 'run-1',
    run_name: 'Desk QA run',
    status: 'completed',
    submitted_at: '2026-04-16T14:00:00Z',
    started_at: '2026-04-16T14:01:00Z',
    completed_at: '2026-04-16T14:05:00Z',
    results_ready_at: '2026-04-16T14:06:00Z',
    results_schema_version: 3,
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    strategy_name: 'quality-trend',
    strategy_version: 3,
    bar_size: '15m',
    pins: {
      strategyName: 'quality-trend',
      strategyVersion: 3,
      rankingSchemaName: 'quality-momentum',
      rankingSchemaVersion: 2,
      universeName: 'large-cap-quality',
      universeVersion: 4,
      regimeModelName: 'default-regime',
      regimeModelVersion: 1
    },
    ...overrides
  };
}

function buildSummary(overrides: Record<string, unknown> = {}) {
  return {
    total_return: 0.12,
    annualized_return: 0.1,
    max_drawdown: -0.08,
    final_equity: 112000,
    gross_total_return: 0.14,
    cost_drag_bps: 24.5,
    avg_gross_exposure: 0.94,
    avg_net_exposure: 0.91,
    closed_positions: 12,
    hit_rate: 0.58,
    profit_factor: 1.4,
    expectancy_pnl: 120,
    sharpe_ratio: 1.1,
    sortino_ratio: 1.5,
    calmar_ratio: 0.8,
    trades: 44,
    total_commission: 180,
    total_slippage_cost: 95,
    total_transaction_cost: 275,
    winning_positions: 7,
    losing_positions: 5,
    payoff_ratio: 1.6,
    avg_win_return: 0.07,
    avg_loss_return: -0.03,
    expectancy_return: 0.02,
    metadata: {
      bar_size: '15m',
      periods_per_year: 252,
      results_schema_version: 3,
      strategy_scope: 'long_only'
    },
    ...overrides
  };
}

function renderWorkspace(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/backtests/:runId/*" element={<BacktestRunWorkspacePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BacktestRunWorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useRunStatus).mockReturnValue({
      data: buildRun(),
      loading: false,
      error: undefined,
      refresh: vi.fn()
    });
    vi.mocked(useRunSummary).mockReturnValue({
      data: buildSummary(),
      loading: false,
      error: undefined
    });
    vi.mocked(useTimeseries).mockReturnValue({
      data: { points: [], total_points: 0, truncated: false },
      loading: false,
      error: undefined
    });
    vi.mocked(useRolling).mockReturnValue({
      data: { points: [], total_points: 0, truncated: false },
      loading: false,
      error: undefined
    });
    vi.mocked(useTrades).mockReturnValue({
      data: {
        trades: [
          {
            execution_date: '2026-04-10T14:30:00Z',
            symbol: 'AAPL',
            quantity: 100,
            price: 120,
            notional: 12000,
            commission: 6,
            slippage_cost: 4,
            cash_after: 88000,
            position_id: 'pos-1',
            trade_role: 'rebalance_increase'
          }
        ],
        total: 1,
        limit: 2000,
        offset: 0
      },
      loading: false,
      error: undefined
    });
    vi.mocked(useClosedPositions).mockReturnValue({
      data: {
        positions: [
          {
            position_id: 'pos-1',
            symbol: 'AAPL',
            opened_at: '2026-04-01T14:30:00Z',
            closed_at: '2026-04-10T14:30:00Z',
            holding_period_bars: 8,
            average_cost: 120,
            exit_price: 126,
            max_quantity: 100,
            resize_count: 1,
            realized_pnl: 600,
            realized_return: 0.05,
            total_commission: 6,
            total_slippage_cost: 4,
            total_transaction_cost: 10,
            exit_reason: 'time_stop',
            exit_rule_id: 'time-stop-8'
          }
        ],
        total: 1,
        limit: 2000,
        offset: 0
      },
      loading: false,
      error: undefined
    });
  });

  it('renders the queued state before execution starts', () => {
    vi.mocked(useRunStatus).mockReturnValue({
      data: buildRun({ status: 'queued', started_at: null, completed_at: null, results_ready_at: null }),
      loading: false,
      error: undefined,
      refresh: vi.fn()
    });

    renderWorkspace('/backtests/run-1');

    expect(screen.getByRole('heading', { name: /run queued/i })).toBeInTheDocument();
    expect(screen.queryByText('Net Return')).not.toBeInTheDocument();
  });

  it('renders the running state while analytics are blocked', () => {
    vi.mocked(useRunStatus).mockReturnValue({
      data: buildRun({ status: 'running', completed_at: null, results_ready_at: null }),
      loading: false,
      error: undefined,
      refresh: vi.fn()
    });

    renderWorkspace('/backtests/run-1');

    expect(screen.getByRole('heading', { name: /run executing/i })).toBeInTheDocument();
  });

  it('renders the failed state when the run does not complete', () => {
    vi.mocked(useRunStatus).mockReturnValue({
      data: buildRun({
        status: 'failed',
        completed_at: null,
        results_ready_at: null,
        error: 'Coverage gap at rebalance boundary'
      }),
      loading: false,
      error: undefined,
      refresh: vi.fn()
    });

    renderWorkspace('/backtests/run-1');

    expect(screen.getByRole('heading', { name: /run failed/i })).toBeInTheDocument();
    expect(screen.getByText(/coverage gap at rebalance boundary/i)).toBeInTheDocument();
  });

  it('renders the publishing state separately from a completed analytics workspace', () => {
    vi.mocked(useRunStatus).mockReturnValue({
      data: buildRun({ results_ready_at: null }),
      loading: false,
      error: undefined,
      refresh: vi.fn()
    });

    renderWorkspace('/backtests/run-1');

    expect(screen.getByRole('heading', { name: /results publishing/i })).toBeInTheDocument();
  });

  it('keeps gross and net exposure separate on the completed overview surface', () => {
    renderWorkspace('/backtests/run-1');

    expect(screen.getByText('Avg Gross Exposure')).toBeInTheDocument();
    expect(screen.getByText('Avg Net Exposure')).toBeInTheDocument();
    expect(screen.getByText('Pinned Definition')).toBeInTheDocument();
    expect(screen.queryByText(/daily return/i)).not.toBeInTheDocument();
  });

  it('renders the trade audit as an execution-only surface', () => {
    renderWorkspace('/backtests/run-1/trades');

    expect(screen.getByRole('heading', { name: 'Trade Audit' })).toBeInTheDocument();
    expect(screen.getAllByText(/rebalance increase/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('Closed Position Outcomes')).not.toBeInTheDocument();
    expect(screen.queryByText('Expectancy Return')).not.toBeInTheDocument();
  });

  it('renders closed positions as a lifecycle-only surface', () => {
    renderWorkspace('/backtests/run-1/positions');

    expect(screen.getByRole('heading', { name: 'Closed Position Outcomes' })).toBeInTheDocument();
    expect(screen.getByText('Expectancy Return')).toBeInTheDocument();
    expect(screen.getAllByText(/time stop/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Trade Audit' })).not.toBeInTheDocument();
    expect(screen.queryByText('Trade Role')).not.toBeInTheDocument();
  });
});
