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
    const provider = vi.fn(async () => 'oidc-token');
    setAccessTokenProvider(provider);

    const headers = await appendAuthHeaders();

    expect(headers.get('Authorization')).toBe('Bearer oidc-token');
    expect(provider).toHaveBeenCalledWith({});
  });

  it('does not overwrite an existing Authorization header', async () => {
    const provider = vi.fn(async () => 'oidc-token');
    setAccessTokenProvider(provider);

    const headers = await appendAuthHeaders({ Authorization: 'Bearer existing-token' });

    expect(headers.get('Authorization')).toBe('Bearer existing-token');
    expect(provider).not.toHaveBeenCalled();
  });

  it('returns the original headers when no access token is available', async () => {
    const provider = vi.fn(async () => null);
    setAccessTokenProvider(provider);

    const headers = await appendAuthHeaders({ 'X-Test': 'value' });

    expect(headers.get('X-Test')).toBe('value');
    expect(headers.has('Authorization')).toBe(false);
    expect(provider).toHaveBeenCalledWith({});
  });

  it('passes the forceRefresh option through to the access token provider', async () => {
    const provider = vi.fn(async () => 'fresh-token');
    setAccessTokenProvider(provider);

    const headers = await appendAuthHeaders(undefined, { forceRefresh: true });

    expect(headers.get('Authorization')).toBe('Bearer fresh-token');
    expect(provider).toHaveBeenCalledWith({ forceRefresh: true });
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
        source: 'access-token-provider',
        recoveryAttempt: 0
      })
    );
  });

  it('dedupes concurrent reauth notifications until the state is cleared', async () => {
    const handler = vi.fn();
    setInteractiveAuthHandler(handler);

    const results = await Promise.allSettled([
      requestInteractiveReauth({
        reason: 'API /system/status returned 401.',
        source: 'api:/system/status',
        endpoint: '/system/status',
        status: 401,
        requestId: 'req-1',
        recoveryAttempt: 1
      }),
      requestInteractiveReauth({
        reason: 'Realtime websocket authentication was rejected.',
        source: 'realtime-websocket',
        endpoint: '/ws/updates',
        status: 4401
      })
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/system/status',
        status: 401,
        requestId: 'req-1',
        recoveryAttempt: 1
      })
    );
  });

  it('throws when interactive reauth is requested without a registered handler', async () => {
    await expect(requestInteractiveReauth()).rejects.toThrow(
      'Interactive auth state handler is not registered.'
    );
  });
});
