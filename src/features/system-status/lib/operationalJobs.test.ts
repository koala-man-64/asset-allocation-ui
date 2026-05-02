import { describe, expect, it } from 'vitest';

import {
  buildDomainJobKeySet,
  buildOperationalJobTargets,
  classifyJobCategory,
  EXPECTED_OPERATIONAL_JOBS,
  isExpectedOperationalJobName
} from '@/features/system-status/lib/operationalJobs';
import type { ManagedContainerJob } from '@/features/system-status/types';
import type { DataLayer, JobRun } from '@/types/strategy';

const DATA_LAYERS: DataLayer[] = [
  {
    name: 'Bronze',
    description: 'Raw ingestion',
    status: 'healthy',
    lastUpdated: '2026-04-18T14:30:00Z',
    refreshFrequency: 'Daily',
    domains: [
      {
        name: 'market',
        type: 'delta',
        path: 'market',
        lastUpdated: '2026-04-18T14:30:00Z',
        status: 'healthy',
        jobName: 'aca-job-market-bronze'
      }
    ]
  }
];

const DATA_LAYERS_WITH_OPERATIONAL_WORKFLOWS: DataLayer[] = [
  {
    ...DATA_LAYERS[0],
    domains: [
      ...(DATA_LAYERS[0].domains || []),
      {
        name: 'backtests',
        type: 'delta',
        path: 'backtests',
        lastUpdated: '2026-04-18T14:30:00Z',
        status: 'healthy',
        jobName: 'aca-job-backtests-bronze'
      },
      {
        name: 'ranking',
        type: 'delta',
        path: 'ranking',
        lastUpdated: '2026-04-18T14:30:00Z',
        status: 'healthy',
        jobName: 'aca-job-ranking-bronze'
      },
      {
        name: 'regime',
        type: 'delta',
        path: 'regime',
        lastUpdated: '2026-04-18T14:30:00Z',
        status: 'healthy',
        jobName: 'aca-job-regime-bronze'
      }
    ]
  }
];

const DATA_LAYERS_WITH_CATALYST_AND_QUIVER: DataLayer[] = [
  {
    name: 'Bronze',
    description: 'Raw ingestion',
    status: 'healthy',
    lastUpdated: '2026-04-18T14:30:00Z',
    refreshFrequency: 'Multiple schedules',
    domains: [
      {
        name: 'economic-catalyst',
        type: 'blob',
        path: 'economic-catalyst/runs',
        lastUpdated: '2026-04-18T14:30:00Z',
        status: 'healthy',
        jobName: 'bronze-economic-catalyst-job'
      },
      {
        name: 'quiver-data',
        type: 'blob',
        path: 'quiver-data/runs',
        lastUpdated: '2026-04-18T14:30:00Z',
        status: 'healthy',
        jobName: 'bronze-quiver-data-job'
      }
    ]
  },
  {
    name: 'Silver',
    description: 'Standardized data',
    status: 'healthy',
    lastUpdated: '2026-04-18T14:30:00Z',
    refreshFrequency: 'Manual trigger',
    domains: [
      {
        name: 'economic-catalyst',
        type: 'blob',
        path: 'economic-catalyst',
        lastUpdated: '2026-04-18T14:30:00Z',
        status: 'healthy',
        jobName: 'silver-economic-catalyst-job'
      },
      {
        name: 'quiver-data',
        type: 'blob',
        path: 'quiver-data',
        lastUpdated: '2026-04-18T14:30:00Z',
        status: 'healthy',
        jobName: 'silver-quiver-data-job'
      }
    ]
  },
  {
    name: 'Gold',
    description: 'Feature store',
    status: 'healthy',
    lastUpdated: '2026-04-18T14:30:00Z',
    refreshFrequency: 'Manual trigger',
    domains: [
      {
        name: 'economic-catalyst',
        type: 'blob',
        path: 'economic-catalyst',
        lastUpdated: '2026-04-18T14:30:00Z',
        status: 'healthy',
        jobName: 'gold-economic-catalyst-job'
      },
      {
        name: 'quiver-data',
        type: 'blob',
        path: 'quiver',
        lastUpdated: '2026-04-18T14:30:00Z',
        status: 'healthy',
        jobName: 'gold-quiver-data-job'
      }
    ]
  }
];

describe('operational job classification', () => {
  it('seeds the expected operational job catalog without live telemetry', () => {
    const targets = buildOperationalJobTargets({});

    expect(targets.map((job) => job.name)).toEqual(
      expect.arrayContaining(EXPECTED_OPERATIONAL_JOBS.map((job) => job.name))
    );
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'gold-regime-job',
          category: 'regime',
          recentStatus: null
        }),
        expect.objectContaining({
          name: 'intraday-monitor-job',
          category: 'intraday-monitoring',
          runningState: null
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
        })
      ])
    );
  });

  it('marks jobs mapped from data layers as domain data', () => {
    const domainJobKeys = buildDomainJobKeySet(DATA_LAYERS);

    expect(
      classifyJobCategory({
        jobName: 'aca-job-market-bronze',
        jobType: 'data-ingest',
        domainJobKeys
      })
    ).toBe('domain-data');
  });

  it('does not reserve operational workflow domains for domain coverage', () => {
    const domainJobKeys = buildDomainJobKeySet(DATA_LAYERS_WITH_OPERATIONAL_WORKFLOWS);

    expect(domainJobKeys.has('aca-job-market-bronze')).toBe(true);
    expect(domainJobKeys.has('aca-job-backtests-bronze')).toBe(false);
    expect(domainJobKeys.has('aca-job-ranking-bronze')).toBe(false);
    expect(domainJobKeys.has('aca-job-regime-bronze')).toBe(false);
  });

  it('does not reserve government signals jobs for domain coverage', () => {
    const domainJobKeys = buildDomainJobKeySet([
      {
        name: 'Bronze',
        description: 'Raw ingestion',
        status: 'healthy',
        lastUpdated: '2026-04-18T14:30:00Z',
        refreshFrequency: 'Daily',
        domains: [
          {
            name: 'government-signals',
            type: 'blob',
            path: 'government-signals/runs',
            lastUpdated: '2026-04-18T14:30:00Z',
            status: 'healthy',
            jobName: 'bronze-government-signals-job',
            jobUrl: null
          }
        ]
      }
    ]);

    expect(domainJobKeys.has('bronze-government-signals-job')).toBe(false);
    expect(domainJobKeys.size).toBe(0);
  });

  it('reserves economic catalyst and one quiver data job per layer for domain coverage', () => {
    const domainJobKeys = buildDomainJobKeySet(DATA_LAYERS_WITH_CATALYST_AND_QUIVER);

    expect(domainJobKeys).toEqual(
      new Set([
        'bronze-economic-catalyst-job',
        'bronze-quiver-data-job',
        'silver-economic-catalyst-job',
        'silver-quiver-data-job',
        'gold-economic-catalyst-job',
        'gold-quiver-data-job'
      ])
    );
    expect(domainJobKeys.has('bronze-quiver-backfill-job')).toBe(false);
  });

  it('classifies backtest, ranking, regime, and unknown non-domain jobs', () => {
    const domainJobKeys = buildDomainJobKeySet(DATA_LAYERS);

    expect(
      classifyJobCategory({
        jobName: 'strategy-secondary-runner',
        jobType: 'backtest',
        domainJobKeys
      })
    ).toBe('backtest');
    expect(classifyJobCategory({ jobName: 'aca-job-ranking-materialize', domainJobKeys })).toBe(
      'ranking'
    );
    expect(classifyJobCategory({ jobName: 'aca-job-regime-refresh', domainJobKeys })).toBe(
      'regime'
    );
    expect(classifyJobCategory({ jobName: 'intraday-monitor-job', domainJobKeys })).toBe(
      'intraday-monitoring'
    );
    expect(classifyJobCategory({ jobName: 'aca-job-results-reconciliation', domainJobKeys })).toBe(
      'results-reconciliation'
    );
    expect(classifyJobCategory({ jobName: 'aca-job-symbol-cleanup', domainJobKeys })).toBe(
      'symbol-cleanup'
    );
    expect(classifyJobCategory({ jobName: 'aca-job-cache-maintenance', domainJobKeys })).toBe(
      'other-operational'
    );
  });

  it('does not suppress exact expected jobs when they also appear in domain metadata', () => {
    const domainJobKeys = buildDomainJobKeySet([
      {
        name: 'Gold',
        description: 'Curated data',
        status: 'healthy',
        lastUpdated: '2026-04-18T14:30:00Z',
        refreshFrequency: 'Daily',
        domains: [
          {
            name: 'intraday',
            type: 'delta',
            path: 'gold/intraday',
            lastUpdated: '2026-04-18T14:30:00Z',
            status: 'healthy',
            jobName: 'intraday-market-refresh-job'
          },
          {
            name: 'symbol',
            type: 'delta',
            path: 'gold/symbol',
            lastUpdated: '2026-04-18T14:30:00Z',
            status: 'healthy',
            jobName: 'custom-symbol-domain-job'
          }
        ]
      }
    ]);

    expect(isExpectedOperationalJobName('intraday-market-refresh-job')).toBe(true);
    expect(domainJobKeys.has('intraday-market-refresh-job')).toBe(false);
    expect(domainJobKeys.has('custom-symbol-domain-job')).toBe(true);
    expect(
      classifyJobCategory({
        jobName: 'intraday-market-refresh-job',
        domainJobKeys
      })
    ).toBe('intraday-monitoring');
    expect(
      classifyJobCategory({
        jobName: 'custom-symbol-domain-job',
        domainJobKeys
      })
    ).toBe('domain-data');
  });

  it('merges live telemetry over seeded expected job rows', () => {
    const targets = buildOperationalJobTargets({
      recentJobs: [
        {
          jobName: 'Gold_Regime_Job',
          jobType: 'data-ingest',
          status: 'failed',
          startTime: '2026-04-18T14:31:00Z',
          duration: 97,
          recordsProcessed: 42,
          triggeredBy: 'schedule'
        }
      ],
      managedContainerJobs: [
        {
          name: 'gold-regime-job',
          runningState: 'Succeeded',
          lastModifiedAt: '2026-04-18T14:32:00Z',
          signals: [
            {
              name: 'CpuUsage',
              value: 52,
              unit: 'Percent',
              timestamp: '2026-04-18T14:32:00Z',
              status: 'healthy',
              source: 'metrics'
            }
          ]
        }
      ]
    });

    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'gold-regime-job',
          category: 'regime',
          recentStatus: 'failed',
          startTime: '2026-04-18T14:31:00Z',
          duration: 97,
          recordsProcessed: 42,
          triggeredBy: 'schedule',
          signals: expect.arrayContaining([
            expect.objectContaining({
              name: 'CpuUsage',
              value: 52
            })
          ])
        })
      ])
    );
  });

  it('routes workflow domains from data layers into operational targets', () => {
    const recentJobs: JobRun[] = [
      {
        jobName: 'aca-job-backtests-bronze',
        jobType: 'data-ingest',
        status: 'success',
        startTime: '2026-04-18T14:32:00Z',
        triggeredBy: 'schedule'
      },
      {
        jobName: 'aca-job-ranking-bronze',
        jobType: 'data-ingest',
        status: 'success',
        startTime: '2026-04-18T14:31:00Z',
        triggeredBy: 'schedule'
      },
      {
        jobName: 'aca-job-regime-bronze',
        jobType: 'data-ingest',
        status: 'success',
        startTime: '2026-04-18T14:30:00Z',
        triggeredBy: 'schedule'
      }
    ];

    const targets = buildOperationalJobTargets({
      dataLayers: DATA_LAYERS_WITH_OPERATIONAL_WORKFLOWS,
      recentJobs
    });

    expect(targets).toEqual(
      expect.arrayContaining([
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
  });

  it('builds operational targets without domain ingestion jobs', () => {
    const recentJobs: JobRun[] = [
      {
        jobName: 'aca-job-market-bronze',
        jobType: 'data-ingest',
        status: 'success',
        startTime: '2026-04-18T14:30:00Z',
        triggeredBy: 'schedule'
      },
      {
        jobName: 'aca-job-backtest-runner',
        jobType: 'backtest',
        status: 'running',
        startTime: '2026-04-18T14:31:00Z',
        duration: 42,
        recordsProcessed: 1200,
        triggeredBy: 'manual'
      },
      {
        jobName: 'aca-job-ranking-materialize',
        jobType: 'data-ingest',
        status: 'success',
        startTime: '2026-04-18T14:28:00Z',
        triggeredBy: 'api'
      }
    ];
    const managedContainerJobs: ManagedContainerJob[] = [
      {
        name: 'aca-job-market-bronze',
        runningState: 'Succeeded',
        lastModifiedAt: '2026-04-18T14:30:00Z'
      },
      {
        name: 'aca-job-backtest-runner',
        runningState: 'Running',
        lastModifiedAt: '2026-04-18T14:31:00Z'
      },
      {
        name: 'aca-job-regime-refresh',
        runningState: 'Succeeded',
        lastModifiedAt: '2026-04-18T14:20:00Z'
      }
    ];

    const targets = buildOperationalJobTargets({
      dataLayers: DATA_LAYERS,
      recentJobs,
      managedContainerJobs,
      jobStates: {
        'aca-job-backtest-runner': 'Running'
      }
    });

    expect(targets.map((job) => job.name)).not.toContain('aca-job-market-bronze');
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'aca-job-backtest-runner',
          category: 'backtest',
          runningState: 'Running',
          recentStatus: 'running',
          recordsProcessed: 1200
        }),
        expect.objectContaining({
          name: 'aca-job-ranking-materialize',
          category: 'ranking'
        }),
        expect.objectContaining({
          name: 'aca-job-regime-refresh',
          category: 'regime'
        })
      ])
    );
  });

  it('uses the live running resource state over a stale terminal execution status', () => {
    const recentJobs: JobRun[] = [
      {
        jobName: 'aca-job-ranking-materialize',
        jobType: 'data-ingest',
        status: 'running',
        startTime: '2026-04-18T14:20:00Z',
        triggeredBy: 'manual'
      },
      {
        jobName: 'aca-job-ranking-materialize',
        jobType: 'data-ingest',
        status: 'failed',
        startTime: '2026-04-18T14:25:00Z',
        triggeredBy: 'manual'
      }
    ];
    const managedContainerJobs: ManagedContainerJob[] = [
      {
        name: 'aca-job-ranking-materialize',
        runningState: 'Running',
        lastModifiedAt: '2026-04-18T14:25:00Z'
      }
    ];

    const targets = buildOperationalJobTargets({
      dataLayers: DATA_LAYERS,
      recentJobs,
      managedContainerJobs,
      jobStates: {
        'aca-job-ranking-materialize': 'Running'
      }
    });

    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'aca-job-ranking-materialize',
          recentStatus: 'running',
          runningState: 'Running',
          startTime: '2026-04-18T14:25:00Z'
        })
      ])
    );
  });
});
