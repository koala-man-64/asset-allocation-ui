import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AccountInfo } from '@azure/msal-browser';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

import { config } from '@/config';
import { getMsalSession } from '@/contexts/msalSession';
import {
  clearReauthRequestState,
  createInteractionRequiredError,
  setAccessTokenProvider,
  setInteractiveAuthHandler,
  type AccessTokenRequestOptions,
  type InteractiveAuthRequest
} from '@/services/authTransport';
import { logUiDiagnostic } from '@/services/uiDiagnostics';

const POST_LOGIN_PATH_STORAGE_KEY = 'asset-allocation.post-login-path';
const POST_LOGOUT_RESTART_PATH_STORAGE_KEY = 'asset-allocation.post-logout-restart-path';
const DEFAULT_POST_LOGIN_PATH = '/system-status';
const CALLBACK_PATH = '/auth/callback';
const LOGOUT_COMPLETE_PATH = '/auth/logout-complete';
const SILENT_AUTH_REDIRECT_PATH = '/auth/silent-callback.html';

let consumedPostLoginRedirectPath: string | null = null;

export type AuthPhase =
  | 'initializing'
  | 'signed-out'
  | 'session-expired'
  | 'redirecting'
  | 'authenticated'
  | 'signing-out';

function describeAuthError(prefix: string, err: unknown): string {
  const detail = err instanceof Error ? err.message.trim() : String(err ?? '').trim();
  return detail ? `${prefix} ${detail}` : prefix;
}

function summarizeAccountForLogs(account: AccountInfo | null | undefined): Record<string, unknown> {
  if (!account) {
    return { present: false };
  }

  return {
    present: true,
    username: account.username ?? null,
    name: account.name ?? null,
    tenantId: account.tenantId ?? null,
    homeAccountId: account.homeAccountId ?? null
  };
}

function decodeBase64UrlJsonSegment(segment: string): Record<string, unknown> | null {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  try {
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function summarizeJwtClaimsForLogs(token: string | null | undefined): Record<string, unknown> | null {
  const raw = String(token ?? '').trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split('.');
  if (parts.length < 2) {
    return null;
  }

  const claims = decodeBase64UrlJsonSegment(parts[1] ?? '');
  if (!claims) {
    return null;
  }

  const roles = Array.isArray(claims.roles)
    ? claims.roles.map((role) => String(role ?? '').trim()).filter(Boolean)
    : [];

  return {
    iss: claims.iss ?? null,
    aud: claims.aud ?? null,
    azp: claims.azp ?? claims.appid ?? null,
    tid: claims.tid ?? null,
    oid: claims.oid ?? null,
    sub: claims.sub ?? null,
    scp: claims.scp ?? null,
    roles,
    exp: claims.exp ?? null,
    nbf: claims.nbf ?? null
  };
}

function logAuthTransition(
  event: string,
  detail: Record<string, unknown> = {},
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  logUiDiagnostic('Auth', event, detail, level);
}

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
  signIn: (returnPath?: string) => void;
  signOut: () => void;
  signOutAndRestart: (returnPath?: string) => void;
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

function removeStoredPostLoginRedirectPath(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(POST_LOGIN_PATH_STORAGE_KEY);
  } catch {
    // Ignore sessionStorage failures; they do not block auth state transitions.
  }
}

function storePostLoginRedirectPath(path: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  consumedPostLoginRedirectPath = null;
  try {
    window.sessionStorage.setItem(POST_LOGIN_PATH_STORAGE_KEY, resolveReturnPath(path));
  } catch {
    // Ignore sessionStorage failures and fall back to the default route after login.
  }
}

function clearPostLoginRedirectPath(): void {
  consumedPostLoginRedirectPath = null;
  removeStoredPostLoginRedirectPath();
}

function removeStoredPostLogoutRestartPath(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(POST_LOGOUT_RESTART_PATH_STORAGE_KEY);
  } catch {
    // Ignore sessionStorage failures; they do not block auth state transitions.
  }
}

function storePostLogoutRestartPath(path: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      POST_LOGOUT_RESTART_PATH_STORAGE_KEY,
      resolveReturnPath(path)
    );
  } catch {
    // Ignore sessionStorage failures and fall back to a normal signed-out screen.
  }
}

function clearPostLogoutRestartPath(): void {
  removeStoredPostLogoutRestartPath();
}

export function peekPostLoginRedirectPath(): string {
  if (consumedPostLoginRedirectPath) {
    return consumedPostLoginRedirectPath;
  }

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
  if (consumedPostLoginRedirectPath) {
    return consumedPostLoginRedirectPath;
  }

  const stored = peekPostLoginRedirectPath();
  consumedPostLoginRedirectPath = stored;
  removeStoredPostLoginRedirectPath();
  return stored;
}

export function consumePostLogoutRestartPath(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = String(
      window.sessionStorage.getItem(POST_LOGOUT_RESTART_PATH_STORAGE_KEY) ?? ''
    ).trim();
    removeStoredPostLogoutRestartPath();
    return stored || null;
  } catch {
    return null;
  }
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

function resolveSilentRedirectUri(redirectUri: string): string {
  const normalizedRedirectUri = String(redirectUri ?? '').trim();
  if (!normalizedRedirectUri) {
    return '';
  }

  try {
    return new URL(SILENT_AUTH_REDIRECT_PATH, normalizedRedirectUri).toString();
  } catch {
    return '';
  }
}

function resolveInteractionReason(request?: InteractiveAuthRequest): string {
  const reason = String(request?.reason ?? '').trim();
  return reason || 'Your secure session needs to be refreshed before protected data can load.';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const oidcClientId = config.oidcClientId;
  const oidcAuthority = config.oidcAuthority;
  const oidcScopes = config.oidcScopes;
  const oidcRedirectUri = config.oidcRedirectUri;
  const authRequired = config.authRequired;
  const oidcPostLogoutRedirectUri = resolvePostLogoutRedirectUri(
    config.oidcPostLogoutRedirectUri,
    oidcRedirectUri
  );
  const oidcSilentRedirectUri = resolveSilentRedirectUri(oidcRedirectUri);

  const enabled =
    config.oidcEnabled &&
    Boolean(oidcClientId && oidcAuthority && oidcRedirectUri && oidcScopes.length > 0);

  const msalSession = useMemo(
    () =>
      getMsalSession({
        enabled,
        clientId: oidcClientId,
        authority: oidcAuthority,
        redirectUri: oidcRedirectUri,
        postLogoutRedirectUri: oidcPostLogoutRedirectUri || oidcRedirectUri,
        silentRedirectUri: oidcSilentRedirectUri,
        scopes: oidcScopes
      }),
    [
      enabled,
      oidcAuthority,
      oidcClientId,
      oidcPostLogoutRedirectUri,
      oidcRedirectUri,
      oidcSilentRedirectUri,
      oidcScopes
    ]
  );

  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<AuthPhase>(
    enabled && typeof window !== 'undefined' && isCallbackPath(window.location.pathname)
      ? 'redirecting'
      : enabled && authRequired
        ? 'initializing'
        : 'signed-out'
  );
  const [error, setError] = useState<string | null>(null);
  const [interactionReason, setInteractionReason] = useState<string | null>(null);
  const [interactionRequest, setInteractionRequest] = useState<InteractiveAuthRequest | null>(null);

  useEffect(() => {
    logAuthTransition('provider-config', {
      enabled,
      authRequired,
      oidcEnabled: config.oidcEnabled,
      apiBaseUrl: config.apiBaseUrl,
      authority: oidcAuthority || null,
      redirectUri: oidcRedirectUri || null,
      postLogoutRedirectUri: oidcPostLogoutRedirectUri || null,
      silentRedirectUri: oidcSilentRedirectUri || null,
      scopes: oidcScopes
    });
  }, [
    authRequired,
    enabled,
    oidcAuthority,
    oidcPostLogoutRedirectUri,
    oidcRedirectUri,
    oidcSilentRedirectUri,
    oidcScopes
  ]);

  const beginLoginRedirect = useMemo(() => {
    if (!msalSession) {
      return null;
    }

    return async (returnPath?: string) => {
      if (msalSession.getRedirectInFlight()) {
        logAuthTransition('redirect-start-suppressed', {
          returnPath: resolveReturnPath(returnPath)
        });
        return;
      }

      const nextReturnPath = resolveReturnPath(returnPath);
      clearReauthRequestState();
      msalSession.setRedirectInFlight(true);
      setError(null);
      setInteractionReason(null);
      setInteractionRequest(null);
      setPhase('redirecting');
      setReady(true);
      storePostLoginRedirectPath(nextReturnPath);
      logAuthTransition('redirect-start', {
        returnPath: nextReturnPath,
        scopes: oidcScopes
      });

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
    const onLogoutCompletePath = isLogoutCompletePath(pathname);

    setReady(false);
    setError(null);
    setInteractionReason(null);
    setInteractionRequest(null);
    setPhase(onCallbackPath ? 'redirecting' : authRequired ? 'initializing' : 'signed-out');
    logAuthTransition('bootstrap-start', {
      pathname,
      authRequired,
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
        setReady(true);
        logAuthTransition('bootstrap-authenticated', {
          callback: onCallbackPath,
          redirectResult: Boolean(result.redirectResult),
          returnPath: peekPostLoginRedirectPath(),
          account: summarizeAccountForLogs(result.account)
        });
        return;
      }

      setAccount(null);
      setInteractionReason(null);
      setInteractionRequest(null);
      setError(null);
      setPhase('signed-out');
      setReady(true);
      logAuthTransition(
        result.interactionRequired ? 'bootstrap-interaction-required' : 'bootstrap-signed-out',
        {
          pathname,
          callback: onCallbackPath,
          interactionRequired: result.interactionRequired
        }
      );
    };

    bootstrap().catch((err) => {
      msalSession.setRedirectInFlight(false);
      console.error('OIDC bootstrap failed', err);
      logAuthTransition(
        'bootstrap-failed',
        {
          pathname,
          callback: onCallbackPath,
          logoutComplete: onLogoutCompletePath,
          error: err
        },
        'error'
      );
      if (!cancelled) {
        setAccount(null);
        setInteractionReason(null);
        setInteractionRequest(null);
        setError(describeAuthError('OIDC sign-in could not be completed.', err));
        setPhase('signed-out');
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authRequired, msalSession]);

  useEffect(() => {
    if (!msalSession) {
      logAuthTransition('access-token-provider-cleared', {
        reason: 'msal-session-unavailable'
      });
      setAccessTokenProvider(null);
      return;
    }

    logAuthTransition('access-token-provider-registered', {
      account: summarizeAccountForLogs(account),
      scopes: oidcScopes
    });
    setAccessTokenProvider(async (options: AccessTokenRequestOptions = {}) => {
      logAuthTransition('access-token-request-start', {
        account: summarizeAccountForLogs(account),
        scopes: oidcScopes,
        forceRefresh: Boolean(options.forceRefresh)
      });
      if (!account) {
        logAuthTransition(
          'access-token-request-no-account',
          {
            scopes: oidcScopes,
            forceRefresh: Boolean(options.forceRefresh)
          },
          'warn'
        );
        return null;
      }

      try {
        const instance = await msalSession.ensureInitialized();
        const result = await instance.acquireTokenSilent({
          account,
          scopes: oidcScopes,
          forceRefresh: Boolean(options.forceRefresh)
        });
        logAuthTransition('access-token-request-success', {
          account: summarizeAccountForLogs(result.account ?? account),
          scopes: result.scopes ?? oidcScopes,
          expiresOn: result.expiresOn?.toISOString() ?? null,
          forceRefresh: Boolean(options.forceRefresh),
          hasAccessToken: Boolean(result.accessToken),
          tokenClaims: summarizeJwtClaimsForLogs(result.accessToken)
        });
        return result.accessToken || null;
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          logAuthTransition(
            'access-token-request-interaction-required',
            {
              account: summarizeAccountForLogs(account),
              scopes: oidcScopes,
              forceRefresh: Boolean(options.forceRefresh),
              error: err
            },
            'warn'
          );
          throw createInteractionRequiredError('OIDC session refresh requires sign-in.');
        }
        console.error('Failed to acquire access token', err);
        logAuthTransition(
          'access-token-request-failed',
          {
            account: summarizeAccountForLogs(account),
            scopes: oidcScopes,
            forceRefresh: Boolean(options.forceRefresh),
            error: err
          },
          'error'
        );
        throw new Error(describeAuthError('OIDC access token acquisition failed.', err), {
          cause: err
        });
      }
    });

    return () => {
      logAuthTransition('access-token-provider-cleared', {
        reason: 'effect-cleanup'
      });
      setAccessTokenProvider(null);
    };
  }, [account, msalSession, oidcScopes]);

  useEffect(() => {
    if (!enabled || !authRequired) {
      logAuthTransition('interactive-auth-handler-cleared', {
        enabled,
        authRequired
      });
      setInteractiveAuthHandler(null);
      return;
    }

    logAuthTransition('interactive-auth-handler-registered', {
      enabled,
      authRequired
    });
    setInteractiveAuthHandler((request = {}) => {
      if (typeof window !== 'undefined' && isLogoutCompletePath(window.location.pathname)) {
        logAuthTransition('reauth-suppressed-on-logout-route', {
          source: request.source ?? null
        });
        return;
      }

      const nextReturnPath = resolveReturnPath(request.returnPath);
      storePostLoginRedirectPath(nextReturnPath);
      msalSession?.setRedirectInFlight(false);
      setAccount(null);
      setReady(true);
      setError(null);
      setInteractionReason(resolveInteractionReason(request));
      setInteractionRequest(request);
      setPhase('session-expired');
      logAuthTransition('reauth-required', {
        source: request.source ?? null,
        reason: request.reason ?? null,
        returnPath: nextReturnPath,
        endpoint: request.endpoint ?? null,
        status: request.status ?? null,
        requestId: request.requestId ?? null,
        recoveryAttempt: request.recoveryAttempt ?? null
      });
    });

    return () => {
      logAuthTransition('interactive-auth-handler-cleared', {
        reason: 'effect-cleanup'
      });
      setInteractiveAuthHandler(null);
    };
  }, [authRequired, enabled, msalSession]);

  const signIn = (returnPath?: string) => {
    if (!beginLoginRedirect) {
      logAuthTransition(
        'sign-in-ignored',
        {
          returnPath: resolveReturnPath(returnPath),
          reason: 'login-redirect-unavailable'
        },
        'warn'
      );
      return;
    }

    void beginLoginRedirect(returnPath).catch(() => undefined);
  };

  const beginSignOut = (restartReturnPath?: string | null) => {
    if (!msalSession || phase === 'redirecting' || phase === 'signing-out') {
      logAuthTransition(
        'sign-out-ignored',
        {
          user: account?.username ?? null,
          phase,
          hasMsalSession: Boolean(msalSession)
        },
        'warn'
      );
      return;
    }

    if (restartReturnPath) {
      storePostLogoutRestartPath(restartReturnPath);
    } else {
      clearPostLogoutRestartPath();
    }
    clearReauthRequestState();
    msalSession.setRedirectInFlight(false);
    clearPostLoginRedirectPath();
    setInteractionReason(null);
    setInteractionRequest(null);
    setError(null);
    setPhase('signing-out');
    logAuthTransition('sign-out-start', {
      user: account?.username ?? null,
      restartReturnPath: restartReturnPath ?? null
    });

    void msalSession
      .ensureInitialized()
      .then((instance) => {
        logAuthTransition('sign-out-redirect-dispatched', {
          user: account?.username ?? null,
          postLogoutRedirectUri: oidcPostLogoutRedirectUri || null,
          restartReturnPath: restartReturnPath ?? null
        });
        return instance.logoutRedirect({
          account: account ?? undefined,
          postLogoutRedirectUri: oidcPostLogoutRedirectUri || undefined
        });
      })
      .catch((err) => {
        console.error('OIDC sign-out failed', err);
        logAuthTransition(
          'sign-out-failed',
          {
            user: account?.username ?? null,
            restartReturnPath: restartReturnPath ?? null,
            error: err
          },
          'error'
        );
        clearPostLogoutRestartPath();
        setPhase(account ? 'authenticated' : 'signed-out');
        setError(describeAuthError('OIDC sign-out could not be completed.', err));
      });
  };

  const signOut = () => {
    beginSignOut(null);
  };

  const signOutAndRestart = (returnPath?: string) => {
    beginSignOut(resolveReturnPath(returnPath));
  };

  const userLabel = account?.name || account?.username || null;
  const busy = phase === 'initializing' || phase === 'redirecting' || phase === 'signing-out';

  return (
    <AuthContext.Provider
      value={{
        enabled,
        ready,
        authenticated: Boolean(account) && phase === 'authenticated',
        phase,
        busy,
        userLabel,
        error,
        interactionReason,
        interactionRequest,
        signIn,
        signOut,
        signOutAndRestart
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
