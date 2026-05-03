import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegimeModelConfig } from '@asset-allocation/contracts';

import { RegimeMonitorPage } from '@/features/regimes/RegimeMonitorPage';
import { regimeApi } from '@/services/regimeApi';
import { renderWithProviders } from '@/test/utils';

vi.mock('@/services/regimeApi', () => ({
  regimeApi: {
    listModels: vi.fn(),
    getModel: vi.fn(),
    getCurrent: vi.fn(),
    getHistory: vi.fn(),
    createModel: vi.fn(),
    activateModel: vi.fn()
  }
}));

const defaultRegimeConfig: RegimeModelConfig = {
  activationThreshold: 0.6,
  haltVixThreshold: 40,
  haltVixStreakDays: 3,
  signalConfigs: {
    trending_up: {
      displayName: 'Trending Up',
      requiredMetrics: ['return_20d'],
      rules: [
        {
          metric: 'return_20d',
          comparison: 'gte',
          lower: 0.02,
          description: '20-day return confirms a positive trend.'
        }
      ]
    }
  }
};

describe('RegimeMonitorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(regimeApi.listModels).mockResolvedValue({
      models: [
        {
          name: 'default-regime',
          description: 'Default',
          version: 1,
          active_version: 1,
          updated_at: '2026-03-08T00:00:00Z'
        }
      ]
    });
    vi.mocked(regimeApi.getModel).mockResolvedValue({
      model: {
        name: 'default-regime',
        description: 'Default',
        version: 1,
        active_version: 1,
        updated_at: '2026-03-08T00:00:00Z'
      },
      activeRevision: {
        name: 'default-regime',
        version: 1,
        description: 'Default',
        config: defaultRegimeConfig
      },
      revisions: [
        {
          name: 'default-regime',
          version: 1,
          description: 'Default',
          config: defaultRegimeConfig,
          published_at: '2026-03-08T00:00:00Z',
          activated_at: '2026-03-08T00:00:00Z'
        }
      ],
      latest: null
    });
    vi.mocked(regimeApi.getCurrent).mockResolvedValue({
      as_of_date: '2026-03-07',
      effective_from_date: '2026-03-10',
      model_name: 'default-regime',
      model_version: 1,
      active_regimes: ['trending_up'],
      signals: [
        {
          regime_code: 'trending_up',
          display_name: 'Trending Up',
          signal_state: 'active',
          score: 0.91,
          activation_threshold: 0.6,
          is_active: true,
          matched_rule_id: 'trend-positive',
          evidence: { return_20d: 0.0421 }
        },
        {
          regime_code: 'high_volatility',
          display_name: 'High Volatility',
          signal_state: 'inactive',
          score: 0.18,
          activation_threshold: 0.6,
          is_active: false,
          matched_rule_id: null,
          evidence: { vix_spot_close: 18.42 }
        }
      ],
      halt_flag: false,
      halt_reason: null,
      computed_at: '2026-03-08T00:00:00Z'
    });
    vi.mocked(regimeApi.getHistory).mockResolvedValue({
      modelName: 'default-regime',
      modelVersion: 1,
      limit: 24,
      rows: [
        {
          as_of_date: '2026-03-07',
          effective_from_date: '2026-03-10',
          model_name: 'default-regime',
          model_version: 1,
          active_regimes: ['trending_up'],
          signals: [
            {
              regime_code: 'trending_up',
              display_name: 'Trending Up',
              signal_state: 'active',
              score: 0.91,
              activation_threshold: 0.6,
              is_active: true,
              matched_rule_id: 'trend-positive',
              evidence: { return_20d: 0.0421 }
            }
          ],
          halt_flag: false,
          halt_reason: null
        },
        {
          as_of_date: '2026-03-06',
          effective_from_date: '2026-03-07',
          model_name: 'default-regime',
          model_version: 1,
          active_regimes: ['high_volatility'],
          signals: [
            {
              regime_code: 'high_volatility',
              display_name: 'High Volatility',
              signal_state: 'active',
              score: 0.78,
              activation_threshold: 0.6,
              is_active: true,
              matched_rule_id: 'vix-halt',
              evidence: { vix_spot_close: 33.21 }
            }
          ],
          halt_flag: true,
          halt_reason: 'VIX threshold breached.'
        }
      ]
    });
    vi.mocked(regimeApi.createModel).mockResolvedValue({
      model: {
        name: 'new-model',
        description: 'Created',
        version: 1
      }
    });
    vi.mocked(regimeApi.activateModel).mockResolvedValue({
      model: 'default-regime',
      activatedRevision: {
        name: 'default-regime',
        version: 1,
        description: 'Default',
        config: defaultRegimeConfig
      }
    });
  });

  it('renders the desk-first verdict, signal evidence, and timeline markers', async () => {
    renderWithProviders(<RegimeMonitorPage />);

    expect(await screen.findByRole('heading', { name: /regime verdict/i })).toBeInTheDocument();
    expect(await screen.findByTestId('regime-verdict')).toHaveTextContent(/Trending Up/i);
    expect(screen.getByText(/No Halt/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Active Signal/i)).toBeInTheDocument();
    expect(screen.getByText(/return 20d: 0.0421/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /regime timeline/i })).toBeInTheDocument();
    expect((await screen.findAllByText(/Mar 7, 2026/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Transition$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Halt$/i).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/Config JSON/i)).not.toBeInTheDocument();
  });

  it('refreshes the active regime queries from the command strip', async () => {
    renderWithProviders(<RegimeMonitorPage />);

    const refreshButton = await screen.findByRole('button', { name: /refresh regime view/i });
    await waitFor(() => expect(refreshButton).not.toBeDisabled());

    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(regimeApi.getCurrent).toHaveBeenCalledTimes(2);
    });
  });

  it('saves a new regime model revision', async () => {
    renderWithProviders(<RegimeMonitorPage />);

    fireEvent.click(await screen.findByRole('button', { name: /show/i }));
    fireEvent.change(await screen.findByLabelText(/^Name$/i), {
      target: { value: 'new-model' }
    });
    fireEvent.click(screen.getByRole('button', { name: /save model revision/i }));

    await waitFor(() => {
      expect(regimeApi.createModel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'new-model' })
      );
    });
  });

  it('blocks model revision save when config JSON is invalid', async () => {
    renderWithProviders(<RegimeMonitorPage />);

    fireEvent.click(await screen.findByRole('button', { name: /show/i }));
    fireEvent.change(await screen.findByLabelText(/^Name$/i), {
      target: { value: 'bad-model' }
    });
    fireEvent.change(screen.getByLabelText(/Config JSON/i), {
      target: { value: '{not-json' }
    });
    fireEvent.click(screen.getByRole('button', { name: /save model revision/i }));

    expect(await screen.findByText(/Invalid Config JSON/i)).toBeInTheDocument();
    expect(regimeApi.createModel).not.toHaveBeenCalled();
  });
});
