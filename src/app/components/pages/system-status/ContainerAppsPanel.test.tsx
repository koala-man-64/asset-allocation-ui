import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { ContainerAppsPanel } from './ContainerAppsPanel';
import { DataService } from '@/services/DataService';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    getContainerApps: vi.fn(),
    startContainerApp: vi.fn(),
    stopContainerApp: vi.fn(),
    getContainerAppLogs: vi.fn()
  }
}));

vi.mock('@/services/realtimeBus', () => ({
  addConsoleLogStreamListener: vi.fn(() => vi.fn()),
  buildContainerAppLogTopic: vi.fn((name: string) => `container-app:${name}`),
  requestRealtimeSubscription: vi.fn(),
  requestRealtimeUnsubscription: vi.fn()
}));

describe('ContainerAppsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DataService.getContainerApps).mockResolvedValue({
      probed: true,
      apps: [
        {
          name: 'api-app',
          status: 'healthy',
          provisioningState: 'Succeeded',
          runningState: 'Running',
          checkedAt: '2026-03-17T12:00:00Z',
          health: {
            status: 'healthy',
            url: 'https://evil.example.com/healthz',
            checkedAt: '2026-03-17T12:00:00Z'
          }
        },
        {
          name: 'ui-app',
          status: 'healthy',
          provisioningState: 'Succeeded',
          runningState: 'Running',
          checkedAt: '2026-03-17T12:00:00Z',
          health: {
            status: 'healthy',
            url: '/healthz',
            checkedAt: '2026-03-17T12:00:00Z'
          }
        }
      ]
    });
    vi.mocked(DataService.getContainerAppLogs).mockResolvedValue({
      appName: 'api-app',
      lookbackMinutes: 60,
      tailLines: 50,
      logs: []
    });
  });

  it('renders blocked external probe URLs as text and keeps same-origin probes clickable', async () => {
    renderWithProviders(<ContainerAppsPanel />);

    expect(await screen.findByText('api-app')).toBeInTheDocument();
    expect(screen.getByText('https://evil.example.com/healthz')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'https://evil.example.com/healthz' })
    ).toBeNull();

    const sameOriginProbeLink = screen.getByRole('link', { name: '/healthz' });
    expect(sameOriginProbeLink).toHaveAttribute('href', `${window.location.origin}/healthz`);
  });
});
