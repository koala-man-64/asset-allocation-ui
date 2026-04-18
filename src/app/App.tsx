import { useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { QueryProvider } from '@/providers/QueryProvider';

import { useUIStore } from '@/stores/useUIStore';

import { ErrorBoundary } from '@/app/components/common/ErrorBoundary';
import { LeftNavigation } from '@/app/components/layout/LeftNavigation';
import {
  OidcAccessGate,
  OidcCallbackPage,
  OidcLogoutCompletePage
} from '@/app/components/auth/OidcAccessGate';
import { AppRoutes } from '@/app/routes';
import { Toaster } from '@/app/components/ui/sonner';

const ROUTE_INDICATOR_ACTIVE_MS = 280;
const ROUTE_INDICATOR_FADE_MS = 220;

function RouteTransitionIndicator() {
  const location = useLocation();
  const [phase, setPhase] = useState<'idle' | 'animating' | 'finishing'>('idle');
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    setPhase('animating');
    const finishTimer = window.setTimeout(() => setPhase('finishing'), ROUTE_INDICATOR_ACTIVE_MS);
    const hideTimer = window.setTimeout(
      () => setPhase('idle'),
      ROUTE_INDICATOR_ACTIVE_MS + ROUTE_INDICATOR_FADE_MS
    );

    return () => {
      window.clearTimeout(finishTimer);
      window.clearTimeout(hideTimer);
    };
  }, [location.pathname, location.search, location.hash]);

  const phaseClass =
    phase === 'idle'
      ? 'w-0 opacity-0'
      : phase === 'animating'
        ? 'w-[72%] opacity-100'
        : 'w-full opacity-0';

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-[3px]">
      <div
        data-testid="route-transition-indicator"
        data-state={phase}
        className={`h-full bg-gradient-to-r from-mcm-teal via-primary to-mcm-mustard transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none ${phaseClass}`}
      />
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-background">
      <RouteTransitionIndicator />
      <div className="flex-1 flex min-w-0 overflow-hidden">
        <LeftNavigation />

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="container mx-auto p-8 max-w-[1800px]">{children}</div>
        </main>
      </div>

      <Toaster />
    </div>
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
          <Route path="/auth/callback" element={<OidcCallbackPage />} />
          <Route path="/auth/logout-complete" element={<OidcLogoutCompletePage />} />
          <Route
            path="*"
            element={
              <AppShell>
                <ErrorBoundary>
                  <OidcAccessGate>
                    <AppRoutes />
                  </OidcAccessGate>
                </ErrorBoundary>
              </AppShell>
            }
          />
        </Routes>
      </QueryProvider>
    </AuthProvider>
  );
}
