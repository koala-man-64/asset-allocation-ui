import type { Page, Route } from '@playwright/test';

const NOW = '2026-04-18T14:30:00Z';

const systemStatusViewPayload = {
  version: 3,
  generatedAt: NOW,
  systemHealth: {
    overall: 'healthy',
    lastUpdated: NOW,
    alerts: [],
    resources: [
      {
        name: 'aca-job-market-bronze',
        resourceType: 'Microsoft.App/jobs',
        status: 'healthy',
        jobCategory: 'data-pipeline',
        jobKey: 'market',
        jobRole: 'load',
        triggerOwner: 'schedule',
        metadataSource: 'tags',
        metadataStatus: 'valid',
        runningState: 'Succeeded',
        lastModifiedAt: NOW,
        signals: []
      },
      {
        name: 'gold-regime-job',
        resourceType: 'Microsoft.App/jobs',
        status: 'healthy',
        jobCategory: 'strategy-compute',
        jobKey: 'regime',
        jobRole: 'publish',
        triggerOwner: 'schedule',
        metadataSource: 'tags',
        metadataStatus: 'valid',
        runningState: 'Succeeded',
        lastModifiedAt: NOW,
        signals: []
      },
      {
        name: 'results-reconcile-job',
        resourceType: 'Microsoft.App/jobs',
        status: 'warning',
        jobCategory: 'operational-support',
        jobKey: 'results-reconcile',
        jobRole: 'reconcile',
        triggerOwner: 'reconciler',
        metadataSource: 'legacy-catalog',
        metadataStatus: 'fallback',
        runningState: 'Succeeded',
        lastModifiedAt: NOW,
        signals: []
      },
      {
        name: 'aca-job-backtest-runner',
        resourceType: 'Microsoft.App/jobs',
        status: 'healthy',
        runningState: 'Running',
        lastModifiedAt: NOW,
        signals: []
      },
      {
        name: 'aca-job-ranking-materialize',
        resourceType: 'Microsoft.App/jobs',
        status: 'healthy',
        runningState: 'Succeeded',
        lastModifiedAt: NOW,
        signals: []
      }
    ],
    recentJobs: [
      {
        jobName: 'aca-job-market-bronze',
        jobType: 'data-ingest',
        jobCategory: 'data-pipeline',
        jobKey: 'market',
        jobRole: 'load',
        triggerOwner: 'schedule',
        metadataSource: 'tags',
        metadataStatus: 'valid',
        status: 'success',
        startTime: NOW,
        duration: 180,
        triggeredBy: 'playwright'
      },
      {
        jobName: 'aca-job-backtest-runner',
        jobType: 'backtest',
        status: 'running',
        startTime: NOW,
        duration: 240,
        triggeredBy: 'playwright'
      },
      {
        jobName: 'aca-job-ranking-materialize',
        jobType: 'data-ingest',
        status: 'success',
        startTime: NOW,
        duration: 120,
        triggeredBy: 'playwright'
      }
    ],
    dataLayers: [
      {
        name: 'Bronze',
        description: 'Raw ingestion',
        status: 'healthy',
        lastUpdated: NOW,
        refreshFrequency: 'Daily',
        domains: [
          {
            name: 'market',
            type: 'delta',
            path: 'market-data',
            lastUpdated: NOW,
            status: 'healthy',
            jobName: 'aca-job-market-bronze',
            portalUrl: 'https://example.test/storage/market',
            jobUrl: 'https://example.test/jobs/market'
          }
        ]
      },
      {
        name: 'Silver',
        description: 'Normalized dataset',
        status: 'healthy',
        lastUpdated: NOW,
        refreshFrequency: 'Daily',
        domains: [
          {
            name: 'market',
            type: 'delta',
            path: 'market-data',
            lastUpdated: NOW,
            status: 'healthy',
            jobName: 'aca-job-market-silver'
          }
        ]
      },
      {
        name: 'Gold',
        description: 'Feature outputs',
        status: 'healthy',
        lastUpdated: NOW,
        refreshFrequency: 'Daily',
        domains: [
          {
            name: 'finance',
            type: 'delta',
            path: 'finance-data',
            lastUpdated: NOW,
            status: 'healthy',
            jobName: 'aca-job-finance-gold'
          }
        ]
      }
    ]
  },
  metadataSnapshot: {
    version: 2,
    updatedAt: NOW,
    entries: {
      'bronze/market': {
        layer: 'bronze',
        domain: 'market',
        container: 'bronze',
        type: 'delta',
        computedAt: NOW,
        metadataSource: 'artifact',
        symbolCount: 501,
        columnCount: 12,
        totalBytes: 10485760,
        warnings: [],
        dateRange: {
          min: '2026-01-02T00:00:00Z',
          max: '2026-04-18T00:00:00Z',
          column: 'date',
          source: 'stats'
        }
      },
      'silver/market': {
        layer: 'silver',
        domain: 'market',
        container: 'silver',
        type: 'delta',
        computedAt: NOW,
        metadataSource: 'artifact',
        symbolCount: 501,
        columnCount: 18,
        totalBytes: 9437184,
        warnings: []
      },
      'gold/finance': {
        layer: 'gold',
        domain: 'finance',
        container: 'gold',
        type: 'delta',
        computedAt: NOW,
        metadataSource: 'artifact',
        symbolCount: 501,
        columnCount: 24,
        totalBytes: 6291456,
        warnings: []
      }
    },
    warnings: []
  },
  sources: {
    systemHealth: 'live-refresh',
    metadataSnapshot: 'persisted-snapshot'
  }
};

const containerAppsPayload = {
  probed: true,
  apps: [
    {
      name: 'ui-api',
      resourceType: 'Microsoft.App/containerApps',
      status: 'healthy',
      details: 'Serving traffic',
      provisioningState: 'Succeeded',
      runningState: 'Running',
      latestReadyRevisionName: 'ui-api--000001',
      ingressFqdn: 'ui-api.example.test',
      checkedAt: NOW,
      health: {
        status: 'healthy',
        url: 'https://ui-api.example.test/healthz',
        httpStatus: 200,
        checkedAt: NOW
      }
    }
  ]
};

const dataProfilingRows = [
  {
    close: 182.31,
    symbol: 'AAPL',
    sector: 'Technology',
    trade_date: '2026-04-18',
    volume: 1300000
  },
  {
    close: 421.03,
    symbol: 'MSFT',
    sector: 'Technology',
    trade_date: '2026-04-18',
    volume: 990000
  }
];

const dataProfilePayload = {
  layer: 'gold',
  domain: 'market',
  column: 'close',
  kind: 'numeric',
  totalRows: 4000,
  nonNullCount: 3980,
  nullCount: 20,
  sampleRows: 1200,
  uniqueCount: 875,
  duplicateCount: 325,
  bins: [
    { label: '0-100', count: 140, start: 0, end: 100 },
    { label: '100-200', count: 420, start: 100, end: 200 },
    { label: '200-300', count: 300, start: 200, end: 300 },
    { label: '300-500', count: 340, start: 300, end: 500 }
  ],
  topValues: []
};

const backtestRunsPayload = {
  runs: [
    {
      run_id: 'run-playwright-queued',
      run_name: 'playwright queued backtest',
      status: 'queued',
      submitted_at: NOW,
      start_date: '2026-01-01',
      end_date: '2026-04-18'
    }
  ],
  limit: 8,
  offset: 0
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function jobLogsPayload(jobName: string) {
  return {
    jobName,
    runsRequested: 1,
    runsReturned: 1,
    tailLines: 50,
    runs: [
      {
        executionName: `${jobName}-20260418`,
        executionId: `${jobName}-20260418`,
        status: 'Succeeded',
        startTime: NOW,
        endTime: NOW,
        tail: ['Job completed successfully.'],
        consoleLogs: [
          {
            timestamp: NOW,
            stream_s: 'stdout',
            executionName: `${jobName}-20260418`,
            message: 'Job completed successfully.'
          }
        ]
      }
    ]
  };
}

function normalizeApiPath(url: URL) {
  return url.pathname.replace(/\/api/, '');
}

async function handleApiRoute(route: Route) {
  const requestUrl = new URL(route.request().url());
  const apiPath = normalizeApiPath(requestUrl);

  if (apiPath === '/system/status-view') {
    return json(route, systemStatusViewPayload);
  }

  if (apiPath === '/system/container-apps') {
    return json(route, containerAppsPayload);
  }

  if (apiPath.startsWith('/system/jobs/') && apiPath.endsWith('/logs')) {
    const jobName = decodeURIComponent(apiPath.split('/')[3] || 'job');
    return json(route, jobLogsPayload(jobName));
  }

  if (apiPath === '/system/health') {
    return json(route, systemStatusViewPayload.systemHealth);
  }

  if (apiPath === '/backtests') {
    return json(route, backtestRunsPayload);
  }

  if (apiPath === '/data/gold/market') {
    return json(route, dataProfilingRows);
  }

  if (apiPath === '/data/gold/profile') {
    return json(route, dataProfilePayload);
  }

  return json(route, {}, 404);
}

export async function registerUiApiMocks(page: Page) {
  await page.route('**/healthz', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' })
    });
  });

  await page.route('**/api/**', handleApiRoute);
}
