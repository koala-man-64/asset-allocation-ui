export interface SanitizeExternalUrlOptions {
  allowedProtocols?: string[];
  allowedHosts?: string[];
  allowRelative?: boolean;
}

export interface SanitizeOperatorUrlOptions {
  allowAzurePortal?: boolean;
  allowSameOrigin?: boolean;
}

const AZURE_PORTAL_ALLOWED_HOSTS = ['portal.azure.com', '*.portal.azure.com'] as const;

function hostMatches(hostname: string, pattern: string): boolean {
  const host = hostname.trim().toLowerCase();
  const rule = pattern.trim().toLowerCase();
  if (!host || !rule) return false;
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(1); // includes leading dot
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === rule;
}

export function sanitizeExternalUrl(
  value: string | null | undefined,
  options: SanitizeExternalUrlOptions = {}
): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const allowedProtocols = (
    options.allowedProtocols && options.allowedProtocols.length > 0
      ? options.allowedProtocols
      : ['https:']
  ).map((item) => String(item).trim().toLowerCase());
  const allowedHosts = (options.allowedHosts || [])
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);
  const allowRelative = Boolean(options.allowRelative);

  let parsed: URL;
  try {
    parsed = new URL(raw, window.location.origin);
  } catch {
    return '';
  }

  const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(raw);
  if (isRelative && !allowRelative) {
    return '';
  }

  const protocol = parsed.protocol.toLowerCase();
  if (!allowedProtocols.includes(protocol)) {
    return '';
  }

  if (allowedHosts.length > 0) {
    const hostname = parsed.hostname.toLowerCase();
    const hostAllowed = allowedHosts.some((pattern) => hostMatches(hostname, pattern));
    if (!hostAllowed) {
      return '';
    }
  }

  return parsed.toString();
}

function resolveCurrentOriginProtocols(): string[] {
  if (typeof window === 'undefined') {
    return ['https:'];
  }

  const currentProtocol = String(window.location.protocol || '').trim().toLowerCase();
  return Array.from(new Set(['https:', currentProtocol].filter(Boolean)));
}

function resolveCurrentOriginHosts(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  return hostname ? [hostname] : [];
}

function toAzurePortalUrl(raw: string): string {
  if (!raw) {
    return '';
  }

  if (/^portal\.azure\.com/i.test(raw)) {
    return `https://${raw}`;
  }

  if (raw.startsWith('#')) {
    return `https://portal.azure.com/${raw}`;
  }

  if (/^\/?subscriptions\//i.test(raw)) {
    const resourceId = raw.startsWith('/') ? raw : `/${raw}`;
    return `https://portal.azure.com/#resource${resourceId}`;
  }

  return '';
}

export function sanitizeOperatorUrl(
  value: string | null | undefined,
  options: SanitizeOperatorUrlOptions = {}
): string {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const allowAzurePortal = options.allowAzurePortal !== false;
  const allowSameOrigin = options.allowSameOrigin !== false;
  const sameOriginHosts = allowSameOrigin ? resolveCurrentOriginHosts() : [];
  const sameOriginProtocols = allowSameOrigin ? resolveCurrentOriginProtocols() : ['https:'];

  if (/^https?:\/\//i.test(raw)) {
    return sanitizeExternalUrl(raw, {
      allowedProtocols: sameOriginProtocols,
      allowedHosts: [
        ...sameOriginHosts,
        ...(allowAzurePortal ? Array.from(AZURE_PORTAL_ALLOWED_HOSTS) : [])
      ]
    });
  }

  if (allowSameOrigin && raw.startsWith('/')) {
    return sanitizeExternalUrl(raw, {
      allowRelative: true,
      allowedProtocols: sameOriginProtocols,
      allowedHosts: sameOriginHosts
    });
  }

  if (!allowAzurePortal) {
    return '';
  }

  const azurePortalUrl = toAzurePortalUrl(raw);
  if (!azurePortalUrl) {
    return '';
  }

  return sanitizeExternalUrl(azurePortalUrl, {
    allowedHosts: Array.from(AZURE_PORTAL_ALLOWED_HOSTS)
  });
}
