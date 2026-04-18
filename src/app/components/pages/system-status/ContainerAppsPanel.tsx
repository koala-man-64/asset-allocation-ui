import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  ScrollText,
  Server
} from 'lucide-react';
import { DataService } from '@/services/DataService';
import type { ContainerAppStatusItem } from '@/services/apiService';
import {
  addConsoleLogStreamListener,
  buildContainerAppLogTopic,
  requestRealtimeSubscription,
  requestRealtimeUnsubscription
} from '@/services/realtimeBus';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/app/components/ui/card';
import { Switch } from '@/app/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { cn } from '@/app/components/ui/utils';
import { formatTimeAgo, getAzurePortalUrl } from './SystemStatusHelpers';
import { getLogStreamFeedback } from './logStreamFeedback';
import { formatSystemStatusText } from './systemStatusText';

const QUERY_KEY = ['system', 'container-apps'] as const;
const LOG_TAIL_LINES = 50;

type AppLogState = {
  lines: string[];
  loading: boolean;
  error: string | null;
  marker: string | null;
};

function mergeLogLines(
  existing: string[],
  incoming: string[],
  limit = LOG_TAIL_LINES * 4
): string[] {
  const next = [...existing];
  const windowed = new Set(existing.slice(-limit));

  incoming.forEach((line) => {
    const text = String(line || '').trim();
    if (!text || windowed.has(text)) {
      return;
    }
    next.push(text);
    windowed.add(text);
    while (next.length > limit) {
      const removed = next.shift();
      if (removed && !next.includes(removed)) {
        windowed.delete(removed);
      }
    }
  });

  return next.slice(-limit);
}

function normalizeState(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isAppRunning(app: ContainerAppStatusItem): boolean {
  const runningState = normalizeState(app.runningState);
  if (runningState.includes('stop')) return false;
  if (runningState.includes('run')) return true;
  if (runningState.includes('start')) return true;

  const provisioning = normalizeState(app.provisioningState);
  if (provisioning === 'succeeded') return true;
  if (provisioning === 'failed') return false;
  return false;
}

function getAppHealthStatus(app: ContainerAppStatusItem): string {
  return normalizeState(app.health?.status || app.status || 'unknown');
}

function statusBadgeClass(status: string): string {
  const normalized = normalizeState(status);
  if (normalized === 'healthy') return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30';
  if (normalized === 'warning') return 'bg-amber-500/15 text-amber-700 border-amber-500/30';
  if (normalized === 'error') return 'bg-rose-500/15 text-rose-700 border-rose-500/30';
  return 'bg-muted/40 text-muted-foreground border-border/60';
}

function HealthBadge({ app }: { app: ContainerAppStatusItem }) {
  const healthStatus = getAppHealthStatus(app);
  const label = healthStatus ? healthStatus.toUpperCase() : 'UNKNOWN';
  return (
    <Badge
      variant="outline"
      className={cn('font-mono text-[10px] tracking-widest', statusBadgeClass(healthStatus))}
    >
      {label}
    </Badge>
  );
}

export function ContainerAppsPanel() {
  const queryClient = useQueryClient();
  const [pendingByName, setPendingByName] = useState<Record<string, boolean>>({});
  const [expandedAppName, setExpandedAppName] = useState<string | null>(null);
  const [logStateByName, setLogStateByName] = useState<Record<string, AppLogState>>({});
  const logControllers = useRef<Record<string, AbortController>>({});

  const containerAppsQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) => DataService.getContainerApps({ probe: true }, signal),
    staleTime: 1000 * 20,
    refetchInterval: false
  });

  const apps = useMemo(() => containerAppsQuery.data?.apps || [], [containerAppsQuery.data?.apps]);
  const runningCount = useMemo(() => apps.filter((app) => isAppRunning(app)).length, [apps]);
  const healthyCount = useMemo(
    () => apps.filter((app) => getAppHealthStatus(app) === 'healthy').length,
    [apps]
  );
  const probeCount = useMemo(
    () => apps.filter((app) => Boolean(app.health?.url)).length,
    [apps]
  );

  const setPending = (name: string, pending: boolean) => {
    setPendingByName((prev) => {
      if (!pending) {
        const next = { ...prev };
        delete next[name];
        return next;
      }
      return { ...prev, [name]: true };
    });
  };

  const toggleApp = async (app: ContainerAppStatusItem, nextEnabled: boolean) => {
    const name = String(app.name || '').trim();
    if (!name) return;
    setPending(name, true);
    try {
      if (nextEnabled) {
        await DataService.startContainerApp(name);
        toast.success(`Start command sent for ${name}.`);
      } else {
        await DataService.stopContainerApp(name);
        toast.success(`Stop command sent for ${name}.`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['systemHealth'] })
      ]);
    } catch (err: unknown) {
      const message = formatSystemStatusText(err);
      toast.error(`Failed to update ${name}: ${message}`);
    } finally {
      setPending(name, false);
    }
  };

  const refreshApps = async () => {
    await Promise.all([
      containerAppsQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ['systemHealth'] })
    ]);
  };

  const getLogMarker = (app: ContainerAppStatusItem): string => {
    const revision = String(app.latestReadyRevisionName || '').trim();
    const runningState = normalizeState(app.runningState);
    const provisioningState = normalizeState(app.provisioningState);
    const marker = [revision, runningState, provisioningState]
      .filter((part) => part.length > 0)
      .join('|');
    return marker || String(app.name || '').trim();
  };

  const fetchAppLogs = useCallback((appName: string, marker: string | null) => {
    logControllers.current[appName]?.abort();
    const controller = new AbortController();
    logControllers.current[appName] = controller;

    setLogStateByName((prev) => ({
      ...prev,
      [appName]: {
        lines: prev[appName]?.lines ?? [],
        loading: true,
        error: null,
        marker
      }
    }));

    DataService.getContainerAppLogs(appName, { tail: LOG_TAIL_LINES }, controller.signal)
      .then((response) => {
        const logs = Array.isArray(response?.logs)
          ? response.logs
              .filter((line) => line !== undefined && line !== null)
              .map((line) => formatSystemStatusText(line))
              .filter((line) => line.length > 0)
              .slice(-LOG_TAIL_LINES)
          : [];
        setLogStateByName((prev) => ({
          ...prev,
          [appName]: {
            lines: logs,
            loading: false,
            error: null,
            marker
          }
        }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLogStateByName((prev) => ({
          ...prev,
          [appName]: {
            lines: [],
            loading: false,
            error: formatSystemStatusText(error),
            marker
          }
        }));
      });
  }, []);

  const toggleAppLogs = (app: ContainerAppStatusItem) => {
    const appName = String(app.name || '').trim();
    if (!appName) return;

    const isExpanded = expandedAppName === appName;
    if (isExpanded) {
      setExpandedAppName(null);
      return;
    }

    const marker = getLogMarker(app);
    const logState = logStateByName[appName];
    if (!logState || logState.marker !== marker) {
      fetchAppLogs(appName, marker);
    }
    setExpandedAppName(appName);
  };

  useEffect(() => {
    if (!expandedAppName) return;
    const app = apps.find((candidate) => String(candidate.name || '').trim() === expandedAppName);
    if (!app) return;
    const marker = getLogMarker(app);
    const current = logStateByName[expandedAppName];
    if (!current || current.marker !== marker) {
      fetchAppLogs(expandedAppName, marker);
    }
  }, [apps, expandedAppName, fetchAppLogs, logStateByName]);

  useEffect(() => {
    if (!expandedAppName) return;
    const topic = buildContainerAppLogTopic(expandedAppName);
    requestRealtimeSubscription([topic]);
    return () => requestRealtimeUnsubscription([topic]);
  }, [expandedAppName]);

  useEffect(() => {
    if (!expandedAppName) return;
    const topic = buildContainerAppLogTopic(expandedAppName);
    return addConsoleLogStreamListener((detail) => {
      if (detail.topic !== topic) {
        return;
      }

      const incoming = detail.lines
        .map((line) => formatSystemStatusText(line.message))
        .filter((line) => line.length > 0);

      if (incoming.length === 0) {
        return;
      }

      setLogStateByName((prev) => {
        const current = prev[expandedAppName];
        return {
          ...prev,
          [expandedAppName]: {
            lines: mergeLogLines(current?.lines ?? [], incoming),
            loading: false,
            error: null,
            marker: current?.marker ?? null
          }
        };
      });
    });
  }, [expandedAppName]);

  useEffect(() => {
    const controllers = logControllers.current;
    return () => {
      Object.values(controllers).forEach((controller) => controller.abort());
    };
  }, []);

  if (containerAppsQuery.isLoading) {
    return (
      <Card className="gap-0">
        <CardHeader className="border-b border-border/40">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
            Runtime Controls
          </p>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Container App Switchboard
          </CardTitle>
          <CardDescription>Loading container app health and controls…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (containerAppsQuery.error) {
    const message = formatSystemStatusText(containerAppsQuery.error);
    return (
      <Card className="gap-0">
        <CardHeader className="border-b border-border/40">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
            Runtime Controls
          </p>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Container App Switchboard
          </CardTitle>
          <CardDescription>Container app controls are unavailable.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="font-mono text-xs text-rose-500">{message}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col gap-0">
      <CardHeader className="gap-4 border-b border-border/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Runtime Controls
            </p>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Container App Switchboard
            </CardTitle>
            <CardDescription>
              Toggle API and UI workloads, confirm probe health, and open live console tails from
              the same operational surface.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{apps.length} apps tracked</Badge>
            <Badge variant="outline">{runningCount} running</Badge>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void refreshApps()}
              disabled={containerAppsQuery.isFetching}
            >
              <RefreshCw
                className={`h-4 w-4 ${containerAppsQuery.isFetching ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 overflow-hidden pt-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Running workloads
            </div>
            <div className="mt-2 font-display text-2xl text-foreground">{runningCount}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Container apps currently responding as active workloads.
            </div>
          </div>
          <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Healthy probes
            </div>
            <div className="mt-2 font-display text-2xl text-foreground">{healthyCount}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Apps reporting healthy probe status in the latest runtime payload.
            </div>
          </div>
          <div className="rounded-[1.4rem] border border-mcm-walnut/20 bg-mcm-cream/65 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Probe endpoints
            </div>
            <div className="mt-2 font-display text-2xl text-foreground">{probeCount}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Workloads exposing a direct health URL for spot verification.
            </div>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-mcm-walnut/20 bg-mcm-paper/55 overflow-hidden">
          <div className="-my-2">
            <Table className="[&_[data-slot=table-head]]:bg-mcm-paper/70 [&_[data-slot=table-head]]:px-5 [&_[data-slot=table-head]]:text-[10px] [&_[data-slot=table-head]]:font-black [&_[data-slot=table-head]]:uppercase [&_[data-slot=table-head]]:tracking-[0.18em] [&_[data-slot=table-cell]]:px-5">
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead className="text-center">Enabled</TableHead>
                  <TableHead className="text-center">Health</TableHead>
                  <TableHead>Runtime</TableHead>
                  <TableHead>Probe URL</TableHead>
                  <TableHead>Last Checked</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => {
                  const name = String(app.name || '');
                  const enabled = isAppRunning(app);
                  const isPending = Boolean(pendingByName[name]);
                  const probeUrl = app.health?.url || null;
                  const lastChecked = app.health?.checkedAt || app.checkedAt || null;
                  const runningState = app.runningState || app.provisioningState || 'Unknown';
                  const isExpanded = expandedAppName === name;
                  const logState = logStateByName[name];
                  const loadingLogs = Boolean(isExpanded && logState?.loading);
                  const logFeedback = getLogStreamFeedback(logState?.error, 'container-app');

                  return (
                    <Fragment key={name}>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{name}</span>
                            {app.azureId && (
                              <a
                                href={getAzurePortalUrl(app.azureId)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors"
                                aria-label={`Open ${name} in Azure`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={enabled}
                            disabled={isPending}
                            onCheckedChange={(next) => {
                              void toggleApp(app, next);
                            }}
                            aria-label={`Toggle ${name}`}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="inline-flex items-center gap-2">
                            <Activity className="h-4 w-4 text-muted-foreground" />
                            <HealthBadge app={app} />
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {runningState}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[320px] truncate">
                          {probeUrl ? (
                            <a
                              href={probeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-primary transition-colors"
                              title={probeUrl}
                            >
                              {probeUrl}
                            </a>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {lastChecked ? `${formatTimeAgo(lastChecked)} ago` : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleAppLogs(app)}
                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} logs for ${name}`}
                            aria-expanded={isExpanded}
                          >
                            {loadingLogs ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ChevronDown
                                className={cn(
                                  'h-4 w-4 transition-transform duration-300',
                                  isExpanded && 'rotate-180'
                                )}
                              />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                      <TableRow className="border-0 hover:bg-transparent">
                        <TableCell colSpan={7} className="bg-mcm-cream/45 p-0">
                          <div
                            className={`will-change-[max-height,opacity,transform] transition-[max-height,opacity,transform] duration-450 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                              isExpanded
                                ? 'max-h-[400px] opacity-100 translate-y-0 overflow-auto'
                                : 'max-h-0 opacity-0 -translate-y-2 overflow-hidden pointer-events-none'
                            }`}
                            aria-hidden={!isExpanded}
                          >
                            <div className="p-4">
                              <div className="rounded-[1.2rem] border border-mcm-walnut/20 bg-mcm-paper/80">
                                <div className="flex items-center justify-between gap-3 border-b border-mcm-walnut/15 px-3 py-2 text-xs font-semibold text-muted-foreground">
                                  <span className="flex items-center gap-2">
                                    <ScrollText className="h-3.5 w-3.5" />
                                    Recent Console Logs
                                  </span>
                                  <span className="text-[11px] font-normal text-muted-foreground/80">
                                    Live tail while open
                                  </span>
                                </div>
                                <div className="max-h-64 overflow-auto overflow-x-hidden break-words px-3 py-2 text-xs font-mono leading-relaxed">
                                  {logState?.loading && (
                                    <div className="text-muted-foreground">Loading logs…</div>
                                  )}
                                  {!logState?.loading &&
                                    logFeedback.tone === 'error' &&
                                    logFeedback.message && (
                                      <div className="break-words text-destructive">
                                        Failed to load logs: {logFeedback.message}
                                      </div>
                                    )}
                                  {!logState?.loading &&
                                    logFeedback.tone === 'info' &&
                                    logFeedback.message && (
                                      <div className="text-muted-foreground">
                                        {logFeedback.message}
                                      </div>
                                    )}
                                  {!logState?.loading &&
                                    logFeedback.tone === 'none' &&
                                    (logState?.lines?.length ?? 0) === 0 && (
                                      <div className="text-muted-foreground">
                                        No log output available.
                                      </div>
                                    )}
                                  {!logState?.loading &&
                                    logFeedback.tone === 'none' &&
                                    (logState?.lines?.length ?? 0) > 0 && (
                                      <div className="space-y-1">
                                        {(logState?.lines ?? [])
                                          .slice(-(LOG_TAIL_LINES * 4))
                                          .map((line, index) => (
                                            <div
                                              key={`${name}-log-${index}`}
                                              className={`whitespace-pre-wrap break-words text-foreground/90 px-2 py-1 max-w-full ${
                                                index % 2 === 0 ? 'bg-muted/30' : 'bg-transparent'
                                              }`}
                                            >
                                              {line}
                                            </div>
                                          ))}
                                      </div>
                                    )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
                {apps.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-muted-foreground py-8"
                    >
                      No container apps configured. Set `SYSTEM_HEALTH_ARM_CONTAINERAPPS`.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
