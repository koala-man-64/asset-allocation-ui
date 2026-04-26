import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { config } from '@/config';
import { Button } from '@/app/components/ui/button';
import { useRealtime } from '@/hooks/useRealtime';
import { ApiError } from '@/services/apiService';
import { DataService } from '@/services/DataService';
import { logUiDiagnostic } from '@/services/uiDiagnostics';

type SessionState = 'checking' | 'allowed' | 'forbidden' | 'error';

function currentRoute(location: ReturnType<typeof useLocation>): string {
  return `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
}

function loginPath(returnTo: string): string {
  const params = new URLSearchParams();
  params.set('returnTo', returnTo || '/');
  return `/login?${params.toString()}`;
}

function RealtimeEnabledContent({ children }: { children: ReactNode }) {
  useRealtime({ enabled: true });
  return <>{children}</>;
}

export function RequireSession({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const route = useMemo(() => currentRoute(location), [location]);
  const [state, setState] = useState<SessionState>(
    config.authRequired ? 'checking' : 'allowed'
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!config.authRequired) {
      setState('allowed');
      setErrorMessage('');
      return;
    }

    let cancelled = false;
    setState('checking');
    setErrorMessage('');

    DataService.getAuthSessionStatusWithMeta()
      .then((response) => {
        if (cancelled) {
          return;
        }
        logUiDiagnostic('AuthSession', 'protected-session-valid', {
          route,
          requestId: response.meta.requestId,
          authMode: response.data.authMode,
          subjectPresent: Boolean(response.data.subject)
        });
        setState('allowed');
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          logUiDiagnostic('AuthSession', 'protected-session-missing', {
            route,
            status: error.status
          });
          navigate(loginPath(route), { replace: true });
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          setState('forbidden');
          setErrorMessage(error.message);
          return;
        }
        setState('error');
        setErrorMessage(error instanceof Error ? error.message : String(error ?? 'Unknown error'));
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, retryToken, route]);

  if (state === 'allowed') {
    return <RealtimeEnabledContent>{children}</RealtimeEnabledContent>;
  }

  if (state === 'forbidden') {
    return (
      <section className="mx-auto max-w-3xl rounded-lg border border-destructive/30 bg-card p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-destructive">Access denied</p>
        <h1 className="mt-3 font-display text-3xl text-foreground">Your account is not authorized</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The backend accepted your login but denied access to this protected route.
        </p>
        {errorMessage ? <p className="mt-4 text-sm text-muted-foreground">{errorMessage}</p> : null}
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Session check failed
        </p>
        <h1 className="mt-3 font-display text-3xl text-foreground">Could not verify your session</h1>
        {errorMessage ? <p className="mt-3 text-sm text-muted-foreground">{errorMessage}</p> : null}
        <Button className="mt-5" onClick={() => setRetryToken((value) => value + 1)}>
          Retry
        </Button>
      </section>
    );
  }

  return null;
}
