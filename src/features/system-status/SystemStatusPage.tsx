import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { queryKeys } from '@/hooks/useDataQueries';
import { useJobStatuses } from '@/hooks/useJobStatuses';
import { useSystemStatusViewQuery } from '@/hooks/useSystemStatusView';
import type {
  DomainMetadataSnapshotResponse,
  SystemStatusViewResponse
} from '@/services/apiService';
import { ErrorBoundary } from '@/app/components/common/ErrorBoundary';
import { Alert, AlertDescription, AlertTitle } from '@/app/components/ui/alert';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageLoader } from '@/app/components/common/PageLoader';
import { addRealtimeStatusListener, type RealtimeStatusDetail } from '@/services/realtimeBus';
import type { ManagedContainerJob } from '@/features/system-status/types';
import type { JobLogStreamTarget } from '@/features/system-status/components/JobLogStreamPanel';
import type {
  JobCategory,
  JobMetadataSource,
  JobMetadataStatus,
  JobRun,
  ResourceSignal
} from '@/types/strategy';

// Lazy load components to reduce initial bundle size of the page
const DomainLayerComparisonPanel = lazy(() =>
  import('@/features/system-status/domain-layer-comparison/DomainLayerComparisonPanel').then(
    (m) => ({
      default: m.DomainLayerComparisonPanel
    })
  )
);
const ContainerAppsPanel = lazy(() =>
  import('@/features/system-status/components/ContainerAppsPanel').then((m) => ({
    default: m.ContainerAppsPanel
  }))
);
const JobLogStreamPanel = lazy(() =>
  import('@/features/system-status/components/JobLogStreamPanel').then((m) => ({
    default: m.JobLogStreamPanel
  }))
);
const OperationalJobMonitorPanel = lazy(() =>
  import('@/features/system-status/components/OperationalJobMonitorPanel').then((m) => ({
    default: m.OperationalJobMonitorPanel
  }))
);

import {
  effectiveJobStatus,
  normalizeAzureJobName,
  resolveRunnableJobName
} from '@/features/system-status/lib/SystemStatusHelpers';
import {
  buildDomainJobKeySet,
  buildOperationalJobTargets,
  isExpectedOperationalJobName,
  type OperationalJobTarget
} from '@/features/system-status/lib/operationalJobs';
import { isDomainLayerCoverageDomainVisible } from '@/features/system-status/lib/coverageDomains';
import { normalizeDomainKey } from '@/features/system-status/components/SystemPurgeControls';
import { JobStatusDebugOverlay } from '@/features/system-status/components/JobStatusDebugOverlay';

type JobResourceSummary = {
  name: string;
  azureId?: string | null;
  jobCategory?: JobCategory | null;
  jobKey?: string | null;
  jobRole?: string | null;
  triggerOwner?: string | null;
  metadataSource?: JobMetadataSource | null;
  metadataStatus?: JobMetadataStatus | null;
  metadataErrors?: string[] | null;
  runningState?: string | null;
  lastModifiedAt?: string | null;
  signals?: ResourceSignal[] | null;
};

const JOB_CATEGORY_LABELS = new Map<JobCategory, string>([
  ['data-pipeline', 'Data Pipelines'],
  ['strategy-compute', 'Strategy Compute'],
  ['operational-support', 'Operational Support']
]);

function buildOperationalJobConsoleTargets(
  operationalJobs: OperationalJobTarget[]
): JobLogStreamTarget[] {
  return operationalJobs.map((job) => ({
    name: job.name,
    label: job.label,
    layerName: null,
    domainName: job.categoryLabel,
    jobUrl: job.jobUrl || null,
    runningState: job.runningState || null,
    recentStatus: job.recentStatus || null,
    startTime: job.startTime || null,
    signals: job.signals || null
  }));
}

export function SystemStatusPage() {
  const {
    data,
    isLoading,
    error,
    isFetching,
    statusMeta,
    refresh: refreshSystemStatusView
  } = useSystemStatusViewQuery({
    autoRefresh: true
  });
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatusDetail | null>(null);
  const systemStatusView = data;
  const systemHealth = systemStatusView?.systemHealth;
  const jobStatuses = useJobStatuses({ autoRefresh: false });
  const jobStatusesByKey = jobStatuses.byKey;
  const errorMessage = error instanceof Error ? error.message : 'No telemetry available';

  useEffect(() => addRealtimeStatusListener(setRealtimeStatus), []);

  const displayDataLayers = useMemo(() => {
    return (systemHealth?.dataLayers || []).map((layer) => ({
      ...layer,
      domains: (layer.domains || []).filter((domain) => {
        const domainKey = normalizeDomainKey(String(domain?.name || ''));
        return domainKey !== 'platinum' && isDomainLayerCoverageDomainVisible(domainKey);
      })
    }));
  }, [systemHealth]);

  const jobResourcesByKey = useMemo(() => {
    const resources = new Map<string, JobResourceSummary>();
    for (const resource of systemHealth?.resources || []) {
      if (resource.resourceType !== 'Microsoft.App/jobs') continue;
      const rawName = String(resource.name || '').trim();
      if (!rawName) continue;
      const jobKey = normalizeAzureJobName(rawName) || rawName.toLowerCase();
      if (resources.has(jobKey)) continue;
      resources.set(jobKey, {
        name: rawName,
        azureId: resource.azureId || null,
        jobCategory: resource.jobCategory || null,
        jobKey: resource.jobKey || null,
        jobRole: resource.jobRole || null,
        triggerOwner: resource.triggerOwner || null,
        metadataSource: resource.metadataSource || null,
        metadataStatus: resource.metadataStatus || null,
        metadataErrors: resource.metadataErrors || null,
        runningState: resource.runningState || null,
        lastModifiedAt: resource.lastModifiedAt || null,
        signals: resource.signals || null
      });
    }
    return resources;
  }, [systemHealth?.resources]);

  const jobStates = useMemo(() => {
    const states: Record<string, string> = {};
    for (const [jobKey, resource] of jobResourcesByKey.entries()) {
      const runningState = String(resource.runningState || '').trim();
      if (runningState) {
        states[jobKey] = runningState;
      }
    }
    return states;
  }, [jobResourcesByKey]);

  const managedContainerJobs = useMemo<ManagedContainerJob[]>(() => {
    const items: ManagedContainerJob[] = [];
    for (const resource of jobResourcesByKey.values()) {
      items.push({
        name: resource.name,
        azureId: resource.azureId || null,
        jobCategory: resource.jobCategory || null,
        jobKey: resource.jobKey || null,
        jobRole: resource.jobRole || null,
        triggerOwner: resource.triggerOwner || null,
        metadataSource: resource.metadataSource || null,
        metadataStatus: resource.metadataStatus || null,
        metadataErrors: resource.metadataErrors || null,
        runningState: resource.runningState || null,
        lastModifiedAt: resource.lastModifiedAt || null,
        signals: resource.signals || null
      });
    }
    return items;
  }, [jobResourcesByKey]);

  const domainManagedContainerJobs = useMemo(() => {
    const domainJobKeys = buildDomainJobKeySet(displayDataLayers);
    return managedContainerJobs.filter((job) => {
      const key =
        normalizeAzureJobName(job.name) ||
        String(job.name || '')
          .trim()
          .toLowerCase();
      return key ? domainJobKeys.has(key) : false;
    });
  }, [displayDataLayers, managedContainerJobs]);

  const latestJobRuns = useMemo(() => {
    const index = new Map<string, JobRun>();
    for (const entry of jobStatusesByKey.values()) {
      if (entry.latestRun) {
        index.set(entry.jobKey, entry.latestRun);
      }
    }
    return index;
  }, [jobStatusesByKey]);

  const domainJobLogStreamJobs = useMemo<JobLogStreamTarget[]>(() => {
    type MutableJobTarget = Omit<
      JobLogStreamTarget,
      'runningState' | 'recentStatus' | 'startTime'
    > & {
      sortLayerName: string;
    };
    const items = new Map<string, MutableJobTarget>();

    for (const layer of displayDataLayers || []) {
      for (const domain of layer.domains || []) {
        const rawJobName = resolveRunnableJobName({
          jobName: domain.jobName,
          jobUrl: domain.jobUrl
        });
        if (!rawJobName) continue;
        if (isExpectedOperationalJobName(rawJobName)) continue;
        const key = normalizeAzureJobName(rawJobName) || rawJobName.toLowerCase();
        if (items.has(key)) continue;
        items.set(key, {
          name: rawJobName,
          label: `${layer.name} / ${domain.name} / ${rawJobName}`,
          layerName: layer.name,
          domainName: domain.name,
          jobUrl: domain.jobUrl || null,
          sortLayerName: layer.name
        });
      }
    }

    for (const resource of jobResourcesByKey.values()) {
      const hasStructuredMetadata = Boolean(
        resource.jobCategory ||
        resource.jobKey ||
        resource.jobRole ||
        resource.metadataSource ||
        resource.metadataStatus ||
        resource.metadataErrors?.length
      );
      if (!hasStructuredMetadata) continue;
      const rawJobName = String(resource.name || '').trim();
      if (!rawJobName) continue;
      if (isExpectedOperationalJobName(rawJobName)) continue;
      const key = normalizeAzureJobName(rawJobName) || rawJobName.toLowerCase();
      if (items.has(key)) continue;
      const metadataLabel = [
        resource.jobCategory ? JOB_CATEGORY_LABELS.get(resource.jobCategory) : '',
        resource.jobKey,
        resource.jobRole
      ]
        .filter(Boolean)
        .join(' / ');
      items.set(key, {
        name: rawJobName,
        label: metadataLabel ? `${rawJobName} - ${metadataLabel}` : rawJobName,
        layerName: null,
        domainName: null,
        jobUrl: null,
        sortLayerName: ''
      });
    }

    for (const run of latestJobRuns.values()) {
      const hasStructuredMetadata = Boolean(
        run.jobCategory ||
        run.jobKey ||
        run.jobRole ||
        run.metadataSource ||
        run.metadataStatus ||
        run.metadataErrors?.length
      );
      if (!hasStructuredMetadata) continue;
      const rawJobName = String(run.jobName || '').trim();
      if (!rawJobName) continue;
      if (isExpectedOperationalJobName(rawJobName)) continue;
      const key = normalizeAzureJobName(rawJobName) || rawJobName.toLowerCase();
      if (items.has(key)) continue;
      items.set(key, {
        name: rawJobName,
        label: rawJobName,
        layerName: null,
        domainName: null,
        jobUrl: null,
        sortLayerName: ''
      });
    }

    return Array.from(items.entries())
      .map(([key, item]) => {
        const latestRun = latestJobRuns.get(key);
        const jobResource = jobResourcesByKey.get(key);
        return {
          ...item,
          runningState: jobStates[key] || null,
          recentStatus: latestRun?.status || null,
          startTime: latestRun?.startTime || null,
          signals: jobResource?.signals || null
        };
      })
      .sort((left, right) => {
        const leftRunning =
          effectiveJobStatus(left.recentStatus, left.runningState) === 'running' ? 1 : 0;
        const rightRunning =
          effectiveJobStatus(right.recentStatus, right.runningState) === 'running' ? 1 : 0;
        if (leftRunning !== rightRunning) {
          return rightRunning - leftRunning;
        }

        const leftStart = left.startTime ? Date.parse(left.startTime) : Number.NEGATIVE_INFINITY;
        const rightStart = right.startTime ? Date.parse(right.startTime) : Number.NEGATIVE_INFINITY;
        if (leftStart !== rightStart) {
          return rightStart - leftStart;
        }

        if (left.sortLayerName !== right.sortLayerName) {
          return left.sortLayerName.localeCompare(right.sortLayerName);
        }

        return left.label.localeCompare(right.label);
      })
      .map(({ sortLayerName: _sortLayerName, ...item }) => item);
  }, [latestJobRuns, displayDataLayers, jobResourcesByKey, jobStates]);

  const operationalJobs = useMemo(
    () =>
      buildOperationalJobTargets({
        dataLayers: displayDataLayers,
        recentJobs: systemHealth?.recentJobs || [],
        managedContainerJobs,
        jobStates,
        jobStatusesByKey
      }),
    [displayDataLayers, jobStates, jobStatusesByKey, managedContainerJobs, systemHealth?.recentJobs]
  );

  const jobConsoleStreamJobs = useMemo(
    () => [...domainJobLogStreamJobs, ...buildOperationalJobConsoleTargets(operationalJobs)],
    [domainJobLogStreamJobs, operationalJobs]
  );

  const handleMetadataSnapshotChange = useCallback(
    (
      updater: (
        previous: DomainMetadataSnapshotResponse | undefined
      ) => DomainMetadataSnapshotResponse | undefined
    ) => {
      queryClient.setQueryData<SystemStatusViewResponse | undefined>(
        queryKeys.systemStatusView(),
        (current) => {
          if (!current) return current;
          const nextMetadataSnapshot = updater(current.metadataSnapshot);
          if (!nextMetadataSnapshot) return current;
          return {
            ...current,
            metadataSnapshot: nextMetadataSnapshot
          };
        }
      );
      queryClient.setQueryData(queryKeys.domainMetadataSnapshot('all', 'all'), updater);
    },
    [queryClient]
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshSystemStatusView();
    } catch (err) {
      console.error('[SystemStatusPage] refresh failed', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return <PageLoader text="Initializing System Link..." />;
  }

  if (!systemHealth) {
    return (
      <div className="p-6 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-mono">
        <h3 className="text-lg font-bold mb-2 uppercase">System Link Failure</h3>
        <p>{errorMessage}</p>
      </div>
    );
  }

  const { overall, recentJobs } = systemHealth;

  return (
    <div className="page-shell">
      <div className="page-header-row">
        <div className="page-header">
          <p className="page-kicker">System Status</p>
          <h1 className="page-title">Operations Command Deck</h1>
        </div>
      </div>

      <div className="space-y-6">
        {statusMeta?.status === 'fallback' ? (
          <Alert className="border-mcm-mustard/60 bg-mcm-mustard/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Status view degraded</AlertTitle>
            <AlertDescription className="break-words">
              The unified status view did not refresh cleanly, so this page is using the
              health/metadata fallback endpoints.
              {statusMeta.message ? ` Last error: ${statusMeta.message}` : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {statusMeta?.status === 'error' ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Last refresh failed</AlertTitle>
            <AlertDescription className="break-words">
              Showing the last cached status view because the latest refresh failed.
              {statusMeta.message ? ` Last error: ${statusMeta.message}` : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {realtimeStatus?.status === 'reconnecting' || realtimeStatus?.status === 'unavailable' ? (
          <Alert className="border-mcm-mustard/60 bg-mcm-mustard/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Realtime updates degraded</AlertTitle>
            <AlertDescription className="break-words">
              {realtimeStatus.message ||
                'Realtime updates are unavailable; polling and manual refresh remain active.'}
            </AlertDescription>
          </Alert>
        ) : null}

        <ErrorBoundary>
          <Suspense fallback={<Skeleton className="h-[360px] w-full rounded-xl bg-muted/20" />}>
            <OperationalJobMonitorPanel
              jobs={operationalJobs}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              isFetching={isFetching}
            />
          </Suspense>
        </ErrorBoundary>

        {/* Domain Layer Coverage Comparison */}
        <ErrorBoundary>
          <Suspense fallback={<Skeleton className="h-[280px] w-full rounded-xl bg-muted/20" />}>
            <DomainLayerComparisonPanel
              overall={overall}
              dataLayers={displayDataLayers}
              recentJobs={recentJobs}
              jobStates={jobStates}
              managedContainerJobs={domainManagedContainerJobs}
              metadataSnapshot={systemStatusView?.metadataSnapshot}
              metadataUpdatedAt={systemStatusView?.metadataSnapshot.updatedAt || null}
              metadataSource={systemStatusView?.sources.metadataSnapshot}
              onMetadataSnapshotChange={handleMetadataSnapshotChange}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              isFetching={isFetching}
              autoRefreshStaleMetadata
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      <div className="grid gap-6">
        <ErrorBoundary>
          <Suspense fallback={<Skeleton className="h-[220px] w-full rounded-xl bg-muted/20" />}>
            <ContainerAppsPanel />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary>
          <Suspense fallback={<Skeleton className="h-[260px] w-full rounded-xl bg-muted/20" />}>
            <JobLogStreamPanel jobs={jobConsoleStreamJobs} />
          </Suspense>
        </ErrorBoundary>
      </div>
      <JobStatusDebugOverlay />
    </div>
  );
}
