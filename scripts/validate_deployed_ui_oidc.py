from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any, Callable
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


CONFIG_ASSIGNMENT_PATTERN = re.compile(
    r"window\.__API_UI_CONFIG__\s*=\s*(\{.*?\})\s*;",
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
        raise ValidationError(
            "--ui-origin must be an absolute URL such as https://asset-allocation-ui.example.com."
        )

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
        raise ValidationError(
            f"Could not parse {source_label} window.__API_UI_CONFIG__ payload."
        )

    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise ValidationError(
            f"{source_label} does not contain valid JSON for window.__API_UI_CONFIG__."
        ) from exc

    if not isinstance(payload, dict):
        raise ValidationError(
            f"{source_label} window.__API_UI_CONFIG__ payload must be a JSON object."
        )
    return payload


def validate_ui_config_override(script_text: str) -> None:
    missing = [
        fragment
        for fragment in REQUIRED_UI_CONFIG_FRAGMENTS
        if fragment not in script_text
    ]
    if missing:
        raise ValidationError(
            "ui-config.js is missing the runtime same-origin OIDC override fragments: "
            + ", ".join(missing)
        )


def validate_required_string(config: dict[str, Any], key: str) -> str:
    value = str(config.get(key) or "").strip()
    if not value:
        raise ValidationError(f"ui-config.js is missing {key}.")
    return value


def validate_deployed_ui_oidc(
    ui_origin: str,
    ui_auth_enabled: bool = True,
    expected_api_base_url: str = "/api",
    timeout_seconds: float = 20.0,
    fetcher: Callable[[str, float], str] | None = None,
) -> dict[str, Any]:
    origin = normalize_ui_origin(ui_origin)
    fetch = fetcher or fetch_text

    ui_config_js = fetch(f"{origin}/ui-config.js", timeout_seconds)

    config = parse_runtime_config(ui_config_js, f"{origin}/ui-config.js")
    validate_ui_config_override(ui_config_js)

    advertised_api_base_url = str(config.get("apiBaseUrl") or "").strip()
    if advertised_api_base_url != expected_api_base_url:
        raise ValidationError(
            f"ui-config.js advertises apiBaseUrl={advertised_api_base_url or '<empty>'}, "
            f"expected {expected_api_base_url}."
        )

    expected_redirect_uri = f"{origin}/auth/callback"
    expected_post_logout_redirect_uri = f"{origin}/auth/logout-complete"
    advertised_ui_auth_enabled = parse_bool(config.get("uiAuthEnabled", False))
    if advertised_ui_auth_enabled != ui_auth_enabled:
        raise ValidationError(
            f"ui-config.js advertises uiAuthEnabled={advertised_ui_auth_enabled}, expected {ui_auth_enabled}."
        )

    advertised_auth_required = parse_bool(config.get("authRequired", False))
    if advertised_auth_required != ui_auth_enabled:
        raise ValidationError(
            f"ui-config.js advertises authRequired={advertised_auth_required}, expected {ui_auth_enabled}."
        )

    advertised_oidc_enabled = parse_bool(config.get("oidcEnabled", False))
    if ui_auth_enabled:
        validate_required_string(config, "oidcAuthority")
        validate_required_string(config, "oidcClientId")
        validate_required_string(config, "oidcScopes")
        if not advertised_oidc_enabled:
            raise ValidationError(
                "ui-config.js must advertise oidcEnabled=true when UI auth is enabled."
            )
    elif advertised_oidc_enabled:
        raise ValidationError(
            "ui-config.js must advertise oidcEnabled=false when UI auth is disabled."
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
        "--expected-api-base-url",
        default="/api",
        help="Expected same-origin API base URL published by ui-config.js. Defaults to /api.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=20.0,
        help="HTTP timeout in seconds for fetching ui-config.js.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_argument_parser()
    args = parser.parse_args(argv)

    try:
        result = validate_deployed_ui_oidc(
            ui_origin=args.ui_origin,
            ui_auth_enabled=parse_bool(args.ui_auth_enabled),
            expected_api_base_url=args.expected_api_base_url,
            timeout_seconds=args.timeout_seconds,
        )
    except ValidationError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    config = result["config"]
    print(f"Validated deployed UI OIDC for {result['ui_origin']}")
    print(f"apiBaseUrl={config.get('apiBaseUrl')}")
    print(
        f"authRequired={config.get('authRequired')} oidcEnabled={config.get('oidcEnabled')}"
    )
    print(f"expectedOidcRedirectUri={result['expected_redirect_uri']}")
    print(
        f"expectedOidcPostLogoutRedirectUri={result['expected_post_logout_redirect_uri']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
