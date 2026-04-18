import React, { type PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { backtestApi } from '@/services/backtestApi';
import { backtestKeys, useClosedPositions, useRunStatus } from '@/services/backtestHooks';

vi.mock('@/services/backtestApi', () => ({
  backtestApi: {
    getStatus: vi.fn(),
    getClosedPositions: vi.fn()
  }
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0
      }
    }
  });
}

function createWrapper() {
  const queryClient = createQueryClient();

  return function Wrapper({ children }: PropsWithChildren) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('backtestKeys', () => {
  it('builds status keys from run id only', () => {
    expect(backtestKeys.status('run-1')).toEqual(['backtest', 'runs', 'run-1', 'status']);
  });

  it('builds summary keys without a source discriminator', () => {
    expect(backtestKeys.summary('run-1')).toEqual(['backtest', 'runs', 'run-1', 'summary']);
  });

  it('builds timeseries keys from run id and max points only', () => {
    expect(backtestKeys.timeseries('run-1', 5000)).toEqual([
      'backtest',
      'runs',
      'run-1',
      'timeseries',
      5000
    ]);
  });

  it('builds rolling keys from run id, window, and max points only', () => {
    expect(backtestKeys.rolling('run-1', 63, 5000)).toEqual([
      'backtest',
      'runs',
      'run-1',
      'rolling',
      63,
      5000
    ]);
  });

  it('builds trade keys from run id and paging only', () => {
    expect(backtestKeys.trades('run-1', 2000, 0)).toEqual([
      'backtest',
      'runs',
      'run-1',
      'trades',
      2000,
      0
    ]);
  });

  it('builds closed-position keys from run id and paging only', () => {
    expect(backtestKeys.closedPositions('run-1', 2000, 0)).toEqual([
      'backtest',
      'runs',
      'run-1',
      'closed-positions',
      2000,
      0
    ]);
  });
});

describe('backtest hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads frozen run status metadata', async () => {
    vi.mocked(backtestApi.getStatus).mockResolvedValue({
      run_id: 'run-1',
      status: 'completed',
      submitted_at: '2026-04-16T14:00:00Z',
      results_ready_at: '2026-04-16T14:05:00Z',
      strategy_name: 'quality-trend',
      strategy_version: 3,
      bar_size: '15m',
      pins: {
        strategyName: 'quality-trend',
        strategyVersion: 3
      }
    });

    const { result } = renderHook(() => useRunStatus('run-1'), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data?.run_id).toBe('run-1');
      expect(result.current.data?.pins?.strategyVersion).toBe(3);
    });

    expect(backtestApi.getStatus).toHaveBeenCalledWith('run-1', expect.any(AbortSignal));
  });

  it('loads closed-position outcomes separately from the trade audit', async () => {
    vi.mocked(backtestApi.getClosedPositions).mockResolvedValue({
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
    });

    const { result } = renderHook(() => useClosedPositions('run-1'), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data?.positions).toHaveLength(1);
      expect(result.current.data?.positions[0]?.exit_reason).toBe('time_stop');
    });

    expect(backtestApi.getClosedPositions).toHaveBeenCalledWith(
      'run-1',
      { limit: 2000, offset: 0 },
      expect.any(AbortSignal)
    );
  });

  it('does not retry closed-position requests on 404 responses', async () => {
    vi.mocked(backtestApi.getClosedPositions).mockRejectedValue({
      status: 404,
      message: 'closed positions not published'
    });

    const { result } = renderHook(() => useClosedPositions('run-1'), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('closed positions not published');
    });

    expect(backtestApi.getClosedPositions).toHaveBeenCalledTimes(1);
  });
});
