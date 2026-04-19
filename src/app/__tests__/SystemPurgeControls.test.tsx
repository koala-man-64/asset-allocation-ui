import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PurgeActionIcon } from '@/features/system-status/components/SystemPurgeControls';
import { DataService } from '@/services/DataService';

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
    purgeData: vi.fn(),
    getPurgeOperation: vi.fn()
  }
}));

function renderPurgeAction(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0
      }
    }
  });

  const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

  return {
    invalidateQueriesSpy,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  };
}

describe('SystemPurgeControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('purges immediately when the operation completes inline', async () => {
    const user = userEvent.setup();
    vi.mocked(DataService.purgeData).mockResolvedValue({
      operationId: 'purge-1',
      status: 'succeeded',
      scope: 'layer-domain',
      createdAt: '2026-04-18T14:30:00Z',
      updatedAt: '2026-04-18T14:30:00Z',
      startedAt: '2026-04-18T14:30:00Z',
      result: {
        scope: 'layer-domain',
        layer: 'bronze',
        domain: 'market',
        totalDeleted: 7,
        targets: []
      }
    });

    const { invalidateQueriesSpy } = renderPurgeAction(
      <PurgeActionIcon scope="layer-domain" layer="bronze" domain="market" />
    );

    await user.click(screen.getByRole('button', { name: 'Purge Bronze • Market' }));
    await user.click(await screen.findByRole('button', { name: 'Purge' }));

    await waitFor(() => {
      expect(DataService.purgeData).toHaveBeenCalledWith({
        scope: 'layer-domain',
        layer: 'bronze',
        domain: 'market',
        confirm: true
      });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Purged 7 blob(s).');
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['systemStatusView'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['systemHealth'] });
  });

  it('polls the operation when purge starts asynchronously', async () => {
    const user = userEvent.setup();
    vi.mocked(DataService.purgeData).mockResolvedValue({
      operationId: 'purge-2',
      status: 'running',
      scope: 'layer',
      createdAt: '2026-04-18T14:30:00Z',
      updatedAt: '2026-04-18T14:30:00Z',
      startedAt: '2026-04-18T14:30:00Z'
    });
    vi.mocked(DataService.getPurgeOperation)
      .mockResolvedValueOnce({
        operationId: 'purge-2',
        status: 'running',
        scope: 'layer',
        createdAt: '2026-04-18T14:30:00Z',
        updatedAt: '2026-04-18T14:30:01Z',
        startedAt: '2026-04-18T14:30:00Z'
      })
      .mockResolvedValueOnce({
        operationId: 'purge-2',
        status: 'succeeded',
        scope: 'layer',
        createdAt: '2026-04-18T14:30:00Z',
        updatedAt: '2026-04-18T14:30:02Z',
        startedAt: '2026-04-18T14:30:00Z',
        result: {
          scope: 'layer',
          layer: 'bronze',
          totalDeleted: 12,
          targets: []
        }
    });

    renderPurgeAction(<PurgeActionIcon scope="layer" layer="bronze" />);

    await user.click(screen.getByRole('button', { name: 'Purge entire Bronze layer' }));
    await user.click(await screen.findByRole('button', { name: 'Purge' }));

    await waitFor(() => {
      expect(DataService.getPurgeOperation).toHaveBeenCalledWith('purge-2');
    }, { timeout: 4000 });
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Purged 12 blob(s).');
    }, { timeout: 4000 });
  });
});
