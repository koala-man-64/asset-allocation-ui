import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BacktestRunsPage } from '@/features/backtests/BacktestRunsPage';
import { useRunList } from '@/services/backtestHooks';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();

  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

vi.mock('@/services/backtestHooks', () => ({
  useRunList: vi.fn()
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <BacktestRunsPage />
    </MemoryRouter>
  );
}

describe('BacktestRunsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRunList).mockReturnValue({
      response: undefined,
      runs: [],
      loading: false,
      error: undefined,
      refresh: vi.fn()
    });
  });

  it('renders frozen run inventory with cadence and pinned strategy metadata', () => {
    vi.mocked(useRunList).mockReturnValue({
      response: undefined,
      runs: [
        {
          run_id: 'run-1',
          run_name: 'April rebalance review',
          status: 'completed',
          submitted_at: '2026-04-16T14:00:00Z',
          completed_at: '2026-04-16T14:30:00Z',
          start_date: '2024-01-01',
          end_date: '2024-12-31',
          strategy_name: 'quality-trend',
          strategy_version: 3,
          bar_size: '15m'
        },
        {
          run_id: 'run-2',
          status: 'failed',
          submitted_at: '2026-04-16T15:00:00Z',
          start_date: '2025-01-01',
          end_date: '2025-03-31',
          strategy_name: 'defensive-carry',
          strategy_version: 7,
          bar_size: '1d',
          error: 'Coverage gap at rebalance boundary'
        }
      ],
      loading: false,
      error: undefined,
      refresh: vi.fn()
    });

    renderPage();

    expect(screen.getByRole('heading', { name: /frozen run ledger/i })).toBeInTheDocument();
    expect(screen.getByText('April rebalance review')).toBeInTheDocument();
    expect(screen.getByText('quality-trend')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getByText(/coverage gap at rebalance boundary/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /open/i })[0]);
    expect(navigateMock).toHaveBeenCalledWith('/backtests/run-1');
  });

  it('renders the empty-state message when no runs match the filters', () => {
    renderPage();

    expect(screen.getByText(/no runs match the current filters/i)).toBeInTheDocument();
  });
});
