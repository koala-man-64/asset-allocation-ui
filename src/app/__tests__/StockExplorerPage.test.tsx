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
    close: 182.31,
    return1d: 0.011,
    return5d: 0.028,
    vol20d: 0.24,
    drawdown1y: -0.08,
    atr14d: 4.2,
    volume: 1300000,
    compressionScore: 0.22,
    hasSilver: 1,
    hasGold: 1
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    sector: 'Technology',
    industry: 'Software',
    close: 421.03,
    return1d: -0.004,
    return5d: 0.012,
    vol20d: 0.18,
    drawdown1y: -0.05,
    atr14d: 5.3,
    volume: 990000,
    compressionScore: 0.35,
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
    close: 911.12,
    return1d: 0.02,
    return5d: 0.06,
    vol20d: 0.3,
    drawdown1y: -0.12,
    atr14d: 12.1,
    volume: 870000,
    compressionScore: 0.4,
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
        rows
      };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the initial stock snapshot', async () => {
    renderWithProviders(<StockExplorerPage />);

    expect(await screen.findByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Corp.')).toBeInTheDocument();
    expect(vi.mocked(DataService.getStockScreener).mock.calls[0]?.[0]).toMatchObject({
      q: undefined,
      limit: 250,
      offset: 0,
      asOf: undefined,
      sort: 'volume',
      direction: 'desc'
    });
  });

  it('toggles sort direction when a sortable column is selected twice', async () => {
    const user = userEvent.setup();

    renderWithProviders(<StockExplorerPage />);
    await screen.findByText('Apple Inc.');
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

  it('debounces search input before refetching', async () => {
    const user = userEvent.setup();

    renderWithProviders(<StockExplorerPage />);
    await screen.findByText('Apple Inc.');
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

    await screen.findByText('Apple Inc.');
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

    await screen.findByText('Apple Inc.');
    await user.click(screen.getByRole('button', { name: 'Open AAPL' }));

    expect(navigateMock).toHaveBeenCalledWith('/stock-detail/AAPL');
  });
});
