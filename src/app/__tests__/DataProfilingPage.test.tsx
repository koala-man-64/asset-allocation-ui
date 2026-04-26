import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DataProfilingPage } from '@/features/data-profiling/DataProfilingPage';
import { DataService } from '@/services/DataService';
import { renderWithProviders } from '@/test/utils';

vi.mock('@/services/DataService', () => ({
  DataService: {
    getGenericData: vi.fn(),
    getDataProfile: vi.fn()
  }
}));

describe('DataProfilingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DataService.getGenericData).mockResolvedValue([
      {
        close: 182.31,
        sector: 'Technology',
        trade_date: '2026-04-18'
      }
    ]);
    vi.mocked(DataService.getDataProfile).mockResolvedValue({
      layer: 'gold',
      domain: 'market',
      column: 'close',
      kind: 'numeric',
      totalRows: 4000,
      nonNullCount: 3980,
      nullCount: 20,
      sampleRows: 1200,
      uniqueCount: 875,
      duplicateCount: 325,
      bins: [
        { label: '0-100', count: 140, start: 0, end: 100 },
        { label: '100-200', count: 420, start: 100, end: 200 }
      ],
      topValues: []
    });
  });

  it('discovers columns for the selected layer and domain', async () => {
    renderWithProviders(<DataProfilingPage />);

    expect(await screen.findByRole('option', { name: 'close' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'sector' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'trade_date' })).toBeInTheDocument();
    expect(vi.mocked(DataService.getGenericData)).toHaveBeenCalledWith('gold', 'market', undefined, 500);
  });

  it('shows a no-data state when the selected domain returns no rows', async () => {
    vi.mocked(DataService.getGenericData).mockResolvedValueOnce([]);

    renderWithProviders(<DataProfilingPage />);

    expect(await screen.findByText('Column Retrieval Failed')).toBeInTheDocument();
    expect(screen.getByText('No data available for gold/market.')).toBeInTheDocument();
  });

  it('renders a numeric profile when profiling completes', async () => {
    const user = userEvent.setup();

    renderWithProviders(<DataProfilingPage />);

    await screen.findByRole('option', { name: 'close' });
    await user.click(screen.getByRole('button', { name: 'Run Profile' }));

    await waitFor(() => {
      expect(DataService.getDataProfile).toHaveBeenCalledWith('gold', 'market', 'close', {
        bins: 20,
        sampleRows: 12000,
        topValues: 20
      });
    });
    expect(await screen.findByText('Profile Summary')).toBeInTheDocument();
    expect(screen.getByText('Numeric histogram')).toBeInTheDocument();
  });

  it('renders a string profile with top values', async () => {
    const user = userEvent.setup();
    vi.mocked(DataService.getDataProfile).mockResolvedValueOnce({
      layer: 'gold',
      domain: 'market',
      column: 'sector',
      kind: 'string',
      totalRows: 4000,
      nonNullCount: 3980,
      nullCount: 20,
      sampleRows: 1200,
      uniqueCount: 12,
      duplicateCount: 1188,
      bins: [],
      topValues: [
        { value: 'Technology', count: 410 },
        { value: 'Industrials', count: 120 }
      ]
    });

    renderWithProviders(<DataProfilingPage />);

    await screen.findByRole('option', { name: 'sector' });
    await user.selectOptions(screen.getByLabelText('Column'), 'sector');
    await user.click(screen.getByRole('button', { name: 'Run Profile' }));

    expect((await screen.findAllByText('Top string values')).length).toBeGreaterThan(1);
    expect(screen.getByText('Technology')).toBeInTheDocument();
    expect(screen.getByText('Industrials')).toBeInTheDocument();
  });

  it('shows an error panel when profiling fails', async () => {
    const user = userEvent.setup();
    vi.mocked(DataService.getDataProfile).mockRejectedValueOnce(new Error('Profile service unavailable'));

    renderWithProviders(<DataProfilingPage />);

    await screen.findByRole('option', { name: 'close' });
    await user.click(screen.getByRole('button', { name: 'Run Profile' }));

    expect(await screen.findByText('Profile Failed')).toBeInTheDocument();
    expect(screen.getByText('Profile service unavailable')).toBeInTheDocument();
  });
});
