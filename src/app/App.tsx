import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { QueryProvider } from '@/providers/QueryProvider';

import { useUIStore } from '@/stores/useUIStore';

import { ErrorBoundary } from '@/app/components/common/ErrorBoundary';
import { LeftNavigation } from '@/app/components/layout/LeftNavigation';
import { RouteTransitionIndicator } from '@/app/components/layout/RouteTransitionIndicator';
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
  return (
    <SidebarProvider defaultOpen>
      <RouteTransitionIndicator />
      <div className="flex min-h-screen w-full bg-background">
        <LeftNavigation />

        <SidebarInset className="min-w-0 overflow-hidden">
          <div className="border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-center gap-3">
              <SidebarTrigger aria-label="Open navigation" />
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Asset Allocation
                </div>
                <div className="font-display text-lg text-foreground">Operations Desk</div>
              </div>
            </div>
          </div>

          <main data-app-scroll-container="true" className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </main>
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
