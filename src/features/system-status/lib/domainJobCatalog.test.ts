import { describe, expect, it } from 'vitest';

import type { ManagedContainerJob } from '@/features/system-status/types';
import {
  augmentDomainLayersWithCatalogJobs,
  SYSTEM_STATUS_DOMAIN_JOB_CATALOG
} from '@/features/system-status/lib/domainJobCatalog';
import type { DataLayer, JobRun } from '@/types/strategy';

const NOW = '2026-04-18T14:30:00Z';

function makeLayer(name: string, domains: DataLayer['domains'] = []): DataLayer {
  return {
    name,
    description: `${name} layer`,
    status: 'healthy',
    lastUpdated: NOW,
    refreshFrequency: 'Daily',
    domains
  };
}

function findDomain(layers: DataLayer[], layerName: string, domainName: string) {
  return layers
    .find((layer) => layer.name === layerName)
    ?.domains?.find((domain) => domain.name === domainName);
}

describe('system status domain job catalog', () => {
  it('does not inject catalog domains without observed job telemetry', () => {
    const layers = [makeLayer('Bronze'), makeLayer('Silver'), makeLayer('Gold')];

    const result = augmentDomainLayersWithCatalogJobs({ dataLayers: layers });

    expect(result).toEqual(layers);
  });

  it('injects observed economic catalyst and quiver jobs into existing medallion layers', () => {
    const recentJobs: JobRun[] = SYSTEM_STATUS_DOMAIN_JOB_CATALOG.map((job) => ({
      jobName: job.jobName,
      jobType: 'data-ingest',
      status: 'success',
      startTime: NOW,
      triggeredBy: 'azure'
    }));
    const managedContainerJobs: ManagedContainerJob[] = SYSTEM_STATUS_DOMAIN_JOB_CATALOG.map(
      (job) => ({
        name: job.jobName,
        azureId: `/subscriptions/sub-id/resourceGroups/rg-name/providers/Microsoft.App/jobs/${job.jobName}`,
        runningState: 'Succeeded',
        lastModifiedAt: NOW
      })
    );

    const result = augmentDomainLayersWithCatalogJobs({
      dataLayers: [makeLayer('Bronze'), makeLayer('Silver'), makeLayer('Gold')],
      recentJobs,
      managedContainerJobs
    });

    expect(findDomain(result, 'Bronze', 'economic-catalyst')).toEqual(
      expect.objectContaining({
        name: 'economic-catalyst',
        jobName: 'bronze-economic-catalyst-job',
        path: 'economic-catalyst/runs',
        status: 'stale',
        lastUpdated: null,
        jobUrl:
          '/subscriptions/sub-id/resourceGroups/rg-name/providers/Microsoft.App/jobs/bronze-economic-catalyst-job'
      })
    );
    expect(findDomain(result, 'Bronze', 'quiver-data')).toEqual(
      expect.objectContaining({
        name: 'quiver-data',
        jobName: 'bronze-quiver-data-job',
        path: 'quiver-data/runs',
        status: 'stale',
        lastUpdated: null
      })
    );
    expect(findDomain(result, 'Silver', 'economic-catalyst')?.jobName).toBe(
      'silver-economic-catalyst-job'
    );
    expect(findDomain(result, 'Silver', 'quiver-data')?.jobName).toBe('silver-quiver-data-job');
    expect(findDomain(result, 'Gold', 'economic-catalyst')?.jobName).toBe(
      'gold-economic-catalyst-job'
    );
    expect(findDomain(result, 'Gold', 'quiver-data')).toEqual(
      expect.objectContaining({
        jobName: 'gold-quiver-data-job',
        path: 'quiver'
      })
    );
  });

  it('preserves backend-provided domain metadata and fills only missing job wiring', () => {
    const result = augmentDomainLayersWithCatalogJobs({
      dataLayers: [
        makeLayer('Bronze', [
          {
            name: 'economic-catalyst',
            description: 'Backend description',
            type: 'delta',
            path: 'backend/economic-catalyst',
            lastUpdated: NOW,
            status: 'healthy',
            jobName: null,
            jobUrl: null,
            frequency: 'Backend schedule',
            cron: '5 * * * *'
          }
        ])
      ],
      managedContainerJobs: [
        {
          name: 'bronze-economic-catalyst-job',
          azureId:
            '/subscriptions/sub-id/resourceGroups/rg-name/providers/Microsoft.App/jobs/bronze-economic-catalyst-job',
          runningState: 'Succeeded',
          lastModifiedAt: NOW
        }
      ]
    });

    const domains = result[0].domains || [];
    const economicCatalystDomains = domains.filter((domain) => domain.name === 'economic-catalyst');

    expect(economicCatalystDomains).toHaveLength(1);
    expect(economicCatalystDomains[0]).toEqual(
      expect.objectContaining({
        description: 'Backend description',
        type: 'delta',
        path: 'backend/economic-catalyst',
        lastUpdated: NOW,
        status: 'healthy',
        frequency: 'Backend schedule',
        cron: '5 * * * *',
        jobName: 'bronze-economic-catalyst-job',
        jobUrl:
          '/subscriptions/sub-id/resourceGroups/rg-name/providers/Microsoft.App/jobs/bronze-economic-catalyst-job'
      })
    );
  });
});
