// Runtime UI overrides injected by the UI container in deployed environments.
// Local Vite development serves this placeholder file.
/* global window */

window.__API_UI_CONFIG__ = {
  ...(window.__API_UI_CONFIG__ || {})
};
