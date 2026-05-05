import { describe, expect, it } from 'vitest';
import { ApiError } from '@/services/apiService';
import { shouldRetryQuery } from '@/providers/QueryProvider';

describe('shouldRetryQuery', () => {
  it('does not retry API errors after apiService transport attempts are exhausted', () => {
    expect(shouldRetryQuery(0, new ApiError(500, 'API Error: 500 Server Error'))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(404, 'API Error: 404 Not Found'))).toBe(false);
  });

  it('preserves one retry for non-API failures', () => {
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetryQuery(1, new TypeError('Failed to fetch'))).toBe(false);
  });
});
