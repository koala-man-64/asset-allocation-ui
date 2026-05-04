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
    module_path = repo_root() / "scripts" / "validate_deployed_ui_assets.py"
    spec = importlib.util.spec_from_file_location(
        "validate_deployed_ui_assets", module_path
    )
    if spec is None or spec.loader is None:
        raise AssertionError(f"Could not load module spec for {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def make_fetcher(validator, ui_origin: str, *, deep_route_cache_control: str):
    index_html = b"""
<!doctype html>
<html>
  <body>
    <script type="module" src="/assets/index-abc123.js"></script>
  </body>
</html>
"""
    main_js = b'const chunk = "/assets/chunk-def456.js";'
    chunk_js = b"export const loaded = true;"

    responses = {
        f"{ui_origin}/": validator.HttpResult(
            f"{ui_origin}/",
            200,
            "text/html",
            index_html,
            {"Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"},
        ),
        f"{ui_origin}/strategy-configurations": validator.HttpResult(
            f"{ui_origin}/strategy-configurations",
            200,
            "text/html",
            index_html,
            {"Cache-Control": deep_route_cache_control},
        ),
        f"{ui_origin}/assets/index-abc123.js": validator.HttpResult(
            f"{ui_origin}/assets/index-abc123.js",
            200,
            "application/javascript",
            main_js,
            {"Cache-Control": "public, max-age=31536000, immutable"},
        ),
        f"{ui_origin}/assets/chunk-def456.js": validator.HttpResult(
            f"{ui_origin}/assets/chunk-def456.js",
            200,
            "application/javascript",
            chunk_js,
            {"Cache-Control": "public, max-age=31536000, immutable"},
        ),
        f"{ui_origin}/assets/__asset_allocation_missing_chunk_smoke__.js": validator.HttpResult(
            f"{ui_origin}/assets/__asset_allocation_missing_chunk_smoke__.js",
            404,
            "text/plain",
            b"not found",
            {"Cache-Control": "public, max-age=31536000, immutable"},
        ),
    }

    def fetcher(url: str, timeout_seconds: float):
        del timeout_seconds
        try:
            return responses[url]
        except KeyError as exc:
            raise AssertionError(f"Unexpected URL fetch in test: {url}") from exc

    return fetcher


def test_validator_accepts_no_store_deep_route_shell() -> None:
    validator = load_validator_module()
    ui_origin = "https://asset-allocation-ui.example.com"

    result = validator.validate_deployed_ui_assets(
        ui_origin=ui_origin,
        fetcher=make_fetcher(
            validator,
            ui_origin,
            deep_route_cache_control="no-store, no-cache, must-revalidate, proxy-revalidate",
        ),
    )

    assert result["deep_route_url"] == f"{ui_origin}/strategy-configurations"
    assert result["chunk_count"] == 1


def test_validator_rejects_cacheable_deep_route_shell() -> None:
    validator = load_validator_module()
    ui_origin = "https://asset-allocation-ui.example.com"

    with pytest.raises(validator.ValidationError, match="expected no-store"):
        validator.validate_deployed_ui_assets(
            ui_origin=ui_origin,
            fetcher=make_fetcher(
                validator,
                ui_origin,
                deep_route_cache_control="public, max-age=300",
            ),
        )
