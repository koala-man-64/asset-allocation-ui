import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '../AuthContext';

const mockConfig = vi.hoisted(() => ({
  authProvider: 'password' as 'password' | 'disabled' | 'oidc',
  authSessionMode: 'cookie' as 'cookie' | 'bearer',
  authRequired: true,
  uiAuthEnabled: true,
  oidcEnabled: false,
  apiBaseUrl: '/api',
  oidcAuthority: '',
  oidcClientId: '',
  oidcScopes: [] as string[],
  oidcRedirectUri: '',
  oidcPostLogoutRedirectUri: '',
  oidcAudience: [] as string[]
}));

const mockDataService = vi.hoisted(() => ({
  createPasswordAuthSession: vi.fn(),
  deleteAuthSession: vi.fn(),
  getAuthSessionStatusWithMeta: vi.fn()
}));

const mockStartOidcLogout = vi.hoisted(() => vi.fn());

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@/services/DataService', () => ({
  DataService: mockDataService
}));

vi.mock('@/services/oidcClient', () => ({
  startOidcLogout: mockStartOidcLogout
}));

function Harness() {
  const auth = useAuth();

  return (
    <div>
      <div data-testid="ready">{String(auth.ready)}</div>
      <div data-testid="phase">{auth.phase}</div>
      <div data-testid="busy">{String(auth.busy)}</div>
      <div data-testid="authenticated">{String(auth.authenticated)}</div>
      <div data-testid="user-label">{auth.userLabel ?? ''}</div>
      <div data-testid="error">{auth.error ?? ''}</div>
      <button onClick={() => void auth.login('shared-password').catch(() => undefined)}>Log in</button>
      <button onClick={() => auth.signIn('/system-status')}>Open login</button>
      <button onClick={() => auth.signOut()}>Sign out</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    window.history.pushState({}, 'Home', '/');
    window.sessionStorage.clear();
    mockConfig.authProvider = 'password';
    mockConfig.authSessionMode = 'cookie';
    mockConfig.authRequired = true;
    mockConfig.uiAuthEnabled = true;
    mockConfig.oidcEnabled = false;
    mockStartOidcLogout.mockReset();
    mockDataService.createPasswordAuthSession.mockReset();
    mockDataService.deleteAuthSession.mockReset();
    mockDataService.getAuthSessionStatusWithMeta.mockReset();
    mockDataService.createPasswordAuthSession.mockResolvedValue({
      data: {
        authMode: 'password',
        subject: 'shared-password',
        displayName: 'Shared Operator',
        username: 'shared',
        requiredRoles: [],
        grantedRoles: []
      },
      meta: {
        requestId: 'req-1',
        status: 200,
        durationMs: 12,
        url: '/api/auth/session'
      }
    });
    mockDataService.deleteAuthSession.mockResolvedValue({});
  });

  function renderHarness() {
    return render(
      <BrowserRouter>
        <AuthProvider>
          <Harness />
        </AuthProvider>
      </BrowserRouter>
    );
  }

  it('starts ready and signed out in password mode', async () => {
    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('phase')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('authenticates after a successful password login', async () => {
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      expect(mockDataService.createPasswordAuthSession).toHaveBeenCalledWith('shared-password');
      expect(screen.getByTestId('phase')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('user-label')).toHaveTextContent('Shared Operator');
    });
  });

  it('surfaces password login failures', async () => {
    mockDataService.createPasswordAuthSession.mockRejectedValueOnce(new Error('Invalid password'));

    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      expect(screen.getByTestId('phase')).toHaveTextContent('signed-out');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('error')).toHaveTextContent('Invalid password');
    });
  });

  it('navigates to the centralized login route when signIn is requested', async () => {
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Open login' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/system-status');
  });

  it('clears the cookie session and returns to the login page on sign-out', async () => {
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(mockDataService.deleteAuthSession).toHaveBeenCalledTimes(1);
      expect(window.location.pathname).toBe('/login');
      expect(new URLSearchParams(window.location.search).get('loggedOut')).toBe('1');
    });
  });
});
