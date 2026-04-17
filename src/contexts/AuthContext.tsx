import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser';
import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';

import { config } from '@/config';
import {
  createInteractionRequiredError,
  setAccessTokenProvider,
  setInteractiveAuthHandler
} from '@/services/authTransport';

const POST_LOGIN_PATH_STORAGE_KEY = 'asset-allocation.post-login-path';
const DEFAULT_POST_LOGIN_PATH = '/system-status';
const CALLBACK_PATH = '/auth/callback';
const LOGOUT_COMPLETE_PATH = '/auth/logout-complete';

export type AuthPhase =
  | 'initializing'
  | 'signed-out'
  | 'redirecting'
  | 'authenticated'
  | 'signing-out';

function describeAuthError(prefix: string, err: unknown): string {
  const detail = err instanceof Error ? err.message.trim() : String(err ?? '').trim();
  return detail ? `${prefix} ${detail}` : prefix;
}

export interface AuthContextType {
  enabled: boolean;
  ready: boolean;
  authenticated: boolean;
  phase: AuthPhase;
  busy: boolean;
  userLabel: string | null;
  error: string | null;
  signIn: (returnPath?: string) => void;
  signOut: () => void;
}

function isCallbackPath(pathname: string): boolean {
  return pathname === CALLBACK_PATH;
}

function isLogoutCompletePath(pathname: string): boolean {
  return pathname === LOGOUT_COMPLETE_PATH;
}

function getCurrentPath(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function resolveReturnPath(fallback?: string): string {
  const trimmed = String(fallback ?? '').trim();
  if (trimmed) {
    return trimmed;
  }
  if (typeof window === 'undefined') {
    return DEFAULT_POST_LOGIN_PATH;
  }
  const currentPath = getCurrentPath();
  if (
    !currentPath ||
    isCallbackPath(window.location.pathname) ||
    isLogoutCompletePath(window.location.pathname)
  ) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return currentPath;
}

function storePostLoginRedirectPath(path: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(POST_LOGIN_PATH_STORAGE_KEY, resolveReturnPath(path));
  } catch {
    // Ignore sessionStorage failures and fall back to the default route after login.
  }
}

function clearPostLoginRedirectPath(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(POST_LOGIN_PATH_STORAGE_KEY);
  } catch {
    // Ignore sessionStorage failures; they do not block sign-out.
  }
}

export function peekPostLoginRedirectPath(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_POST_LOGIN_PATH;
  }
  try {
    const stored = String(window.sessionStorage.getItem(POST_LOGIN_PATH_STORAGE_KEY) ?? '').trim();
    return stored || DEFAULT_POST_LOGIN_PATH;
  } catch {
    return DEFAULT_POST_LOGIN_PATH;
  }
}

export function consumePostLoginRedirectPath(): string {
  const stored = peekPostLoginRedirectPath();
  clearPostLoginRedirectPath();
  return stored;
}

function resolvePostLogoutRedirectUri(
  explicitPostLogoutRedirectUri: string,
  redirectUri: string
): string {
  const explicit = String(explicitPostLogoutRedirectUri ?? '').trim();
  if (explicit) {
    return explicit;
  }
  const redirect = String(redirectUri ?? '').trim();
  if (!redirect) {
    return '';
  }
  try {
    return new URL(LOGOUT_COMPLETE_PATH, redirect).toString();
  } catch {
    return '';
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const oidcClientId = config.oidcClientId;
  const oidcAuthority = config.oidcAuthority;
  const oidcScopes = config.oidcScopes;
  const oidcRedirectUri = config.oidcRedirectUri;
  const oidcPostLogoutRedirectUri = resolvePostLogoutRedirectUri(
    config.oidcPostLogoutRedirectUri,
    oidcRedirectUri
  );

  const enabled =
    config.oidcEnabled &&
    Boolean(oidcClientId && oidcAuthority && oidcRedirectUri && oidcScopes.length > 0);

  const msal = useMemo(() => {
    if (!enabled) return null;
    return new PublicClientApplication({
      auth: {
        clientId: oidcClientId,
        authority: oidcAuthority,
        redirectUri: oidcRedirectUri,
        postLogoutRedirectUri: oidcPostLogoutRedirectUri || oidcRedirectUri
      },
      cache: {
        cacheLocation: 'sessionStorage'
      }
    });
  }, [
    enabled,
    oidcAuthority,
    oidcClientId,
    oidcPostLogoutRedirectUri,
    oidcRedirectUri
  ]);

  const ensureMsalInitialized = useMemo(() => {
    if (!msal) return null;
    let initializationPromise: Promise<PublicClientApplication> | null = null;
    return () => {
      if (!initializationPromise) {
        initializationPromise = msal.initialize().then(() => msal);
      }
      return initializationPromise;
    };
  }, [msal]);

  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<AuthPhase>(
    enabled && typeof window !== 'undefined' && isCallbackPath(window.location.pathname)
      ? 'redirecting'
      : enabled && config.authRequired
        ? 'initializing'
        : 'signed-out'
  );
  const [error, setError] = useState<string | null>(null);
  const redirectInFlightRef = useRef(false);

  const beginLoginRedirect = useMemo(() => {
    if (!ensureMsalInitialized) {
      return null;
    }

    return async (returnPath?: string) => {
      if (redirectInFlightRef.current) {
        return;
      }

      redirectInFlightRef.current = true;
      setError(null);
      setPhase('redirecting');
      setReady(true);
      storePostLoginRedirectPath(resolveReturnPath(returnPath));

      try {
        const instance = await ensureMsalInitialized();
        await instance.loginRedirect({
          scopes: oidcScopes
        });
      } catch (err) {
        redirectInFlightRef.current = false;
        console.error('OIDC sign-in failed', err);
        setPhase('signed-out');
        setError(describeAuthError('OIDC sign-in could not be started.', err));
        throw err;
      }
    };
  }, [ensureMsalInitialized, oidcScopes]);

  useEffect(() => {
    if (!ensureMsalInitialized) {
      setAccount(null);
      setError(null);
      setPhase('signed-out');
      setReady(true);
      return;
    }

    let cancelled = false;
    const pathname = typeof window === 'undefined' ? '' : window.location.pathname;
    const onCallbackPath = isCallbackPath(pathname);
    const onLogoutCompletePath = isLogoutCompletePath(pathname);
    const shouldAttemptSilentSignIn = config.authRequired && !onCallbackPath && !onLogoutCompletePath;

    setReady(false);
    setError(null);
    setPhase(onCallbackPath ? 'redirecting' : shouldAttemptSilentSignIn ? 'initializing' : 'signed-out');

    const bootstrap = async () => {
      const instance = await ensureMsalInitialized();
      const redirectResult: AuthenticationResult | null = await instance.handleRedirectPromise();
      let chosenAccount =
        redirectResult?.account ?? instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;

      if (chosenAccount) {
        instance.setActiveAccount(chosenAccount);
        if (!cancelled) {
          redirectInFlightRef.current = false;
          setAccount(chosenAccount);
          setPhase('authenticated');
          setReady(true);
        }
        return;
      }

      if (!shouldAttemptSilentSignIn) {
        if (!cancelled) {
          redirectInFlightRef.current = false;
          setAccount(null);
          setPhase('signed-out');
          setReady(true);
        }
        return;
      }

      try {
        const silentResult = await instance.ssoSilent({
          scopes: oidcScopes
        });
        chosenAccount =
          silentResult.account ?? instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
        if (chosenAccount) {
          instance.setActiveAccount(chosenAccount);
        }
        if (!cancelled) {
          redirectInFlightRef.current = false;
          setAccount(chosenAccount);
          setPhase(chosenAccount ? 'authenticated' : 'signed-out');
          setReady(true);
        }
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          if (!cancelled) {
            setAccount(null);
          }
          if (!cancelled && beginLoginRedirect) {
            await beginLoginRedirect(getCurrentPath());
          }
          return;
        }
        throw err;
      }
    };

    bootstrap().catch((err) => {
      redirectInFlightRef.current = false;
      console.error('OIDC bootstrap failed', err);
      if (!cancelled) {
        setAccount(null);
        setError(describeAuthError('OIDC sign-in could not be completed.', err));
        setPhase('signed-out');
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [beginLoginRedirect, ensureMsalInitialized, oidcScopes]);

  useEffect(() => {
    if (!ensureMsalInitialized) {
      setAccessTokenProvider(null);
      return;
    }

    setAccessTokenProvider(async () => {
      if (!account) return null;
      try {
        const instance = await ensureMsalInitialized();
        const result = await instance.acquireTokenSilent({
          account,
          scopes: oidcScopes
        });
        return result.accessToken || null;
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          throw createInteractionRequiredError('OIDC session refresh requires sign-in.');
        }
        console.warn('Failed to acquire access token', err);
        return null;
      }
    });

    return () => {
      setAccessTokenProvider(null);
    };
  }, [account, ensureMsalInitialized, oidcScopes]);

  useEffect(() => {
    if (!enabled || !config.authRequired || !beginLoginRedirect) {
      setInteractiveAuthHandler(null);
      return;
    }

    setInteractiveAuthHandler(async ({ returnPath } = {}) => {
      if (typeof window !== 'undefined' && isLogoutCompletePath(window.location.pathname)) {
        throw new Error('Interactive sign-in is disabled on the logout-complete route.');
      }
      await beginLoginRedirect(returnPath);
    });

    return () => {
      setInteractiveAuthHandler(null);
    };
  }, [beginLoginRedirect, enabled]);

  const signIn = (returnPath?: string) => {
    if (!beginLoginRedirect) {
      return;
    }
    void beginLoginRedirect(returnPath).catch(() => undefined);
  };

  const signOut = () => {
    if (!ensureMsalInitialized || phase === 'redirecting' || phase === 'signing-out') return;

    redirectInFlightRef.current = false;
    clearPostLoginRedirectPath();
    setError(null);
    setPhase('signing-out');

    void ensureMsalInitialized()
      .then((instance) =>
        instance.logoutRedirect({
          account: account ?? undefined,
          postLogoutRedirectUri: oidcPostLogoutRedirectUri || undefined
        })
      )
      .catch((err) => {
        console.error('OIDC sign-out failed', err);
        setPhase(account ? 'authenticated' : 'signed-out');
        setError(describeAuthError('OIDC sign-out could not be completed.', err));
      });
  };

  const userLabel = account?.name || account?.username || null;
  const busy = phase === 'initializing' || phase === 'redirecting' || phase === 'signing-out';

  return (
    <AuthContext.Provider
      value={{
        enabled,
        ready,
        authenticated: Boolean(account),
        phase,
        busy,
        userLabel,
        error,
        signIn,
        signOut
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
