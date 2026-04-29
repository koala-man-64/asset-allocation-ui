import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BacktestWorkspacePage } from '@/features/backtests/BacktestWorkspacePage';
import { renderWithProviders } from '@/test/utils';

const mocks = vi.hoisted(() => ({
  refreshRuns: vi.fn(),
  validateRun: vi.fn(),
  runBacktest: vi.fn(),
  compareRuns: vi.fn(),
  runList: {
    response: { runs: [], limit: 250, offset: 0 },
    runs: [
      {
        run_id: 'run-1',
        run_name: 'Desk Run',
        status: 'completed',
        submitted_at: '2026-03-03T14:30:00Z',
        start_date: '2026-03-01',
        end_date: '2026-03-08',
        strategy_name: 'quality-trend',
        strategy_version: 4,
        bar_size: '5m',
        results_ready_at: '2026-03-08T12:00:00Z',
        results_schema_version: 4
      }
    ],
    loading: false,
    error: undefined,
    refresh: vi.fn()
  },
  detail: {
    data: {
      run: {
        run_id: 'run-1',
        run_name: 'Desk Run',
        status: 'completed',
        submitted_at: '2026-03-03T14:30:00Z',
        start_date: '2026-03-01',
        end_date: '2026-03-08',
        strategy_name: 'quality-trend',
        strategy_version: 4,
        bar_size: '5m',
        results_ready_at: '2026-03-08T12:00:00Z',
        results_schema_version: 4
      },
      effectiveConfig: {},
      owner: 'pm@example.com',
      assumptions: { benchmarkSymbol: 'SPY', costModel: 'desk-default' },
      validation: { verdict: 'pass', checks: [], blockedReasons: [], warnings: [] },
      provenance: {
        quality: 'complete',
        source: 'gold',
        dataSnapshotId: 'snap-1',
        quarantined: false,
        warnings: []
      },
      warnings: []
    },
    loading: false,
    error: undefined
  },
  summary: {
    data: {
      run_id: 'run-1',
      total_return: 0.12,
      gross_total_return: 0.125,
      max_drawdown: -0.04,
      sharpe_ratio: 1.8,
      sortino_ratio: 2.2,
      calmar_ratio: 3.1,
      cost_drag_bps: 5,
      total_transaction_cost: 500,
      avg_gross_exposure: 0.92,
      avg_net_exposure: 0.88,
      hit_rate: 0.6,
      winning_positions: 6,
      closed_positions: 10,
      payoff_ratio: 1.4,
      expectancy_pnl: 120,
      profit_factor: 1.8,
      metadata: { results_schema_version: 4, bar_size: '5m', periods_per_year: 19656, strategy_scope: 'long_only' }
    },
    loading: false,
    error: undefined
  },
  emptyQuery: { data: undefined, loading: false, error: undefined },
  replay: {
    data: {
      runId: 'run-1',
      events: [
        {
          eventId: 'run-1:0',
          sequence: 0,
          timestamp: '2026-03-03T14:30:00Z',
          eventType: 'fill_assumption',
          symbol: 'MSFT',
          source: 'simulated',
          summary: 'Buy 10 MSFT @ 100',
          beforePositions: [],
          afterPositions: [],
          transactionCost: 1.5,
          afterCash: 98998.5,
          evidence: { derivedFrom: 'core.backtest_trades' },
          warnings: []
        }
      ],
      total: 1,
      limit: 500,
      offset: 0,
      warnings: ['Replay events are simulated.']
    },
    loading: false,
    error: undefined
  },
  attribution: {
    data: {
      runId: 'run-1',
      grossToNet: { grossReturn: 0.125, netReturn: 0.12, costDragBps: 5 },
      slices: [],
      concentration: [],
      warnings: []
    },
    loading: false,
    error: undefined
  }
}));

vi.mock('@/services/backtestApi', () => ({
  backtestApi: {
    validateRun: mocks.validateRun,
    runBacktest: mocks.runBacktest,
    compareRuns: mocks.compareRuns
  }
}));

vi.mock('@/services/backtestHooks', () => ({
  backtestKeys: { all: ['backtest'] },
  useRunList: () => mocks.runList,
  useRunDetail: () => mocks.detail,
  useRunSummary: () => mocks.summary,
  useTimeseries: () => mocks.emptyQuery,
  useRolling: () => mocks.emptyQuery,
  useTrades: () => mocks.emptyQuery,
  useClosedPositions: () => mocks.emptyQuery,
  useReplayTimeline: () => mocks.replay,
  useAttributionExposure: () => mocks.attribution
}));

describe('BacktestWorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, 'Backtests', '/backtests?strategy=quality-trend');
  });

  it('defaults to run review with selected run evidence visible', async () => {
    renderWithProviders(<BacktestWorkspacePage />);

    expect(await screen.findByText('Backtesting Workspace')).toBeInTheDocument();
    expect(screen.getAllByText('Desk Run').length).toBeGreaterThan(0);
    expect(screen.getByText('12.0%')).toBeInTheDocument();
    expect(screen.getByText('provenance complete')).toBeInTheDocument();
  });

  it('opens the replay tab and shows simulated replay evidence', async () => {
    renderWithProviders(<BacktestWorkspacePage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Replay' }));

    await waitFor(() => {
      expect(screen.getByText('Buy 10 MSFT @ 100')).toBeInTheDocument();
      expect(screen.getAllByText('simulated').length).toBeGreaterThan(0);
    });
  });
});

