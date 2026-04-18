// Runtime UI overrides injected by the UI container in deployed environments.
// Local Vite development serves this fallback file when the container entrypoint
// has not rewritten /ui-config.js yet.
/* global window */

const currentUiConfig = window.__API_UI_CONFIG__ || {};
const oidcConfigured = Boolean(
  currentUiConfig.oidcEnabled ||
    (currentUiConfig.oidcAuthority && currentUiConfig.oidcClientId)
);
const sameOriginRedirectUri = new URL('/auth/callback', window.location.origin).toString();
const sameOriginPostLogoutRedirectUri = new URL(
  '/auth/logout-complete',
  window.location.origin
).toString();

window.__API_UI_CONFIG__ = {
  ...currentUiConfig,
  ...(oidcConfigured
    ? {
        oidcRedirectUri: sameOriginRedirectUri,
        oidcPostLogoutRedirectUri: sameOriginPostLogoutRedirectUri
      }
    : {})
};
