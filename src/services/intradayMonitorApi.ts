import { request } from '@/services/apiService';

export type IntradayMarketSession = 'us_equities_regular';
export type IntradayMonitorTriggerKind = 'scheduled' | 'manual';
export type IntradayMonitorRunStatus = 'queued' | 'claimed' | 'completed' | 'failed';
export type IntradayRefreshBatchStatus = 'queued' | 'claimed' | 'completed' | 'failed';
export type IntradayEventSeverity = 'info' | 'warning' | 'error';
export type IntradaySymbolMonitorStatus =
  | 'idle'
  | 'observed'
  | 'refresh_queued'
  | 'refreshed'
  | 'failed';

export interface IntradayWatchlistSummary {
  watchlistId: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  symbolCount: number;
  pollIntervalMinutes: number;
  refreshCooldownMinutes: number;
  autoRefreshEnabled: boolean;
  marketSession: IntradayMarketSession;
  nextDueAt?: string | null;
  lastRunAt?: string | null;
  updatedAt?: string | null;
}

export interface IntradayWatchlistDetail extends IntradayWatchlistSummary {
  symbols: string[];
  createdAt?: string | null;
}

export interface IntradayWatchlistUpsertRequest {
  name: string;
  description?: string | null;
  enabled: boolean;
  symbols: string[];
  pollIntervalMinutes: number;
  refreshCooldownMinutes: number;
  autoRefreshEnabled: boolean;
  marketSession: IntradayMarketSession;
}

export type IntradayWatchlistSymbolAppendRunSkippedReason =
  | 'watchlist_disabled'
  | 'no_new_symbols'
  | 'queue_run_disabled';

export interface IntradayWatchlistSymbolAppendRequest {
  symbols: string[];
  queueRun: boolean;
  reason?: string | null;
}

export interface IntradayWatchlistSymbolAppendResponse {
  watchlist: IntradayWatchlistDetail;
  addedSymbols: string[];
  alreadyPresentSymbols: string[];
  queuedRun?: IntradayMonitorRunSummary | null;
  runSkippedReason?: IntradayWatchlistSymbolAppendRunSkippedReason | null;
}

export interface IntradaySymbolStatus {
  watchlistId?: string | null;
  symbol: string;
  monitorStatus: IntradaySymbolMonitorStatus;
  lastSnapshotAt?: string | null;
  lastObservedPrice?: number | null;
  lastSuccessfulMarketRefreshAt?: string | null;
  lastRunId?: string | null;
  lastError?: string | null;
  updatedAt?: string | null;
}

export interface IntradayMonitorRunSummary {
  runId: string;
  watchlistId: string;
  watchlistName?: string | null;
  triggerKind: IntradayMonitorTriggerKind;
  status: IntradayMonitorRunStatus;
  forceRefresh: boolean;
  symbolCount: number;
  observedSymbolCount: number;
  eligibleRefreshCount: number;
  refreshBatchCount: number;
  executionName?: string | null;
  dueAt?: string | null;
  queuedAt?: string | null;
  claimedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
}

export interface IntradayMonitorEvent {
  eventId?: string | null;
  runId?: string | null;
  watchlistId?: string | null;
  symbol?: string | null;
  eventType: string;
  severity: IntradayEventSeverity;
  message: string;
  details: Record<string, unknown>;
  createdAt?: string | null;
}

export interface IntradayRefreshBatchSummary {
  batchId: string;
  runId: string;
  watchlistId: string;
  watchlistName?: string | null;
  domain: string;
  bucketLetter: string;
  status: IntradayRefreshBatchStatus;
  symbols: string[];
  symbolCount: number;
  executionName?: string | null;
  claimedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastError?: string | null;
}

export interface IntradayStatusCounts {
  watchlistCount: number;
  enabledWatchlistCount: number;
  dueRunBacklogCount: number;
  failedRunCount: number;
  staleSymbolCount: number;
  refreshBatchBacklogAgeSeconds: number;
}

export interface IntradayStatusResponse {
  counts: IntradayStatusCounts;
  latestMonitorRun?: IntradayMonitorRunSummary | null;
  latestRefreshBatch?: IntradayRefreshBatchSummary | null;
  total: number;
  items: IntradaySymbolStatus[];
}

export const intradayMonitorKeys = {
  all: () => ['intraday-monitor'] as const,
  watchlists: () => [...intradayMonitorKeys.all(), 'watchlists'] as const,
  watchlist: (watchlistId: string | null) =>
    [...intradayMonitorKeys.watchlists(), 'detail', watchlistId ?? 'new'] as const,
  status: (watchlistId?: string | null, q?: string | null) =>
    [...intradayMonitorKeys.all(), 'status', watchlistId ?? 'all', q?.trim() || 'all'] as const,
  runs: (watchlistId?: string | null) =>
    [...intradayMonitorKeys.all(), 'runs', watchlistId ?? 'all'] as const,
  events: (watchlistId?: string | null) =>
    [...intradayMonitorKeys.all(), 'events', watchlistId ?? 'all'] as const,
  refreshBatches: (watchlistId?: string | null) =>
    [...intradayMonitorKeys.all(), 'refresh-batches', watchlistId ?? 'all'] as const
};

export const intradayMonitorApi = {
  async listWatchlists(signal?: AbortSignal): Promise<IntradayWatchlistSummary[]> {
    return request<IntradayWatchlistSummary[]>('/intraday/watchlists', { signal });
  },

  async getWatchlist(watchlistId: string, signal?: AbortSignal): Promise<IntradayWatchlistDetail> {
    return request<IntradayWatchlistDetail>(`/intraday/watchlists/${encodeURIComponent(watchlistId)}`, {
      signal
    });
  },

  async createWatchlist(
    payload: IntradayWatchlistUpsertRequest,
    signal?: AbortSignal
  ): Promise<IntradayWatchlistDetail> {
    return request<IntradayWatchlistDetail>('/intraday/watchlists', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  },

  async updateWatchlist(
    watchlistId: string,
    payload: IntradayWatchlistUpsertRequest,
    signal?: AbortSignal
  ): Promise<IntradayWatchlistDetail> {
    return request<IntradayWatchlistDetail>(`/intraday/watchlists/${encodeURIComponent(watchlistId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      signal
    });
  },

  async deleteWatchlist(
    watchlistId: string,
    signal?: AbortSignal
  ): Promise<{ status: string }> {
    return request<{ status: string }>(`/intraday/watchlists/${encodeURIComponent(watchlistId)}`, {
      method: 'DELETE',
      signal
    });
  },

  async appendSymbols(
    watchlistId: string,
    payload: IntradayWatchlistSymbolAppendRequest,
    signal?: AbortSignal
  ): Promise<IntradayWatchlistSymbolAppendResponse> {
    return request<IntradayWatchlistSymbolAppendResponse>(
      `/intraday/watchlists/${encodeURIComponent(watchlistId)}/symbols`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        signal
      }
    );
  },

  async runWatchlist(watchlistId: string, signal?: AbortSignal): Promise<IntradayMonitorRunSummary> {
    return request<IntradayMonitorRunSummary>(
      `/intraday/watchlists/${encodeURIComponent(watchlistId)}/run`,
      {
        method: 'POST',
        signal
      }
    );
  },

  async getStatus(
    params: { watchlistId?: string; q?: string; limit?: number; offset?: number } = {},
    signal?: AbortSignal
  ): Promise<IntradayStatusResponse> {
    return request<IntradayStatusResponse>('/intraday/status', { params, signal });
  },

  async listRuns(
    params: { watchlistId?: string; limit?: number; offset?: number } = {},
    signal?: AbortSignal
  ): Promise<IntradayMonitorRunSummary[]> {
    return request<IntradayMonitorRunSummary[]>('/intraday/runs', { params, signal });
  },

  async listEvents(
    params: { watchlistId?: string; runId?: string; limit?: number; offset?: number } = {},
    signal?: AbortSignal
  ): Promise<IntradayMonitorEvent[]> {
    return request<IntradayMonitorEvent[]>('/intraday/events', { params, signal });
  },

  async listRefreshBatches(
    params: { watchlistId?: string; limit?: number; offset?: number } = {},
    signal?: AbortSignal
  ): Promise<IntradayRefreshBatchSummary[]> {
    return request<IntradayRefreshBatchSummary[]>('/intraday/refresh-batches', {
      params,
      signal
    });
  }
};
