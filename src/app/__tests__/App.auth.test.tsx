import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';
import { renderWithProviders } from '@/test/utils';
import { DataService } from '@/services/DataService';
import { ApiError } from '@/services/apiService';
import {
  consumeOidcRedirectAccessToken,
  disposeOidcClient,
  startOidcLogin
} from '@/services/oidcClient';

const mockUseRealtime = vi.hoisted(() => vi.fn());
const mockConfig = vi.hoisted(() => ({
  apiBaseUrl: '/api',
  authProvider: 'oidc' as 'password' | 'disabled' | 'oidc',
  authSessionMode: 'cookie' as 'cookie' | 'bearer',
  oidcEnabled: true,
  authRequired: true,
  uiAuthEnabled: true,
  oidcAuthority: 'https://login.microsoftonline.com/example',
  oidcClientId: 'spa-client-id',
  oidcScopes: ['api://asset-allocation-api/user_impersonation'] as string[],
  oidcRedirectUri: 'http://localhost:3000/auth/callback',
  oidcPostLogoutRedirectUri: 'http://localhost:3000/auth/logout-complete',
  oidcAudience: ['asset-allocation-api'] as string[]
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
const consumePostLogoutRestartPath = vi.hoisted(() => vi.fn(() => null));
const peekPostLoginRedirectPath = vi.hoisted(() => vi.fn(() => '/postgres-explorer?foo=1#bar'));

function validSessionResponse(requestId = 'req-1') {
  return {
    data: {
      authMode: 'oidc',
      subject: 'user-123',
      displayName: 'Ada Lovelace',
      username: 'ada@example.com',
      requiredRoles: [],
      grantedRoles: ['AssetAllocation.System.Read']
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

vi.mock('@/services/oidcClient', () => ({
  startOidcLogin: vi.fn(),
  consumeOidcRedirectAccessToken: vi.fn(),
  disposeOidcClient: vi.fn()
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    createOidcAuthSession: vi.fn(),
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

vi.mock('@/features/strategies/StrategyConfigPage', () => ({
  StrategyConfigPage: () => <div data-testid="mock-strategy-config">Mock Strategy Workbench</div>
}));

vi.mock('@/features/backtests/BacktestWorkspacePage', () => ({
  BacktestWorkspacePage: () => <div data-testid="mock-backtest-workspace">Mock Backtest Workspace</div>
}));

describe('App OIDC auth flow', () => {
  beforeEach(() => {
    mockConfig.authProvider = 'oidc';
    mockConfig.authSessionMode = 'cookie';
    mockConfig.oidcEnabled = true;
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
    mockAuth.checkSession.mockReset();
    mockAuth.checkSession.mockResolvedValue(validSessionResponse().data);
    mockAuth.signIn.mockReset();
    mockAuth.signOut.mockReset();
    mockAuth.signOutAndRestart.mockReset();
    consumePostLoginRedirectPath.mockReset();
    consumePostLoginRedirectPath.mockReturnValue('/system-status');
    consumePostLogoutRestartPath.mockReset();
    consumePostLogoutRestartPath.mockReturnValue(null);
    peekPostLoginRedirectPath.mockReset();
    peekPostLoginRedirectPath.mockReturnValue('/postgres-explorer?foo=1#bar');
    vi.mocked(startOidcLogin).mockReset();
    vi.mocked(startOidcLogin).mockResolvedValue(undefined);
    vi.mocked(consumeOidcRedirectAccessToken).mockReset();
    vi.mocked(consumeOidcRedirectAccessToken).mockResolvedValue('oidc-access-token');
    vi.mocked(disposeOidcClient).mockReset();
    vi.mocked(DataService.createOidcAuthSession).mockReset();
    vi.mocked(DataService.createOidcAuthSession).mockResolvedValue(validSessionResponse());
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

  it('auto-launches OIDC on /login after the session check returns 401', async () => {
    window.history.pushState(
      {},
      'Login',
      `/login?returnTo=${encodeURIComponent('/system-status')}`
    );

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(startOidcLogin).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Continue sign-in to complete authentication.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to sign in' })).toBeInTheDocument();
  });

  it('completes the callback bootstrap and navigates to the stored return path', async () => {
    window.history.pushState({}, 'Callback', '/auth/callback');

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(consumeOidcRedirectAccessToken).toHaveBeenCalledTimes(1);
      expect(DataService.createOidcAuthSession).toHaveBeenCalledWith('oidc-access-token');
      expect(mockAuth.checkSession).toHaveBeenCalledTimes(1);
      expect(disposeOidcClient).toHaveBeenCalledTimes(1);
      expect(window.location.pathname).toBe('/system-status');
    });
  });

  it('renders a misconfiguration screen when the runtime auth provider is disabled', async () => {
    mockConfig.authProvider = 'disabled';
    window.history.pushState({}, 'Login', '/login');

    renderWithProviders(<App />);

    expect(await screen.findByText('Deployment auth misconfigured')).toBeInTheDocument();
    expect(screen.getByText(/authProvider=disabled/i)).toBeInTheDocument();
  });

  it('renders protected content only after the API session probe succeeds', async () => {
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue(validSessionResponse());
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-system-status')).toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).toHaveBeenCalledTimes(1);
    expect(mockUseRealtime).toHaveBeenCalledWith({ enabled: true });
  });

  it('renders each clicked left-navigation route after protected session revalidation', async () => {
    const user = userEvent.setup();
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockResolvedValue(validSessionResponse());
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByTestId('mock-system-status')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Strategies', { selector: 'a' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/strategies');
      expect(screen.getByTestId('mock-strategy-config')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mock-system-status')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Backtests', { selector: 'a' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/backtests');
      expect(screen.getByTestId('mock-backtest-workspace')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mock-strategy-config')).not.toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).toHaveBeenCalledTimes(3);
  });

  it('shows access denied when the API session exists but the backend rejects access', async () => {
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockRejectedValue(
      new ApiError(403, 'API Error: 403 Forbidden [requestId=req-1] - {"detail":"Forbidden"}')
    );
    window.history.pushState({}, 'System Status', '/system-status');

    renderWithProviders(<App />);

    expect(await screen.findByText('Your account is not authorized')).toBeInTheDocument();
  });

  it('shows a signed-out message on the logout completion route', async () => {
    window.history.pushState({}, 'Logout Complete', '/auth/logout-complete');

    renderWithProviders(<App />);

    expect(await screen.findByText('Signed out')).toBeInTheDocument();
    expect(screen.getByText(/Signed out successfully/i)).toBeInTheDocument();
  });
});
