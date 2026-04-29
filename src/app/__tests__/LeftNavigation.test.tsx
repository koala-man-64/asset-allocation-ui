import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { findNavItem, NAV_SECTIONS, createDefaultNavOrderBySection } from '@/app/navigationModel';
import { LeftNavigation } from '../components/layout/LeftNavigation';
import { SidebarProvider, SidebarTrigger } from '../components/ui/sidebar';
import { useUIStore, UI_STORAGE_KEY } from '@/stores/useUIStore';

vi.mock('lucide-react', () => ({
  Activity: () => <div data-testid="icon-activity" />,
  BadgeDollarSign: () => <div data-testid="icon-badge-dollar-sign" />,
  Briefcase: () => <div data-testid="icon-briefcase" />,
  Cookie: () => <div data-testid="icon-cookie" />,
  Database: () => <div data-testid="icon-database" />,
  Layers3: () => <div data-testid="icon-layers-3" />,
  Landmark: () => <div data-testid="icon-landmark" />,
  LogIn: () => <div data-testid="icon-login" />,
  Target: () => <div data-testid="icon-target" />,
  Folder: () => <div data-testid="icon-folder" />,
  Globe: () => <div data-testid="icon-globe" />,
  History: () => <div data-testid="icon-history" />,
  Orbit: () => <div data-testid="icon-orbit" />,
  Bug: () => <div data-testid="icon-bug" />,
  Filter: () => <div data-testid="icon-filter" />,
  Sparkles: () => <div data-testid="icon-sparkles" />,
  SlidersHorizontal: () => <div data-testid="icon-sliders" />,
  ScanSearch: () => <div data-testid="icon-scan" />,
  BarChart3: () => <div data-testid="icon-bar-chart" />,
  PanelLeftIcon: () => <span>icon-panel-left</span>,
  XIcon: () => <span>icon-x</span>,
  ChevronDown: () => <span>icon-down</span>,
  ChevronLeft: () => <span>icon-left</span>,
  ChevronRight: () => <span>icon-right</span>,
  ChevronUp: () => <span>icon-up</span>,
  Pin: () => <div data-testid="icon-pin" />,
  PinOff: () => <div data-testid="icon-pinoff" />,
  GripVertical: () => <div data-testid="icon-grip" />
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

  return (
    <div data-testid="location-probe">{`${location.pathname}${location.search}${location.hash}`}</div>
  );
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width
  });
  window.dispatchEvent(new Event('resize'));
}

function navSnapshot(paths: string[]) {
  return paths.map((path) => ({
    name: findNavItem(path)?.label ?? path,
    path
  }));
}

function getRenderedLinks() {
  return screen.getAllByRole('link').map((link) => ({
    name: link.getAttribute('aria-label') ?? link.textContent?.trim() ?? '',
    path: new URL((link as HTMLAnchorElement).href).pathname
  }));
}

function renderNavigation(initialEntries: string[] = ['/system-status']) {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider defaultOpen>
        <MemoryRouter initialEntries={initialEntries}>
          <SidebarTrigger aria-label="Open navigation" />
          <LeftNavigation />
          <LocationProbe />
        </MemoryRouter>
      </SidebarProvider>
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

describe('LeftNavigation', () => {
  beforeEach(() => {
    setViewportWidth(1280);
    document.cookie = 'ag_pinned_tabs=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    window.localStorage.clear();
    window.localStorage.removeItem(UI_STORAGE_KEY);
    resetNavigationState();
  });

  it('renders the default navigation model with hrefs and active state', () => {
    renderNavigation();

    expect(getRenderedLinks()).toEqual(
      navSnapshot(NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.path)))
    );
    expect(screen.getByRole('link', { name: 'System Status' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toBeInTheDocument();
    expect(screen.getByText('UPTIME CLOCK')).toBeInTheDocument();
    expect(screen.getByText('DATA ACCESS')).toBeInTheDocument();
    expect(screen.getByText('MONITORING')).toBeInTheDocument();
    expect(screen.getByText('DATA HYGIENE')).toBeInTheDocument();
    expect(screen.getByText('STRATEGY SETUP')).toBeInTheDocument();
    expect(screen.getByText('PORTFOLIO & TRADING')).toBeInTheDocument();
    expect(screen.getByText('OPS TOOLS')).toBeInTheDocument();
  });

  it('navigates through the shell when a nav link is clicked', async () => {
    renderNavigation();

    fireEvent.click(screen.getByRole('link', { name: 'Data Explorer' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/data-explorer');
    });
  });

  it('renders a customized store-backed order with pinned items first', () => {
    act(() => {
      useUIStore.setState({
        pinnedNavPaths: ['/strategies', '/system-status'],
        navOrderBySection: {
          'market-intelligence': ['/stock-detail', '/stock-explorer'],
          access: ['/login'],
          'live-operations': [
            '/postgres-explorer',
            '/data-explorer',
            '/data-quality',
            '/data-profiling',
            '/regimes',
            '/system-status',
            '/intraday-monitor',
            '/debug-symbols',
            '/symbol-purge',
            '/symbol-enrichment',
            '/runtime-config',
            '/strategies',
            '/backtests',
            '/accounts',
            '/portfolios',
            '/trade-desk',
            '/trade-monitor'
          ]
        }
      });
    });

    renderNavigation(['/strategies']);

    expect(screen.getByText('PINNED')).toBeInTheDocument();
    expect(getRenderedLinks()).toEqual(
      navSnapshot([
        '/strategies',
        '/system-status',
        '/stock-detail',
        '/stock-explorer',
        '/postgres-explorer',
        '/data-explorer',
        '/data-quality',
        '/data-profiling',
        '/regimes',
        '/intraday-monitor',
        '/debug-symbols',
        '/symbol-purge',
        '/symbol-enrichment',
        '/runtime-config',
        '/backtests',
        '/accounts',
        '/portfolios',
        '/trade-desk',
        '/trade-monitor',
        '/login'
      ])
    );
    expect(screen.queryByRole('link', { name: 'Strategy Exploration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Universe Configurations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ranking Configurations' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Strategies' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('moves strategies to the pinned section without duplication', async () => {
    renderNavigation();

    fireEvent.click(screen.getByRole('button', { name: 'Pin Strategies to top' }));

    await waitFor(() => {
      expect(screen.getByText('PINNED')).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: 'Strategies' })).toHaveLength(1);
    });

    expect(useUIStore.getState().pinnedNavPaths).toEqual(['/strategies']);
    expect(getRenderedLinks().slice(0, 3)).toEqual(
      navSnapshot(['/strategies', '/stock-explorer', '/stock-detail'])
    );
  });

  it('supports visible non-drag reorder buttons on desktop navigation', async () => {
    renderNavigation();

    const liveOperationsBefore = useUIStore.getState().navOrderBySection['live-operations'];
    const qualityIndex = liveOperationsBefore.indexOf('/data-quality');
    const previousPath = liveOperationsBefore[qualityIndex - 1];

    expect(qualityIndex).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Move Data Quality up' }));

    await waitFor(() => {
      const liveOperationsAfter = useUIStore.getState().navOrderBySection['live-operations'];
      expect(liveOperationsAfter.indexOf('/data-quality')).toBe(qualityIndex - 1);
      expect(liveOperationsAfter.indexOf(previousPath)).toBe(qualityIndex);
    });
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

    renderNavigation(['/rankings']);

    await waitFor(() => {
      expect(useUIStore.getState().pinnedNavPaths).toEqual(['/strategies']);
    });

    expect(getRenderedLinks().slice(0, 4)).toEqual(
      navSnapshot(['/strategies', '/stock-explorer', '/stock-detail', '/data-explorer'])
    );
    expect(screen.getAllByRole('link', { name: 'Strategies' })).toHaveLength(1);
  });

  it('opens the navigation as a sheet on narrow viewports', async () => {
    setViewportWidth(640);

    renderNavigation();

    expect(screen.queryByRole('link', { name: 'Stock Explorer' })).not.toBeInTheDocument();
    expect(screen.queryByText('UPTIME CLOCK')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Stock Explorer' })).toHaveAttribute(
        'aria-label',
        'Stock Explorer'
      );
    });
    expect(screen.getByText('UPTIME CLOCK')).toBeInTheDocument();
  });
});
