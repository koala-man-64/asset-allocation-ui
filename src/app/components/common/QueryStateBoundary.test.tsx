import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QueryStateBoundary } from './QueryStateBoundary';

describe('QueryStateBoundary', () => {
  it('renders a retryable error state before children', () => {
    const onRetry = vi.fn();

    render(
      <QueryStateBoundary
        error={new Error('orders failed')}
        errorTitle="Orders Unavailable"
        onRetry={onRetry}
      >
        <div>No open orders are currently staged for this account.</div>
      </QueryStateBoundary>
    );

    expect(screen.getByText('Orders Unavailable')).toBeInTheDocument();
    expect(screen.getByText('orders failed')).toBeInTheDocument();
    expect(
      screen.queryByText('No open orders are currently staged for this account.')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
