import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test/utils';
import { OperationalJobMonitorPanel } from '@/features/system-status/components/OperationalJobMonitorPanel';
import type { OperationalJobTarget } from '@/features/system-status/lib/operationalJobs';
import type { RunRecordResponse } from '@/services/backtestApi';

const { triggerJobSpy, setJobSuspendedSpy, refreshRunsSpy, jobLogStreamSpy, runListState } =
  vi.hoisted(() => ({
    triggerJobSpy: vi.fn(),
    setJobSuspendedSpy: vi.fn(),
    refreshRunsSpy: vi.fn(),
    jobLogStreamSpy: vi.fn(),
    runListState: {
      runs: [] as RunRecordResponse[],
      loading: false,
      error: undefined as string | undefined
    }
  }));

vi.mock('@/hooks/useJobTrigger', () => ({
  useJobTrigger: () => ({
    triggeringJob: null,
    triggerJob: triggerJobSpy
  })
}));

vi.mock('@/hooks/useJobSuspend', () => ({
  useJobSuspend: () => ({
    jobControl: null,
    setJobSuspended: setJobSuspendedSpy
  })
}));

vi.mock('@/services/backtestHooks', () => ({
  useRunList: () => ({
    ...runListState,
    refresh: refreshRunsSpy
  })
}));

vi.mock('@/features/system-status/components/JobLogStreamPanel', () => ({
  JobLogStreamPanel: (props: unknown) => {
    jobLogStreamSpy(props);
    const selectedJobName = (props as { selectedJobName?: string }).selectedJobName || '';
    return <div data-testid="mock-operational-log-stream">{selectedJobName}</div>;
  }
}));

const JOBS: OperationalJobTarget[] = [
  {
    name: 'aca-job-backtest-runner',
    label: 'Backtests / backtest / aca-job-backtest-runner',
    category: 'backtest',
    categoryLabel: 'Backtests',
    jobType: 'backtest',
    runningState: 'Running',
    recentStatus: 'success',
    startTime: '2026-04-18T14:31:00Z',
    duration: 120,
    recordsProcessed: 2400,
    triggeredBy: 'manual'
  },
  {
    name: 'aca-job-ranking-materialize',
    label: 'Rankings / data ingest / aca-job-ranking-materialize',
    category: 'ranking',
    categoryLabel: 'Rankings',
    jobType: 'data-ingest',
    recentStatus: 'success',
    startTime: '2026-04-18T14:20:00Z',
    triggeredBy: 'api'
  },
  {
    name: 'aca-job-regime-refresh',
    label: 'Regime / data ingest / aca-job-regime-refresh',
    category: 'regime',
    categoryLabel: 'Regime',
    jobType: 'data-ingest',
    recentStatus: 'failed',
    startTime: '2026-04-18T14:10:00Z',
    triggeredBy: 'schedule'
  }
];

describe('OperationalJobMonitorPanel', () => {
  beforeEach(() => {
    triggerJobSpy.mockReset();
    setJobSuspendedSpy.mockReset();
    refreshRunsSpy.mockReset();
    jobLogStreamSpy.mockClear();
    runListState.runs = [
      {
        run_id: 'run-queued',
        run_name: 'queued backtest',
        status: 'queued',
        submitted_at: '2026-04-18T14:35:00Z',
        start_date: '2026-01-01',
        end_date: '2026-04-01'
      },
      {
        run_id: 'run-failed',
        status: 'failed',
        submitted_at: '2026-04-18T13:35:00Z',
        completed_at: '2026-04-18T13:40:00Z',
        error: 'insufficient bars'
      }
    ];
    runListState.loading = false;
    runListState.error = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders operational job categories and the backtest application queue', async () => {
    renderWithProviders(<OperationalJobMonitorPanel jobs={JOBS} />);

    expect(
      screen.getByRole('heading', { name: /Backtests, Rankings, and Regime/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /aca-job-backtest-runner/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /aca-job-ranking-materialize/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /aca-job-regime-refresh/i })).toBeInTheDocument();
    expect(screen.getByText('queued backtest')).toBeInTheDocument();
    expect(screen.getByText('insufficient bars')).toBeInTheDocument();

    await waitFor(() => {
      expect(jobLogStreamSpy).toHaveBeenCalled();
    });
    expect(jobLogStreamSpy.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        selectedJobName: 'aca-job-backtest-runner',
        jobs: expect.arrayContaining([
          expect.objectContaining({
            name: 'aca-job-ranking-materialize'
          })
        ])
      })
    );
  });

  it('filters by category and keeps the console selection aligned', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OperationalJobMonitorPanel jobs={JOBS} />);

    await user.click(screen.getByRole('button', { name: /Rankings/i }));

    expect(screen.queryByRole('row', { name: /aca-job-backtest-runner/i })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /aca-job-ranking-materialize/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(jobLogStreamSpy.mock.calls.at(-1)?.[0]).toEqual(
        expect.objectContaining({
          selectedJobName: 'aca-job-ranking-materialize',
          jobs: [
            expect.objectContaining({
              name: 'aca-job-ranking-materialize'
            })
          ]
        })
      );
    });
  });

  it('runs stopped jobs and stops running managed jobs', () => {
    renderWithProviders(<OperationalJobMonitorPanel jobs={JOBS} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run aca-job-ranking-materialize' }));
    expect(triggerJobSpy).toHaveBeenCalledWith('aca-job-ranking-materialize');

    fireEvent.click(screen.getByRole('button', { name: 'Stop aca-job-backtest-runner' }));
    expect(setJobSuspendedSpy).toHaveBeenCalledWith('aca-job-backtest-runner', true);
  });

  it('selects a job for the focused log stream from the table action', async () => {
    renderWithProviders(<OperationalJobMonitorPanel jobs={JOBS} />);

    fireEvent.click(screen.getByRole('button', { name: 'View logs for aca-job-regime-refresh' }));

    await waitFor(() => {
      expect(screen.getByTestId('mock-operational-log-stream')).toHaveTextContent(
        'aca-job-regime-refresh'
      );
    });
  });

  it('renders a precise empty state when no operational telemetry is visible', () => {
    runListState.runs = [];

    renderWithProviders(<OperationalJobMonitorPanel jobs={[]} />);

    expect(screen.getByText(/No operational jobs are currently visible/i)).toBeInTheDocument();
    expect(screen.getByText(/Domain ingestion jobs remain available/i)).toBeInTheDocument();
  });
});
