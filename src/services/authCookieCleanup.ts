const AUTH_COOKIE_NAMES = [
  '__Host-aa_session',
  '__Host-aa_csrf',
  'aa_session',
  'aa_session_dev',
  'aa_csrf',
  'aa_csrf_dev'
] as const;

const AUTH_COOKIE_PATHS = ['/', '/api'] as const;

function isIpv4Address(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function resolveCookieDomains(): Array<string | null> {
  if (typeof window === 'undefined') {
    return [null];
  }

  const hostname = window.location.hostname.trim().toLowerCase();
  if (!hostname || hostname === 'localhost' || isIpv4Address(hostname) || hostname.includes(':')) {
    return [null];
  }

  const parts = hostname.split('.').filter(Boolean);
  const registrableDomain = parts.length > 2 ? `.${parts.slice(-2).join('.')}` : `.${hostname}`;
  return Array.from(new Set<string | null>([null, hostname, registrableDomain]));
}

function expireCookie(name: string, path: string, domain: string | null): void {
  const attributes = [
    `${name}=`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    `Path=${path}`,
    'SameSite=Lax'
  ];

  if (name.startsWith('__Host-')) {
    attributes.push('Secure');
  } else if (domain) {
    attributes.push(`Domain=${domain}`);
  }

  document.cookie = attributes.join('; ');
}

export function clearAssociatedAuthCookies(): number {
  if (typeof document === 'undefined') {
    return 0;
  }

  const domains = resolveCookieDomains();
  let attempts = 0;

  for (const name of AUTH_COOKIE_NAMES) {
    const paths = name.startsWith('__Host-') ? ['/'] : AUTH_COOKIE_PATHS;
    const cookieDomains = name.startsWith('__Host-') ? [null] : domains;

    for (const path of paths) {
      for (const domain of cookieDomains) {
        expireCookie(name, path, domain);
        attempts += 1;
      }
    }
  }

  return attempts;
}
