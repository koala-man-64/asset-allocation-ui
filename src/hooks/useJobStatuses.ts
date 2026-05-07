import { useCallback, useMemo } from 'react';

import {
  buildLatestJobRunIndex,
  effectiveJobStatus,
  hasActiveJobRunningState,
  isSuspendedJobRunningState,
  normalizeAzureJobName,
  type NormalizedJobStatus
} from '@/features/system-status/lib/SystemStatusHelpers';
import {
  useSystemHealthJobOverrides,
  type SystemHealthJobOverride
} from '@/hooks/useSystemHealthJobOverrides';
import {
  useSystemStatusViewQuery,
  type UseSystemStatusViewQueryOptions
} from '@/hooks/useSystemStatusView';
import type { JobRun, ResourceHealth, SystemHealth } from '@/types/strategy';

export type JobStatusSource = 'override' | 'run' | 'resource' | 'unknown';

export interface JobStatusEntry {
  jobKey: string;
  jobName: string;
  status: NormalizedJobStatus;
  source: JobStatusSource;
  latestRun: JobRun | null;
  resource: ResourceHealth | null;
  runningState: string | null;
  startTime: string | null;
  isOverridden: boolean;
  override: SystemHealthJobOverride | null;
}

export interface UseJobStatusesResult {
  byKey: Map<string, JobStatusEntry>;
  list: JobStatusEntry[];
  systemHealth: SystemHealth | undefined;
  isFetching: boolean;
  isLoading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
}

function deriveSource(args: {
  isOverridden: boolean;
  latestRun: JobRun | null;
  resource: ResourceHealth | null;
  status: NormalizedJobStatus;
  runningState: string | null;
}): JobStatusSource {
  if (args.isOverridden) return 'override';
  if (
    hasActiveJobRunningState(args.runningState) ||
    isSuspendedJobRunningState(args.runningState)
  ) {
    return 'resource';
  }
  if (args.latestRun) return 'run';
  if (args.resource) return 'resource';
  return 'unknown';
}

export function useJobStatuses(
  options: UseSystemStatusViewQueryOptions = {}
): UseJobStatusesResult {
  const view = useSystemStatusViewQuery(options);
  const overrides = useSystemHealthJobOverrides();

  const systemHealth = view.data?.systemHealth;

  const result = useMemo<{
    byKey: Map<string, JobStatusEntry>;
    list: JobStatusEntry[];
  }>(() => {
    const byKey = new Map<string, JobStatusEntry>();
    if (!systemHealth) {
      return { byKey, list: [] };
    }

    const latestRunByKey = buildLatestJobRunIndex(systemHealth.recentJobs ?? []);

    const resourceByKey = new Map<string, ResourceHealth>();
    for (const resource of systemHealth.resources ?? []) {
      const key = normalizeAzureJobName(resource?.name);
      if (!key) continue;
      if (!resourceByKey.has(key)) {
        resourceByKey.set(key, resource);
      }
    }

    const overrideMap = overrides.data ?? {};
    const allKeys = new Set<string>();
    for (const key of latestRunByKey.keys()) allKeys.add(key);
    for (const key of resourceByKey.keys()) allKeys.add(key);
    for (const override of Object.values(overrideMap)) {
      if (override?.jobKey) allKeys.add(override.jobKey);
    }

    for (const key of allKeys) {
      const latestRun = latestRunByKey.get(key) ?? null;
      const resource = resourceByKey.get(key) ?? null;
      const override = overrideMap[key] ?? null;
      const isOverridden = Boolean(override);
      const runningState = resource?.runningState ?? null;
      const status = effectiveJobStatus(latestRun?.status, runningState);
      const jobName = latestRun?.jobName ?? resource?.name ?? override?.jobName ?? key;
      const startTime =
        latestRun?.startTime ?? resource?.lastModifiedAt ?? override?.startTime ?? null;

      byKey.set(key, {
        jobKey: key,
        jobName,
        status,
        source: deriveSource({ isOverridden, latestRun, resource, status, runningState }),
        latestRun,
        resource,
        runningState,
        startTime,
        isOverridden,
        override
      });
    }

    const list = Array.from(byKey.values()).sort((a, b) => a.jobKey.localeCompare(b.jobKey));
    return { byKey, list };
  }, [systemHealth, overrides.data]);

  const refresh = useCallback(async () => {
    await view.refresh();
  }, [view]);

  return {
    byKey: result.byKey,
    list: result.list,
    systemHealth,
    isFetching: view.isFetching,
    isLoading: view.isLoading,
    error: view.error,
    refresh
  };
}
