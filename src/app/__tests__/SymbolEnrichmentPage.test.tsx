import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SymbolEnrichmentPage } from '@/features/symbol-enrichment/SymbolEnrichmentPage';
import { renderWithProviders } from '@/test/utils';
import type { SymbolEnrichmentSymbolDetail } from '@/services/symbolEnrichmentApi';
import { symbolEnrichmentApi } from '@/services/symbolEnrichmentApi';

vi.mock('@/services/symbolEnrichmentApi', () => ({
  symbolEnrichmentApi: {
    getSummary: vi.fn(),
    listRuns: vi.fn(),
    listSymbols: vi.fn(),
    getSymbolDetail: vi.fn(),
    enqueue: vi.fn(),
    saveOverrides: vi.fn()
  }
}));

const DETAIL_PAYLOAD: SymbolEnrichmentSymbolDetail = {
  providerFacts: {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    industry2: 'Hardware',
    country: 'US',
    exchange: 'NASDAQ',
    assetType: 'Common Stock',
    status: 'Active',
    isOptionable: true,
    sourceNasdaq: true,
    sourceMassive: true,
    sourceAlphaVantage: true
  },
  currentProfile: {
    symbol: 'AAPL',
    sourceKind: 'ai',
    validationStatus: 'accepted',
    security_type_norm: 'common_equity',
    exchange_mic: 'XNAS',
    country_of_risk: 'US',
    sector_norm: 'Technology',
    industry_group_norm: 'Technology Hardware',
    industry_norm: 'Consumer Electronics',
    is_adr: false,
    is_etf: false,
    is_cef: false,
    is_preferred: false,
    share_class: null,
    listing_status_norm: 'active',
    issuer_summary_short: 'Global consumer electronics platform.',
    aiModel: 'gpt-5.4-mini',
    aiConfidence: 0.92,
    dataCompletenessScore: 0.88,
    marketCapBucket: 'mega',
    liquidityBucket: 'high',
    updatedAt: '2026-04-19T12:00:00Z'
  },
  overrides: [
    {
      symbol: 'AAPL',
      fieldName: 'issuer_summary_short',
      value: 'Locked summary',
      isLocked: true,
      updatedBy: 'operator@test',
      updatedAt: '2026-04-18T16:00:00Z'
    }
  ],
  history: [
    {
      historyId: 'hist-1',
      symbol: 'AAPL',
      fieldName: 'sector_norm',
      previousValue: 'Tech',
      newValue: 'Technology',
      sourceKind: 'ai',
      aiModel: 'gpt-5.4-mini',
      aiConfidence: 0.9,
      changeReason: 'symbol_cleanup',
      runId: 'run-1',
      updatedAt: '2026-04-18T12:00:00Z'
    }
  ]
};

describe('SymbolEnrichmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(symbolEnrichmentApi.getSummary).mockResolvedValue({
      backlogCount: 12,
      validationFailureCount: 2,
      lockCount: 5,
      lastRun: {
        runId: 'run-1',
        status: 'completed',
        mode: 'fill_missing',
        queuedCount: 10,
        claimedCount: 0,
        completedCount: 10,
        failedCount: 0,
        acceptedUpdateCount: 8,
        rejectedUpdateCount: 0,
        lockedSkipCount: 1,
        overwriteCount: 3,
        startedAt: '2026-04-18T12:00:00Z',
        completedAt: '2026-04-18T12:05:00Z'
      },
      activeRun: null
    });
    vi.mocked(symbolEnrichmentApi.listRuns).mockResolvedValue([
      {
        runId: 'run-1',
        status: 'completed',
        mode: 'fill_missing',
        queuedCount: 10,
        claimedCount: 0,
        completedCount: 10,
        failedCount: 0,
        acceptedUpdateCount: 8,
        rejectedUpdateCount: 0,
        lockedSkipCount: 1,
        overwriteCount: 3,
        startedAt: '2026-04-18T12:00:00Z',
        completedAt: '2026-04-18T12:05:00Z'
      }
    ]);
    vi.mocked(symbolEnrichmentApi.listSymbols).mockResolvedValue([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        status: 'accepted',
        sourceKind: 'ai',
        updatedAt: '2026-04-19T12:00:00Z',
        missingFieldCount: 1,
        lockedFieldCount: 1,
        dataCompletenessScore: 0.88
      }
    ]);
    vi.mocked(symbolEnrichmentApi.getSymbolDetail).mockResolvedValue(DETAIL_PAYLOAD);
    vi.mocked(symbolEnrichmentApi.enqueue).mockResolvedValue({
      runId: 'run-2',
      status: 'queued',
      mode: 'fill_missing',
      queuedCount: 1,
      claimedCount: 0,
      completedCount: 0,
      failedCount: 0,
      acceptedUpdateCount: 0,
      rejectedUpdateCount: 0,
      lockedSkipCount: 0,
      overwriteCount: 0,
      startedAt: null,
      completedAt: null
    });
    vi.mocked(symbolEnrichmentApi.saveOverrides).mockResolvedValue(DETAIL_PAYLOAD.overrides);
  });

  it('renders symbol list and selected detail payload', async () => {
    renderWithProviders(<SymbolEnrichmentPage />);

    expect(await screen.findByText('Symbol Enrichment Console')).toBeInTheDocument();
    expect(await screen.findByText('Apple Inc.')).toBeInTheDocument();
    expect(await screen.findByText('Global consumer electronics platform.')).toBeInTheDocument();
    expect(screen.getByText('Locked summary')).toBeInTheDocument();
  });

  it('queues a targeted rerun for the selected symbol', async () => {
    renderWithProviders(<SymbolEnrichmentPage />);

    await screen.findByText('Apple Inc.');

    fireEvent.click(screen.getByRole('button', { name: /rerun symbol/i }));

    await waitFor(() => {
      expect(symbolEnrichmentApi.enqueue).toHaveBeenCalledWith({
        fullScan: false,
        symbols: ['AAPL'],
        overwriteMode: 'fill_missing',
        maxSymbols: 1
      });
    });
  });

  it('saves override changes for the selected symbol', async () => {
    renderWithProviders(<SymbolEnrichmentPage />);

    const summaryField = await screen.findByLabelText(/Issuer Summary Short override/i);
    fireEvent.change(summaryField, { target: { value: 'Operator summary' } });
    fireEvent.click(screen.getByRole('button', { name: /save overrides/i }));

    await waitFor(() => {
      expect(symbolEnrichmentApi.saveOverrides).toHaveBeenCalledWith(
        'AAPL',
        expect.arrayContaining([
          expect.objectContaining({
            symbol: 'AAPL',
            fieldName: 'issuer_summary_short',
            value: 'Operator summary',
            isLocked: true
          })
        ])
      );
    });
  });
});
