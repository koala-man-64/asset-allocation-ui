import type { ManagedContainerJob } from '@/features/system-status/types';
import {
  normalizeDomainKey,
  normalizeLayerKey
} from '@/features/system-status/components/SystemPurgeControls';
import { normalizeAzureJobName } from '@/features/system-status/lib/SystemStatusHelpers';
import type { JobStatusEntry } from '@/hooks/useJobStatuses';
import type { DataDomain, DataLayer, JobRun } from '@/types/strategy';

type CatalogLayerKey = 'bronze' | 'silver' | 'gold';

type DomainJobCatalogEntry = {
  layerKey: CatalogLayerKey;
  domainName: 'economic-catalyst' | 'quiver-data';
  description: string;
  type: DataDomain['type'];
  path: string;
  jobName: string;
  frequency: string;
  cron: string;
};

export const SYSTEM_STATUS_DOMAIN_JOB_CATALOG: readonly DomainJobCatalogEntry[] = [
  {
    layerKey: 'bronze',
    domainName: 'economic-catalyst',
    description: 'Raw economic catalyst source payloads',
    type: 'blob',
    path: 'economic-catalyst/runs',
    jobName: 'bronze-economic-catalyst-job',
    frequency: 'Weekdays, every 30 minutes',
    cron: '*/30 * * * 1-5'
  },
  {
    layerKey: 'bronze',
    domainName: 'quiver-data',
    description: 'Raw Quiver source payloads',
    type: 'blob',
    path: 'quiver-data/runs',
    jobName: 'bronze-quiver-data-job',
    frequency: 'Weekdays, hourly',
    cron: '0 * * * 1-5'
  },
  {
    layerKey: 'silver',
    domainName: 'economic-catalyst',
    description: 'Standardized economic catalyst event and headline tables',
    type: 'blob',
    path: 'economic-catalyst',
    jobName: 'silver-economic-catalyst-job',
    frequency: 'Manual trigger',
    cron: ''
  },
  {
    layerKey: 'silver',
    domainName: 'quiver-data',
    description: 'Standardized Quiver event datasets',
    type: 'blob',
    path: 'quiver-data',
    jobName: 'silver-quiver-data-job',
    frequency: 'Manual trigger',
    cron: ''
  },
  {
    layerKey: 'gold',
    domainName: 'economic-catalyst',
    description: 'Market-ready economic catalyst features',
    type: 'blob',
    path: 'economic-catalyst',
    jobName: 'gold-economic-catalyst-job',
    frequency: 'Manual trigger',
    cron: ''
  },
  {
    layerKey: 'gold',
    domainName: 'quiver-data',
    description: 'Market-ready Quiver signal features',
    type: 'blob',
    path: 'quiver',
    jobName: 'gold-quiver-data-job',
    frequency: 'Manual trigger',
    cron: ''
  }
] as const;

const CATALOG_BY_LAYER = SYSTEM_STATUS_DOMAIN_JOB_CATALOG.reduce((index, entry) => {
  const current = index.get(entry.layerKey) || [];
  current.push(entry);
  index.set(entry.layerKey, current);
  return index;
}, new Map<string, DomainJobCatalogEntry[]>());

const CATALOG_BY_JOB_KEY = new Map(
  SYSTEM_STATUS_DOMAIN_JOB_CATALOG.map((entry) => [normalizeAzureJobName(entry.jobName), entry])
);

function nonEmpty(value?: string | null): string {
  return String(value || '').trim();
}

function firstNonEmpty<T extends string | null | undefined>(current: T, fallback: string): string {
  const currentText = nonEmpty(current);
  return currentText || fallback;
}

function buildObservedCatalogJobIndex({
  recentJobs = [],
  managedContainerJobs = [],
  jobStatusesByKey
}: {
  recentJobs?: JobRun[];
  managedContainerJobs?: ManagedContainerJob[];
  jobStatusesByKey?: Map<string, JobStatusEntry>;
}): {
  observedKeys: Set<string>;
  jobUrlByKey: Map<string, string>;
} {
  const observedKeys = new Set<string>();
  const jobUrlByKey = new Map<string, string>();

  const addObservedKey = (value?: string | null) => {
    const key = normalizeAzureJobName(value);
    if (key && CATALOG_BY_JOB_KEY.has(key)) {
      observedKeys.add(key);
    }
    return key;
  };

  for (const run of recentJobs) {
    addObservedKey(run?.jobName);
  }

  for (const [key, entry] of jobStatusesByKey?.entries() || []) {
    addObservedKey(key);
    addObservedKey(entry.jobName);
    addObservedKey(entry.latestRun?.jobName);
  }

  for (const job of managedContainerJobs) {
    const key = addObservedKey(job?.name);
    const fallbackKey = key || addObservedKey(job?.azureId);
    const jobUrl = nonEmpty(job?.azureId);
    if (fallbackKey && jobUrl && !jobUrlByKey.has(fallbackKey)) {
      jobUrlByKey.set(fallbackKey, jobUrl);
    }
  }

  return { observedKeys, jobUrlByKey };
}

function mergeCatalogDomain(
  catalog: DomainJobCatalogEntry,
  existing: DataDomain | null,
  jobUrl?: string | null
): DataDomain {
  if (existing) {
    const next: DataDomain = {
      ...existing,
      path: firstNonEmpty(existing.path, catalog.path),
      jobName: firstNonEmpty(existing.jobName, catalog.jobName),
      frequency: firstNonEmpty(existing.frequency, catalog.frequency),
      cron: firstNonEmpty(existing.cron, catalog.cron)
    };
    const nextJobUrl = firstNonEmpty(existing.jobUrl, nonEmpty(jobUrl));
    if (nextJobUrl) {
      next.jobUrl = nextJobUrl;
    }
    if (!nonEmpty(existing.description)) {
      next.description = catalog.description;
    }
    return next;
  }

  return {
    name: catalog.domainName,
    description: catalog.description,
    type: catalog.type,
    path: catalog.path,
    lastUpdated: null,
    status: 'stale',
    jobName: catalog.jobName,
    jobUrl: nonEmpty(jobUrl) || null,
    frequency: catalog.frequency,
    cron: catalog.cron
  };
}

export function augmentDomainLayersWithCatalogJobs({
  dataLayers = [],
  recentJobs = [],
  managedContainerJobs = [],
  jobStatusesByKey
}: {
  dataLayers?: DataLayer[];
  recentJobs?: JobRun[];
  managedContainerJobs?: ManagedContainerJob[];
  jobStatusesByKey?: Map<string, JobStatusEntry>;
}): DataLayer[] {
  const { observedKeys, jobUrlByKey } = buildObservedCatalogJobIndex({
    recentJobs,
    managedContainerJobs,
    jobStatusesByKey
  });

  return dataLayers.map((layer) => {
    const layerKey = normalizeLayerKey(String(layer?.name || ''));
    const catalogEntries = CATALOG_BY_LAYER.get(layerKey);
    if (!catalogEntries?.length) {
      return layer;
    }

    let changed = false;
    const domains = [...(layer.domains || [])];
    const domainIndexByKey = new Map<string, number>();
    domains.forEach((domain, index) => {
      const domainKey = normalizeDomainKey(String(domain?.name || ''));
      if (domainKey && !domainIndexByKey.has(domainKey)) {
        domainIndexByKey.set(domainKey, index);
      }
    });

    for (const catalog of catalogEntries) {
      const domainKey = normalizeDomainKey(catalog.domainName);
      const jobKey = normalizeAzureJobName(catalog.jobName);
      const existingIndex = domainIndexByKey.get(domainKey);

      if (existingIndex !== undefined) {
        domains[existingIndex] = mergeCatalogDomain(
          catalog,
          domains[existingIndex],
          jobUrlByKey.get(jobKey)
        );
        changed = true;
        continue;
      }

      if (!observedKeys.has(jobKey)) {
        continue;
      }

      domains.push(mergeCatalogDomain(catalog, null, jobUrlByKey.get(jobKey)));
      domainIndexByKey.set(domainKey, domains.length - 1);
      changed = true;
    }

    return changed ? { ...layer, domains } : layer;
  });
}
