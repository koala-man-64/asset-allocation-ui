import { useQuery, useQueries, keepPreviousData } from '@tanstack/react-query';
import {
  BacktestSummary,
  ClosedPositionListResponse,
  ListRunsParams,
  RollingMetricsResponse,
  RunStatusResponse,
  TimeseriesResponse,
  TradeListResponse,
  backtestApi
} from '@/services/backtestApi';
import { formatSystemStatusText } from '@/utils/formatSystemStatusText';

// Key Factory for consistent query keys
export const backtestKeys = {
  all: ['backtest'] as const,
  runs: () => [...backtestKeys.all, 'runs'] as const,
  runList: (params: ListRunsParams) => [...backtestKeys.runs(), params] as const,
  run: (runId: string) => [...backtestKeys.runs(), runId] as const,
  status: (runId: string) => [...backtestKeys.run(runId), 'status'] as const,
  summary: (runId: string) => [...backtestKeys.run(runId), 'summary'] as const,
  timeseries: (runId: string, maxPoints: number) =>
    [...backtestKeys.run(runId), 'timeseries', maxPoints] as const,
  rolling: (runId: string, windowDays: number, maxPoints: number) =>
    [...backtestKeys.run(runId), 'rolling', windowDays, maxPoints] as const,
  trades: (runId: string, limit: number, offset: number) =>
    [...backtestKeys.run(runId), 'trades', limit, offset] as const,
  closedPositions: (runId: string, limit: number, offset: number) =>
    [...backtestKeys.run(runId), 'closed-positions', limit, offset] as const
};

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function isRetryExempt(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === 404 || status === 409;
}

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isRetryExempt(error)) {
    return false;
  }
  return failureCount < 3;
}

export function useRunList(params: ListRunsParams = {}, opts: { enabled?: boolean } = {}) {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: backtestKeys.runList(params),
    queryFn: ({ signal }) => backtestApi.listRuns(params, signal),
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData
  });

  return {
    response: data,
    runs: data?.runs ?? [],
    loading: isLoading,
    error: error ? formatSystemStatusText(error) : undefined,
    refresh: refetch
  };
}

export function useRunStatus(runId: string | undefined, opts: { enabled?: boolean } = {}) {
  const enabled = (opts.enabled ?? true) && !!runId;

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: backtestKeys.status(runId!),
    queryFn: ({ signal }) => backtestApi.getStatus(runId!, signal),
    enabled,
    retry: shouldRetryQuery
  });

  return {
    data: data as RunStatusResponse | undefined,
    loading: isLoading,
    error: error ? formatSystemStatusText(error) : undefined,
    refresh: refetch
  };
}

export function useRunSummary(runId: string | undefined, opts: { enabled?: boolean } = {}) {
  const enabled = (opts.enabled ?? true) && !!runId;

  const { data, error, isLoading } = useQuery({
    queryKey: backtestKeys.summary(runId!),
    queryFn: ({ signal }) => backtestApi.getSummary(runId!, {}, signal),
    enabled,
    retry: shouldRetryQuery
  });

  return {
    data,
    loading: isLoading,
    error: error ? formatSystemStatusText(error) : undefined
  };
}

export function useRunSummaries(
  runIds: string[],
  opts: { enabled?: boolean; limit?: number } = {}
) {
  const limit = opts.limit;

  // Normalize and limit IDs
  const uniqueIds = Array.from(new Set(runIds.filter(Boolean)));
  const targetIds = typeof limit === 'number' ? uniqueIds.slice(0, Math.max(0, limit)) : uniqueIds;
  const enabled = (opts.enabled ?? true) && targetIds.length > 0;

  const results = useQueries({
    queries: targetIds.map((runId) => ({
      queryKey: backtestKeys.summary(runId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        backtestApi.getSummary(runId, {}, signal),
      enabled,
      retry: shouldRetryQuery
    }))
  });

  const summaries: Record<string, BacktestSummary | null | undefined> = {};
  let loading = false;
  let error: string | undefined;

  results.forEach((result, index) => {
    const runId = targetIds[index];
    summaries[runId] = result.data;
    if (result.isLoading) loading = true;
    if (result.error) error = formatSystemStatusText(result.error);
  });

  return { summaries, loading, error };
}

export function useTimeseriesMulti(
  runIds: string[],
  opts: { enabled?: boolean; maxPoints?: number } = {}
) {
  const maxPoints = opts.maxPoints ?? 5000;
  const uniqueIds = Array.from(new Set(runIds.filter(Boolean)));
  const enabled = (opts.enabled ?? true) && uniqueIds.length > 0;

  const results = useQueries({
    queries: uniqueIds.map((runId) => ({
      queryKey: backtestKeys.timeseries(runId, maxPoints),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        backtestApi.getTimeseries(runId, { maxPoints }, signal),
      enabled,
      retry: shouldRetryQuery
    }))
  });

  const timeseriesByRunId: Record<string, TimeseriesResponse | undefined> = {};
  let loading = false;
  let error: string | undefined;

  results.forEach((result, index) => {
    const runId = uniqueIds[index];
    timeseriesByRunId[runId] = result.data;
    if (result.isLoading) loading = true;
    if (result.error) error = formatSystemStatusText(result.error);
  });

  return { timeseriesByRunId, loading, error };
}

export function useTimeseries(
  runId: string | undefined,
  opts: { enabled?: boolean; maxPoints?: number } = {}
) {
  const maxPoints = opts.maxPoints ?? 5000;
  const enabled = (opts.enabled ?? true) && !!runId;

  const { data, error, isLoading } = useQuery({
    queryKey: backtestKeys.timeseries(runId!, maxPoints),
    queryFn: ({ signal }) => backtestApi.getTimeseries(runId!, { maxPoints }, signal),
    enabled,
    retry: shouldRetryQuery
  });

  return {
    data: data as TimeseriesResponse | undefined,
    loading: isLoading,
    error: error ? formatSystemStatusText(error) : undefined
  };
}

export function useRollingMulti(
  runIds: string[],
  windowDays: number,
  opts: { enabled?: boolean; maxPoints?: number } = {}
) {
  const maxPoints = opts.maxPoints ?? 5000;
  const uniqueIds = Array.from(new Set(runIds.filter(Boolean)));
  const enabled = (opts.enabled ?? true) && uniqueIds.length > 0;

  const results = useQueries({
    queries: uniqueIds.map((runId) => ({
      queryKey: backtestKeys.rolling(runId, windowDays, maxPoints),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        backtestApi.getRolling(runId, { windowDays, maxPoints }, signal),
      enabled,
      retry: shouldRetryQuery
    }))
  });

  const rollingByRunId: Record<string, RollingMetricsResponse | undefined> = {};
  let loading = false;
  let error: string | undefined;

  results.forEach((result, index) => {
    const runId = uniqueIds[index];
    rollingByRunId[runId] = result.data;
    if (result.isLoading) loading = true;
    if (result.error) error = formatSystemStatusText(result.error);
  });

  return { rollingByRunId, loading, error };
}

export function useRolling(
  runId: string | undefined,
  windowDays: number,
  opts: { enabled?: boolean; maxPoints?: number } = {}
) {
  const maxPoints = opts.maxPoints ?? 5000;
  const enabled = (opts.enabled ?? true) && !!runId;

  const { data, error, isLoading } = useQuery({
    queryKey: backtestKeys.rolling(runId!, windowDays, maxPoints),
    queryFn: ({ signal }) => backtestApi.getRolling(runId!, { windowDays, maxPoints }, signal),
    enabled,
    retry: shouldRetryQuery
  });

  return {
    data: data as RollingMetricsResponse | undefined,
    loading: isLoading,
    error: error ? formatSystemStatusText(error) : undefined
  };
}

export function useTrades(
  runId: string | undefined,
  opts: { enabled?: boolean; limit?: number; offset?: number } = {}
) {
  const limit = opts.limit ?? 2000;
  const offset = opts.offset ?? 0;
  const enabled = (opts.enabled ?? true) && !!runId;

  const { data, error, isLoading } = useQuery({
    queryKey: backtestKeys.trades(runId!, limit, offset),
    queryFn: ({ signal }) => backtestApi.getTrades(runId!, { limit, offset }, signal),
    enabled,
    retry: shouldRetryQuery
  });

  return {
    data: data as TradeListResponse | undefined,
    loading: isLoading,
    error: error ? formatSystemStatusText(error) : undefined
  };
}

export function useClosedPositions(
  runId: string | undefined,
  opts: { enabled?: boolean; limit?: number; offset?: number } = {}
) {
  const limit = opts.limit ?? 2000;
  const offset = opts.offset ?? 0;
  const enabled = (opts.enabled ?? true) && !!runId;

  const { data, error, isLoading } = useQuery({
    queryKey: backtestKeys.closedPositions(runId!, limit, offset),
    queryFn: ({ signal }) => backtestApi.getClosedPositions(runId!, { limit, offset }, signal),
    enabled,
    retry: shouldRetryQuery
  });

  return {
    data: data as ClosedPositionListResponse | undefined,
    loading: isLoading,
    error: error ? formatSystemStatusText(error) : undefined
  };
}
