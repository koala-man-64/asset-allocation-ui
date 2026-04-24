import type { UiRuntimeConfig } from '@asset-allocation/contracts';

import { normalizeApiBaseUrl } from '@/utils/apiBaseUrl';
import { logUiDiagnostic, summarizeUrlForLogs } from '@/services/uiDiagnostics';

type RuntimeUiConfigSource = Omit<
  Partial<UiRuntimeConfig>,
  'authSessionMode' | 'oidcScopes' | 'oidcAudience' | 'oidcPostLogoutRedirectUri' | 'uiAuthEnabled'
> & {
  authSessionMode?: string;
  oidcScopes?: string[] | string;
  oidcAudience?: string[] | string;
  oidcPostLogoutRedirectUri?: string;
  uiAuthEnabled?: boolean | string;
};


export type AuthSessionMode = 'bearer' | 'cookie';

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

function resolveAuthSessionMode(...values: unknown[]): AuthSessionMode {
  for (const value of values) {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (normalized === 'cookie' || normalized === 'bearer') {
      return normalized;
    }
  }
  return 'bearer';
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

const apiBaseUrl = normalizeApiBaseUrl(
  runtimeConfig.apiBaseUrl || import.meta.env.VITE_API_BASE_URL,
  '/api'
);
const authSessionMode = resolveAuthSessionMode(
  runtimeConfig.authSessionMode,
  import.meta.env.VITE_AUTH_SESSION_MODE
);
const oidcAuthority = resolveString(
  runtimeConfig.oidcAuthority,
  import.meta.env.VITE_OIDC_AUTHORITY
);
const oidcClientId = resolveString(runtimeConfig.oidcClientId, import.meta.env.VITE_OIDC_CLIENT_ID);
const oidcScopes = resolveScopes(runtimeConfig.oidcScopes ?? import.meta.env.VITE_OIDC_SCOPES);
const oidcAudience = resolveScopes(
  runtimeConfig.oidcAudience ?? import.meta.env.VITE_OIDC_AUDIENCE
);
const oidcRedirectUri = deriveOidcRedirectUri(
  runtimeConfig.oidcRedirectUri,
  oidcAuthority,
  oidcClientId,
  oidcScopes
);
const oidcPostLogoutRedirectUri = derivePostLogoutRedirectUri(
  runtimeConfig.oidcPostLogoutRedirectUri,
  oidcRedirectUri
);
const uiAuthEnabled = resolveBoolean(
  runtimeConfig.uiAuthEnabled,
  import.meta.env.VITE_UI_AUTH_ENABLED,
  true
);
const oidcEnabled =
  uiAuthEnabled &&
  resolveBoolean(
    runtimeConfig.oidcEnabled,
    Boolean(oidcAuthority && oidcClientId && oidcRedirectUri)
  );
const authRequired =
  uiAuthEnabled &&
  resolveBoolean(
    runtimeConfig.authRequired,
    runtimeConfig.uiAuthEnabled,
    import.meta.env.VITE_UI_AUTH_ENABLED,
    true
  );

if (typeof window !== 'undefined') {
  const nextRuntimeConfig: RuntimeUiConfigSource = {
    ...(window.__API_UI_CONFIG__ || {}),
    apiBaseUrl,
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
    authSessionMode,
    uiAuthEnabled,
    oidcEnabled,
    authRequired,
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
