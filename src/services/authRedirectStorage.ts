const POST_LOGIN_PATH_STORAGE_KEY = 'asset-allocation.post-login-path';
const POST_LOGOUT_RESTART_PATH_STORAGE_KEY = 'asset-allocation.post-logout-restart-path';

export const DEFAULT_POST_LOGIN_PATH = '/system-status';
export const LOGIN_PATH = '/login';

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

export function sanitizeReturnPath(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  if (
    trimmed === LOGIN_PATH ||
    trimmed.startsWith('/login?') ||
    trimmed === '/auth/callback' ||
    trimmed.startsWith('/auth/callback?') ||
    trimmed === '/auth/logout-complete'
  ) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return trimmed;
}

export function currentRoute(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return sanitizeReturnPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

export function buildLoginPath(
  returnTo?: string,
  options: { loggedOut?: boolean } = {}
): string {
  const params = new URLSearchParams();
  params.set('returnTo', sanitizeReturnPath(returnTo || currentRoute()));
  if (options.loggedOut) {
    params.set('loggedOut', '1');
  }
  return `${LOGIN_PATH}?${params.toString()}`;
}

export function storePostLoginRedirectPath(value: string): void {
  storeValue(POST_LOGIN_PATH_STORAGE_KEY, sanitizeReturnPath(value));
}

export function peekPostLoginRedirectPath(): string {
  return sanitizeReturnPath(readValue(POST_LOGIN_PATH_STORAGE_KEY));
}

export function consumePostLoginRedirectPath(): string {
  const value = peekPostLoginRedirectPath();
  removeStoredValue(POST_LOGIN_PATH_STORAGE_KEY);
  return value;
}

export function storePostLogoutRestartPath(value: string): void {
  storeValue(POST_LOGOUT_RESTART_PATH_STORAGE_KEY, sanitizeReturnPath(value));
}

export function consumePostLogoutRestartPath(): string | null {
  const rawValue = readValue(POST_LOGOUT_RESTART_PATH_STORAGE_KEY);
  removeStoredValue(POST_LOGOUT_RESTART_PATH_STORAGE_KEY);
  return rawValue ? sanitizeReturnPath(rawValue) : null;
}

export function clearStoredAuthRedirects(): void {
  removeStoredValue(POST_LOGIN_PATH_STORAGE_KEY);
  removeStoredValue(POST_LOGOUT_RESTART_PATH_STORAGE_KEY);
}
