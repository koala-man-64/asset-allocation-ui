import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ApiServiceModule = typeof import('@/services/apiService');

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('apiService cookie auth transport', () => {
  const fetchMock = vi.fn();
  const windowWithConfig = window as typeof window & {
    __API_UI_CONFIG__?: {
      apiBaseUrl?: string;
      authProvider?: string;
      authSessionMode?: string;
      authRequired?: boolean;
    };
  };

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    windowWithConfig.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      authProvider: 'password',
      authSessionMode: 'cookie',
      authRequired: true
    };
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
  });

  it('sends cookie credentials and csrf without Authorization headers', async () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      value: 'aa_csrf_dev=csrf-token'
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const { request } = await importApiService();

    await expect(
      request('/auth/session', {
        method: 'DELETE',
        retryOnStatusCodes: false
      })
    ).resolves.toEqual({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Headers;
    expect(init.credentials).toBe('include');
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('X-CSRF-Token')).toBe('csrf-token');
  });

  it('posts the password session request body to /auth/session', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        authMode: 'password',
        subject: 'shared-password',
        requiredRoles: [],
        grantedRoles: []
      })
    );

    const { apiService } = await importApiService();

    await apiService.createPasswordAuthSession('shared-password');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.body).toBe(JSON.stringify({ password: 'shared-password' }));
  });

  it('throws an ApiError directly when the backend returns 401', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
    fetchMock.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
    );

    const { request } = await importApiService();

    await expect(request('/system/status-view')).rejects.toThrow(/API Error: 401 Unauthorized/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forces cookie-session API traffic back onto the same-origin /api mount', async () => {
    windowWithConfig.__API_UI_CONFIG__ = {
      apiBaseUrl: 'https://asset-allocation-api.example.com/api',
      authProvider: 'password',
      authSessionMode: 'cookie',
      authRequired: true
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const { request } = await importApiService();

    await expect(request('/system/status-view')).resolves.toMatchObject({ ok: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/healthz');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/system/status-view');
  });
});
