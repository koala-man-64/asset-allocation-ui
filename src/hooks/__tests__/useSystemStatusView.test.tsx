import React from 'react';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSystemStatusViewQuery } from '@/hooks/useSystemStatusView';
import { DataService } from '@/services/DataService';
import { ApiError } from '@/services/apiService';
import { renderWithProviders } from '@/test/utils';

function Probe() {
  useSystemStatusViewQuery();
  return null;
}

describe('useSystemStatusViewQuery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not retry unauthorized failures', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const getSystemStatusViewSpy = vi
      .spyOn(DataService, 'getSystemStatusViewResult')
      .mockRejectedValue(new ApiError(401, 'API Error: 401 Unauthorized'));

    renderWithProviders(<Probe />);

    await Promise.all([
      waitFor(() => {
        expect(getSystemStatusViewSpy).toHaveBeenCalledTimes(1);
      }),
      vi.advanceTimersByTimeAsync(1000)
    ]);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(getSystemStatusViewSpy).toHaveBeenCalledTimes(1);
  });
});
