from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest


def repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "package.json").exists() and (candidate / ".github" / "workflows").is_dir():
            return candidate
    raise AssertionError("Could not resolve repository root from test path")


def load_validator_module():
    module_path = repo_root() / "scripts" / "validate_deployed_ui_oidc.py"
    spec = importlib.util.spec_from_file_location("validate_deployed_ui_oidc", module_path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Could not load module spec for {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def build_config_js(
    *,
    redirect_uri: str,
    post_logout_redirect_uri: str,
    auth_required: bool = True,
    oidc_enabled: bool = True,
) -> str:
    payload = {
        "apiBaseUrl": "/api",
        "oidcEnabled": oidc_enabled,
        "authRequired": auth_required,
        "oidcAuthority": "https://login.microsoftonline.com/example-tenant",
        "oidcClientId": "example-client-id",
        "oidcScopes": ["openid", "profile"],
        "oidcRedirectUri": redirect_uri,
        "oidcPostLogoutRedirectUri": post_logout_redirect_uri,
    }
    return f"window.__API_UI_CONFIG__ = {json.dumps(payload)};"


def build_ui_config_js() -> str:
    return """
const currentUiConfig = window.__API_UI_CONFIG__ || {};
const sameOriginRedirectUri = new URL('/auth/callback', window.location.origin).toString();
const sameOriginPostLogoutRedirectUri = new URL('/auth/logout-complete', window.location.origin).toString();
window.__API_UI_CONFIG__ = {
  ...currentUiConfig,
  oidcRedirectUri: sameOriginRedirectUri,
  oidcPostLogoutRedirectUri: sameOriginPostLogoutRedirectUri
};
"""


def make_fetcher(mapping: dict[str, str]):
    def fetcher(url: str, timeout_seconds: float) -> str:
        del timeout_seconds
        try:
            return mapping[url]
        except KeyError as exc:
            raise AssertionError(f"Unexpected URL fetch in test: {url}") from exc

    return fetcher


def test_validator_accepts_same_origin_redirect_contract() -> None:
    validator = load_validator_module()
    ui_origin = "https://asset-allocation-ui.example.com"
    result = validator.validate_deployed_ui_oidc(
        ui_origin=ui_origin,
        fetcher=make_fetcher(
            {
                f"{ui_origin}/config.js": build_config_js(
                    redirect_uri=f"{ui_origin}/auth/callback",
                    post_logout_redirect_uri=f"{ui_origin}/auth/logout-complete",
                ),
                f"{ui_origin}/ui-config.js": build_ui_config_js(),
            }
        ),
    )

    assert result["ui_origin"] == ui_origin
    assert result["expected_redirect_uri"] == f"{ui_origin}/auth/callback"
    assert result["config"]["oidcRedirectUri"] == f"{ui_origin}/auth/callback"


def test_validator_rejects_api_origin_redirect_drift() -> None:
    validator = load_validator_module()
    ui_origin = "https://asset-allocation-ui.example.com"
    with pytest.raises(validator.ValidationError) as excinfo:
        validator.validate_deployed_ui_oidc(
            ui_origin=ui_origin,
            fetcher=make_fetcher(
                {
                    f"{ui_origin}/config.js": build_config_js(
                        redirect_uri="https://asset-allocation-api.example.com/auth/callback",
                        post_logout_redirect_uri="https://asset-allocation-api.example.com/auth/logout-complete",
                    ),
                    f"{ui_origin}/ui-config.js": build_ui_config_js(),
                }
            ),
        )

    message = str(excinfo.value)
    assert "oidcRedirectUri" in message
    assert "UI_OIDC_REDIRECT_URI" in message
    assert "provision_entra_oidc.ps1" in message
