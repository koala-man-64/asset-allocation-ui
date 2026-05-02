import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLastDataQualityHealthMeta,
  queryKeys,
  useDataQualityHealthQuery,
  useLineageQuery
} from '@/hooks/useDataQueries';
import { DataService } from '@/services/DataService';
import { PageHero } from '@/app/components/common/PageHero';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { cn } from '@/app/components/ui/utils';
import { formatTimeAgo, getStatusConfig } from '@/features/system-status/lib/SystemStatusHelpers';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';
import { sanitizeOperatorUrl } from '@/utils/urlSecurity';
import type { RequestMeta, StorageUsageResponse } from '@/services/apiService';
import {
  computeLayerDrift,
  domainKey,
  formatDurationMs,
  getProbeIdForRow,
  isValidTickerSymbol,
  normalizeDomainName,
  normalizeLayerName,
  parseImpactsByDomain,
  type DomainRow
} from '@/features/data-quality/lib/dataQualityUtils';
import {
  ArrowUpRight,
  CheckCircle2,
  CircleSlash2,
  ExternalLink,
  FlaskConical,
  HardDrive,
  RefreshCw,
  ScanSearch,
  ShieldAlert
} from 'lucide-react';
// Lazy load DataPipelinePanel
const DataPipelinePanel = lazy(() =>
  import('@/features/data-quality/components/DataPipelinePanel').then((m) => ({
    default: m.DataPipelinePanel
  }))
);

import { useDataProbes, ProbeStatus } from '@/hooks/useDataProbes';
import { PageLoader } from '@/app/components/common/PageLoader';

function nowIso(): string {
  return new Date().toISOString();
}

const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function formatStorageCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return countFormatter.format(value);
}

function formatStorageBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '0 B';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

function ProbePill({ status }: { status: ProbeStatus }) {
  const text =
    status === 'pass'
      ? 'PASS'
      : status === 'warn'
        ? 'WARN'
        : status === 'fail'
          ? 'FAIL'
          : status === 'running'
            ? 'SCAN'
            : '—';

  const styles =
    status === 'pass'
      ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300'
      : status === 'warn'
        ? 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300'
        : status === 'fail'
          ? 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300'
          : status === 'running'
            ? 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300'
            : 'bg-muted/40 text-muted-foreground border-border/60';

  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-none px-2 py-0.5 font-mono text-[11px] tracking-[0.22em] uppercase',
        styles
      )}
    >
      {text}
    </Badge>
  );
}

function storageStatusMeta(
  error?: string | null,
  truncated?: boolean
): {
  label: string;
  css: string;
} {
  if (error) {
    return {
      label: 'ERROR',
      css: 'text-rose-700'
    };
  }
  if (truncated) {
    return {
      label: 'PARTIAL',
      css: 'text-amber-700'
    };
  }
  return {
    label: 'SCANNED',
    css: 'text-emerald-700'
  };
}

export function DataQualityPage() {
  const queryClient = useQueryClient();
  const health = useDataQualityHealthQuery();
  const lineage = useLineageQuery();

  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  const [probeSymbol, setProbeSymbol] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [healthMeta, setHealthMeta] = useState<RequestMeta | null>(null);
  const normalizedProbeSymbol = useMemo(
    () =>
      String(probeSymbol || '')
        .trim()
        .toUpperCase(),
    [probeSymbol]
  );
  const hasValidProbeSymbol = isValidTickerSymbol(normalizedProbeSymbol);

  useEffect(() => {
    if (health.dataUpdatedAt) {
      setLastRefreshedAt(new Date(health.dataUpdatedAt).toISOString());
    }
    setHealthMeta(getLastDataQualityHealthMeta());
  }, [health.dataUpdatedAt]);

  const rows: DomainRow[] = useMemo(() => {
    const payload = health.data;
    if (!payload?.dataLayers) return [];
    const out: DomainRow[] = [];
    for (const layer of payload.dataLayers) {
      for (const domain of layer.domains || []) {
        out.push({
          layerName: layer.name,
          domain
        });
      }
    }
    return out;
  }, [health.data]);

  const drift = useMemo(
    () => computeLayerDrift(health.data?.dataLayers || []),
    [health.data?.dataLayers]
  );

  const impactsByDomain = useMemo(() => {
    const raw =
      lineage.data && typeof lineage.data === 'object'
        ? (lineage.data as { impactsByDomain?: unknown }).impactsByDomain
        : null;
    return parseImpactsByDomain(raw);
  }, [lineage.data]);

  const {
    probeResults,
    runAll,
    cancelRunAll,
    isRunningAll,
    runAllStatusMessage,
    setRunAllStatusMessage,
    setProbeResults
  } = useDataProbes({
    ticker: normalizedProbeSymbol,
    rows
  });
  const storageUsageQuery = useQuery<StorageUsageResponse>({
    queryKey: ['data-quality', 'storage-usage'],
    queryFn: ({ signal }) => DataService.getStorageUsage(signal),
    staleTime: 1000 * 60 * 5,
    retry: 1
  });

  const summary = useMemo(() => {
    const payload = health.data;
    const overall = payload?.overall || 'unknown';

    const failures = rows.filter((r) =>
      ['error', 'critical', 'failed'].includes(String(r.domain.status).toLowerCase())
    ).length;
    const stales = rows.filter((r) =>
      ['stale', 'warning', 'degraded'].includes(String(r.domain.status).toLowerCase())
    ).length;
    const probesFailing = Object.values(probeResults).filter((p) => p.status === 'fail').length;

    return {
      overall,
      failures,
      stales,
      probesFailing
    };
  }, [health.data, rows, probeResults]);

  const forceRefresh = useCallback(async () => {
    if (isForceRefreshing) return;
    setIsForceRefreshing(true);
    setRunAllStatusMessage(null);
    try {
      const response = await DataService.getSystemHealthWithMeta({ refresh: true });
      queryClient.setQueryData(queryKeys.dataQualityHealth(), response.data);
      setHealthMeta(response.meta);
      setLastRefreshedAt(nowIso());
    } catch (err: unknown) {
      const message = formatSystemStatusText(err);
      setRunAllStatusMessage(`Refresh failed: ${message}`);
    } finally {
      setIsForceRefreshing(false);
    }
  }, [isForceRefreshing, queryClient, setRunAllStatusMessage]);

  const headerStatus = getStatusConfig(summary.overall);

  if (health.isLoading) {
    return <PageLoader text="Loading validation ledger..." />;
  }

  if (health.error || !health.data) {
    const message = formatSystemStatusText(health.error) || 'Unknown error';
    return (
      <div className="page-shell">
        <StatePanel
          tone="error"
          title="System health is unavailable"
          message={
            <span className="flex items-center gap-2 font-mono text-xs">
              <ShieldAlert className="h-4 w-4" />
              {message}
            </span>
          }
        />
      </div>
    );
  }

  return (
    <div className="dq page-shell">
      <PageHero
        kicker="Validation Harness"
        title={
          <span className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-mcm-olive" />
            Data Quality
          </span>
        }
        subtitle="Cross-check freshness, structure, and API reachability across the container and folder topology from the shared operations desk."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void forceRefresh()}
              disabled={health.isFetching || isForceRefreshing || isRunningAll}
            >
              <RefreshCw
                className={cn(
                  'h-4 w-4',
                  (health.isFetching || isForceRefreshing) && 'animate-spin'
                )}
              />
              Refresh
            </Button>
            <Button onClick={() => void runAll()} disabled={health.isFetching || isRunningAll}>
              <ScanSearch className={cn('h-4 w-4', isRunningAll && 'animate-spin')} />
              {isRunningAll ? 'Running...' : 'Run Probes'}
            </Button>
            <Button variant="outline" onClick={() => setProbeResults({})} disabled={isRunningAll}>
              <ShieldAlert className="h-4 w-4" />
              Clear
            </Button>
            {isRunningAll ? (
              <Button variant="outline" onClick={cancelRunAll}>
                <CircleSlash2 className="h-4 w-4" />
                Cancel
              </Button>
            ) : null}
          </div>
        }
        metrics={[
          {
            label: 'System',
            value: String(summary.overall).toUpperCase(),
            detail: 'Overall validation posture from /api/system/health.',
            icon: <headerStatus.icon className="h-4 w-4" style={{ color: headerStatus.text }} />,
            valueClassName: 'font-mono'
          },
          {
            label: 'Rows',
            value: rows.length.toLocaleString(),
            detail: 'Validation ledger rows currently in scope.',
            valueClassName: 'font-mono'
          },
          {
            label: 'Last Refresh',
            value: lastRefreshedAt ? lastRefreshedAt.slice(11, 19) : '--',
            detail: 'Latest UI refresh time in UTC.',
            valueClassName: 'font-mono'
          }
        ]}
      />

      <section className="mcm-panel p-4 sm:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,24rem)]">
          <div className="space-y-4">
            <div>
              <div className="page-kicker">Operator Controls</div>
              <h2 className="text-lg">Refresh And Probe</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Run the refresh flow, clear probe state, and stage a probe symbol without leaving
                the shared shell.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-border/40 bg-mcm-cream/65 px-3 py-1.5">
                <span className="page-kicker">Failures</span>{' '}
                <span className="font-mono text-sm">{summary.failures}</span>
              </div>
              <div className="rounded-full border border-border/40 bg-mcm-cream/65 px-3 py-1.5">
                <span className="page-kicker">Stale/Warn</span>{' '}
                <span className="font-mono text-sm">{summary.stales}</span>
              </div>
              <div className="rounded-full border border-border/40 bg-mcm-cream/65 px-3 py-1.5">
                <span className="page-kicker">Probes Failed</span>{' '}
                <span className="font-mono text-sm">{summary.probesFailing}</span>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-border/35 bg-background/55 p-4">
              <div className="page-kicker">Probe Mode</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Probes always run across all datasets for the symbol you enter. Leave the field
                blank to skip symbol-bound calls.
              </p>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-border/35 bg-background/55 p-4">
            <div className="page-kicker">Probe Input</div>
            <label htmlFor="probe-symbol-input" className="mt-3 block">
              Symbol
            </label>
            <Input
              id="probe-symbol-input"
              className="mt-2 font-mono uppercase tracking-[0.08em]"
              placeholder="AAPL"
              value={probeSymbol}
              onChange={(event) => setProbeSymbol(event.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={probeSymbol.length > 0 && !hasValidProbeSymbol}
            />
            <div className="mt-2 font-mono text-[11px] text-muted-foreground">
              {probeSymbol.length === 0
                ? 'Optional. Leave blank to skip probe calls.'
                : hasValidProbeSymbol
                  ? `Will probe symbol ${normalizedProbeSymbol}.`
                  : 'Invalid ticker format. Probes will be skipped.'}
            </div>
            {runAllStatusMessage ? (
              <div className="mt-4 rounded-xl border border-border/35 bg-mcm-cream/60 px-3 py-2 font-mono text-xs text-muted-foreground">
                {runAllStatusMessage}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mcm-panel p-4 sm:p-5">
        <div className="mb-4">
          <div className="page-kicker">Pipeline Readout</div>
          <h2 className="text-lg">Container Progression</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The bronze, silver, and gold flow remains bespoke here because the validation harness
            benefits from a custom stage diagram.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-[200px] w-full rounded-xl bg-muted/20" />}>
          <DataPipelinePanel drift={drift} rows={rows} />
        </Suspense>
      </section>

      <section className="mcm-panel p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="page-kicker">ADLS Storage</div>
            <h2 className="text-lg">Container + Folder Usage</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Aggregate file counts and byte usage by each configured ADLS folder.
            </p>
          </div>
          <div className="dq-storage-meta">
            <div className="dq-mono text-xs text-muted-foreground">
              Scan cap: {storageUsageQuery.data?.scanLimit?.toLocaleString() || '—'} blobs/prefix
            </div>
            {storageUsageQuery.data?.generatedAt ? (
              <div className="dq-mono text-xs text-muted-foreground">
                Refreshed:{' '}
                {storageUsageQuery.data.generatedAt.replace('T', ' ').replace('Z', ' UTC')}
              </div>
            ) : null}
          </div>
        </div>

        {storageUsageQuery.isLoading ? (
          <div className="mt-4">
            <Skeleton className="h-44 w-full rounded-xl bg-muted/20" />
          </div>
        ) : storageUsageQuery.isError ? (
          <div className="mt-4 dq-mono text-sm text-rose-700">
            Failed to load storage usage:{' '}
            {storageUsageQuery.error instanceof Error
              ? storageUsageQuery.error.message
              : String(storageUsageQuery.error)}
          </div>
        ) : (
          <div className="mt-4 dq-ledger-table">
            <Table className="dq-table">
              <TableHeader>
                <TableRow className="dq-table-head">
                  <TableHead className="dq-th">Container</TableHead>
                  <TableHead className="dq-th">Layer</TableHead>
                  <TableHead className="dq-th">Folder</TableHead>
                  <TableHead className="dq-th text-right">Files</TableHead>
                  <TableHead className="dq-th text-right">Bytes</TableHead>
                  <TableHead className="dq-th text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(storageUsageQuery.data?.containers || []).map((container) => {
                  const containerStatus = storageStatusMeta(container.error, container.truncated);
                  const containerKey = `${container.layer}-${container.container || container.layer}`;
                  const folderRows = (container.folders || []).map((folder) => {
                    const folderStatus = storageStatusMeta(folder.error, folder.truncated);
                    return (
                      <TableRow key={`${containerKey}-${folder.path}`}>
                        <TableCell className="dq-td" />
                        <TableCell className="dq-td" />
                        <TableCell className="dq-td">
                          <span className="dq-mono text-xs text-muted-foreground">
                            └ {folder.path}
                          </span>
                        </TableCell>
                        <TableCell className="dq-td text-right">
                          {formatStorageCount(folder.fileCount)}
                        </TableCell>
                        <TableCell className="dq-td text-right">
                          <span className="dq-path-meta">
                            {formatStorageBytes(folder.totalBytes)}
                          </span>
                        </TableCell>
                        <TableCell className={`dq-td text-right ${folderStatus.css}`}>
                          {folderStatus.label}
                        </TableCell>
                      </TableRow>
                    );
                  });

                  return [
                    <TableRow key={containerKey} className="dq-tr">
                      <TableCell className="dq-td">
                        <div className="dq-domain-cell">
                          <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="dq-domain-name">
                            {container.container || container.layer}
                          </span>
                        </div>
                        {container.error ? (
                          <div className="dq-path-meta text-rose-600">Error: {container.error}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="dq-td">
                        <span className="dq-badge">{container.layerLabel}</span>
                      </TableCell>
                      <TableCell className="dq-td dq-path-meta">TOTAL</TableCell>
                      <TableCell className="dq-td text-right">
                        {formatStorageCount(container.totalFiles)}
                      </TableCell>
                      <TableCell className="dq-td text-right">
                        <span className="dq-path-meta">
                          {formatStorageBytes(container.totalBytes)}
                        </span>
                      </TableCell>
                      <TableCell className={`dq-td text-right ${containerStatus.css}`}>
                        {containerStatus.label}
                      </TableCell>
                    </TableRow>,
                    ...folderRows
                  ];
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mcm-panel p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="page-kicker">Containers &amp; Folders</div>
            <h2 className="text-lg">Validation Ledger</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each row is a folder/table probe target emitted by `/api/system/health` with optional
              active checks.
            </p>
          </div>
          <div className="dq-ledger-meta">
            <div className="dq-mono text-xs text-muted-foreground">
              Rows: {rows.length.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="mt-4 dq-ledger-table">
          <Table className="dq-table">
            <TableHeader>
              <TableRow className="dq-table-head">
                <TableHead className="dq-th">Layer</TableHead>
                <TableHead className="dq-th">Domain</TableHead>
                <TableHead className="dq-th">Type</TableHead>
                <TableHead className="dq-th">Path</TableHead>
                <TableHead className="dq-th text-center">Freshness</TableHead>
                <TableHead className="dq-th text-center">Last Updated</TableHead>
                <TableHead className="dq-th text-center">Probe</TableHead>
                <TableHead className="dq-th text-right">Links</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const layerKey = normalizeLayerName(row.layerName) || row.layerName;
                const domainName = normalizeDomainName(row.domain.name);
                const status = getStatusConfig(row.domain.status);
                const probeId = getProbeIdForRow(
                  row.layerName,
                  row.domain.name,
                  normalizedProbeSymbol
                );

                const probe = probeId ? probeResults[probeId] : undefined;
                const probeStatus = probe?.status || 'idle';
                const impactedStrategies = impactsByDomain[String(domainName).toLowerCase()] || [];
                const safePortalUrl = sanitizeOperatorUrl(row.domain.portalUrl);
                const safeJobUrl = sanitizeOperatorUrl(row.domain.jobUrl);
                const safeTriggerUrl = sanitizeOperatorUrl(row.domain.triggerUrl);

                return (
                  <TableRow key={domainKey(row)} className="dq-tr">
                    <TableCell className="dq-td">
                      <div className="dq-layer-cell">
                        <div className="dq-layer-tag">{String(layerKey).toUpperCase()}</div>
                        <div className="dq-layer-dot" style={{ background: status.text }} />
                      </div>
                    </TableCell>

                    <TableCell className="dq-td">
                      <div className="dq-domain-cell">
                        <div className="dq-domain-name">{row.domain.name}</div>
                        {impactedStrategies.length > 0 && (
                          <div className="dq-domain-meta">
                            <span className="dq-mono text-[11px] text-muted-foreground">
                              Impacts: {impactedStrategies.slice(0, 2).join(', ')}
                              {impactedStrategies.length > 2
                                ? ` +${impactedStrategies.length - 2}`
                                : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="dq-td">
                      <Badge variant="outline" className="dq-badge">
                        {row.domain.type}
                      </Badge>
                    </TableCell>

                    <TableCell className="dq-td">
                      <div className="dq-path">
                        <span className="dq-mono">{row.domain.path}</span>
                        {row.domain.version !== undefined && row.domain.version !== null && (
                          <span className="dq-path-meta">v{row.domain.version}</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="dq-td text-center">
                      <Badge
                        variant="outline"
                        className="dq-badge"
                        style={{
                          borderColor: status.border,
                          color: status.text,
                          backgroundColor: status.bg
                        }}
                      >
                        {String(row.domain.status).toUpperCase()}
                      </Badge>
                    </TableCell>

                    <TableCell className="dq-td text-center">
                      <div className="dq-mono text-[11px] text-muted-foreground">
                        {row.domain.lastUpdated
                          ? `${formatTimeAgo(row.domain.lastUpdated)} ago`
                          : '—'}
                      </div>
                    </TableCell>

                    <TableCell className="dq-td text-center">
                      <div className="dq-probe-cell">
                        <ProbePill status={probeStatus} />
                        {probe?.ms !== undefined && (
                          <div className="dq-mono text-[10px] text-muted-foreground">
                            {formatDurationMs(probe.ms)}
                          </div>
                        )}
                        {!probeId && (
                          <span className="dq-mono text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="dq-td text-right">
                      <div className="dq-links">
                        {safePortalUrl ? (
                          <a
                            className="dq-link"
                            href={safePortalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                            <span className="sr-only">Open portal</span>
                          </a>
                        ) : (
                          <span className="dq-link dq-link-muted" aria-hidden="true">
                            <ExternalLink className="h-4 w-4" />
                          </span>
                        )}

                        {safeJobUrl ? (
                          <a
                            className="dq-link"
                            href={safeJobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ArrowUpRight className="h-4 w-4" />
                            <span className="sr-only">Open job</span>
                          </a>
                        ) : (
                          <span className="dq-link dq-link-muted" aria-hidden="true">
                            <ArrowUpRight className="h-4 w-4" />
                          </span>
                        )}

                        {safeTriggerUrl ? (
                          <a
                            className="dq-link"
                            href={safeTriggerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="sr-only">Trigger</span>
                          </a>
                        ) : (
                          <span className="dq-link dq-link-muted" aria-hidden="true">
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="dq-mono text-xs text-muted-foreground">
            Last refresh: {lastRefreshedAt ? lastRefreshedAt.slice(0, 19).replace('T', ' ') : '—'}{' '}
            UTC
            {healthMeta && (
              <>
                {' '}
                • Cache: {healthMeta.cacheHint || 'n/a'}
                {healthMeta.cacheDegraded ? ' • CACHE-DEGRADED SNAPSHOT' : ''}
                {healthMeta.requestId ? ` • Req ${healthMeta.requestId.slice(0, 8)}` : ''}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
