import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ScheduledJobMonitor } from '@/features/system-status/components/ScheduledJobMonitor';
import { renderWithProviders } from '@/test/utils';
import type { DataDomain, DataLayer } from '@/types/strategy';

const triggerJobMock = vi.fn().mockResolvedValue(undefined);
const setJobSuspendedMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/useJobTrigger', () => ({
  useJobTrigger: () => ({
    triggeringJob: null,
    triggerJob: triggerJobMock
  })
}));

vi.mock('@/hooks/useJobSuspend', () => ({
  useJobSuspend: () => ({
    jobControl: null,
    setJobSuspended: setJobSuspendedMock
  })
}));

vi.mock('@/hooks/useJobStatuses', () => ({
  useJobStatuses: () => ({
    byKey: new Map()
  })
}));

vi.mock('@/services/apiService', () => ({
  apiService: {
    getJobLogs: vi.fn()
  }
}));

function makeLayers(domain: DataDomain): DataLayer[] {
  return [
    {
      name: 'Bronze',
      description: 'Raw ingestion',
      status: 'healthy',
      lastUpdated: '2026-04-18T14:30:00Z',
      refreshFrequency: 'Daily',
      domains: [domain]
    }
  ];
}

describe('ScheduledJobMonitor', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders inferred missing ARM jobs as unavailable controls', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ScheduledJobMonitor
        dataLayers={makeLayers({
          name: 'government-signals',
          type: 'blob',
          path: 'government-signals/runs',
          lastUpdated: '2026-04-18T14:30:00Z',
          status: 'healthy',
          jobName: null,
          jobUrl: null,
          cron: '*/15 * * * *'
        })}
        recentJobs={[]}
      />
    );

    expect(await screen.findByText('bronze-government-signals-job')).toBeInTheDocument();

    const runButton = screen.getByRole('button', {
      name: 'Job resource unavailable for bronze-government-signals-job'
    });
    expect(runButton).toBeDisabled();

    await user.click(runButton);

    expect(triggerJobMock).not.toHaveBeenCalled();
    expect(setJobSuspendedMock).not.toHaveBeenCalled();
  });

  it('triggers only domains with explicit runnable job metadata', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ScheduledJobMonitor
        dataLayers={makeLayers({
          name: 'market',
          type: 'blob',
          path: 'market-data',
          lastUpdated: '2026-04-18T14:30:00Z',
          status: 'healthy',
          jobName: 'bronze-market-job',
          cron: '0 22 * * 1-5'
        })}
        recentJobs={[]}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Run bronze-market-job' }));

    expect(triggerJobMock).toHaveBeenCalledWith('bronze-market-job');
  });
});
