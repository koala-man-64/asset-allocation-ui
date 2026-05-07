import { describe, expect, it } from 'vitest';

import { normalizeApiBaseUrl, toWebSocketBaseUrl } from './apiBaseUrl';

describe('normalizeApiBaseUrl', () => {
  it('defaults to /api', () => {
    expect(normalizeApiBaseUrl(undefined)).toBe('/api');
    expect(normalizeApiBaseUrl('')).toBe('/api');
    expect(normalizeApiBaseUrl('   ')).toBe('/api');
  });

  it('adds /api to bare origin URLs', () => {
    expect(normalizeApiBaseUrl('http://localhost:9000')).toBe('http://localhost:9000/api');
    expect(normalizeApiBaseUrl('https://example.com')).toBe('https://example.com/api');
  });

  it('keeps explicit paths', () => {
    expect(normalizeApiBaseUrl('/api')).toBe('/api');
    expect(normalizeApiBaseUrl('/api/')).toBe('/api');
    expect(normalizeApiBaseUrl('http://localhost:9000/api')).toBe('http://localhost:9000/api');
  });

  it('coerces insecure remote API URLs to same-origin on HTTPS pages', () => {
    expect(
      normalizeApiBaseUrl('http://asset-allocation-api.example.com/api', '/api', {
        currentProtocol: 'https:'
      })
    ).toBe('/api');
  });

  it('preserves loopback HTTP API URLs for HTTPS local development', () => {
    expect(
      normalizeApiBaseUrl('http://127.0.0.1:9000/api', '/api', {
        currentProtocol: 'https:'
      })
    ).toBe('http://127.0.0.1:9000/api');
  });
});

describe('toWebSocketBaseUrl', () => {
  it('converts http(s) to ws(s)', () => {
    expect(toWebSocketBaseUrl('http://localhost:9000/api')).toBe('ws://localhost:9000/api');
    expect(toWebSocketBaseUrl('https://example.com/api')).toBe('wss://example.com/api');
  });

  it('leaves relative URLs unchanged', () => {
    expect(toWebSocketBaseUrl('/api')).toBe('/api');
  });
});
