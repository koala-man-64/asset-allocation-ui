/* global RequestInit */

import { FinanceData, MarketData } from '@/types/data';
import { DomainMetadata, SystemHealth } from '@/types/strategy';
import { config as uiConfig } from '@/config';
import type {
  AdlsFilePreviewResponse,
  AdlsTreeResponse,
  AuthSessionStatus,
  ContainerAppControlResponse,
  ContainerAppLogsResponse,
  ContainerAppsStatusResponse,
  DataProfilingResponse,
  DebugSymbolsResponse,
  DomainCheckpointResetRequest,
  DomainCheckpointResetResponse,
  DomainColumnsResponse,
  DomainListResetRequest,
  DomainListResetResponse,
  DomainListsResponse,
  DomainMetadataSnapshotResponse,
  JobLogsResponse,
  PurgeBlacklistSymbolsResponse,
  PurgeCandidatesRequest,
  PurgeCandidatesResponse,
  PurgeOperationResponse,
  PurgeRequest,
  ResponseWithMeta,
  RuntimeConfigCatalogResponse,
  RuntimeConfigItem,
  RuntimeConfigListResponse,
  StockScreenerResponse,
  StorageUsageResponse,
  SymbolSyncState,
  SystemStatusViewResponse,
  ValidationReport
} from '@/services/apiTypes';
import {
  appendAuthHeaders,
  hasInteractiveAuthHandler,
  requestInteractiveReauth
} from '@/services/authTransport';

export type * from '@/services/apiTypes';

const API_WARMUP_PATH = '/healthz';
const API_COLD_START_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const API_WARMUP_MAX_ATTEMPTS = 3;
const API_WARMUP_BASE_DELAY_MS = 500;
const API_WARMUP_MAX_DELAY_MS = 4000;
const API_WARMUP_TIMEOUT_MS = 5000;
const API_REQUEST_MAX_ATTEMPTS = 3;
const API_REQUEST_RETRY_BASE_DELAY_MS = 500;
const API_REQUEST_RETRY_MAX_DELAY_MS = 4000;

const apiWarmupAttempted = new Set<string>();
const apiWarmupInFlight = new Map<string, Promise<void>>();

function isRetryableStatusCode(statusCode: number): boolean {
  return API_COLD_START_RETRYABLE_STATUS_CODES.has(statusCode);
}

function isRetryableFetchError(error: unknown, externalSignal?: AbortSignal | null): boolean {
  if (externalSignal?.aborted) {
    return false;
  }

  if (error instanceof Error && error.message.startsWith('API timeout after ')) {
    return true;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('connection refused') ||
    message.includes('load failed')
  );
}

function resolveWarmupUrl(apiBaseUrl: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '').replace(/\/api$/i, '');
  return `${base || ''}${API_WARMUP_PATH}`;
}

function buildRequestUrl(
  apiBaseUrl: string,
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  let url = `${apiBaseUrl}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  return url;
}

async function wait(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function fetchWithOptionalTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number | undefined,
  endpointLabel: string,
  requestId: string
): Promise<Response> {
  let timeoutController: AbortController | undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let mergedSignal: AbortSignal | null | undefined = init.signal;
  let removeExternalAbortListener: (() => void) | undefined;

  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutController = new AbortController();
    timeoutHandle = setTimeout(
      () => {
        timeoutController?.abort();
      },
      Math.max(1, Math.floor(timeoutMs))
    );

    if (init.signal) {
      if (init.signal.aborted) {
        timeoutController.abort();
      } else {
        const relayAbort = () => timeoutController?.abort();
        init.signal.addEventListener('abort', relayAbort, { once: true });
        removeExternalAbortListener = () => init.signal?.removeEventListener('abort', relayAbort);
      }
    }
    mergedSignal = timeoutController.signal;
  }

  try {
    return await fetch(url, {
      ...init,
      signal: mergedSignal ?? undefined
    });
  } catch (error) {
    if (timeoutController?.signal.aborted && !init.signal?.aborted) {
      throw new Error(
        `API timeout after ${Math.floor(timeoutMs || 0)}ms [requestId=${requestId}] - ${endpointLabel}`
      );
    }
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    if (removeExternalAbortListener) {
      removeExternalAbortListener();
    }
  }
}

async function warmUpApiOnce(apiBaseUrl: string): Promise<void> {
  if (apiWarmupAttempted.has(apiBaseUrl)) {
    return;
  }

  if (!apiWarmupInFlight.has(apiBaseUrl)) {
    const warmupPromise = (async () => {
      let delayMs = API_WARMUP_BASE_DELAY_MS;
      const warmupUrl = resolveWarmupUrl(apiBaseUrl);

      try {
        for (let attempt = 1; attempt <= API_WARMUP_MAX_ATTEMPTS; attempt += 1) {
          const shouldRetry = attempt < API_WARMUP_MAX_ATTEMPTS;
          try {
            const response = await fetchWithOptionalTimeout(
              warmupUrl,
              {
                method: 'GET',
                headers: new Headers({ 'X-Request-ID': createRequestId() }),
                cache: 'no-store'
              },
              API_WARMUP_TIMEOUT_MS,
              API_WARMUP_PATH,
              'warmup'
            );
            if (response.status < 400) {
              return;
            }
            if (!shouldRetry || !isRetryableStatusCode(response.status)) {
              return;
            }
          } catch (error) {
            if (!shouldRetry || !isRetryableFetchError(error)) {
              return;
            }
          }

          await wait(delayMs);
          delayMs = Math.min(API_WARMUP_MAX_DELAY_MS, Math.max(delayMs * 2, 100));
        }
      } finally {
        apiWarmupAttempted.add(apiBaseUrl);
        apiWarmupInFlight.delete(apiBaseUrl);
      }
    })();
    apiWarmupInFlight.set(apiBaseUrl, warmupPromise);
  }

  await apiWarmupInFlight.get(apiBaseUrl);
}

export interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  retryOnStatusCodes?: number[] | false;
  retryAttempts?: number;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function performRequest<T>(
  endpoint: string,
  config: RequestConfig = {}
): Promise<ResponseWithMeta<T>> {
  const { params, headers, timeoutMs, retryOnStatusCodes, retryAttempts, ...customConfig } = config;
  const apiBaseUrl = uiConfig.apiBaseUrl;
  const maxAttempts = Number.isFinite(retryAttempts)
    ? Math.max(1, Math.floor(Number(retryAttempts)))
    : API_REQUEST_MAX_ATTEMPTS;
  const retryableStatusCodes =
    retryOnStatusCodes === false
      ? new Set<number>()
      : Array.isArray(retryOnStatusCodes)
        ? new Set<number>(retryOnStatusCodes)
        : API_COLD_START_RETRYABLE_STATUS_CODES;

  let url = buildRequestUrl(apiBaseUrl, endpoint, params);

  const requestHeaders = new Headers(headers);
  const hasBody = customConfig.body !== undefined && customConfig.body !== null;
  if (hasBody && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }
  if (!requestHeaders.has('X-Request-ID')) {
    requestHeaders.set('X-Request-ID', createRequestId());
  }
  const authHeaders = await appendAuthHeaders(requestHeaders);
  const requestId = authHeaders.get('X-Request-ID') || '';
  await warmUpApiOnce(apiBaseUrl);

  let retryDelayMs = API_REQUEST_RETRY_BASE_DELAY_MS;
  let response: Response | null = null;
  const startedAt = performance.now();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const shouldRetry = attempt < maxAttempts;
    try {
      response = await fetchWithOptionalTimeout(
        url,
        {
          headers: authHeaders,
          ...customConfig
        },
        timeoutMs,
        endpoint,
        requestId
      );
    } catch (error) {
      if (!shouldRetry || !isRetryableFetchError(error, customConfig.signal)) {
        throw error;
      }
      await wait(retryDelayMs);
      retryDelayMs = Math.min(API_REQUEST_RETRY_MAX_DELAY_MS, Math.max(retryDelayMs * 2, 100));
      continue;
    }

    if (response.ok) {
      break;
    }

    if (!shouldRetry || !retryableStatusCodes.has(response.status)) {
      break;
    }

    await wait(retryDelayMs);
    retryDelayMs = Math.min(API_REQUEST_RETRY_MAX_DELAY_MS, Math.max(retryDelayMs * 2, 100));
  }

  if (!response) {
    throw new Error(`API request failed with no response [requestId=${requestId}] - ${endpoint}`);
  }

  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401 && hasInteractiveAuthHandler()) {
      await requestInteractiveReauth({
        reason: `API ${endpoint} returned 401.`,
        source: `api:${endpoint}`
      });
    }
    throw new ApiError(
      response.status,
      `API Error: ${response.status} ${response.statusText} [requestId=${requestId}] - ${errorBody}`
    );
  }

  let data: T;
  if (response.status === 204) {
    data = {} as T;
  } else {
    data = (await response.json()) as T;
  }

  return {
    data,
    meta: {
      requestId,
      status: response.status,
      durationMs,
      url: response.url || url,
      cacheHint: response.headers.get('X-System-Health-Cache') || undefined,
      cacheDegraded: response.headers.get('X-System-Health-Cache-Degraded') === '1'
    }
  };
}

export async function request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
  const result = await performRequest<T>(endpoint, config);
  return result.data;
}

export async function requestWithMeta<T>(
  endpoint: string,
  config: RequestConfig = {}
): Promise<ResponseWithMeta<T>> {
  return performRequest<T>(endpoint, config);
}

export const apiService = {
  // --- Data Endpoints ---

  getMarketData(
    ticker: string,
    layer: 'silver' | 'gold' = 'silver',
    signal?: AbortSignal
  ): Promise<MarketData[]> {
    return request<MarketData[]>(`/data/${layer}/market`, { params: { ticker }, signal });
  },

  getFinanceData(
    ticker: string,
    subDomain: string,
    layer: 'silver' | 'gold' = 'silver',
    signal?: AbortSignal
  ): Promise<FinanceData[]> {
    return request<FinanceData[]>(`/data/${layer}/finance/${encodeURIComponent(subDomain)}`, {
      params: { ticker },
      signal
    });
  },

  getSystemHealth(params: { refresh?: boolean } = {}): Promise<SystemHealth> {
    return request<SystemHealth>('/system/health', { params });
  },

  getSystemHealthWithMeta(
    params: { refresh?: boolean } = {}
  ): Promise<ResponseWithMeta<SystemHealth>> {
    return requestWithMeta<SystemHealth>('/system/health', { params });
  },

  getAuthSessionStatusWithMeta(): Promise<ResponseWithMeta<AuthSessionStatus>> {
    return requestWithMeta<AuthSessionStatus>('/auth/session');
  },

  getDomainMetadata(
    layer: 'bronze' | 'silver' | 'gold' | 'platinum',
    domain: string,
    params: { refresh?: boolean } = {}
  ): Promise<DomainMetadata> {
    return request<DomainMetadata>('/system/domain-metadata', {
      params: { layer, domain, ...params }
    });
  },

  getDomainMetadataSnapshot(
    params: { layers?: string; domains?: string; refresh?: boolean } = {}
  ): Promise<DomainMetadataSnapshotResponse> {
    return request<DomainMetadataSnapshotResponse>('/system/domain-metadata/snapshot', {
      params
    });
  },

  getSystemStatusView(
    params: {
      refresh?: boolean;
    } = {}
  ): Promise<SystemStatusViewResponse> {
    return request<SystemStatusViewResponse>('/system/status-view', { params });
  },

  getPersistedDomainMetadataSnapshotCache(): Promise<DomainMetadataSnapshotResponse> {
    return request<DomainMetadataSnapshotResponse>('/system/domain-metadata/snapshot/cache');
  },

  savePersistedDomainMetadataSnapshotCache(
    payload: DomainMetadataSnapshotResponse
  ): Promise<DomainMetadataSnapshotResponse> {
    return request<DomainMetadataSnapshotResponse>('/system/domain-metadata/snapshot/cache', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  getDomainColumns(
    layer: 'bronze' | 'silver' | 'gold',
    domain: string
  ): Promise<DomainColumnsResponse> {
    return request<DomainColumnsResponse>('/system/domain-columns', {
      params: { layer, domain },
      timeoutMs: 10000
    });
  },

  refreshDomainColumns(payload: {
    layer: 'bronze' | 'silver' | 'gold';
    domain: string;
    sample_limit?: number;
  }): Promise<DomainColumnsResponse> {
    return request<DomainColumnsResponse>('/system/domain-columns/refresh', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 30000
    });
  },

  getLineage(): Promise<unknown> {
    return request<unknown>('/system/lineage');
  },

  getJobLogs(
    jobName: string,
    params: { runs?: number } = {},
    signal?: AbortSignal
  ): Promise<JobLogsResponse> {
    return request<JobLogsResponse>(`/system/jobs/${jobName}/logs`, {
      params,
      signal
    });
  },

  getContainerApps(
    params: { probe?: boolean } = {},
    signal?: AbortSignal
  ): Promise<ContainerAppsStatusResponse> {
    return request<ContainerAppsStatusResponse>('/system/container-apps', {
      params: { probe: params.probe ?? true },
      signal
    });
  },

  startContainerApp(appName: string, signal?: AbortSignal): Promise<ContainerAppControlResponse> {
    return request<ContainerAppControlResponse>(
      `/system/container-apps/${encodeURIComponent(appName)}/start`,
      {
        method: 'POST',
        signal
      }
    );
  },

  stopContainerApp(appName: string, signal?: AbortSignal): Promise<ContainerAppControlResponse> {
    return request<ContainerAppControlResponse>(
      `/system/container-apps/${encodeURIComponent(appName)}/stop`,
      {
        method: 'POST',
        signal
      }
    );
  },

  getContainerAppLogs(
    appName: string,
    params: { minutes?: number; tail?: number } = {},
    signal?: AbortSignal
  ): Promise<ContainerAppLogsResponse> {
    return request<ContainerAppLogsResponse>(
      `/system/container-apps/${encodeURIComponent(appName)}/logs`,
      {
        params: {
          minutes: params.minutes ?? 60,
          tail: params.tail ?? 50
        },
        signal
      }
    );
  },

  getStockScreener(
    params: {
      q?: string;
      limit?: number;
      offset?: number;
      asOf?: string;
      sort?: string;
      direction?: 'asc' | 'desc';
    } = {},
    signal?: AbortSignal
  ): Promise<StockScreenerResponse> {
    return request<StockScreenerResponse>('/data/screener', {
      params,
      signal
    });
  },

  getGenericData(
    layer: 'bronze' | 'silver' | 'gold',
    domain: string,
    ticker?: string,
    limit?: number,
    optionsOrSignal?: { sortByDate?: 'asc' | 'desc' } | AbortSignal,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>[]> {
    const options = optionsOrSignal instanceof AbortSignal ? undefined : optionsOrSignal;
    const resolvedSignal = optionsOrSignal instanceof AbortSignal ? optionsOrSignal : signal;
    const normalizedDomain = String(domain || '').trim();
    if (layer === 'gold' && normalizedDomain.startsWith('regime/')) {
      const dataset = normalizedDomain.slice('regime/'.length);
      return request<Record<string, unknown>[]>(
        `/data/gold/regime/${encodeURIComponent(dataset)}`,
        {
          params: {
            limit,
            date_sort: options?.sortByDate
          },
          signal: resolvedSignal
        }
      );
    }
    const endpoint = `/data/${layer}/${normalizedDomain}`;
    return request<Record<string, unknown>[]>(endpoint, {
      params: {
        ticker,
        limit,
        date_sort: options?.sortByDate
      },
      signal: resolvedSignal
    });
  },

  getDataQualityValidation(
    layer: string,
    domain: string,
    tickerOrSignal?: string | AbortSignal,
    signal?: AbortSignal
  ): Promise<ValidationReport> {
    const ticker = typeof tickerOrSignal === 'string' ? tickerOrSignal : undefined;
    const resolvedSignal = tickerOrSignal instanceof AbortSignal ? tickerOrSignal : signal;
    return request<ValidationReport>(`/data/quality/${layer}/${domain}/validation`, {
      params: { ticker },
      signal: resolvedSignal
    });
  },

  getStorageUsage(signal?: AbortSignal): Promise<StorageUsageResponse> {
    return request<StorageUsageResponse>('/data/storage-usage', {
      signal
    });
  },

  getAdlsTree(
    params: {
      layer: 'bronze' | 'silver' | 'gold' | 'platinum';
      path?: string;
      maxEntries?: number;
    },
    signal?: AbortSignal
  ): Promise<AdlsTreeResponse> {
    return request<AdlsTreeResponse>('/data/adls/tree', {
      params: {
        layer: params.layer,
        path: params.path,
        max_entries: params.maxEntries
      },
      signal
    });
  },

  getAdlsFilePreview(
    params: {
      layer: 'bronze' | 'silver' | 'gold' | 'platinum';
      path: string;
      maxBytes?: number;
      maxDeltaFiles?: number;
    },
    signal?: AbortSignal
  ): Promise<AdlsFilePreviewResponse> {
    return request<AdlsFilePreviewResponse>('/data/adls/file-preview', {
      params: {
        layer: params.layer,
        path: params.path,
        max_bytes: params.maxBytes,
        max_delta_files: params.maxDeltaFiles
      },
      signal
    });
  },

  getDataProfile(
    layer: 'bronze' | 'silver' | 'gold',
    domain: string,
    column: string,
    params: {
      ticker?: string;
      bins?: number;
      sampleRows?: number;
      topValues?: number;
    } = {},
    signal?: AbortSignal
  ): Promise<DataProfilingResponse> {
    const normalizedDomain = String(domain || '').trim();
    if (layer === 'gold' && normalizedDomain.startsWith('regime/')) {
      const dataset = normalizedDomain.slice('regime/'.length);
      return request<DataProfilingResponse>(
        `/data/gold/regime/${encodeURIComponent(dataset)}/profile`,
        {
          params: {
            column,
            bins: params.bins,
            sampleRows: params.sampleRows,
            topValues: params.topValues
          },
          signal
        }
      );
    }
    return request<DataProfilingResponse>(`/data/${layer}/profile`, {
      params: {
        domain: normalizedDomain,
        column,
        ticker: params.ticker,
        bins: params.bins,
        sampleRows: params.sampleRows,
        topValues: params.topValues
      },
      signal
    });
  },

  purgeData(payload: PurgeRequest): Promise<PurgeOperationResponse> {
    return request<PurgeOperationResponse>('/system/purge', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  resetDomainLists(payload: DomainListResetRequest): Promise<DomainListResetResponse> {
    return request<DomainListResetResponse>('/system/domain-lists/reset', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  resetDomainCheckpoints(
    payload: DomainCheckpointResetRequest
  ): Promise<DomainCheckpointResetResponse> {
    return request<DomainCheckpointResetResponse>('/system/domain-checkpoints/reset', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getDomainLists(
    layer: string,
    domain: string,
    params: { limit?: number } = {}
  ): Promise<DomainListsResponse> {
    return request<DomainListsResponse>('/system/domain-lists', {
      params: { layer, domain, ...params }
    });
  },

  getPurgeCandidates(payload: PurgeCandidatesRequest): Promise<PurgeCandidatesResponse> {
    return request<PurgeCandidatesResponse>('/system/purge-candidates', {
      params: { ...payload },
      timeoutMs: 30000,
      retryOnStatusCodes: [408, 425, 429, 500, 502, 503]
    });
  },

  createPurgeCandidatesOperation(payload: PurgeCandidatesRequest): Promise<PurgeOperationResponse> {
    return request<PurgeOperationResponse>('/system/purge-candidates', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 30000,
      retryOnStatusCodes: [408, 425, 429, 500, 502, 503]
    });
  },

  getPurgeOperation(operationId: string): Promise<PurgeOperationResponse> {
    return request<PurgeOperationResponse>(`/system/purge/${encodeURIComponent(operationId)}`);
  },

  getPurgeBlacklistSymbols(): Promise<PurgeBlacklistSymbolsResponse> {
    return request<PurgeBlacklistSymbolsResponse>('/system/purge-symbols/blacklist');
  },

  purgeSymbolsBatch(payload: {
    symbols: string[];
    confirm: boolean;
    scope_note?: string;
    dry_run?: boolean;
    audit_rule?: {
      layer: 'bronze' | 'silver' | 'gold';
      domain: 'market' | 'finance' | 'earnings' | 'price-target';
      column_name: string;
      operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'top_percent' | 'bottom_percent';
      threshold: number;
      aggregation?: 'min' | 'max' | 'avg' | 'stddev';
      recent_rows?: number;
      expression?: string;
      selected_symbol_count?: number;
      matched_symbol_count?: number;
    };
  }): Promise<PurgeOperationResponse> {
    return request<PurgeOperationResponse>('/system/purge-symbols', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getDebugSymbols(): Promise<DebugSymbolsResponse> {
    return request<DebugSymbolsResponse>('/system/debug-symbols');
  },

  setDebugSymbols(payload: { symbols: string }): Promise<DebugSymbolsResponse> {
    return request<DebugSymbolsResponse>('/system/debug-symbols', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  deleteDebugSymbols(): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>('/system/debug-symbols', {
      method: 'DELETE'
    });
  },

  getRuntimeConfigCatalog(): Promise<RuntimeConfigCatalogResponse> {
    return request<RuntimeConfigCatalogResponse>('/system/runtime-config/catalog');
  },

  getRuntimeConfig(scope: string = 'global'): Promise<RuntimeConfigListResponse> {
    return request<RuntimeConfigListResponse>('/system/runtime-config', {
      params: { scope }
    });
  },

  setRuntimeConfig(payload: {
    key: string;
    scope?: string;
    value: string;
    description?: string;
  }): Promise<RuntimeConfigItem> {
    return request<RuntimeConfigItem>('/system/runtime-config', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  deleteRuntimeConfig(
    key: string,
    scope: string = 'global'
  ): Promise<{ scope: string; key: string; deleted: boolean }> {
    return request<{ scope: string; key: string; deleted: boolean }>(
      `/system/runtime-config/${encodeURIComponent(key)}`,
      {
        method: 'DELETE',
        params: { scope }
      }
    );
  },

  getSymbolSyncState(): Promise<SymbolSyncState> {
    return request<SymbolSyncState>('/system/symbol-sync-state');
  }
};
