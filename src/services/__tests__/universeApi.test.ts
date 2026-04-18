import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UniverseDefinition } from '@/types/strategy';

vi.mock('@/services/authTransport', () => ({
  appendAuthHeaders: vi.fn(async (headersInput?: HeadersInit) => new Headers(headersInput))
}));

type UniverseApiModule = typeof import('@/services/universeApi');

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('universeApi', () => {
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

  async function importUniverseApi(): Promise<UniverseApiModule> {
    return import('@/services/universeApi');
  }

  async function invokeWithWarmup<T>(
    mainResponse: Response,
    action: (api: UniverseApiModule['universeApi']) => Promise<T>
  ): Promise<T> {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(mainResponse);

    const { universeApi } = await importUniverseApi();
    const result = await action(universeApi);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/healthz');

    return result;
  }

  it('requests the catalog from the dedicated universe endpoint', async () => {
    await invokeWithWarmup(
      jsonResponse({
        source: 'postgres_gold',
        fields: [
          {
            id: 'market.close',
            label: 'Close Price',
            valueKind: 'number',
            operators: ['eq', 'gt']
          }
        ]
      }),
      (api) => api.getUniverseCatalog()
    );

    const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
    expect(url.pathname).toBe('/api/universes/catalog');
  });

  it('posts the exact preview payload and keeps field ids intact', async () => {
    const universe: UniverseDefinition = {
      source: 'postgres_gold',
      root: {
        kind: 'group',
        operator: 'and',
        clauses: [
          {
            kind: 'condition',
            field: 'market.close',
            operator: 'gt',
            value: 10
          }
        ]
      }
    };

    await invokeWithWarmup(
      jsonResponse({
        source: 'postgres_gold',
        symbolCount: 2,
        sampleSymbols: ['AAPL', 'MSFT'],
        fieldsUsed: ['market.close'],
        warnings: []
      }),
      (api) => api.previewUniverse({ universe, sampleLimit: 12 })
    );

    const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
    const options = fetchMock.mock.calls[1]?.[1] as RequestInit;

    expect(url.pathname).toBe('/api/universes/preview');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ universe, sampleLimit: 12 }));
  });

  it('posts the exact save payload for a universe config', async () => {
    const config: UniverseDefinition = {
      source: 'postgres_gold',
      root: {
        kind: 'group',
        operator: 'and',
        clauses: [
          {
            kind: 'condition',
            field: 'quality.piotroski_f_score',
            operator: 'gte',
            value: 7
          }
        ]
      }
    };
    const payload = {
      name: 'large-cap-quality',
      description: 'desk cohort',
      config
    };

    await invokeWithWarmup(jsonResponse({ status: 'ok', message: 'saved', version: 2 }), (api) =>
      api.saveUniverseConfig(payload)
    );

    const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
    const options = fetchMock.mock.calls[1]?.[1] as RequestInit;

    expect(url.pathname).toBe('/api/universes');
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify(payload));
  });

  it('encodes universe names when deleting', async () => {
    await invokeWithWarmup(jsonResponse({ status: 'deleted' }), (api) =>
      api.deleteUniverseConfig('quality focus/growth')
    );

    const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
    const options = fetchMock.mock.calls[1]?.[1] as RequestInit;

    expect(url.pathname).toBe('/api/universes/quality%20focus%2Fgrowth');
    expect(options.method).toBe('DELETE');
  });
});
