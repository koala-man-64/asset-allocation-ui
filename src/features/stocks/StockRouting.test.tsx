import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StockDetailPage } from './StockDetailPage';
import { StockExplorerPage } from './StockExplorerPage';
import { buildStockDetailPath, STOCK_DETAIL_ROUTE } from './stockRoutes';

const getStockScreener = vi.hoisted(() => vi.fn());
const getMarketData = vi.hoisted(() => vi.fn());
const getFinanceData = vi.hoisted(() => vi.fn());

vi.mock('@/services/DataService', () => ({
  DataService: {
    getStockScreener,
    getMarketData,
    getFinanceData
  }
}));

vi.mock('@/app/components/CandlestickChart', () => ({
  CandlestickChart: () => <div data-testid="mock-candlestick-chart" />
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

  return <div data-testid="location-probe">{`${location.pathname}${location.search}${location.hash}`}</div>;
}

function renderStockExplorer(initialPath = '/stock-explorer') {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/stock-explorer"
            element={
              <>
                <StockExplorerPage />
                <LocationProbe />
              </>
            }
          />
          <Route path={STOCK_DETAIL_ROUTE} element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderStockDetail(initialPath = buildStockDetailPath()) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path={STOCK_DETAIL_ROUTE}
          element={
            <>
              <StockDetailPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('stock routing', () => {
  beforeEach(() => {
    getStockScreener.mockReset();
    getStockScreener.mockResolvedValue({
      asOf: '2026-04-18',
      total: 1,
      limit: 250,
      offset: 0,
      rows: [
        {
          symbol: 'SPY',
          name: 'SPDR S&P 500 ETF',
          sector: 'ETF',
          industry: 'Exchange Traded Fund',
          close: 500.12,
          return1d: 0.01,
          return5d: 0.02,
          vol20d: 0.15,
          drawdown1y: -0.05,
          atr14d: 3.5,
          volume: 1_250_000,
          compressionScore: 0.2,
          hasSilver: true,
          hasGold: true
        }
      ]
    });

    getMarketData.mockReset();
    getMarketData.mockResolvedValue([
      {
        date: '2026-04-18',
        open: 500,
        high: 501,
        low: 499,
        close: 500.5,
        volume: 1_000_000
      }
    ]);

    getFinanceData.mockReset();
    getFinanceData.mockResolvedValue([]);
  });

  it('navigates from the stock explorer to the canonical stock detail route', async () => {
    renderStockExplorer();

    fireEvent.click(await screen.findByRole('button', { name: 'SPY' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent(buildStockDetailPath('SPY'));
    });
  });

  it('keeps stock detail searches on the canonical stock detail route', async () => {
    renderStockDetail();

    fireEvent.change(screen.getByPlaceholderText('ENTER SYMBOL (e.g. SPY)'), {
      target: { value: 'msft' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'LOAD' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        buildStockDetailPath('MSFT')
      );
    });
  });
});
