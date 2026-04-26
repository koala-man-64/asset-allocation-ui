// Runtime UI bootstrap owned by the UI container.
// Local Vite development serves this fallback file when the container entrypoint
// has not rewritten /ui-config.js yet.
/* global window */

window.__API_UI_CONFIG__ = {
  apiBaseUrl: '/api',
  uiAuthEnabled: 'false',
  authRequired: 'false',
  authProvider: 'disabled',
  authSessionMode: 'bearer',
  oidcEnabled: 'false'
};
