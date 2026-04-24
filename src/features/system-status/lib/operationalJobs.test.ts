import { describe, expect, it } from 'vitest';

import {
  buildDomainJobKeySet,
  buildOperationalJobTargets,
  classifyJobCategory
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

describe('operational job classification', () => {
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
    expect(classifyJobCategory({ jobName: 'aca-job-cache-maintenance', domainJobKeys })).toBe(
      'other-operational'
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
});
