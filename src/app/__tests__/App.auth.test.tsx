import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import App from '../App';
import { renderWithProviders } from '@/test/utils';
import { DataService } from '@/services/DataService';
import { ApiError } from '@/services/apiService';

const mockUseRealtime = vi.hoisted(() => vi.fn());
const mockConfig = vi.hoisted(() => ({
  apiBaseUrl: '/api',
  oidcEnabled: true,
  authRequired: true,
  oidcRedirectUri: 'http://localhost/auth/callback',
  oidcPostLogoutRedirectUri: 'https://asset-allocation.example.com/auth/logout-complete'
}));

const mockAuth = vi.hoisted(() => ({
  enabled: true,
  ready: true,
  authenticated: false,
  phase: 'signed-out',
  busy: false,
  userLabel: null as string | null,
  error: null as string | null,
  interactionReason: null as string | null,
  signIn: vi.fn(),
  signOut: vi.fn()
}));

const consumePostLoginRedirectPath = vi.hoisted(() => vi.fn(() => '/system-status'));
const peekPostLoginRedirectPath = vi.hoisted(() => vi.fn(() => '/postgres-explorer?foo=1#bar'));

vi.mock('@/hooks/useRealtime', () => ({
  useRealtime: mockUseRealtime
}));

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => mockAuth,
  consumePostLoginRedirectPath,
  peekPostLoginRedirectPath
}));

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    getAuthSessionStatusWithMeta: vi.fn(),
    getSystemHealthWithMeta: vi.fn()
  }
}));

vi.mock('@/features/system-status/SystemStatusPage', () => ({
  SystemStatusPage: () => <div data-testid="mock-system-status">Mock System Status</div>
}));

vi.mock('@/features/postgres-explorer/PostgresExplorerPage', () => ({
  PostgresExplorerPage: () => (
    <div data-testid="mock-postgres-explorer">Mock Postgres Explorer</div>
  )
}));

describe('App OIDC access flow', () => {
  beforeEach(() => {
    mockConfig.apiBaseUrl = '/api';
    mockConfig.oidcEnabled = true;
    mockConfig.authRequired = true;
    mockConfig.oidcRedirectUri = 'http://localhost/auth/callback';
    mockAuth.enabled = true;
    mockAuth.ready = true;
    mockAuth.authenticated = false;
    mockAuth.phase = 'signed-out';
    mockAuth.busy = false;
    mockAuth.userLabel = null;
    mockAuth.error = null;
    mockAuth.interactionReason = null;
    mockUseRealtime.mockReset();
    mockAuth.signIn.mockReset();
    mockAuth.signOut.mockReset();
    consumePostLoginRedirectPath.mockReset();
    consumePostLoginRedirectPath.mockReturnValue('/system-status');
    peekPostLoginRedirectPath.mockReset();
    peekPostLoginRedirectPath.mockReturnValue('/postgres-explorer?foo=1#bar');
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockReset();
    vi.mocked(DataService.getSystemHealthWithMeta).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a sign-in gate before loading protected routes', async () => {
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Sign-in required')).toBeInTheDocument();
    expect(screen.getByTestId('auth-step-sign-in')).toHaveAttribute('data-state', 'active');
    expect(DataService.getAuthSessionStatusWithMeta).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue sign-in' }));
    expect(mockAuth.signIn).toHaveBeenCalledWith('/system-status');
  });

  it('switches the CTA into a disabled redirecting state as soon as sign-in starts', async () => {
    window.history.pushState({}, 'System Status', '/system-status');

    const view = renderWithProviders(<App />);
    expect(await screen.findByText('Sign-in required')).toBeInTheDocument();

    mockAuth.signIn.mockImplementation(() => {
      mockAuth.phase = 'redirecting';
      mockAuth.busy = true;
      view.rerender(<App />);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Continue sign-in' }));

    expect(mockAuth.signIn).toHaveBeenCalledWith('/system-status');
    expect(screen.getByRole('button', { name: 'Redirecting...' })).toBeDisabled();
    expect(screen.getByTestId('auth-step-redirect')).toHaveAttribute('data-state', 'active');
  });

  it('surfaces sign-in startup errors on the access gate', async () => {
    mockAuth.error = 'OIDC sign-in could not be started. popup blocked';
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Sign-in required')).toBeInTheDocument();
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

    expect(screen.getByText('Continuing sign-in')).toBeInTheDocument();
    expect(screen.queryByText(/The redirect is taking longer/i)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText(/The redirect is taking longer/i)).toBeInTheDocument();
  });

  it('shows a session-expired prompt instead of forcing a background redirect', async () => {
    mockAuth.phase = 'session-expired';
    mockAuth.interactionReason = 'API /system/status returned 401.';
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Session expired')).toBeInTheDocument();
    expect(screen.getByText(/API \/system\/status returned 401/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue sign-in' }));
    expect(mockAuth.signIn).toHaveBeenCalledWith('/system-status');
  });

  it('shows a deployment misconfiguration screen when auth is required but browser OIDC is unavailable', async () => {
    mockConfig.oidcEnabled = false;
    mockAuth.enabled = false;
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Deployment auth misconfigured')).toBeInTheDocument();
    expect(screen.getByText(/UI_OIDC_CLIENT_ID/i)).toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).not.toHaveBeenCalled();
    expect(mockUseRealtime).not.toHaveBeenCalled();
  });

  it('shows a deployment misconfiguration screen when the callback origin points at another host', async () => {
    mockConfig.oidcRedirectUri = 'https://asset-allocation-api.example.com/auth/callback';
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Deployment auth misconfigured')).toBeInTheDocument();
    expect(screen.getByText(/asset-allocation-api\.example\.com\/auth\/callback/i)).toBeInTheDocument();
    expect(screen.getByText(/instead of this UI origin/i)).toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).not.toHaveBeenCalled();
    expect(mockUseRealtime).not.toHaveBeenCalled();
  });

  it('bypasses the auth gate entirely when browser auth is disabled', async () => {
    mockConfig.oidcEnabled = false;
    mockConfig.authRequired = false;
    mockAuth.enabled = false;
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-system-status')).toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).not.toHaveBeenCalled();
    expect(mockUseRealtime).toHaveBeenCalled();
  });

  it('shows the API access step while the protected access probe is running', async () => {
    mockAuth.authenticated = true;
    mockAuth.phase = 'authenticated';
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockImplementation(() => new Promise(() => {}));
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Checking access')).toBeInTheDocument();
    expect(screen.getByTestId('auth-step-access')).toHaveAttribute('data-state', 'active');
  });

  it('renders the protected route after the access probe succeeds', async () => {
    mockAuth.authenticated = true;
    mockAuth.phase = 'authenticated';
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue({
      data: {
        authMode: 'oidc',
        subject: 'user-123',
        displayName: 'Ada Lovelace',
        username: 'ada@example.com',
        requiredRoles: ['AssetAllocation.Access'],
        grantedRoles: ['AssetAllocation.Access']
      },
      meta: { requestId: 'req-1', status: 200, durationMs: 10, url: '/api/auth/session' }
    });
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-system-status')).toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).toHaveBeenCalledTimes(1);
  });

  it('shows an access denied screen when the API returns 403', async () => {
    mockAuth.authenticated = true;
    mockAuth.phase = 'authenticated';
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockRejectedValue(
      new ApiError(403, 'API Error: 403 Forbidden [requestId=req-1] - {"detail":"Missing required roles."}')
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
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockRejectedValue(new Error('Gateway timeout'));
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
    consumePostLoginRedirectPath.mockReturnValue('/postgres-explorer?foo=1#bar');
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue({
      data: {
        authMode: 'oidc',
        subject: 'user-123',
        requiredRoles: [],
        grantedRoles: []
      },
      meta: { requestId: 'req-2', status: 200, durationMs: 10, url: '/api/auth/session' }
    });
    window.history.pushState({}, 'Callback', '/auth/callback');

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(consumePostLoginRedirectPath).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('mock-postgres-explorer')).toBeInTheDocument();
    });

    expect(window.location.pathname).toBe('/postgres-explorer');
    expect(window.location.search).toBe('?foo=1');
    expect(window.location.hash).toBe('#bar');
  });

  it('falls back to the legacy system-health probe while /api/auth/session is unavailable', async () => {
    mockAuth.authenticated = true;
    mockAuth.phase = 'authenticated';
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockRejectedValue(
      new ApiError(404, 'API Error: 404 Not Found [requestId=req-3] - {"detail":"Not Found"}')
    );
    vi.mocked(DataService.getSystemHealthWithMeta).mockResolvedValue({
      data: {} as never,
      meta: { requestId: 'req-4', status: 200, durationMs: 10, url: '/api/system/health' }
    });
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-system-status')).toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).toHaveBeenCalledTimes(1);
    expect(DataService.getSystemHealthWithMeta).toHaveBeenCalledTimes(1);
  });

  it('shows a neutral signed-out screen on the logout-complete route', async () => {
    window.history.pushState({}, 'Logout Complete', '/auth/logout-complete');

    renderWithProviders(<App />);

    expect(await screen.findByText('Signed out')).toBeInTheDocument();
    expect(screen.getByText(/Signed out successfully/i)).toBeInTheDocument();
  });

  it('retries callback sign-in with the preserved deep link', async () => {
    mockAuth.ready = true;
    mockAuth.phase = 'signed-out';
    mockAuth.error = 'OIDC sign-in could not be completed. correlation-id=123';
    window.history.pushState({}, 'Callback', '/auth/callback');

    renderWithProviders(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(peekPostLoginRedirectPath).toHaveBeenCalledTimes(1);
    expect(mockAuth.signIn).toHaveBeenCalledWith('/postgres-explorer?foo=1#bar');
  });
});
