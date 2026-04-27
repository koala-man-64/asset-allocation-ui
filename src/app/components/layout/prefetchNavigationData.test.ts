import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prefetchNavigationData } from './prefetchNavigationData';

const mockConfig = vi.hoisted(() => ({
  authRequired: true
}));

vi.mock('@/config', () => ({
  config: mockConfig
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
}

describe('prefetchNavigationData', () => {
  beforeEach(() => {
    mockConfig.authRequired = true;
  });

  it('does not prefetch protected navigation data when auth is required', () => {
    const queryClient = createQueryClient();
    const prefetchSpy = vi.spyOn(queryClient, 'prefetchQuery');

    prefetchNavigationData(queryClient, '/system-status');
    prefetchNavigationData(queryClient, '/data-quality');

    expect(prefetchSpy).not.toHaveBeenCalled();
  });

  it('prefetches route data for local unauthenticated runtimes', () => {
    mockConfig.authRequired = false;
    const queryClient = createQueryClient();
    const prefetchSpy = vi
      .spyOn(queryClient, 'prefetchQuery')
      .mockImplementation(() => Promise.resolve());

    prefetchNavigationData(queryClient, '/system-status');

    expect(prefetchSpy).toHaveBeenCalledTimes(1);
  });
});
