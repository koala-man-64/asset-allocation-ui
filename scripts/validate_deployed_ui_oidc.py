from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any, Callable
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


CONFIG_ASSIGNMENT_PATTERN = re.compile(
    r"window\.__API_UI_CONFIG__\s*=\s*(\{.*\})\s*;",
    re.S,
)
REQUIRED_UI_CONFIG_FRAGMENTS = (
    "window.location.origin",
    "oidcRedirectUri",
    "/auth/callback",
    "oidcPostLogoutRedirectUri",
    "/auth/logout-complete",
)
TRUTHY_VALUES = {"1", "true", "yes", "y", "on"}


class ValidationError(RuntimeError):
    """Raised when the deployed UI OIDC configuration is unsafe to ship."""


def parse_bool(value: str | bool) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in TRUTHY_VALUES


def normalize_ui_origin(ui_origin: str) -> str:
    candidate = ui_origin.strip().rstrip("/")
    if not candidate:
        raise ValidationError("--ui-origin is required.")

    parsed = urlsplit(candidate)
    if not parsed.scheme or not parsed.netloc:
        raise ValidationError("--ui-origin must be an absolute URL such as https://asset-allocation-ui.example.com.")

    return f"{parsed.scheme}://{parsed.netloc}"


def fetch_text(url: str, timeout_seconds: float) -> str:
    request = Request(url, headers={"User-Agent": "asset-allocation-ui/oidc-validator"})
    with urlopen(request, timeout=timeout_seconds) as response:
        status = getattr(response, "status", None) or response.getcode()
        if status != 200:
            raise ValidationError(f"Unexpected HTTP status {status} for GET {url}.")
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset)


def parse_runtime_config(script_text: str, source_label: str) -> dict[str, Any]:
    match = CONFIG_ASSIGNMENT_PATTERN.search(script_text)
    if not match:
        raise ValidationError(f"Could not parse {source_label} window.__API_UI_CONFIG__ payload.")

    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise ValidationError(f"{source_label} does not contain valid JSON for window.__API_UI_CONFIG__.") from exc

    if not isinstance(payload, dict):
        raise ValidationError(f"{source_label} window.__API_UI_CONFIG__ payload must be a JSON object.")
    return payload


def validate_ui_config_override(script_text: str) -> None:
    missing = [fragment for fragment in REQUIRED_UI_CONFIG_FRAGMENTS if fragment not in script_text]
    if missing:
        raise ValidationError(
            "ui-config.js is missing the runtime same-origin OIDC override fragments: "
            + ", ".join(missing)
        )


def validate_redirect_uri(
    label: str,
    actual: str,
    expected: str,
    remediation: str,
) -> None:
    normalized_actual = actual.strip()
    if not normalized_actual:
        raise ValidationError(f"Proxied /config.js is missing {label}.")
    if normalized_actual != expected:
        raise ValidationError(
            f"Proxied /config.js advertises {label}={normalized_actual}, expected {expected}. "
            f"{remediation}"
        )


def validate_deployed_ui_oidc(
    ui_origin: str,
    ui_auth_enabled: bool = True,
    require_upstream_match: bool = True,
    timeout_seconds: float = 20.0,
    fetcher: Callable[[str, float], str] | None = None,
) -> dict[str, Any]:
    origin = normalize_ui_origin(ui_origin)
    fetch = fetcher or fetch_text

    config_js = fetch(f"{origin}/config.js", timeout_seconds)
    ui_config_js = fetch(f"{origin}/ui-config.js", timeout_seconds)

    config = parse_runtime_config(config_js, f"{origin}/config.js")
    validate_ui_config_override(ui_config_js)

    if config.get("authRequired") and not ui_auth_enabled:
        raise ValidationError(
            "UI_AUTH_ENABLED=false is invalid because the proxied /config.js reports authRequired=true."
        )

    expected_redirect_uri = f"{origin}/auth/callback"
    expected_post_logout_redirect_uri = f"{origin}/auth/logout-complete"
    oidc_configured = bool(
        config.get("oidcEnabled")
        or (str(config.get("oidcAuthority") or "").strip() and str(config.get("oidcClientId") or "").strip())
    )

    if require_upstream_match and oidc_configured:
        remediation = (
            "Update the control-plane UI_OIDC_REDIRECT_URI, then rerun "
            r"..\asset-allocation-control-plane\scripts\ops\provision\provision_entra_oidc.ps1."
        )
        validate_redirect_uri(
            label="oidcRedirectUri",
            actual=str(config.get("oidcRedirectUri") or ""),
            expected=expected_redirect_uri,
            remediation=remediation,
        )
        validate_redirect_uri(
            label="oidcPostLogoutRedirectUri",
            actual=str(config.get("oidcPostLogoutRedirectUri") or ""),
            expected=expected_post_logout_redirect_uri,
            remediation=remediation,
        )

    return {
        "ui_origin": origin,
        "expected_redirect_uri": expected_redirect_uri,
        "expected_post_logout_redirect_uri": expected_post_logout_redirect_uri,
        "config": config,
    }


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate the deployed UI OIDC runtime config against the expected UI origin."
    )
    parser.add_argument(
        "--ui-origin",
        required=True,
        help="Absolute deployed UI origin, for example https://asset-allocation-ui.example.com",
    )
    parser.add_argument(
        "--ui-auth-enabled",
        default="true",
        help="Whether the deployed UI is expected to require browser auth. Defaults to true.",
    )
    parser.add_argument(
        "--allow-upstream-mismatch",
        action="store_true",
        help="Allow proxied /config.js to advertise a callback on a different origin.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=20.0,
        help="HTTP timeout in seconds for fetching config.js and ui-config.js.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_argument_parser()
    args = parser.parse_args(argv)

    try:
        result = validate_deployed_ui_oidc(
            ui_origin=args.ui_origin,
            ui_auth_enabled=parse_bool(args.ui_auth_enabled),
            require_upstream_match=not args.allow_upstream_mismatch,
            timeout_seconds=args.timeout_seconds,
        )
    except ValidationError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    config = result["config"]
    print(f"Validated deployed UI OIDC for {result['ui_origin']}")
    print(f"authRequired={config.get('authRequired')} oidcEnabled={config.get('oidcEnabled')}")
    print(f"oidcRedirectUri={config.get('oidcRedirectUri')}")
    print(f"oidcPostLogoutRedirectUri={config.get('oidcPostLogoutRedirectUri')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
