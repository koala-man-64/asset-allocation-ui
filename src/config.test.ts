import { afterEach, describe, expect, it, vi } from 'vitest';

describe('config auth overrides', () => {
  afterEach(() => {
    delete window.__API_UI_CONFIG__;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('forces browser auth off when the runtime UI auth toggle is disabled', async () => {
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      oidcAuthority: 'https://login.microsoftonline.com/example',
      oidcClientId: 'spa-client-id',
      oidcRedirectUri: 'https://asset-allocation.example.com/auth/callback',
      oidcPostLogoutRedirectUri: 'https://asset-allocation.example.com/auth/logout-complete',
      oidcScopes: ['api://asset-allocation-api/user_impersonation'],
      oidcEnabled: true,
      authRequired: true,
      uiAuthEnabled: false
    };

    const { config } = await import('./config');

    expect(config.uiAuthEnabled).toBe(false);
    expect(config.oidcEnabled).toBe(false);
    expect(config.authRequired).toBe(false);
    expect(config.oidcPostLogoutRedirectUri).toBe(
      'https://asset-allocation.example.com/auth/logout-complete'
    );
  });

  it('allows Vite env to disable browser auth before runtime config is provided', async () => {
    vi.stubEnv('VITE_UI_AUTH_ENABLED', 'false');
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      oidcEnabled: true,
      authRequired: true
    };

    const { config } = await import('./config');

    expect(config.uiAuthEnabled).toBe(false);
    expect(config.oidcEnabled).toBe(false);
    expect(config.authRequired).toBe(false);
  });

  it('derives the logout-complete URI when runtime config only provides the callback URI', async () => {
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      oidcEnabled: true,
      authRequired: true,
      oidcRedirectUri: 'https://asset-allocation.example.com/auth/callback'
    };

    const { config } = await import('./config');

    expect(config.oidcPostLogoutRedirectUri).toBe(
      'https://asset-allocation.example.com/auth/logout-complete'
    );
  });

  it('uses the UI auth toggle as the authRequired fallback when the bootstrap omits authRequired', async () => {
    vi.stubEnv('VITE_UI_AUTH_ENABLED', 'true');
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      oidcAuthority: 'https://login.microsoftonline.com/example',
      oidcClientId: 'spa-client-id',
      oidcRedirectUri: 'https://asset-allocation.example.com/auth/callback',
      oidcScopes: ['api://asset-allocation-api/user_impersonation']
    };

    const { config } = await import('./config');

    expect(config.uiAuthEnabled).toBe(true);
    expect(config.authRequired).toBe(true);
    expect(config.oidcEnabled).toBe(true);
  });

  it('derives the callback URI from the local origin when Vite env provides OIDC config', async () => {
    vi.stubEnv('VITE_UI_AUTH_ENABLED', 'true');
    vi.stubEnv('VITE_OIDC_AUTHORITY', 'https://login.microsoftonline.com/example');
    vi.stubEnv('VITE_OIDC_CLIENT_ID', 'spa-client-id');
    vi.stubEnv('VITE_OIDC_SCOPES', 'api://asset-allocation-api/user_impersonation openid profile');
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api'
    };

    const { config } = await import('./config');

    expect(config.oidcRedirectUri).toBe(
      new URL('/auth/callback', window.location.origin).toString()
    );
    expect(config.oidcPostLogoutRedirectUri).toBe(
      new URL('/auth/logout-complete', window.location.origin).toString()
    );
    expect(config.oidcEnabled).toBe(true);
  });

  it('reads oidcAudience from the Vite env fallback when the bootstrap omits it', async () => {
    vi.stubEnv('VITE_OIDC_AUDIENCE', 'api://asset-allocation-api');
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api'
    };

    const { config } = await import('./config');

    expect(config.oidcAudience).toEqual(['api://asset-allocation-api']);
  });

  it('defaults authSessionMode to bearer and accepts the runtime cookie mode', async () => {
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      authSessionMode: 'cookie'
    };

    const { config } = await import('./config');

    expect(config.authSessionMode).toBe('cookie');
  });

  it('falls back to bearer for unknown authSessionMode values', async () => {
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      authSessionMode: 'local-storage'
    };

    const { config } = await import('./config');

    expect(config.authSessionMode).toBe('bearer');
  });
});
