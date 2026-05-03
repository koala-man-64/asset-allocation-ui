import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyConfigPage } from '@/features/strategies/StrategyConfigPage';
import { buildDefaultRiskPolicy } from '@/features/strategies/lib/strategyDraft';
import { backtestApi } from '@/services/backtestApi';
import { exitRuleSetApi } from '@/services/exitRuleSetApi';
import { rankingApi } from '@/services/rankingApi';
import { regimePolicyApi } from '@/services/regimePolicyApi';
import { riskPolicyApi } from '@/services/riskPolicyApi';
import { strategyApi } from '@/services/strategyApi';
import { strategyAnalyticsApi } from '@/services/strategyAnalyticsApi';
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
    submitRun: vi.fn(),
    getTrades: vi.fn(),
    getSummary: vi.fn(),
    getTimeseries: vi.fn(),
    getRolling: vi.fn()
  }
}));

vi.mock('@/services/rankingApi', () => ({
  rankingApi: {
    listRankingSchemas: vi.fn(),
    getRankingSchemaDetail: vi.fn(),
    getRankingCatalog: vi.fn(),
    saveRankingSchema: vi.fn()
  }
}));

vi.mock('@/services/regimePolicyApi', () => ({
  regimePolicyApi: {
    listRegimePolicies: vi.fn()
  }
}));

vi.mock('@/services/riskPolicyApi', () => ({
  riskPolicyApi: {
    listRiskPolicies: vi.fn()
  }
}));

vi.mock('@/services/exitRuleSetApi', () => ({
  exitRuleSetApi: {
    listExitRuleSets: vi.fn()
  }
}));

vi.mock('@/services/strategyAnalyticsApi', () => ({
  strategyAnalyticsApi: {
    compareStrategies: vi.fn(),
    getScenarioForecast: vi.fn(),
    getAllocationExposure: vi.fn(),
    getTradeHistory: vi.fn()
  }
}));

vi.mock('@/services/universeApi', () => ({
  universeApi: {
    listUniverseConfigs: vi.fn(),
    getUniverseConfigDetail: vi.fn(),
    saveUniverseConfig: vi.fn()
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
        mode: 'observe_only'
      },
      riskPolicy: buildDefaultRiskPolicy(),
      strategyRiskPolicy: buildDefaultRiskPolicy(),
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
    (rankingApi.getRankingSchemaDetail as Mock).mockResolvedValue({
      name: 'quality-momentum',
      description: 'Quality and momentum factors',
      version: 1,
      updated_at: '2026-03-08T00:00:00Z',
      config: {
        universeConfigName: 'large-cap-quality',
        groups: [
          {
            name: 'Quality',
            weight: 1,
            transforms: [{ type: 'percentile_rank', params: {} }],
            factors: [
              {
                name: 'roe',
                table: 'market_data',
                column: 'return_20d',
                weight: 1,
                direction: 'desc',
                missingValuePolicy: 'exclude',
                transforms: [{ type: 'zscore', params: {} }]
              }
            ]
          }
        ],
        overallTransforms: []
      }
    });
    (rankingApi.getRankingCatalog as Mock).mockResolvedValue({
      source: 'postgres_gold',
      tables: [
        {
          name: 'market_data',
          asOfColumn: 'date',
          columns: [{ name: 'return_20d', dataType: 'float', valueKind: 'number' }]
        }
      ]
    });
    (rankingApi.saveRankingSchema as Mock).mockResolvedValue({
      status: 'ok',
      message: 'saved',
      version: 2
    });
    (universeApi.listUniverseConfigs as Mock).mockResolvedValue([
      {
        name: 'large-cap-quality',
        description: 'desc',
        version: 1,
        updated_at: '2026-03-08T00:00:00Z'
      }
    ]);
    (universeApi.getUniverseConfigDetail as Mock).mockResolvedValue({
      name: 'large-cap-quality',
      description: 'Large cap quality universe',
      version: 1,
      updated_at: '2026-03-08T00:00:00Z',
      config: {
        source: 'postgres_gold',
        root: {
          kind: 'group',
          operator: 'and',
          clauses: [{ kind: 'condition', field: 'market.close', operator: 'gt', value: 0 }]
        }
      }
    });
    (universeApi.saveUniverseConfig as Mock).mockResolvedValue({
      status: 'ok',
      message: 'saved',
      version: 2
    });
    (backtestApi.listRuns as Mock).mockResolvedValue({ runs: [], limit: 6, offset: 0 });
    (backtestApi.getTrades as Mock).mockResolvedValue({
      trades: [],
      total: 0,
      limit: 20,
      offset: 0
    });
    (backtestApi.getSummary as Mock).mockResolvedValue({
      run_id: 'run-1',
      total_return: 0.12,
      sharpe_ratio: 1.1,
      max_drawdown: -0.05,
      cost_drag_bps: 12,
      trades: 4,
      closed_positions: 2
    });
    (backtestApi.getTimeseries as Mock).mockResolvedValue({
      points: [],
      total_points: 0,
      truncated: false
    });
    (backtestApi.getRolling as Mock).mockResolvedValue({
      points: [],
      total_points: 0,
      truncated: false
    });
    (backtestApi.submitRun as Mock).mockResolvedValue({
      run_id: 'run-1',
      status: 'queued',
      submitted_at: '2026-03-08T00:00:00Z'
    });
    (regimePolicyApi.listRegimePolicies as Mock).mockResolvedValue([]);
    (riskPolicyApi.listRiskPolicies as Mock).mockResolvedValue([]);
    (exitRuleSetApi.listExitRuleSets as Mock).mockResolvedValue([]);
    (strategyApi.getUniverseCatalog as Mock).mockResolvedValue({
      source: 'postgres_gold',
      fields: [
        {
          field: 'market.close',
          dataType: 'float',
          valueKind: 'number',
          operators: ['gt', 'gte', 'lt', 'lte', 'eq']
        }
      ]
    });
    (strategyApi.previewUniverse as Mock).mockResolvedValue({
      source: 'postgres_gold',
      symbolCount: 2,
      sampleSymbols: ['AAPL', 'MSFT'],
      fieldsUsed: ['market.close'],
      warnings: []
    });
    (strategyAnalyticsApi.getAllocationExposure as Mock).mockResolvedValue({
      strategyName: 'quality-trend',
      asOf: '2026-04-29T12:00:00Z',
      totalMarketValue: 100000,
      aggregateTargetWeight: 0.6,
      aggregateActualWeight: 0.58,
      exposures: [],
      positions: [],
      warnings: []
    });
    (strategyAnalyticsApi.getTradeHistory as Mock).mockResolvedValue({
      strategyName: 'quality-trend',
      trades: [],
      total: 0,
      limit: 100,
      offset: 0,
      warnings: []
    });
    (strategyAnalyticsApi.compareStrategies as Mock).mockResolvedValue({
      asOf: '2026-04-29T12:00:00Z',
      benchmarkSymbol: 'SPY',
      costModel: 'default',
      barSize: '1d',
      strategies: [
        { strategyName: 'quality-trend', role: 'baseline' },
        { strategyName: 'mean-revert', role: 'challenger' }
      ],
      metrics: [],
      runEvidence: [],
      warnings: [],
      blockedReasons: []
    });
    (strategyAnalyticsApi.getScenarioForecast as Mock).mockResolvedValue({
      asOf: '2026-04-29T12:00:00Z',
      horizon: '3M',
      regimeAssumption: 'current',
      source: 'control_plane',
      forecasts: [],
      warnings: []
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
    (backtestApi.listRuns as Mock).mockResolvedValue({
      runs: [
        {
          run_id: 'run-1',
          status: 'completed',
          submitted_at: '2026-04-15T12:00:00Z',
          run_name: 'quality-trend-smoke'
        }
      ],
      limit: 6,
      offset: 0
    });
    (strategyAnalyticsApi.getTradeHistory as Mock).mockResolvedValue({
      strategyName: 'quality-trend',
      trades: [
        {
          source: 'backtest',
          timestamp: '2026-04-15T13:00:00Z',
          symbol: 'MSFT',
          side: 'buy',
          quantity: 25,
          price: 410.5,
          notional: 10262.5,
          commission: 2.5,
          slippageCost: 1.0
        }
      ],
      total: 1,
      limit: 100,
      offset: 0
    });

    renderWithProviders(<StrategyConfigPage />);

    expect(await screen.findByRole('heading', { name: 'quality-trend' })).toBeInTheDocument();
    expect(screen.getByText(/top 25 with 90-bar lookback/i)).toBeInTheDocument();
    expect(screen.getByText(/strategy editor panel/i)).toBeInTheDocument();
    expect(screen.getByText(/strategy explorer panel/i)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /trade history/i })).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();

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
    expect(
      screen.getByRole('button', { name: /open strategy quality-trend/i })
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /edit pins/i }));
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

    expect(await screen.findByText(/top 25 with 90-bar lookback/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit pins/i }));
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

    expect(await screen.findByText(/top 25 with 90-bar lookback/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit pins/i }));
    expect(await screen.findByRole('heading', { name: /edit strategy/i })).toBeInTheDocument();

    expect(await screen.findByText(/universe offline/i)).toBeInTheDocument();
    expect(screen.getByText(/ranking offline/i)).toBeInTheDocument();
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

    expect(
      await screen.findByRole('heading', { name: /discard draft changes/i })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(screen.getByRole('heading', { name: /new strategy/i })).toBeInTheDocument();
  });
});
