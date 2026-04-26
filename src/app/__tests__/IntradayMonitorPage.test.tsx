import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IntradayMonitorPage } from '@/features/intraday-monitor/IntradayMonitorPage';
import { renderWithProviders } from '@/test/utils';
import type {
  IntradayRefreshBatchSummary,
  IntradayStatusResponse,
  IntradayWatchlistDetail,
  IntradayWatchlistSummary
} from '@/services/intradayMonitorApi';
import { intradayMonitorApi } from '@/services/intradayMonitorApi';
import { requestRealtimeSubscription, requestRealtimeUnsubscription } from '@/services/realtimeBus';

vi.mock('@/services/intradayMonitorApi', () => ({
  intradayMonitorApi: {
    listWatchlists: vi.fn(),
    getWatchlist: vi.fn(),
    createWatchlist: vi.fn(),
    updateWatchlist: vi.fn(),
    deleteWatchlist: vi.fn(),
    appendSymbols: vi.fn(),
    runWatchlist: vi.fn(),
    getStatus: vi.fn(),
    listRuns: vi.fn(),
    listEvents: vi.fn(),
    listRefreshBatches: vi.fn()
  },
  intradayMonitorKeys: {
    all: () => ['intraday-monitor'],
    watchlists: () => ['intraday-monitor', 'watchlists'],
    watchlist: (watchlistId: string | null) => [
      'intraday-monitor',
      'watchlists',
      'detail',
      watchlistId ?? 'new'
    ],
    status: (watchlistId?: string | null, q?: string | null) => [
      'intraday-monitor',
      'status',
      watchlistId ?? 'all',
      q?.trim() || 'all'
    ],
    runs: (watchlistId?: string | null) => ['intraday-monitor', 'runs', watchlistId ?? 'all'],
    events: (watchlistId?: string | null) => ['intraday-monitor', 'events', watchlistId ?? 'all'],
    refreshBatches: (watchlistId?: string | null) => [
      'intraday-monitor',
      'refresh-batches',
      watchlistId ?? 'all'
    ]
  }
}));

vi.mock('@/services/realtimeBus', () => ({
  requestRealtimeSubscription: vi.fn(),
  requestRealtimeUnsubscription: vi.fn()
}));

const WATCHLIST_SUMMARY: IntradayWatchlistSummary = {
  watchlistId: 'wl-1',
  name: 'Growth Leaders',
  description: 'Fast-moving megacaps.',
  enabled: true,
  symbolCount: 3,
  pollIntervalMinutes: 5,
  refreshCooldownMinutes: 15,
  autoRefreshEnabled: true,
  marketSession: 'us_equities_regular',
  nextDueAt: '2026-04-19T14:35:00Z',
  lastRunAt: '2026-04-19T14:30:00Z',
  updatedAt: '2026-04-19T14:30:00Z'
};

const WATCHLIST_DETAIL: IntradayWatchlistDetail = {
  ...WATCHLIST_SUMMARY,
  symbols: ['AAPL', 'MSFT', 'NVDA'],
  createdAt: '2026-04-18T13:00:00Z'
};

const STATUS_RESPONSE: IntradayStatusResponse = {
  counts: {
    watchlistCount: 1,
    enabledWatchlistCount: 1,
    dueRunBacklogCount: 2,
    failedRunCount: 1,
    staleSymbolCount: 4,
    refreshBatchBacklogAgeSeconds: 180
  },
  latestMonitorRun: {
    runId: 'run-1',
    watchlistId: 'wl-1',
    watchlistName: 'Growth Leaders',
    triggerKind: 'manual',
    status: 'completed',
    forceRefresh: true,
    symbolCount: 3,
    observedSymbolCount: 3,
    eligibleRefreshCount: 2,
    refreshBatchCount: 1,
    executionName: 'intraday-monitor-job-exec-001',
    dueAt: '2026-04-19T14:30:00Z',
    queuedAt: '2026-04-19T14:30:02Z',
    claimedAt: '2026-04-19T14:30:05Z',
    completedAt: '2026-04-19T14:31:00Z',
    lastError: null
  },
  latestRefreshBatch: {
    batchId: 'batch-1',
    runId: 'run-1',
    watchlistId: 'wl-1',
    watchlistName: 'Growth Leaders',
    domain: 'market',
    bucketLetter: 'a',
    status: 'completed',
    symbols: ['AAPL', 'AMD'],
    symbolCount: 2,
    executionName: 'intraday-market-refresh-job-exec-001',
    claimedAt: '2026-04-19T14:31:02Z',
    completedAt: '2026-04-19T14:32:00Z',
    createdAt: '2026-04-19T14:31:00Z',
    updatedAt: '2026-04-19T14:32:00Z',
    lastError: null
  },
  total: 1,
  items: [
    {
      watchlistId: 'wl-1',
      symbol: 'AAPL',
      monitorStatus: 'refreshed',
      lastSnapshotAt: '2026-04-19T14:30:58Z',
      lastObservedPrice: 204.13,
      lastSuccessfulMarketRefreshAt: '2026-04-19T14:31:59Z',
      lastRunId: 'run-1',
      lastError: null,
      updatedAt: '2026-04-19T14:31:59Z'
    }
  ]
};

const REFRESH_BATCH: IntradayRefreshBatchSummary = {
  batchId: 'batch-1',
  runId: 'run-1',
  watchlistId: 'wl-1',
  watchlistName: 'Growth Leaders',
  domain: 'market',
  bucketLetter: 'a',
  status: 'completed',
  symbols: ['AAPL', 'AMD'],
  symbolCount: 2,
  executionName: 'intraday-market-refresh-job-exec-001',
  claimedAt: '2026-04-19T14:31:02Z',
  completedAt: '2026-04-19T14:32:00Z',
  createdAt: '2026-04-19T14:31:00Z',
  updatedAt: '2026-04-19T14:32:00Z',
  lastError: null
};

describe('IntradayMonitorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(intradayMonitorApi.listWatchlists).mockResolvedValue([WATCHLIST_SUMMARY]);
    vi.mocked(intradayMonitorApi.getWatchlist).mockResolvedValue(WATCHLIST_DETAIL);
    vi.mocked(intradayMonitorApi.createWatchlist).mockResolvedValue({
      ...WATCHLIST_DETAIL,
      watchlistId: 'wl-2',
      name: 'AI Momentum',
      symbols: ['AMD', 'NVDA']
    });
    vi.mocked(intradayMonitorApi.updateWatchlist).mockResolvedValue(WATCHLIST_DETAIL);
    vi.mocked(intradayMonitorApi.deleteWatchlist).mockResolvedValue({ status: 'deleted' });
    vi.mocked(intradayMonitorApi.appendSymbols).mockResolvedValue({
      watchlist: {
        ...WATCHLIST_DETAIL,
        symbolCount: 5,
        symbols: ['AAPL', 'MSFT', 'NVDA', 'AMD', 'TSLA']
      },
      addedSymbols: ['AMD', 'TSLA'],
      alreadyPresentSymbols: ['AAPL'],
      queuedRun: {
        ...STATUS_RESPONSE.latestMonitorRun!,
        runId: 'run-append',
        status: 'queued',
        forceRefresh: false,
        symbolCount: 5,
        executionName: null,
        claimedAt: null,
        completedAt: null
      },
      runSkippedReason: null
    });
    vi.mocked(intradayMonitorApi.runWatchlist).mockResolvedValue({
      ...STATUS_RESPONSE.latestMonitorRun!,
      runId: 'run-2',
      status: 'queued',
      executionName: null,
      claimedAt: null,
      completedAt: null
    });
    vi.mocked(intradayMonitorApi.getStatus).mockResolvedValue(STATUS_RESPONSE);
    vi.mocked(intradayMonitorApi.listRuns).mockResolvedValue([STATUS_RESPONSE.latestMonitorRun!]);
    vi.mocked(intradayMonitorApi.listEvents).mockResolvedValue([
      {
        eventId: 'event-1',
        runId: 'run-1',
        watchlistId: 'wl-1',
        symbol: 'AAPL',
        eventType: 'snapshot.observed',
        severity: 'info',
        message: 'AAPL snapshot accepted.',
        details: {},
        createdAt: '2026-04-19T14:30:58Z'
      }
    ]);
    vi.mocked(intradayMonitorApi.listRefreshBatches).mockResolvedValue([REFRESH_BATCH]);
  });

  it('renders the intraday console and manages realtime subscription lifecycle', async () => {
    const view = renderWithProviders(<IntradayMonitorPage />);

    expect(await screen.findByRole('heading', { name: 'Intraday Monitor' })).toBeInTheDocument();
    await waitFor(() => {
      expect(intradayMonitorApi.getWatchlist).toHaveBeenCalledWith('wl-1', expect.anything());
    });
    expect(await screen.findByText('AAPL')).toBeInTheDocument();
    expect(screen.getAllByText('Open Job Stream').length).toBeGreaterThan(0);
    expect(requestRealtimeSubscription).toHaveBeenCalledWith([
      'intraday-monitor',
      'intraday-refresh'
    ]);

    view.unmount();

    expect(requestRealtimeUnsubscription).toHaveBeenCalledWith([
      'intraday-monitor',
      'intraday-refresh'
    ]);
  });

  it('creates a new watchlist from the editor', async () => {
    renderWithProviders(<IntradayMonitorPage />);
    await screen.findByRole('button', { name: /new watchlist/i });

    fireEvent.click(screen.getByRole('button', { name: /new watchlist/i }));
    fireEvent.change(await screen.findByLabelText(/^Name$/i), {
      target: { value: 'AI Momentum' }
    });
    fireEvent.change(screen.getByLabelText(/^Symbols$/i), {
      target: { value: 'AMD\nNVDA' }
    });
    fireEvent.click(screen.getByRole('button', { name: /create watchlist/i }));

    await waitFor(() => {
      expect(intradayMonitorApi.createWatchlist).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'AI Momentum',
          symbols: ['AMD', 'NVDA'],
          pollIntervalMinutes: 5,
          refreshCooldownMinutes: 15,
          autoRefreshEnabled: true,
          marketSession: 'us_equities_regular'
        })
      );
    });
  });

  it('updates the selected watchlist and queues a manual run', async () => {
    renderWithProviders(<IntradayMonitorPage />);

    const pollInterval = await screen.findByLabelText(/Poll Interval \(minutes\)/i);
    fireEvent.change(pollInterval, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /save watchlist/i }));

    await waitFor(() => {
      expect(intradayMonitorApi.updateWatchlist).toHaveBeenCalledWith(
        'wl-1',
        expect.objectContaining({
          pollIntervalMinutes: 10,
          symbols: ['AAPL', 'MSFT', 'NVDA']
        })
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /manual run/i }));

    await waitFor(() => {
      expect(intradayMonitorApi.runWatchlist).toHaveBeenCalledWith('wl-1');
    });
  });

  it('appends symbols to the selected watchlist without replacing the list', async () => {
    renderWithProviders(<IntradayMonitorPage />);

    const addSymbols = await screen.findByLabelText(/^Add Symbols$/i);
    fireEvent.change(addSymbols, { target: { value: 'amd, tsla aapl' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add Symbols$/i }));

    await waitFor(() => {
      expect(intradayMonitorApi.appendSymbols).toHaveBeenCalledWith('wl-1', {
        symbols: ['AMD', 'TSLA', 'AAPL'],
        queueRun: true
      });
    });
  });

  it('deletes the selected watchlist', async () => {
    renderWithProviders(<IntradayMonitorPage />);

    await screen.findByRole('button', { name: /^Delete$/i });
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => {
      expect(intradayMonitorApi.deleteWatchlist).toHaveBeenCalledWith('wl-1');
    });
  });
});
