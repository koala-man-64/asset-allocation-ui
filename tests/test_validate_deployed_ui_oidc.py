from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest


def repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "package.json").exists() and (
            candidate / ".github" / "workflows"
        ).is_dir():
            return candidate
    raise AssertionError("Could not resolve repository root from test path")


def load_validator_module():
    module_path = repo_root() / "scripts" / "validate_deployed_ui_oidc.py"
    spec = importlib.util.spec_from_file_location(
        "validate_deployed_ui_oidc", module_path
    )
    if spec is None or spec.loader is None:
        raise AssertionError(f"Could not load module spec for {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def build_ui_config_js(
    *,
    api_base_url: str = "/api",
    ui_auth_enabled: bool = True,
    auth_provider: str = "oidc",
    auth_session_mode: str = "cookie",
    include_oidc: bool = False,
) -> str:
    payload = {
        "apiBaseUrl": api_base_url,
        "uiAuthEnabled": ui_auth_enabled,
        "authRequired": ui_auth_enabled,
        "authProvider": auth_provider,
        "authSessionMode": auth_session_mode,
        "oidcEnabled": auth_provider == "oidc" and include_oidc,
    }
    if include_oidc:
        payload.update(
            {
                "oidcAuthority": "https://login.microsoftonline.com/example-tenant",
                "oidcClientId": "example-client-id",
                "oidcScopes": "openid profile api://asset-allocation-api/user_impersonation",
            }
        )
    return f"window.__API_UI_CONFIG__ = {json.dumps(payload)};"


def make_fetcher(mapping: dict[str, str]):
    def fetcher(url: str, timeout_seconds: float) -> str:
        del timeout_seconds
        try:
            return mapping[url]
        except KeyError as exc:
            raise AssertionError(f"Unexpected URL fetch in test: {url}") from exc

    return fetcher


def test_validator_accepts_oidc_bootstrap() -> None:
    validator = load_validator_module()
    ui_origin = "https://asset-allocation-ui.example.com"
    result = validator.validate_deployed_ui_oidc(
        ui_origin=ui_origin,
        ui_auth_provider="oidc",
        fetcher=make_fetcher(
            {
                f"{ui_origin}/ui-config.js": build_ui_config_js(include_oidc=True),
            }
        ),
    )

    assert result["ui_origin"] == ui_origin
    assert result["config"]["apiBaseUrl"] == "/api"


def test_validator_retries_stale_password_bootstrap_until_oidc() -> None:
    validator = load_validator_module()
    ui_origin = "https://asset-allocation-ui.example.com"
    responses = [
        build_ui_config_js(auth_provider="password"),
        build_ui_config_js(include_oidc=True),
    ]
    sleep_delays: list[float] = []

    def fetcher(url: str, timeout_seconds: float) -> str:
        del timeout_seconds
        assert url == f"{ui_origin}/ui-config.js"
        return responses.pop(0)

    result = validator.validate_deployed_ui_oidc_with_retries(
        ui_origin=ui_origin,
        ui_auth_provider="oidc",
        fetcher=fetcher,
        retry_attempts=2,
        retry_delay_seconds=0.25,
        sleeper=sleep_delays.append,
    )

    assert result["config"]["authProvider"] == "oidc"
    assert sleep_delays == [0.25]
    assert responses == []


def test_validator_rejects_non_same_origin_api_base_url() -> None:
    validator = load_validator_module()
    ui_origin = "https://asset-allocation-ui.example.com"
    with pytest.raises(validator.ValidationError) as excinfo:
        validator.validate_deployed_ui_oidc(
            ui_origin=ui_origin,
            ui_auth_provider="oidc",
            fetcher=make_fetcher(
                {
                    f"{ui_origin}/ui-config.js": build_ui_config_js(
                        api_base_url="https://asset-allocation-api.example.com/api",
                        include_oidc=True,
                    ),
                }
            ),
        )

    assert "apiBaseUrl" in str(excinfo.value)


def test_validator_rejects_oidc_fields_when_auth_is_disabled() -> None:
    validator = load_validator_module()
    ui_origin = "https://asset-allocation-ui.example.com"
    with pytest.raises(validator.ValidationError) as excinfo:
        validator.validate_deployed_ui_oidc(
            ui_origin=ui_origin,
            ui_auth_enabled=False,
            ui_auth_provider="disabled",
            fetcher=make_fetcher(
                {
                    f"{ui_origin}/ui-config.js": build_ui_config_js(
                        ui_auth_enabled=False,
                        auth_provider="disabled",
                        auth_session_mode="bearer",
                        include_oidc=True,
                    ),
                }
            ),
        )

    assert "OIDC bootstrap fields" in str(excinfo.value)
