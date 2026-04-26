import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { config } from '@/config';
import { DataService } from '@/services/DataService';
import type { AuthSessionStatus } from '@/services/apiService';
import { logUiDiagnostic } from '@/services/uiDiagnostics';

const POST_LOGIN_PATH_STORAGE_KEY = 'asset-allocation.post-login-path';
const POST_LOGOUT_RESTART_PATH_STORAGE_KEY = 'asset-allocation.post-logout-restart-path';
const DEFAULT_POST_LOGIN_PATH = '/system-status';
const LOGIN_PATH = '/login';

type InteractiveAuthRequest = {
  reason?: string;
  returnPath?: string;
  source?: string;
  endpoint?: string;
  status?: number;
  requestId?: string;
  recoveryAttempt?: number;
  resetOidcSession?: boolean;
};

export type AuthPhase =
  | 'initializing'
  | 'signed-out'
  | 'session-expired'
  | 'redirecting'
  | 'authenticated'
  | 'signing-out';

export interface AuthContextType {
  enabled: boolean;
  ready: boolean;
  authenticated: boolean;
  phase: AuthPhase;
  busy: boolean;
  userLabel: string | null;
  error: string | null;
  interactionReason: string | null;
  interactionRequest: InteractiveAuthRequest | null;
  getAccessToken: () => Promise<string | null>;
  login: (password: string) => Promise<AuthSessionStatus>;
  checkSession: () => Promise<AuthSessionStatus | null>;
  signIn: (returnPath?: string) => void;
  signOut: () => void;
  signOutAndRestart: (returnPath?: string) => void;
}

function resolveReturnPath(fallback?: string): string {
  const trimmed = String(fallback ?? '').trim();
  if (trimmed && trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  if (typeof window === 'undefined') {
    return DEFAULT_POST_LOGIN_PATH;
  }
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (
    !currentPath ||
    currentPath === LOGIN_PATH ||
    currentPath.startsWith('/auth/callback') ||
    currentPath.startsWith('/auth/logout-complete')
  ) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return currentPath;
}

function removeStoredValue(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore sessionStorage failures and continue with a safe default flow.
  }
}

function storeValue(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore sessionStorage failures and continue with a safe default flow.
  }
}

function readValue(key: string): string {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return String(window.sessionStorage.getItem(key) ?? '').trim();
  } catch {
    return '';
  }
}

export function peekPostLoginRedirectPath(): string {
  return readValue(POST_LOGIN_PATH_STORAGE_KEY) || DEFAULT_POST_LOGIN_PATH;
}

export function consumePostLoginRedirectPath(): string {
  const value = peekPostLoginRedirectPath();
  removeStoredValue(POST_LOGIN_PATH_STORAGE_KEY);
  return value;
}

export function consumePostLogoutRestartPath(): string | null {
  const value = readValue(POST_LOGOUT_RESTART_PATH_STORAGE_KEY);
  removeStoredValue(POST_LOGOUT_RESTART_PATH_STORAGE_KEY);
  return value || null;
}

function buildLoginPath(returnPath?: string, options: { loggedOut?: boolean } = {}): string {
  const params = new URLSearchParams();
  const nextReturnPath = resolveReturnPath(returnPath);
  if (nextReturnPath) {
    params.set('returnTo', nextReturnPath);
  }
  if (options.loggedOut) {
    params.set('loggedOut', '1');
  }
  const search = params.toString();
  return search ? `${LOGIN_PATH}?${search}` : LOGIN_PATH;
}

function sessionUserLabel(status: AuthSessionStatus | null): string | null {
  if (!status) {
    return null;
  }
  return status.displayName || status.username || status.subject || null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const enabled = config.authRequired;
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(!enabled);
  const [phase, setPhase] = useState<AuthPhase>(enabled ? 'signed-out' : 'authenticated');
  const [busy, setBusy] = useState(false);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setReady(true);
    if (!enabled) {
      setAuthenticated(true);
      setPhase('authenticated');
    }
    logUiDiagnostic('Auth', 'provider-config', {
      enabled,
      authRequired: config.authRequired,
      authProvider: config.authProvider,
      authSessionMode: config.authSessionMode
    });

    return () => {
      mountedRef.current = false;
    };
  }, [enabled]);

  const checkSession = useMemo(
    () => async (): Promise<AuthSessionStatus | null> => {
      if (!enabled) {
        if (!mountedRef.current) {
          return null;
        }
        setAuthenticated(true);
        setPhase('authenticated');
        setUserLabel(null);
        setError(null);
        return null;
      }

      setBusy(true);
      setError(null);
      try {
        const instance = await msalSession.ensureInitialized();
        await instance.loginRedirect({
          scopes: oidcScopes
        });
        logAuthTransition('redirect-dispatched', {
          returnPath: nextReturnPath,
          scopes: oidcScopes
        });
      } catch (err) {
        msalSession.setRedirectInFlight(false);
        console.error('OIDC sign-in failed', err);
        logAuthTransition(
          'redirect-start-failed',
          {
            returnPath: nextReturnPath,
            scopes: oidcScopes,
            error: err
          },
          'error'
        );
        setPhase('signed-out');
        setError(describeAuthError('OIDC sign-in could not be started.', err));
        throw err;
      }
    };
  }, [msalSession, oidcScopes]);

  useEffect(() => {
    if (!msalSession) {
      clearReauthRequestState();
      setAccount(null);
      setInteractionReason(null);
      setInteractionRequest(null);
      setError(null);
      setPhase('signed-out');
      setReady(true);
      logAuthTransition('provider-disabled', {
        authRequired,
        enabled
      });
      return;
    }

    let cancelled = false;
    const pathname = typeof window === 'undefined' ? '' : window.location.pathname;
    const onCallbackPath = isCallbackPath(pathname);
    const onLoginPath = isLoginPath(pathname);
    const onLogoutCompletePath = isLogoutCompletePath(pathname);

    if (!authRequired && !onLoginPath && !onCallbackPath && !onLogoutCompletePath) {
      setReady(true);
      setPhase('signed-out');
      setError(null);
      setInteractionReason(null);
      setInteractionRequest(null);
      logAuthTransition('bootstrap-skipped-outside-auth-route', {
        pathname,
        authRequired
      });
      return;
    }

    setReady(false);
    setError(null);
    setInteractionReason(null);
    setInteractionRequest(null);
    setPhase(onCallbackPath ? 'redirecting' : authRequired ? 'initializing' : 'signed-out');
    logAuthTransition('bootstrap-start', {
      pathname,
      authRequired,
      login: onLoginPath,
      callback: onCallbackPath,
      logoutComplete: onLogoutCompletePath
    });

    const bootstrap = async () => {
      const result = await msalSession.runBootstrap({
        authRequired,
        pathname,
        onCallbackPath,
        onLogoutCompletePath
      });

      if (cancelled) {
        return;
      }

      msalSession.setRedirectInFlight(false);
      if (result.account) {
        clearReauthRequestState();
        setAccount(result.account);
        setInteractionReason(null);
        setInteractionRequest(null);
        setError(null);
        setPhase('authenticated');
        setUserLabel(sessionUserLabel(response.data));
        logUiDiagnostic('Auth', 'session-valid', {
          authMode: response.data.authMode,
          userLabel: sessionUserLabel(response.data),
          requestId: response.meta.requestId
        });
        return response.data;
      } catch (sessionError) {
        if (!mountedRef.current) {
          throw sessionError;
        }
        setAuthenticated(false);
        setPhase('signed-out');
        setUserLabel(null);
        if (sessionError instanceof Error) {
          setError(sessionError.message);
        }
        throw sessionError;
      } finally {
        if (mountedRef.current) {
          setBusy(false);
        }
      }
    },
    [enabled]
  );

  const login = useMemo(
    () => async (password: string): Promise<AuthSessionStatus> => {
      const trimmedPassword = String(password ?? '');
      setBusy(true);
      setPhase('initializing');
      setError(null);
      try {
        const response = await DataService.createPasswordAuthSession(trimmedPassword);
        if (!mountedRef.current) {
          return response.data;
        }
        setAuthenticated(true);
        setPhase('authenticated');
        setUserLabel(sessionUserLabel(response.data));
        removeStoredValue(POST_LOGIN_PATH_STORAGE_KEY);
        removeStoredValue(POST_LOGOUT_RESTART_PATH_STORAGE_KEY);
        logUiDiagnostic('Auth', 'login-success', {
          authMode: response.data.authMode,
          userLabel: sessionUserLabel(response.data),
          requestId: response.meta.requestId
        });
        return response.data;
      } catch (loginError) {
        if (mountedRef.current) {
          setAuthenticated(false);
          setPhase('signed-out');
          setUserLabel(null);
          setError(loginError instanceof Error ? loginError.message : String(loginError ?? 'Unknown error'));
        }
        throw loginError;
      } finally {
        if (mountedRef.current) {
          setBusy(false);
        }
      }
    },
    []
  );

  const signIn = useMemo(
    () => (returnPath?: string) => {
      const nextReturnPath = resolveReturnPath(returnPath);
      storeValue(POST_LOGIN_PATH_STORAGE_KEY, nextReturnPath);
      setPhase('redirecting');
      setError(null);
      navigate(buildLoginPath(nextReturnPath), { replace: true });
    },
    [navigate]
  );

  const signOut = useMemo(
    () => async () => {
      let shouldFinalize = true;
      setBusy(true);
      setPhase('signing-out');
      setError(null);
      removeStoredValue(POST_LOGIN_PATH_STORAGE_KEY);
      removeStoredValue(POST_LOGOUT_RESTART_PATH_STORAGE_KEY);
      try {
        if (enabled) {
          await DataService.deleteAuthSession();
        }
      } catch (logoutError) {
        if (mountedRef.current) {
          setError(logoutError instanceof Error ? logoutError.message : String(logoutError ?? 'Unknown error'));
        }
      } finally {
        if (!mountedRef.current) {
          shouldFinalize = false;
        }
      }
      if (!shouldFinalize) {
        return;
      }
      setAuthenticated(false);
      setUserLabel(null);
      setBusy(false);
      setPhase('signed-out');
      navigate(buildLoginPath(undefined, { loggedOut: true }), { replace: true });
    },
    [enabled, navigate]
  );

  const signOutAndRestart = useMemo(
    () => async (returnPath?: string) => {
      let shouldFinalize = true;
      const nextReturnPath = resolveReturnPath(returnPath);
      storeValue(POST_LOGOUT_RESTART_PATH_STORAGE_KEY, nextReturnPath);
      setBusy(true);
      setPhase('signing-out');
      setError(null);
      removeStoredValue(POST_LOGIN_PATH_STORAGE_KEY);
      try {
        if (enabled) {
          await DataService.deleteAuthSession();
        }
      } catch (logoutError) {
        if (mountedRef.current) {
          setError(logoutError instanceof Error ? logoutError.message : String(logoutError ?? 'Unknown error'));
        }
      } finally {
        if (!mountedRef.current) {
          shouldFinalize = false;
        }
      }
      if (!shouldFinalize) {
        return;
      }
      setAuthenticated(false);
      setUserLabel(null);
      setBusy(false);
      setPhase('signed-out');
      navigate(buildLoginPath(nextReturnPath), { replace: true });
    },
    [enabled, navigate]
  );

  return (
    <AuthContext.Provider
      value={{
        enabled,
        ready,
        authenticated,
        phase,
        busy,
        userLabel,
        error,
        interactionReason: null,
        interactionRequest: null,
        getAccessToken: async () => null,
        login,
        checkSession,
        signIn,
        signOut: () => {
          void signOut();
        },
        signOutAndRestart: (returnPath?: string) => {
          void signOutAndRestart(returnPath);
        }
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
