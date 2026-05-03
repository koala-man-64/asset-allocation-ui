import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';

import { renderWithProviders } from '@/test/utils';
import { OperationalJobMonitorPanel } from '@/features/system-status/components/OperationalJobMonitorPanel';
import type { OperationalJobTarget } from '@/features/system-status/lib/operationalJobs';

const { triggerJobSpy, setJobSuspendedSpy } = vi.hoisted(() => ({
  triggerJobSpy: vi.fn(),
  setJobSuspendedSpy: vi.fn()
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

const JOBS: OperationalJobTarget[] = [
  {
    name: 'aca-job-backtest-runner',
    label: 'Backtests / backtest / aca-job-backtest-runner',
    category: 'backtest',
    categoryLabel: 'Backtests',
    jobType: 'backtest',
    runningState: 'Running',
    recentStatus: 'running',
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
  },
  {
    name: 'intraday-monitor-job',
    label: 'intraday-monitor-job',
    category: 'intraday-monitoring',
    categoryLabel: 'Intraday Monitoring',
    recentStatus: null,
    runningState: null
  },
  {
    name: 'intraday-market-refresh-job',
    label: 'intraday-market-refresh-job',
    category: 'intraday-monitoring',
    categoryLabel: 'Intraday Monitoring',
    recentStatus: 'success',
    startTime: '2026-04-18T14:05:00Z',
    triggeredBy: 'schedule'
  },
  {
    name: 'results-reconcile-job',
    label: 'results-reconcile-job',
    category: 'results-reconciliation',
    categoryLabel: 'Results Reconciliation',
    recentStatus: null
  },
  {
    name: 'symbol-cleanup-job',
    label: 'symbol-cleanup-job',
    category: 'symbol-cleanup',
    categoryLabel: 'Symbol Cleanup',
    recentStatus: null
  }
];

describe('OperationalJobMonitorPanel', () => {
  beforeEach(() => {
    triggerJobSpy.mockReset();
    setJobSuspendedSpy.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the operational job table without summary tiles or category filter controls', () => {
    renderWithProviders(<OperationalJobMonitorPanel jobs={JOBS} />);

    expect(
      screen.getByRole('heading', { name: /Operational Workflows and Control Jobs/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /aca-job-backtest-runner/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /aca-job-ranking-materialize/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /aca-job-regime-refresh/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /intraday-monitor-job/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /results-reconcile-job/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /symbol-cleanup-job/i })).toBeInTheDocument();
    expect(screen.queryByText('Backtest Run Queue')).not.toBeInTheDocument();
    expect(screen.queryByText('Operational Console Stream')).not.toBeInTheDocument();
    expect(screen.queryByText('Tracked Jobs')).not.toBeInTheDocument();
    expect(screen.queryByText('Failure Risk')).not.toBeInTheDocument();
    expect(screen.queryByText('Classifier')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /All/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rankings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Intraday Monitoring/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View logs for/i })).not.toBeInTheDocument();
  });

  it('runs stopped jobs and stops running managed jobs', () => {
    renderWithProviders(<OperationalJobMonitorPanel jobs={JOBS} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run aca-job-ranking-materialize' }));
    expect(triggerJobSpy).toHaveBeenCalledWith('aca-job-ranking-materialize');

    fireEvent.click(screen.getByRole('button', { name: 'Stop aca-job-backtest-runner' }));
    expect(setJobSuspendedSpy).toHaveBeenCalledWith('aca-job-backtest-runner', true);
  });

  it('stops a live running managed job even when the latest execution is failed', () => {
    renderWithProviders(
      <OperationalJobMonitorPanel
        jobs={[
          {
            ...JOBS[0],
            recentStatus: 'failed',
            runningState: 'Running'
          }
        ]}
      />
    );

    expect(
      within(screen.getByRole('row', { name: /aca-job-backtest-runner/i })).getByText('RUNNING')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop aca-job-backtest-runner' }));

    expect(setJobSuspendedSpy).toHaveBeenCalledWith('aca-job-backtest-runner', true);
    expect(triggerJobSpy).not.toHaveBeenCalled();
  });

  it('renders a precise empty state when no operational telemetry is visible', () => {
    renderWithProviders(<OperationalJobMonitorPanel jobs={[]} />);

    expect(screen.getByText(/No operational jobs are currently visible/i)).toBeInTheDocument();
    expect(screen.getByText(/Domain ingestion jobs remain available/i)).toBeInTheDocument();
  });
});
