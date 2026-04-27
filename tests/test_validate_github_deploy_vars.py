from __future__ import annotations

import importlib.util
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
    module_path = repo_root() / "scripts" / "validate_github_deploy_vars.py"
    spec = importlib.util.spec_from_file_location(
        "validate_github_deploy_vars", module_path
    )
    if spec is None or spec.loader is None:
        raise AssertionError(f"Could not load module spec for {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def base_vars() -> dict[str, str]:
    return {
        "AZURE_CLIENT_ID": "client-id",
        "AZURE_TENANT_ID": "tenant-id",
        "AZURE_SUBSCRIPTION_ID": "subscription-id",
        "RESOURCE_GROUP": "resource-group",
        "ACR_NAME": "assetallocationacr",
        "CONTAINER_APPS_ENVIRONMENT_NAME": "asset-allocation-env",
        "SERVICE_ACCOUNT_NAME": "asset-allocation-sa",
        "UI_APP_NAME": "asset-allocation-ui",
        "API_UPSTREAM": "asset-allocation-api.example.com",
        "API_UPSTREAM_SCHEME": "https",
        "UI_AUTH_ENABLED": "true",
        "UI_ALLOWED_INGRESS_CIDRS": "203.0.113.10/32,198.51.100.0/24",
    }


def test_validator_requires_oidc_when_ui_auth_is_enabled() -> None:
    validator = load_validator_module()

    with pytest.raises(validator.ValidationError) as excinfo:
        validator.validate_repo_variables(
            {
                **base_vars(),
                "UI_AUTH_PROVIDER": "disabled",
            },
            "prod-runtime",
        )

    assert "UI_AUTH_PROVIDER must be oidc when UI_AUTH_ENABLED=true." in str(excinfo.value)


def test_validator_requires_oidc_repo_vars_only_for_oidc_provider() -> None:
    validator = load_validator_module()

    with pytest.raises(validator.ValidationError) as excinfo:
        validator.validate_repo_variables(
            {
                **base_vars(),
                "UI_AUTH_PROVIDER": "oidc",
            },
            "prod-runtime",
        )

    message = str(excinfo.value)
    assert "UI_OIDC_AUTHORITY" in message
    assert "UI_OIDC_CLIENT_ID" in message
    assert "UI_OIDC_SCOPES" in message


def test_validator_requires_ingress_allowlist_repo_var() -> None:
    validator = load_validator_module()

    with pytest.raises(validator.ValidationError) as excinfo:
        validator.validate_repo_variables(
            {
                **base_vars(),
                "UI_AUTH_PROVIDER": "oidc",
                "UI_ALLOWED_INGRESS_CIDRS": "",
            },
            "prod-runtime",
        )

    assert "UI_ALLOWED_INGRESS_CIDRS" in str(excinfo.value)


def test_parse_variable_map_json_normalizes_keys_and_values() -> None:
    validator = load_validator_module()

    parsed = validator.parse_variable_map_json(
        '{" UI_AUTH_PROVIDER ":" oidc ","UI_ALLOWED_INGRESS_CIDRS":" 203.0.113.10/32 "}'
    )

    assert parsed == {
        "UI_AUTH_PROVIDER": "oidc",
        "UI_ALLOWED_INGRESS_CIDRS": "203.0.113.10/32",
    }
