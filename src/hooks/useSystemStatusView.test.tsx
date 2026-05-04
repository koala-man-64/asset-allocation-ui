import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type SystemStatusViewResponse } from '@/services/apiService';
import type { SystemHealth } from '@/types/strategy';

const { mockDataService } = vi.hoisted(() => ({
  mockDataService: {
    getSystemStatusView: vi.fn()
  }
}));

vi.mock('@/services/DataService', () => ({
  DataService: mockDataService
}));

vi.mock('@/hooks/useSystemHealthJobOverrides', () => ({
  mergeSystemHealthWithJobOverrides: (systemHealth: SystemHealth) => systemHealth,
  renewPendingOverrides: () => undefined,
  useSystemHealthJobOverrides: () => ({ data: undefined })
}));

import { useSystemStatusViewQuery } from '@/hooks/useSystemStatusView';

const systemHealth: SystemHealth = {
  overall: 'healthy',
  dataLayers: [],
  recentJobs: [],
  alerts: [],
  resources: []
};

const systemStatusView: SystemStatusViewResponse = {
  version: 1,
  generatedAt: '2026-04-27T06:09:32.000Z',
  systemHealth,
  metadataSnapshot: {
    version: 1,
    updatedAt: null,
    entries: {},
    warnings: []
  },
  sources: {
    systemHealth: 'cache',
    metadataSnapshot: 'persisted-snapshot'
  }
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0
      }
    }
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useSystemStatusViewQuery auth handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (mockDataService as { getSystemStatusViewResult?: unknown }).getSystemStatusViewResult;
    vi.useRealTimers();
    window.sessionStorage.clear();
    window.history.pushState({}, 'System Status', '/system-status?tab=health#latency');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('surfaces the initial system status 401 without redirecting away from the route', async () => {
    mockDataService.getSystemStatusView.mockRejectedValueOnce(
      new ApiError(401, 'API Error: 401 Unauthorized')
    );

    const { result } = renderHook(() => useSystemStatusViewQuery(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(ApiError);
    });
    expect(result.current.error).toMatchObject({ status: 401 });
    expect(window.location.pathname).toBe('/system-status');
  });

  it('surfaces a refresh 401 without redirecting away from the route', async () => {
    mockDataService.getSystemStatusView
      .mockResolvedValueOnce(systemStatusView)
      .mockRejectedValueOnce(new ApiError(401, 'API Error: 401 Unauthorized'));

    const { result } = renderHook(() => useSystemStatusViewQuery(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.data).toMatchObject(systemStatusView);
    });

    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow('API Error: 401 Unauthorized');
    });

    expect(window.location.pathname).toBe('/system-status');
  });
});

describe('useSystemStatusViewQuery polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (mockDataService as { getSystemStatusViewResult?: unknown }).getSystemStatusViewResult;
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    window.sessionStorage.clear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls through the query refetch interval when auto refresh is enabled', async () => {
    mockDataService.getSystemStatusView.mockResolvedValue(systemStatusView);

    renderHook(() => useSystemStatusViewQuery({ autoRefresh: true }), {
      wrapper: createWrapper()
    });

    await flushPromises();
    expect(mockDataService.getSystemStatusView).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mockDataService.getSystemStatusView).toHaveBeenCalledTimes(2);
  });

  it('backs off and self-heals polling after a status-view auth failure', async () => {
    mockDataService.getSystemStatusView
      .mockRejectedValueOnce(new ApiError(401, 'API Error: 401 Unauthorized'))
      .mockResolvedValueOnce(systemStatusView);

    const { result } = renderHook(() => useSystemStatusViewQuery({ autoRefresh: true }), {
      wrapper: createWrapper()
    });

    await flushPromises();
    expect(mockDataService.getSystemStatusView).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(mockDataService.getSystemStatusView).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });
    await flushPromises();

    expect(mockDataService.getSystemStatusView).toHaveBeenCalledTimes(2);
    expect(result.current.data).toMatchObject(systemStatusView);
  });

  it('exposes local status metadata for fallback status-view results', async () => {
    (
      mockDataService as {
        getSystemStatusViewResult?: ReturnType<typeof vi.fn>;
      }
    ).getSystemStatusViewResult = vi.fn().mockResolvedValueOnce({
      data: systemStatusView,
      meta: {
        status: 'fallback',
        receivedAt: '2026-04-27T06:11:32.000Z',
        message: 'API Error: 404 Not Found'
      }
    });

    const { result } = renderHook(() => useSystemStatusViewQuery({ autoRefresh: true }), {
      wrapper: createWrapper()
    });

    await flushPromises();
    expect(result.current.statusMeta).toMatchObject({
      status: 'fallback',
      message: 'API Error: 404 Not Found'
    });
  });

  it('does not poll while the document is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    window.dispatchEvent(new Event('visibilitychange'));
    mockDataService.getSystemStatusView.mockResolvedValue(systemStatusView);

    renderHook(() => useSystemStatusViewQuery({ autoRefresh: true }), {
      wrapper: createWrapper()
    });

    await flushPromises();
    expect(mockDataService.getSystemStatusView).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(mockDataService.getSystemStatusView).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent force refresh calls through fetchQuery', async () => {
    vi.useRealTimers();
    let resolveRefresh: (value: typeof systemStatusView) => void = () => undefined;
    const refreshPromise = new Promise<typeof systemStatusView>((resolve) => {
      resolveRefresh = resolve;
    });
    const refreshedView = {
      ...systemStatusView,
      generatedAt: '2026-04-27T06:10:32.000Z'
    };

    mockDataService.getSystemStatusView
      .mockResolvedValueOnce(systemStatusView)
      .mockReturnValueOnce(refreshPromise);

    const { result } = renderHook(() => useSystemStatusViewQuery(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.data).toMatchObject(systemStatusView);
    });

    let firstRefresh!: Promise<typeof systemStatusView>;
    let secondRefresh!: Promise<typeof systemStatusView>;
    act(() => {
      firstRefresh = result.current.refresh();
      secondRefresh = result.current.refresh();
    });

    resolveRefresh(refreshedView);

    let refreshedResults: (typeof systemStatusView)[] = [];
    await act(async () => {
      refreshedResults = await Promise.all([firstRefresh, secondRefresh]);
    });

    expect(refreshedResults).toEqual([refreshedView, refreshedView]);
    expect(mockDataService.getSystemStatusView).toHaveBeenCalledTimes(2);
    expect(mockDataService.getSystemStatusView).toHaveBeenLastCalledWith(
      { refresh: true },
      expect.any(AbortSignal)
    );
  });
});
