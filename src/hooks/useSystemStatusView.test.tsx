import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, type SystemStatusViewResponse } from '@/services/apiService';
import type { SystemHealth } from '@/types/strategy';

const { mockDataService, mockRedirectToLogin, mockLogUiDiagnostic } = vi.hoisted(() => ({
  mockDataService: {
    getSystemStatusView: vi.fn()
  },
  mockRedirectToLogin: vi.fn(),
  mockLogUiDiagnostic: vi.fn()
}));

vi.mock('@/services/DataService', () => ({
  DataService: mockDataService
}));

vi.mock('@/hooks/useSystemHealthJobOverrides', () => ({
  mergeSystemHealthWithJobOverrides: (systemHealth: SystemHealth) => systemHealth,
  useSystemHealthJobOverrides: () => ({ data: undefined })
}));

vi.mock('@/utils/authNavigation', () => ({
  redirectToLogin: mockRedirectToLogin
}));

vi.mock('@/services/uiDiagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/uiDiagnostics')>();
  return {
    ...actual,
    logUiDiagnostic: mockLogUiDiagnostic
  };
});

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

describe('useSystemStatusViewQuery auth handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.history.pushState({}, 'System Status', '/system-status?tab=health#latency');
  });

  it('redirects to login when the initial system status query returns 401', async () => {
    mockDataService.getSystemStatusView.mockRejectedValueOnce(
      new ApiError(401, 'API Error: 401 Unauthorized')
    );

    renderHook(() => useSystemStatusViewQuery(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockRedirectToLogin).toHaveBeenCalledTimes(1);
    });
    expect(mockLogUiDiagnostic).toHaveBeenCalledWith(
      'AuthSession',
      'system-status-session-expired',
      expect.objectContaining({
        source: 'query',
        status: 401
      })
    );
  });

  it('redirects to login when a refresh request returns 401', async () => {
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

    await waitFor(() => {
      expect(mockRedirectToLogin).toHaveBeenCalledTimes(1);
    });
    expect(mockLogUiDiagnostic).toHaveBeenCalledWith(
      'AuthSession',
      'system-status-session-expired',
      expect.objectContaining({
        source: 'refresh',
        status: 401
      })
    );
  });
});
