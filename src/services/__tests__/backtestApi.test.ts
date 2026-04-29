import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BacktestApiModule = typeof import('@/services/backtestApi');

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('backtestApi', () => {
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

  async function importBacktestApi(): Promise<BacktestApiModule> {
    return import('@/services/backtestApi');
  }

  async function invokeWithWarmup<T>(
    mainResponse: Response,
    action: (api: BacktestApiModule['backtestApi']) => Promise<T>
  ): Promise<T> {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(mainResponse);

    const { backtestApi } = await importBacktestApi();
    const result = await action(backtestApi);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/healthz');

    return result;
  }

  describe('getJobLogs', () => {
    it('fetches logs with default parameters through the shared request transport', async () => {
      await invokeWithWarmup(
        jsonResponse({
          jobName: 'test-job',
          runs: [],
          tailLines: 100,
          runsRequested: 1,
          runsReturned: 0
        }),
        (api) => api.getJobLogs('test-job')
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      const options = fetchMock.mock.calls[1]?.[1] as RequestInit;
      const headers = new Headers(options.headers);

      expect(url.pathname).toBe('/api/system/jobs/test-job/logs');
      expect(url.searchParams.get('runs')).toBe('1');
      expect(headers.get('X-Request-ID')).toBeTruthy();
    });

    it('fetches logs with a custom run count', async () => {
      await invokeWithWarmup(
        jsonResponse({
          jobName: 'test-job',
          runs: []
        }),
        (api) => api.getJobLogs('test-job', { runs: 5 })
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      expect(url.searchParams.get('runs')).toBe('5');
    });
  });

  describe('job control', () => {
    it('posts the stop job endpoint', async () => {
      await invokeWithWarmup(
        jsonResponse({
          jobName: 'test-job',
          action: 'stop',
          runningState: 'Stopped'
        }),
        (api) => api.stopJob('test-job')
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      const options = fetchMock.mock.calls[1]?.[1] as RequestInit;

      expect(url.pathname).toBe('/api/system/jobs/test-job/stop');
      expect(options.method).toBe('POST');
    });

    it('posts the suspend job endpoint', async () => {
      await invokeWithWarmup(
        jsonResponse({
          jobName: 'test-job',
          action: 'suspend',
          runningState: 'Suspended'
        }),
        (api) => api.suspendJob('test-job')
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      const options = fetchMock.mock.calls[1]?.[1] as RequestInit;

      expect(url.pathname).toBe('/api/system/jobs/test-job/suspend');
      expect(options.method).toBe('POST');
    });

    it('posts the resume job endpoint', async () => {
      await invokeWithWarmup(
        jsonResponse({
          jobName: 'test-job',
          action: 'resume',
          runningState: 'Running'
        }),
        (api) => api.resumeJob('test-job')
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      const options = fetchMock.mock.calls[1]?.[1] as RequestInit;

      expect(url.pathname).toBe('/api/system/jobs/test-job/resume');
      expect(options.method).toBe('POST');
    });
  });

  describe('backtest result endpoints', () => {
    it('posts the validation endpoint with shared run request payload', async () => {
      await invokeWithWarmup(
        jsonResponse({ verdict: 'pass', checks: [], blockedReasons: [], warnings: [] }),
        (api) =>
          api.validateRun({
            strategyRef: { strategyName: 'quality-trend' },
            startTs: '2026-03-03T14:30:00Z',
            endTs: '2026-03-03T14:35:00Z',
            barSize: '5m',
            assumptions: { benchmarkSymbol: 'SPY', costModel: 'desk-default' }
          })
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      const options = fetchMock.mock.calls[1]?.[1] as RequestInit;

      expect(url.pathname).toBe('/api/backtests/validation');
      expect(options.method).toBe('POST');
      expect(JSON.parse(String(options.body))).toMatchObject({
        strategyRef: { strategyName: 'quality-trend' },
        assumptions: { benchmarkSymbol: 'SPY' }
      });
    });

    it('posts the split run creation endpoint', async () => {
      await invokeWithWarmup(
        jsonResponse({
          run: { run_id: 'run-1', status: 'queued', submitted_at: '2026-03-03T14:30:00Z' },
          created: true,
          reusedInflight: false,
          streamUrl: '/api/backtests/run-1/events'
        }),
        (api) =>
          api.runBacktest({
            strategyRef: { strategyName: 'quality-trend' },
            startTs: '2026-03-03T14:30:00Z',
            endTs: '2026-03-03T14:35:00Z',
            barSize: '5m'
          })
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      const options = fetchMock.mock.calls[1]?.[1] as RequestInit;

      expect(url.pathname).toBe('/api/backtests/runs');
      expect(options.method).toBe('POST');
    });

    it('fetches run detail', async () => {
      await invokeWithWarmup(
        jsonResponse({
          run: { run_id: 'run-1', status: 'completed', submitted_at: '2026-03-03T14:30:00Z' },
          effectiveConfig: {},
          warnings: []
        }),
        (api) => api.getRunDetail('run-1')
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      expect(url.pathname).toBe('/api/backtests/run-1/detail');
    });

    it('fetches summary without a source query parameter', async () => {
      await invokeWithWarmup(
        jsonResponse({ run_id: 'run-1', sharpe_ratio: 1.2 }),
        (api) => api.getSummary('run-1')
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      expect(url.pathname).toBe('/api/backtests/run-1/summary');
      expect(url.searchParams.get('source')).toBeNull();
    });

    it('fetches timeseries without a source query parameter', async () => {
      await invokeWithWarmup(
        jsonResponse({ points: [], total_points: 0, truncated: false }),
        (api) => api.getTimeseries('run-1', { maxPoints: 250 })
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      expect(url.pathname).toBe('/api/backtests/run-1/metrics/timeseries');
      expect(url.searchParams.get('max_points')).toBe('250');
      expect(url.searchParams.get('source')).toBeNull();
    });

    it('fetches rolling metrics without a source query parameter', async () => {
      await invokeWithWarmup(
        jsonResponse({ points: [], total_points: 0, truncated: false }),
        (api) => api.getRolling('run-1', { windowDays: 126, maxPoints: 500 })
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      expect(url.pathname).toBe('/api/backtests/run-1/metrics/rolling');
      expect(url.searchParams.get('window_days')).toBe('126');
      expect(url.searchParams.get('max_points')).toBe('500');
      expect(url.searchParams.get('source')).toBeNull();
    });

    it('fetches trades without a source query parameter', async () => {
      await invokeWithWarmup(
        jsonResponse({ trades: [], total: 0, limit: 100, offset: 50 }),
        (api) => api.getTrades('run-1', { limit: 100, offset: 50 })
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      expect(url.pathname).toBe('/api/backtests/run-1/trades');
      expect(url.searchParams.get('limit')).toBe('100');
      expect(url.searchParams.get('offset')).toBe('50');
      expect(url.searchParams.get('source')).toBeNull();
    });

    it('fetches replay with paging and symbol filter', async () => {
      await invokeWithWarmup(
        jsonResponse({ runId: 'run-1', events: [], total: 0, limit: 50, offset: 10, warnings: [] }),
        (api) => api.getReplay('run-1', { limit: 50, offset: 10, symbol: 'MSFT' })
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      expect(url.pathname).toBe('/api/backtests/run-1/replay');
      expect(url.searchParams.get('limit')).toBe('50');
      expect(url.searchParams.get('offset')).toBe('10');
      expect(url.searchParams.get('symbol')).toBe('MSFT');
    });

    it('fetches attribution exposure', async () => {
      await invokeWithWarmup(
        jsonResponse({ runId: 'run-1', slices: [], concentration: [], warnings: [] }),
        (api) => api.getAttributionExposure('run-1')
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      expect(url.pathname).toBe('/api/backtests/run-1/attribution-exposure');
    });

    it('posts run comparison', async () => {
      await invokeWithWarmup(
        jsonResponse({
          asOf: '2026-03-03T14:30:00Z',
          alignment: 'aligned',
          baselineRunId: 'run-1',
          runs: [],
          metrics: [],
          alignmentWarnings: [],
          blockedReasons: []
        }),
        (api) =>
          api.compareRuns({
            baselineRunId: 'run-1',
            challengerRunIds: ['run-2'],
            metricKeys: ['total_return']
          })
      );

      const url = new URL(fetchMock.mock.calls[1]?.[0] as string, 'http://localhost');
      const options = fetchMock.mock.calls[1]?.[1] as RequestInit;

      expect(url.pathname).toBe('/api/backtests/compare');
      expect(options.method).toBe('POST');
      expect(JSON.parse(String(options.body))).toEqual({
        baselineRunId: 'run-1',
        challengerRunIds: ['run-2'],
        metricKeys: ['total_return']
      });
    });
  });
});
