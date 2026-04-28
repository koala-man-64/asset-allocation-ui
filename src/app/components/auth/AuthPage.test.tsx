import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/apiService';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthPage } from '@/app/components/auth/AuthPage';
import { DataService } from '@/services/DataService';

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

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@/services/oidcClient', () => ({
  consumeOidcRedirectAccessToken: vi.fn(),
  disposeOidcClient: vi.fn(),
  startOidcLogin: vi.fn(),
  startOidcLogout: vi.fn()
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    createOidcAuthSession: vi.fn(),
    createPasswordAuthSession: vi.fn(),
    deleteAuthSession: vi.fn(),
    getAuthSessionStatusWithMeta: vi.fn()
  }
}));

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.authProvider = 'password';
    mockConfig.authRequired = true;
    mockConfig.uiAuthEnabled = true;
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockImplementation(
      () =>
        new Promise((_, reject) => {
          window.setTimeout(() => {
            reject(new ApiError(401, 'API Error: 401 Unauthorized'));
          }, 0);
        })
    );
  });

  it('shows password sign-in after the initial session probe returns 401', async () => {
    render(
      <MemoryRouter initialEntries={['/login?returnTo=%2Fsystem-status']}>
        <AuthProvider>
          <AuthPage mode="login" />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Shared password')).toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).toHaveBeenCalled();
  });
});
