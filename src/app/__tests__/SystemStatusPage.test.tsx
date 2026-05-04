import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { renderWithProviders } from '@/test/utils';
import { SystemStatusPage } from '@/features/system-status/SystemStatusPage';
import { getDomainOrderEntries } from '@/features/system-status/lib/domainOrdering';
import { queryKeys } from '@/hooks/useDataQueries';
import { upsertRunningJobOverride } from '@/hooks/useSystemHealthJobOverrides';
import { DataService } from '@/services/DataService';
import { REALTIME_STATUS_EVENT } from '@/services/realtimeBus';
import type { SystemStatusViewResponse } from '@/services/apiService';
import type { DataLayer } from '@/types/strategy';

const { MOCK_RUN_TIMESTAMPS, domainLayerCoverageSpy, jobLogStreamSpy, operationalJobSpy } =
  vi.hoisted(() => ({
    MOCK_RUN_TIMESTAMPS: {
      latest: '2026-03-11T12:00:00.000Z',
      older: '2026-03-10T12:00:00.000Z'
    },
    domainLayerCoverageSpy: vi.fn(),
    jobLogStreamSpy: vi.fn(),
    operationalJobSpy: vi.fn()
  }));

vi.mock('@/services/DataService', () => ({
  DataService: {
    getSystemStatusView: vi.fn()
  }
}));

vi.mock('@/features/system-status/domain-layer-comparison/DomainLayerComparisonPanel', () => ({
  DomainLayerComparisonPanel: (props: unknown) => {
    domainLayerCoverageSpy(props);
    return (
      <div data-testid="mock-domain-layer-coverage-panel">Mock Domain Layer Coverage Panel</div>
    );
  }
}));

vi.mock('@/features/system-status/components/ContainerAppsPanel', () => ({
  ContainerAppsPanel: () => (
    <div data-testid="mock-container-apps-panel">Mock Container Apps Panel</div>
  )
}));

vi.mock('@/features/system-status/components/JobLogStreamPanel', () => ({
  JobLogStreamPanel: (props: unknown) => {
    jobLogStreamSpy(props);
    return <div data-testid="mock-job-log-stream-panel">Mock Job Log Stream Panel</div>;
  }
}));

vi.mock('@/features/system-status/components/OperationalJobMonitorPanel', () => ({
  OperationalJobMonitorPanel: (props: unknown) => {
    operationalJobSpy(props);
    return <div data-testid="mock-operational-job-monitor">Mock Operational Job Monitor</div>;
  }
}));

const BACKTEST_JOB_AZURE_ID =
  '/subscriptions/sub-id/resourceGroups/rg-name/providers/Microsoft.App/jobs/aca-job-backtest-runner';

function buildSystemStatusView(
  overrides: Partial<SystemStatusViewResponse> = {}
): SystemStatusViewResponse {
  const generatedAt = new Date().toISOString();
  return {
    version: 1,
    generatedAt,
    sources: {
      systemHealth: 'live-refresh',
      metadataSnapshot: 'persisted-snapshot'
    },
    metadataSnapshot: {
      version: 1,
      updatedAt: generatedAt,
      entries: {
        'bronze/market': {
          layer: 'bronze',
          domain: 'market',
          container: 'bronze',
          type: 'delta',
          computedAt: generatedAt,
          cacheSource: 'snapshot',
          symbolCount: 321,
          columnCount: 9,
          warnings: []
        }
      },
      warnings: []
    },
    systemHealth: {
      overall: 'healthy',
      dataLayers: [
        {
          name: 'Bronze',
          description: 'Raw ingestion layer',
          status: 'healthy',
          lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
          refreshFrequency: 'Daily',
          domains: [
            {
              name: 'zeta',
              description: 'Market data',
              type: 'blob',
              path: 'bronze/zeta',
              lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
              status: 'healthy',
              portalUrl: 'https://example.com/storage/bronze/zeta',
              jobUrl:
                'https://portal.azure.com/#@/resource/sub-id/resourceGroups/rg-name/providers/Microsoft.App/jobs/aca-job-zeta/overview',
              jobName: 'aca-job-zeta',
              frequency: 'Daily',
              cron: '0 0 * * *'
            },
            {
              name: 'Alpha',
              description: 'Reference domain',
              type: 'blob',
              path: 'bronze/alpha',
              lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
              status: 'healthy',
              portalUrl: 'https://example.com/storage/bronze/alpha',
              jobUrl:
                'https://portal.azure.com/#@/resource/sub-id/resourceGroups/rg-name/providers/Microsoft.App/jobs/aca-job-alpha/overview',
              jobName: 'aca-job-alpha',
              frequency: 'Daily',
              cron: '0 0 * * *'
            },
            {
              name: 'market',
              description: 'Market data',
              type: 'blob',
              path: 'bronze/market',
              lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
              status: 'healthy',
              portalUrl: 'https://example.com/storage/bronze/market',
              jobUrl:
                'https://portal.azure.com/#@/resource/sub-id/resourceGroups/rg-name/providers/Microsoft.App/jobs/aca-job-market/overview',
              jobName: 'aca-job-market',
              frequency: 'Daily',
              cron: '0 0 * * *'
            }
          ],
          portalUrl: 'https://example.com/storage/bronze'
        },
        {
          name: 'Platinum',
          description: 'Serving layer',
          status: 'healthy',
          lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
          refreshFrequency: 'Daily',
          domains: [
            {
              name: 'platinum',
              description: 'Reserved',
              type: 'blob',
              path: 'platinum',
              lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
              status: 'healthy',
              portalUrl: 'https://example.com/storage/platinum',
              jobUrl:
                'https://portal.azure.com/#@/resource/sub-id/resourceGroups/rg-name/providers/Microsoft.App/jobs/aca-job-platinum/overview',
              jobName: 'aca-job-platinum',
              frequency: 'Daily',
              cron: '0 0 * * *'
            }
          ],
          portalUrl: 'https://example.com/storage/platinum'
        }
      ],
      recentJobs: [
        {
          jobName: 'aca-job-market',
          jobType: 'data-ingest',
          jobCategory: 'data-pipeline',
          jobKey: 'market',
          jobRole: 'load',
          triggerOwner: 'schedule',
          metadataSource: 'tags',
          metadataStatus: 'valid',
          status: 'success',
          startTime: MOCK_RUN_TIMESTAMPS.latest,
          triggeredBy: 'azure'
        },
        {
          jobName: 'aca-job-market',
          jobType: 'data-ingest',
          jobCategory: 'data-pipeline',
          jobKey: 'market',
          jobRole: 'load',
          triggerOwner: 'schedule',
          metadataSource: 'tags',
          metadataStatus: 'valid',
          status: 'running',
          startTime: MOCK_RUN_TIMESTAMPS.older,
          triggeredBy: 'azure'
        },
        {
          jobName: 'aca-job-platinum',
          jobType: 'data-ingest',
          status: 'success',
          startTime: MOCK_RUN_TIMESTAMPS.latest,
          triggeredBy: 'azure'
        },
        {
          jobName: 'aca-job-backtest-runner',
          jobType: 'backtest',
          status: 'running',
          startTime: MOCK_RUN_TIMESTAMPS.latest,
          triggeredBy: 'manual'
        },
        {
          jobName: 'aca-job-ranking-materialize',
          jobType: 'data-ingest',
          status: 'success',
          startTime: MOCK_RUN_TIMESTAMPS.latest,
          triggeredBy: 'api'
        }
      ],
      alerts: [],
      resources: [
        {
          name: 'aca-job-market',
          resourceType: 'Microsoft.App/jobs',
          status: 'healthy',
          jobCategory: 'data-pipeline',
          jobKey: 'market',
          jobRole: 'load',
          triggerOwner: 'schedule',
          metadataSource: 'tags',
          metadataStatus: 'valid',
          lastChecked: MOCK_RUN_TIMESTAMPS.latest,
          runningState: 'Running',
          lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest,
          signals: [
            {
              name: 'CpuUsage',
              value: 52.3,
              unit: 'Percent',
              timestamp: MOCK_RUN_TIMESTAMPS.latest,
              status: 'healthy',
              source: 'metrics'
            },
            {
              name: 'MemoryWorkingSetBytes',
              value: 805306368,
              unit: 'Bytes',
              timestamp: MOCK_RUN_TIMESTAMPS.latest,
              status: 'healthy',
              source: 'metrics'
            }
          ]
        },
        {
          name: 'aca-job-zeta',
          resourceType: 'Microsoft.App/jobs',
          status: 'warning',
          jobCategory: 'data-pipeline',
          jobKey: 'zeta',
          jobRole: 'load',
          triggerOwner: 'schedule',
          metadataSource: 'legacy-catalog',
          metadataStatus: 'fallback',
          lastChecked: MOCK_RUN_TIMESTAMPS.latest,
          runningState: 'Suspended',
          lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
        },
        {
          name: 'aca-job-backtest-runner',
          resourceType: 'Microsoft.App/jobs',
          status: 'healthy',
          azureId: BACKTEST_JOB_AZURE_ID,
          lastChecked: MOCK_RUN_TIMESTAMPS.latest,
          runningState: 'Running',
          lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
        },
        {
          name: 'aca-job-regime-refresh',
          resourceType: 'Microsoft.App/jobs',
          status: 'healthy',
          lastChecked: MOCK_RUN_TIMESTAMPS.latest,
          runningState: 'Succeeded',
          lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
        }
      ]
    },
    ...overrides
  };
}

describe('SystemStatusPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    delete (DataService as { getSystemStatusViewResult?: unknown }).getSystemStatusViewResult;
    vi.mocked(DataService.getSystemStatusView).mockResolvedValue(buildSystemStatusView());
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    domainLayerCoverageSpy.mockClear();
    jobLogStreamSpy.mockClear();
    operationalJobSpy.mockClear();
  });

  const createQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          staleTime: 0
        }
      }
    });

  const expectNoPlatinumDomain = (layers: DataLayer[]) => {
    for (const layer of layers) {
      for (const domain of layer.domains || []) {
        expect(
          String(domain.name || '')
            .trim()
            .toLowerCase()
        ).not.toBe('platinum');
      }
    }
  };

  it('renders the page layout and lazy loaded components', async () => {
    renderWithProviders(<SystemStatusPage />);

    await screen.findByTestId('mock-domain-layer-coverage-panel');

    expect(screen.queryByText('Risk Readout')).not.toBeInTheDocument();
    expect(screen.queryByText('Configured Coverage')).not.toBeInTheDocument();
    expect(screen.queryByText('Job Risk')).not.toBeInTheDocument();
    expect(screen.queryByText('Open Alerts')).not.toBeInTheDocument();
    expect(screen.queryByText(/Live medallion coverage/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refresh View/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/VIEW UPDATED/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Session Readout')).not.toBeInTheDocument();
    expect(screen.queryByText('Live refresh feed')).not.toBeInTheDocument();
    expect(screen.queryByText('Persisted metadata snapshot')).not.toBeInTheDocument();
    expect(screen.queryByText('Job Taxonomy')).not.toBeInTheDocument();
    expect(screen.queryByText('Runtime Workflow Groups')).not.toBeInTheDocument();
    expect(screen.queryByText('Metadata Review')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Strategy Workspace/i })).not.toBeInTheDocument();
    expect(await screen.findByTestId('mock-operational-job-monitor')).toBeInTheDocument();
    expect(await screen.findByTestId('mock-container-apps-panel')).toBeInTheDocument();
    expect(await screen.findByTestId('mock-job-log-stream-panel')).toBeInTheDocument();
  });

  it('keeps rendering cached status data while a background refresh is unauthorized', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.systemStatusView(), buildSystemStatusView());
    vi.mocked(DataService.getSystemStatusView).mockRejectedValue(
      new Error('API Error: 401 Unauthorized')
    );

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SystemStatusPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('mock-domain-layer-coverage-panel')).toBeInTheDocument();

    await waitFor(() => {
      expect(DataService.getSystemStatusView).toHaveBeenCalled();
    });
    expect(screen.queryByText('System Link Failure')).not.toBeInTheDocument();
    expect(await screen.findByText('Last refresh failed')).toBeInTheDocument();
  });

  it('shows a degraded banner when the unified status view uses fallback endpoints', async () => {
    (
      DataService as unknown as {
        getSystemStatusViewResult?: ReturnType<typeof vi.fn>;
      }
    ).getSystemStatusViewResult = vi.fn().mockResolvedValueOnce({
      data: buildSystemStatusView(),
      meta: {
        status: 'fallback',
        receivedAt: '2026-04-27T06:11:32.000Z',
        message: 'API Error: 404 Not Found'
      }
    });

    renderWithProviders(<SystemStatusPage />);

    expect(await screen.findByText('Status view degraded')).toBeInTheDocument();
    expect(screen.getByText(/health\/metadata fallback endpoints/i)).toBeInTheDocument();
  });

  it('shows a persistent degraded banner when realtime reconnects', async () => {
    renderWithProviders(<SystemStatusPage />);
    await screen.findByTestId('mock-domain-layer-coverage-panel');

    act(() => {
      window.dispatchEvent(
        new CustomEvent(REALTIME_STATUS_EVENT, {
          detail: {
            status: 'reconnecting',
            message: 'Realtime updates are reconnecting.',
            changedAt: '2026-04-27T06:11:32.000Z'
          }
        })
      );
    });

    expect(await screen.findByText('Realtime updates degraded')).toBeInTheDocument();
    expect(screen.getByText('Realtime updates are reconnecting.')).toBeInTheDocument();
  });

  it('keeps platinum as a layer but removes it as a data domain', async () => {
    domainLayerCoverageSpy.mockClear();

    renderWithProviders(<SystemStatusPage />);
    await screen.findByTestId('mock-domain-layer-coverage-panel');

    await waitFor(() => {
      expect(domainLayerCoverageSpy).toHaveBeenCalled();
    });

    const coverageProps = domainLayerCoverageSpy.mock.calls.at(-1)?.[0] as {
      dataLayers: DataLayer[];
      managedContainerJobs: Array<{
        name: string;
        lastModifiedAt?: string | null;
        signals?: Array<{
          name?: string | null;
          value?: number | null;
          unit?: string | null;
        }> | null;
      }>;
      metadataSource?: string | null;
    };

    expect(coverageProps.dataLayers.some((layer) => layer.name.toLowerCase() === 'platinum')).toBe(
      true
    );
    expectNoPlatinumDomain(coverageProps.dataLayers);
    expect(coverageProps.managedContainerJobs.map((job) => job.name)).toEqual([
      'aca-job-market',
      'aca-job-zeta'
    ]);
    expect(coverageProps.managedContainerJobs.every((job) => Boolean(job.lastModifiedAt))).toBe(
      true
    );
    expect(coverageProps.managedContainerJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'aca-job-market',
          signals: expect.arrayContaining([
            expect.objectContaining({
              name: 'CpuUsage',
              value: 52.3,
              unit: 'Percent'
            })
          ])
        })
      ])
    );
    expect(coverageProps.metadataSource).toBe('persisted-snapshot');
  });

  it('uses canonical domain ordering in domain layer coverage panel', async () => {
    renderWithProviders(<SystemStatusPage />);

    await waitFor(() => {
      expect(domainLayerCoverageSpy).toHaveBeenCalled();
    });

    const coverageProps = domainLayerCoverageSpy.mock.calls.at(-1)?.[0] as {
      dataLayers: DataLayer[];
    };

    const coverageOrder = getDomainOrderEntries(coverageProps.dataLayers).map((entry) => entry.key);

    expect(coverageOrder).toEqual(['alpha', 'market', 'zeta']);
  });

  it('routes non-domain jobs to the operational monitor without leaking domain jobs', async () => {
    const payload = buildSystemStatusView();
    vi.mocked(DataService.getSystemStatusView).mockResolvedValue(
      buildSystemStatusView({
        systemHealth: {
          ...payload.systemHealth,
          dataLayers: payload.systemHealth.dataLayers.map((layer) =>
            layer.name === 'Bronze'
              ? {
                  ...layer,
                  domains: [
                    ...(layer.domains || []),
                    {
                      name: 'backtests',
                      description: 'Backtest workflow output',
                      type: 'delta',
                      path: 'bronze/backtests',
                      lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
                      status: 'healthy',
                      jobName: 'aca-job-backtests-bronze'
                    },
                    {
                      name: 'ranking',
                      description: 'Ranking workflow output',
                      type: 'delta',
                      path: 'bronze/ranking',
                      lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
                      status: 'healthy',
                      jobName: 'aca-job-ranking-bronze'
                    },
                    {
                      name: 'regime',
                      description: 'Regime workflow output',
                      type: 'delta',
                      path: 'bronze/regime',
                      lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
                      status: 'healthy',
                      jobName: 'aca-job-regime-bronze'
                    },
                    {
                      name: 'government-signals',
                      description: 'Government signals product output',
                      type: 'blob',
                      path: 'government-signals/runs',
                      lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
                      status: 'healthy',
                      jobName: 'bronze-government-signals-job'
                    }
                  ]
                }
              : layer
          ),
          recentJobs: [
            ...payload.systemHealth.recentJobs,
            {
              jobName: 'aca-job-backtests-bronze',
              jobType: 'data-ingest',
              status: 'success',
              startTime: MOCK_RUN_TIMESTAMPS.latest,
              triggeredBy: 'schedule'
            },
            {
              jobName: 'aca-job-ranking-bronze',
              jobType: 'data-ingest',
              status: 'success',
              startTime: MOCK_RUN_TIMESTAMPS.latest,
              triggeredBy: 'schedule'
            },
            {
              jobName: 'aca-job-regime-bronze',
              jobType: 'data-ingest',
              status: 'success',
              startTime: MOCK_RUN_TIMESTAMPS.latest,
              triggeredBy: 'schedule'
            }
          ],
          resources: [
            ...(payload.systemHealth.resources || []),
            {
              name: 'aca-job-backtests-bronze',
              resourceType: 'Microsoft.App/jobs',
              status: 'healthy',
              lastChecked: MOCK_RUN_TIMESTAMPS.latest,
              runningState: 'Succeeded',
              lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
            },
            {
              name: 'aca-job-ranking-bronze',
              resourceType: 'Microsoft.App/jobs',
              status: 'healthy',
              lastChecked: MOCK_RUN_TIMESTAMPS.latest,
              runningState: 'Succeeded',
              lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
            },
            {
              name: 'aca-job-regime-bronze',
              resourceType: 'Microsoft.App/jobs',
              status: 'healthy',
              lastChecked: MOCK_RUN_TIMESTAMPS.latest,
              runningState: 'Succeeded',
              lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
            }
          ]
        }
      })
    );

    renderWithProviders(<SystemStatusPage />);

    await waitFor(() => {
      expect(operationalJobSpy).toHaveBeenCalled();
    });

    const operationalProps = operationalJobSpy.mock.calls.at(-1)?.[0] as {
      jobs: Array<{ name: string; category: string; jobUrl?: string | null }>;
    };
    const operationalNames = operationalProps.jobs.map((job) => job.name);

    expect(operationalProps.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'gold-regime-job',
          category: 'regime'
        }),
        expect.objectContaining({
          name: 'intraday-monitor-job',
          category: 'intraday-monitoring'
        }),
        expect.objectContaining({
          name: 'intraday-market-refresh-job',
          category: 'intraday-monitoring'
        }),
        expect.objectContaining({
          name: 'platinum-rankings-job',
          category: 'ranking'
        }),
        expect.objectContaining({
          name: 'results-reconcile-job',
          category: 'results-reconciliation'
        }),
        expect.objectContaining({
          name: 'symbol-cleanup-job',
          category: 'symbol-cleanup'
        }),
        expect.objectContaining({
          name: 'aca-job-backtest-runner',
          category: 'backtest',
          jobUrl: BACKTEST_JOB_AZURE_ID
        }),
        expect.objectContaining({
          name: 'aca-job-ranking-materialize',
          category: 'ranking'
        }),
        expect.objectContaining({
          name: 'aca-job-regime-refresh',
          category: 'regime'
        }),
        expect.objectContaining({
          name: 'aca-job-backtests-bronze',
          category: 'backtest'
        }),
        expect.objectContaining({
          name: 'aca-job-ranking-bronze',
          category: 'ranking'
        }),
        expect.objectContaining({
          name: 'aca-job-regime-bronze',
          category: 'regime'
        })
      ])
    );
    expect(operationalNames).not.toContain('aca-job-market');
    expect(operationalNames).not.toContain('aca-job-zeta');

    const coverageProps = domainLayerCoverageSpy.mock.calls.at(-1)?.[0] as {
      dataLayers: DataLayer[];
      managedContainerJobs: Array<{ name: string }>;
    };
    const coverageDomainNames = coverageProps.dataLayers.flatMap((layer) =>
      (layer.domains || []).map((domain) =>
        String(domain.name || '')
          .trim()
          .toLowerCase()
      )
    );
    expect(coverageDomainNames).not.toEqual(
      expect.arrayContaining(['backtests', 'ranking', 'regime', 'government-signals'])
    );
    expect(coverageProps.managedContainerJobs.map((job) => job.name)).toEqual([
      'aca-job-market',
      'aca-job-zeta'
    ]);
  });

  it('routes economic catalyst and quiver data jobs through domain coverage only', async () => {
    const payload = buildSystemStatusView();
    const domainJobNames = [
      'bronze-economic-catalyst-job',
      'silver-economic-catalyst-job',
      'gold-economic-catalyst-job',
      'bronze-quiver-data-job',
      'silver-quiver-data-job',
      'gold-quiver-data-job'
    ];
    const dataLayers: DataLayer[] = [
      {
        name: 'Bronze',
        description: 'Raw ingestion layer',
        status: 'healthy',
        lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
        refreshFrequency: 'Multiple schedules',
        domains: [
          {
            name: 'economic-catalyst',
            description: 'Raw macroeconomic calendar and headline source payloads',
            type: 'blob',
            path: 'economic-catalyst/runs/',
            lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
            status: 'healthy',
            jobName: 'bronze-economic-catalyst-job',
            frequency: 'Weekdays, every 30 minutes',
            cron: '*/30 * * * 1-5'
          },
          {
            name: 'quiver-data',
            description: 'Raw Quiver source payloads',
            type: 'blob',
            path: 'quiver-data/runs/',
            lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
            status: 'healthy',
            jobName: 'bronze-quiver-data-job',
            frequency: 'Weekdays, hourly',
            cron: '0 * * * 1-5'
          }
        ]
      },
      {
        name: 'Silver',
        description: 'Standardized layer',
        status: 'healthy',
        lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
        refreshFrequency: 'Manual trigger',
        domains: [
          {
            name: 'economic-catalyst',
            description: 'Standardized economic catalyst event and headline tables',
            type: 'blob',
            path: 'economic-catalyst/',
            lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
            status: 'healthy',
            jobName: 'silver-economic-catalyst-job',
            frequency: 'Manual trigger',
            cron: ''
          },
          {
            name: 'quiver-data',
            description: 'Standardized Quiver event datasets',
            type: 'blob',
            path: 'quiver-data/',
            lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
            status: 'healthy',
            jobName: 'silver-quiver-data-job',
            frequency: 'Manual trigger',
            cron: ''
          }
        ]
      },
      {
        name: 'Gold',
        description: 'Feature store',
        status: 'healthy',
        lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
        refreshFrequency: 'Manual trigger',
        domains: [
          {
            name: 'economic-catalyst',
            description: 'Market-ready economic catalyst features',
            type: 'blob',
            path: 'economic-catalyst/',
            lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
            status: 'healthy',
            jobName: 'gold-economic-catalyst-job',
            frequency: 'Manual trigger',
            cron: ''
          },
          {
            name: 'quiver-data',
            description: 'Market-ready Quiver signal features',
            type: 'blob',
            path: 'quiver/',
            lastUpdated: MOCK_RUN_TIMESTAMPS.latest,
            status: 'healthy',
            jobName: 'gold-quiver-data-job',
            frequency: 'Manual trigger',
            cron: ''
          }
        ]
      }
    ];

    vi.mocked(DataService.getSystemStatusView).mockResolvedValue(
      buildSystemStatusView({
        systemHealth: {
          ...payload.systemHealth,
          dataLayers,
          recentJobs: [
            ...domainJobNames.map((jobName) => ({
              jobName,
              jobType: 'data-ingest' as const,
              status: 'success' as const,
              startTime: MOCK_RUN_TIMESTAMPS.latest,
              triggeredBy: 'azure'
            })),
            {
              jobName: 'aca-job-backtest-runner',
              jobType: 'backtest',
              status: 'running',
              startTime: MOCK_RUN_TIMESTAMPS.latest,
              triggeredBy: 'manual'
            }
          ],
          resources: [
            ...domainJobNames.map((name) => ({
              name,
              resourceType: 'Microsoft.App/jobs' as const,
              status: 'healthy' as const,
              lastChecked: MOCK_RUN_TIMESTAMPS.latest,
              runningState: 'Succeeded',
              lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
            })),
            {
              name: 'aca-job-backtest-runner',
              resourceType: 'Microsoft.App/jobs',
              status: 'healthy',
              lastChecked: MOCK_RUN_TIMESTAMPS.latest,
              runningState: 'Running',
              lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
            }
          ]
        }
      })
    );

    renderWithProviders(<SystemStatusPage />);

    await waitFor(() => {
      expect(domainLayerCoverageSpy).toHaveBeenCalled();
      expect(operationalJobSpy).toHaveBeenCalled();
    });

    const coverageProps = domainLayerCoverageSpy.mock.calls.at(-1)?.[0] as {
      dataLayers: DataLayer[];
      managedContainerJobs: Array<{ name: string }>;
    };
    const coverageDomainNames = coverageProps.dataLayers.flatMap((layer) =>
      (layer.domains || []).map((domain) =>
        String(domain.name || '')
          .trim()
          .toLowerCase()
      )
    );
    const managedNames = coverageProps.managedContainerJobs.map((job) => job.name);

    expect(coverageDomainNames).toEqual(
      expect.arrayContaining(['economic-catalyst', 'quiver-data'])
    );
    expect(coverageDomainNames).not.toContain('quiver');
    expect(managedNames).toEqual(domainJobNames);
    expect(managedNames).not.toContain('bronze-quiver-backfill-job');

    const operationalProps = operationalJobSpy.mock.calls.at(-1)?.[0] as {
      jobs: Array<{ name: string }>;
    };
    const operationalNames = operationalProps.jobs.map((job) => job.name);

    for (const jobName of domainJobNames) {
      expect(operationalNames).not.toContain(jobName);
    }
    expect(operationalNames).toContain('aca-job-backtest-runner');
    expect(operationalNames).not.toContain('bronze-quiver-backfill-job');
  });

  it('passes domain and operational jobs to the job console stream panel', async () => {
    renderWithProviders(<SystemStatusPage />);

    await waitFor(() => {
      expect(jobLogStreamSpy).toHaveBeenCalled();
    });

    const jobStreamProps = jobLogStreamSpy.mock.calls.at(-1)?.[0] as {
      jobs: Array<{
        name: string;
        runningState?: string | null;
        recentStatus?: string | null;
        startTime?: string | null;
      }>;
    };

    const jobStreamNames = jobStreamProps.jobs.map((job) => job.name);
    expect(jobStreamNames).toEqual(
      expect.arrayContaining([
        'aca-job-market',
        'aca-job-backtest-runner',
        'aca-job-regime-refresh',
        'gold-regime-job',
        'intraday-monitor-job',
        'intraday-market-refresh-job',
        'platinum-rankings-job',
        'results-reconcile-job',
        'symbol-cleanup-job'
      ])
    );
    expect(jobStreamProps.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'aca-job-market',
          runningState: 'Running',
          recentStatus: 'success',
          startTime: MOCK_RUN_TIMESTAMPS.latest,
          signals: expect.arrayContaining([
            expect.objectContaining({
              name: 'CpuUsage',
              value: 52.3,
              unit: 'Percent'
            }),
            expect.objectContaining({
              name: 'MemoryWorkingSetBytes',
              value: 805306368,
              unit: 'Bytes'
            })
          ])
        }),
        expect.objectContaining({
          name: 'aca-job-backtest-runner',
          runningState: 'Running',
          recentStatus: 'running',
          startTime: MOCK_RUN_TIMESTAMPS.latest
        })
      ])
    );
  });

  it('does not let a running resource state overwrite a failed latest execution', async () => {
    const payload = buildSystemStatusView();
    vi.mocked(DataService.getSystemStatusView).mockResolvedValue(
      buildSystemStatusView({
        systemHealth: {
          ...payload.systemHealth,
          recentJobs: payload.systemHealth.recentJobs.map((job) =>
            job.jobName === 'aca-job-market' && job.startTime === MOCK_RUN_TIMESTAMPS.latest
              ? { ...job, status: 'failed' as const }
              : job
          )
        }
      })
    );

    renderWithProviders(<SystemStatusPage />);

    await waitFor(() => {
      expect(jobLogStreamSpy).toHaveBeenCalled();
    });

    const jobStreamProps = jobLogStreamSpy.mock.calls.at(-1)?.[0] as {
      jobs: Array<{
        name: string;
        runningState?: string | null;
        recentStatus?: string | null;
        startTime?: string | null;
      }>;
    };

    expect(jobStreamProps.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'aca-job-market',
          runningState: 'Running',
          recentStatus: 'failed',
          startTime: MOCK_RUN_TIMESTAMPS.latest
        })
      ])
    );
  });

  it('routes metadata-only expected jobs to the operational panel without rendering taxonomy groups', async () => {
    const payload = buildSystemStatusView();
    vi.mocked(DataService.getSystemStatusView).mockResolvedValue(
      buildSystemStatusView({
        systemHealth: {
          ...payload.systemHealth,
          resources: [
            ...(payload.systemHealth.resources || []),
            {
              name: 'gold-regime-job',
              resourceType: 'Microsoft.App/jobs',
              status: 'healthy',
              jobCategory: 'strategy-compute',
              jobKey: 'regime',
              jobRole: 'publish',
              triggerOwner: 'schedule',
              metadataSource: 'tags',
              metadataStatus: 'valid',
              lastChecked: MOCK_RUN_TIMESTAMPS.latest,
              runningState: 'Succeeded',
              lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
            },
            {
              name: 'platinum-rankings-job',
              resourceType: 'Microsoft.App/jobs',
              status: 'healthy',
              jobCategory: 'strategy-compute',
              jobKey: 'rankings',
              jobRole: 'materialize',
              triggerOwner: 'control-plane',
              metadataSource: 'tags',
              metadataStatus: 'valid',
              lastChecked: MOCK_RUN_TIMESTAMPS.latest,
              runningState: 'Succeeded',
              lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
            },
            {
              name: 'backtests-job',
              resourceType: 'Microsoft.App/jobs',
              status: 'healthy',
              jobCategory: 'strategy-compute',
              jobKey: 'backtests',
              jobRole: 'execute',
              triggerOwner: 'control-plane',
              metadataSource: 'tags',
              metadataStatus: 'valid',
              lastChecked: MOCK_RUN_TIMESTAMPS.latest,
              runningState: 'Succeeded',
              lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
            },
            {
              name: 'results-reconcile-job',
              resourceType: 'Microsoft.App/jobs',
              status: 'warning',
              jobCategory: 'strategy-compute',
              jobKey: 'results-reconcile',
              jobRole: 'execute',
              triggerOwner: 'schedule',
              metadataSource: 'tags',
              metadataStatus: 'invalid',
              metadataErrors: ['tag values do not match legacy catalog'],
              lastChecked: MOCK_RUN_TIMESTAMPS.latest,
              runningState: 'Succeeded',
              lastModifiedAt: MOCK_RUN_TIMESTAMPS.latest
            }
          ]
        }
      })
    );

    renderWithProviders(<SystemStatusPage />);

    expect(screen.queryByText('Job Taxonomy')).not.toBeInTheDocument();
    expect(screen.queryByText('Runtime Workflow Groups')).not.toBeInTheDocument();
    expect(screen.queryByText('Metadata Review')).not.toBeInTheDocument();
    expect(screen.queryByText('tag values do not match legacy catalog')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(operationalJobSpy).toHaveBeenCalled();
      expect(jobLogStreamSpy).toHaveBeenCalled();
    });
    const operationalProps = operationalJobSpy.mock.calls.at(-1)?.[0] as {
      jobs: Array<{ category: string; name: string; recentStatus?: string | null }>;
    };
    expect(operationalProps.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'gold-regime-job',
          category: 'regime',
          recentStatus: 'success'
        }),
        expect.objectContaining({
          name: 'platinum-rankings-job',
          category: 'ranking'
        }),
        expect.objectContaining({
          name: 'results-reconcile-job',
          category: 'results-reconciliation',
          recentStatus: 'success'
        })
      ])
    );

    const jobStreamProps = jobLogStreamSpy.mock.calls.at(-1)?.[0] as {
      jobs: Array<{ label: string; name: string }>;
    };
    const jobStreamNames = jobStreamProps.jobs.map((job) => job.name);
    expect(jobStreamNames).toEqual(
      expect.arrayContaining(['gold-regime-job', 'platinum-rankings-job', 'results-reconcile-job'])
    );
  });

  it('merges optimistic running overrides into the system status props', async () => {
    const now = new Date().toISOString();
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.systemHealthJobOverrides(), {
      'aca-job-zeta': {
        jobName: 'aca-job-zeta',
        jobKey: 'aca-job-zeta',
        status: 'running',
        runningState: 'Running',
        startTime: now,
        triggeredBy: 'manual',
        executionId: 'exec-zeta',
        executionName: 'exec-zeta',
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      }
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SystemStatusPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(domainLayerCoverageSpy).toHaveBeenCalled();
    });

    const coverageProps = domainLayerCoverageSpy.mock.calls.at(-1)?.[0] as {
      jobStates: Record<string, string>;
      recentJobs: Array<{ jobName: string; status: string; triggeredBy?: string }>;
      managedContainerJobs: Array<{ name: string; runningState?: string | null }>;
    };

    expect(coverageProps.jobStates['aca-job-zeta']).toBe('Running');
    expect(coverageProps.recentJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobName: 'aca-job-zeta',
          status: 'running',
          triggeredBy: 'manual'
        })
      ])
    );
    expect(coverageProps.managedContainerJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'aca-job-zeta',
          runningState: 'Running'
        })
      ])
    );
  });

  it('restores optimistic running overrides after a hard reload before server telemetry catches up', async () => {
    const now = new Date().toISOString();
    const seededClient = createQueryClient();

    upsertRunningJobOverride(seededClient, {
      jobName: 'aca-job-zeta',
      startTime: now,
      triggeredBy: 'manual',
      response: {
        executionId: 'exec-zeta',
        executionName: 'exec-zeta'
      }
    });

    const payload = buildSystemStatusView();
    vi.mocked(DataService.getSystemStatusView).mockResolvedValue({
      ...payload,
      systemHealth: {
        ...payload.systemHealth,
        recentJobs: payload.systemHealth.recentJobs.filter((job) => job.jobName !== 'aca-job-zeta'),
        resources: (payload.systemHealth.resources || []).map((resource) =>
          resource.name === 'aca-job-zeta'
            ? {
                ...resource,
                runningState: undefined,
                lastModifiedAt: MOCK_RUN_TIMESTAMPS.older
              }
            : resource
        )
      }
    });

    const reloadedClient = createQueryClient();

    render(
      <QueryClientProvider client={reloadedClient}>
        <BrowserRouter>
          <SystemStatusPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(domainLayerCoverageSpy).toHaveBeenCalled();
    });

    const coverageProps = domainLayerCoverageSpy.mock.calls.at(-1)?.[0] as {
      jobStates: Record<string, string>;
      recentJobs: Array<{ jobName: string; status: string; triggeredBy?: string }>;
      managedContainerJobs: Array<{ name: string; runningState?: string | null }>;
    };

    expect(coverageProps.jobStates['aca-job-zeta']).toBe('Running');
    expect(coverageProps.recentJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobName: 'aca-job-zeta',
          status: 'running',
          triggeredBy: 'manual'
        })
      ])
    );
    expect(coverageProps.managedContainerJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'aca-job-zeta',
          runningState: 'Running'
        })
      ])
    );
  });

  it('forces a live refresh when the coverage panel refresh handler is invoked', async () => {
    const now = new Date().toISOString();

    vi.mocked(DataService.getSystemStatusView)
      .mockResolvedValueOnce(buildSystemStatusView())
      .mockResolvedValueOnce(
        buildSystemStatusView({
          systemHealth: {
            overall: 'degraded',
            dataLayers: [
              {
                name: 'Bronze',
                description: 'Raw ingestion layer',
                status: 'degraded',
                lastUpdated: now,
                refreshFrequency: 'Daily',
                domains: [
                  {
                    name: 'zeta',
                    description: 'Market data',
                    type: 'blob',
                    path: 'bronze/zeta',
                    lastUpdated: now,
                    status: 'stale',
                    jobName: 'aca-job-zeta',
                    frequency: 'Daily'
                  }
                ]
              }
            ],
            recentJobs: [
              {
                jobName: 'aca-job-zeta',
                jobType: 'data-ingest',
                status: 'running',
                startTime: now,
                triggeredBy: 'azure'
              }
            ],
            alerts: [],
            resources: [
              {
                name: 'aca-job-zeta',
                resourceType: 'Microsoft.App/jobs',
                status: 'warning',
                lastChecked: now,
                runningState: 'Running',
                lastModifiedAt: now
              }
            ]
          }
        })
      );

    renderWithProviders(<SystemStatusPage />);

    await waitFor(() => {
      expect(domainLayerCoverageSpy).toHaveBeenCalled();
    });

    const coverageProps = domainLayerCoverageSpy.mock.calls.at(-1)?.[0] as {
      onRefresh?: () => Promise<void>;
      overall: string;
    };

    expect(coverageProps.overall).toBe('healthy');

    await act(async () => {
      await coverageProps.onRefresh?.();
    });

    expect(vi.mocked(DataService.getSystemStatusView)).toHaveBeenLastCalledWith(
      { refresh: true },
      expect.any(AbortSignal)
    );

    await waitFor(() => {
      const latestProps = domainLayerCoverageSpy.mock.calls.at(-1)?.[0] as { overall: string };
      expect(latestProps.overall).toBe('degraded');
    });
  });

  it('loads the unified status view from cache and refetches on the adaptive interval', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const now = new Date().toISOString();

    vi.mocked(DataService.getSystemStatusView)
      .mockResolvedValueOnce(buildSystemStatusView())
      .mockResolvedValueOnce(
        buildSystemStatusView({
          systemHealth: {
            overall: 'degraded',
            dataLayers: [
              {
                name: 'Bronze',
                description: 'Raw ingestion layer',
                status: 'degraded',
                lastUpdated: now,
                refreshFrequency: 'Daily',
                domains: [
                  {
                    name: 'zeta',
                    description: 'Market data',
                    type: 'blob',
                    path: 'bronze/zeta',
                    lastUpdated: now,
                    status: 'stale',
                    jobName: 'aca-job-zeta',
                    frequency: 'Daily'
                  }
                ]
              }
            ],
            recentJobs: [
              {
                jobName: 'aca-job-zeta',
                jobType: 'data-ingest',
                status: 'running',
                startTime: now,
                triggeredBy: 'azure'
              }
            ],
            alerts: [],
            resources: [
              {
                name: 'aca-job-zeta',
                resourceType: 'Microsoft.App/jobs',
                status: 'warning',
                lastChecked: now,
                runningState: 'Running',
                lastModifiedAt: now
              }
            ]
          }
        })
      );

    renderWithProviders(<SystemStatusPage />);

    await vi.dynamicImportSettled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    for (
      let attempt = 0;
      attempt < 10 && domainLayerCoverageSpy.mock.calls.length === 0;
      attempt += 1
    ) {
      await act(async () => {
        await vi.dynamicImportSettled();
        await vi.advanceTimersByTimeAsync(1);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(domainLayerCoverageSpy).toHaveBeenCalled();
    expect(vi.mocked(DataService.getSystemStatusView).mock.calls[0]?.[0]).not.toEqual(
      expect.objectContaining({ refresh: true })
    );
    const initialCallCount = vi.mocked(DataService.getSystemStatusView).mock.calls.length;
    expect(initialCallCount).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      await Promise.resolve();
    });

    expect(vi.mocked(DataService.getSystemStatusView).mock.calls.length).toBeGreaterThan(
      initialCallCount
    );
    expect(vi.mocked(DataService.getSystemStatusView)).toHaveBeenLastCalledWith(
      {},
      expect.any(AbortSignal)
    );

    const coverageProps = domainLayerCoverageSpy.mock.calls.at(-1)?.[0] as {
      overall: string;
      jobStates: Record<string, string>;
      recentJobs: Array<{ jobName: string; status: string }>;
      managedContainerJobs: Array<{ name: string; runningState?: string | null }>;
    };

    expect(coverageProps.overall).toBe('degraded');
    expect(coverageProps.jobStates['aca-job-zeta']).toBe('Running');
    expect(coverageProps.recentJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobName: 'aca-job-zeta',
          status: 'running'
        })
      ])
    );
    expect(coverageProps.managedContainerJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'aca-job-zeta',
          runningState: 'Running'
        })
      ])
    );
  });
});
