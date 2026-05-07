import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StockExplorerPage } from '@/features/stocks/StockExplorerPage';
import { DataService } from '@/services/DataService';
import { renderWithProviders } from '@/test/utils';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

vi.mock('@/services/DataService', () => ({
  DataService: {
    getStockScreener: vi.fn()
  }
}));

const firstPageRows = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    country: 'US',
    isOptionable: true,
    close: 182.31,
    return1d: 0.011,
    return5d: 0.028,
    vol20d: 0.24,
    drawdown1y: -0.08,
    atr14d: 4.2,
    volume: 1300000,
    trend50_200: 0.12,
    aboveSma50: 1,
    compressionScore: 0.22,
    volumePctRank252d: 0.88,
    hasSilver: 1,
    hasGold: 1
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    sector: 'Technology',
    industry: 'Software',
    country: 'US',
    isOptionable: true,
    close: 421.03,
    return1d: -0.004,
    return5d: 0.012,
    vol20d: 0.18,
    drawdown1y: -0.05,
    atr14d: 5.3,
    volume: 990000,
    trend50_200: 0.06,
    aboveSma50: 0,
    compressionScore: 0.35,
    volumePctRank252d: 0.63,
    hasSilver: 1,
    hasGold: 1
  }
];

const secondPageRows = [
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    sector: 'Technology',
    industry: 'Semiconductors',
    country: 'US',
    isOptionable: true,
    close: 911.12,
    return1d: 0.02,
    return5d: 0.06,
    vol20d: 0.3,
    drawdown1y: -0.12,
    atr14d: 12.1,
    volume: 870000,
    trend50_200: 0.22,
    aboveSma50: 1,
    compressionScore: 0.4,
    volumePctRank252d: 0.91,
    hasSilver: 1,
    hasGold: 1
  }
];

describe('StockExplorerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    vi.mocked(DataService.getStockScreener).mockImplementation(async (params = {}) => {
      const offset = params.offset ?? 0;
      const rows = offset === 0 ? firstPageRows : secondPageRows;
      return {
        asOf: '2026-04-18',
        total: 3,
        limit: params.limit ?? 250,
        offset,
        rows,
        summary: {
          universeCount: 3,
          filteredCount: 3,
          coverage: {
            silverRows: 3,
            goldRows: 3,
            bothRows: 3,
            silverPct: 1,
            goldPct: 1
          },
          sectorCount: 1,
          countryCount: 1
        },
        facets: {
          sectors: [{ value: 'Technology', count: 3 }],
          countries: [{ value: 'US', count: 3 }],
          coverage: { silverRows: 3, goldRows: 3, bothRows: 3 }
        }
      };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the initial stock snapshot', async () => {
    renderWithProviders(<StockExplorerPage />);

    expect((await screen.findAllByText('Apple Inc.')).length).toBeGreaterThan(0);
    expect(screen.getByText('Microsoft Corp.')).toBeInTheDocument();
    expect(vi.mocked(DataService.getStockScreener).mock.calls[0]?.[0]).toMatchObject({
      q: undefined,
      limit: 250,
      offset: 0,
      asOf: undefined,
      sort: 'return_5d',
      direction: 'desc',
      has_gold: true
    });
  });

  it('toggles sort direction when a sortable column is selected twice', async () => {
    const user = userEvent.setup();

    renderWithProviders(<StockExplorerPage />);
    await screen.findAllByText('Apple Inc.');
    vi.mocked(DataService.getStockScreener).mockClear();

    await user.click(screen.getByRole('button', { name: /Close/i }));

    await waitFor(() => {
      expect(vi.mocked(DataService.getStockScreener).mock.calls.at(-1)?.[0]).toMatchObject({
        sort: 'close',
        direction: 'desc'
      });
    });

    vi.mocked(DataService.getStockScreener).mockClear();
    await user.click(screen.getByRole('button', { name: /Close/i }));

    await waitFor(() => {
      expect(vi.mocked(DataService.getStockScreener).mock.calls.at(-1)?.[0]).toMatchObject({
        sort: 'close',
        direction: 'asc'
      });
    });
  });

  it('applies a factor preset as server-side screener filters', async () => {
    const user = userEvent.setup();

    renderWithProviders(<StockExplorerPage />);
    await screen.findAllByText('Apple Inc.');
    vi.mocked(DataService.getStockScreener).mockClear();

    await user.click(screen.getByRole('button', { name: /Compression/i }));

    await waitFor(() => {
      expect(vi.mocked(DataService.getStockScreener).mock.calls.at(-1)?.[0]).toMatchObject({
        sort: 'compression_score',
        direction: 'asc',
        has_gold: true,
        max_compression_score: 0.5
      });
    });
  });

  it('debounces search input before refetching', async () => {
    const user = userEvent.setup();

    renderWithProviders(<StockExplorerPage />);
    await screen.findAllByText('Apple Inc.');
    vi.mocked(DataService.getStockScreener).mockClear();

    await user.type(screen.getByPlaceholderText('Search symbol or name...'), 'AAPL');

    await waitFor(() => {
      expect(vi.mocked(DataService.getStockScreener).mock.calls.at(-1)?.[0]).toMatchObject({
        q: 'AAPL'
      });
    }, { timeout: 2000 });
  });

  it('fetches the next page when the user requests more rows', async () => {
    const user = userEvent.setup();

    renderWithProviders(<StockExplorerPage />);

    await screen.findAllByText('Apple Inc.');
    await user.click(screen.getByRole('button', { name: 'Load More' }));

    await waitFor(() => {
      expect(vi.mocked(DataService.getStockScreener).mock.calls.at(-1)?.[0]).toMatchObject({
        offset: 2
      });
    });
    expect(await screen.findByText('NVIDIA Corp.')).toBeInTheDocument();
  });

  it('opens the stock detail route from the table', async () => {
    const user = userEvent.setup();

    renderWithProviders(<StockExplorerPage />);

    await screen.findAllByText('Apple Inc.');
    await user.click(screen.getByRole('button', { name: 'Open AAPL' }));

    expect(navigateMock).toHaveBeenCalledWith('/stock-detail/AAPL');
  });
});
