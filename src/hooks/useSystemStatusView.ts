import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/hooks/useDataQueries';
import {
  mergeSystemHealthWithJobOverrides,
  renewPendingOverrides,
  useSystemHealthJobOverrides
} from '@/hooks/useSystemHealthJobOverrides';
import { ApiError, type SystemStatusViewResponse } from '@/services/apiService';
import {
  DataService,
  type SystemStatusViewFetchMeta,
  type SystemStatusViewFetchResult
} from '@/services/DataService';
import {
  applyJobRunMonotonicityGuard,
  isMonotonicityGuardDisabled
} from '@/features/system-status/lib/jobRunMonotonicity';

const SYSTEM_STATUS_VIEW_BASE_INTERVAL_MS = 10_000;
const SYSTEM_STATUS_VIEW_DEGRADED_INTERVAL_MS = 15_000;
const SYSTEM_STATUS_VIEW_HEALTHY_INTERVAL_MS = 30_000;
const SYSTEM_STATUS_VIEW_AUTH_BACKOFF_INTERVAL_MS = 60_000;
const SYSTEM_STATUS_VIEW_STORAGE_KEY = 'asset-allocation.systemStatusView';

function isSystemStatusAuthOrEndpointBackoffError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 401 || error.status === 403 || error.status === 404;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes('API Error: 401');
}

function readStoredSystemStatusView(): SystemStatusViewResponse | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.sessionStorage.getItem(SYSTEM_STATUS_VIEW_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      window.sessionStorage.removeItem(SYSTEM_STATUS_VIEW_STORAGE_KEY);
      return undefined;
    }

    return parsed as SystemStatusViewResponse;
  } catch {
    try {
      window.sessionStorage.removeItem(SYSTEM_STATUS_VIEW_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures and continue without persisted view state.
    }
    return undefined;
  }
}

function writeStoredSystemStatusView(data?: SystemStatusViewResponse): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!data) {
      window.sessionStorage.removeItem(SYSTEM_STATUS_VIEW_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(SYSTEM_STATUS_VIEW_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage failures and continue with the live query cache.
  }
}

function systemStatusViewRefetchInterval(query: Query<SystemStatusViewResponse>): false | number {
  if (isSystemStatusAuthOrEndpointBackoffError(query.state.error)) {
    const jitter = Math.round(SYSTEM_STATUS_VIEW_AUTH_BACKOFF_INTERVAL_MS * 0.1 * Math.random());
    return SYSTEM_STATUS_VIEW_AUTH_BACKOFF_INTERVAL_MS + jitter;
  }
  const overall = query.state.data?.systemHealth?.overall;
  const baseMs =
    overall === 'critical'
      ? SYSTEM_STATUS_VIEW_BASE_INTERVAL_MS
      : overall === 'degraded'
        ? SYSTEM_STATUS_VIEW_DEGRADED_INTERVAL_MS
        : SYSTEM_STATUS_VIEW_HEALTHY_INTERVAL_MS;
  const jitter = Math.round(baseMs * 0.1 * Math.random());
  return baseMs + jitter;
}

function formatStatusViewError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

function directSystemStatusViewMeta(): SystemStatusViewFetchMeta {
  return {
    status: 'direct',
    receivedAt: new Date().toISOString()
  };
}

async function getSystemStatusViewResult(
  params: { refresh?: boolean },
  signal?: AbortSignal
): Promise<SystemStatusViewFetchResult> {
  const service = DataService as typeof DataService & {
    getSystemStatusViewResult?: (
      params?: { refresh?: boolean },
      signal?: AbortSignal
    ) => Promise<SystemStatusViewFetchResult>;
  };

  if (typeof service.getSystemStatusViewResult === 'function') {
    return service.getSystemStatusViewResult(params, signal);
  }

  const data = await DataService.getSystemStatusView(params, signal);
  return {
    data,
    meta: directSystemStatusViewMeta()
  };
}

async function fetchSystemStatusView(
  queryClient: QueryClient,
  params: { refresh?: boolean } = {},
  signal?: AbortSignal
): Promise<SystemStatusViewFetchResult> {
  const previous = queryClient.getQueryData<SystemStatusViewResponse>(queryKeys.systemStatusView());
  const result = await getSystemStatusViewResult(params, signal);
  const fresh = result.data;
  const reconciledHealth = applyJobRunMonotonicityGuard(
    fresh.systemHealth,
    previous?.systemHealth,
    { disabled: isMonotonicityGuardDisabled() }
  );
  const data =
    reconciledHealth === fresh.systemHealth
      ? fresh
      : { ...fresh, systemHealth: reconciledHealth ?? fresh.systemHealth };
  return {
    data,
    meta: result.meta
  };
}

export interface UseSystemStatusViewQueryOptions {
  autoRefresh?: boolean;
}

export function useSystemStatusViewQuery(options: UseSystemStatusViewQueryOptions = {}) {
  const autoRefresh = options.autoRefresh ?? false;
  const queryClient = useQueryClient();
  const jobOverrides = useSystemHealthJobOverrides();
  const initialViewRef = useRef<SystemStatusViewResponse | undefined>(readStoredSystemStatusView());
  const forceRefreshPromiseRef = useRef<Promise<SystemStatusViewResponse> | null>(null);
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  const [statusMeta, setStatusMeta] = useState<SystemStatusViewFetchMeta | null>(null);

  const query = useQuery<SystemStatusViewResponse>({
    queryKey: queryKeys.systemStatusView(),
    queryFn: async ({ signal }) => {
      const result = await fetchSystemStatusView(queryClient, {}, signal);
      setStatusMeta(result.meta);
      return result.data;
    },
    initialData: () =>
      queryClient.getQueryData<SystemStatusViewResponse>(queryKeys.systemStatusView()) ??
      initialViewRef.current,
    placeholderData: (previousData) => previousData ?? initialViewRef.current,
    retry: (failureCount, error) =>
      isSystemStatusAuthOrEndpointBackoffError(error) ? false : failureCount < 3,
    refetchInterval: autoRefresh ? systemStatusViewRefetchInterval : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: autoRefresh,
    refetchOnReconnect: autoRefresh
  });

  useEffect(() => {
    if (!query.error || !query.data) {
      return;
    }

    setStatusMeta({
      status: 'error',
      receivedAt: new Date().toISOString(),
      message: formatStatusViewError(query.error)
    });
  }, [query.data, query.error]);

  useEffect(() => {
    if (!query.data) {
      return;
    }
    queryClient.setQueryData(
      queryKeys.domainMetadataSnapshot('all', 'all'),
      query.data.metadataSnapshot
    );
    writeStoredSystemStatusView(query.data);
    renewPendingOverrides(queryClient, query.data.systemHealth);
  }, [query.data, queryClient]);

  const refresh = useCallback(async (): Promise<SystemStatusViewResponse> => {
    if (forceRefreshPromiseRef.current) {
      return forceRefreshPromiseRef.current;
    }

    setIsForceRefreshing(true);
    const request = (async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.systemStatusView() });
      return queryClient.fetchQuery<SystemStatusViewResponse>({
        queryKey: queryKeys.systemStatusView(),
        queryFn: async ({ signal }) => {
          const result = await fetchSystemStatusView(queryClient, { refresh: true }, signal);
          setStatusMeta(result.meta);
          return result.data;
        },
        staleTime: 0
      });
    })().finally(() => {
      forceRefreshPromiseRef.current = null;
      setIsForceRefreshing(false);
    });

    forceRefreshPromiseRef.current = request;
    return request;
  }, [queryClient]);

  const data = useMemo<SystemStatusViewResponse | undefined>(() => {
    if (!query.data) return query.data;
    return {
      ...query.data,
      systemHealth:
        mergeSystemHealthWithJobOverrides(query.data.systemHealth, jobOverrides.data) ??
        query.data.systemHealth
    };
  }, [jobOverrides.data, query.data]);

  return {
    ...query,
    data,
    isFetching: query.isFetching || isForceRefreshing,
    statusMeta,
    refresh
  };
}
