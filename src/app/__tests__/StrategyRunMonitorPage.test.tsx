import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { StrategyRunMonitorPage } from '@/features/strategy-runs/StrategyRunMonitorPage';
import { backtestApi } from '@/services/backtestApi';
import { strategyApi } from '@/services/strategyApi';
import { renderWithProviders } from '@/test/utils';

vi.mock('@/hooks/useRealtime', () => ({
  useRealtime: () => undefined
}));

vi.mock('@/services/strategyApi', () => ({
  strategyApi: {
    listStrategies: vi.fn(),
    getStrategyDetail: vi.fn()
  }
}));

vi.mock('@/services/backtestApi', () => ({
  backtestApi: {
    listRuns: vi.fn(),
    getSummary: vi.fn(),
    getTimeseries: vi.fn(),
    getRolling: vi.fn(),
    getTrades: vi.fn(),
    getClosedPositions: vi.fn(),
    submitRun: vi.fn()
  }
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('StrategyRunMonitorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (strategyApi.listStrategies as Mock).mockResolvedValue([
      {
        name: 'alpha-sleeve',
        type: 'configured',
        description: 'Desk monitor strategy',
        updated_at: '2026-04-18T11:00:00Z'
      }
    ]);

    (strategyApi.getStrategyDetail as Mock).mockResolvedValue({
      name: 'alpha-sleeve',
      type: 'configured',
      description: 'Desk monitor strategy',
      updated_at: '2026-04-18T11:00:00Z',
      config: {
        universeConfigName: 'large-cap-quality',
        rankingSchemaName: 'quality-momentum',
        rebalance: 'weekly',
        topN: 20,
        holdingPeriod: 30,
        regimePolicy: {
          modelName: 'default-regime'
        }
      }
    });

    (backtestApi.listRuns as Mock).mockResolvedValue({
      runs: [
        {
          run_id: 'run-20260418-01',
          run_name: 'alpha sleeve live',
          status: 'running',
          submitted_at: '2026-04-18T13:00:00Z',
          started_at: '2026-04-18T13:01:00Z',
          completed_at: null,
          start_date: '2025-01-01',
          end_date: '2026-04-18'
        }
      ],
      limit: 24,
      offset: 0
    });

    (backtestApi.getSummary as Mock).mockResolvedValue({
      run_id: 'run-20260418-01',
      total_return: 0.124,
      sharpe_ratio: 1.41,
      sortino_ratio: 1.83,
      max_drawdown: -0.082,
      trades: 34,
      final_equity: 112_400,
      total_transaction_cost: 1_520,
      cost_drag_bps: 38,
      hit_rate: 0.56,
      metadata: {
        results_schema_version: 1,
        bar_size: '15m',
        periods_per_year: 252,
        strategy_scope: 'alpha-sleeve'
      }
    });

    (backtestApi.getTimeseries as Mock).mockResolvedValue({
      metadata: {
        results_schema_version: 1,
        bar_size: '15m',
        periods_per_year: 252,
        strategy_scope: 'alpha-sleeve'
      },
      points: [
        {
          date: '2026-04-16',
          portfolio_value: 101_250,
          drawdown: -0.012,
          gross_exposure: 0.84,
          net_exposure: 0.72
        },
        {
          date: '2026-04-17',
          portfolio_value: 108_900,
          drawdown: -0.031,
          gross_exposure: 0.92,
          net_exposure: 0.76
        },
        {
          date: '2026-04-18',
          portfolio_value: 112_400,
          drawdown: -0.024,
          gross_exposure: 0.88,
          net_exposure: 0.71
        }
      ],
      total_points: 3,
      truncated: false
    });

    (backtestApi.getRolling as Mock).mockResolvedValue({
      metadata: {
        results_schema_version: 1,
        bar_size: '15m',
        periods_per_year: 252,
        strategy_scope: 'alpha-sleeve'
      },
      points: [
        {
          date: '2026-04-16',
          window_days: 63,
          rolling_sharpe: 1.2,
          rolling_max_drawdown: -0.051,
          turnover_sum: 0.84
        },
        {
          date: '2026-04-17',
          window_days: 63,
          rolling_sharpe: 1.32,
          rolling_max_drawdown: -0.055,
          turnover_sum: 0.91
        },
        {
          date: '2026-04-18',
          window_days: 63,
          rolling_sharpe: 1.41,
          rolling_max_drawdown: -0.048,
          turnover_sum: 0.77
        }
      ],
      total_points: 3,
      truncated: false
    });

    (backtestApi.getTrades as Mock).mockResolvedValue({
      trades: [
        {
          execution_date: '2026-04-18T14:00:00Z',
          symbol: 'MSFT',
          quantity: 125,
          price: 412.22,
          notional: 51_527.5,
          commission: 21.44,
          slippage_cost: 46.2,
          cash_after: 19_410
        }
      ],
      total: 1,
      limit: 12,
      offset: 0
    });

    (backtestApi.getClosedPositions as Mock).mockResolvedValue({
      positions: [
        {
          position_id: 'pos-1',
          symbol: 'NVDA',
          opened_at: '2026-03-10T14:00:00Z',
          closed_at: '2026-04-18T15:00:00Z',
          holding_period_bars: 28,
          average_cost: 870.12,
          exit_price: 901.4,
          max_quantity: 45,
          resize_count: 2,
          realized_pnl: 1_407.6,
          realized_return: 0.041,
          total_commission: 18.3,
          total_slippage_cost: 32.1,
          total_transaction_cost: 50.4
        }
      ],
      total: 1,
      limit: 12,
      offset: 0
    });

    (backtestApi.submitRun as Mock).mockResolvedValue({
      run_id: 'run-20260418-02',
      status: 'queued',
      submitted_at: '2026-04-18T16:00:00Z'
    });
  });

  it('renders the launch controls and auto-selects the active run', async () => {
    renderWithProviders(<StrategyRunMonitorPage />);

    expect(await screen.findByRole('heading', { name: /strategy run monitor/i })).toBeInTheDocument();
    expect((await screen.findAllByText(/alpha sleeve live/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/equity vs drawdown/i)).toBeInTheDocument();
    expect(screen.getByText(/rolling desk quality/i)).toBeInTheDocument();
    expect(screen.getByText(/trade blotter/i)).toBeInTheDocument();
    expect(screen.getByText(/net return/i)).toBeInTheDocument();
    expect(screen.getByText(/trade count/i)).toBeInTheDocument();
  });

  it('submits a new run with the selected strategy', async () => {
    renderWithProviders(<StrategyRunMonitorPage />);

    await screen.findByRole('heading', { name: /strategy run monitor/i });

    fireEvent.change(screen.getByLabelText(/desk label/i), {
      target: { value: 'replay session' }
    });
    fireEvent.change(screen.getByLabelText(/bar size/i), {
      target: { value: '30m' }
    });
    fireEvent.click(screen.getByRole('button', { name: /launch run/i }));

    await waitFor(() => {
      expect(backtestApi.submitRun).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyName: 'alpha-sleeve',
          runName: 'replay session',
          barSize: '30m'
        })
      );
    });
  });
});
