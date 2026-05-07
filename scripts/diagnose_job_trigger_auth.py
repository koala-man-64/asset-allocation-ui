from __future__ import annotations

import argparse
import http.cookiejar
import http.cookies
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener


CONFIG_ASSIGNMENT_PATTERN = re.compile(
    r"window\.__API_UI_CONFIG__\s*=\s*(\{.*?\})\s*;",
    re.S,
)
CSRF_COOKIE_NAMES = ("__Host-aa_csrf", "aa_csrf_dev")
DEFAULT_JOB_OPERATE_ROLE = "AssetAllocation.Jobs.Operate"


@dataclass(frozen=True)
class HttpResult:
    method: str
    url: str
    status: int
    reason: str
    headers: dict[str, str]
    body: str

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300

    def json_body(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.body)
        except json.JSONDecodeError:
            return {}
        return payload if isinstance(payload, dict) else {}


@dataclass(frozen=True)
class CheckResult:
    name: str
    status: str
    detail: str
    evidence: dict[str, Any]


class DiagnosticError(RuntimeError):
    """Raised when the diagnostic cannot evaluate a required input."""


def normalize_ui_origin(ui_origin: str) -> str:
    candidate = ui_origin.strip().rstrip("/")
    parsed = urlsplit(candidate)
    if not parsed.scheme or not parsed.netloc:
        raise DiagnosticError("--ui-origin must be an absolute URL.")
    if parsed.path not in {"", "/"}:
        raise DiagnosticError(
            "--ui-origin should include only scheme and host, not a path."
        )
    return f"{parsed.scheme}://{parsed.netloc}"


def request_text(
    opener: Any,
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    timeout_seconds: float,
) -> HttpResult:
    request = Request(
        url,
        data=body,
        headers={
            "User-Agent": "asset-allocation-ui/job-trigger-auth-diagnostic",
            **(headers or {}),
        },
        method=method,
    )
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            raw_body = response.read()
            charset = response.headers.get_content_charset() or "utf-8"
            return HttpResult(
                method=method,
                url=url,
                status=int(getattr(response, "status", response.getcode())),
                reason=str(getattr(response, "reason", "")),
                headers={key.lower(): value for key, value in response.headers.items()},
                body=raw_body.decode(charset, errors="replace"),
            )
    except HTTPError as exc:
        raw_body = exc.read()
        charset = exc.headers.get_content_charset() or "utf-8"
        return HttpResult(
            method=method,
            url=url,
            status=int(exc.code),
            reason=str(exc.reason),
            headers={key.lower(): value for key, value in exc.headers.items()},
            body=raw_body.decode(charset, errors="replace"),
        )
    except URLError as exc:
        return HttpResult(
            method=method,
            url=url,
            status=0,
            reason=type(exc.reason).__name__
            if hasattr(exc, "reason")
            else type(exc).__name__,
            headers={},
            body=str(exc.reason if hasattr(exc, "reason") else exc),
        )


def fetch_ui_config(
    opener: Any,
    ui_origin: str,
    timeout_seconds: float,
) -> tuple[dict[str, Any], HttpResult]:
    response = request_text(
        opener,
        "GET",
        f"{ui_origin}/ui-config.js",
        timeout_seconds=timeout_seconds,
    )
    if not response.ok:
        raise DiagnosticError(
            f"GET /ui-config.js returned HTTP {response.status}: {response.body}"
        )

    match = CONFIG_ASSIGNMENT_PATTERN.search(response.body)
    if not match:
        raise DiagnosticError(
            "Could not parse window.__API_UI_CONFIG__ from /ui-config.js."
        )

    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise DiagnosticError("/ui-config.js contains invalid JSON.") from exc

    if not isinstance(payload, dict):
        raise DiagnosticError("/ui-config.js runtime config is not an object.")
    return payload, response


def parse_scopes(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if not isinstance(value, str):
        return []
    return [item.strip() for item in value.replace(",", " ").split() if item.strip()]


def resolve_api_scope(config: dict[str, Any]) -> str:
    for scope in parse_scopes(config.get("oidcScopes")):
        if scope.startswith("api://") and "/" in scope.removeprefix("api://"):
            return scope
    for audience in parse_scopes(config.get("oidcAudience")):
        if audience.startswith("api://"):
            return f"{audience.rstrip('/')}/.default"
    raise DiagnosticError(
        "Could not infer API scope from ui-config.js oidcScopes/oidcAudience."
    )


def resource_from_scope(scope: str) -> str:
    if scope.endswith("/.default"):
        return scope[: -len("/.default")]
    if scope.startswith("api://") and "/" in scope.removeprefix("api://"):
        prefix, _separator, _suffix = scope.removeprefix("api://").partition("/")
        return f"api://{prefix}"
    return scope


def get_az_cli_token(scope: str, timeout_seconds: float) -> tuple[str, str]:
    commands = [
        ["az", "account", "get-access-token", "--scope", scope, "--output", "json"],
        [
            "az",
            "account",
            "get-access-token",
            "--resource",
            resource_from_scope(scope),
            "--output",
            "json",
        ],
    ]
    errors: list[str] = []
    for command in commands:
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                check=False,
            )
        except FileNotFoundError as exc:
            raise DiagnosticError(
                "Azure CLI executable 'az' was not found on PATH."
            ) from exc
        if completed.returncode != 0:
            errors.append(
                (completed.stderr or completed.stdout or "unknown az error").strip()
            )
            continue
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            errors.append(f"az returned non-JSON output: {exc}")
            continue
        token = str(payload.get("accessToken") or "").strip()
        if token:
            return token, " ".join(command[:4])
        errors.append("az returned no accessToken.")
    raise DiagnosticError(
        "Could not mint an Azure CLI access token. " + " | ".join(errors)
    )


def token_from_env(env_name: str | None) -> tuple[str | None, str | None]:
    if not env_name:
        return None, None
    token = str(os.environ.get(env_name) or "").strip()
    if not token:
        raise DiagnosticError(f"{env_name} is empty or unset.")
    return token, env_name


def extract_cookie_value_from_header(cookie_header: str, name: str) -> str:
    parsed = http.cookies.SimpleCookie()
    parsed.load(cookie_header)
    morsel = parsed.get(name)
    return morsel.value if morsel is not None else ""


def extract_cookie_value_from_jar(
    cookie_jar: http.cookiejar.CookieJar, name: str
) -> str:
    for cookie in cookie_jar:
        if cookie.name == name:
            return str(cookie.value or "")
    return ""


def extract_csrf_from_cookie_header(cookie_header: str) -> str:
    for name in CSRF_COOKIE_NAMES:
        value = extract_cookie_value_from_header(cookie_header, name)
        if value:
            return value
    return ""


def extract_csrf_from_jar(cookie_jar: http.cookiejar.CookieJar) -> str:
    for name in CSRF_COOKIE_NAMES:
        value = extract_cookie_value_from_jar(cookie_jar, name)
        if value:
            return value
    return ""


def summarize_http(result: HttpResult) -> dict[str, Any]:
    payload = result.json_body()
    detail = payload.get("detail") if isinstance(payload.get("detail"), str) else None
    return {
        "status": result.status,
        "reason": result.reason,
        "detail": detail,
        "wwwAuthenticate": result.headers.get("www-authenticate"),
        "xRequestId": result.headers.get("x-request-id"),
        "bodyPreview": result.body[:240],
    }


def classify_forbidden_detail(detail: str) -> str:
    normalized = detail.lower()
    if "missing required roles" in normalized:
        return "role-denied"
    if "csrf token" in normalized:
        return "csrf-denied"
    if "origin or referer" in normalized:
        return "origin-denied"
    return "forbidden"


def build_job_url(ui_origin: str, job_name: str) -> str:
    return f"{ui_origin}/api/system/jobs/{job_name}/run"


def record_http_check(
    name: str, result: HttpResult, expected_status: int | set[int]
) -> CheckResult:
    expected = (
        expected_status if isinstance(expected_status, set) else {expected_status}
    )
    status = "pass" if result.status in expected else "warn"
    detail = result.json_body().get("detail") or result.body[:160] or result.reason
    return CheckResult(name, status, str(detail), summarize_http(result))


def diagnose_without_credentials(
    opener: Any,
    ui_origin: str,
    job_name: str,
    timeout_seconds: float,
) -> list[CheckResult]:
    checks: list[CheckResult] = []
    session_response = request_text(
        opener,
        "GET",
        f"{ui_origin}/api/auth/session",
        timeout_seconds=timeout_seconds,
    )
    checks.append(
        record_http_check("auth-session-without-credentials", session_response, 401)
    )

    job_response = request_text(
        opener,
        "POST",
        build_job_url(ui_origin, job_name),
        timeout_seconds=timeout_seconds,
    )
    checks.append(
        record_http_check("job-trigger-without-credentials", job_response, 401)
    )
    return checks


def granted_roles_from_session_payload(payload: dict[str, Any]) -> set[str]:
    raw_roles = payload.get("grantedRoles") or []
    if not isinstance(raw_roles, list):
        return set()
    return {str(role).strip() for role in raw_roles if str(role).strip()}


def diagnose_with_bearer_session(
    ui_origin: str,
    job_name: str,
    bearer_token: str,
    token_source: str,
    timeout_seconds: float,
    job_operate_role: str,
    allow_trigger: bool,
) -> list[CheckResult]:
    cookie_jar = http.cookiejar.CookieJar()
    opener = build_opener(HTTPCookieProcessor(cookie_jar))
    checks: list[CheckResult] = []

    bootstrap = request_text(
        opener,
        "POST",
        f"{ui_origin}/api/auth/session",
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "Origin": ui_origin,
        },
        body=b"",
        timeout_seconds=timeout_seconds,
    )
    checks.append(
        CheckResult(
            "bootstrap-cookie-session-from-bearer",
            "pass" if bootstrap.ok else "fail",
            str(
                bootstrap.json_body().get("detail")
                or bootstrap.reason
                or "session bootstrap completed"
            ),
            {
                **summarize_http(bootstrap),
                "tokenSource": token_source,
                "sessionCookiesIssued": sorted(cookie.name for cookie in cookie_jar),
            },
        )
    )
    if not bootstrap.ok:
        return checks

    session_payload = bootstrap.json_body()
    granted_roles = granted_roles_from_session_payload(session_payload)
    missing_job_role = job_operate_role not in granted_roles
    checks.append(
        CheckResult(
            "job-operate-role-in-session",
            "warn" if missing_job_role else "pass",
            (
                f"Missing {job_operate_role}; job trigger should return 403."
                if missing_job_role
                else f"Session includes {job_operate_role}."
            ),
            {
                "requiredRole": job_operate_role,
                "grantedRoles": sorted(granted_roles),
            },
        )
    )

    csrf_token = extract_csrf_from_jar(cookie_jar)
    checks.append(
        CheckResult(
            "csrf-cookie-issued",
            "pass" if csrf_token else "fail",
            "CSRF cookie is available." if csrf_token else "No CSRF cookie was issued.",
            {"csrfCookiePresent": bool(csrf_token)},
        )
    )
    if not csrf_token:
        return checks

    if not missing_job_role and not allow_trigger:
        checks.append(
            CheckResult(
                "authenticated-job-trigger",
                "skipped",
                f"Session has {job_operate_role}; rerun with --allow-trigger to start the job.",
                {"wouldTriggerJob": True},
            )
        )
        return checks

    job_response = request_text(
        opener,
        "POST",
        build_job_url(ui_origin, job_name),
        headers={
            "Origin": ui_origin,
            "Referer": f"{ui_origin}/system-status",
            "X-CSRF-Token": csrf_token,
        },
        body=b"",
        timeout_seconds=timeout_seconds,
    )
    payload = job_response.json_body()
    detail = str(payload.get("detail") or payload.get("status") or job_response.reason)
    status = "pass" if job_response.ok else "warn"
    if job_response.status == 403:
        status = "pass" if missing_job_role else "warn"
        detail = f"{classify_forbidden_detail(detail)}: {detail}"
    checks.append(
        CheckResult(
            "authenticated-job-trigger",
            status,
            detail,
            summarize_http(job_response),
        )
    )
    return checks


def diagnose_with_cookie_header(
    ui_origin: str,
    job_name: str,
    cookie_header: str,
    csrf_token: str,
    timeout_seconds: float,
    job_operate_role: str,
    allow_trigger: bool,
) -> list[CheckResult]:
    opener = build_opener()
    common_headers = {"Cookie": cookie_header}
    checks: list[CheckResult] = []

    session_response = request_text(
        opener,
        "GET",
        f"{ui_origin}/api/auth/session",
        headers=common_headers,
        timeout_seconds=timeout_seconds,
    )
    checks.append(
        CheckResult(
            "auth-session-from-cookie-header",
            "pass" if session_response.ok else "warn",
            str(session_response.json_body().get("detail") or session_response.reason),
            summarize_http(session_response),
        )
    )
    if session_response.ok:
        granted_roles = granted_roles_from_session_payload(session_response.json_body())
        if job_operate_role in granted_roles and not allow_trigger:
            checks.append(
                CheckResult(
                    "job-trigger-from-cookie-header",
                    "skipped",
                    f"Session has {job_operate_role}; rerun with --allow-trigger to start the job.",
                    {
                        "wouldTriggerJob": True,
                        "grantedRoles": sorted(granted_roles),
                    },
                )
            )
            return checks

    job_response = request_text(
        opener,
        "POST",
        build_job_url(ui_origin, job_name),
        headers={
            **common_headers,
            "Origin": ui_origin,
            "Referer": f"{ui_origin}/system-status",
            "X-CSRF-Token": csrf_token,
        },
        body=b"",
        timeout_seconds=timeout_seconds,
    )
    payload = job_response.json_body()
    detail = str(payload.get("detail") or payload.get("status") or job_response.reason)
    if job_response.status == 403:
        detail = f"{classify_forbidden_detail(detail)}: {detail}"
    checks.append(
        CheckResult(
            "job-trigger-from-cookie-header",
            "pass" if job_response.ok or job_response.status == 403 else "warn",
            detail,
            summarize_http(job_response),
        )
    )
    return checks


def print_text_report(ui_origin: str, job_name: str, checks: list[CheckResult]) -> None:
    print(f"Job trigger auth diagnostic: origin={ui_origin} job={job_name}")
    for check in checks:
        print(f"[{check.status.upper()}] {check.name}: {check.detail}")
        for key, value in check.evidence.items():
            print(f"  - {key}: {value}")


def build_summary(checks: list[CheckResult]) -> dict[str, Any]:
    forbidden_checks = [
        check
        for check in checks
        if isinstance(check.evidence.get("status"), int)
        and check.evidence.get("status") == 403
    ]
    role_denied = [
        check
        for check in forbidden_checks
        if "role-denied" in check.detail
        or "Missing required roles" in str(check.evidence.get("detail") or "")
    ]
    csrf_denied = [
        check
        for check in forbidden_checks
        if "csrf-denied" in check.detail
        or "CSRF token" in str(check.evidence.get("detail") or "")
    ]
    origin_denied = [
        check
        for check in forbidden_checks
        if "origin-denied" in check.detail
        or "Origin or Referer" in str(check.evidence.get("detail") or "")
    ]
    return {
        "checks": [check.__dict__ for check in checks],
        "assessment": {
            "roleDenied": bool(role_denied),
            "csrfDenied": bool(csrf_denied),
            "originDenied": bool(origin_denied),
            "forbiddenObserved": bool(forbidden_checks),
        },
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Diagnose why a deployed UI job-trigger request returns 401/403."
    )
    parser.add_argument(
        "--ui-origin",
        required=True,
        help="UI origin, for example https://asset-allocation-ui...",
    )
    parser.add_argument("--job-name", default="bronze-price-target-job")
    parser.add_argument("--timeout-seconds", type=float, default=20.0)
    parser.add_argument(
        "--use-az-cli",
        action="store_true",
        help="Mint a bearer token with az account get-access-token.",
    )
    parser.add_argument(
        "--bearer-token-env", help="Environment variable containing a bearer token."
    )
    parser.add_argument(
        "--cookie-header-env",
        help="Environment variable containing a browser Cookie header.",
    )
    parser.add_argument(
        "--csrf-token-env", help="Environment variable containing the CSRF token."
    )
    parser.add_argument("--job-operate-role", default=DEFAULT_JOB_OPERATE_ROLE)
    parser.add_argument(
        "--allow-trigger",
        action="store_true",
        help="Allow the script to start the job when the authenticated session has the job operate role.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        ui_origin = normalize_ui_origin(args.ui_origin)
        base_cookie_jar = http.cookiejar.CookieJar()
        opener = build_opener(HTTPCookieProcessor(base_cookie_jar))
        config, config_response = fetch_ui_config(
            opener, ui_origin, args.timeout_seconds
        )

        checks = [
            CheckResult(
                "runtime-ui-config",
                "pass",
                "Runtime UI config loaded.",
                {
                    **summarize_http(config_response),
                    "apiBaseUrl": config.get("apiBaseUrl"),
                    "authProvider": config.get("authProvider"),
                    "authSessionMode": config.get("authSessionMode"),
                    "oidcEnabled": config.get("oidcEnabled"),
                    "oidcScopesPresent": bool(config.get("oidcScopes")),
                },
            )
        ]
        checks.extend(
            diagnose_without_credentials(
                opener, ui_origin, args.job_name, args.timeout_seconds
            )
        )

        bearer_token, token_source = token_from_env(args.bearer_token_env)
        if bearer_token is None and args.use_az_cli:
            try:
                scope = resolve_api_scope(config)
                bearer_token, token_source = get_az_cli_token(
                    scope, args.timeout_seconds
                )
            except DiagnosticError as exc:
                checks.append(
                    CheckResult(
                        "azure-cli-token",
                        "skipped",
                        str(exc),
                        {"useAzCli": True},
                    )
                )

        if bearer_token is not None and token_source is not None:
            checks.extend(
                diagnose_with_bearer_session(
                    ui_origin,
                    args.job_name,
                    bearer_token,
                    token_source,
                    args.timeout_seconds,
                    args.job_operate_role,
                    args.allow_trigger,
                )
            )

        if args.cookie_header_env:
            cookie_header = str(os.environ.get(args.cookie_header_env) or "").strip()
            if not cookie_header:
                raise DiagnosticError(f"{args.cookie_header_env} is empty or unset.")
            csrf_token = (
                str(os.environ.get(args.csrf_token_env or "") or "").strip()
                if args.csrf_token_env
                else extract_csrf_from_cookie_header(cookie_header)
            )
            if not csrf_token:
                raise DiagnosticError(
                    "No CSRF token supplied or found in the cookie header. "
                    "Set --csrf-token-env or include the CSRF cookie."
                )
            checks.extend(
                diagnose_with_cookie_header(
                    ui_origin,
                    args.job_name,
                    cookie_header,
                    csrf_token,
                    args.timeout_seconds,
                    args.job_operate_role,
                    args.allow_trigger,
                )
            )

        if args.json:
            print(json.dumps(build_summary(checks), indent=2, sort_keys=True))
        else:
            print_text_report(ui_origin, args.job_name, checks)
        return 0
    except DiagnosticError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    except subprocess.TimeoutExpired as exc:
        print(f"ERROR: command timed out: {' '.join(exc.cmd)}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
