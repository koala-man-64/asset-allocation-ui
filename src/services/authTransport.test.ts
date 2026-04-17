import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthRedirectStartedError,
  appendAuthHeaders,
  createInteractionRequiredError,
  requestInteractiveReauth,
  setAccessTokenProvider,
  setInteractiveAuthHandler
} from './authTransport';

describe('authTransport bearer auth support', () => {
  afterEach(() => {
    setAccessTokenProvider(null);
    setInteractiveAuthHandler(null);
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

  it('starts one interactive reauth flow when token acquisition requires interaction', async () => {
    const handler = vi.fn(async () => undefined);
    setInteractiveAuthHandler(handler);
    setAccessTokenProvider(async () => {
      throw createInteractionRequiredError('OIDC session refresh requires sign-in.');
    });

    await expect(appendAuthHeaders()).rejects.toBeInstanceOf(AuthRedirectStartedError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('throws when interactive reauth is requested without a registered handler', async () => {
    await expect(requestInteractiveReauth()).rejects.toThrow(
      'Interactive auth redirect handler is not registered.'
    );
  });
});
