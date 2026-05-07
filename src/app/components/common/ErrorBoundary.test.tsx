import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary, isChunkLoadError } from './ErrorBoundary';

function ThrowError({ error }: { error: Error }): never {
  throw error;
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('detects dynamic import chunk load failures', () => {
    expect(
      isChunkLoadError(
        new TypeError(
          'Failed to fetch dynamically imported module: https://example.test/assets/StrategyConfigPage-old.js'
        )
      )
    ).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 42 failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('API request failed'))).toBe(false);
  });

  it('renders a reload recovery state for stale dynamic imports', () => {
    const onReload = vi.fn();

    render(
      <ErrorBoundary onReload={onReload}>
        <ThrowError
          error={
            new TypeError(
              'Failed to fetch dynamically imported module: https://example.test/assets/StrategyConfigPage-old.js'
            )
          }
        />
      </ErrorBoundary>
    );

    expect(screen.getByText('New version available')).toBeInTheDocument();
    expect(
      screen.getByText(/your browser still had an older app bundle loaded/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reload application/i }));

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('keeps the generic fallback for non-chunk errors', () => {
    render(
      <ErrorBoundary>
        <ThrowError error={new Error('chart rendering failed')} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('chart rendering failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
