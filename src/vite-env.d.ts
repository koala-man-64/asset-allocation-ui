/// <reference types="vite/client" />

import type { UiRuntimeConfig } from '@asset-allocation/contracts';

interface Window {
  __API_UI_CONFIG__?: Partial<UiRuntimeConfig> & {
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
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_OIDC_SCOPES?: string;
  readonly VITE_OIDC_AUDIENCE?: string;
}
