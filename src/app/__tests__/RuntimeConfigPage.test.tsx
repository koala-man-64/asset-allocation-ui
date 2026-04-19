import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RuntimeConfigPage } from '@/features/runtime-config/RuntimeConfigPage';
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
    getRuntimeConfigCatalog: vi.fn(),
    getRuntimeConfig: vi.fn(),
    setRuntimeConfig: vi.fn(),
    deleteRuntimeConfig: vi.fn()
  }
}));

const NOW = '2026-04-18T14:30:00Z';

describe('RuntimeConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DataService.getRuntimeConfigCatalog).mockResolvedValue({
      items: [
        {
          key: 'feature.alpha',
          description: 'Enable alpha pathway.',
          example: 'true'
        }
      ]
    });
    vi.mocked(DataService.getRuntimeConfig).mockResolvedValue({
      scope: 'global',
      items: [
        {
          scope: 'global',
          key: 'feature.alpha',
          value: 'false',
          description: 'Current override',
          updatedAt: NOW,
          updatedBy: 'qa-user'
        }
      ]
    });
    vi.mocked(DataService.setRuntimeConfig).mockResolvedValue({
      scope: 'global',
      key: 'feature.alpha',
      value: 'true',
      description: 'Updated override',
      updatedAt: NOW,
      updatedBy: 'qa-user'
    });
    vi.mocked(DataService.deleteRuntimeConfig).mockResolvedValue({
      scope: 'global',
      key: 'feature.alpha',
      deleted: true
    });
  });

  it('renders the catalog row and current database override', async () => {
    renderWithProviders(<RuntimeConfigPage />);

    expect(await screen.findByText('feature.alpha')).toBeInTheDocument();
    expect(screen.getByText('Current override')).toBeInTheDocument();
    expect(screen.getByText('false')).toBeInTheDocument();
    expect(screen.getByText('DB')).toBeInTheDocument();
  });

  it('edits and saves a runtime config override', async () => {
    const user = userEvent.setup();

    renderWithProviders(<RuntimeConfigPage />);

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = within(screen.getByRole('dialog'));
    const valueInput = dialog.getByDisplayValue('false');
    const descriptionInput = dialog.getByDisplayValue('Current override');
    await user.clear(valueInput);
    await user.type(valueInput, 'true');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'Updated override');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(DataService.setRuntimeConfig).toHaveBeenCalledWith({
        key: 'feature.alpha',
        scope: 'global',
        value: 'true',
        description: 'Updated override'
      });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Runtime config updated.');
  });

  it('removes a persisted override', async () => {
    const user = userEvent.setup();

    renderWithProviders(<RuntimeConfigPage />);

    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(DataService.deleteRuntimeConfig).toHaveBeenCalledWith('feature.alpha', 'global');
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Runtime config entry removed.');
  });

  it('shows an unavailable state when the catalog query fails', async () => {
    vi.mocked(DataService.getRuntimeConfigCatalog).mockRejectedValueOnce(
      new Error('Catalog endpoint unavailable')
    );

    renderWithProviders(<RuntimeConfigPage />);

    expect(await screen.findByText('Runtime Config Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Catalog endpoint unavailable')).toBeInTheDocument();
  });
});
