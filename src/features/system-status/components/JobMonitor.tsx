import React, { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/app/components/ui/card';
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
import { ExternalLink, Loader2, Play, PlayCircle, ScrollText, Square } from 'lucide-react';
import {
  buildLatestJobRunIndex,
  effectiveJobStatus,
  formatDuration,
  formatRecordCount,
  formatTimeAgo,
  formatTimestamp,
  getAzureJobExecutionsUrl,
  getStatusBadge,
  getStatusIcon,
  normalizeAzureJobName,
  normalizeAzurePortalUrl
} from '@/features/system-status/lib/SystemStatusHelpers';
import { useJobTrigger } from '@/hooks/useJobTrigger';
import { useJobSuspend } from '@/hooks/useJobSuspend';
import { useJobStatuses } from '@/hooks/useJobStatuses';
import { JobRun, ResourceHealth } from '@/types/strategy';

interface JobMonitorProps {
  recentJobs: JobRun[];
  jobLinks?: Record<string, string>;
  resources?: ResourceHealth[];
}

export function JobMonitor({ recentJobs, jobLinks = {}, resources = [] }: JobMonitorProps) {
  const { triggeringJob, triggerJob } = useJobTrigger();
  const { jobControl, setJobSuspended } = useJobSuspend();
  const jobStatuses = useJobStatuses({ autoRefresh: false });

  const resourceByJobKey = useMemo(() => {
    const map = new Map<string, ResourceHealth>();
    for (const resource of resources) {
      const key = normalizeAzureJobName(resource?.name);
      if (key) map.set(key, resource);
    }
    return map;
  }, [resources]);

  const latestRunByJob = useMemo(() => buildLatestJobRunIndex(recentJobs), [recentJobs]);

  const computeStatus = (job: JobRun) => {
    const key = normalizeAzureJobName(job.jobName);
    const statusEntry = key ? jobStatuses.byKey.get(key) : undefined;
    const latest = statusEntry?.latestRun ?? (key ? latestRunByJob.get(key) : undefined);
    const resource = statusEntry?.resource ?? (key ? resourceByJobKey.get(key) : undefined);
    return (
      statusEntry?.status ??
      effectiveJobStatus(latest?.status ?? job.status, resource?.runningState)
    );
  };

  const successJobs = recentJobs.filter((j) => computeStatus(j) === 'success').length;
  const warningJobs = recentJobs.filter((j) => computeStatus(j) === 'warning').length;
  const runningJobs = recentJobs.filter((j) => computeStatus(j) === 'running').length;
  const failedJobs = recentJobs.filter((j) => computeStatus(j) === 'failed').length;

  const getJobPortalLink = (jobName: string) => {
    const normalizedName = normalizeAzureJobName(jobName);
    const rawDirect = jobLinks[jobName];
    const rawNormalized = normalizedName ? jobLinks[normalizedName] : undefined;
    const raw = rawDirect || rawNormalized;
    return normalizeAzurePortalUrl(raw);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" />
            Recent Jobs
          </CardTitle>
          <div className="flex gap-3 text-sm">
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              {successJobs}
            </span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              {warningJobs}
            </span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              {runningJobs}
            </span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              {failedJobs}
            </span>
          </div>
        </div>
        <CardDescription>Execution history (last {recentJobs.length})</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentJobs.slice(0, 5).map((job, idx) => {
                const portalLink = getJobPortalLink(job.jobName);
                const executionsUrl = getAzureJobExecutionsUrl(portalLink);
                const jobKey = normalizeAzureJobName(job.jobName);
                const statusEntry = jobKey ? jobStatuses.byKey.get(jobKey) : undefined;
                const latestRun =
                  statusEntry?.latestRun ?? (jobKey ? latestRunByJob.get(jobKey) : undefined);
                const displayStatus =
                  statusEntry?.status ??
                  effectiveJobStatus(
                    latestRun?.status ?? job.status,
                    statusEntry?.runningState ??
                      (jobKey ? resourceByJobKey.get(jobKey)?.runningState : undefined)
                  );
                const runStatus = displayStatus.toUpperCase();
                const runTimeAgo = latestRun?.startTime
                  ? `${formatTimeAgo(latestRun.startTime)} ago`
                  : 'UNKNOWN';
                const isRunning = displayStatus === 'running';
                const isTriggering = Boolean(job.jobName) && triggeringJob === job.jobName;
                const isStopping =
                  Boolean(job.jobName) &&
                  jobControl?.jobName === job.jobName &&
                  (jobControl.action === 'suspend' || jobControl.action === 'stop');
                const isBusy = isTriggering || isStopping;
                const canTrigger = Boolean(job.jobName) && !triggeringJob && !jobControl;

                return (
                  <TableRow key={idx}>
                    <TableCell className="py-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{job.jobName}</span>
                          {portalLink && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={portalLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-muted-foreground hover:text-primary transition-colors"
                                  aria-label={`Open ${job.jobName} in Azure`}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                {latestRun
                                  ? `Selected run: ${runStatus} - ${runTimeAgo}`
                                  : 'No recent run info'}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {job.jobCategory || job.jobType}
                        </span>
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span>Trigger: {job.triggeredBy || 'schedule'}</span>
                          <span>Duration: {formatDuration(job.duration)}</span>
                          {job.jobKey ? <span>Key: {job.jobKey}</span> : null}
                          {job.jobRole ? <span>Role: {job.jobRole}</span> : null}
                          {job.metadataStatus ? <span>Metadata: {job.metadataStatus}</span> : null}
                          {job.recordsProcessed !== undefined && (
                            <span>Records: {formatRecordCount(job.recordsProcessed)}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(displayStatus)}
                        {getStatusBadge(displayStatus)}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 font-mono text-sm">
                      <div>{formatTimestamp(job.startTime)}</div>
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {executionsUrl ? (
                              <Button
                                asChild
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={`Open ${job.jobName} executions in Azure`}
                              >
                                <a href={executionsUrl} target="_blank" rel="noreferrer">
                                  <ScrollText className="h-4 w-4" />
                                </a>
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled
                                aria-label={`No Azure portal link for ${job.jobName}`}
                              >
                                <ScrollText className="h-4 w-4" />
                              </Button>
                            )}
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {executionsUrl ? 'Open execution history' : 'Azure link not configured'}
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={!canTrigger}
                              onClick={() =>
                                isRunning
                                  ? void setJobSuspended(String(job.jobName), true)
                                  : void triggerJob(job.jobName)
                              }
                              aria-label={isRunning ? `Stop ${job.jobName}` : `Run ${job.jobName}`}
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
                            {isRunning ? 'Stop job' : 'Trigger job'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {recentJobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">
                    No recent jobs found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
