import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DomainMetadataSnapshotResponse } from '@/services/apiService';
import type { SystemHealth } from '@/types/strategy';

const { MockApiError, mockApiService, mockLogUiDiagnostic } = vi.hoisted(() => {
  class MockApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  return {
    MockApiError,
    mockApiService: {
      getSystemStatusView: vi.fn(),
      getSystemHealth: vi.fn(),
      getDomainMetadataSnapshot: vi.fn()
    },
    mockLogUiDiagnostic: vi.fn()
  };
});

vi.mock('@/services/apiService', () => ({
  ApiError: MockApiError,
  apiService: mockApiService
}));

vi.mock('@/services/uiDiagnostics', () => ({
  logUiDiagnostic: mockLogUiDiagnostic
}));

import { DataService } from '@/services/DataService';

const systemHealth: SystemHealth = {
  overall: 'healthy',
  dataLayers: [],
  recentJobs: [],
  alerts: [],
  resources: []
};

const metadataSnapshot: DomainMetadataSnapshotResponse = {
  version: 2,
  updatedAt: '2026-04-18T14:30:00Z',
  entries: {},
  warnings: []
};

describe('DataService.getSystemStatusView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to health and metadata endpoints when the unified status view has the known session-suppressed 401', async () => {
    mockApiService.getSystemStatusView.mockRejectedValueOnce(
      new MockApiError(
        401,
        'API Error: 401 Unauthorized [requestId=req-1] - {"detail":"Unauthorized."} Interactive sign-in was suppressed because /auth/session succeeded recently; check API authorization or upstream auth configuration.'
      )
    );
    mockApiService.getSystemHealth.mockResolvedValueOnce(systemHealth);
    mockApiService.getDomainMetadataSnapshot.mockResolvedValueOnce(metadataSnapshot);

    const result = await DataService.getSystemStatusView({ refresh: true });

    expect(result).toMatchObject({
      version: 1,
      systemHealth,
      metadataSnapshot,
      sources: {
        systemHealth: 'live-refresh',
        metadataSnapshot: 'persisted-snapshot'
      }
    });
    expect(result.generatedAt).toEqual(expect.any(String));
    expect(mockApiService.getSystemHealth).toHaveBeenCalledWith({ refresh: true }, undefined);
    expect(mockApiService.getDomainMetadataSnapshot).toHaveBeenCalledWith(
      { refresh: true },
      undefined
    );
    expect(mockLogUiDiagnostic).toHaveBeenCalledWith(
      'DataService',
      'system-status-view-fallback-start',
      expect.objectContaining({
        error: expect.stringContaining('Interactive sign-in was suppressed')
      }),
      'warn'
    );
  });

  it('falls back for a missing unified status view endpoint', async () => {
    mockApiService.getSystemStatusView.mockRejectedValueOnce(
      new MockApiError(404, 'API Error: 404 Not Found')
    );
    mockApiService.getSystemHealth.mockResolvedValueOnce(systemHealth);
    mockApiService.getDomainMetadataSnapshot.mockResolvedValueOnce(metadataSnapshot);

    await expect(DataService.getSystemStatusView()).resolves.toMatchObject({
      systemHealth,
      metadataSnapshot,
      sources: {
        systemHealth: 'cache',
        metadataSnapshot: 'persisted-snapshot'
      }
    });
  });

  it('keeps the page usable when fallback metadata is unavailable', async () => {
    mockApiService.getSystemStatusView.mockRejectedValueOnce(
      new MockApiError(404, 'API Error: 404 Not Found')
    );
    mockApiService.getSystemHealth.mockResolvedValueOnce(systemHealth);
    mockApiService.getDomainMetadataSnapshot.mockRejectedValueOnce(
      new MockApiError(401, 'API Error: 401 Unauthorized')
    );

    await expect(DataService.getSystemStatusView()).resolves.toMatchObject({
      systemHealth,
      metadataSnapshot: {
        version: 1,
        updatedAt: null,
        entries: {},
        warnings: [
          'Metadata snapshot is unavailable; showing system health without cached cell counts.'
        ]
      }
    });
    expect(mockLogUiDiagnostic).toHaveBeenCalledWith(
      'DataService',
      'system-status-fallback-metadata-unavailable',
      expect.objectContaining({ error: expect.stringContaining('API Error: 401') }),
      'warn'
    );
  });

  it('does not mask ordinary unauthorized failures', async () => {
    const error = new MockApiError(401, 'API Error: 401 Unauthorized');
    mockApiService.getSystemStatusView.mockRejectedValueOnce(error);

    await expect(DataService.getSystemStatusView()).rejects.toBe(error);
    expect(mockApiService.getSystemHealth).not.toHaveBeenCalled();
    expect(mockApiService.getDomainMetadataSnapshot).not.toHaveBeenCalled();
  });
});
