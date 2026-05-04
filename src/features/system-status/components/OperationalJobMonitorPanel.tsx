import {
  Activity,
  ExternalLink,
  Layers3,
  Loader2,
  Orbit,
  Play,
  RefreshCw,
  Square,
  TestTubeDiagonal,
  Workflow
} from 'lucide-react';

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
import {
  effectiveJobStatus,
  formatDuration,
  formatRecordCount,
  formatTimestamp,
  getStatusBadge,
  getStatusIcon,
  normalizeAzurePortalUrl
} from '@/features/system-status/lib/SystemStatusHelpers';
import {
  OPERATIONAL_JOB_CATEGORY_LABELS,
  type OperationalJobCategory,
  type OperationalJobTarget
} from '@/features/system-status/lib/operationalJobs';
import { useJobSuspend } from '@/hooks/useJobSuspend';
import { useJobTrigger } from '@/hooks/useJobTrigger';

const CATEGORY_ICON: Record<OperationalJobCategory, typeof Activity> = {
  backtest: TestTubeDiagonal,
  ranking: Layers3,
  regime: Orbit,
  'intraday-monitoring': Activity,
  'results-reconciliation': RefreshCw,
  'symbol-cleanup': Workflow,
  'other-operational': Workflow
};

const CATEGORY_TONE: Record<OperationalJobCategory, string> = {
  backtest: 'border-mcm-teal/55 bg-mcm-teal/10 text-mcm-walnut',
  ranking: 'border-mcm-mustard/55 bg-mcm-mustard/14 text-mcm-walnut',
  regime: 'border-mcm-olive/45 bg-mcm-olive/10 text-mcm-olive',
  'intraday-monitoring': 'border-mcm-teal/45 bg-mcm-teal/10 text-mcm-walnut',
  'results-reconciliation': 'border-mcm-mustard/55 bg-mcm-mustard/12 text-mcm-walnut',
  'symbol-cleanup': 'border-destructive/35 bg-destructive/10 text-destructive',
  'other-operational': 'border-mcm-walnut/25 bg-mcm-paper text-mcm-walnut'
};

function formatOptionalTimestamp(value?: string | null): string {
  if (!value) return '-';
  return `${formatTimestamp(value)} ago`;
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
  const { triggeringJob, triggerJob } = useJobTrigger();
  const { jobControl, setJobSuspended } = useJobSuspend();

  const handleRefresh = () => {
    void onRefresh?.();
  };

  const handleJobControlAction = (job: OperationalJobTarget, isRunning: boolean) => {
    if (isRunning) {
      void setJobSuspended(job.name, true);
      return;
    }
    void triggerJob(job.name);
  };

  return (
    <section className="mcm-panel overflow-hidden" aria-labelledby="operational-jobs-heading">
      <div className="border-b border-border/40 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Operational Jobs
            </p>
            <h2 id="operational-jobs-heading" className="font-display text-xl text-foreground">
              Operational Workflows and Control Jobs
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Backtest, ranking, regime, intraday, reconciliation, and cleanup jobs stay isolated
              here so ingestion health remains readable in the medallion matrix.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isFetching}
          >
            <RefreshCw
              className={cn('h-4 w-4', isRefreshing || isFetching ? 'animate-spin' : '')}
            />
            Refresh Ops
          </Button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="p-6">
          <div className="rounded-[1.2rem] border border-dashed border-mcm-walnut/30 bg-mcm-paper/70 p-6 text-sm text-muted-foreground">
            No operational jobs are currently visible. Domain ingestion jobs remain available in the
            domain data panels.
          </div>
        </div>
      ) : (
        <div className="p-6">
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
                {jobs.map((job) => {
                  const status = effectiveJobStatus(job.recentStatus, job.runningState);
                  const isRunning = status === 'running';
                  const isBusy =
                    triggeringJob === job.name ||
                    (jobControl?.jobName === job.name &&
                      (jobControl.action === 'stop' || jobControl.action === 'suspend'));
                  const controlsDisabled = Boolean(triggeringJob) || Boolean(jobControl);
                  const jobPortalUrl = normalizeAzurePortalUrl(job.jobUrl);

                  return (
                    <TableRow key={job.name}>
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
                              {jobPortalUrl ? (
                                <Button
                                  asChild
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label={`Open ${job.name} in Azure`}
                                >
                                  <a href={jobPortalUrl} target="_blank" rel="noreferrer">
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled
                                  aria-label={`No Azure job link for ${job.name}`}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              {jobPortalUrl ? 'Open Azure job' : 'Azure link unavailable'}
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={controlsDisabled}
                                onClick={() => handleJobControlAction(job, isRunning)}
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
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}
