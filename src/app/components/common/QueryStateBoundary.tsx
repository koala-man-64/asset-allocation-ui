import type { ReactNode } from 'react';

import { Button } from '@/app/components/ui/button';
import { PageLoader } from './PageLoader';
import { StatePanel } from './StatePanel';

interface QueryStateBoundaryProps {
  isLoading?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  loadingText?: string;
  loadingClassName?: string;
  errorTitle?: ReactNode;
  errorMessage?: ReactNode | ((error: unknown) => ReactNode);
  emptyTitle?: ReactNode;
  emptyMessage?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}

function defaultErrorMessage(error: unknown): ReactNode {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'The requested data could not be loaded.';
}

export function QueryStateBoundary({
  isLoading = false,
  error,
  isEmpty = false,
  loadingText = 'Loading...',
  loadingClassName,
  errorTitle = 'Data Unavailable',
  errorMessage,
  emptyTitle = 'No Data',
  emptyMessage = 'No records were returned.',
  onRetry,
  children
}: QueryStateBoundaryProps) {
  if (isLoading) {
    return <PageLoader variant="panel" text={loadingText} className={loadingClassName} />;
  }

  if (error) {
    const message =
      typeof errorMessage === 'function'
        ? errorMessage(error)
        : errorMessage !== undefined
          ? errorMessage
          : defaultErrorMessage(error);

    return (
      <StatePanel
        tone="error"
        title={errorTitle}
        message={message}
        action={
          onRetry ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (isEmpty) {
    return <StatePanel tone="empty" title={emptyTitle} message={emptyMessage} />;
  }

  return <>{children}</>;
}
