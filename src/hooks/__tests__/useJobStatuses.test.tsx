import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/hooks/useDataQueries';
import { useJobStatuses } from '@/hooks/useJobStatuses';
import type {
  SystemHealthJobOverride,
  SystemHealthJobOverrideMap
} from '@/hooks/useSystemHealthJobOverrides';
import type { JobRun, ResourceHealth, SystemHealth } from '@/types/strategy';

const { mockDataService } = vi.hoisted(() => ({
  mockDataService: {
    getSystemStatusView: vi.fn()
  }
}));

vi.mock('@/services/DataService', () => ({
  DataService: mockDataService
}));

const buildHealth = (
  recentJobs: JobRun[] = [],
  resources: ResourceHealth[] = []
): SystemHealth => ({
  overall: 'healthy',
  dataLayers: [],
  recentJobs,
  alerts: [],
  resources
});

const buildRun = (overrides: Partial<JobRun> = {}): JobRun => ({
  jobName: 'bronze-market-job',
  jobType: 'data-ingest',
  status: 'success',
  startTime: '2026-05-01T12:00:00Z',
  triggeredBy: 'schedule',
  ...overrides
});

const buildResource = (overrides: Partial<ResourceHealth> = {}): ResourceHealth => ({
  name: 'resource-job',
  resourceType: 'Microsoft.App/jobs',
  status: 'healthy',
  lastChecked: '2026-05-01T12:00:00Z',
  ...overrides
});

const buildOverride = (
  overrides: Partial<SystemHealthJobOverride> = {}
): SystemHealthJobOverride => ({
  jobName: 'manual-job',
  jobKey: 'manual-job',
  status: 'running',
  runningState: 'Running',
  startTime: '2026-05-01T12:00:00Z',
  firstSeenAt: '2026-05-01T12:00:00Z',
  triggeredBy: 'manual',
  executionId: 'exec-1',
  executionName: null,
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  ...overrides
});

function mockStatusView(systemHealth: SystemHealth): void {
  mockDataService.getSystemStatusView.mockResolvedValue({
    version: 1,
    generatedAt: '2026-05-01T12:00:00Z',
    systemHealth,
    metadataSnapshot: {
      version: 1,
      updatedAt: null,
      entries: {},
      warnings: []
    },
    sources: {
      systemHealth: 'cache',
      metadataSnapshot: 'persisted-snapshot'
    }
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createQueryClient(): QueryClient {
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

describe('useJobStatuses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('reports override source for a pending manual trigger', async () => {
    const queryClient = createQueryClient();
    const override = buildOverride();
    const overrides: SystemHealthJobOverrideMap = {
      [override.jobKey]: override
    };
    queryClient.setQueryData(queryKeys.systemHealthJobOverrides(), overrides);
    mockStatusView(buildHealth());

    const { result } = renderHook(() => useJobStatuses(), {
      wrapper: createWrapper(queryClient)
    });

    await waitFor(() => {
      expect(result.current.byKey.get('manual-job')?.source).toBe('override');
    });
    expect(result.current.byKey.get('manual-job')?.status).toBe('running');
    expect(result.current.byKey.get('manual-job')?.latestRun?.executionId).toBe('exec-1');
  });

  it('distinguishes run and resource status sources', async () => {
    const queryClient = createQueryClient();
    mockStatusView(
      buildHealth(
        [buildRun({ jobName: 'run-job', status: 'failed' })],
        [buildResource({ name: 'resource-job', runningState: 'Running' })]
      )
    );

    const { result } = renderHook(() => useJobStatuses(), {
      wrapper: createWrapper(queryClient)
    });

    await waitFor(() => {
      expect(result.current.byKey.get('run-job')?.source).toBe('run');
    });
    expect(result.current.byKey.get('run-job')?.status).toBe('failed');
    expect(result.current.byKey.get('resource-job')?.source).toBe('resource');
    expect(result.current.byKey.get('resource-job')?.status).toBe('running');
  });

  it('keeps one entry per normalized job name despite duplicate runs and resources', async () => {
    const queryClient = createQueryClient();
    mockStatusView(
      buildHealth(
        [
          buildRun({ jobName: 'Bronze_Market_Job', startTime: '2026-05-01T12:00:00Z' }),
          buildRun({
            jobName: 'bronze-market-job',
            status: 'failed',
            startTime: '2026-05-01T12:05:00Z'
          })
        ],
        [buildResource({ name: 'bronze-market-job' }), buildResource({ name: 'Bronze_Market_Job' })]
      )
    );

    const { result } = renderHook(() => useJobStatuses(), {
      wrapper: createWrapper(queryClient)
    });

    await waitFor(() => {
      expect(result.current.byKey.get('bronze-market-job')?.status).toBe('failed');
    });
    expect(
      result.current.list.filter((entry) => entry.jobKey === 'bronze-market-job')
    ).toHaveLength(1);
  });
});
