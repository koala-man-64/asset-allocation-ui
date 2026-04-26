import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StockDetailPage } from '@/features/stocks/StockDetailPage';
import { DataService } from '@/services/DataService';

vi.mock('@/app/components/CandlestickChart', () => ({
  CandlestickChart: () => <div data-testid="candlestick-chart">chart</div>
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    getMarketData: vi.fn(),
    getFinanceData: vi.fn()
  }
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0
      }
    }
  });
}

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location-probe">{location.pathname}</div>;
}

function renderStockDetail(initialEntry = '/stock-detail/AAPL') {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/stock-detail/:ticker?"
            element={
              <>
                <StockDetailPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('StockDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(DataService.getMarketData).mockResolvedValue([
      {
        date: '2026-04-17',
        open: 178,
        high: 181,
        low: 177,
        close: 180,
        volume: 1200000
      },
      {
        date: '2026-04-18',
        open: 180,
        high: 183,
        low: 179,
        close: 182,
        volume: 1300000
      }
    ]);
    vi.mocked(DataService.getFinanceData).mockResolvedValue([
      {
        date: '2026-04-18',
        symbol: 'AAPL',
        sub_domain: 'summary',
        marketCap: 3000000000000
      }
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads market and finance data from the URL ticker', async () => {
    renderStockDetail('/stock-detail/AAPL');

    expect(await screen.findByRole('heading', { name: /AAPL Detail/i })).toBeInTheDocument();
    expect(await screen.findByTestId('candlestick-chart')).toBeInTheDocument();
    expect(DataService.getMarketData).toHaveBeenCalledWith('AAPL', 'silver');
    expect(DataService.getFinanceData).toHaveBeenCalledWith('AAPL', 'summary', 'silver');
  });

  it('navigates through the search form', async () => {
    const user = userEvent.setup();

    renderStockDetail('/stock-detail');

    const searchInput = screen.getByRole('textbox');
    await user.type(searchInput, 'MSFT');
    await user.click(screen.getByRole('button', { name: 'LOAD' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/stock-detail/MSFT');
    });
    await waitFor(() => {
      expect(DataService.getMarketData).toHaveBeenCalledWith('MSFT', 'silver');
    });
  });

  it('keeps the quote view available when finance data fails', async () => {
    vi.mocked(DataService.getFinanceData).mockRejectedValueOnce(new Error('Finance unavailable'));

    renderStockDetail('/stock-detail/AAPL');

    expect(await screen.findByRole('heading', { name: /AAPL Detail/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quote Detail' })).toBeInTheDocument();
    expect(screen.getByText('NO FUNDAMENTAL DATA AVAILABLE')).toBeInTheDocument();
  });

  it('shows the empty state when no symbol is selected', async () => {
    renderStockDetail('/stock-detail');

    expect(screen.getByText('Enter a symbol to view live market data')).toBeInTheDocument();
  });

  it('shows an error state when both data sources fail', async () => {
    vi.mocked(DataService.getMarketData).mockRejectedValueOnce(new Error('Market unavailable'));
    vi.mocked(DataService.getFinanceData).mockRejectedValueOnce(new Error('Finance unavailable'));

    renderStockDetail('/stock-detail/BAD');

    expect(await screen.findByText('Could not retrieve data for this symbol.')).toBeInTheDocument();
  });
});
