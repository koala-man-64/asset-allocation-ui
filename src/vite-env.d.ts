/// <reference types="vite/client" />

import type { UiRuntimeConfig } from '@asset-allocation/contracts';

interface Window {
  __API_UI_CONFIG__?: Partial<UiRuntimeConfig> & {
    oidcScopes?: string[] | string;
    oidcAudience?: string[] | string;
  };
}
