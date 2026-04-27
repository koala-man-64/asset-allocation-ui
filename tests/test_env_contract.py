from __future__ import annotations

import csv
import re
import subprocess
from pathlib import Path


WORKFLOW_VAR_PATTERN = re.compile(r"\bvars\.([A-Z][A-Z0-9_]+)\b")
WORKFLOW_SECRET_PATTERN = re.compile(r"\bsecrets\.([A-Z][A-Z0-9_]+)\b")


def repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "package.json").exists() and (
            candidate / ".github" / "workflows"
        ).is_dir():
            return candidate
    raise AssertionError("Could not resolve repository root from test path")


def contract_rows() -> list[dict[str, str]]:
    path = repo_root() / "docs" / "ops" / "env-contract.csv"
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def contract_map() -> dict[str, dict[str, str]]:
    return {row["name"]: row for row in contract_rows()}


def env_keys(path: Path) -> set[str]:
    keys: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        keys.add(line.split("=", 1)[0].strip())
    return keys


def workflow_refs(pattern: re.Pattern[str]) -> set[str]:
    refs: set[str] = set()
    for path in (repo_root() / ".github" / "workflows").glob("*.yml"):
        refs.update(pattern.findall(path.read_text(encoding="utf-8")))
    return refs


def workflow_text(name: str) -> str:
    return (repo_root() / ".github" / "workflows" / name).read_text(encoding="utf-8")


def powershell_exe() -> str:
    for candidate in ("pwsh", "powershell"):
        try:
            subprocess.run(
                [
                    candidate,
                    "-NoProfile",
                    "-Command",
                    "$PSVersionTable.PSVersion.ToString()",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            return candidate
        except Exception:
            continue
    raise AssertionError("PowerShell executable not found for setup-env dry-run test")


SYNTHETIC_ENV_VALUES = {
    "AZURE_CLIENT_ID": "test-client-id",
    "AZURE_TENANT_ID": "test-tenant-id",
    "AZURE_SUBSCRIPTION_ID": "test-subscription-id",
    "RESOURCE_GROUP": "test-resource-group",
    "ACR_NAME": "testacr",
    "ACR_PULL_IDENTITY_NAME": "test-acr-pull-identity",
    "CONTAINER_APPS_ENVIRONMENT_NAME": "test-container-apps-env",
    "SERVICE_ACCOUNT_NAME": "test-service-account",
    "UI_APP_NAME": "test-ui-app",
    "UI_PUBLIC_HOSTNAME": "asset-allocation.example.com",
    "CONTRACTS_REPOSITORY": "example/asset-allocation-contracts",
    "CONTRACTS_REF": "main",
    "API_UPSTREAM": "example.internal.test",
    "API_UPSTREAM_SCHEME": "https",
    "UI_AUTH_ENABLED": "true",
    "UI_AUTH_PROVIDER": "oidc",
    "UI_ALLOWED_INGRESS_CIDRS": "203.0.113.10/32,198.51.100.0/24",
    "UI_OIDC_AUTHORITY": "https://login.microsoftonline.com/example-tenant",
    "UI_OIDC_CLIENT_ID": "example-client-id",
    "UI_OIDC_SCOPES": "openid profile api://asset-allocation-api/user_impersonation",
    "UI_OIDC_AUDIENCE": "api://asset-allocation-api",
    "NPMRC": "//npm.pkg.github.com/:_authToken=fake\\n@asset-allocation:registry=https://npm.pkg.github.com",
}


def write_synthetic_env_file(path: Path) -> None:
    contract_names = [row["name"] for row in contract_rows()]
    missing = [name for name in contract_names if name not in SYNTHETIC_ENV_VALUES]
    extra = sorted(set(SYNTHETIC_ENV_VALUES) - set(contract_names))
    empty = [name for name in contract_names if not SYNTHETIC_ENV_VALUES.get(name)]

    assert not missing, f"Missing synthetic env values for contract keys: {missing}"
    assert not extra, f"Synthetic env values contain undocumented keys: {extra}"
    assert not empty, (
        f"Synthetic env values must be non-empty for contract keys: {empty}"
    )

    lines = [f"{name}={SYNTHETIC_ENV_VALUES[name]}" for name in contract_names]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_template_matches_contract_surface() -> None:
    assert env_keys(repo_root() / ".env.template") == set(contract_map())


def test_workflow_refs_are_documented() -> None:
    contract = contract_map()
    for name in workflow_refs(WORKFLOW_VAR_PATTERN):
        assert name in contract
        assert contract[name]["github_storage"] == "var"
    for name in workflow_refs(WORKFLOW_SECRET_PATTERN):
        assert name in contract
        assert contract[name]["github_storage"] == "secret"


def test_ui_repo_has_bootstrap_scripts_and_no_shared_provisioner() -> None:
    scripts_dir = repo_root() / "scripts"
    assert (scripts_dir / "setup-env.ps1").exists()
    assert (scripts_dir / "sync-all-to-github.ps1").exists()
    assert (scripts_dir / "validate_deployed_ui_oidc.py").exists()
    assert (scripts_dir / "validate_github_deploy_vars.py").exists()
    assert not (scripts_dir / "provision_azure.ps1").exists()


def test_sync_all_to_github_uses_body_flags_for_gh_cli() -> None:
    text = (repo_root() / "scripts" / "sync-all-to-github.ps1").read_text(
        encoding="utf-8"
    )
    assert "Normalize-TextValue" in text
    assert "gh variable set $key --body $value" in text
    assert "gh secret set $key --body" in text


def test_ui_deploy_workflow_is_release_driven_and_uses_repo_var() -> None:
    text = workflow_text("deploy-prod.yml")
    assert "workflow_dispatch:\n    inputs:" not in text
    assert "repository_dispatch:" in text
    assert "- control_plane_released" in text
    assert "deploy_runtime" not in text
    assert "workflow_run:" in text
    assert "- UI Release" in text
    assert "branches:\n      - main" in text
    assert "actions: read" in text
    assert "github.event.action == 'control_plane_released'" in text
    assert "validate-runtime-repo-vars" in text
    assert "REPO_VARS_JSON: ${{ toJson(vars) }}" in text
    assert '--vars-json "${REPO_VARS_JSON}"' in text
    assert "vars.API_UPSTREAM" in text
    assert "actions/workflows/release.yml/runs?branch=main&per_page=20" in text
    assert (
        "actions/runs/${{ steps.release-run.outputs.release_run_id }}/artifacts" in text
    )


def test_ui_runtime_deploy_workflow_uses_repo_var_only() -> None:
    text = workflow_text("deploy-ui-runtime.yml")
    assert "workflow_call:" in text
    assert "image_digest:" in text
    assert "vars.API_UPSTREAM" in text
    assert "vars.API_UPSTREAM_SCHEME" in text
    assert "vars.UI_AUTH_ENABLED" in text
    assert "vars.UI_AUTH_PROVIDER" in text
    assert "vars.UI_ALLOWED_INGRESS_CIDRS" in text
    assert "vars.UI_OIDC_AUTHORITY" in text
    assert "vars.UI_OIDC_CLIENT_ID" in text
    assert "vars.UI_OIDC_SCOPES" in text
    assert "vars.UI_PUBLIC_HOSTNAME" in text
    assert "contracts_version" not in text


def test_ui_rollback_workflow_requires_only_image_digest() -> None:
    text = workflow_text("rollback-prod.yml")
    assert "workflow_dispatch:" in text
    assert "image_digest:" in text
    assert "api_upstream:" not in text
    assert "contracts_version:" not in text
    assert "Validate required repo deploy vars" in text
    assert "REPO_VARS_JSON: ${{ toJson(vars) }}" in text
    assert '--vars-json "${REPO_VARS_JSON}"' in text
    assert "uses: ./.github/workflows/deploy-ui-runtime.yml" in text


def test_setup_env_discovers_api_upstream_host_and_scheme() -> None:
    text = (repo_root() / "scripts" / "setup-env.ps1").read_text(encoding="utf-8")
    assert "$app.properties.configuration.ingress.fqdn" in text
    assert '"https://$($app.properties.configuration.ingress.fqdn)"' not in text
    assert '"API_UPSTREAM_SCHEME"' in text
    assert 'return (New-Resolution -Value "https" -Source "azure")' in text


def test_ui_manifest_carries_upstream_and_auth_runtime_env() -> None:
    text = (repo_root() / "deploy" / "app_ui.yaml").read_text(encoding="utf-8")
    assert "- name: API_UPSTREAM" in text
    assert 'value: "${API_UPSTREAM}"' in text
    assert "- name: API_UPSTREAM_SCHEME" in text
    assert 'value: "${API_UPSTREAM_SCHEME}"' in text
    assert "- name: UI_AUTH_PROVIDER" in text
    assert 'value: "${UI_AUTH_PROVIDER}"' in text
    assert "ipSecurityRestrictions:" in text
    assert "__UI_IP_SECURITY_RESTRICTIONS__" in text
    assert "- name: UI_OIDC_AUTHORITY" in text
    assert 'value: "${UI_OIDC_AUTHORITY}"' in text
    assert "- name: UI_OIDC_CLIENT_ID" in text
    assert "- name: UI_OIDC_SCOPES" in text


def test_nginx_https_proxying_enables_sni() -> None:
    text = (repo_root() / "nginx.conf").read_text(encoding="utf-8")
    assert "proxy_ssl_server_name on;" in text
    assert "proxy_ssl_name $proxy_host;" in text
    assert "proxy_set_header Host $proxy_host;" in text
    assert "proxy_set_header Host $http_host;" not in text
    assert "proxy_set_header X-Forwarded-Host $http_host;" in text


def test_browser_bootstrap_loads_only_ui_config() -> None:
    text = (repo_root() / "index.html").read_text(encoding="utf-8")
    assert '<script src="/ui-config.js"></script>' in text
    assert '<script src="/config.js"></script>' not in text


def test_ui_proxy_surface_is_limited_to_api_and_health_routes() -> None:
    nginx_text = (repo_root() / "nginx.conf").read_text(encoding="utf-8")
    vite_text = (repo_root() / "vite.config.ts").read_text(encoding="utf-8")
    assert "location = /config.js" not in nginx_text
    assert "location /asset-allocation/api/" not in nginx_text
    assert "'/config.js'" not in vite_text
    assert "API_ROOT_PREFIX" not in vite_text


def test_ui_runtime_deploy_workflow_verifies_ui_owned_runtime_contract() -> None:
    text = workflow_text("deploy-ui-runtime.yml")
    validator_text = (
        repo_root() / "scripts" / "validate_deployed_ui_oidc.py"
    ).read_text(encoding="utf-8")
    assert "vars.API_UPSTREAM_SCHEME || 'https'" in text
    assert "vars.UI_AUTH_ENABLED || 'true'" in text
    assert "vars.UI_AUTH_PROVIDER || 'oidc'" in text
    assert "vars.UI_ALLOWED_INGRESS_CIDRS" in text
    assert "vars.UI_OIDC_AUTHORITY" in text
    assert "vars.UI_OIDC_CLIENT_ID" in text
    assert "vars.UI_OIDC_SCOPES" in text
    assert "python scripts/validate_deployed_ui_oidc.py \\" in text
    assert '--ui-origin "https://${fqdn}"' in text
    assert '--ui-auth-enabled "${UI_AUTH_ENABLED}"' in text
    assert '--ui-auth-provider "${UI_AUTH_PROVIDER}"' in text
    assert "https://${fqdn}/ui-config.js" in text
    assert "https://${fqdn}/api/system/status-view" in text
    assert "https://${fqdn}/api/realtime/ticket" in text
    assert "az containerapp hostname bind \\" in text
    assert "--validation-method CNAME \\" in text
    assert "https://${UI_PUBLIC_HOSTNAME}/ui-config.js" in text
    assert "ui-config.js advertises apiBaseUrl=" in validator_text
    assert "Allowed: $*" in text


def test_ui_runtime_config_sources_publish_same_origin_api_bootstrap_and_auth_provider() -> (
    None
):
    required_fragments = {
        "public/ui-config.js": [
            "apiBaseUrl: '/api'",
            "authProvider: 'disabled'",
            "authSessionMode: 'bearer'",
            "uiAuthEnabled: 'false'",
            "authRequired: 'false'",
        ],
        "docker/write-ui-runtime-config.sh": [
            '"apiBaseUrl": "/api"',
            '"authProvider": "${escaped_auth_provider}"',
            '"authSessionMode": "${escaped_auth_session_mode}"',
            "UI_AUTH_PROVIDER",
            "resolved_auth_session_mode='cookie'",
        ],
    }
    for relative_path, fragments in required_fragments.items():
        text = (repo_root() / relative_path).read_text(encoding="utf-8")
        missing = [fragment for fragment in fragments if fragment not in text]
        assert not missing, (
            f"{relative_path} is missing auth bootstrap fragments: {missing}"
        )


def test_ui_release_workflow_fails_fast_when_required_repo_vars_are_missing() -> None:
    text = workflow_text("release.yml")
    assert "Validate required repo deploy vars" in text
    assert "REPO_VARS_JSON: ${{ toJson(vars) }}" in text
    assert '--vars-json "${REPO_VARS_JSON}"' in text


def test_ui_release_workflow_publishes_release_manifest_artifact() -> None:
    text = workflow_text("release.yml")
    assert "name: ui-release" in text
    assert "path: artifacts/release-manifest.json" in text
    assert '"image_digest": os.environ["IMAGE_DIGEST"]' in text


def test_ui_release_workflow_supports_manual_dispatch_without_bypassing_ci() -> None:
    text = workflow_text("release.yml")
    assert "workflow_dispatch:" in text
    assert 'if [ "${GITHUB_REF_NAME}" != "main" ]' in text
    assert "actions/workflows/ci.yml/runs?branch=main&event=push&per_page=100" in text
    assert (
        "release.yml manual dispatch requires a successful UI CI push run on main for the selected commit."
        in text
    )


def test_setup_env_dry_run_reports_sources_without_prompting(tmp_path: Path) -> None:
    script = repo_root() / "scripts" / "setup-env.ps1"
    env_file = tmp_path / ".env.web"
    local_env_file = tmp_path / ".env.local"
    write_synthetic_env_file(env_file)
    completed = subprocess.run(
        [
            powershell_exe(),
            "-NoProfile",
            "-File",
            str(script),
            "-DryRun",
            "-EnvFilePath",
            str(env_file),
            "-LocalEnvFilePath",
            str(local_env_file),
        ],
        cwd=repo_root(),
        check=True,
        capture_output=True,
        text=True,
    )
    stdout = completed.stdout
    assert any(
        marker in stdout
        for marker in (
            "source=existing",
            "source=azure",
            "source=default",
            "source=git",
            "source=github",
        )
    )
    assert "prompt_required=" in stdout
    assert "# Preview (.env.local)" in stdout
    assert "VITE_API_PROXY_TARGET=" in stdout
    assert "VITE_UI_AUTH_PROVIDER=oidc" in stdout
    assert "VITE_OIDC_AUTHORITY=" in stdout
    assert "VITE_PROXY_CONFIG_JS=" not in stdout


def test_setup_env_writes_local_vite_env_file(tmp_path: Path) -> None:
    root = repo_root()
    script = root / "scripts" / "setup-env.ps1"
    env_file = tmp_path / ".env.web"
    local_env_file = tmp_path / ".env.local"
    write_synthetic_env_file(env_file)

    subprocess.run(
        [
            powershell_exe(),
            "-NoProfile",
            "-File",
            str(script),
            "-EnvFilePath",
            str(env_file),
            "-LocalEnvFilePath",
            str(local_env_file),
        ],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )

    local_env_text = local_env_file.read_text(encoding="utf-8")
    assert "VITE_API_BASE_URL=/api" in local_env_text
    assert "VITE_API_PROXY_TARGET=https://example.internal.test" in local_env_text
    assert "VITE_UI_AUTH_ENABLED=true" in local_env_text
    assert "VITE_UI_AUTH_PROVIDER=oidc" in local_env_text
    assert (
        "VITE_OIDC_AUTHORITY=https://login.microsoftonline.com/example-tenant"
        in local_env_text
    )
    assert "VITE_OIDC_CLIENT_ID=example-client-id" in local_env_text
    assert (
        "VITE_OIDC_SCOPES=openid profile api://asset-allocation-api/user_impersonation"
        in local_env_text
    )
    assert "VITE_OIDC_AUDIENCE=api://asset-allocation-api" in local_env_text
