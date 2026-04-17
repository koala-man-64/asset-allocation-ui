import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyConfigPage } from '@/app/components/pages/StrategyConfigPage';
import { backtestApi } from '@/services/backtestApi';
import { rankingApi } from '@/services/rankingApi';
import { strategyApi } from '@/services/strategyApi';
import { universeApi } from '@/services/universeApi';
import { renderWithProviders } from '@/test/utils';
import { toast } from 'sonner';

vi.mock('@/services/strategyApi', () => ({
  strategyApi: {
    listStrategies: vi.fn(),
    saveStrategy: vi.fn(),
    getStrategy: vi.fn(),
    getStrategyDetail: vi.fn(),
    deleteStrategy: vi.fn(),
    getUniverseCatalog: vi.fn(),
    previewUniverse: vi.fn()
  }
}));

vi.mock('@/services/backtestApi', () => ({
  backtestApi: {
    listRuns: vi.fn(),
    submitRun: vi.fn()
  }
}));

vi.mock('@/services/rankingApi', () => ({
  rankingApi: {
    listRankingSchemas: vi.fn()
  }
}));

vi.mock('@/services/universeApi', () => ({
  universeApi: {
    listUniverseConfigs: vi.fn()
  }
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function buildStrategyDetail(name: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name,
    type: 'configured',
    description: `${name} desk note`,
    updated_at: '2026-04-15T12:00:00Z',
    output_table_name: `${name.replace(/[^a-z0-9]+/gi, '_')}_daily`,
    config: {
      universeConfigName: 'large-cap-quality',
      rebalance: 'weekly',
      longOnly: true,
      topN: 25,
      lookbackWindow: 90,
      holdingPeriod: 30,
      costModel: 'default',
      rankingSchemaName: 'quality-momentum',
      intrabarConflictPolicy: 'stop_first',
      regimePolicy: {
        modelName: 'default-regime',
        blockOnTransition: true,
        blockOnUnclassified: true,
        honorHaltFlag: true,
        onBlocked: 'skip_entries',
        targetGrossExposureByRegime: {
          trending_bull: 1,
          trending_bear: 0.5,
          choppy_mean_reversion: 0.75,
          high_vol: 0,
          unclassified: 0
        }
      },
      exits: [
        {
          id: 'stop-8',
          type: 'stop_loss_fixed',
          scope: 'position',
          action: 'exit_full',
          minHoldBars: 0,
          priceField: 'low',
          reference: 'entry_price',
          value: 0.08,
          priority: 0
        }
      ]
    },
    ...overrides
  };
}

describe('StrategyConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (rankingApi.listRankingSchemas as Mock).mockResolvedValue([
      {
        name: 'quality-momentum',
        description: 'desc',
        version: 1,
        updated_at: '2026-03-08T00:00:00Z'
      }
    ]);
    (universeApi.listUniverseConfigs as Mock).mockResolvedValue([
      {
        name: 'large-cap-quality',
        description: 'desc',
        version: 1,
        updated_at: '2026-03-08T00:00:00Z'
      }
    ]);
    (backtestApi.listRuns as Mock).mockResolvedValue({ runs: [], limit: 6, offset: 0 });
    (backtestApi.submitRun as Mock).mockResolvedValue({
      run_id: 'run-1',
      status: 'queued',
      submitted_at: '2026-03-08T00:00:00Z'
    });
  });

  it('renders the empty workspace and opens a new strategy draft with keyboard input', async () => {
    (strategyApi.listStrategies as Mock).mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(<StrategyConfigPage />);

    expect(await screen.findByText(/no strategies found/i)).toBeInTheDocument();

    const createButtons = screen.getAllByRole('button', { name: /create strategy/i });
    createButtons[0]?.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('heading', { name: /new strategy/i })).toBeInTheDocument();
  });

  it('renders the selected strategy dossier and opens duplicate and backtest flows', async () => {
    (strategyApi.listStrategies as Mock).mockResolvedValue([
      {
        name: 'quality-trend',
        type: 'configured',
        description: 'Quality trend desk note',
        updated_at: '2026-04-15T12:00:00Z'
      }
    ]);
    (strategyApi.getStrategyDetail as Mock).mockImplementation((name: string) =>
      Promise.resolve(buildStrategyDetail(name))
    );

    renderWithProviders(<StrategyConfigPage />);

    expect(await screen.findByRole('heading', { name: 'quality-trend' })).toBeInTheDocument();
    expect(screen.getAllByText(/top 25 with 90-bar lookback/i)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /duplicate as new/i }));
    expect(await screen.findByRole('heading', { name: /duplicate strategy/i })).toBeInTheDocument();
    expect(screen.getAllByText(/from quality-trend/i)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    fireEvent.click(await screen.findByRole('button', { name: /discard draft/i }));

    fireEvent.click(screen.getByRole('button', { name: /launch backtest/i }));
    expect(await screen.findByRole('heading', { name: /launch backtest/i })).toBeInTheDocument();
  });

  it('falls back to the remaining strategy after deleting the selected one', async () => {
    (strategyApi.listStrategies as Mock)
      .mockResolvedValueOnce([
        {
          name: 'quality-trend',
          type: 'configured',
          description: 'quality',
          updated_at: '2026-04-15T12:00:00Z'
        },
        {
          name: 'mean-revert',
          type: 'configured',
          description: 'mean',
          updated_at: '2026-04-14T12:00:00Z'
        }
      ])
      .mockResolvedValueOnce([
        {
          name: 'mean-revert',
          type: 'configured',
          description: 'mean',
          updated_at: '2026-04-14T12:00:00Z'
        }
      ]);
    (strategyApi.getStrategyDetail as Mock).mockImplementation((name: string) =>
      Promise.resolve(buildStrategyDetail(name))
    );
    (strategyApi.deleteStrategy as Mock).mockResolvedValue({
      status: 'success',
      message: 'deleted'
    });

    renderWithProviders(<StrategyConfigPage />);

    expect(await screen.findByRole('heading', { name: 'quality-trend' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete strategy/i }));
    expect(await screen.findByRole('heading', { name: /delete strategy/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete from postgres/i }));

    await waitFor(() => {
      expect(strategyApi.deleteStrategy).toHaveBeenCalledWith('quality-trend');
    });

    expect(await screen.findByRole('heading', { name: 'mean-revert' })).toBeInTheDocument();
  });

  it('shows detail errors while keeping the strategy library visible', async () => {
    (strategyApi.listStrategies as Mock).mockResolvedValue([
      {
        name: 'quality-trend',
        type: 'configured',
        description: 'quality',
        updated_at: '2026-04-15T12:00:00Z'
      }
    ]);
    (strategyApi.getStrategyDetail as Mock).mockRejectedValue(new Error('detail failed'));

    renderWithProviders(<StrategyConfigPage />);

    expect(await screen.findByText(/detail failed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open strategy quality-trend/i })).toBeInTheDocument();
  });

  it('keeps the editor open and raises a toast when save fails', async () => {
    (strategyApi.listStrategies as Mock).mockResolvedValue([
      {
        name: 'quality-trend',
        type: 'configured',
        description: 'quality',
        updated_at: '2026-04-15T12:00:00Z'
      }
    ]);
    (strategyApi.getStrategyDetail as Mock).mockResolvedValue(buildStrategyDetail('quality-trend'));
    (strategyApi.saveStrategy as Mock).mockRejectedValue(new Error('save failed'));

    renderWithProviders(<StrategyConfigPage />);

    expect(await screen.findByRole('heading', { name: 'quality-trend' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit strategy/i }));
    expect(await screen.findByRole('heading', { name: /edit strategy/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/desk note/i), {
      target: { value: 'Updated note' }
    });
    fireEvent.click(screen.getByRole('button', { name: /save strategy/i }));

    await waitFor(() => {
      expect(strategyApi.saveStrategy).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/failed to save strategy/i));
    });

    expect(screen.getByRole('heading', { name: /edit strategy/i })).toBeInTheDocument();
  });

  it('refreshes the dossier after saving edits to the selected strategy', async () => {
    const initialDetail = buildStrategyDetail('quality-trend', {
      description: 'Initial desk note'
    });
    const savedDetail = buildStrategyDetail('quality-trend', {
      description: 'Updated desk note'
    });

    (strategyApi.listStrategies as Mock).mockResolvedValue([
      {
        name: 'quality-trend',
        type: 'configured',
        description: 'Initial desk note',
        updated_at: '2026-04-15T12:00:00Z'
      }
    ]);
    (strategyApi.getStrategyDetail as Mock)
      .mockResolvedValueOnce(initialDetail)
      .mockResolvedValue(savedDetail);
    (strategyApi.saveStrategy as Mock).mockImplementation((payload: typeof savedDetail) =>
      Promise.resolve({
        ...savedDetail,
        ...payload
      })
    );

    renderWithProviders(<StrategyConfigPage />);

    expect(await screen.findAllByText(/top 25 with 90-bar lookback/i)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /edit strategy/i }));
    expect(await screen.findByRole('heading', { name: /edit strategy/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/desk note/i), {
      target: { value: 'Updated desk note' }
    });
    fireEvent.click(screen.getByRole('button', { name: /save strategy/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/updated desk note/i).length).toBeGreaterThan(0);
    });
  });

  it('keeps the delete dialog open and raises a toast when delete fails', async () => {
    (strategyApi.listStrategies as Mock).mockResolvedValue([
      {
        name: 'quality-trend',
        type: 'configured',
        description: 'quality',
        updated_at: '2026-04-15T12:00:00Z'
      }
    ]);
    (strategyApi.getStrategyDetail as Mock).mockResolvedValue(buildStrategyDetail('quality-trend'));
    (strategyApi.deleteStrategy as Mock).mockRejectedValue(new Error('delete failed'));

    renderWithProviders(<StrategyConfigPage />);

    expect(await screen.findByRole('heading', { name: 'quality-trend' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete strategy/i }));
    const deleteHeading = await screen.findByRole('heading', { name: /delete strategy/i });
    expect(deleteHeading).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /delete from postgres/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/failed to delete strategy/i));
    });

    expect(screen.getByRole('heading', { name: /delete strategy/i })).toBeInTheDocument();
  });

  it('shows catalog failures without allowing attachment edits to degrade silently', async () => {
    (strategyApi.listStrategies as Mock).mockResolvedValue([
      {
        name: 'quality-trend',
        type: 'configured',
        description: 'quality',
        updated_at: '2026-04-15T12:00:00Z'
      }
    ]);
    (strategyApi.getStrategyDetail as Mock).mockResolvedValue(buildStrategyDetail('quality-trend'));
    (rankingApi.listRankingSchemas as Mock).mockRejectedValue(new Error('ranking offline'));
    (universeApi.listUniverseConfigs as Mock).mockRejectedValue(new Error('universe offline'));

    renderWithProviders(<StrategyConfigPage />);

    expect(await screen.findAllByText(/top 25 with 90-bar lookback/i)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /edit strategy/i }));
    expect(await screen.findByRole('heading', { name: /edit strategy/i })).toBeInTheDocument();

    expect(await screen.findByText(/attachment catalogs unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/universe lookup failed: universe offline/i)).toBeInTheDocument();
    expect(screen.getByText(/ranking lookup failed: ranking offline/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/universe config/i)).toHaveValue('large-cap-quality');
      expect(screen.getByLabelText(/ranking schema/i)).toHaveValue('quality-momentum');
    });
  });

  it('prompts before closing a dirty editor and honors a rejected discard', async () => {
    (strategyApi.listStrategies as Mock).mockResolvedValue([]);

    renderWithProviders(<StrategyConfigPage />);

    expect(await screen.findByText(/no strategies found/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /create strategy/i })[0]);

    fireEvent.change(screen.getByLabelText(/strategy name/i), {
      target: { value: 'new-draft' }
    });

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(await screen.findByRole('heading', { name: /discard draft changes/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(screen.getByRole('heading', { name: /new strategy/i })).toBeInTheDocument();
  });
});
