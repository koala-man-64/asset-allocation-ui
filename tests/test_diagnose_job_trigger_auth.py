from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "package.json").exists() and (
            candidate / ".github" / "workflows"
        ).is_dir():
            return candidate
    raise AssertionError("Could not resolve repository root from test path")


def load_diagnostic_module():
    module_path = repo_root() / "scripts" / "diagnose_job_trigger_auth.py"
    spec = importlib.util.spec_from_file_location(
        "diagnose_job_trigger_auth", module_path
    )
    if spec is None or spec.loader is None:
        raise AssertionError(f"Could not load module spec for {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_resolve_api_scope_prefers_user_impersonation_scope() -> None:
    diagnostic = load_diagnostic_module()

    assert (
        diagnostic.resolve_api_scope(
            {
                "oidcScopes": (
                    "openid profile "
                    "api://3047cec2-cb59-44b7-9486-1d33211622bb/user_impersonation"
                )
            }
        )
        == "api://3047cec2-cb59-44b7-9486-1d33211622bb/user_impersonation"
    )


def test_resource_from_scope_strips_scope_suffix() -> None:
    diagnostic = load_diagnostic_module()

    assert (
        diagnostic.resource_from_scope(
            "api://3047cec2-cb59-44b7-9486-1d33211622bb/user_impersonation"
        )
        == "api://3047cec2-cb59-44b7-9486-1d33211622bb"
    )


def test_classify_forbidden_detail_identifies_role_csrf_and_origin_denials() -> None:
    diagnostic = load_diagnostic_module()

    assert (
        diagnostic.classify_forbidden_detail(
            "Missing required roles: AssetAllocation.Jobs.Operate."
        )
        == "role-denied"
    )
    assert (
        diagnostic.classify_forbidden_detail("CSRF token is missing or invalid.")
        == "csrf-denied"
    )
    assert (
        diagnostic.classify_forbidden_detail(
            "Origin or Referer does not match the expected UI origin."
        )
        == "origin-denied"
    )


def test_build_summary_flags_role_denied_forbidden_response() -> None:
    diagnostic = load_diagnostic_module()
    check = diagnostic.CheckResult(
        name="authenticated-job-trigger",
        status="pass",
        detail="role-denied: Missing required roles: AssetAllocation.Jobs.Operate.",
        evidence={
            "status": 403,
            "detail": "Missing required roles: AssetAllocation.Jobs.Operate.",
        },
    )

    summary = diagnostic.build_summary([check])

    assert summary["assessment"] == {
        "roleDenied": True,
        "csrfDenied": False,
        "originDenied": False,
        "forbiddenObserved": True,
    }
