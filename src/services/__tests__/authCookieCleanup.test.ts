import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAssociatedAuthCookies } from '@/services/authCookieCleanup';

describe('clearAssociatedAuthCookies', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('expires known auth and CSRF cookies across host paths', () => {
    const cookieWrites: string[] = [];
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '',
      set: (value: string) => {
        cookieWrites.push(value);
      }
    });

    const attempts = clearAssociatedAuthCookies();

    expect(attempts).toBe(cookieWrites.length);
    expect(cookieWrites).toEqual(
      expect.arrayContaining([
        expect.stringContaining('__Host-aa_session=; Max-Age=0'),
        expect.stringContaining('__Host-aa_csrf=; Max-Age=0'),
        expect.stringContaining('aa_session_dev=; Max-Age=0'),
        expect.stringContaining('aa_csrf_dev=; Max-Age=0')
      ])
    );
    expect(cookieWrites).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Path=/'),
        expect.stringContaining('Path=/api')
      ])
    );
  });
});
