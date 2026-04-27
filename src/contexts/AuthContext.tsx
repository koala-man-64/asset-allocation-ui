import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { config } from '@/config';
import { DataService } from '@/services/DataService';
import {
  buildLoginPath,
  clearStoredAuthRedirects,
  currentRoute,
  DEFAULT_POST_LOGIN_PATH,
  sanitizeReturnPath,
  storePostLoginRedirectPath,
  storePostLogoutRestartPath
} from '@/services/authRedirectStorage';
import { startOidcLogout } from '@/services/oidcClient';
import type { AuthSessionStatus } from '@/services/apiService';
import { logUiDiagnostic } from '@/services/uiDiagnostics';

export {
  consumePostLoginRedirectPath,
  consumePostLogoutRestartPath,
  peekPostLoginRedirectPath
} from '@/services/authRedirectStorage';

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
  if (trimmed) {
    return sanitizeReturnPath(trimmed);
  }
  return typeof window === 'undefined' ? DEFAULT_POST_LOGIN_PATH : currentRoute();
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
        const response = await DataService.getAuthSessionStatusWithMeta();
        if (!mountedRef.current) {
          return response.data;
        }
        setAuthenticated(true);
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
      if (config.authProvider !== 'password') {
        throw new Error('Password login is not enabled for this deployment.');
      }
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
        clearStoredAuthRedirects();
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
      storePostLoginRedirectPath(nextReturnPath);
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
      clearStoredAuthRedirects();
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
      if (config.authProvider === 'oidc' && config.oidcEnabled) {
        try {
          await startOidcLogout();
          if (mountedRef.current) {
            setBusy(false);
            setPhase('signed-out');
            navigate('/auth/logout-complete', { replace: true });
          }
          return;
        } catch (logoutRedirectError) {
          if (mountedRef.current) {
            setError(
              logoutRedirectError instanceof Error
                ? logoutRedirectError.message
                : String(logoutRedirectError ?? 'Unknown error')
            );
          }
        }
      }
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
      storePostLogoutRestartPath(nextReturnPath);
      setBusy(true);
      setPhase('signing-out');
      setError(null);
      clearStoredAuthRedirects();
      storePostLogoutRestartPath(nextReturnPath);
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
      if (config.authProvider === 'oidc' && config.oidcEnabled) {
        try {
          await startOidcLogout();
          if (mountedRef.current) {
            setBusy(false);
            setPhase('signed-out');
            navigate('/auth/logout-complete', { replace: true });
          }
          return;
        } catch (logoutRedirectError) {
          if (mountedRef.current) {
            setError(
              logoutRedirectError instanceof Error
                ? logoutRedirectError.message
                : String(logoutRedirectError ?? 'Unknown error')
            );
          }
        }
      }
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
