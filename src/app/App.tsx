import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { QueryProvider } from '@/providers/QueryProvider';

import { useUIStore } from '@/stores/useUIStore';

import { ErrorBoundary } from '@/app/components/common/ErrorBoundary';
import { LeftNavigation } from '@/app/components/layout/LeftNavigation';
import { RouteTransitionIndicator } from '@/app/components/layout/RouteTransitionIndicator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/app/components/ui/sidebar';
import {
  OidcAccessGate,
  OidcCallbackPage,
  OidcLogoutCompletePage
} from '@/app/components/auth/OidcAccessGate';
import { AppRoutes } from '@/app/routes';
import { Toaster } from '@/app/components/ui/sonner';

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

          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </main>
        </SidebarInset>
      </div>

      <Toaster />
    </SidebarProvider>
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
