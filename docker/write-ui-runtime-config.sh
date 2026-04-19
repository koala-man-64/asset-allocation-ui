#!/bin/sh
set -eu

output_path='/usr/share/nginx/html/ui-config.js'
ui_auth_enabled="${UI_AUTH_ENABLED:-}"
ui_oidc_authority="${UI_OIDC_AUTHORITY:-}"
ui_oidc_client_id="${UI_OIDC_CLIENT_ID:-}"
ui_oidc_scopes="${UI_OIDC_SCOPES:-}"
ui_oidc_audience="${UI_OIDC_AUDIENCE:-}"

escaped_ui_auth_enabled=$(printf '%s' "${ui_auth_enabled}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_ui_oidc_authority=$(printf '%s' "${ui_oidc_authority}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_ui_oidc_client_id=$(printf '%s' "${ui_oidc_client_id}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_ui_oidc_scopes=$(printf '%s' "${ui_oidc_scopes}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_ui_oidc_audience=$(printf '%s' "${ui_oidc_audience}" | sed 's/\\/\\\\/g; s/"/\\"/g')

oidc_enabled='false'
case "$(printf '%s' "${ui_auth_enabled}" | tr '[:upper:]' '[:lower:]')" in
  1|true|yes|y|on|t)
    if [ -n "${ui_oidc_authority}" ] && [ -n "${ui_oidc_client_id}" ] && [ -n "${ui_oidc_scopes}" ]; then
      oidc_enabled='true'
    fi
    ;;
esac

cat > "${output_path}" <<EOF
// Runtime UI bootstrap injected by the UI container.
// This file must not contain secrets.
/* global window */

window.__API_UI_CONFIG__ = {
  "apiBaseUrl": "/api",
EOF

if [ -n "${ui_auth_enabled}" ]; then
  printf '  "uiAuthEnabled": "%s",\n' "${escaped_ui_auth_enabled}" >> "${output_path}"
  printf '  "authRequired": "%s",\n' "${escaped_ui_auth_enabled}" >> "${output_path}"
fi

if [ -n "${ui_oidc_authority}" ]; then
  printf '  "oidcAuthority": "%s",\n' "${escaped_ui_oidc_authority}" >> "${output_path}"
fi

if [ -n "${ui_oidc_client_id}" ]; then
  printf '  "oidcClientId": "%s",\n' "${escaped_ui_oidc_client_id}" >> "${output_path}"
fi

if [ -n "${ui_oidc_scopes}" ]; then
  printf '  "oidcScopes": "%s",\n' "${escaped_ui_oidc_scopes}" >> "${output_path}"
fi

if [ -n "${ui_oidc_audience}" ]; then
  printf '  "oidcAudience": "%s",\n' "${escaped_ui_oidc_audience}" >> "${output_path}"
fi

cat >> "${output_path}" <<EOF
  "oidcEnabled": "${oidc_enabled}"
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
        oidcPostLogoutRedirectUri: sameOriginPostLogoutRedirectUri,
      }
    : {}),
};
EOF
