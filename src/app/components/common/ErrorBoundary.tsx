import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/app/components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  onReload?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_LOAD_ERROR_PATTERNS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'chunkloaderror',
  'chunk load failed',
  'loading chunk'
] as const;

export function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;

  const errorText = `${error.name || ''} ${error.message || ''}`.toLowerCase();
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => errorText.includes(pattern));
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  handleReload = () => {
    if (this.props.onReload) {
      this.props.onReload();
      return;
    }

    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      if (isChunkLoadError(this.state.error)) {
        return (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <RefreshCw className="h-6 w-6 text-amber-700" />
              <span>New version available</span>
            </div>
            <p className="max-w-md text-center text-sm text-amber-800">
              This page was updated while your browser still had an older app bundle loaded. Reload
              the application to get the current version.
            </p>
            <Button
              variant="default"
              onClick={this.handleReload}
              className="bg-amber-700 text-white hover:bg-amber-800"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload Application
            </Button>
          </div>
        );
      }

      return (
        <div className="p-6 rounded-lg border border-red-200 bg-red-50 text-red-900 flex flex-col items-center justify-center gap-4 min-h-[200px]">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-6 w-6 text-red-600" />
            <span>Something went wrong</span>
          </div>
          <p className="text-sm text-red-700 max-w-md text-center">
            {this.state.error?.message ||
              'An unexpected error occurred while loading this section.'}
          </p>
          <Button
            variant="outline"
            onClick={this.handleReset}
            className="border-red-200 hover:bg-red-100 text-red-800"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
