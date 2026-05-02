import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { waitFor } from '@testing-library/react';

import { renderWithProviders } from '@/test/utils';
import { DataService } from '@/services/DataService';
import { useDataQualityHealthQuery, useSystemHealthQuery } from '@/hooks/useDataQueries';
import type { SystemHealth } from '@/types/strategy';

const healthPayload: SystemHealth = {
  overall: 'healthy',
  dataLayers: [],
  recentJobs: [],
  alerts: [],
  resources: []
};

function SystemHealthProbe() {
  useSystemHealthQuery();
  return null;
}

function DataQualityProbeAutoRefresh() {
  useDataQualityHealthQuery({ autoRefresh: true });
  return null;
}

function DataQualityProbeNoAutoRefresh() {
  useDataQualityHealthQuery({ autoRefresh: false });
  return null;
}

function DataQualityProbeDefault() {
  useDataQualityHealthQuery();
  return null;
}

describe('useSystemHealthQuery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reads system health from the unified system status view', async () => {
    const getSystemStatusViewSpy = vi.spyOn(DataService, 'getSystemStatusView').mockResolvedValue({
      version: 1,
      generatedAt: '2026-05-01T12:00:00Z',
      systemHealth: healthPayload,
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
    });

    renderWithProviders(<SystemHealthProbe />);

    await waitFor(() => {
      expect(getSystemStatusViewSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useDataQualityHealthQuery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stops polling when the endpoint returns 404', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const getSystemHealthSpy = vi
      .spyOn(DataService, 'getSystemHealthWithMeta')
      .mockRejectedValue(new Error('API Error: 404 Not Found - {"detail":"Not Found"}'));

    renderWithProviders(<DataQualityProbeAutoRefresh />);

    await Promise.all([
      waitFor(() => {
        expect(getSystemHealthSpy).toHaveBeenCalledTimes(1);
      }),
      vi.advanceTimersByTimeAsync(1000)
    ]);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(getSystemHealthSpy).toHaveBeenCalledTimes(1);
  });

  it('does not poll when auto refresh is disabled', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const getSystemHealthSpy = vi.spyOn(DataService, 'getSystemHealthWithMeta').mockResolvedValue({
      data: healthPayload,
      meta: {
        status: 200,
        durationMs: 10,
        url: '/api/system/health',
        cacheDegraded: false,
        requestId: 'test-request-id'
      }
    });

    renderWithProviders(<DataQualityProbeNoAutoRefresh />);

    await Promise.all([
      waitFor(() => {
        expect(getSystemHealthSpy).toHaveBeenCalledTimes(1);
      }),
      vi.advanceTimersByTimeAsync(1000)
    ]);

    await vi.advanceTimersByTimeAsync(90_000);

    expect(getSystemHealthSpy).toHaveBeenCalledTimes(1);
  });

  it('does not poll by default', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const getSystemHealthSpy = vi.spyOn(DataService, 'getSystemHealthWithMeta').mockResolvedValue({
      data: healthPayload,
      meta: {
        status: 200,
        durationMs: 10,
        url: '/api/system/health',
        cacheDegraded: false,
        requestId: 'test-request-id'
      }
    });

    renderWithProviders(<DataQualityProbeDefault />);

    await Promise.all([
      waitFor(() => {
        expect(getSystemHealthSpy).toHaveBeenCalledTimes(1);
      }),
      vi.advanceTimersByTimeAsync(1000)
    ]);

    await vi.advanceTimersByTimeAsync(90_000);

    expect(getSystemHealthSpy).toHaveBeenCalledTimes(1);
  });
});
