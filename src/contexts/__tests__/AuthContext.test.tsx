import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '../AuthContext';
import { resetMsalSessionForTests } from '../msalSession';
import {
  AuthReauthRequiredError,
  requestInteractiveReauth,
  resetAuthTransportForTests
} from '@/services/authTransport';

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
      <div data-testid="interaction-reason">{auth.interactionReason ?? ''}</div>
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

    resetAuthTransportForTests();
    resetMsalSessionForTests();

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
    const { PublicClientApplication } = await import('@azure/msal-browser');

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

    expect(PublicClientApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          navigateToLoginRequestUrl: false
        })
      })
    );

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

  it('does not auto-redirect after a silent SSO interaction-required response', async () => {
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
      expect(screen.getByTestId('phase')).toHaveTextContent('signed-out');
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
      expect(screen.getByTestId('interaction-reason')).toHaveTextContent('');
      expect(mockMsal.loginRedirect).not.toHaveBeenCalled();
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

  it('switches into session-expired when background reauth is requested', async () => {
    const account = { username: 'analyst@example.com', name: 'Analyst' };
    mockConfig.authRequired = true;
    window.history.pushState({}, 'System Status', '/system-status');
    mockMsal.getAllAccounts.mockReturnValue([account]);

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('authenticated');
    });

    await act(async () => {
      await expect(
        requestInteractiveReauth({
          reason: 'API /system/status returned 401.',
          source: 'api:/system/status'
        })
      ).rejects.toBeInstanceOf(AuthReauthRequiredError);
    });

    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('session-expired');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('interaction-reason')).toHaveTextContent(
        'API /system/status returned 401.'
      );
      expect(mockMsal.loginRedirect).not.toHaveBeenCalled();
    });
  });

  it('dedupes bootstrap work across strict-mode remounts', async () => {
    mockConfig.authRequired = true;
    window.history.pushState({}, 'System Status', '/system-status');
    mockMsal.ssoSilent.mockImplementation(() => new Promise(() => {}));

    render(
      <React.StrictMode>
        <AuthProvider>
          <Harness />
        </AuthProvider>
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(mockMsal.handleRedirectPromise).toHaveBeenCalledTimes(1);
      expect(mockMsal.ssoSilent).toHaveBeenCalledTimes(1);
    });
  });
});
