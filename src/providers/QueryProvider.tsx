import React, { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { ApiError } from '@/services/apiService';

const NON_API_QUERY_RETRY_COUNT = 1;

function isApiError(error: unknown): error is ApiError {
  return (
    error instanceof Error &&
    error.name === 'ApiError' &&
    typeof (error as Partial<ApiError>).status === 'number'
  );
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isApiError(error)) {
    return false;
  }
  return failureCount < NON_API_QUERY_RETRY_COUNT;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      gcTime: 1000 * 60 * 5, // 5 minutes
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false
    }
  }
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
