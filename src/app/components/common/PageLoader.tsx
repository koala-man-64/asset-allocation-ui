import React from 'react';

import { cn } from '@/app/components/ui/utils';

interface PageLoaderProps {
  /**
   * Optional text to display below the spinner.
   * Defaults to "Loading..." if not provided, or can be set to null/empty to hide.
   */
  text?: string | null;
  /**
   * Optional className to override or extend the container styling.
   */
  className?: string;
  /**
   * Controls the loader footprint.
   */
  variant?: 'page' | 'panel' | 'inline';
}

const variantClassNames = {
  page: 'min-h-[calc(100vh-100px)] w-full',
  panel: 'min-h-[14rem] w-full rounded-sm border border-border bg-card',
  inline: 'min-h-[7rem] w-full'
} as const;

export function PageLoader({ text = 'Loading...', className, variant = 'page' }: PageLoaderProps) {
  return (
    <div
      className={cn('flex items-center justify-center', variantClassNames[variant], className)}
      data-testid="page-loader"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border border-border border-b-primary" />
        {text && (
          <p className="text-muted-foreground text-xs font-mono uppercase animate-pulse">{text}</p>
        )}
      </div>
    </div>
  );
}
