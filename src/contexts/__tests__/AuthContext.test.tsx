import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '../AuthContext';

const mockConfig = vi.hoisted(() => ({
  authProvider: 'oidc' as 'disabled' | 'oidc',
  authSessionMode: 'bearer' as 'bearer',
  authRequired: true,
  uiAuthEnabled: true,
  oidcEnabled: true,
  apiBaseUrl: '/api',
  oidcAuthority: 'https://login.microsoftonline.com/example',
  oidcClientId: 'spa-client-id',
  oidcScopes: ['api://asset-allocation/user_impersonation'],
  oidcRedirectUri: 'https://ui.example.com/auth/callback',
  oidcPostLogoutRedirectUri: 'https://ui.example.com/auth/logout-complete',
  oidcAudience: [] as string[]
}));

const mockDataService = vi.hoisted(() => ({
  getAuthSessionStatusWithMeta: vi.fn()
}));

const mockGetOidcAccessToken = vi.hoisted(() => vi.fn());
const mockStartOidcLogout = vi.hoisted(() => vi.fn());

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@/services/DataService', () => ({
  DataService: mockDataService
}));

vi.mock('@/services/oidcClient', () => ({
  getOidcAccessToken: mockGetOidcAccessToken,
  startOidcLogout: mockStartOidcLogout
}));

function Harness() {
  const auth = useAuth();

  return (
    <div>
      <div data-testid="ready">{String(auth.ready)}</div>
      <div data-testid="phase">{auth.phase}</div>
      <div data-testid="authenticated">{String(auth.authenticated)}</div>
      <div data-testid="user-label">{auth.userLabel ?? ''}</div>
      <button onClick={() => void auth.checkSession()}>Check session</button>
      <button onClick={() => void auth.getAccessToken()}>Get token</button>
      <button onClick={() => auth.signIn('/system-status')}>Open login</button>
      <button onClick={() => auth.signOut()}>Sign out</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    window.history.pushState({}, 'Home', '/');
    window.sessionStorage.clear();
    mockStartOidcLogout.mockReset();
    mockGetOidcAccessToken.mockReset();
    mockGetOidcAccessToken.mockResolvedValue('access-token');
    mockDataService.getAuthSessionStatusWithMeta.mockReset();
    mockDataService.getAuthSessionStatusWithMeta.mockResolvedValue({
      data: {
        authMode: 'oidc',
        subject: 'user-123',
        displayName: 'Ada Lovelace',
        username: 'ada@example.com',
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

  it('starts ready and signed out when OIDC auth is required', async () => {
    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('phase')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
  });

  it('marks the session authenticated after bearer-backed session validation', async () => {
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Check session' }));

    await waitFor(() => {
      expect(mockDataService.getAuthSessionStatusWithMeta).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('phase')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('user-label')).toHaveTextContent('Ada Lovelace');
    });
  });

  it('exposes silent OIDC access token acquisition to callers', async () => {
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Get token' }));

    await waitFor(() => {
      expect(mockGetOidcAccessToken).toHaveBeenCalledTimes(1);
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

  it('starts OIDC logout directly without deleting backend cookies', async () => {
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(mockStartOidcLogout).toHaveBeenCalledTimes(1);
    });
  });
});
