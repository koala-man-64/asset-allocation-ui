import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const AUTH_ENV_KEYS = [
  'VITE_UI_AUTH_ENABLED',
  'VITE_UI_AUTH_PROVIDER',
  'VITE_AUTH_SESSION_MODE',
  'VITE_OIDC_AUTHORITY',
  'VITE_OIDC_CLIENT_ID',
  'VITE_OIDC_SCOPES',
  'VITE_OIDC_AUDIENCE',
  'VITE_OIDC_REDIRECT_URI',
  'VITE_OIDC_POST_LOGOUT_REDIRECT_URI'
] as const;

describe('config auth resolution', () => {
  beforeEach(() => {
    delete window.__API_UI_CONFIG__;
    vi.resetModules();
    for (const key of AUTH_ENV_KEYS) {
      vi.stubEnv(key, '');
    }
  });

  afterEach(() => {
    delete window.__API_UI_CONFIG__;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('fails closed when UI auth is enabled without a valid provider configuration', async () => {
    window.__API_UI_CONFIG__ = {
      apiBaseUrl: '/api',
      uiAuthEnabled: true
    };

    const { config } = await import('./config');

    expect(config.authProvider).toBe('disabled');
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
      authSessionMode: 'cookie',
      uiAuthEnabled: true,
      authRequired: true,
      oidcAuthority: 'https://login.microsoftonline.com/example',
      oidcClientId: 'spa-client-id',
      oidcScopes: ['api://asset-allocation-api/user_impersonation']
    };

    const { config } = await import('./config');

    expect(config.authProvider).toBe('oidc');
    expect(config.authSessionMode).toBe('cookie');
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
