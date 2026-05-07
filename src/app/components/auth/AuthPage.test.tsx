import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/apiService';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthPage } from '@/app/components/auth/AuthPage';
import { DataService } from '@/services/DataService';
import { startOidcLogin } from '@/services/oidcClient';

const mockConfig = vi.hoisted(() => ({
  apiBaseUrl: '/api',
  authProvider: 'oidc' as 'disabled' | 'oidc',
  authSessionMode: 'bearer' as 'bearer',
  oidcEnabled: true,
  authRequired: true,
  uiAuthEnabled: true,
  oidcAuthority: 'https://login.microsoftonline.com/example',
  oidcClientId: 'spa-client-id',
  oidcScopes: ['api://asset-allocation/user_impersonation'],
  oidcRedirectUri: 'https://ui.example.com/auth/callback',
  oidcPostLogoutRedirectUri: 'https://ui.example.com/auth/logout-complete',
  oidcAudience: [] as string[]
}));

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@/services/oidcClient', () => ({
  consumeOidcRedirectAccessToken: vi.fn(),
  disposeOidcClient: vi.fn(),
  getOidcAccessToken: vi.fn(),
  startOidcLogin: vi.fn(),
  startOidcLogout: vi.fn()
}));

vi.mock('@/services/DataService', () => ({
  DataService: {
    getAuthSessionStatusWithMeta: vi.fn()
  }
}));

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(startOidcLogin).mockResolvedValue(undefined);
    vi.mocked(DataService.getAuthSessionStatusWithMeta).mockRejectedValue(
      new ApiError(401, 'API Error: 401 Unauthorized')
    );
  });

  it('starts Microsoft Entra sign-in instead of showing password UI', async () => {
    render(
      <MemoryRouter initialEntries={['/login?returnTo=%2Fsystem-status']}>
        <AuthProvider>
          <AuthPage mode="login" />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(startOidcLogin).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByLabelText('Shared password')).not.toBeInTheDocument();
    expect(DataService.getAuthSessionStatusWithMeta).toHaveBeenCalled();
  });
});
