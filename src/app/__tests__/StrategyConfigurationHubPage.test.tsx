import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { StrategyConfigurationHubPage } from '@/features/configurations/StrategyConfigurationHubPage';

vi.mock('@/features/universes/UniverseConfigPage', () => ({
  UniverseConfigPage: () => <div data-testid="universe-tab-body">Universe configuration body</div>
}));

vi.mock('@/features/rankings/RankingConfigPage', () => ({
  RankingConfigPage: () => <div data-testid="ranking-tab-body">Ranking configuration body</div>
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderHub(initialEntry = '/strategy-configurations') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          {children}
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return render(<StrategyConfigurationHubPage />, { wrapper: Wrapper });
}

describe('StrategyConfigurationHubPage', () => {
  it('updates the visible configuration panel when the URL-backed tab changes', async () => {
    const user = userEvent.setup();

    renderHub();

    expect(screen.getByTestId('universe-tab-body')).toBeInTheDocument();
    expect(screen.queryByTestId('ranking-tab-body')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Ranking' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/strategy-configurations?tab=ranking'
      );
    });
    expect(screen.getByTestId('ranking-tab-body')).toBeInTheDocument();
    expect(screen.queryByTestId('universe-tab-body')).not.toBeInTheDocument();
  });

  it('renders the tab requested by the initial URL', () => {
    renderHub('/strategy-configurations?tab=ranking');

    expect(screen.getByRole('tab', { name: 'Ranking' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('ranking-tab-body')).toBeInTheDocument();
    expect(screen.queryByTestId('universe-tab-body')).not.toBeInTheDocument();
  });
});
