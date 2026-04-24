import React, { useCallback, useMemo, useState, lazy, Suspense } from 'react';
import {
  Activity,
  Layers3,
  RefreshCw,
  ShieldCheck,
  TriangleAlert
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/useDataQueries';
import { useSystemStatusViewQuery } from '@/hooks/useSystemStatusView';
import type {
  DomainMetadataSnapshotResponse,
  SystemStatusViewResponse
} from '@/services/apiService';
import { ErrorBoundary } from '@/app/components/common/ErrorBoundary';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageLoader } from '@/app/components/common/PageLoader';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import type { ManagedContainerJob } from '@/features/system-status/types';
import type { JobLogStreamTarget } from '@/features/system-status/components/JobLogStreamPanel';
import type { ResourceSignal } from '@/types/strategy';

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

import {
  buildAnchoredJobRunIndex,
  effectiveJobStatus,
  formatTimeAgo,
  getStatusConfig,
  normalizeAzureJobName,
  resolveManagedJobName
} from '@/features/system-status/lib/SystemStatusHelpers';
import { normalizeDomainKey } from '@/features/system-status/components/SystemPurgeControls';

type JobResourceSummary = {
  name: string;
  runningState?: string | null;
  lastModifiedAt?: string | null;
  signals?: ResourceSignal[] | null;
};

type SummaryTone = 'good' | 'watch' | 'risk' | 'neutral';

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getSummaryToneClasses(tone: SummaryTone): string {
  switch (tone) {
    case 'good':
      return 'border-mcm-teal/35 bg-mcm-paper/80 text-foreground';
    case 'watch':
      return 'border-mcm-mustard/60 bg-mcm-mustard/10 text-foreground';
    case 'risk':
      return 'border-destructive/55 bg-destructive/10 text-foreground shadow-[inset_4px_0_0_rgba(180,35,24,0.55)]';
    default:
      return 'border-mcm-walnut/14 bg-mcm-paper/62 text-foreground';
  }
}

function getSummaryBadgeVariant(
  tone: SummaryTone
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (tone) {
    case 'good':
      return 'default';
    case 'watch':
      return 'secondary';
    case 'risk':
      return 'destructive';
    default:
      return 'outline';
  }
}

function determineTone({
  overall,
  failedJobs,
  alertCount,
  stressedLayers
}: {
  overall: string;
  failedJobs: number;
  alertCount: number;
  stressedLayers: number;
}): SummaryTone {
  if (overall === 'critical' || failedJobs > 0) {
    return 'risk';
  }
  if (overall === 'degraded' || alertCount > 0 || stressedLayers > 0) {
    return 'watch';
  }
  if (overall === 'healthy') {
    return 'good';
  }
  return 'neutral';
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone?: SummaryTone;
}) {
  return (
    <div
      className={`rounded-[1.15rem] border px-4 py-4 ${getSummaryToneClasses(tone)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </div>
          <div className="font-display text-xl tracking-[0.04em] text-foreground">{value}</div>
        </div>
        <div className="rounded-full border border-mcm-walnut/12 bg-mcm-cream/55 p-2 text-mcm-walnut">
          {icon}
        </div>
      </div>
      <div className="mt-3 text-sm leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}

export function SystemStatusPage() {
  const {
    data,
    isLoading,
    error,
    isFetching,
    refresh: refreshSystemStatusView
  } = useSystemStatusViewQuery({
    autoRefresh: true
  });
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const systemStatusView = data;
  const systemHealth = systemStatusView?.systemHealth;
  const errorMessage = error instanceof Error ? error.message : 'No telemetry available';

  const displayDataLayers = useMemo(() => {
    return (systemHealth?.dataLayers || []).map((layer) => ({
      ...layer,
      domains: (layer.domains || []).filter((domain) => {
        const domainKey = normalizeDomainKey(String(domain?.name || ''));
        return domainKey !== 'platinum';
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
        runningState: resource.runningState || null,
        lastModifiedAt: resource.lastModifiedAt || null,
        signals: resource.signals || null
      });
    }
    return items;
  }, [jobResourcesByKey]);

  const anchoredJobRuns = useMemo(
    () => buildAnchoredJobRunIndex(systemHealth?.recentJobs || []),
    [systemHealth?.recentJobs]
  );

  const jobLogStreamJobs = useMemo<JobLogStreamTarget[]>(() => {
    type MutableJobTarget = Omit<
      JobLogStreamTarget,
      'runningState' | 'recentStatus' | 'startTime'
    > & {
      sortLayerName: string;
    };
    const items = new Map<string, MutableJobTarget>();

    for (const layer of displayDataLayers || []) {
      for (const domain of layer.domains || []) {
        const rawJobName = resolveManagedJobName({
          jobName: domain.jobName,
          jobUrl: domain.jobUrl,
          layerName: layer.name,
          domainName: domain.name
        });
        if (!rawJobName) continue;
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
      const rawJobName = String(resource.name || '').trim();
      if (!rawJobName) continue;
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

    for (const run of anchoredJobRuns.values()) {
      const rawJobName = String(run.jobName || '').trim();
      if (!rawJobName) continue;
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
        const latestRun = anchoredJobRuns.get(key);
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
  }, [anchoredJobRuns, displayDataLayers, jobResourcesByKey, jobStates]);

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

  if (error || !systemHealth) {
    return (
      <div className="p-6 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-mono">
        <h3 className="text-lg font-bold mb-2 uppercase">System Link Failure</h3>
        <p>{errorMessage}</p>
      </div>
    );
  }

  const { overall, recentJobs } = systemHealth;
  const headerRefreshLabel = systemStatusView?.generatedAt
    ? `Updated ${formatTimeAgo(systemStatusView.generatedAt)} ago`
    : 'Link established';
  const layerCount = displayDataLayers.length;
  const domainCount = displayDataLayers.reduce(
    (total, layer) => total + (layer.domains?.length || 0),
    0
  );
  const configuredDomainKeys = new Set<string>();
  for (const layer of displayDataLayers) {
    for (const domain of layer.domains || []) {
      const domainKey = normalizeDomainKey(String(domain?.name || ''));
      if (domainKey) {
        configuredDomainKeys.add(domainKey);
      }
    }
  }
  const configuredDomainCount = configuredDomainKeys.size;
  const alertCount = systemHealth.alerts?.length || 0;
  const stressedLayerCount = displayDataLayers.filter((layer) => {
    const status = String(layer.status || '')
      .trim()
      .toLowerCase();
    return status !== 'healthy' && status !== 'success';
  }).length;
  const runningJobCount = jobLogStreamJobs.filter(
    (job) => effectiveJobStatus(job.recentStatus, job.runningState) === 'running'
  ).length;
  const warningJobCount = jobLogStreamJobs.filter(
    (job) => effectiveJobStatus(job.recentStatus, job.runningState) === 'warning'
  ).length;
  const failedJobCount = jobLogStreamJobs.filter(
    (job) => effectiveJobStatus(job.recentStatus, job.runningState) === 'failed'
  ).length;
  const overallTone = determineTone({
    overall,
    failedJobs: failedJobCount,
    alertCount,
    stressedLayers: stressedLayerCount
  });
  const overallStatus = getStatusConfig(overall);
  const OverallIcon = overallStatus.icon;

  return (
    <div className="page-shell">
      <div className="page-header-row">
        <div className="page-header">
          <p className="page-kicker">System Status</p>
          <h1 className="page-title">Operations Command Deck</h1>
          <p className="page-subtitle">
            Live medallion coverage, job state, runtime controls, and console tails for the current
            operating session.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getSummaryBadgeVariant(overallTone)}>
            <OverallIcon
              className={`h-3.5 w-3.5 ${overallStatus.animation === 'spin' ? 'animate-spin' : ''}`}
            />
            {overall.toUpperCase()}
          </Badge>
          <Badge variant="outline">{isFetching ? 'Receiving telemetry' : headerRefreshLabel}</Badge>
          <Button
            className="gap-2"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing || isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing || isFetching ? 'animate-spin' : ''}`} />
            Refresh View
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <section className="mcm-panel overflow-hidden">
          <div className="border-b border-border/40 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                  Command Summary
                </p>
                <h2 className="font-display text-xl text-foreground">Risk Readout</h2>
                <p className="text-sm text-muted-foreground">
                  Scan failures, warnings, configured coverage, and open alerts before drilling into
                  the matrix.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Overall Status"
              value={overall.toUpperCase()}
              detail={
                overallTone === 'risk'
                  ? 'Do not treat green downstream cells as reliable until failures clear.'
                  : overallTone === 'watch'
                    ? 'Usable, but there is enough friction to keep this page open.'
                    : 'No blocking risk is visible in the current status view.'
              }
              icon={<OverallIcon className="h-5 w-5" />}
              tone={overallTone}
            />
            <SummaryCard
              label="Configured Coverage"
              value={`${domainCount} cells`}
              detail={`${pluralize(configuredDomainCount, 'domain')} mapped across ${pluralize(layerCount, 'layer')}; ${pluralize(stressedLayerCount, 'layer')} under watch.`}
              icon={<Layers3 className="h-5 w-5" />}
              tone={stressedLayerCount > 0 ? 'watch' : 'neutral'}
            />
            <SummaryCard
              label="Job Risk"
              value={`${failedJobCount} fail / ${warningJobCount} warn`}
              detail={
                failedJobCount > 0
                  ? `${pluralize(failedJobCount, 'failure')} visible across ${pluralize(jobLogStreamJobs.length, 'tracked job')}.`
                  : warningJobCount > 0
                    ? `${pluralize(warningJobCount, 'warning')} visible; ${pluralize(runningJobCount, 'job')} currently running.`
                    : `${pluralize(runningJobCount, 'job')} running; no failed jobs visible.`
              }
              icon={<Activity className="h-5 w-5" />}
              tone={failedJobCount > 0 ? 'risk' : warningJobCount > 0 ? 'watch' : 'neutral'}
            />
            <SummaryCard
              label="Open Alerts"
              value={String(alertCount)}
              detail={
                alertCount > 0
                  ? `${pluralize(alertCount, 'alert')} remain open across tracked system signals.`
                  : `${pluralize((systemHealth.resources || []).length, 'resource')} checked with no open alert.`
              }
              icon={
                alertCount > 0 ? (
                  <TriangleAlert className="h-5 w-5" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )
              }
              tone={alertCount > 0 ? 'watch' : 'good'}
            />
          </div>
        </section>

        {/* Domain Layer Coverage Comparison */}
        <ErrorBoundary>
          <Suspense fallback={<Skeleton className="h-[280px] w-full rounded-xl bg-muted/20" />}>
            <DomainLayerComparisonPanel
              overall={overall}
              dataLayers={displayDataLayers}
              recentJobs={recentJobs}
              jobStates={jobStates}
              managedContainerJobs={managedContainerJobs}
              metadataSnapshot={systemStatusView?.metadataSnapshot}
              metadataUpdatedAt={systemStatusView?.metadataSnapshot.updatedAt || null}
              metadataSource={systemStatusView?.sources.metadataSnapshot}
              onMetadataSnapshotChange={handleMetadataSnapshotChange}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              isFetching={isFetching}
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
            <JobLogStreamPanel jobs={jobLogStreamJobs} />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
