import type { JobRun, ResourceHealth, SystemHealth } from '@/types/strategy';
import {
  hasActiveJobRunningState,
  normalizeAzureJobName,
  normalizeJobStatus
} from '@/features/system-status/lib/SystemStatusHelpers';

const TERMINAL_STATUSES = new Set<JobRun['status']>(['success', 'warning', 'failed']);

const epoch = (raw?: string | null): number => {
  const value = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
};

const jobIdentity = (job: JobRun): string => {
  const jobKey = normalizeAzureJobName(job.jobName) || String(job.jobName || '').trim();
  const exec = job.executionId ?? job.executionName;
  if (exec) {
    return `${jobKey}::${exec}`;
  }
  return `${jobKey}::${job.startTime ?? ''}`;
};

const isTerminal = (status: JobRun['status'] | undefined | null): boolean =>
  Boolean(status) && TERMINAL_STATUSES.has(status as JobRun['status']);

const isTerminalResourceState = (state?: string | null): boolean => {
  const normalized = normalizeJobStatus(state);
  return normalized === 'success' || normalized === 'warning' || normalized === 'failed';
};

function reconcileJobRun(incoming: JobRun, previous: JobRun | undefined): JobRun {
  if (!previous) return incoming;

  const incomingEpoch = epoch(incoming.startTime);
  const previousEpoch = epoch(previous.startTime);

  if (Number.isFinite(previousEpoch) && previousEpoch > incomingEpoch) {
    return previous;
  }

  if (isTerminal(previous.status) && !isTerminal(incoming.status)) {
    return previous;
  }

  return incoming;
}

function reconcileResource(
  incoming: ResourceHealth,
  previous: ResourceHealth | undefined
): ResourceHealth {
  if (!previous) return incoming;

  const incomingEpoch = epoch(incoming.lastModifiedAt);
  const previousEpoch = epoch(previous.lastModifiedAt);

  if (Number.isFinite(previousEpoch) && previousEpoch > incomingEpoch) {
    return previous;
  }

  if (
    isTerminalResourceState(previous.runningState) &&
    hasActiveJobRunningState(incoming.runningState)
  ) {
    return previous;
  }

  return incoming;
}

export interface MonotonicityGuardOptions {
  disabled?: boolean;
}

export function applyJobRunMonotonicityGuard(
  incoming: SystemHealth | undefined,
  previous: SystemHealth | undefined,
  options: MonotonicityGuardOptions = {}
): SystemHealth | undefined {
  if (!incoming) return incoming;
  if (options.disabled) return incoming;
  if (!previous) return incoming;

  const previousJobsByIdentity = new Map<string, JobRun>();
  for (const job of previous.recentJobs ?? []) {
    if (!job) continue;
    previousJobsByIdentity.set(jobIdentity(job), job);
  }

  const reconciledJobs = (incoming.recentJobs ?? []).map((job) => {
    const previousJob = previousJobsByIdentity.get(jobIdentity(job));
    return reconcileJobRun(job, previousJob);
  });

  const previousResourcesByName = new Map<string, ResourceHealth>();
  for (const resource of previous.resources ?? []) {
    if (!resource?.name) continue;
    previousResourcesByName.set(resource.name, resource);
  }

  const reconciledResources = (incoming.resources ?? []).map((resource) => {
    const previousResource = previousResourcesByName.get(resource?.name ?? '');
    return reconcileResource(resource, previousResource);
  });

  return {
    ...incoming,
    recentJobs: reconciledJobs,
    resources: reconciledResources
  };
}

export function isMonotonicityGuardDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('disableJobMonotonicityGuard') === '1';
  } catch {
    return false;
  }
}
