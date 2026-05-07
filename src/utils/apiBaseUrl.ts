export interface NormalizeApiBaseUrlOptions {
  currentProtocol?: string;
  coerceInsecureRemoteOnHttps?: boolean;
}

function normalizeProtocol(value: unknown): string {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  return raw.endsWith(':') ? raw : `${raw}:`;
}

function resolveCurrentProtocol(options: NormalizeApiBaseUrlOptions): string {
  const explicitProtocol = normalizeProtocol(options.currentProtocol);
  if (explicitProtocol) return explicitProtocol;

  if (typeof window === 'undefined') {
    return '';
  }
  return normalizeProtocol(window.location.protocol);
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function normalizeFallbackApiBaseUrl(fallback: string): string {
  const trimmed = fallback.trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/' || trimmed === 'api') {
    return '/api';
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function normalizeApiBaseUrl(
  value: unknown,
  fallback: string = '/api',
  options: NormalizeApiBaseUrlOptions = {}
): string {
  const raw = typeof value === 'string' ? value : '';
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  const withoutTrailingSlashes = trimmed.replace(/\/+$/, '');
  if (!withoutTrailingSlashes) return fallback;

  if (withoutTrailingSlashes === 'api') return '/api';

  if (/^https?:\/\//i.test(withoutTrailingSlashes)) {
    try {
      const url = new URL(withoutTrailingSlashes);
      if (
        options.coerceInsecureRemoteOnHttps !== false &&
        url.protocol.toLowerCase() === 'http:' &&
        resolveCurrentProtocol(options) === 'https:' &&
        !isLoopbackHost(url.hostname)
      ) {
        return normalizeFallbackApiBaseUrl(fallback);
      }

      const pathname = url.pathname.replace(/\/+$/, '');
      if (!pathname || pathname === '/') return `${url.origin}/api`;
      return `${url.origin}${pathname}`;
    } catch {
      return withoutTrailingSlashes;
    }
  }

  if (withoutTrailingSlashes === '/') return '/api';
  return withoutTrailingSlashes.startsWith('/')
    ? withoutTrailingSlashes
    : `/${withoutTrailingSlashes}`;
}

export function toWebSocketBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/^https?:\/\//i, (match) =>
    match.toLowerCase().startsWith('https') ? 'wss://' : 'ws://'
  );
}
