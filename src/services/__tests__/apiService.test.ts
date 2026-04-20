import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAppendAuthHeaders, mockHasInteractiveAuthHandler, mockRequestInteractiveReauth } =
  vi.hoisted(() => ({
    mockAppendAuthHeaders: vi.fn(
      async (headersInput?: HeadersInit, _options?: { forceRefresh?: boolean }) => {
        const headers = new Headers(headersInput);
        headers.set('Authorization', 'Bearer test-token');
        return headers;
      }
    ),
    mockHasInteractiveAuthHandler: vi.fn(() => true),
    mockRequestInteractiveReauth: vi.fn(async (_request?: unknown) => {
      throw new Error('reauth-required');
    })
  }));

vi.mock('@/services/authTransport', () => ({
  appendAuthHeaders: mockAppendAuthHeaders,
  hasInteractiveAuthHandler: mockHasInteractiveAuthHandler,
  requestInteractiveReauth: mockRequestInteractiveReauth
}));

type ApiServiceModule = typeof import('@/services/apiService');

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('apiService cold start handling', () => {
  const fetchMock = vi.fn();
  const windowWithConfig = window as typeof window & {
    __API_UI_CONFIG__?: { apiBaseUrl?: string };
  };

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    mockAppendAuthHeaders.mockClear();
    mockHasInteractiveAuthHandler.mockReset();
    mockHasInteractiveAuthHandler.mockReturnValue(true);
    mockRequestInteractiveReauth.mockReset();
    mockRequestInteractiveReauth.mockImplementation(async () => {
      throw new Error('reauth-required');
    });
    windowWithConfig.__API_UI_CONFIG__ = { apiBaseUrl: '/api' };
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete windowWithConfig.__API_UI_CONFIG__;
  });

  async function importApiService(): Promise<ApiServiceModule> {
    return import('@/services/apiService');
  }

  it('warms up once and does not repeat warm-up calls on later requests', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('warming', { status: 503, statusText: 'Service Unavailable' })
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ data: 1 }))
      .mockResolvedValueOnce(jsonResponse({ data: 2 }));

    const { request } = await importApiService();

    const first = await request<{ data: number }>('/system/health');
    const second = await request<{ data: number }>('/system/health');

    expect(first.data).toBe(1);
    expect(second.data).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/healthz');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/healthz');
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/api/system/health');
    expect(fetchMock.mock.calls[3]?.[0]).toContain('/api/system/health');
  });

  it('retries transient response failures for primary requests', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(
        new Response('temporary failure', { status: 503, statusText: 'Service Unavailable' })
      )
      .mockResolvedValueOnce(jsonResponse({ data: 7 }));

    const { request } = await importApiService();

    const response = await request<{ data: number }>('/system/health');

    expect(response.data).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/healthz');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/system/health');
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/api/system/health');
  });

  it('fails on 404 without probing a fallback api base', async () => {
    windowWithConfig.__API_UI_CONFIG__ = { apiBaseUrl: '/asset-allocation/api' };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(new Response('not found', { status: 404, statusText: 'Not Found' }));

    const { request } = await importApiService();

    await expect(request<{ data: number }>('/system/health')).rejects.toThrow(
      /API Error: 404 Not Found/
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/healthz');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/asset-allocation/api/system/health');
  });

  it('replays safe reads once with a forced token refresh after a 401', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse({ data: 9 }));

    const { request } = await importApiService();

    const response = await request<{ data: number }>('/system/health');

    expect(response.data).toBe(9);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mockAppendAuthHeaders.mock.calls[0]?.[0]).toBeInstanceOf(Headers);
    expect(mockAppendAuthHeaders.mock.calls[0]?.[1]).toBeUndefined();
    expect(mockAppendAuthHeaders).toHaveBeenNthCalledWith(
      2,
      expect.any(Headers),
      expect.objectContaining({ forceRefresh: true })
    );
    expect(mockRequestInteractiveReauth).not.toHaveBeenCalled();
  });

  it('escalates to interactive reauth after a silent-recovery replay still returns 401', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }))
      .mockResolvedValueOnce(new Response('Unauthorized again', { status: 401, statusText: 'Unauthorized' }));

    mockRequestInteractiveReauth.mockImplementationOnce(async (request?: unknown) => {
      const payload = request as {
        endpoint?: string;
        requestId?: string;
        recoveryAttempt?: number;
      };
      throw new Error(
        `reauth:${JSON.stringify({
          endpoint: payload?.endpoint,
          requestId: payload?.requestId,
          recoveryAttempt: payload?.recoveryAttempt
        })}`
      );
    });

    const { request } = await importApiService();

    await expect(request('/system/status-view')).rejects.toThrow(/reauth:/);

    expect(mockAppendAuthHeaders).toHaveBeenNthCalledWith(
      2,
      expect.any(Headers),
      expect.objectContaining({ forceRefresh: true })
    );
    expect(mockRequestInteractiveReauth).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/system/status-view',
        status: 401,
        recoveryAttempt: 1,
        requestId: expect.any(String)
      })
    );
  });

  it('suppresses interactive reauth loops when /auth/session succeeded recently', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(
        jsonResponse({
          authMode: 'oidc',
          subject: 'user-123',
          requiredRoles: ['AssetAllocation.Access'],
          grantedRoles: ['AssetAllocation.Access']
        })
      )
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }))
      .mockResolvedValueOnce(new Response('Unauthorized again', { status: 401, statusText: 'Unauthorized' }));

    const { request } = await importApiService();

    await expect(request('/auth/session')).resolves.toEqual(
      expect.objectContaining({
        authMode: 'oidc',
        subject: 'user-123'
      })
    );

    await expect(request('/system/status-view')).rejects.toThrow(
      /Interactive sign-in was suppressed because \/auth\/session succeeded recently/i
    );

    expect(mockAppendAuthHeaders).toHaveBeenNthCalledWith(
      3,
      expect.any(Headers),
      expect.objectContaining({ forceRefresh: true })
    );
    expect(mockRequestInteractiveReauth).not.toHaveBeenCalled();
  });

  it('refuses to replay a protected request when a forced refresh yields no bearer token', async () => {
    mockAppendAuthHeaders.mockImplementationOnce(async (headersInput?: HeadersInit) => {
      const headers = new Headers(headersInput);
      headers.set('Authorization', 'Bearer stale-token');
      return headers;
    });
    mockAppendAuthHeaders.mockImplementationOnce(async (headersInput?: HeadersInit) => {
      const headers = new Headers(headersInput);
      headers.delete('Authorization');
      return headers;
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }));

    const { request } = await importApiService();

    await expect(request('/system/status-view')).rejects.toThrow(
      /OIDC token refresh did not produce a bearer token/i
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockAppendAuthHeaders).toHaveBeenNthCalledWith(
      2,
      expect.any(Headers),
      expect.objectContaining({ forceRefresh: true })
    );
    expect(mockRequestInteractiveReauth).not.toHaveBeenCalled();
  });

  it('does not replay non-safe requests before interactive reauth', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }));

    const { request } = await importApiService();

    await expect(
      request('/system/runtime-config', {
        method: 'POST',
        body: JSON.stringify({ key: 'feature.alpha', value: 'true' })
      })
    ).rejects.toThrow('reauth-required');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockAppendAuthHeaders).toHaveBeenCalledTimes(1);
    expect(mockRequestInteractiveReauth).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/system/runtime-config',
        status: 401,
        recoveryAttempt: 0
      })
    );
  });

  it('warms the API origin when apiBaseUrl is absolute', async () => {
    windowWithConfig.__API_UI_CONFIG__ = {
      apiBaseUrl: 'https://api.example.com/asset-allocation/api'
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ data: 3 }));

    const { request } = await importApiService();

    const response = await request<{ data: number }>('/system/health');

    expect(response.data).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/healthz');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.example.com/asset-allocation/api/system/health'
    );
  });

  it('builds runtime config, debug symbol, and system status requests with the expected paths', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ scope: 'workspace', items: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          scope: 'workspace',
          key: 'feature.alpha',
          value: 'true'
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          scope: 'workspace',
          key: 'feature.alpha',
          deleted: true
        })
      )
      .mockResolvedValueOnce(jsonResponse({ symbols: 'AAPL' }))
      .mockResolvedValueOnce(jsonResponse({ symbols: 'AAPL' }))
      .mockResolvedValueOnce(jsonResponse({ deleted: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          generatedAt: '2026-04-18T14:30:00Z',
          systemHealth: { overall: 'healthy', dataLayers: [] },
          metadataSnapshot: {
            version: 1,
            updatedAt: '2026-04-18T14:30:00Z',
            entries: {},
            warnings: []
          },
          sources: {
            systemHealth: 'live-refresh',
            metadataSnapshot: 'persisted-snapshot'
          }
        })
      );

    const { apiService } = await importApiService();

    await apiService.getRuntimeConfig('workspace');
    await apiService.setRuntimeConfig({
      key: 'feature.alpha',
      scope: 'workspace',
      value: 'true',
      description: 'Enable feature alpha'
    });
    await apiService.deleteRuntimeConfig('feature.alpha', 'workspace');
    await apiService.getDebugSymbols();
    await apiService.setDebugSymbols({ symbols: 'AAPL' });
    await apiService.deleteDebugSymbols();
    await apiService.getSystemStatusView({ refresh: true });

    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/system/runtime-config?scope=workspace');
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/api/system/runtime-config');
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit)?.method).toBe('POST');
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit)?.body).toBe(
      JSON.stringify({
        key: 'feature.alpha',
        scope: 'workspace',
        value: 'true',
        description: 'Enable feature alpha'
      })
    );
    expect(fetchMock.mock.calls[3]?.[0]).toContain(
      '/api/system/runtime-config/feature.alpha?scope=workspace'
    );
    expect((fetchMock.mock.calls[3]?.[1] as RequestInit)?.method).toBe('DELETE');
    expect(fetchMock.mock.calls[4]?.[0]).toContain('/api/system/debug-symbols');
    expect(fetchMock.mock.calls[5]?.[0]).toContain('/api/system/debug-symbols');
    expect((fetchMock.mock.calls[5]?.[1] as RequestInit)?.method).toBe('PUT');
    expect((fetchMock.mock.calls[5]?.[1] as RequestInit)?.body).toBe(
      JSON.stringify({ symbols: 'AAPL' })
    );
    expect(fetchMock.mock.calls[6]?.[0]).toContain('/api/system/debug-symbols');
    expect((fetchMock.mock.calls[6]?.[1] as RequestInit)?.method).toBe('DELETE');
    expect(fetchMock.mock.calls[7]?.[0]).toContain('/api/system/status-view?refresh=true');
  });

  it('builds ADLS tree and file preview requests with the expected query params', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(
        jsonResponse({
          layer: 'gold',
          container: 'gold',
          path: 'market/AAPL',
          truncated: false,
          scanLimit: 25,
          entries: []
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          layer: 'gold',
          path: 'market/AAPL/_delta_log/000000.json',
          isPlainText: true,
          truncated: false,
          maxBytes: 4096,
          contentPreview: '{}'
        })
      );

    const { apiService } = await importApiService();

    await apiService.getAdlsTree({
      layer: 'gold',
      path: 'market/AAPL',
      maxEntries: 25
    });
    await apiService.getAdlsFilePreview({
      layer: 'gold',
      path: 'market/AAPL/_delta_log/000000.json',
      maxBytes: 4096,
      maxDeltaFiles: 7
    });

    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      '/api/data/adls/tree?layer=gold&path=market%2FAAPL&max_entries=25'
    );
    expect(fetchMock.mock.calls[2]?.[0]).toContain(
      '/api/data/adls/file-preview?layer=gold&path=market%2FAAPL%2F_delta_log%2F000000.json&max_bytes=4096&max_delta_files=7'
    );
  });

  it('builds data profiling and stock screener requests with the correct endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(
        jsonResponse({
          layer: 'gold',
          domain: 'market',
          column: 'close',
          kind: 'numeric',
          totalRows: 100,
          nonNullCount: 100,
          nullCount: 0,
          sampleRows: 100,
          bins: []
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          layer: 'gold',
          domain: 'regime/latest',
          column: 'score',
          kind: 'numeric',
          totalRows: 100,
          nonNullCount: 100,
          nullCount: 0,
          sampleRows: 100,
          bins: []
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          asOf: '2026-04-18',
          total: 1,
          limit: 25,
          offset: 50,
          rows: []
        })
      );

    const { apiService } = await importApiService();

    await apiService.getDataProfile('gold', 'market', 'close', {
      ticker: 'AAPL',
      bins: 10,
      sampleRows: 100,
      topValues: 5
    });
    await apiService.getDataProfile('gold', 'regime/latest', 'score', {
      bins: 12
    });
    await apiService.getStockScreener({
      q: 'AAPL',
      limit: 25,
      offset: 50,
      asOf: '2026-04-18',
      sort: 'close',
      direction: 'asc'
    });

    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      '/api/data/gold/profile?domain=market&column=close&ticker=AAPL&bins=10&sampleRows=100&topValues=5'
    );
    expect(fetchMock.mock.calls[2]?.[0]).toContain(
      '/api/data/gold/regime/latest/profile?column=score&bins=12'
    );
    expect(fetchMock.mock.calls[3]?.[0]).toContain(
      '/api/data/screener?q=AAPL&limit=25&offset=50&asOf=2026-04-18&sort=close&direction=asc'
    );
  });
});
