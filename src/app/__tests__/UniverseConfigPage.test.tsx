import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UniverseConfigPage } from '@/features/universes/UniverseConfigPage';
import { universeApi } from '@/services/universeApi';

vi.mock('@/services/universeApi', () => ({
  universeApi: {
    listUniverseConfigs: vi.fn(),
    getUniverseConfigDetail: vi.fn(),
    saveUniverseConfig: vi.fn(),
    deleteUniverseConfig: vi.fn(),
    getUniverseCatalog: vi.fn(),
    previewUniverse: vi.fn()
  }
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

describe('UniverseConfigPage', () => {
  let queryClient: QueryClient;

  const mockUniverse = {
    source: 'postgres_gold' as const,
    root: {
      kind: 'group' as const,
      operator: 'and' as const,
      clauses: [
        {
          kind: 'condition' as const,
          field: 'market.close' as const,
          operator: 'gt' as const,
          value: 10
        }
      ]
    }
  };

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();

    (universeApi.listUniverseConfigs as Mock).mockResolvedValue([
      {
        name: 'large-cap-quality',
        description: 'Large cap cohort',
        version: 2,
        updated_at: '2026-03-08T00:00:00Z'
      }
    ]);
    (universeApi.getUniverseConfigDetail as Mock).mockResolvedValue({
      name: 'large-cap-quality',
      description: 'Large cap cohort',
      version: 2,
      config: mockUniverse
    });
    (universeApi.saveUniverseConfig as Mock).mockResolvedValue({
      status: 'success',
      message: 'saved',
      version: 3
    });
    (universeApi.deleteUniverseConfig as Mock).mockResolvedValue({
      status: 'success',
      message: 'deleted'
    });
    (universeApi.getUniverseCatalog as Mock).mockResolvedValue({
      source: 'postgres_gold',
      fields: [
        {
          id: 'market.close',
          label: 'Close Price',
          valueKind: 'number',
          operators: ['eq', 'gt']
        },
        {
          id: 'quality.piotroski_f_score',
          label: 'Piotroski F-Score',
          valueKind: 'number',
          operators: ['gte', 'lte']
        }
      ]
    });
    (universeApi.previewUniverse as Mock).mockResolvedValue({
      source: 'postgres_gold',
      symbolCount: 2,
      sampleSymbols: ['AAPL', 'MSFT'],
      fieldsUsed: ['market.close'],
      warnings: []
    });
  });

  function renderPage() {
    render(
      <QueryClientProvider client={queryClient}>
        <UniverseConfigPage />
      </QueryClientProvider>
    );
  }

  it('renders the universe library, detail view, and field metrics from field ids', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Large cap cohort')).toBeInTheDocument();
    expect(screen.getAllByText('large-cap-quality').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 conditions across 1 fields/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/"field": "market.close"/i)).toBeInTheDocument();
  });

  it('saves the current draft using the shared contract payload', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Large cap cohort')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Large cap cohort'), {
      target: { value: 'Updated large cap cohort' }
    });
    fireEvent.change(screen.getByLabelText(/field/i), {
      target: { value: 'quality.piotroski_f_score' }
    });
    fireEvent.change(screen.getByLabelText(/value/i), {
      target: { value: '7' }
    });
    fireEvent.click(screen.getByRole('button', { name: /save universe configuration/i }));

    await waitFor(() => {
      expect(universeApi.saveUniverseConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'large-cap-quality',
          description: 'Updated large cap cohort',
          config: {
            source: 'postgres_gold',
            root: {
              kind: 'group',
              operator: 'and',
              clauses: [
                {
                  kind: 'condition',
                  field: 'quality.piotroski_f_score',
                  operator: 'gte',
                  value: 7
                }
              ]
            }
          }
        })
      );
    });
  });

  it('starts a new draft with a blank name and empty contract-backed rule tree', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('large-cap-quality')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /new universe configuration/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/universe name/i)).toHaveValue('');
    });
    expect(screen.getByText(/draft version for a new universe/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/"field": "market.close"/i)).toBeInTheDocument();
  });

  it('deletes the selected universe configuration and resets to an empty draft', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Large cap cohort')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete universe configuration/i }));

    await waitFor(() => {
      expect(universeApi.deleteUniverseConfig).toHaveBeenCalledWith('large-cap-quality');
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/universe name/i)).toHaveValue('');
    });
    expect(screen.getByDisplayValue(/"field": "market.close"/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete universe configuration/i })).not.toBeInTheDocument();
  });
});
