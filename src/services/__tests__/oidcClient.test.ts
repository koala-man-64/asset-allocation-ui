import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdMsalConfigurations = vi.hoisted(() => [] as unknown[]);
const loginRedirectMock = vi.hoisted(() => vi.fn());

const mockConfig = vi.hoisted(() => ({
  authProvider: 'oidc' as const,
  authRequired: true,
  authSessionMode: 'cookie' as const,
  oidcAudience: [] as string[],
  oidcAuthority: 'https://login.microsoftonline.com/example',
  oidcClientId: 'spa-client-id',
  oidcEnabled: true,
  oidcPostLogoutRedirectUri: 'http://localhost:3000/auth/logout-complete',
  oidcRedirectUri: 'http://localhost:3000/auth/callback',
  oidcScopes: ['api://asset-allocation-api/user_impersonation'],
  uiAuthEnabled: true
}));

vi.mock('@/config', () => ({
  config: mockConfig
}));

vi.mock('@azure/msal-browser', () => ({
  BrowserCacheLocation: {
    LocalStorage: 'localStorage',
    MemoryStorage: 'memoryStorage',
    SessionStorage: 'sessionStorage'
  },
  LogLevel: {
    Error: 3,
    Warning: 2
  },
  PublicClientApplication: class {
    getActiveAccount = vi.fn(() => null);
    getAllAccounts = vi.fn(() => []);
    handleRedirectPromise = vi.fn();
    initialize = vi.fn(() => Promise.resolve());
    loginRedirect = loginRedirectMock;
    logoutRedirect = vi.fn();
    setActiveAccount = vi.fn();

    constructor(msalConfiguration: unknown) {
      createdMsalConfigurations.push(msalConfiguration);
    }
  }
}));

describe('oidcClient', () => {
  beforeEach(async () => {
    const { disposeOidcClient } = await import('@/services/oidcClient');

    disposeOidcClient();
    createdMsalConfigurations.length = 0;
    loginRedirectMock.mockReset();
    loginRedirectMock.mockResolvedValue(undefined);
  });

  it('uses redirect-compatible session storage for MSAL cache state', async () => {
    const { startOidcLogin } = await import('@/services/oidcClient');

    await startOidcLogin();

    const msalConfiguration = createdMsalConfigurations[0] as {
      cache?: { cacheLocation?: unknown };
    };
    expect(msalConfiguration.cache?.cacheLocation).toBe('sessionStorage');
    expect(loginRedirectMock).toHaveBeenCalledWith({
      redirectUri: mockConfig.oidcRedirectUri,
      scopes: mockConfig.oidcScopes
    });
  });
});
