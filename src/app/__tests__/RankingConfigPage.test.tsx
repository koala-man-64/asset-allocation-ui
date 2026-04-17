import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RankingConfigPage } from '@/app/components/pages/RankingConfigPage';
import { rankingApi } from '@/services/rankingApi';
import { strategyApi } from '@/services/strategyApi';
import { universeApi } from '@/services/universeApi';

vi.mock('@/services/rankingApi', () => ({
  rankingApi: {
    listRankingSchemas: vi.fn(),
    getRankingSchemaDetail: vi.fn(),
    getRankingCatalog: vi.fn(),
    saveRankingSchema: vi.fn(),
    deleteRankingSchema: vi.fn(),
    previewRanking: vi.fn(),
    materializeRankings: vi.fn()
  }
}));

vi.mock('@/services/strategyApi', () => ({
  strategyApi: {
    listStrategies: vi.fn(),
    getStrategyDetail: vi.fn()
  }
}));

vi.mock('@/services/universeApi', () => ({
  universeApi: {
    listUniverseConfigs: vi.fn()
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

function renderPage() {
  const queryClient = createTestQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <RankingConfigPage />
    </QueryClientProvider>
  );
}

describe('RankingConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (rankingApi.listRankingSchemas as Mock).mockResolvedValue([
      {
        name: 'quality-momentum',
        description: 'Composite ranking',
        version: 2,
        updated_at: '2026-03-08T00:00:00Z'
      },
      {
        name: 'value-momentum',
        description: 'Value tilted ranking',
        version: 1,
        updated_at: '2026-03-10T00:00:00Z'
      }
    ]);

    (rankingApi.getRankingSchemaDetail as Mock).mockImplementation(async (name: string) => {
      if (name === 'value-momentum') {
        return {
          name: 'value-momentum',
          description: 'Value tilted ranking',
          version: 1,
          config: {
            universeConfigName: 'large-cap-quality',
            groups: [
              {
                name: 'value',
                weight: 1,
                transforms: [],
                factors: [
                  {
                    name: 'f2',
                    table: 'market_data',
                    column: 'value_score',
                    weight: 1.5,
                    direction: 'desc',
                    missingValuePolicy: 'exclude',
                    transforms: []
                  }
                ]
              }
            ],
            overallTransforms: []
          }
        };
      }

      return {
        name: 'quality-momentum',
        description: 'Composite ranking',
        version: 2,
        config: {
          universeConfigName: 'large-cap-quality',
          groups: [
            {
              name: 'quality',
              weight: 1,
              transforms: [],
              factors: [
                {
                  name: 'f1',
                  table: 'market_data',
                  column: 'return_20d',
                  weight: 1,
                  direction: 'desc',
                  missingValuePolicy: 'exclude',
                  transforms: []
                }
              ]
            }
          ],
          overallTransforms: []
        }
      };
    });

    (rankingApi.getRankingCatalog as Mock).mockResolvedValue({
      source: 'postgres_gold',
      tables: [
        {
          name: 'market_data',
          asOfColumn: 'date',
          columns: [
            { name: 'return_20d', dataType: 'double precision', valueKind: 'number' },
            { name: 'value_score', dataType: 'double precision', valueKind: 'number' }
          ]
        }
      ]
    });

    (rankingApi.previewRanking as Mock).mockResolvedValue({
      strategyName: 'mom-spy-res',
      asOfDate: '2026-03-08',
      rowCount: 2,
      rows: [
        { symbol: 'AAPL', rank: 1, score: 0.9 },
        { symbol: 'MSFT', rank: 2, score: 0.8 }
      ],
      warnings: []
    });

    (rankingApi.saveRankingSchema as Mock).mockResolvedValue({
      status: 'success',
      message: 'saved',
      version: 3
    });

    (strategyApi.listStrategies as Mock).mockResolvedValue([
      { name: 'mom-spy-res', type: 'configured', description: 'desc', updated_at: '2026-03-08' }
    ]);

    (strategyApi.getStrategyDetail as Mock).mockResolvedValue({
      name: 'mom-spy-res',
      type: 'configured',
      description: 'desc',
      updated_at: '2026-03-08',
      config: {
        rankingSchemaName: 'defensive-value'
      }
    });

    (universeApi.listUniverseConfigs as Mock).mockResolvedValue([
      {
        name: 'large-cap-quality',
        description: 'desc',
        version: 1,
        updated_at: '2026-03-08T00:00:00Z'
      }
    ]);
  });

  it('renders the guided workbench layout', async () => {
    renderPage();

    expect(await screen.findByText('Schema foundation')).toBeInTheDocument();
    expect(screen.getByText('Saved ranking schemas')).toBeInTheDocument();
    expect(screen.getByText('Scoring stack')).toBeInTheDocument();
    expect(screen.getByText('Preview + Actions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show JSON Preview/i })).toBeInTheDocument();
  });

  it('previews the current draft schema', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Composite ranking')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Group Weight'), {
      target: { value: '2' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Preview Current Draft/i }));

    await waitFor(() => {
      expect(rankingApi.previewRanking).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyName: 'mom-spy-res',
          schema: expect.objectContaining({
            groups: [expect.objectContaining({ weight: 2 })]
          })
        })
      );
    });

    expect(await screen.findByText('AAPL')).toBeInTheDocument();
  });

  it('confirms before switching away from unsaved changes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPage();

    expect(await screen.findByDisplayValue('Composite ranking')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Changed but not saved' }
    });

    fireEvent.click(screen.getByRole('button', { name: /value-momentum/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Discard the current unsaved ranking changes and switch workspaces?'
    );
    expect(rankingApi.getRankingSchemaDetail).not.toHaveBeenCalledWith('value-momentum');
    expect(screen.getByDisplayValue('Changed but not saved')).toBeInTheDocument();
  });

  it('updates group order and counts when duplicate, move, and remove are used', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Composite ranking')).toBeInTheDocument();

    const groupOverviewCard = screen.getByText('Scoring stack').closest('[data-slot="card"]');
    expect(groupOverviewCard).not.toBeNull();

    fireEvent.click(within(groupOverviewCard as HTMLElement).getByRole('button', { name: /^Duplicate$/i }));

    expect(screen.getByText('2 groups / 2 factors')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Move group quality down/i }));

    await waitFor(() => {
      const copyHeading = within(groupOverviewCard as HTMLElement).getByText('quality-copy');
      const originalHeading = within(groupOverviewCard as HTMLElement).getByText('quality');
      expect(copyHeading.compareDocumentPosition(originalHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    const duplicateCard = within(groupOverviewCard as HTMLElement)
      .getByText('quality-copy')
      .closest('.rounded-3xl');
    expect(duplicateCard).not.toBeNull();
    fireEvent.click(within(duplicateCard as HTMLElement).getByRole('button', { name: /^Remove$/i }));

    await waitFor(() => {
      expect(screen.getByText('1 groups / 1 factors')).toBeInTheDocument();
    });
  });

  it('blocks materialize when the selected strategy is attached to a different schema', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Composite ranking')).toBeInTheDocument();

    expect(
      await screen.findByText('The selected strategy is attached to defensive-value, not quality-momentum.')
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Materialize Attached Schema/i })).toBeDisabled();
  });
});
