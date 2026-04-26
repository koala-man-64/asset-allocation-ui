import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { config } from '@/config';
import {
  consumePostLoginRedirectPath,
  peekPostLoginRedirectPath,
  useAuth
} from '@/contexts/AuthContext';
import { ApiError } from '@/services/apiService';
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
    return 'Redirecting to login';
  }
  if (state === 'misconfigured') {
    return 'Deployment auth misconfigured';
  }
  if (state === 'checking-session') {
    return 'Checking session';
  }
  if (state === 'submitting') {
    return 'Signing in';
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
  if (config.authProvider !== 'password') {
    return `This deployment requires authProvider=password for the UI, but the runtime advertised authProvider=${config.authProvider}.`;
  }
  if (config.authSessionMode !== 'cookie') {
    return `This deployment requires cookie auth for the UI, but the runtime advertised authSessionMode=${config.authSessionMode}.`;
  }
  return null;
}

export function AuthPage({ mode }: { mode: AuthPageMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const returnTo = useMemo(() => getReturnTo(location, mode), [location, mode]);
  const [state, setState] = useState<AuthPageState>(
    mode === 'callback' ? 'redirecting' : 'checking-session'
  );
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const checkedSessionRef = useRef(false);

  useEffect(() => {
    if (mode !== 'callback') {
      return;
    }

    const nextReturnTo = sanitizeReturnTo(consumePostLoginRedirectPath());
    navigate(`/login?returnTo=${encodeURIComponent(nextReturnTo)}`, { replace: true });
  }, [mode, navigate]);

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

    setState('checking-session');
    DataService.getAuthSessionStatusWithMeta()
      .then((response) => {
        logUiDiagnostic('AuthPage', 'session-already-valid', {
          mode,
          returnTo,
          authMode: response.data.authMode,
          requestId: response.meta.requestId
        });
        navigate(returnTo, { replace: true });
      })
      .catch((sessionError) => {
        if (sessionError instanceof ApiError && sessionError.status === 401) {
          setState('ready');
          if (mode === 'logout-complete') {
            setMessage('Signed out successfully.');
          }
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
      });
  }, [mode, navigate, returnTo]);

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
    mode !== 'callback' && config.authRequired && (state === 'ready' || state === 'error');

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="w-full max-w-2xl rounded-lg border border-border bg-card p-8 shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Restricted access
        </p>
        <h1 className="mt-3 font-display text-4xl text-foreground">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {message ||
            (busy
              ? 'The login page is validating your secure session before protected routes load.'
              : 'Enter the shared password to continue to the protected UI.')}
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
              {mode === 'logout-complete' ? (
                <Button
                  disabled={auth.busy}
                  onClick={() => navigate(returnTo, { replace: true })}
                  type="button"
                  variant="outline"
                >
                  Return to app
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}

        {state === 'access-denied' ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => auth.signOut()} variant="outline">
              Clear session
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
