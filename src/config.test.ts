import { afterEach, describe, expect, it, vi } from 'vitest';

describe('config auth resolution', () => {
  afterEach(() => {
    delete window.__API_UI_CONFIG__;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to password auth when UI auth is enabled without OIDC settings', async () => {
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      uiAuthEnabled: true
    };

    const { config } = await import('./config');

    expect(config.authProvider).toBe('password');
    expect(config.authSessionMode).toBe('cookie');
    expect(config.authRequired).toBe(true);
    expect(config.oidcEnabled).toBe(false);
  });

  it('forces auth off when the runtime UI auth toggle is disabled', async () => {
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      authProvider: 'password',
      authSessionMode: 'cookie',
      uiAuthEnabled: false,
      authRequired: true
    };

    const { config } = await import('./config');

    expect(config.uiAuthEnabled).toBe(false);
    expect(config.authProvider).toBe('disabled');
    expect(config.authRequired).toBe(false);
  });

  it('accepts an explicit password provider and forces cookie mode', async () => {
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      authProvider: 'password',
      authSessionMode: 'bearer',
      uiAuthEnabled: true,
      authRequired: true
    };

    const { config } = await import('./config');

    expect(config.authProvider).toBe('password');
    expect(config.authSessionMode).toBe('cookie');
  });

  it('keeps oidc runtime settings when the provider is explicitly oidc', async () => {
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      authProvider: 'oidc',
      authSessionMode: 'bearer',
      uiAuthEnabled: true,
      authRequired: true,
      oidcAuthority: 'https://login.microsoftonline.com/example',
      oidcClientId: 'spa-client-id',
      oidcScopes: ['api://asset-allocation-api/user_impersonation']
    };

    const { config } = await import('./config');

    expect(config.authProvider).toBe('oidc');
    expect(config.authSessionMode).toBe('bearer');
    expect(config.oidcEnabled).toBe(true);
    expect(config.oidcRedirectUri).toBe(
      new URL('/auth/callback', window.location.origin).toString()
    );
  });

  it('falls back to disabled when auth is off even if Vite advertises a provider', async () => {
    vi.stubEnv('VITE_UI_AUTH_ENABLED', 'false');
    vi.stubEnv('VITE_UI_AUTH_PROVIDER', 'password');
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api'
    };

    const { config } = await import('./config');

    expect(config.authProvider).toBe('disabled');
    expect(config.authRequired).toBe(false);
  });
});
