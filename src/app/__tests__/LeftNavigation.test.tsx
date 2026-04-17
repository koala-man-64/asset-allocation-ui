import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeftNavigation } from '../components/layout/LeftNavigation';
import { useUIStore, UI_STORAGE_KEY } from '@/stores/useUIStore';
import { createDefaultNavOrderBySection } from '@/app/navigationModel';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false
    }
  }
});

vi.mock('lucide-react', () => ({
  Activity: () => <div data-testid="icon-activity" />,
  Database: () => <div data-testid="icon-database" />,
  Layers3: () => <div data-testid="icon-layers-3" />,
  Target: () => <div data-testid="icon-target" />,
  Folder: () => <div data-testid="icon-folder" />,
  Globe: () => <div data-testid="icon-globe" />,
  Orbit: () => <div data-testid="icon-orbit" />,
  Bug: () => <div data-testid="icon-bug" />,
  Filter: () => <div data-testid="icon-filter" />,
  SlidersHorizontal: () => <div data-testid="icon-sliders" />,
  ScanSearch: () => <div data-testid="icon-scan" />,
  BarChart3: () => <div data-testid="icon-bar-chart" />,
  ChevronLeft: () => <span>icon-left</span>,
  ChevronRight: () => <span>icon-right</span>,
  Pin: () => <div data-testid="icon-pin" />,
  PinOff: () => <div data-testid="icon-pinoff" />,
  GripVertical: () => <div data-testid="icon-grip" />
}));

function renderNavigation() {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LeftNavigation />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function resetNavigationState() {
  act(() => {
    useUIStore.setState({
      pinnedNavPaths: [],
      navOrderBySection: createDefaultNavOrderBySection()
    });
  });
}

function getNavLinkLabels(): string[] {
  return screen
    .getAllByRole('link')
    .map((link) => link.textContent?.trim() ?? '')
    .filter(Boolean);
}

describe('LeftNavigation', () => {
  beforeEach(() => {
    queryClient.clear();
    document.cookie = 'ag_pinned_tabs=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    window.localStorage.clear();
    resetNavigationState();
    window.localStorage.removeItem(UI_STORAGE_KEY);
  });

  it('renders the default navigation order', () => {
    const { container } = renderNavigation();

    expect(container.firstChild).toHaveClass('w-[280px]');
    expect(getNavLinkLabels()).toEqual([
      'Stock Explorer',
      'Live Stock View',
      'Data Explorer',
      'Data Quality',
      'Data Profiling',
      'Regime Monitor',
      'System Status',
      'Debug Symbols',
      'Symbol Purge',
      'Runtime Config',
      'Strategy Exploration',
      'Run Configurations',
      'Universe Configurations',
      'Ranking Configurations',
      'Postgres Explorer'
    ]);
    expect(screen.getByText('UPTIME CLOCK')).toBeDefined();
  });

  it('renders from customized store-backed order', () => {
    act(() => {
      useUIStore.setState({
        pinnedNavPaths: ['/strategies', '/system-status'],
        navOrderBySection: {
          'market-intelligence': ['/stock-detail', '/stock-explorer'],
          'live-operations': [
            '/postgres-explorer',
            '/data-explorer',
            '/data-quality',
            '/data-profiling',
            '/regimes',
            '/system-status',
            '/debug-symbols',
            '/symbol-purge',
            '/runtime-config',
            '/strategy-exploration',
            '/strategies',
            '/universes',
            '/rankings'
          ]
        }
      });
    });

    renderNavigation();

    expect(screen.getByText('PINNED')).toBeDefined();
    expect(getNavLinkLabels()).toEqual([
      'Run Configurations',
      'System Status',
      'Live Stock View',
      'Stock Explorer',
      'Postgres Explorer',
      'Data Explorer',
      'Data Quality',
      'Data Profiling',
      'Regime Monitor',
      'Debug Symbols',
      'Symbol Purge',
      'Runtime Config',
      'Strategy Exploration',
      'Universe Configurations',
      'Ranking Configurations'
    ]);
  });

  it('moves run configurations to the pinned section without duplication', async () => {
    renderNavigation();

    fireEvent.click(screen.getByLabelText('Pin Run Configurations to top'));

    await waitFor(() => {
      expect(screen.getByText('PINNED')).toBeDefined();
      expect(screen.getAllByText('Run Configurations').length).toBe(1);
    });

    expect(useUIStore.getState().pinnedNavPaths).toEqual(['/strategies']);
    expect(getNavLinkLabels().slice(0, 3)).toEqual([
      'Run Configurations',
      'Stock Explorer',
      'Live Stock View'
    ]);
  });

  it('migrates legacy pinned tabs from the cookie when no nav customization is persisted', async () => {
    window.localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        state: {
          isDarkMode: false,
          benchmark: 'SPY',
          costModel: 'Passive bps',
          dateRange: { start: '2020-01-01', end: '2025-01-01' }
        },
        version: 0
      })
    );
    document.cookie = 'ag_pinned_tabs=["/rankings","/strategies"]; path=/';

    renderNavigation();

    await waitFor(() => {
      expect(useUIStore.getState().pinnedNavPaths).toEqual(['/rankings', '/strategies']);
    });

    expect(getNavLinkLabels().slice(0, 4)).toEqual([
      'Ranking Configurations',
      'Run Configurations',
      'Stock Explorer',
      'Live Stock View'
    ]);
    expect(screen.getAllByText('Run Configurations').length).toBe(1);
  });
});
