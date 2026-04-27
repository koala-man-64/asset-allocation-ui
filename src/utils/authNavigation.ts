function currentRoute(): string {
  if (typeof window === 'undefined') {
    return '/';
  }
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function buildLoginPath(returnTo?: string): string {
  const params = new URLSearchParams();
  params.set('returnTo', returnTo || currentRoute());
  return `/login?${params.toString()}`;
}

export function redirectToLogin(returnTo?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.location.assign(buildLoginPath(returnTo));
}
