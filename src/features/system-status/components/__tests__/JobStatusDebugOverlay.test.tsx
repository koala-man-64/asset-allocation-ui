import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JobStatusDebugOverlay } from '@/features/system-status/components/JobStatusDebugOverlay';

const { mockUseJobStatuses } = vi.hoisted(() => ({
  mockUseJobStatuses: vi.fn()
}));

vi.mock('@/hooks/useJobStatuses', () => ({
  useJobStatuses: mockUseJobStatuses
}));

function mockRows() {
  mockUseJobStatuses.mockReturnValue({
    byKey: new Map(),
    list: [
      {
        jobKey: 'manual-job',
        jobName: 'manual-job',
        status: 'running',
        source: 'override',
        latestRun: {
          jobName: 'manual-job',
          jobType: 'data-ingest',
          status: 'running',
          startTime: '2026-05-01T12:00:00Z',
          triggeredBy: 'manual',
          executionId: 'exec-1'
        },
        resource: null,
        runningState: 'Running',
        startTime: '2026-05-01T12:00:00Z',
        isOverridden: true,
        override: {
          jobName: 'manual-job',
          jobKey: 'manual-job',
          status: 'running',
          runningState: 'Running',
          startTime: '2026-05-01T12:00:00Z',
          triggeredBy: 'manual',
          executionId: 'exec-1',
          executionName: null,
          expiresAt: '2026-05-01T12:05:00Z'
        }
      },
      {
        jobKey: 'daily-job',
        jobName: 'daily-job',
        status: 'failed',
        source: 'run',
        latestRun: {
          jobName: 'daily-job',
          jobType: 'data-ingest',
          status: 'failed',
          startTime: '2026-05-01T11:00:00Z',
          triggeredBy: 'schedule'
        },
        resource: null,
        runningState: null,
        startTime: '2026-05-01T11:00:00Z',
        isOverridden: false,
        override: null
      }
    ],
    systemHealth: undefined,
    isFetching: false,
    isLoading: false,
    error: null,
    refresh: vi.fn()
  });
}

describe('JobStatusDebugOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.pushState({}, 'System Status', '/system-status');
    mockRows();
  });

  it('is hidden in non-dev mode', () => {
    window.history.pushState({}, 'System Status', '/system-status?debug=jobs');

    render(<JobStatusDebugOverlay devOverride={false} />);

    expect(screen.queryByText(/job status debug/i)).toBeNull();
    expect(mockUseJobStatuses).not.toHaveBeenCalled();
  });

  it('is hidden in dev mode without a query or storage flag', () => {
    render(<JobStatusDebugOverlay devOverride />);

    expect(screen.queryByText(/job status debug/i)).toBeNull();
  });

  it('renders a status table when debug=jobs is present', () => {
    window.history.pushState({}, 'System Status', '/system-status?debug=jobs');

    render(<JobStatusDebugOverlay devOverride />);

    expect(screen.getByText(/job status debug/i)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'jobKey' })).toBeInTheDocument();
    expect(screen.getByText('manual-job')).toBeInTheDocument();
    expect(screen.getByText('exec-1')).toBeInTheDocument();
  });

  it('renders the source for each row', () => {
    window.localStorage.setItem('aa.debug.jobs', '1');

    render(<JobStatusDebugOverlay devOverride />);

    expect(screen.getByText('override')).toBeInTheDocument();
    expect(screen.getByText('run')).toBeInTheDocument();
  });
});
