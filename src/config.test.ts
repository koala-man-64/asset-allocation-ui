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
      oidcScopes: ['api://asset-allocation-api/user_impersonation'],
      oidcEnabled: true,
      authRequired: true,
      uiAuthEnabled: false
    };

    const { config } = await import('./config');

    expect(config.uiAuthEnabled).toBe(false);
    expect(config.oidcEnabled).toBe(false);
    expect(config.authRequired).toBe(false);
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
});
