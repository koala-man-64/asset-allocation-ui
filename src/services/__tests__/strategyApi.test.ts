import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StrategyDetail } from '@/types/strategy';

vi.mock('@/services/authTransport', () => ({
  appendAuthHeaders: vi.fn(async (headersInput?: HeadersInit) => new Headers(headersInput))
}));

type StrategyApiModule = typeof import('@/services/strategyApi');

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('strategyApi', () => {
  const fetchMock = vi.fn();
  const windowWithConfig = window as typeof window & {
    __API_UI_CONFIG__?: { apiBaseUrl?: string };
  };

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    windowWithConfig.__API_UI_CONFIG__ = { apiBaseUrl: '/api' };
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete windowWithConfig.__API_UI_CONFIG__;
  });

  async function importStrategyApi(): Promise<StrategyApiModule> {
    return import('@/services/strategyApi');
  }

  async function invokeWithWarmup<T>(
    mainResponse: Response,
    action: (api: StrategyApiModule['strategyApi']) => Promise<T>
  ): Promise<T> {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(mainResponse);

    const { strategyApi } = await importStrategyApi();
    const result = await action(strategyApi);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/healthz');

    return result;
  }

  it('lists strategies through the shared request transport', async () => {
    await invokeWithWarmup(jsonResponse([]), (api) => api.listStrategies());

    const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
    expect(url.pathname).toBe('/api/strategies');
  });

  it('encodes strategy names when requesting detail', async () => {
    await invokeWithWarmup(
      jsonResponse({ name: 'alpha/beta', type: 'configured', config: { exits: [] } }),
      (api) => api.getStrategyDetail('alpha/beta')
    );

    const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
    expect(url.pathname).toBe('/api/strategies/alpha%2Fbeta/detail');
  });

  it('posts the exact strategy payload when saving', async () => {
    const payload: StrategyDetail = {
      name: 'quality-trend',
      type: 'configured',
      description: 'desk note',
      config: {
        rebalance: 'weekly',
        longOnly: true,
        topN: 20,
        lookbackWindow: 63,
        holdingPeriod: 21,
        costModel: 'default',
        intrabarConflictPolicy: 'stop_first',
        exits: []
      }
    };

    await invokeWithWarmup(jsonResponse({ status: 'ok' }), (api) => api.saveStrategy(payload));

    const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
    const options = fetchMock.mock.calls[1]?.[1] as RequestInit;

    expect(url.pathname).toBe('/api/strategies');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify(payload));
  });

  it('encodes strategy names when deleting', async () => {
    await invokeWithWarmup(jsonResponse({ status: 'deleted' }), (api) =>
      api.deleteStrategy('alpha beta/gamma')
    );

    const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
    const options = fetchMock.mock.calls[1]?.[1] as RequestInit;

    expect(url.pathname).toBe('/api/strategies/alpha%20beta%2Fgamma');
    expect(options.method).toBe('DELETE');
  });
});
