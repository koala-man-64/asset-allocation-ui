#!/bin/sh
set -eu

output_path='/usr/share/nginx/html/ui-config.js'
ui_auth_enabled="${UI_AUTH_ENABLED:-}"
ui_auth_provider="${UI_AUTH_PROVIDER:-}"
ui_oidc_authority="${UI_OIDC_AUTHORITY:-}"
ui_oidc_client_id="${UI_OIDC_CLIENT_ID:-}"
ui_oidc_scopes="${UI_OIDC_SCOPES:-}"
ui_oidc_audience="${UI_OIDC_AUDIENCE:-}"

lower_auth_enabled="$(printf '%s' "${ui_auth_enabled}" | tr '[:upper:]' '[:lower:]')"
lower_auth_provider="$(printf '%s' "${ui_auth_provider}" | tr '[:upper:]' '[:lower:]')"

resolved_auth_provider='disabled'
resolved_auth_required='false'
resolved_ui_auth_enabled='false'
resolved_auth_session_mode='bearer'
resolved_oidc_enabled='false'

case "${lower_auth_enabled}" in
  1|true|yes|y|on|t)
    resolved_ui_auth_enabled='true'
    resolved_auth_required='true'
    case "${lower_auth_provider}" in
      oidc)
        resolved_auth_provider='oidc'
        resolved_auth_session_mode='bearer'
        if [ -n "${ui_oidc_authority}" ] && [ -n "${ui_oidc_client_id}" ] && [ -n "${ui_oidc_scopes}" ]; then
          resolved_oidc_enabled='true'
        fi
        ;;
      disabled)
        resolved_auth_provider='disabled'
        resolved_auth_required='false'
        resolved_ui_auth_enabled='false'
        ;;
      *)
        resolved_auth_provider='password'
        resolved_auth_session_mode='cookie'
        ;;
    esac
    ;;
esac

escaped_ui_auth_enabled=$(printf '%s' "${resolved_ui_auth_enabled}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_auth_required=$(printf '%s' "${resolved_auth_required}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_auth_provider=$(printf '%s' "${resolved_auth_provider}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_auth_session_mode=$(printf '%s' "${resolved_auth_session_mode}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_oidc_enabled=$(printf '%s' "${resolved_oidc_enabled}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_ui_oidc_authority=$(printf '%s' "${ui_oidc_authority}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_ui_oidc_client_id=$(printf '%s' "${ui_oidc_client_id}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_ui_oidc_scopes=$(printf '%s' "${ui_oidc_scopes}" | sed 's/\\/\\\\/g; s/"/\\"/g')
escaped_ui_oidc_audience=$(printf '%s' "${ui_oidc_audience}" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat > "${output_path}" <<EOF
// Runtime UI bootstrap injected by the UI container.
// This file must not contain secrets.
/* global window */

window.__API_UI_CONFIG__ = {
  "apiBaseUrl": "/api",
  "uiAuthEnabled": "${escaped_ui_auth_enabled}",
  "authRequired": "${escaped_auth_required}",
  "authProvider": "${escaped_auth_provider}",
  "authSessionMode": "${escaped_auth_session_mode}",
  "oidcEnabled": "${escaped_oidc_enabled}"
EOF

if [ "${resolved_auth_provider}" = 'oidc' ]; then
  if [ -n "${ui_oidc_authority}" ]; then
    printf '  ,"oidcAuthority": "%s"\n' "${escaped_ui_oidc_authority}" >> "${output_path}"
  fi

  if [ -n "${ui_oidc_client_id}" ]; then
    printf '  ,"oidcClientId": "%s"\n' "${escaped_ui_oidc_client_id}" >> "${output_path}"
  fi

  if [ -n "${ui_oidc_scopes}" ]; then
    printf '  ,"oidcScopes": "%s"\n' "${escaped_ui_oidc_scopes}" >> "${output_path}"
  fi

  if [ -n "${ui_oidc_audience}" ]; then
    printf '  ,"oidcAudience": "%s"\n' "${escaped_ui_oidc_audience}" >> "${output_path}"
  fi
fi

cat >> "${output_path}" <<EOF
};
EOF
