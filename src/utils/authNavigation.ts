import { buildLoginPath, currentRoute, storePostLoginRedirectPath } from '@/services/authRedirectStorage';

export function redirectToLogin(returnTo?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  storePostLoginRedirectPath(returnTo || currentRoute());
  window.location.assign(buildLoginPath(returnTo));
}
