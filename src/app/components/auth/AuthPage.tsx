import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { config } from '@/config';
import {
  consumePostLoginRedirectPath,
  consumePostLogoutRestartPath,
  peekPostLoginRedirectPath,
  useAuth
} from '@/contexts/AuthContext';
import { ApiError } from '@/services/apiService';
import { DataService } from '@/services/DataService';
import { storePostLoginRedirectPath } from '@/services/authRedirectStorage';
import {
  consumeOidcRedirectAccessToken,
  disposeOidcClient,
  startOidcLogin
} from '@/services/oidcClient';
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
    return config.authProvider === 'oidc' ? 'Completing sign-in' : 'Signing in';
  }
  if (state === 'redirecting') {
    return config.authProvider === 'oidc' ? 'Redirecting to Microsoft Entra' : 'Redirecting';
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
  return config.authProvider === 'oidc' ? 'Restricted access' : 'Break-glass access';
}

function getMisconfigurationMessage(): string | null {
  if (!config.authRequired) {
    return null;
  }
  if (config.authProvider === 'password') {
    if (config.authSessionMode !== 'cookie') {
      return `This deployment requires cookie auth for the UI, but the runtime advertised authSessionMode=${config.authSessionMode}.`;
    }
    return null;
  }
  if (config.authProvider === 'oidc') {
    if (config.authSessionMode !== 'cookie') {
      return `This deployment requires cookie auth for OIDC, but the runtime advertised authSessionMode=${config.authSessionMode}.`;
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
  return `This deployment requires authProvider=oidc or authProvider=password, but the runtime advertised authProvider=${config.authProvider}.`;
}

function defaultMessage(mode: AuthPageMode, busy: boolean): string {
  if (mode === 'logout-complete') {
    return config.authProvider === 'oidc'
      ? 'Signed out successfully. Start a new Microsoft Entra session when you are ready.'
      : 'Signed out successfully.';
  }
  if (busy) {
    return config.authProvider === 'oidc'
      ? 'The login page is validating or establishing your secure session before protected routes load.'
      : 'The login page is validating your secure session before protected routes load.';
  }
  if (config.authProvider === 'oidc') {
    return 'Continue to Microsoft Entra to establish a backend session cookie for the protected UI.';
  }
  return 'Enter the shared password to continue to the protected UI.';
}

export function AuthPage({ mode }: { mode: AuthPageMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const returnTo = useMemo(() => getReturnTo(location, mode), [location, mode]);
  const [state, setState] = useState<AuthPageState>(
    mode === 'callback' ? 'submitting' : 'checking-session'
  );
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const checkedSessionRef = useRef(false);
  const oidcLaunchAttemptedRef = useRef(false);
  const callbackHandledRef = useRef(false);

  async function launchOidcRedirect(source: string): Promise<void> {
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
      setMessage(oidcError instanceof Error ? oidcError.message : String(oidcError ?? 'Unknown error'));
    }
  }

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
        const accessToken = await consumeOidcRedirectAccessToken();
        try {
          await DataService.createOidcAuthSession(accessToken);
        } finally {
          disposeOidcClient();
        }
        const session = await auth.checkSession();
        if (cancelled) {
          return;
        }
        logUiDiagnostic('AuthPage', 'oidc-bootstrap-success', {
          mode,
          returnTo,
          authMode: session?.authMode || null
        });
        navigate(sanitizeReturnTo(consumePostLoginRedirectPath()), { replace: true });
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
          callbackError instanceof Error ? callbackError.message : String(callbackError ?? 'Unknown error')
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth, mode, navigate, returnTo]);

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
              auth.signIn(restartPath);
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
        setState('error');
        setMessage(
          sessionError instanceof Error ? sessionError.message : String(sessionError ?? 'Unknown error')
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth, mode, navigate, returnTo]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPassword = password;
    if (!nextPassword) {
      setState('error');
      setMessage('Password is required.');
      return;
    }

    setState('submitting');
    setMessage('');
    try {
      await auth.login(nextPassword);
      setPassword('');
      logUiDiagnostic('AuthPage', 'password-login-success', {
        mode,
        returnTo
      });
      navigate(returnTo, { replace: true });
    } catch (loginError) {
      setPassword('');
      setState(loginError instanceof ApiError && loginError.status === 403 ? 'access-denied' : 'error');
      setMessage(loginError instanceof Error ? loginError.message : String(loginError ?? 'Unknown error'));
    }
  }

  const title = titleForState(mode, state);
  const busy = state === 'checking-session' || state === 'submitting' || state === 'redirecting';
  const showPasswordForm =
    config.authProvider === 'password' &&
    mode !== 'callback' &&
    config.authRequired &&
    (state === 'ready' || state === 'error');
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

        {showPasswordForm ? (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground" htmlFor="shared-password">
                Shared password
              </label>
              <Input
                autoComplete="current-password"
                autoFocus
                id="shared-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter the operator password"
                type="password"
                value={password}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button disabled={auth.busy || !password} type="submit">
                Sign in
              </Button>
            </div>
          </form>
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
