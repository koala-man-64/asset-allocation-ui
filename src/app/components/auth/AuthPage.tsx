import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/app/components/ui/button';
import { config } from '@/config';
import {
  consumePostLoginRedirectPath,
  consumePostLogoutRestartPath,
  peekPostLoginRedirectPath,
  useAuth
} from '@/contexts/AuthContext';
import { ApiError } from '@/services/apiService';
import { DataService } from '@/services/DataService';
import { logUiDiagnostic } from '@/services/uiDiagnostics';

export type AuthPageMode = 'login' | 'callback' | 'logout-complete';

type AuthPageState =
  | 'checking-session'
  | 'starting-oidc'
  | 'exchanging-session'
  | 'signed-out'
  | 'access-denied'
  | 'misconfigured'
  | 'error';

function sanitizeReturnTo(value: string | null): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/system-status';
  }
  if (
    trimmed === '/login' ||
    trimmed.startsWith('/login?') ||
    trimmed === '/auth/callback' ||
    trimmed.startsWith('/auth/callback?') ||
    trimmed === '/auth/logout-complete'
  ) {
    return '/system-status';
  }
  return trimmed;
}

function getReturnTo(location: ReturnType<typeof useLocation>, mode: AuthPageMode): string {
  if (mode === 'callback') {
    return sanitizeReturnTo(peekPostLoginRedirectPath());
  }
  const params = new URLSearchParams(location.search);
  return sanitizeReturnTo(params.get('returnTo'));
}

function titleForState(mode: AuthPageMode, state: AuthPageState): string {
  if (mode === 'logout-complete') {
    return 'Signed out';
  }
  if (state === 'misconfigured') {
    return 'Deployment auth misconfigured';
  }
  if (state === 'checking-session') {
    return 'Checking session';
  }
  if (state === 'starting-oidc') {
    return 'Starting sign-in';
  }
  if (state === 'exchanging-session') {
    return 'Creating secure session';
  }
  if (state === 'access-denied') {
    return 'Access denied';
  }
  if (state === 'error') {
    return 'Sign-in failed';
  }
  return 'Signed out';
}

function getBrowserOidcMisconfiguration(): string | null {
  if (!config.authRequired) {
    return null;
  }
  if (!config.oidcEnabled) {
    return 'Browser OIDC is disabled or missing required runtime settings while authentication is required.';
  }
  try {
    const redirectUrl = new URL(config.oidcRedirectUri, window.location.origin);
    if (redirectUrl.origin !== window.location.origin) {
      return `OIDC redirect URI ${redirectUrl.toString()} points at a different origin than this UI.`;
    }
  } catch {
    return 'OIDC redirect URI is not a valid URL.';
  }
  return null;
}

export function AuthPage({ mode }: { mode: AuthPageMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const returnTo = useMemo(() => getReturnTo(location, mode), [location, mode]);
  const [state, setState] = useState<AuthPageState>(
    mode === 'logout-complete' ? 'signed-out' : 'checking-session'
  );
  const [message, setMessage] = useState('');
  const checkedSessionRef = useRef(false);
  const exchangeStartedRef = useRef(false);
  const restartStartedRef = useRef(false);
  const signInStartedRef = useRef(false);

  const completeLogin = useCallback(async () => {
    if (exchangeStartedRef.current) {
      return;
    }
    exchangeStartedRef.current = true;
    setState('exchanging-session');
    setMessage('');

    try {
      if (config.authSessionMode === 'cookie') {
        const accessToken = await auth.getAccessToken();
        if (!accessToken) {
          throw new Error('OIDC sign-in completed but no API access token was available.');
        }
        await DataService.createAuthSessionWithBearerToken(accessToken);
      }

      const nextReturnTo =
        mode === 'callback' ? sanitizeReturnTo(consumePostLoginRedirectPath()) : returnTo;
      logUiDiagnostic('AuthPage', 'login-complete', {
        mode,
        returnTo: nextReturnTo,
        authSessionMode: config.authSessionMode
      });
      navigate(nextReturnTo, { replace: true });
    } catch (error) {
      exchangeStartedRef.current = false;
      setState(error instanceof ApiError && error.status === 403 ? 'access-denied' : 'error');
      setMessage(error instanceof Error ? error.message : String(error ?? 'Unknown error'));
    }
  }, [auth, mode, navigate, returnTo]);

  useEffect(() => {
    if (mode !== 'logout-complete' || restartStartedRef.current) {
      return;
    }

    const restartPath = consumePostLogoutRestartPath();
    if (restartPath) {
      restartStartedRef.current = true;
      setState('starting-oidc');
      auth.signIn(sanitizeReturnTo(restartPath));
      return;
    }

    setState('signed-out');
    setMessage('Signed out successfully.');
  }, [auth, mode]);

  useEffect(() => {
    if (mode !== 'login' || checkedSessionRef.current) {
      return;
    }
    checkedSessionRef.current = true;

    if (!config.authRequired) {
      navigate(returnTo, { replace: true });
      return;
    }

    const misconfiguration = getBrowserOidcMisconfiguration();
    if (misconfiguration) {
      setState('misconfigured');
      setMessage(misconfiguration);
      return;
    }

    setState('checking-session');
    DataService.getAuthSessionStatusWithMeta()
      .then(() => {
        navigate(returnTo, { replace: true });
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 403) {
          setState('access-denied');
          setMessage(error.message);
          return;
        }
        if (!(error instanceof ApiError) || error.status !== 401) {
          setState('error');
          setMessage(error instanceof Error ? error.message : String(error ?? 'Unknown error'));
          return;
        }

        if (auth.authenticated) {
          void completeLogin();
          return;
        }
        setState('starting-oidc');
        if (auth.ready && !signInStartedRef.current) {
          signInStartedRef.current = true;
          auth.signIn(returnTo);
        }
      });
  }, [auth, completeLogin, mode, navigate, returnTo]);

  useEffect(() => {
    if (mode === 'logout-complete') {
      return;
    }
    if (!auth.ready || !config.authRequired) {
      return;
    }
    const misconfiguration = getBrowserOidcMisconfiguration();
    if (misconfiguration) {
      setState('misconfigured');
      setMessage(misconfiguration);
      return;
    }
    if (auth.authenticated) {
      void completeLogin();
      return;
    }
    if (mode === 'login' && state === 'starting-oidc' && !signInStartedRef.current) {
      signInStartedRef.current = true;
      auth.signIn(returnTo);
      return;
    }
    if (mode === 'callback' && auth.phase === 'signed-out') {
      setState('error');
      setMessage(auth.error || 'Microsoft Entra did not return an authenticated session.');
    }
  }, [auth, auth.authenticated, auth.error, auth.phase, auth.ready, completeLogin, mode, returnTo, state]);

  const title = titleForState(mode, state);
  const busy =
    state === 'checking-session' || state === 'starting-oidc' || state === 'exchanging-session';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="w-full max-w-2xl rounded-lg border border-border bg-card p-8 shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Secure access
        </p>
        <h1 className="mt-3 font-display text-4xl text-foreground">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {message ||
            (busy
              ? 'The login page is validating your API session and Microsoft Entra sign-in state.'
              : 'You can start a new sign-in when you are ready.')}
        </p>

        {auth.error && state !== 'error' ? (
          <p className="mt-4 text-sm text-destructive">{auth.error}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {state === 'signed-out' || state === 'error' ? (
            <Button onClick={() => auth.signIn(returnTo)} disabled={auth.busy}>
              Sign in
            </Button>
          ) : null}
          {state === 'access-denied' ? (
            <Button variant="outline" onClick={() => auth.signOut()}>
              Sign out
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
