import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { QueryProvider } from '@/providers/QueryProvider';

import { useUIStore } from '@/stores/useUIStore';

import { ErrorBoundary } from '@/app/components/common/ErrorBoundary';
import { LeftNavigation } from '@/app/components/layout/LeftNavigation';
import { RouteTransitionIndicator } from '@/app/components/layout/RouteTransitionIndicator';
import { useNavigationClock } from '@/app/components/layout/useNavigationClock';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/app/components/ui/sidebar';
import { AuthPage } from '@/app/components/auth/AuthPage';
import { RequireSession } from '@/app/components/auth/RequireSession';
import { AppRoutes } from '@/app/routes';
import { DEFAULT_APP_ROUTE_PATH } from '@/app/routeRegistry';
import { Toaster } from '@/app/components/ui/sonner';

const APP_SCROLL_CONTAINER_SELECTOR = '[data-app-scroll-container="true"]';

function normalizeRoutePathname(pathname: string): string {
  const trimmed = String(pathname || '/').trim() || '/';
  if (trimmed === '/') {
    return '/';
  }
  return trimmed.replace(/\/+$/, '').toLowerCase() || '/';
}

function isScrollToImplemented(scrollTo: unknown): scrollTo is typeof window.scrollTo {
  if (typeof scrollTo !== 'function') {
    return false;
  }
  const maybeMock = scrollTo as typeof window.scrollTo & {
    _isMockFunction?: boolean;
    mock?: unknown;
  };
  if (maybeMock._isMockFunction || maybeMock.mock) {
    return true;
  }
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
    return false;
  }
  return !String(scrollTo).includes('notImplemented');
}

function resetRouteViewport(): void {
  if (isScrollToImplemented(window.scrollTo)) {
    try {
      window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
    } catch {
      try {
        window.scrollTo(0, 0);
      } catch {
        // Older browser shims can expose scrollTo without fully implementing it.
      }
    }
  }

  const scrollContainer = document.querySelector<HTMLElement>(APP_SCROLL_CONTAINER_SELECTOR);
  if (!scrollContainer) {
    return;
  }

  scrollContainer.scrollTop = 0;
  scrollContainer.scrollLeft = 0;
  try {
    scrollContainer.scrollTo({ left: 0, top: 0, behavior: 'auto' });
  } catch {
    // Direct scrollTop/scrollLeft assignment above is the fallback.
  }
}

function AppShell({ children }: { children: ReactNode }) {
  const centralClock = useNavigationClock();

  return (
    <SidebarProvider defaultOpen>
      <RouteTransitionIndicator />
      <div className="flex min-h-screen w-full overflow-hidden bg-background">
        <LeftNavigation />

        <SidebarInset className="h-screen min-w-0 overflow-hidden">
          <div className="hidden min-h-9 items-center justify-between gap-4 border-b border-border bg-[#10172b] px-3 text-xs text-muted-foreground md:flex">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex items-center gap-2 text-foreground">
                <span className="h-3 w-3 rounded-sm bg-primary shadow-[0_0_12px_rgba(0,224,96,0.55)]" />
                <span className="font-semibold">Asset Allocation Terminal</span>
              </div>
              <nav aria-label="Workspace mode" className="flex items-center gap-1">
                <span className="border-b-2 border-primary px-3 py-2 text-foreground">Apps</span>
                <span className="px-3 py-2">Trade</span>
                <span className="px-3 py-2">Position Graph</span>
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-4 font-mono">
              <span>SIM</span>
              <span>{centralClock.time}</span>
              <span className="flex items-center gap-1 text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Data
              </span>
            </div>
          </div>

          <div className="border-b border-border bg-[#10172b] px-3 py-2 md:hidden">
            <div className="flex items-center gap-3">
              <SidebarTrigger aria-label="Open navigation" />
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">
                  Asset Allocation
                </div>
                <div className="font-display text-base text-foreground">Terminal</div>
              </div>
            </div>
          </div>

          <div
            data-app-scroll-container="true"
            role="region"
            aria-label="Primary application content"
            tabIndex={0}
            className="min-w-0 flex-1 overflow-y-auto"
          >
            <div className="w-full px-2 py-2 sm:px-3 lg:px-4">{children}</div>
          </div>

          <div className="hidden min-h-8 items-center justify-between border-t border-border bg-[#080d1a] px-3 text-xs text-muted-foreground md:flex">
            <div className="flex items-center gap-4">
              <span>Open Positions 0</span>
              <span>Buying Power $0</span>
              <span>Open P/L $0</span>
            </div>
            <div className="flex items-center gap-3 font-mono">
              <span>{centralClock.tz}</span>
              <span>{centralClock.time}</span>
              <span className="text-primary">SIM DATA</span>
            </div>
          </div>
        </SidebarInset>
      </div>

      <Toaster />
    </SidebarProvider>
  );
}

function ProtectedRouteViewport() {
  const location = useLocation();
  const routeKey = normalizeRoutePathname(location.pathname);

  useEffect(() => {
    resetRouteViewport();
  }, [routeKey]);

  return (
    <ErrorBoundary key={routeKey}>
      <RequireSession>
        <AppRoutes />
      </RequireSession>
    </ErrorBoundary>
  );
}

export default function App() {
  const isDarkMode = useUIStore((s) => s.isDarkMode);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <AuthProvider>
      <QueryProvider>
        <Routes>
          <Route path="/" element={<Navigate to={DEFAULT_APP_ROUTE_PATH} replace />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/auth/callback" element={<AuthPage mode="callback" />} />
          <Route path="/auth/logout-complete" element={<AuthPage mode="logout-complete" />} />
          <Route
            path="*"
            element={
              <AppShell>
                <ProtectedRouteViewport />
              </AppShell>
            }
          />
        </Routes>
      </QueryProvider>
    </AuthProvider>
  );
}
