import type { UiRuntimeConfig } from '@asset-allocation/contracts';

import { normalizeApiBaseUrl } from '@/utils/apiBaseUrl';
import { logUiDiagnostic, summarizeUrlForLogs } from '@/services/uiDiagnostics';

export type AuthProvider = 'disabled' | 'oidc' | 'password';
export type AuthSessionMode = 'bearer' | 'cookie';

type RuntimeUiConfigSource = Omit<
  Partial<UiRuntimeConfig>,
  | 'authProvider'
  | 'authSessionMode'
  | 'oidcScopes'
  | 'oidcAudience'
  | 'oidcPostLogoutRedirectUri'
  | 'uiAuthEnabled'
> & {
  authProvider?: string;
  authSessionMode?: string;
  oidcScopes?: string[] | string;
  oidcAudience?: string[] | string;
  oidcPostLogoutRedirectUri?: string;
  uiAuthEnabled?: boolean | string;
};

declare global {
  interface Window {
    __API_UI_CONFIG__?: RuntimeUiConfigSource;
  }
}

function resolveBoolean(...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on', 't'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off', 'f'].includes(normalized)) {
      return false;
    }
  }
  return false;
}

function resolveString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function resolveScopes(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map(String)
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  if (typeof raw !== 'string') {
    return [];
  }

  const normalized = raw.replace(/,/g, ' ').trim();
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

function resolveAuthProvider(...values: unknown[]): AuthProvider | null {
  for (const value of values) {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (normalized === 'disabled' || normalized === 'oidc' || normalized === 'password') {
      return normalized;
    }
  }
  return null;
}

function resolveAuthSessionMode(
  defaultMode: AuthSessionMode,
  ...values: unknown[]
): AuthSessionMode {
  for (const value of values) {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (normalized === 'cookie' || normalized === 'bearer') {
      return normalized;
    }
  }
  return defaultMode;
}

function derivePostLogoutRedirectUri(
  explicitPostLogoutRedirectUri: unknown,
  redirectUri: string
): string {
  const explicit = resolveString(explicitPostLogoutRedirectUri);
  if (explicit) {
    return explicit;
  }
  if (!redirectUri) {
    return '';
  }
  try {
    return new URL('/auth/logout-complete', redirectUri).toString();
  } catch {
    return '';
  }
}

function deriveOidcRedirectUri(
  explicitRedirectUri: unknown,
  oidcAuthority: string,
  oidcClientId: string,
  oidcScopes: string[]
): string {
  const explicit = resolveString(explicitRedirectUri);
  if (explicit) {
    return explicit;
  }
  if (typeof window === 'undefined' || !oidcAuthority || !oidcClientId || oidcScopes.length === 0) {
    return '';
  }

  try {
    return new URL('/auth/callback', window.location.origin).toString();
  } catch {
    return '';
  }
}

const runtimeConfig = typeof window === 'undefined' ? {} : window.__API_UI_CONFIG__ || {};
const isDevLike = Boolean(import.meta.env.DEV || import.meta.env.MODE === 'test');
const rawUiAuthEnabled = resolveBoolean(
  runtimeConfig.uiAuthEnabled,
  isDevLike ? import.meta.env.VITE_UI_AUTH_ENABLED : undefined,
  true
);
const oidcAuthority = resolveString(
  runtimeConfig.oidcAuthority,
  isDevLike ? import.meta.env.VITE_OIDC_AUTHORITY : undefined
);
const oidcClientId = resolveString(
  runtimeConfig.oidcClientId,
  isDevLike ? import.meta.env.VITE_OIDC_CLIENT_ID : undefined
);
const oidcScopes = resolveScopes(
  runtimeConfig.oidcScopes ?? (isDevLike ? import.meta.env.VITE_OIDC_SCOPES : undefined)
);
const oidcAudience = resolveScopes(
  runtimeConfig.oidcAudience ?? (isDevLike ? import.meta.env.VITE_OIDC_AUDIENCE : undefined)
);
const oidcRedirectUri = deriveOidcRedirectUri(
  runtimeConfig.oidcRedirectUri ?? (isDevLike ? import.meta.env.VITE_OIDC_REDIRECT_URI : undefined),
  oidcAuthority,
  oidcClientId,
  oidcScopes
);
const oidcPostLogoutRedirectUri = derivePostLogoutRedirectUri(
  runtimeConfig.oidcPostLogoutRedirectUri ??
    (isDevLike ? import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI : undefined),
  oidcRedirectUri
);
const inferredAuthProvider =
  resolveAuthProvider(
    runtimeConfig.authProvider,
    isDevLike ? import.meta.env.VITE_UI_AUTH_PROVIDER : undefined
  ) ??
  (rawUiAuthEnabled && (oidcAuthority || oidcClientId || oidcScopes.length > 0) ? 'oidc' : 'disabled');
const uiAuthEnabled = rawUiAuthEnabled;
const authProvider: AuthProvider = uiAuthEnabled ? inferredAuthProvider : 'disabled';
const authRequired = uiAuthEnabled
  ? resolveBoolean(
      runtimeConfig.authRequired,
      runtimeConfig.uiAuthEnabled,
      isDevLike ? import.meta.env.VITE_UI_AUTH_ENABLED : undefined,
      true
    )
  : false;
const authSessionMode = resolveAuthSessionMode(
  'cookie',
  authProvider === 'password' ? 'cookie' : runtimeConfig.authSessionMode,
  authProvider === 'password'
    ? 'cookie'
    : isDevLike
      ? import.meta.env.VITE_AUTH_SESSION_MODE
      : undefined
);
const oidcEnabled =
  authRequired &&
  authProvider === 'oidc' &&
  resolveBoolean(
    runtimeConfig.oidcEnabled,
    Boolean(oidcAuthority && oidcClientId && oidcRedirectUri && oidcScopes.length > 0)
  );
const apiBaseUrl = normalizeApiBaseUrl(
  runtimeConfig.apiBaseUrl || (isDevLike ? import.meta.env.VITE_API_BASE_URL : undefined),
  '/api'
);

if (typeof window !== 'undefined') {
  const nextRuntimeConfig: RuntimeUiConfigSource = {
    ...(window.__API_UI_CONFIG__ || {}),
    apiBaseUrl,
    authProvider,
    authSessionMode,
    oidcScopes,
    oidcAudience,
    uiAuthEnabled,
    oidcEnabled,
    authRequired
  };
  if (oidcAuthority) {
    nextRuntimeConfig.oidcAuthority = oidcAuthority;
  }
  if (oidcClientId) {
    nextRuntimeConfig.oidcClientId = oidcClientId;
  }
  if (oidcRedirectUri) {
    nextRuntimeConfig.oidcRedirectUri = oidcRedirectUri;
  }
  if (oidcPostLogoutRedirectUri) {
    nextRuntimeConfig.oidcPostLogoutRedirectUri = oidcPostLogoutRedirectUri;
  }
  window.__API_UI_CONFIG__ = nextRuntimeConfig;

  logUiDiagnostic('Config', 'runtime-config-resolved', {
    origin: window.location.origin,
    apiBaseUrl,
    apiBaseUrlMode: /^https?:\/\//i.test(apiBaseUrl) ? 'absolute' : 'same-origin',
    apiBaseUrlDetails: summarizeUrlForLogs(apiBaseUrl),
    authProvider,
    authSessionMode,
    uiAuthEnabled,
    authRequired,
    oidcEnabled,
    oidcAuthority: oidcAuthority || null,
    oidcClientIdConfigured: Boolean(oidcClientId),
    oidcScopes,
    oidcAudience,
    oidcRedirectUri: oidcRedirectUri || null,
    oidcPostLogoutRedirectUri: oidcPostLogoutRedirectUri || null
  });
}

export const config = {
  apiBaseUrl,
  authProvider,
  authSessionMode,
  uiAuthEnabled,
  oidcEnabled,
  authRequired,
  oidcAuthority,
  oidcClientId,
  oidcScopes,
  oidcRedirectUri,
  oidcPostLogoutRedirectUri,
  oidcAudience
};
