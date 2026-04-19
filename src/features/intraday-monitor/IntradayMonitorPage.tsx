import { useDeferredValue, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Clock3,
  Layers3,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Waves
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHero } from '@/app/components/common/PageHero';
import { PageLoader } from '@/app/components/common/PageLoader';
import { StatePanel } from '@/app/components/common/StatePanel';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { Textarea } from '@/app/components/ui/textarea';
import {
  intradayMonitorApi,
  intradayMonitorKeys,
  type IntradayMarketSession,
  type IntradayMonitorEvent,
  type IntradayMonitorRunSummary,
  type IntradayRefreshBatchSummary,
  type IntradaySymbolStatus,
  type IntradayWatchlistDetail,
  type IntradayWatchlistSummary,
  type IntradayWatchlistUpsertRequest
} from '@/services/intradayMonitorApi';
import { requestRealtimeSubscription, requestRealtimeUnsubscription } from '@/services/realtimeBus';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

const INTRADAY_REALTIME_TOPICS = ['intraday-monitor', 'intraday-refresh'];
const STATUS_REFETCH_INTERVAL_MS = 15_000;
const WATCHLIST_REFETCH_INTERVAL_MS = 30_000;
const FIXED_MARKET_SESSION: IntradayMarketSession = 'us_equities_regular';

type WatchlistDraft = {
  name: string;
  description: string;
  symbolsText: string;
  enabled: boolean;
  pollIntervalMinutes: string;
  refreshCooldownMinutes: string;
  autoRefreshEnabled: boolean;
  marketSession: IntradayMarketSession;
};

function createEmptyDraft(): WatchlistDraft {
  return {
    name: '',
    description: '',
    symbolsText: '',
    enabled: true,
    pollIntervalMinutes: '5',
    refreshCooldownMinutes: '15',
    autoRefreshEnabled: true,
    marketSession: FIXED_MARKET_SESSION
  };
}

function buildDraftFromWatchlist(watchlist: IntradayWatchlistDetail): WatchlistDraft {
  return {
    name: watchlist.name,
    description: watchlist.description || '',
    symbolsText: (watchlist.symbols || []).join('\n'),
    enabled: watchlist.enabled,
    pollIntervalMinutes: String(watchlist.pollIntervalMinutes),
    refreshCooldownMinutes: String(watchlist.refreshCooldownMinutes),
    autoRefreshEnabled: watchlist.autoRefreshEnabled,
    marketSession: watchlist.marketSession
  };
}

function parseSymbols(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[\s,;]+/g)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => {
      if (!symbol || seen.has(symbol)) {
        return false;
      }
      seen.add(symbol);
      return true;
    });
}

function buildUpsertPayload(draft: WatchlistDraft): IntradayWatchlistUpsertRequest {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    enabled: draft.enabled,
    symbols: parseSymbols(draft.symbolsText),
    pollIntervalMinutes: Math.max(1, Number.parseInt(draft.pollIntervalMinutes || '5', 10) || 5),
    refreshCooldownMinutes: Math.max(
      1,
      Number.parseInt(draft.refreshCooldownMinutes || '15', 10) || 15
    ),
    autoRefreshEnabled: draft.autoRefreshEnabled,
    marketSession: FIXED_MARKET_SESSION
  };
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsed);
}

function formatPrice(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1_000 ? 0 : 2
  }).format(value);
}

function formatInteger(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '0';
  }
  return new Intl.NumberFormat('en-US').format(value);
}

function formatBacklogAge(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return 'None';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3_600)}h`;
}

function runStatusVariant(status: IntradayMonitorRunSummary['status']) {
  if (status === 'failed') return 'destructive' as const;
  if (status === 'claimed') return 'secondary' as const;
  if (status === 'completed') return 'default' as const;
  return 'outline' as const;
}

function refreshStatusVariant(status: IntradayRefreshBatchSummary['status']) {
  if (status === 'failed') return 'destructive' as const;
  if (status === 'claimed') return 'secondary' as const;
  if (status === 'completed') return 'default' as const;
  return 'outline' as const;
}

function symbolStatusVariant(status: IntradaySymbolStatus['monitorStatus']) {
  if (status === 'failed') return 'destructive' as const;
  if (status === 'refresh_queued') return 'secondary' as const;
  if (status === 'refreshed') return 'default' as const;
  return 'outline' as const;
}

function eventSeverityVariant(severity: IntradayMonitorEvent['severity']) {
  if (severity === 'error') return 'destructive' as const;
  if (severity === 'warning') return 'secondary' as const;
  return 'outline' as const;
}

function latestDetail(summary?: IntradayWatchlistSummary | null): string {
  if (!summary) return 'No watchlists configured yet.';
  if (summary.lastRunAt) {
    return `Last run ${formatDateTime(summary.lastRunAt)}.`;
  }
  if (summary.nextDueAt) {
    return `Next due ${formatDateTime(summary.nextDueAt)}.`;
  }
  return 'No runs recorded yet.';
}

function executionLink(executionName?: string | null) {
  const normalized = String(executionName || '').trim();
  if (!normalized) {
    return <span className="text-muted-foreground">Pending claim</span>;
  }

  return (
    <div className="space-y-1">
      <div className="font-mono text-xs text-foreground">{normalized}</div>
      <Link
        className="text-xs font-semibold uppercase tracking-[0.14em] text-mcm-teal transition hover:text-mcm-walnut"
        to="/system-status"
      >
        Open Job Stream
      </Link>
    </div>
  );
}

export function IntradayMonitorPage() {
  const queryClient = useQueryClient();
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(null);
  const [isCreatingWatchlist, setIsCreatingWatchlist] = useState(false);
  const [draft, setDraft] = useState<WatchlistDraft>(createEmptyDraft);
  const [statusSearch, setStatusSearch] = useState('');
  const deferredStatusSearch = useDeferredValue(statusSearch.trim());

  useEffect(() => {
    requestRealtimeSubscription(INTRADAY_REALTIME_TOPICS);
    return () => requestRealtimeUnsubscription(INTRADAY_REALTIME_TOPICS);
  }, []);

  const watchlistsQuery = useQuery({
    queryKey: intradayMonitorKeys.watchlists(),
    queryFn: ({ signal }) => intradayMonitorApi.listWatchlists(signal),
    refetchInterval: WATCHLIST_REFETCH_INTERVAL_MS
  });

  const selectedFilterWatchlistId = isCreatingWatchlist ? undefined : selectedWatchlistId || undefined;

  const watchlistDetailQuery = useQuery({
    queryKey: intradayMonitorKeys.watchlist(selectedWatchlistId),
    queryFn: ({ signal }) => intradayMonitorApi.getWatchlist(selectedWatchlistId || '', signal),
    enabled: Boolean(selectedWatchlistId) && !isCreatingWatchlist
  });

  const statusQuery = useQuery({
    queryKey: intradayMonitorKeys.status(selectedFilterWatchlistId, deferredStatusSearch),
    queryFn: ({ signal }) =>
      intradayMonitorApi.getStatus(
        {
          watchlistId: selectedFilterWatchlistId,
          q: deferredStatusSearch || undefined,
          limit: 100
        },
        signal
      ),
    refetchInterval: STATUS_REFETCH_INTERVAL_MS
  });

  const runsQuery = useQuery({
    queryKey: intradayMonitorKeys.runs(selectedFilterWatchlistId),
    queryFn: ({ signal }) =>
      intradayMonitorApi.listRuns({ watchlistId: selectedFilterWatchlistId, limit: 12 }, signal),
    refetchInterval: STATUS_REFETCH_INTERVAL_MS
  });

  const eventsQuery = useQuery({
    queryKey: intradayMonitorKeys.events(selectedFilterWatchlistId),
    queryFn: ({ signal }) =>
      intradayMonitorApi.listEvents({ watchlistId: selectedFilterWatchlistId, limit: 12 }, signal),
    refetchInterval: STATUS_REFETCH_INTERVAL_MS
  });

  const refreshBatchesQuery = useQuery({
    queryKey: intradayMonitorKeys.refreshBatches(selectedFilterWatchlistId),
    queryFn: ({ signal }) =>
      intradayMonitorApi.listRefreshBatches(
        { watchlistId: selectedFilterWatchlistId, limit: 12 },
        signal
      ),
    refetchInterval: STATUS_REFETCH_INTERVAL_MS
  });

  useEffect(() => {
    const watchlists = watchlistsQuery.data || [];
    if (isCreatingWatchlist) {
      return;
    }
    if (!watchlists.length) {
      setSelectedWatchlistId(null);
      return;
    }
    if (!selectedWatchlistId || !watchlists.some((item) => item.watchlistId === selectedWatchlistId)) {
      setSelectedWatchlistId(watchlists[0].watchlistId);
    }
  }, [isCreatingWatchlist, selectedWatchlistId, watchlistsQuery.data]);

  useEffect(() => {
    if (isCreatingWatchlist) {
      setDraft(createEmptyDraft());
      return;
    }
    if (watchlistDetailQuery.data) {
      setDraft(buildDraftFromWatchlist(watchlistDetailQuery.data));
    }
  }, [isCreatingWatchlist, watchlistDetailQuery.data]);

  const refreshAllQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: intradayMonitorKeys.all() });
  };

  const saveWatchlistMutation = useMutation({
    mutationFn: async () => {
      const payload = buildUpsertPayload(draft);
      if (!payload.name) {
        throw new Error('Watchlist name is required.');
      }
      if (!payload.symbols.length) {
        throw new Error('Add at least one symbol before saving.');
      }
      return isCreatingWatchlist || !selectedWatchlistId
        ? intradayMonitorApi.createWatchlist(payload)
        : intradayMonitorApi.updateWatchlist(selectedWatchlistId, payload);
    },
    onSuccess: async (watchlist) => {
      setIsCreatingWatchlist(false);
      setSelectedWatchlistId(watchlist.watchlistId);
      setDraft(buildDraftFromWatchlist(watchlist));
      toast.success(
        isCreatingWatchlist
          ? `Created intraday watchlist ${watchlist.name}.`
          : `Updated intraday watchlist ${watchlist.name}.`
      );
      await refreshAllQueries();
    },
    onError: (error) => {
      toast.error(`Failed to save intraday watchlist: ${formatSystemStatusText(error)}`);
    }
  });

  const deleteWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWatchlistId) {
        throw new Error('Select a watchlist before deleting.');
      }
      return intradayMonitorApi.deleteWatchlist(selectedWatchlistId);
    },
    onSuccess: async () => {
      const deletedWatchlistId = selectedWatchlistId;
      setIsCreatingWatchlist(false);
      setSelectedWatchlistId(null);
      setDraft(createEmptyDraft());
      toast.success('Intraday watchlist deleted.');
      await refreshAllQueries();
      if (deletedWatchlistId) {
        queryClient.removeQueries({ queryKey: intradayMonitorKeys.watchlist(deletedWatchlistId) });
      }
    },
    onError: (error) => {
      toast.error(`Failed to delete intraday watchlist: ${formatSystemStatusText(error)}`);
    }
  });

  const runWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWatchlistId) {
        throw new Error('Select a watchlist before requesting a run.');
      }
      return intradayMonitorApi.runWatchlist(selectedWatchlistId);
    },
    onSuccess: async (run) => {
      toast.success(`Queued intraday monitor run ${run.runId}.`);
      await refreshAllQueries();
    },
    onError: (error) => {
      toast.error(`Failed to queue intraday monitor run: ${formatSystemStatusText(error)}`);
    }
  });

  const isInitialLoading =
    watchlistsQuery.isLoading ||
    statusQuery.isLoading ||
    runsQuery.isLoading ||
    eventsQuery.isLoading ||
    refreshBatchesQuery.isLoading;
  const initialError =
    watchlistsQuery.error ||
    statusQuery.error ||
    runsQuery.error ||
    eventsQuery.error ||
    refreshBatchesQuery.error;

  if (isInitialLoading) {
    return (
      <div className="page-shell">
        <PageHero
          kicker="Live Operations"
          title={
            <span className="flex items-center gap-2">
              <Waves className="h-5 w-5 text-mcm-teal" />
              Intraday Monitor
            </span>
          }
          subtitle="Configure watchlists, track intraday symbol state, and follow targeted market refresh work without leaving the operator console."
        />
        <PageLoader text="Loading intraday monitor console..." variant="panel" />
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="page-shell">
        <PageHero
          kicker="Live Operations"
          title={
            <span className="flex items-center gap-2">
              <Waves className="h-5 w-5 text-mcm-teal" />
              Intraday Monitor
            </span>
          }
          subtitle="Configure watchlists, track intraday symbol state, and follow targeted market refresh work without leaving the operator console."
        />
        <StatePanel
          tone="error"
          title="Intraday Monitor Unavailable"
          message={formatSystemStatusText(initialError)}
          className="mcm-panel border-destructive/30 bg-destructive/10"
        />
      </div>
    );
  }

  const watchlists = watchlistsQuery.data || [];
  const statusResponse = statusQuery.data;
  const symbolStatuses = statusResponse?.items || [];
  const runs = runsQuery.data || [];
  const events = eventsQuery.data || [];
  const refreshBatches = refreshBatchesQuery.data || [];
  const selectedWatchlist = watchlists.find((item) => item.watchlistId === selectedWatchlistId) || null;
  const isMutating =
    saveWatchlistMutation.isPending ||
    deleteWatchlistMutation.isPending ||
    runWatchlistMutation.isPending;

  return (
    <div className="page-shell">
      <PageHero
        kicker="Live Operations"
        title={
          <span className="flex items-center gap-2">
            <Waves className="h-5 w-5 text-mcm-teal" />
            Intraday Monitor
          </span>
        }
        subtitle="Configure watchlists, track intraday symbol state, and follow targeted market refresh work without leaving the operator console."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreatingWatchlist(true);
                setSelectedWatchlistId(null);
                setDraft(createEmptyDraft());
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Watchlist
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void refreshAllQueries();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh View
            </Button>
          </>
        }
        metrics={[
          {
            label: 'Enabled Watchlists',
            value: formatInteger(statusResponse?.counts.enabledWatchlistCount),
            detail: `${formatInteger(statusResponse?.counts.watchlistCount)} total configured`,
            icon: <Activity className="h-4 w-4" />
          },
          {
            label: 'Due Run Backlog',
            value: formatInteger(statusResponse?.counts.dueRunBacklogCount),
            detail: `${formatInteger(statusResponse?.counts.failedRunCount)} failed runs waiting for review`,
            icon: <Clock3 className="h-4 w-4" />
          },
          {
            label: 'Stale Symbols',
            value: formatInteger(statusResponse?.counts.staleSymbolCount),
            detail: `Refresh backlog age ${formatBacklogAge(statusResponse?.counts.refreshBatchBacklogAgeSeconds)}`,
            icon: <Layers3 className="h-4 w-4" />
          }
        ]}
      />

      <section className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="mcm-panel border-mcm-walnut/15">
          <CardHeader className="border-b border-mcm-walnut/10 pb-4">
            <CardTitle className="font-display text-xl tracking-[0.04em] text-foreground">
              Watchlists
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {!watchlists.length ? (
              <StatePanel
                tone="info"
                title="No Watchlists Yet"
                message="Create the first intraday watchlist to start polling symbols and staging targeted market refreshes."
              />
            ) : null}
            {watchlists.map((watchlist) => {
              const isSelected = !isCreatingWatchlist && selectedWatchlistId === watchlist.watchlistId;
              return (
                <button
                  key={watchlist.watchlistId}
                  className={`w-full rounded-[1.2rem] border px-4 py-4 text-left transition ${
                    isSelected
                      ? 'border-mcm-teal/40 bg-mcm-teal/10 shadow-[6px_6px_0px_0px_rgba(0,133,127,0.08)]'
                      : 'border-mcm-walnut/15 bg-mcm-paper/70 hover:border-mcm-walnut/30'
                  }`}
                  onClick={() => {
                    setIsCreatingWatchlist(false);
                    setSelectedWatchlistId(watchlist.watchlistId);
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-display text-lg tracking-[0.04em] text-foreground">
                        {watchlist.name}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {watchlist.symbolCount} symbols
                      </div>
                    </div>
                    <Badge variant={watchlist.enabled ? 'default' : 'outline'}>
                      {watchlist.enabled ? 'Enabled' : 'Paused'}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    <div>{latestDetail(watchlist)}</div>
                    <div>
                      Poll every {watchlist.pollIntervalMinutes}m, refresh cooldown{' '}
                      {watchlist.refreshCooldownMinutes}m.
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="mcm-panel border-mcm-walnut/15">
          <CardHeader className="border-b border-mcm-walnut/10 pb-4">
            <CardTitle className="font-display text-xl tracking-[0.04em] text-foreground">
              {isCreatingWatchlist ? 'New Watchlist' : selectedWatchlist?.name || 'Watchlist Configuration'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-5">
            {watchlistDetailQuery.error && !isCreatingWatchlist ? (
              <StatePanel
                tone="error"
                title="Watchlist Detail Unavailable"
                message={formatSystemStatusText(watchlistDetailQuery.error)}
              />
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="intraday-watchlist-name">Name</Label>
                <Input
                  id="intraday-watchlist-name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="US Large Cap Leaders"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="intraday-watchlist-session">Market Session</Label>
                <div
                  className="flex h-10 items-center rounded-md border border-mcm-walnut/15 bg-mcm-paper/80 px-3 text-sm text-foreground"
                  id="intraday-watchlist-session"
                >
                  US equities regular session
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="intraday-watchlist-description">Description</Label>
              <Textarea
                id="intraday-watchlist-description"
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="High-priority symbols to refresh during the regular trading session."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="intraday-watchlist-symbols">Symbols</Label>
              <Textarea
                id="intraday-watchlist-symbols"
                value={draft.symbolsText}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, symbolsText: event.target.value }))
                }
                placeholder={'AAPL\nMSFT\nNVDA'}
                rows={7}
              />
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                One symbol per line or comma-separated.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="intraday-poll-interval">Poll Interval (minutes)</Label>
                <Input
                  id="intraday-poll-interval"
                  inputMode="numeric"
                  type="number"
                  min={1}
                  value={draft.pollIntervalMinutes}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      pollIntervalMinutes: event.target.value
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="intraday-refresh-cooldown">Refresh Cooldown (minutes)</Label>
                <Input
                  id="intraday-refresh-cooldown"
                  inputMode="numeric"
                  type="number"
                  min={1}
                  value={draft.refreshCooldownMinutes}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      refreshCooldownMinutes: event.target.value
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-[1rem] border border-mcm-walnut/15 bg-mcm-paper/70 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Enabled</div>
                  <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Schedule active
                  </div>
                </div>
                <Switch
                  checked={draft.enabled}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, enabled: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-[1rem] border border-mcm-walnut/15 bg-mcm-paper/70 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Auto Refresh</div>
                  <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Queue market medallion work
                  </div>
                </div>
                <Switch
                  checked={draft.autoRefreshEnabled}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, autoRefreshEnabled: checked }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => saveWatchlistMutation.mutate()} disabled={isMutating}>
                {saveWatchlistMutation.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {isCreatingWatchlist ? 'Create Watchlist' : 'Save Watchlist'}
              </Button>
              <Button
                variant="outline"
                onClick={() => runWatchlistMutation.mutate()}
                disabled={!selectedWatchlistId || isCreatingWatchlist || isMutating}
              >
                {runWatchlistMutation.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Manual Run
              </Button>
              <Button
                variant="outline"
                onClick={() => deleteWatchlistMutation.mutate()}
                disabled={!selectedWatchlistId || isCreatingWatchlist || isMutating}
              >
                {deleteWatchlistMutation.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6">
        <Card className="mcm-panel border-mcm-walnut/15">
          <CardHeader className="border-b border-mcm-walnut/10 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="font-display text-xl tracking-[0.04em] text-foreground">
                  Live Symbol Status
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedWatchlist
                    ? `Showing ${selectedWatchlist.name}.`
                    : 'Showing all configured watchlists.'}
                </p>
              </div>
              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search symbols"
                  value={statusSearch}
                  onChange={(event) => setStatusSearch(event.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            {!symbolStatuses.length ? (
              <StatePanel
                tone="info"
                title="No Symbol Status Yet"
                message="Run a watchlist or wait for the scheduler to claim due work. Status rows appear after the first snapshot lands."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Snapshot</TableHead>
                      <TableHead>Observed Price</TableHead>
                      <TableHead>Last Market Refresh</TableHead>
                      <TableHead>Last Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {symbolStatuses.map((item) => (
                      <TableRow key={`${item.watchlistId || 'all'}-${item.symbol}`}>
                        <TableCell>
                          <div className="font-mono text-sm font-semibold text-foreground">
                            {item.symbol}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={symbolStatusVariant(item.monitorStatus)}>
                            {item.monitorStatus.replaceAll('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDateTime(item.lastSnapshotAt)}</TableCell>
                        <TableCell>{formatPrice(item.lastObservedPrice)}</TableCell>
                        <TableCell>{formatDateTime(item.lastSuccessfulMarketRefreshAt)}</TableCell>
                        <TableCell className="max-w-[22rem] text-sm text-muted-foreground">
                          {item.lastError || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="mcm-panel border-mcm-walnut/15">
            <CardHeader className="border-b border-mcm-walnut/10 pb-4">
              <CardTitle className="font-display text-xl tracking-[0.04em] text-foreground">
                Monitor Runs
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {!runs.length ? (
                <StatePanel
                  tone="info"
                  title="No Runs Yet"
                  message="Queued and completed monitor runs show up here with refresh eligibility and claim status."
                />
              ) : (
                <div className="space-y-3">
                  {runs.map((run) => (
                    <div
                      className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-paper/70 p-4"
                      key={run.runId}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-display text-lg tracking-[0.04em] text-foreground">
                            {run.watchlistName || run.watchlistId}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                            {run.triggerKind} run · {run.runId}
                          </div>
                        </div>
                        <Badge variant={runStatusVariant(run.status)}>{run.status}</Badge>
                      </div>
                      <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                        <div>
                          Observed {formatInteger(run.observedSymbolCount)} / {formatInteger(run.symbolCount)} symbols, queued{' '}
                          {formatInteger(run.refreshBatchCount)} refresh batches.
                        </div>
                        <div>Eligible refresh symbols: {formatInteger(run.eligibleRefreshCount)}</div>
                        <div>{executionLink(run.executionName)}</div>
                        <div>Completed {formatDateTime(run.completedAt || run.claimedAt || run.queuedAt)}</div>
                        {run.lastError ? (
                          <div className="text-destructive">{run.lastError}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mcm-panel border-mcm-walnut/15">
            <CardHeader className="border-b border-mcm-walnut/10 pb-4">
              <CardTitle className="font-display text-xl tracking-[0.04em] text-foreground">
                Refresh Batches
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {!refreshBatches.length ? (
                <StatePanel
                  tone="info"
                  title="No Refresh Batches Yet"
                  message="When monitor runs find stale symbols, bucketed market refresh work shows up here."
                />
              ) : (
                <div className="space-y-3">
                  {refreshBatches.map((batch) => (
                    <div
                      className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-paper/70 p-4"
                      key={batch.batchId}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-display text-lg tracking-[0.04em] text-foreground">
                            {batch.watchlistName || batch.watchlistId}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                            {batch.domain} bucket {batch.bucketLetter.toUpperCase()}
                          </div>
                        </div>
                        <Badge variant={refreshStatusVariant(batch.status)}>{batch.status}</Badge>
                      </div>
                      <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                        <div>{formatInteger(batch.symbolCount)} symbols in batch.</div>
                        <div>{executionLink(batch.executionName)}</div>
                        <div>Updated {formatDateTime(batch.updatedAt || batch.completedAt || batch.createdAt)}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {batch.symbols.slice(0, 6).join(', ')}
                          {batch.symbols.length > 6 ? ` +${batch.symbols.length - 6} more` : ''}
                        </div>
                        {batch.lastError ? (
                          <div className="text-destructive">{batch.lastError}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mcm-panel border-mcm-walnut/15">
            <CardHeader className="border-b border-mcm-walnut/10 pb-4">
              <CardTitle className="font-display text-xl tracking-[0.04em] text-foreground">
                Event Stream
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {!events.length ? (
                <StatePanel
                  tone="info"
                  title="No Events Yet"
                  message="Snapshot anomalies, queue actions, and refresh outcomes appear here once monitor jobs start running."
                />
              ) : (
                <div className="space-y-3">
                  {events.map((event) => (
                    <div
                      className="rounded-[1.2rem] border border-mcm-walnut/15 bg-mcm-paper/70 p-4"
                      key={event.eventId || `${event.runId || 'run'}-${event.createdAt || event.message}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground">{event.message}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                            {event.eventType}
                            {event.symbol ? ` · ${event.symbol}` : ''}
                          </div>
                        </div>
                        <Badge variant={eventSeverityVariant(event.severity)}>{event.severity}</Badge>
                      </div>
                      <div className="mt-3 text-sm text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
