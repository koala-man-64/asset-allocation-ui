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
  authProvider: 'password' as 'password' | 'disabled' | 'oidc',
  authSessionMode: 'cookie' as 'cookie' | 'bearer',
  oidcEnabled: false,
  authRequired: true,
  uiAuthEnabled: true,
  oidcAuthority: '',
  oidcClientId: '',
  oidcScopes: [] as string[],
  oidcRedirectUri: '',
  oidcPostLogoutRedirectUri: '',
  oidcAudience: [] as string[]
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
  interactionRequest: null as null,
  getAccessToken: vi.fn(),
  login: vi.fn(),
  checkSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signOutAndRestart: vi.fn()
}));

const consumePostLoginRedirectPath = vi.hoisted(() => vi.fn(() => '/system-status'));
const peekPostLoginRedirectPath = vi.hoisted(() => vi.fn(() => '/postgres-explorer?foo=1#bar'));

function validSessionResponse(requestId = 'req-1') {
  return {
    data: {
      authMode: 'password',
      subject: 'shared-password',
      displayName: 'Shared Operator',
      username: 'shared',
      requiredRoles: [],
      grantedRoles: []
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
  consumePostLogoutRestartPath: () => null,
  peekPostLoginRedirectPath
}));

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    createPasswordAuthSession: vi.fn(),
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

describe('App password auth flow', () => {
  beforeEach(() => {
    mockConfig.authProvider = 'password';
    mockConfig.authSessionMode = 'cookie';
    mockConfig.oidcEnabled = false;
    mockConfig.authRequired = true;
    mockConfig.uiAuthEnabled = true;
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
    mockAuth.login.mockReset();
    mockAuth.login.mockResolvedValue(validSessionResponse().data);
    mockAuth.signIn.mockReset();
    mockAuth.signOut.mockReset();
    mockAuth.signOutAndRestart.mockReset();
    consumePostLoginRedirectPath.mockReset();
    consumePostLoginRedirectPath.mockReturnValue('/system-status');
    peekPostLoginRedirectPath.mockReset();
    peekPostLoginRedirectPath.mockReturnValue('/postgres-explorer?foo=1#bar');
    vi.mocked(DataService.createPasswordAuthSession).mockReset();
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

  it('redirects protected deep links to /login when no API session exists', async () => {
    window.history.pushState({}, 'System Status', '/system-status?tab=health#latency');

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(
      '/system-status?tab=health#latency'
    );
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
  });

  it('shows the password form on /login after the session check returns 401', async () => {
    window.history.pushState(
      {},
      'Login',
      `/login?returnTo=${encodeURIComponent('/system-status')}`
    );

    renderWithProviders(<App />);

    expect(await screen.findByLabelText('Shared password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('submits the shared password through the auth context and navigates on success', async () => {
    window.history.pushState(
      {},
      'Login',
      `/login?returnTo=${encodeURIComponent('/system-status')}`
    );

    renderWithProviders(<App />);

    const passwordInput = await screen.findByLabelText('Shared password');
    fireEvent.change(passwordInput, { target: { value: 'shared-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockAuth.login).toHaveBeenCalledWith('shared-password');
      expect(window.location.pathname).toBe('/system-status');
    });
  });

  it('renders a misconfiguration screen when the runtime auth provider is not password', async () => {
    mockConfig.authProvider = 'oidc';
    window.history.pushState({}, 'Login', '/login');

    renderWithProviders(<App />);

    expect(await screen.findByText('Deployment auth misconfigured')).toBeInTheDocument();
    expect(screen.getByText(/authProvider=password/i)).toBeInTheDocument();
  });

  it('renders protected content only after the API session probe succeeds', async () => {
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue(validSessionResponse());
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-system-status')).toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).toHaveBeenCalledTimes(1);
    expect(mockUseRealtime).toHaveBeenCalledWith({ enabled: true });
  });

  it('shows access denied when the API session exists but the backend rejects access', async () => {
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockRejectedValue(
      new ApiError(403, 'API Error: 403 Forbidden [requestId=req-1] - {"detail":"Forbidden"}')
    );
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Your account is not authorized')).toBeInTheDocument();
  });

  it('shows a signed-out message on the logout compatibility route', async () => {
    window.history.pushState({}, 'Logout Complete', '/auth/logout-complete');

    renderWithProviders(<App />);

    expect(await screen.findByText('Signed out')).toBeInTheDocument();
    expect(screen.getByText(/Signed out successfully/i)).toBeInTheDocument();
  });

  it('redirects the callback compatibility route back to /login', async () => {
    window.history.pushState({}, 'Callback', '/auth/callback');

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
  });
});
