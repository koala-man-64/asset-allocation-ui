import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '../AuthContext';

const POST_LOGIN_PATH_STORAGE_KEY = 'asset-allocation.post-login-path';

const mockMsal = vi.hoisted(() => ({
  initialize: vi.fn(),
  handleRedirectPromise: vi.fn(),
  ssoSilent: vi.fn(),
  getActiveAccount: vi.fn(),
  getAllAccounts: vi.fn(),
  setActiveAccount: vi.fn(),
  acquireTokenSilent: vi.fn(),
  loginRedirect: vi.fn(),
  logoutRedirect: vi.fn()
}));

const mockConfig = vi.hoisted(() => ({
  oidcEnabled: true,
  authRequired: false,
  oidcClientId: 'spa-client-id',
  oidcAuthority: 'https://login.microsoftonline.com/tenant-id',
  oidcScopes: ['api://asset-allocation-api/user_impersonation'],
  oidcRedirectUri: 'https://asset-allocation.example.com/auth/callback',
  oidcPostLogoutRedirectUri: 'https://asset-allocation.example.com/auth/logout-complete'
}));

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@azure/msal-browser', () => ({
  InteractionRequiredAuthError: class InteractionRequiredAuthError extends Error {},
  PublicClientApplication: vi.fn(function PublicClientApplication() {
    return mockMsal;
  })
}));

function Harness() {
  const auth = useAuth();

  return (
    <div>
      <div data-testid="ready">{String(auth.ready)}</div>
      <div data-testid="phase">{auth.phase}</div>
      <div data-testid="busy">{String(auth.busy)}</div>
      <div data-testid="authenticated">{String(auth.authenticated)}</div>
      <div data-testid="error">{auth.error ?? ''}</div>
      <button onClick={() => auth.signIn('/system-status')}>Sign in</button>
      <button onClick={() => auth.signOut()}>Sign out</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    window.history.pushState({}, 'Home', '/');
    window.sessionStorage.clear();
    mockConfig.oidcEnabled = true;
    mockConfig.authRequired = false;
    mockConfig.oidcClientId = 'spa-client-id';
    mockConfig.oidcAuthority = 'https://login.microsoftonline.com/tenant-id';
    mockConfig.oidcScopes = ['api://asset-allocation-api/user_impersonation'];
    mockConfig.oidcRedirectUri = 'https://asset-allocation.example.com/auth/callback';
    mockConfig.oidcPostLogoutRedirectUri =
      'https://asset-allocation.example.com/auth/logout-complete';
    mockMsal.initialize.mockReset();
    mockMsal.handleRedirectPromise.mockReset();
    mockMsal.ssoSilent.mockReset();
    mockMsal.getActiveAccount.mockReset();
    mockMsal.getAllAccounts.mockReset();
    mockMsal.setActiveAccount.mockReset();
    mockMsal.acquireTokenSilent.mockReset();
    mockMsal.loginRedirect.mockReset();
    mockMsal.logoutRedirect.mockReset();

    mockMsal.initialize.mockResolvedValue(undefined);
    mockMsal.handleRedirectPromise.mockResolvedValue(null);
    mockMsal.ssoSilent.mockResolvedValue({ account: null });
    mockMsal.getActiveAccount.mockReturnValue(null);
    mockMsal.getAllAccounts.mockReturnValue([]);
    mockMsal.loginRedirect.mockResolvedValue(undefined);
    mockMsal.logoutRedirect.mockResolvedValue(undefined);
  });

  it('initializes msal before starting the redirect flow', async () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    expect(screen.getByTestId('phase')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('busy')).toHaveTextContent('false');

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('phase')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('busy')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByTestId('phase')).toHaveTextContent('redirecting');
    expect(screen.getByTestId('busy')).toHaveTextContent('true');

    await waitFor(() => {
      expect(mockMsal.initialize).toHaveBeenCalled();
      expect(mockMsal.loginRedirect).toHaveBeenCalledWith({
        scopes: ['api://asset-allocation-api/user_impersonation']
      });
    });
    expect(window.sessionStorage.getItem(POST_LOGIN_PATH_STORAGE_KEY)).toBe('/system-status');
  });

  it('surfaces redirect startup failures', async () => {
    mockMsal.loginRedirect.mockRejectedValueOnce(new Error('popup blocked'));

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByTestId('phase')).toHaveTextContent('redirecting');
    expect(screen.getByTestId('busy')).toHaveTextContent('true');

    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('signed-out');
      expect(screen.getByTestId('busy')).toHaveTextContent('false');
      expect(screen.getByTestId('error')).toHaveTextContent(
        'OIDC sign-in could not be started. popup blocked'
      );
    });
  });

  it('marks the callback bootstrap as redirecting before redirect handling resolves', () => {
    window.history.pushState({}, 'Callback', '/auth/callback');
    mockMsal.handleRedirectPromise.mockImplementation(() => new Promise(() => {}));

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    expect(screen.getByTestId('ready')).toHaveTextContent('false');
    expect(screen.getByTestId('phase')).toHaveTextContent('redirecting');
    expect(screen.getByTestId('busy')).toHaveTextContent('true');
  });

  it('marks sign-out as busy as soon as the redirect starts', async () => {
    const account = { username: 'analyst@example.com', name: 'Analyst' };
    mockMsal.getAllAccounts.mockReturnValue([account]);

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByTestId('phase')).toHaveTextContent('signing-out');
    expect(screen.getByTestId('busy')).toHaveTextContent('true');

    await waitFor(() => {
      expect(mockMsal.logoutRedirect).toHaveBeenCalledWith({
        account,
        postLogoutRedirectUri: 'https://asset-allocation.example.com/auth/logout-complete'
      });
    });
  });

  it('redirects automatically after a silent SSO interaction-required response', async () => {
    const { InteractionRequiredAuthError } = await import('@azure/msal-browser');
    mockConfig.authRequired = true;
    window.history.pushState({}, 'System Status', '/system-status');
    mockMsal.ssoSilent.mockRejectedValueOnce(new InteractionRequiredAuthError('interaction required'));

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mockMsal.ssoSilent).toHaveBeenCalledWith({
        scopes: ['api://asset-allocation-api/user_impersonation']
      });
      expect(mockMsal.loginRedirect).toHaveBeenCalledWith({
        scopes: ['api://asset-allocation-api/user_impersonation']
      });
      expect(screen.getByTestId('phase')).toHaveTextContent('redirecting');
    });
  });

  it('restores the session silently when ssoSilent returns an account', async () => {
    const account = { username: 'analyst@example.com', name: 'Analyst' };
    mockConfig.authRequired = true;
    window.history.pushState({}, 'System Status', '/system-status');
    mockMsal.ssoSilent.mockResolvedValueOnce({ account });

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mockMsal.ssoSilent).toHaveBeenCalledWith({
        scopes: ['api://asset-allocation-api/user_impersonation']
      });
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('phase')).toHaveTextContent('authenticated');
      expect(mockMsal.loginRedirect).not.toHaveBeenCalled();
    });
  });
});
