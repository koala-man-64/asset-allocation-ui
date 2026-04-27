/// <reference types="vite/client" />

import type { UiRuntimeConfig } from '@asset-allocation/contracts';

interface Window {
  __API_UI_CONFIG__?: Omit<
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
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_UI_AUTH_ENABLED?: string;
  readonly VITE_UI_AUTH_PROVIDER?: string;
  readonly VITE_AUTH_SESSION_MODE?: string;
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_OIDC_SCOPES?: string;
  readonly VITE_OIDC_AUDIENCE?: string;
  readonly VITE_OIDC_REDIRECT_URI?: string;
  readonly VITE_OIDC_POST_LOGOUT_REDIRECT_URI?: string;
}
