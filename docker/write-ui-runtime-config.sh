#!/bin/sh
set -eu

output_path='/usr/share/nginx/html/ui-config.js'
ui_auth_enabled="${UI_AUTH_ENABLED:-}"

escaped_ui_auth_enabled=$(printf '%s' "${ui_auth_enabled}" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat > "${output_path}" <<EOF
// Runtime UI overrides injected by the UI container.
// This file must not contain secrets.
/* global window */

window.__API_UI_CONFIG__ = {
  ...(window.__API_UI_CONFIG__ || {}),
EOF

if [ -n "${ui_auth_enabled}" ]; then
  printf '  uiAuthEnabled: "%s",\n' "${escaped_ui_auth_enabled}" >> "${output_path}"
fi

cat >> "${output_path}" <<'EOF'
};
EOF
