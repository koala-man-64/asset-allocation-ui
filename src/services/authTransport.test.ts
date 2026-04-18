import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthReauthRequiredError,
  appendAuthHeaders,
  createInteractionRequiredError,
  requestInteractiveReauth,
  resetAuthTransportForTests,
  setAccessTokenProvider,
  setInteractiveAuthHandler
} from './authTransport';

describe('authTransport bearer auth support', () => {
  afterEach(() => {
    resetAuthTransportForTests();
  });

  it('appends the access token to outgoing headers', async () => {
    setAccessTokenProvider(async () => 'oidc-token');

    const headers = await appendAuthHeaders();

    expect(headers.get('Authorization')).toBe('Bearer oidc-token');
  });

  it('does not overwrite an existing Authorization header', async () => {
    setAccessTokenProvider(async () => 'oidc-token');

    const headers = await appendAuthHeaders({ Authorization: 'Bearer existing-token' });

    expect(headers.get('Authorization')).toBe('Bearer existing-token');
  });

  it('returns the original headers when no access token is available', async () => {
    setAccessTokenProvider(async () => null);

    const headers = await appendAuthHeaders({ 'X-Test': 'value' });

    expect(headers.get('X-Test')).toBe('value');
    expect(headers.has('Authorization')).toBe(false);
  });

  it('raises one reauth-required signal when token acquisition requires interaction', async () => {
    const handler = vi.fn();
    setInteractiveAuthHandler(handler);
    setAccessTokenProvider(async () => {
      throw createInteractionRequiredError('OIDC session refresh requires sign-in.');
    });

    await expect(appendAuthHeaders()).rejects.toBeInstanceOf(AuthReauthRequiredError);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'OIDC session refresh requires sign-in.',
        source: 'access-token-provider'
      })
    );
  });

  it('dedupes concurrent reauth notifications until the state is cleared', async () => {
    const handler = vi.fn();
    setInteractiveAuthHandler(handler);

    const results = await Promise.allSettled([
      requestInteractiveReauth({ reason: 'API /system/status returned 401.', source: 'api:/system/status' }),
      requestInteractiveReauth({
        reason: 'Realtime websocket authentication was rejected.',
        source: 'realtime-websocket'
      })
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('throws when interactive reauth is requested without a registered handler', async () => {
    await expect(requestInteractiveReauth()).rejects.toThrow(
      'Interactive auth state handler is not registered.'
    );
  });
});
