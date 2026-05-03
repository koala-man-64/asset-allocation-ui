from __future__ import annotations

import argparse
import re
import sys
import time
from html.parser import HTMLParser
from typing import Callable
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen


SCRIPT_LITERAL_PATTERN = re.compile(
    r"""(?P<quote>["'])(?P<path>(?:\./|/assets/|assets/)[^"']+\.js)(?P=quote)"""
)
JAVASCRIPT_CONTENT_TYPES = {
    "application/ecmascript",
    "application/javascript",
    "application/x-javascript",
    "text/ecmascript",
    "text/javascript",
}


class ValidationError(RuntimeError):
    """Raised when deployed UI assets are unsafe to ship."""


class HttpResult:
    def __init__(self, url: str, status: int, content_type: str, body: bytes) -> None:
        self.url = url
        self.status = status
        self.content_type = content_type
        self.body = body

    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")


class ModuleScriptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.module_scripts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "script":
            return

        attr_map = {key.lower(): value for key, value in attrs}
        if attr_map.get("type") == "module" and attr_map.get("src"):
            self.module_scripts.append(str(attr_map["src"]))


def normalize_ui_origin(ui_origin: str) -> str:
    candidate = ui_origin.strip().rstrip("/")
    parsed = urlsplit(candidate)
    if not parsed.scheme or not parsed.netloc:
        raise ValidationError(
            "--ui-origin must be an absolute URL such as https://asset-allocation-ui.example.com."
        )
    return f"{parsed.scheme}://{parsed.netloc}"


def fetch_url(url: str, timeout_seconds: float) -> HttpResult:
    request = Request(
        url, headers={"User-Agent": "asset-allocation-ui/asset-validator"}
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            status = getattr(response, "status", None) or response.getcode()
            content_type = response.headers.get_content_type()
            return HttpResult(url, int(status), content_type, response.read())
    except HTTPError as exc:
        content_type = exc.headers.get_content_type() if exc.headers else ""
        return HttpResult(url, int(exc.code), content_type, exc.read())


def require_status(result: HttpResult, expected_status: int) -> None:
    if result.status != expected_status:
        raise ValidationError(
            f"GET {result.url} returned HTTP {result.status}, expected {expected_status}."
        )


def require_javascript(result: HttpResult) -> None:
    require_status(result, 200)
    if result.content_type.lower() not in JAVASCRIPT_CONTENT_TYPES:
        raise ValidationError(
            f"GET {result.url} returned Content-Type {result.content_type or '<empty>'}, expected JavaScript."
        )


def parse_main_module_url(origin: str, index_html: str) -> str:
    parser = ModuleScriptParser()
    parser.feed(index_html)
    if not parser.module_scripts:
        raise ValidationError("Deployed index.html does not reference a module script.")

    main_scripts = [src for src in parser.module_scripts if "/assets/" in src]
    selected_script = main_scripts[0] if main_scripts else parser.module_scripts[0]
    return urljoin(f"{origin}/", selected_script)


def extract_chunk_urls(main_module_url: str, module_text: str) -> list[str]:
    chunk_urls = {
        urljoin(main_module_url, match.group("path"))
        for match in SCRIPT_LITERAL_PATTERN.finditer(module_text)
    }
    return sorted(chunk_urls)


def validate_deployed_ui_assets(
    ui_origin: str,
    timeout_seconds: float = 20.0,
    fetcher: Callable[[str, float], HttpResult] | None = None,
) -> dict[str, object]:
    origin = normalize_ui_origin(ui_origin)
    fetch = fetcher or fetch_url

    index_result = fetch(f"{origin}/", timeout_seconds)
    require_status(index_result, 200)

    main_module_url = parse_main_module_url(origin, index_result.text())
    main_module_result = fetch(main_module_url, timeout_seconds)
    require_javascript(main_module_result)

    chunk_urls = extract_chunk_urls(main_module_url, main_module_result.text())
    for chunk_url in chunk_urls:
        require_javascript(fetch(chunk_url, timeout_seconds))

    missing_asset_url = f"{origin}/assets/__asset_allocation_missing_chunk_smoke__.js"
    missing_result = fetch(missing_asset_url, timeout_seconds)
    require_status(missing_result, 404)

    return {
        "ui_origin": origin,
        "main_module_url": main_module_url,
        "chunk_count": len(chunk_urls),
        "missing_asset_url": missing_asset_url,
    }


def validate_deployed_ui_assets_with_retries(
    ui_origin: str,
    timeout_seconds: float = 20.0,
    retry_attempts: int = 1,
    retry_delay_seconds: float = 10.0,
    fetcher: Callable[[str, float], HttpResult] | None = None,
    sleeper: Callable[[float], None] = time.sleep,
    reporter: Callable[[str], None] | None = None,
) -> dict[str, object]:
    attempts = max(1, retry_attempts)
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            return validate_deployed_ui_assets(
                ui_origin=ui_origin,
                timeout_seconds=timeout_seconds,
                fetcher=fetcher,
            )
        except Exception as exc:
            last_error = exc
            if attempt >= attempts:
                break
            if reporter is not None:
                reporter(
                    f"Attempt {attempt}/{attempts}: {exc}. "
                    f"Waiting {retry_delay_seconds:g}s for UI assets to converge."
                )
            sleeper(retry_delay_seconds)

    if isinstance(last_error, ValidationError):
        raise last_error
    raise ValidationError(str(last_error) or "UI asset validation failed.") from last_error


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate deployed Vite UI asset routing and content types."
    )
    parser.add_argument(
        "--ui-origin",
        required=True,
        help="Absolute deployed UI origin, for example https://asset-allocation-ui.example.com",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=20.0,
        help="HTTP timeout in seconds for deployed asset requests.",
    )
    parser.add_argument(
        "--retry-attempts",
        type=int,
        default=1,
        help="Number of validation attempts before failing. Defaults to 1.",
    )
    parser.add_argument(
        "--retry-delay-seconds",
        type=float,
        default=10.0,
        help="Seconds to wait between retry attempts. Defaults to 10.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_argument_parser()
    args = parser.parse_args(argv)

    try:
        result = validate_deployed_ui_assets_with_retries(
            ui_origin=args.ui_origin,
            timeout_seconds=args.timeout_seconds,
            retry_attempts=args.retry_attempts,
            retry_delay_seconds=args.retry_delay_seconds,
            reporter=lambda message: print(message, file=sys.stderr),
        )
    except ValidationError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(f"Validated deployed UI assets for {result['ui_origin']}")
    print(f"mainModule={result['main_module_url']}")
    print(f"dynamicChunkCount={result['chunk_count']}")
    print(f"missingAssetCheck={result['missing_asset_url']} -> 404")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
