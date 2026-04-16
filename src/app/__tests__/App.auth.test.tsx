import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import App from '../App';
import { renderWithProviders } from '@/test/utils';
import { DataService } from '@/services/DataService';

const mockUseRealtime = vi.hoisted(() => vi.fn());
const mockConfig = vi.hoisted(() => ({
  apiBaseUrl: '/api',
  oidcEnabled: true,
  authRequired: true
}));

const mockAuth = vi.hoisted(() => ({
  enabled: true,
  ready: true,
  authenticated: false,
  phase: 'signed-out',
  busy: false,
  userLabel: null as string | null,
  error: null as string | null,
  signIn: vi.fn(),
  signOut: vi.fn()
}));

const consumePostLoginRedirectPath = vi.hoisted(() => vi.fn(() => '/system-status'));

vi.mock('@/hooks/useRealtime', () => ({
  useRealtime: mockUseRealtime
}));

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => mockAuth,
  consumePostLoginRedirectPath
}));

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    getSystemHealthWithMeta: vi.fn()
  }
}));

vi.mock('@/features/system-status/SystemStatusPage', () => ({
  SystemStatusPage: () => <div data-testid="mock-system-status">Mock System Status</div>
}));

describe('App OIDC access flow', () => {
  beforeEach(() => {
    mockConfig.apiBaseUrl = '/api';
    mockConfig.oidcEnabled = true;
    mockConfig.authRequired = true;
    mockAuth.enabled = true;
    mockAuth.ready = true;
    mockAuth.authenticated = false;
    mockAuth.phase = 'signed-out';
    mockAuth.busy = false;
    mockAuth.userLabel = null;
    mockAuth.error = null;
    mockUseRealtime.mockReset();
    mockAuth.signIn.mockReset();
    mockAuth.signOut.mockReset();
    consumePostLoginRedirectPath.mockReset();
    consumePostLoginRedirectPath.mockReturnValue('/system-status');
    vi.mocked(DataService.getSystemHealthWithMeta).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a sign-in gate before loading protected routes', async () => {
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Sign in required')).toBeInTheDocument();
    expect(screen.getByTestId('auth-step-sign-in')).toHaveAttribute('data-state', 'active');
    expect(DataService.getSystemHealthWithMeta).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mockAuth.signIn).toHaveBeenCalledWith('/system-status');
  });

  it('switches the CTA into a disabled redirecting state as soon as sign-in starts', async () => {
    window.history.pushState({}, 'System Status', '/system-status');

    const view = renderWithProviders(<App />);
    expect(await screen.findByText('Sign in required')).toBeInTheDocument();

    mockAuth.signIn.mockImplementation(() => {
      mockAuth.phase = 'redirecting';
      mockAuth.busy = true;
      view.rerender(<App />);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(mockAuth.signIn).toHaveBeenCalledWith('/system-status');
    expect(screen.getByRole('button', { name: 'Redirecting...' })).toBeDisabled();
    expect(screen.getByTestId('auth-step-redirect')).toHaveAttribute('data-state', 'active');
  });

  it('surfaces sign-in startup errors on the access gate', async () => {
    mockAuth.error = 'OIDC sign-in could not be started. popup blocked';
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Sign in required')).toBeInTheDocument();
    expect(screen.getByText(/popup blocked/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByTestId('auth-step-redirect')).toHaveAttribute('data-state', 'error');
  });

  it('shows the delayed helper when the redirect state takes too long', async () => {
    vi.useFakeTimers();
    mockAuth.phase = 'redirecting';
    mockAuth.busy = true;
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(screen.getByText('Redirecting to sign in')).toBeInTheDocument();
    expect(screen.queryByText(/The browser is still working\./i)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText(/The browser is still working\./i)).toBeInTheDocument();
  });

  it('shows a deployment misconfiguration screen when auth is required but browser OIDC is unavailable', async () => {
    mockConfig.oidcEnabled = false;
    mockAuth.enabled = false;
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Deployment auth misconfigured')).toBeInTheDocument();
    expect(screen.getByText(/UI_OIDC_CLIENT_ID/i)).toBeInTheDocument();
    expect(DataService.getSystemHealthWithMeta).not.toHaveBeenCalled();
    expect(mockUseRealtime).not.toHaveBeenCalled();
  });

  it('shows the API access step while the protected access probe is running', async () => {
    mockAuth.authenticated = true;
    mockAuth.phase = 'authenticated';
    vi.mocked(DataService.getSystemHealthWithMeta).mockImplementation(() => new Promise(() => {}));
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Checking access')).toBeInTheDocument();
    expect(screen.getByTestId('auth-step-access')).toHaveAttribute('data-state', 'active');
  });

  it('renders the protected route after the access probe succeeds', async () => {
    mockAuth.authenticated = true;
    mockAuth.phase = 'authenticated';
    vi.mocked(DataService.getSystemHealthWithMeta).mockResolvedValue({
      data: {} as never,
      meta: { requestId: 'req-1', status: 200, durationMs: 10, url: '/api/system/health' }
    });
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-system-status')).toBeInTheDocument();
    expect(DataService.getSystemHealthWithMeta).toHaveBeenCalledTimes(1);
  });

  it('shows an access denied screen when the API returns 403', async () => {
    mockAuth.authenticated = true;
    mockAuth.phase = 'authenticated';
    vi.mocked(DataService.getSystemHealthWithMeta).mockRejectedValue(
      new Error('API Error: 403 Forbidden [requestId=req-1] - {"detail":"Missing required roles."}')
    );
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Access denied')).toBeInTheDocument();
    expect(screen.getByText(/AssetAllocation.Access role/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByTestId('auth-step-access')).toHaveAttribute('data-state', 'error');
  });

  it('keeps retry and sign-out actions when the access probe fails generically', async () => {
    mockAuth.authenticated = true;
    mockAuth.phase = 'authenticated';
    vi.mocked(DataService.getSystemHealthWithMeta).mockRejectedValue(new Error('Gateway timeout'));
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Access check failed')).toBeInTheDocument();
    expect(screen.getByText(/Gateway timeout/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByTestId('auth-step-access')).toHaveAttribute('data-state', 'error');
  });

  it('shows the callback route as an in-progress Microsoft redirect while auth settles', async () => {
    mockAuth.ready = false;
    mockAuth.phase = 'redirecting';
    mockAuth.busy = true;
    window.history.pushState({}, 'Callback', '/auth/callback');

    renderWithProviders(<App />);

    expect(await screen.findByText('Signing you in')).toBeInTheDocument();
    expect(screen.getByTestId('auth-step-redirect')).toHaveAttribute('data-state', 'active');
  });

  it('completes the callback route and returns to the saved location', async () => {
    mockAuth.authenticated = true;
    mockAuth.phase = 'authenticated';
    vi.mocked(DataService.getSystemHealthWithMeta).mockResolvedValue({
      data: {} as never,
      meta: { requestId: 'req-2', status: 200, durationMs: 10, url: '/api/system/health' }
    });
    window.history.pushState({}, 'Callback', '/auth/callback');

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(consumePostLoginRedirectPath).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('mock-system-status')).toBeInTheDocument();
    });
  });
});
