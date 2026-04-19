// Runtime UI bootstrap owned by the UI container.
// Local Vite development serves this fallback file when the container entrypoint
// has not rewritten /ui-config.js yet.
/* global window */

window.__API_UI_CONFIG__ = {
  "apiBaseUrl": "/api"
};

const currentUiConfig = window.__API_UI_CONFIG__ || {};
const normalizedOidcEnabled = String(currentUiConfig.oidcEnabled || '')
  .trim()
  .toLowerCase();
const oidcConfigured = Boolean(
  ['1', 'true', 'yes', 'y', 'on', 't'].includes(normalizedOidcEnabled) ||
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
