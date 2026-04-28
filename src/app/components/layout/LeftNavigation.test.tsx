import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LeftNavigation } from '@/app/components/layout/LeftNavigation';
import { SidebarProvider } from '@/app/components/ui/sidebar';
import { DataService } from '@/services/DataService';
import { clearAssociatedAuthCookies } from '@/services/authCookieCleanup';

const toastSuccess = vi.hoisted(() => vi.fn());
const toastWarning = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    warning: toastWarning
  }
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    deleteAuthSession: vi.fn()
  }
}));

vi.mock('@/services/authCookieCleanup', () => ({
  clearAssociatedAuthCookies: vi.fn()
}));

function renderLeftNavigation() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SidebarProvider defaultOpen>
          <LeftNavigation />
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LeftNavigation auth cookie utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DataService.deleteAuthSession).mockResolvedValue({});
    vi.mocked(clearAssociatedAuthCookies).mockReturnValue(6);
  });

  it('clears server session and browser auth cookies from the footer link', async () => {
    renderLeftNavigation();

    fireEvent.click(screen.getByRole('button', { name: 'Clear auth cookies' }));

    await waitFor(() => {
      expect(DataService.deleteAuthSession).toHaveBeenCalledTimes(1);
      expect(clearAssociatedAuthCookies).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Auth cookies cleared.')).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith('Auth cookies cleared.');
  });
});
