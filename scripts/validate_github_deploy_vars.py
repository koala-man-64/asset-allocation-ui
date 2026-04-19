from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections.abc import Mapping


TRUTHY_VALUES = {"1", "true", "yes", "y", "on", "t"}
PROD_RUNTIME_ALWAYS_REQUIRED = (
    "AZURE_CLIENT_ID",
    "AZURE_TENANT_ID",
    "AZURE_SUBSCRIPTION_ID",
    "RESOURCE_GROUP",
    "ACR_NAME",
    "CONTAINER_APPS_ENVIRONMENT_NAME",
    "SERVICE_ACCOUNT_NAME",
    "UI_APP_NAME",
    "API_UPSTREAM",
    "API_UPSTREAM_SCHEME",
    "UI_AUTH_ENABLED",
)
PROD_RUNTIME_AUTH_REQUIRED = (
    "UI_OIDC_AUTHORITY",
    "UI_OIDC_CLIENT_ID",
    "UI_OIDC_SCOPES",
)


class ValidationError(RuntimeError):
    """Raised when required GitHub deploy variables are missing."""


def normalize_text(value: str | None) -> str:
    return str(value or "").replace("\ufeff", "").strip()


def resolve_default_repo() -> str:
    remote = subprocess.run(
        ["git", "config", "--get", "remote.origin.url"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if not remote:
        raise ValidationError("Could not resolve remote.origin.url to infer --repo.")

    normalized = remote.removesuffix(".git")
    marker = "github.com"
    if marker not in normalized:
        raise ValidationError(
            f"Unsupported remote origin for GitHub repo inference: {remote}"
        )

    repo_slug = normalized.split(marker, maxsplit=1)[1].lstrip(":/")
    if repo_slug.count("/") != 1:
        raise ValidationError(
            f"Could not infer owner/repo from remote origin: {remote}"
        )
    return repo_slug


def parse_bool(value: str | None) -> bool:
    return normalize_text(value).lower() in TRUTHY_VALUES


def parse_variable_map_json(raw_json: str) -> dict[str, str]:
    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValidationError("--vars-json did not contain valid JSON.") from exc

    if not isinstance(payload, Mapping):
        raise ValidationError("--vars-json must decode to a JSON object.")

    return {
        normalize_text(name): normalize_text(value)
        for name, value in payload.items()
        if normalize_text(str(name))
    }


def load_repo_variable_map(repo: str) -> dict[str, str]:
    completed = subprocess.run(
        ["gh", "api", f"repos/{repo}/actions/variables?per_page=100"],
        check=True,
        capture_output=True,
        text=True,
        env={**os.environ, "GH_PAGER": ""},
    )
    payload = json.loads(completed.stdout)
    return {
        normalize_text(item.get("name", "")): normalize_text(item.get("value", ""))
        for item in payload.get("variables", [])
        if normalize_text(item.get("name", ""))
    }


def missing_prod_runtime_vars(variable_map: Mapping[str, str]) -> list[str]:
    missing = [
        name
        for name in PROD_RUNTIME_ALWAYS_REQUIRED
        if not normalize_text(variable_map.get(name, ""))
    ]
    if parse_bool(variable_map.get("UI_AUTH_ENABLED")):
        missing.extend(
            name
            for name in PROD_RUNTIME_AUTH_REQUIRED
            if not normalize_text(variable_map.get(name, ""))
        )
    return missing


def validate_repo_variables(variable_map: Mapping[str, str], mode: str) -> None:
    if mode != "prod-runtime":
        raise ValidationError(f"Unsupported validation mode: {mode}")

    missing = missing_prod_runtime_vars(variable_map)
    if missing:
        raise ValidationError(
            "Missing required GitHub repo deploy vars for prod-runtime: "
            + ", ".join(sorted(dict.fromkeys(missing)))
        )


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate required GitHub repo variables for UI deployment workflows."
    )
    parser.add_argument(
        "--repo",
        default="",
        help="GitHub repository in owner/name form. Defaults to the current git remote.",
    )
    parser.add_argument(
        "--mode",
        required=True,
        choices=("prod-runtime",),
        help="Validation rule set to enforce.",
    )
    parser.add_argument(
        "--vars-json",
        default="",
        help="Optional JSON object containing repo variables, for example from toJson(vars) in GitHub Actions.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_argument_parser()
    args = parser.parse_args(argv)

    try:
        repo = args.repo or resolve_default_repo()
        variable_map = (
            parse_variable_map_json(args.vars_json)
            if args.vars_json
            else load_repo_variable_map(repo)
        )
        validate_repo_variables(variable_map, args.mode)
    except ValidationError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as exc:
        detail = normalize_text(exc.stderr) or normalize_text(exc.stdout) or str(exc)
        print(detail, file=sys.stderr)
        return 1

    print(f"Validated GitHub repo deploy vars for {repo} ({args.mode})")
    print(f"UI_AUTH_ENABLED={variable_map.get('UI_AUTH_ENABLED', '')}")
    if parse_bool(variable_map.get("UI_AUTH_ENABLED")):
        print("UI auth enabled: verified required OIDC repo vars are present.")
    else:
        print(
            "UI auth disabled: OIDC repo vars not required by prod-runtime preflight."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
