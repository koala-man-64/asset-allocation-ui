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
import { storePostLoginRedirectPath } from '@/services/authRedirectStorage';
import {
  consumeOidcRedirectAccessToken,
  disposeOidcClient,
  startOidcLogin
} from '@/services/oidcClient';
import { DataService } from '@/services/DataService';
import { logUiDiagnostic } from '@/services/uiDiagnostics';

export type AuthPageMode = 'login' | 'callback' | 'logout-complete';

type AuthPageState =
  | 'checking-session'
  | 'ready'
  | 'submitting'
  | 'redirecting'
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
  if (mode === 'callback') {
    return state === 'access-denied' ? 'Access denied' : 'Completing sign-in';
  }
  if (state === 'misconfigured') {
    return 'Deployment auth misconfigured';
  }
  if (state === 'checking-session') {
    return 'Checking session';
  }
  if (state === 'submitting') {
    return 'Completing sign-in';
  }
  if (state === 'redirecting') {
    return 'Redirecting to Microsoft Entra';
  }
  if (state === 'access-denied') {
    return 'Access denied';
  }
  if (state === 'error') {
    return 'Sign-in failed';
  }
  if (mode === 'logout-complete') {
    return 'Signed out';
  }
  return 'Restricted access';
}

function getMisconfigurationMessage(): string | null {
  if (!config.authRequired) {
    return null;
  }
  if (config.authProvider === 'oidc') {
    if (config.authSessionMode !== 'bearer') {
      return `This deployment requires bearer auth for OIDC, but the runtime advertised authSessionMode=${config.authSessionMode}.`;
    }
    if (
      !config.oidcEnabled ||
      !config.oidcAuthority ||
      !config.oidcClientId ||
      !config.oidcRedirectUri ||
      config.oidcScopes.length === 0
    ) {
      return 'This deployment requires OIDC runtime configuration, but the browser config is incomplete.';
    }
    return null;
  }
  return `This deployment requires authProvider=oidc, but the runtime advertised authProvider=${config.authProvider}.`;
}

function defaultMessage(mode: AuthPageMode, busy: boolean): string {
  if (mode === 'logout-complete') {
    return 'Signed out successfully. Start a new Microsoft Entra session when you are ready.';
  }
  if (busy) {
    return 'The login page is validating your Microsoft Entra access before protected routes load.';
  }
  if (config.authProvider === 'oidc') {
    return 'Continue to Microsoft Entra to access the protected UI.';
  }
  return 'Authentication is not configured for this deployment.';
}

export function AuthPage({ mode }: { mode: AuthPageMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { checkSession, signIn } = auth;
  const returnTo = useMemo(() => getReturnTo(location, mode), [location, mode]);
  const [state, setState] = useState<AuthPageState>(
    mode === 'callback' ? 'submitting' : 'checking-session'
  );
  const [message, setMessage] = useState('');
  const checkedSessionRef = useRef(false);
  const oidcLaunchAttemptedRef = useRef(false);
  const callbackHandledRef = useRef(false);

  const launchOidcRedirect = useCallback(
    async (source: string): Promise<void> => {
      storePostLoginRedirectPath(returnTo);
      oidcLaunchAttemptedRef.current = true;
      setState('redirecting');
      setMessage('Redirecting to Microsoft Entra to continue sign-in.');
      logUiDiagnostic('AuthPage', 'oidc-login-redirect-started', {
        mode,
        returnTo,
        source
      });
      try {
        await startOidcLogin();
        setState('ready');
        setMessage('Continue sign-in to complete authentication.');
      } catch (oidcError) {
        setState('error');
        setMessage(
          oidcError instanceof Error ? oidcError.message : String(oidcError ?? 'Unknown error')
        );
      }
    },
    [mode, returnTo]
  );

  useEffect(() => {
    if (mode !== 'callback' || callbackHandledRef.current) {
      return;
    }
    callbackHandledRef.current = true;

    const misconfiguration = getMisconfigurationMessage();
    if (misconfiguration) {
      setState('misconfigured');
      setMessage(misconfiguration);
      return;
    }
    if (config.authProvider !== 'oidc') {
      setState('misconfigured');
      setMessage('OIDC callback handling is only available when authProvider=oidc.');
      return;
    }

    let cancelled = false;
    setState('submitting');
    setMessage('Completing sign-in with the control plane.');

    void (async () => {
      try {
        await consumeOidcRedirectAccessToken();
        try {
          const session = await checkSession();
          if (cancelled) {
            return;
          }
          logUiDiagnostic('AuthPage', 'oidc-sign-in-success', {
            mode,
            returnTo,
            authMode: session?.authMode || null
          });
          navigate(sanitizeReturnTo(consumePostLoginRedirectPath()), { replace: true });
        } finally {
          disposeOidcClient();
        }
      } catch (callbackError) {
        disposeOidcClient();
        if (cancelled) {
          return;
        }
        if (callbackError instanceof ApiError && callbackError.status === 403) {
          setState('access-denied');
          setMessage(callbackError.message);
          return;
        }
        setState('error');
        setMessage(
          callbackError instanceof Error
            ? callbackError.message
            : String(callbackError ?? 'Unknown error')
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [checkSession, mode, navigate, returnTo]);

  useEffect(() => {
    if (mode === 'callback' || checkedSessionRef.current) {
      return;
    }
    checkedSessionRef.current = true;

    if (!config.authRequired) {
      navigate(returnTo, { replace: true });
      return;
    }

    const misconfiguration = getMisconfigurationMessage();
    if (misconfiguration) {
      setState('misconfigured');
      setMessage(misconfiguration);
      return;
    }

    let cancelled = false;
    setState('checking-session');

    void (async () => {
      try {
        const response = await DataService.getAuthSessionStatusWithMeta();
        if (cancelled) {
          return;
        }
        logUiDiagnostic('AuthPage', 'session-already-valid', {
          mode,
          returnTo,
          authMode: response.data.authMode,
          requestId: response.meta.requestId
        });
        navigate(returnTo, { replace: true });
      } catch (sessionError) {
        if (cancelled) {
          return;
        }
        if (sessionError instanceof ApiError && sessionError.status === 401) {
          if (mode === 'logout-complete') {
            const restartPath = consumePostLogoutRestartPath();
            if (config.authProvider === 'oidc' && restartPath) {
              signIn(restartPath);
              return;
            }
            setState('ready');
            setMessage('Signed out successfully.');
            return;
          }
          if (config.authProvider === 'oidc') {
            await launchOidcRedirect('auto-login');
            return;
          }
          setState('ready');
          return;
        }
        if (sessionError instanceof ApiError && sessionError.status === 403) {
          setState('access-denied');
          setMessage(sessionError.message);
          return;
        }
        if (config.authProvider === 'oidc') {
          await launchOidcRedirect('session-missing');
          return;
        }
        setState('error');
        setMessage(
          sessionError instanceof Error
            ? sessionError.message
            : String(sessionError ?? 'Unknown error')
        );
      }
    })();

    return () => {
      cancelled = true;
      checkedSessionRef.current = false;
    };
  }, [launchOidcRedirect, mode, navigate, returnTo, signIn]);

  const title = titleForState(mode, state);
  const busy = state === 'checking-session' || state === 'submitting' || state === 'redirecting';
  const showOidcAction =
    config.authProvider === 'oidc' &&
    mode !== 'callback' &&
    config.authRequired &&
    (state === 'ready' || state === 'error');

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="w-full max-w-2xl rounded-lg border border-border bg-card p-8 shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Restricted access
        </p>
        <h1 className="mt-3 font-display text-4xl text-foreground">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {message || defaultMessage(mode, busy)}
        </p>

        {auth.error && state !== 'error' ? (
          <p className="mt-4 text-sm text-destructive">{auth.error}</p>
        ) : null}

        {showOidcAction ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              disabled={busy}
              onClick={() => {
                void launchOidcRedirect('manual-button');
              }}
              type="button"
            >
              Continue to sign in
            </Button>
          </div>
        ) : null}

        {state === 'access-denied' ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => {
                auth.signOut();
              }}
              variant="outline"
            >
              Clear session
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
