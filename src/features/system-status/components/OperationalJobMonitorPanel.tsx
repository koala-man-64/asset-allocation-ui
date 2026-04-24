import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ExternalLink,
  History,
  Layers3,
  Loader2,
  Orbit,
  Play,
  RefreshCw,
  ScrollText,
  Square,
  TestTubeDiagonal,
  Workflow
} from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import { cn } from '@/app/components/ui/utils';
import { JobLogStreamPanel } from '@/features/system-status/components/JobLogStreamPanel';
import {
  effectiveJobStatus,
  formatDuration,
  formatRecordCount,
  formatTimeAgo,
  formatTimestamp,
  getAzureJobExecutionsUrl,
  getStatusBadge,
  getStatusIcon
} from '@/features/system-status/lib/SystemStatusHelpers';
import {
  OPERATIONAL_JOB_CATEGORIES,
  OPERATIONAL_JOB_CATEGORY_LABELS,
  type OperationalJobCategory,
  type OperationalJobTarget
} from '@/features/system-status/lib/operationalJobs';
import { useJobSuspend } from '@/hooks/useJobSuspend';
import { useJobTrigger } from '@/hooks/useJobTrigger';
import { useRunList } from '@/services/backtestHooks';
import type { RunRecordResponse, RunStatus } from '@/services/backtestApi';

type CategoryFilter = 'all' | OperationalJobCategory;

const CATEGORY_ICON: Record<OperationalJobCategory, typeof Activity> = {
  backtest: TestTubeDiagonal,
  ranking: Layers3,
  regime: Orbit,
  'other-operational': Workflow
};

const CATEGORY_TONE: Record<OperationalJobCategory, string> = {
  backtest: 'border-mcm-teal/45 bg-mcm-teal/10 text-mcm-teal',
  ranking: 'border-mcm-mustard/55 bg-mcm-mustard/14 text-mcm-walnut',
  regime: 'border-mcm-olive/45 bg-mcm-olive/10 text-mcm-olive',
  'other-operational': 'border-mcm-walnut/25 bg-mcm-paper text-mcm-walnut'
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatOptionalTimestamp(value?: string | null): string {
  if (!value) return '-';
  return `${formatTimestamp(value)} ago`;
}

function runStatusToJobStatus(status: RunStatus): string {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'failed';
  if (status === 'running') return 'running';
  return 'pending';
}

function formatRunName(run: RunRecordResponse): string {
  return String(run.run_name || run.run_id || 'Backtest run');
}

function formatRunWindow(run: RunRecordResponse): string {
  const start = run.start_date || '';
  const end = run.end_date || '';
  if (start && end) return `${start} to ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Through ${end}`;
  return 'Window not provided';
}

function formatRunTiming(run: RunRecordResponse): string {
  if (run.status === 'queued') {
    return run.submitted_at ? `Queued ${formatTimeAgo(run.submitted_at)} ago` : 'Queued';
  }
  if (run.status === 'running') {
    return run.started_at ? `Started ${formatTimeAgo(run.started_at)} ago` : 'Running';
  }
  if (run.completed_at) {
    return `Completed ${formatTimeAgo(run.completed_at)} ago`;
  }
  return run.submitted_at ? `Submitted ${formatTimeAgo(run.submitted_at)} ago` : '-';
}

function buildLogTargets(jobs: OperationalJobTarget[]) {
  return jobs.map((job) => ({
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

function CategoryBadge({ category }: { category: OperationalJobCategory }) {
  const Icon = CATEGORY_ICON[category];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]',
        CATEGORY_TONE[category]
      )}
    >
      <Icon className="h-3 w-3" />
      {OPERATIONAL_JOB_CATEGORY_LABELS[category]}
    </span>
  );
}

function SummaryTile({
  label,
  value,
  detail,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'good' | 'watch' | 'risk';
}) {
  const toneClass =
    tone === 'risk'
      ? 'border-destructive/50 bg-destructive/10'
      : tone === 'watch'
        ? 'border-mcm-mustard/55 bg-mcm-mustard/12'
        : tone === 'good'
          ? 'border-mcm-teal/35 bg-mcm-teal/10'
          : 'border-mcm-walnut/14 bg-mcm-paper/70';

  return (
    <div className={cn('rounded-[1rem] border px-4 py-3', toneClass)}>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-xl text-foreground">{value}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}

export function OperationalJobMonitorPanel({
  jobs,
  onRefresh,
  isRefreshing = false,
  isFetching = false
}: {
  jobs: OperationalJobTarget[];
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
  isFetching?: boolean;
}) {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [selectedJobName, setSelectedJobName] = useState('');
  const { triggeringJob, triggerJob } = useJobTrigger();
  const { jobControl, setJobSuspended } = useJobSuspend();
  const {
    runs: backtestRuns,
    loading: backtestRunsLoading,
    error: backtestRunsError,
    refresh: refreshBacktestRuns
  } = useRunList({ limit: 8 });

  const categoryCounts = useMemo(() => {
    const counts = new Map<OperationalJobCategory, number>();
    for (const category of OPERATIONAL_JOB_CATEGORIES) {
      counts.set(category, 0);
    }
    for (const job of jobs) {
      counts.set(job.category, (counts.get(job.category) || 0) + 1);
    }
    return counts;
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    if (activeCategory === 'all') return jobs;
    return jobs.filter((job) => job.category === activeCategory);
  }, [activeCategory, jobs]);

  const logTargets = useMemo(() => buildLogTargets(filteredJobs), [filteredJobs]);

  useEffect(() => {
    if (!filteredJobs.length) {
      setSelectedJobName('');
      return;
    }
    if (filteredJobs.some((job) => job.name === selectedJobName)) {
      return;
    }
    setSelectedJobName(filteredJobs[0].name);
  }, [filteredJobs, selectedJobName]);

  const runningJobs = jobs.filter(
    (job) => effectiveJobStatus(job.recentStatus, job.runningState) === 'running'
  ).length;
  const failedJobs = jobs.filter(
    (job) => effectiveJobStatus(job.recentStatus, job.runningState) === 'failed'
  ).length;
  const queuedBacktests = backtestRuns.filter((run) => run.status === 'queued').length;
  const activeBacktests = backtestRuns.filter((run) =>
    ['queued', 'running'].includes(run.status)
  ).length;

  const handleRefresh = () => {
    void refreshBacktestRuns();
    void onRefresh?.();
  };

  const hasOperationalVisibility =
    jobs.length > 0 || backtestRuns.length > 0 || backtestRunsLoading || Boolean(backtestRunsError);

  return (
    <section className="mcm-panel overflow-hidden" aria-labelledby="operational-jobs-heading">
      <div className="border-b border-border/40 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Operational Jobs
            </p>
            <h2 id="operational-jobs-heading" className="font-display text-xl text-foreground">
              Backtests, Rankings, and Regime Workflows
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Non-domain compute is isolated here so ingestion health stays readable in the
              medallion matrix.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isFetching || backtestRunsLoading}
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                isRefreshing || isFetching || backtestRunsLoading ? 'animate-spin' : ''
              )}
            />
            Refresh Ops
          </Button>
        </div>
      </div>

      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Tracked Jobs"
          value={String(jobs.length)}
          detail={`${pluralize(runningJobs, 'job')} running across non-domain compute.`}
          tone={runningJobs > 0 ? 'watch' : 'neutral'}
        />
        <SummaryTile
          label="Failure Risk"
          value={String(failedJobs)}
          detail={
            failedJobs > 0
              ? 'At least one operational job needs attention.'
              : 'No failed operational job telemetry is visible.'
          }
          tone={failedJobs > 0 ? 'risk' : 'good'}
        />
        <SummaryTile
          label="Backtest Queue"
          value={String(activeBacktests)}
          detail={`${pluralize(queuedBacktests, 'run')} queued in the application backtest list.`}
          tone={activeBacktests > 0 ? 'watch' : 'neutral'}
        />
        <SummaryTile
          label="Classifier"
          value="Local v1"
          detail="Derived from domain mappings, job type, and job naming."
        />
      </div>

      <div className="flex flex-wrap gap-2 border-y border-border/40 bg-mcm-cream/35 px-6 py-4">
        <Button
          type="button"
          variant={activeCategory === 'all' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
        >
          All
          <Badge variant="secondary" className="px-2 py-0 text-[9px]">
            {jobs.length}
          </Badge>
        </Button>
        {OPERATIONAL_JOB_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICON[category];
          return (
            <Button
              key={category}
              type="button"
              variant={activeCategory === category ? 'default' : 'outline'}
              size="sm"
              aria-pressed={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            >
              <Icon className="h-4 w-4" />
              {OPERATIONAL_JOB_CATEGORY_LABELS[category]}
              <Badge variant="secondary" className="px-2 py-0 text-[9px]">
                {categoryCounts.get(category) || 0}
              </Badge>
            </Button>
          );
        })}
      </div>

      {!hasOperationalVisibility ? (
        <div className="p-6">
          <div className="rounded-[1.2rem] border border-dashed border-mcm-walnut/30 bg-mcm-paper/70 p-6 text-sm text-muted-foreground">
            No operational jobs are currently visible. Domain ingestion jobs remain available in the
            domain data panels.
          </div>
        </div>
      ) : (
        <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)]">
          <div className="min-w-0 space-y-5">
            <div className="overflow-x-auto rounded-[1.2rem] border border-mcm-walnut/18 bg-mcm-paper/72">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job / Workflow</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Start</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Trigger / Source</TableHead>
                    <TableHead>Records / Output</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => {
                    const status = effectiveJobStatus(job.recentStatus, job.runningState);
                    const isRunning = status === 'running';
                    const isBusy =
                      triggeringJob === job.name ||
                      (jobControl?.jobName === job.name &&
                        (jobControl.action === 'stop' || jobControl.action === 'suspend'));
                    const controlsDisabled = Boolean(triggeringJob) || Boolean(jobControl);
                    const executionUrl = getAzureJobExecutionsUrl(job.jobUrl);

                    return (
                      <TableRow
                        key={job.name}
                        className={selectedJobName === job.name ? 'bg-mcm-mustard/10' : undefined}
                      >
                        <TableCell>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">{job.name}</div>
                            <div className="mt-1 text-xs capitalize text-muted-foreground">
                              {job.jobType ? job.jobType.replaceAll('-', ' ') : 'Managed job'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <CategoryBadge category={job.category} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(status)}
                            {getStatusBadge(status)}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatOptionalTimestamp(job.startTime)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatDuration(job.duration)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {job.triggeredBy || job.runningState || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatRecordCount(job.recordsProcessed)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setSelectedJobName(job.name)}
                                  aria-label={`View logs for ${job.name}`}
                                >
                                  <ScrollText className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left">View logs</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                {executionUrl ? (
                                  <Button
                                    asChild
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    aria-label={`Open ${job.name} executions in Azure`}
                                  >
                                    <a href={executionUrl} target="_blank" rel="noreferrer">
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled
                                    aria-label={`No Azure execution link for ${job.name}`}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                )}
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                {executionUrl ? 'Open Azure executions' : 'Azure link unavailable'}
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={controlsDisabled}
                                  onClick={() =>
                                    isRunning
                                      ? void setJobSuspended(job.name, true)
                                      : void triggerJob(job.name)
                                  }
                                  aria-label={isRunning ? `Stop ${job.name}` : `Run ${job.name}`}
                                >
                                  {isBusy ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : isRunning ? (
                                    <Square className="h-4 w-4" />
                                  ) : (
                                    <Play className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                {isRunning ? 'Stop job' : 'Run job'}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredJobs.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        No operational jobs match this category filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-[1.2rem] border border-mcm-walnut/18 bg-mcm-paper/72 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-display text-lg text-foreground">
                    <History className="h-5 w-5 text-mcm-teal" />
                    Backtest Run Queue
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Application run records from the backtest service.
                  </p>
                </div>
                {backtestRunsError ? <Badge variant="destructive">Queue unavailable</Badge> : null}
              </div>

              {backtestRunsLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Loading backtest runs...
                </div>
              ) : backtestRuns.length ? (
                <div className="space-y-2">
                  {backtestRuns.map((run) => (
                    <div
                      key={run.run_id}
                      className="grid gap-3 rounded-xl border border-mcm-walnut/12 bg-background/70 p-3 md:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {formatRunName(run)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatRunWindow(run)}
                        </div>
                        {run.error ? (
                          <div className="mt-1 text-xs text-destructive">{run.error}</div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        {getStatusBadge(runStatusToJobStatus(run.status))}
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatRunTiming(run)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-mcm-walnut/24 bg-background/60 p-4 text-sm text-muted-foreground">
                  No backtest application runs are currently visible.
                </div>
              )}
            </div>
          </div>

          <JobLogStreamPanel
            jobs={logTargets}
            selectedJobName={selectedJobName}
            onSelectedJobNameChange={setSelectedJobName}
            kicker="Operational Tails"
            title="Operational Console Stream"
            description="Tail one operational job at a time while keeping domain ingestion logs out of this feed."
            emptyDescription="No operational jobs are available to stream."
          />
        </div>
      )}
    </section>
  );
}
