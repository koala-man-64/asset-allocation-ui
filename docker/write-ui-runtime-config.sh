#!/bin/sh
set -eu

output_path='/usr/share/nginx/html/ui-config.js'
ui_auth_enabled="${UI_AUTH_ENABLED:-}"

escaped_ui_auth_enabled=$(printf '%s' "${ui_auth_enabled}" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat > "${output_path}" <<EOF
// Runtime UI overrides injected by the UI container.
// This file must not contain secrets.
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
EOF

if [ -n "${ui_auth_enabled}" ]; then
  printf '  uiAuthEnabled: "%s",\n' "${escaped_ui_auth_enabled}" >> "${output_path}"
fi

cat >> "${output_path}" <<'EOF'
  ...(oidcConfigured
    ? {
        // The UI owns both callback routes, so always return to the current UI origin
        // even if the upstream control plane advertises an API-host callback URL.
        oidcRedirectUri: sameOriginRedirectUri,
        oidcPostLogoutRedirectUri: sameOriginPostLogoutRedirectUri,
      }
    : {}),
};
EOF
