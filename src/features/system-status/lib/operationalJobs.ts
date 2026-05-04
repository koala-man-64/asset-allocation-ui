import type { ManagedContainerJob } from '@/features/system-status/types';
import type { JobStatusEntry } from '@/hooks/useJobStatuses';
import { isDomainLayerCoverageDomainVisible } from '@/features/system-status/lib/coverageDomains';
import {
  buildLatestJobRunIndex,
  effectiveJobStatus,
  normalizeAzureJobName,
  resolveRunnableJobName
} from '@/features/system-status/lib/SystemStatusHelpers';
import type { DataLayer, JobRun, ResourceSignal } from '@/types/strategy';

export const OPERATIONAL_JOB_CATEGORIES = [
  'backtest',
  'ranking',
  'regime',
  'intraday-monitoring',
  'results-reconciliation',
  'symbol-cleanup',
  'other-operational'
] as const;

export type OperationalJobCategory = (typeof OPERATIONAL_JOB_CATEGORIES)[number];
export type JobCategory = 'domain-data' | OperationalJobCategory;

export interface OperationalJobTarget {
  name: string;
  label: string;
  category: OperationalJobCategory;
  categoryLabel: string;
  jobType?: string | null;
  runningState?: string | null;
  recentStatus?: string | null;
  startTime?: string | null;
  duration?: number | null;
  recordsProcessed?: number | null;
  triggeredBy?: string | null;
  jobUrl?: string | null;
  signals?: ResourceSignal[] | null;
}

export const OPERATIONAL_JOB_CATEGORY_LABELS: Record<OperationalJobCategory, string> = {
  backtest: 'Backtests',
  ranking: 'Rankings',
  regime: 'Regime',
  'intraday-monitoring': 'Intraday Monitoring',
  'results-reconciliation': 'Results Reconciliation',
  'symbol-cleanup': 'Symbol Cleanup',
  'other-operational': 'Other Ops'
};

const CATEGORY_ORDER: Record<OperationalJobCategory, number> = {
  backtest: 0,
  ranking: 1,
  regime: 2,
  'intraday-monitoring': 3,
  'results-reconciliation': 4,
  'symbol-cleanup': 5,
  'other-operational': 6
};

export interface ExpectedOperationalJob {
  name: string;
  category: OperationalJobCategory;
}

export const EXPECTED_OPERATIONAL_JOBS = [
  {
    name: 'gold-regime-job',
    category: 'regime'
  },
  {
    name: 'intraday-monitor-job',
    category: 'intraday-monitoring'
  },
  {
    name: 'intraday-market-refresh-job',
    category: 'intraday-monitoring'
  },
  {
    name: 'platinum-rankings-job',
    category: 'ranking'
  },
  {
    name: 'results-reconcile-job',
    category: 'results-reconciliation'
  },
  {
    name: 'symbol-cleanup-job',
    category: 'symbol-cleanup'
  }
] as const satisfies readonly ExpectedOperationalJob[];

function toJobKey(value?: string | null): string {
  return (
    normalizeAzureJobName(value) ||
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

const EXPECTED_OPERATIONAL_JOB_CATEGORIES_BY_KEY = new Map(
  EXPECTED_OPERATIONAL_JOBS.map((job) => [toJobKey(job.name), job.category])
);

export function getExpectedOperationalJobCategory(
  jobName?: string | null
): OperationalJobCategory | null {
  const key = toJobKey(jobName);
  return key ? (EXPECTED_OPERATIONAL_JOB_CATEGORIES_BY_KEY.get(key) ?? null) : null;
}

export function isExpectedOperationalJobName(jobName?: string | null): boolean {
  return getExpectedOperationalJobCategory(jobName) !== null;
}

function normalizeClassifierText(value?: string | null): string {
  return toJobKey(value).replace(/[^a-z0-9]+/g, '-');
}

function hasJobType(jobType: string | null | undefined, expected: string): boolean {
  return (
    String(jobType || '')
      .trim()
      .toLowerCase() === expected
  );
}

export function buildDomainJobKeySet(dataLayers: DataLayer[] = []): Set<string> {
  const keys = new Set<string>();

  for (const layer of dataLayers) {
    for (const domain of layer.domains || []) {
      if (!isDomainLayerCoverageDomainVisible(domain?.name)) continue;
      const jobName = resolveRunnableJobName({
        jobName: domain.jobName,
        jobUrl: domain.jobUrl
      });
      const key = toJobKey(jobName);
      if (EXPECTED_OPERATIONAL_JOB_CATEGORIES_BY_KEY.has(key)) continue;
      if (key) {
        keys.add(key);
      }
    }
  }

  return keys;
}

export function classifyJobCategory(input: {
  jobName?: string | null;
  jobType?: string | null;
  domainJobKeys?: Set<string>;
}): JobCategory {
  const key = toJobKey(input.jobName);
  const expectedCategory = EXPECTED_OPERATIONAL_JOB_CATEGORIES_BY_KEY.get(key);
  if (expectedCategory) {
    return expectedCategory;
  }

  if (key && input.domainJobKeys?.has(key)) {
    return 'domain-data';
  }

  if (hasJobType(input.jobType, 'backtest')) {
    return 'backtest';
  }

  const text = normalizeClassifierText(input.jobName);

  if (/(^|-)backtests?(-|$)/.test(text) || text.includes('strategy-backtest')) {
    return 'backtest';
  }

  if (/(^|-)rankings?(-|$)/.test(text) || text.includes('ranking') || text.includes('materializ')) {
    return 'ranking';
  }

  if (/(^|-)regimes?(-|$)/.test(text) || text.includes('regime-model')) {
    return 'regime';
  }

  if (/(^|-)intraday(-|$)/.test(text) || text.includes('market-refresh')) {
    return 'intraday-monitoring';
  }

  if (text.includes('results-reconcile') || text.includes('reconciliation')) {
    return 'results-reconciliation';
  }

  if (text.includes('symbol-cleanup') || (text.includes('symbol') && text.includes('cleanup'))) {
    return 'symbol-cleanup';
  }

  return 'other-operational';
}

function buildOperationalJobUrlIndex(
  dataLayers: DataLayer[] = [],
  domainJobKeys: Set<string>
): Map<string, string> {
  const urls = new Map<string, string>();

  for (const layer of dataLayers) {
    for (const domain of layer.domains || []) {
      const jobName = resolveRunnableJobName({
        jobName: domain.jobName,
        jobUrl: domain.jobUrl
      });
      const key = toJobKey(jobName);
      const jobUrl = String(domain.jobUrl || '').trim();
      if (!key || !jobUrl || urls.has(key)) continue;

      const category = classifyJobCategory({
        jobName,
        domainJobKeys
      });
      if (category === 'domain-data') continue;

      urls.set(key, jobUrl);
    }
  }

  return urls;
}

function applyRunFields(target: OperationalJobTarget, run?: JobRun | null): OperationalJobTarget {
  if (!run) {
    return target;
  }

  return {
    ...target,
    jobType: run.jobType || target.jobType || null,
    recentStatus: run.status || target.recentStatus || null,
    startTime: run.startTime || target.startTime || null,
    duration: run.duration ?? target.duration ?? null,
    recordsProcessed: run.recordsProcessed ?? target.recordsProcessed ?? null,
    triggeredBy: run.triggeredBy || target.triggeredBy || null
  };
}

function buildLabel(name: string, category: OperationalJobCategory, run?: JobRun | null): string {
  const source = run?.jobType ? String(run.jobType).replaceAll('-', ' ') : null;
  return source ? `${OPERATIONAL_JOB_CATEGORY_LABELS[category]} / ${source} / ${name}` : name;
}

function statusRank(job: OperationalJobTarget): number {
  const status = effectiveJobStatus(job.recentStatus, job.runningState);
  if (status === 'running') return 0;
  if (status === 'failed') return 1;
  if (status === 'warning') return 2;
  if (status === 'pending') return 3;
  return 4;
}

function timestampRank(value?: string | null): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function buildConfiguredJobTarget(
  job: ExpectedOperationalJob,
  jobUrl?: string | null
): OperationalJobTarget {
  return {
    name: job.name,
    label: job.name,
    category: job.category,
    categoryLabel: OPERATIONAL_JOB_CATEGORY_LABELS[job.category],
    jobType: null,
    runningState: null,
    recentStatus: null,
    startTime: null,
    duration: null,
    recordsProcessed: null,
    triggeredBy: null,
    jobUrl: jobUrl || null,
    signals: null
  };
}

export function sortOperationalJobs(jobs: OperationalJobTarget[]): OperationalJobTarget[] {
  return [...jobs].sort((left, right) => {
    const statusDiff = statusRank(left) - statusRank(right);
    if (statusDiff !== 0) return statusDiff;

    const timeDiff = timestampRank(right.startTime) - timestampRank(left.startTime);
    if (timeDiff !== 0) return timeDiff;

    const categoryDiff = CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category];
    if (categoryDiff !== 0) return categoryDiff;

    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  });
}

export function buildOperationalJobTargets({
  dataLayers = [],
  recentJobs = [],
  managedContainerJobs = [],
  jobStates = {},
  jobStatusesByKey
}: {
  dataLayers?: DataLayer[];
  recentJobs?: JobRun[];
  managedContainerJobs?: ManagedContainerJob[];
  jobStates?: Record<string, string>;
  jobStatusesByKey?: Map<string, JobStatusEntry>;
}): OperationalJobTarget[] {
  const domainJobKeys = buildDomainJobKeySet(dataLayers);
  const operationalJobUrlsByKey = buildOperationalJobUrlIndex(dataLayers, domainJobKeys);
  const runByKey =
    jobStatusesByKey ??
    new Map(
      Array.from(buildLatestJobRunIndex(recentJobs)).map(([key, run]) => [
        key,
        {
          latestRun: run,
          runningState: jobStates[key] || null,
          status: effectiveJobStatus(run.status, jobStates[key])
        } as JobStatusEntry
      ])
    );
  const targets = new Map<string, OperationalJobTarget>();

  for (const job of EXPECTED_OPERATIONAL_JOBS) {
    const key = toJobKey(job.name);
    if (key) {
      targets.set(key, buildConfiguredJobTarget(job, operationalJobUrlsByKey.get(key)));
    }
  }

  for (const resource of managedContainerJobs) {
    const name = String(resource.name || '').trim();
    const key = toJobKey(name);
    if (!name || !key) continue;

    const statusEntry = runByKey.get(key) ?? null;
    const run = statusEntry?.latestRun ?? null;
    const category = classifyJobCategory({
      jobName: name,
      jobType: run?.jobType,
      domainJobKeys
    });
    if (category === 'domain-data') continue;
    const existing = targets.get(key);

    targets.set(key, {
      name,
      label: buildLabel(name, category, run),
      category,
      categoryLabel: OPERATIONAL_JOB_CATEGORY_LABELS[category],
      jobType: run?.jobType ?? null,
      runningState: statusEntry?.runningState || jobStates[key] || resource.runningState || null,
      recentStatus: statusEntry?.status ?? run?.status ?? null,
      startTime: run?.startTime || resource.lastModifiedAt || null,
      duration: run?.duration ?? null,
      recordsProcessed: run?.recordsProcessed ?? null,
      triggeredBy: run?.triggeredBy ?? null,
      jobUrl: resource.azureId || existing?.jobUrl || operationalJobUrlsByKey.get(key) || null,
      signals: resource.signals || null
    });
  }

  for (const [key, statusEntry] of runByKey.entries()) {
    const run = statusEntry.latestRun;
    if (!run) continue;
    const name = String(run.jobName || '').trim();
    if (!name || !key) continue;

    const category = classifyJobCategory({
      jobName: name,
      jobType: run.jobType,
      domainJobKeys
    });
    if (category === 'domain-data') continue;

    const existing = targets.get(key);
    if (existing) {
      targets.set(key, {
        ...applyRunFields(existing, run),
        label: buildLabel(existing.name, category, run),
        category,
        categoryLabel: OPERATIONAL_JOB_CATEGORY_LABELS[category],
        runningState: statusEntry.runningState || jobStates[key] || existing.runningState || null,
        recentStatus: statusEntry.status ?? run.status ?? existing.recentStatus ?? null
      });
      continue;
    }

    targets.set(key, {
      name,
      label: buildLabel(name, category, run),
      category,
      categoryLabel: OPERATIONAL_JOB_CATEGORY_LABELS[category],
      jobType: run.jobType || null,
      runningState: statusEntry.runningState || jobStates[key] || null,
      recentStatus: statusEntry.status ?? run.status ?? null,
      startTime: run.startTime || null,
      duration: run.duration ?? null,
      recordsProcessed: run.recordsProcessed ?? null,
      triggeredBy: run.triggeredBy || null,
      jobUrl: operationalJobUrlsByKey.get(key) || null,
      signals: null
    });
  }

  return sortOperationalJobs(Array.from(targets.values()));
}
