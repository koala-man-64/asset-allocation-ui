import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import App from '../App';
import { renderWithProviders } from '@/test/utils';
import { DataService } from '@/services/DataService';
import { ApiError } from '@/services/apiService';

const mockUseRealtime = vi.hoisted(() => vi.fn());
const mockConfig = vi.hoisted(() => ({
  apiBaseUrl: '/api',
  authSessionMode: 'bearer' as 'bearer' | 'cookie',
  oidcEnabled: true,
  authRequired: true,
  oidcRedirectUri: 'http://localhost:3000/auth/callback',
  oidcPostLogoutRedirectUri: 'http://localhost:3000/auth/logout-complete'
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
  interactionRequest: null as
    | {
        reason?: string;
        source?: string;
        endpoint?: string;
        status?: number;
        requestId?: string;
        recoveryAttempt?: number;
      }
    | null,
  getAccessToken: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signOutAndRestart: vi.fn()
}));

const consumePostLoginRedirectPath = vi.hoisted(() => vi.fn(() => '/system-status'));
const consumePostLogoutRestartPath = vi.hoisted(() => vi.fn<() => string | null>(() => null));
const peekPostLoginRedirectPath = vi.hoisted(() => vi.fn(() => '/postgres-explorer?foo=1#bar'));

function validSessionResponse(requestId = 'req-1') {
  return {
    data: {
      authMode: 'oidc',
      subject: 'user-123',
      displayName: 'Ada Lovelace',
      username: 'ada@example.com',
      requiredRoles: ['AssetAllocation.Access'],
      grantedRoles: ['AssetAllocation.Access']
    },
    meta: { requestId, status: 200, durationMs: 10, url: '/api/auth/session' }
  };
}

vi.mock('@/hooks/useRealtime', () => ({
  useRealtime: mockUseRealtime
}));

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => mockAuth,
  consumePostLoginRedirectPath,
  consumePostLogoutRestartPath,
  peekPostLoginRedirectPath
}));

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    createAuthSessionWithBearerToken: vi.fn(),
    deleteAuthSession: vi.fn(),
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

describe('App centralized auth flow', () => {
  beforeEach(() => {
    const sameOrigin = window.location.origin;

    mockConfig.apiBaseUrl = '/api';
    mockConfig.authSessionMode = 'bearer';
    mockConfig.oidcEnabled = true;
    mockConfig.authRequired = true;
    mockConfig.oidcRedirectUri = `${sameOrigin}/auth/callback`;
    mockConfig.oidcPostLogoutRedirectUri = `${sameOrigin}/auth/logout-complete`;
    mockAuth.enabled = true;
    mockAuth.ready = true;
    mockAuth.authenticated = false;
    mockAuth.phase = 'signed-out';
    mockAuth.busy = false;
    mockAuth.userLabel = null;
    mockAuth.error = null;
    mockAuth.interactionReason = null;
    mockAuth.interactionRequest = null;
    mockUseRealtime.mockReset();
    mockAuth.getAccessToken.mockReset();
    mockAuth.getAccessToken.mockResolvedValue('api-access-token');
    mockAuth.signIn.mockReset();
    mockAuth.signOut.mockReset();
    mockAuth.signOutAndRestart.mockReset();
    consumePostLoginRedirectPath.mockReset();
    consumePostLoginRedirectPath.mockReturnValue('/system-status');
    consumePostLogoutRestartPath.mockReset();
    consumePostLogoutRestartPath.mockReturnValue(null);
    peekPostLoginRedirectPath.mockReset();
    peekPostLoginRedirectPath.mockReturnValue('/postgres-explorer?foo=1#bar');
    vi.mocked(DataService.createAuthSessionWithBearerToken).mockReset();
    vi.mocked(DataService.createAuthSessionWithBearerToken).mockResolvedValue(validSessionResponse());
    vi.mocked(DataService.deleteAuthSession).mockReset();
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockReset();
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockRejectedValue(
      new ApiError(401, 'API Error: 401 Unauthorized')
    );
    vi.mocked(DataService.getSystemHealthWithMeta).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('redirects protected deep links to the centralized login page when no API session exists', async () => {
    window.history.pushState({}, 'System Status', '/system-status?tab=health#latency');

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(
      '/system-status?tab=health#latency'
    );
    expect(screen.queryByText('Checking access')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign-in required')).not.toBeInTheDocument();
    expect(mockAuth.signIn).toHaveBeenCalledWith('/system-status?tab=health#latency');
  });

  it('sends /login users with a valid API session back to their return path', async () => {
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue(validSessionResponse());
    window.history.pushState(
      {},
      'Login',
      `/login?returnTo=${encodeURIComponent('/postgres-explorer?foo=1#bar')}`
    );

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-postgres-explorer')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/postgres-explorer');
    expect(window.location.search).toBe('?foo=1');
    expect(window.location.hash).toBe('#bar');
    expect(mockAuth.signIn).not.toHaveBeenCalled();
  });

  it('starts OIDC only from the login page after the session check returns 401', async () => {
    window.history.pushState(
      {},
      'Login',
      `/login?returnTo=${encodeURIComponent('/system-status')}`
    );

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(mockAuth.signIn).toHaveBeenCalledWith('/system-status');
    });
    expect(await screen.findByText('Starting sign-in')).toBeInTheDocument();
  });

  it('fails closed on the login page when browser OIDC is required but unavailable', async () => {
    mockConfig.oidcEnabled = false;
    window.history.pushState(
      {},
      'Login',
      `/login?returnTo=${encodeURIComponent('/system-status')}`
    );

    renderWithProviders(<App />);

    expect(await screen.findByText('Deployment auth misconfigured')).toBeInTheDocument();
    expect(screen.getByText(/Browser OIDC is disabled/i)).toBeInTheDocument();
    expect(mockAuth.signIn).not.toHaveBeenCalled();
  });

  it('fails closed when the configured callback origin points away from the UI', async () => {
    mockConfig.oidcRedirectUri = 'https://asset-allocation-api.example.com/auth/callback';
    window.history.pushState(
      {},
      'Login',
      `/login?returnTo=${encodeURIComponent('/system-status')}`
    );

    renderWithProviders(<App />);

    expect(await screen.findByText('Deployment auth misconfigured')).toBeInTheDocument();
    expect(screen.getByText(/different origin/i)).toBeInTheDocument();
    expect(mockAuth.signIn).not.toHaveBeenCalled();
  });

  it('exchanges the callback bearer token for an API session cookie in cookie mode', async () => {
    mockConfig.authSessionMode = 'cookie';
    mockAuth.authenticated = true;
    mockAuth.phase = 'authenticated';
    consumePostLoginRedirectPath.mockReturnValue('/postgres-explorer?foo=1#bar');
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue(validSessionResponse('req-2'));
    window.history.pushState({}, 'Callback', '/auth/callback');

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-postgres-explorer')).toBeInTheDocument();
    expect(mockAuth.getAccessToken).toHaveBeenCalled();
    expect(DataService.createAuthSessionWithBearerToken).toHaveBeenCalledWith('api-access-token');
    expect(window.location.pathname).toBe('/postgres-explorer');
  });

  it('does not exchange a bearer callback when runtime session mode remains bearer', async () => {
    mockAuth.authenticated = true;
    mockAuth.phase = 'authenticated';
    consumePostLoginRedirectPath.mockReturnValue('/postgres-explorer?foo=1#bar');
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue(validSessionResponse('req-3'));
    window.history.pushState({}, 'Callback', '/auth/callback');

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-postgres-explorer')).toBeInTheDocument();
    expect(DataService.createAuthSessionWithBearerToken).not.toHaveBeenCalled();
  });

  it('renders protected content only after the API session probe succeeds', async () => {
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue(validSessionResponse());
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-system-status')).toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).toHaveBeenCalledTimes(1);
    expect(mockUseRealtime).toHaveBeenCalledWith({ enabled: true });
  });

  it('shows access denied when the API session exists but lacks required roles', async () => {
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockRejectedValue(
      new ApiError(403, 'API Error: 403 Forbidden [requestId=req-1] - {"detail":"Missing required roles."}')
    );
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Your account is not authorized')).toBeInTheDocument();
    expect(screen.getByText(/does not include the required role assignment/i)).toBeInTheDocument();
  });

  it('keeps retry available when the API session probe fails generically', async () => {
    vi.mocked(DataService.getAuthSessionStatusWithMeta)
      .mockRejectedValueOnce(new Error('Gateway timeout'))
      .mockResolvedValueOnce(validSessionResponse());
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Could not verify your session')).toBeInTheDocument();
    expect(screen.getByText(/Gateway timeout/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('mock-system-status')).toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).toHaveBeenCalledTimes(2);
  });

  it('bypasses session checks only when auth is not required', async () => {
    mockConfig.oidcEnabled = false;
    mockConfig.authRequired = false;
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-system-status')).toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).not.toHaveBeenCalled();
    expect(mockUseRealtime).toHaveBeenCalledWith({ enabled: true });
  });

  it('shows a neutral signed-out screen on the logout-complete route', async () => {
    window.history.pushState({}, 'Logout Complete', '/auth/logout-complete');

    renderWithProviders(<App />);

    expect(await screen.findByText('Signed out')).toBeInTheDocument();
    expect(screen.getByText(/Signed out successfully/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('restarts sign-in automatically on the logout-complete route when a clean retry was queued', async () => {
    consumePostLogoutRestartPath.mockReturnValue('/system-status');
    window.history.pushState({}, 'Logout Complete', '/auth/logout-complete');

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(mockAuth.signIn).toHaveBeenCalledWith('/system-status');
    });
  });
});
