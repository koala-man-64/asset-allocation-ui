import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DebugSymbolsPage } from '@/features/debug-symbols/DebugSymbolsPage';
import { DataService } from '@/services/DataService';
import { renderWithProviders } from '@/test/utils';

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock
  }
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    getDebugSymbols: vi.fn(),
    setDebugSymbols: vi.fn(),
    deleteDebugSymbols: vi.fn()
  }
}));

const NOW = '2026-04-18T14:30:00Z';

describe('DebugSymbolsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DataService.getDebugSymbols).mockResolvedValue({
      symbols: 'AAPL, msft',
      updatedAt: NOW,
      updatedBy: 'qa-user'
    });
    vi.mocked(DataService.setDebugSymbols).mockResolvedValue({
      symbols: 'AAPL,MSFT,NVDA',
      updatedAt: NOW,
      updatedBy: 'qa-user'
    });
    vi.mocked(DataService.deleteDebugSymbols).mockResolvedValue({
      deleted: true
    });
  });

  it('loads the current symbol list and shows a normalized preview', async () => {
    renderWithProviders(<DebugSymbolsPage />);

    expect(await screen.findByText('Configured')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('2 symbols detected')).toBeInTheDocument();
  });

  it('saves an updated symbol list', async () => {
    const user = userEvent.setup();

    renderWithProviders(<DebugSymbolsPage />);

    const textarea = await screen.findByPlaceholderText('AAPL, MSFT, NVDA');
    await user.clear(textarea);
    await user.type(textarea, 'aapl, msft, nvda');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(DataService.setDebugSymbols).toHaveBeenCalledWith({
        symbols: 'aapl, msft, nvda'
      });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Debug symbols updated.');
  });

  it('resets local edits back to the persisted value', async () => {
    const user = userEvent.setup();

    renderWithProviders(<DebugSymbolsPage />);

    const textarea = await screen.findByPlaceholderText('AAPL, MSFT, NVDA');
    await user.clear(textarea);
    await user.type(textarea, 'NVDA');
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(textarea).toHaveValue('AAPL, msft');
  });

  it('deletes the stored symbol list', async () => {
    const user = userEvent.setup();

    renderWithProviders(<DebugSymbolsPage />);

    await screen.findByText('Configured');
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(DataService.deleteDebugSymbols).toHaveBeenCalledTimes(1);
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Debug symbols removed.');
  });

  it('shows the validation state when no symbols are configured', async () => {
    vi.mocked(DataService.getDebugSymbols).mockResolvedValueOnce({
      symbols: '',
      updatedAt: null,
      updatedBy: null
    });

    renderWithProviders(<DebugSymbolsPage />);

    expect(await screen.findByText('No debug-symbol allowlist is currently stored.')).toBeInTheDocument();
    expect(screen.getByText('Add at least one symbol before saving debug filtering.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
});
