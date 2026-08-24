"""Guard: every local frontend asset reachable from index.html has a route.

api.py serves frontend/index.html and its sibling assets via an explicit
per-file FileResponse whitelist (no StaticFiles mount, see api.py's routes
around the ``_FRONTEND_DIR`` block). A locally imported module without a route
404s after the page loads, so walk the static module graph rather than only the
assets index.html names directly.
"""

import re
import tempfile
import unittest
from pathlib import Path
from typing import Optional

try:
    from fastapi.testclient import TestClient
    from ciq_autotune.api import create_app
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False


_FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
_FRONTEND_INDEX = _FRONTEND_DIR / "index.html"
_API = _FRONTEND_DIR.parent / "ciq_autotune" / "api.py"
_TAB_ROUTING = _FRONTEND_DIR / "tab-routing.js"

# Local <script src=...> and <link href=...> references from index.html. The
# value is resolved below so nested frontend paths work too.
_HTML_ASSET_REF = re.compile(
    r'''<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["']''', re.IGNORECASE
)
_INLINE_MODULE = re.compile(
    r'''<script\b[^>]*\btype=["']module["'][^>]*>(.*?)</script>''',
    re.IGNORECASE | re.DOTALL,
)
# ES static imports and re-exports, including side-effect imports. Dynamic
# import() is deliberately excluded: it cannot be determined from this graph.
_MODULE_SPECIFIER = re.compile(
    r'''\b(?:import\s+(?:[\w*${},\s]+?\s+from\s+)?|export\s+(?:[\w*${},\s]+?\s+from\s+))["']([^"']+)["']'''
)
_GET_ROUTE = re.compile(r'''@app\.get\(\s*["']([^"']+)["']''')
_PAGE_ID = re.compile(r"\{ id: '([a-z]+)'")
_SPA_PAGES = re.compile(r"SPA_PAGES = \(([^)]*)\)")


def _local_path(specifier: str, importer: Path) -> Optional[Path]:
    """Return a local frontend path for a relative specifier, if it has one."""
    if specifier.startswith("/assets/"):
        path = (_FRONTEND_DIR / specifier.removeprefix("/assets/")).resolve()
    elif specifier.startswith("."):
        path = (importer.parent / specifier).resolve()
    else:
        return None
    try:
        path.relative_to(_FRONTEND_DIR)
    except ValueError:
        return None
    return path


def _module_specifiers(source: str) -> set[str]:
    return set(_MODULE_SPECIFIER.findall(source))


def _local_assets() -> set[Path]:
    """Walk index.html's local asset graph without revisiting modules."""
    index = _FRONTEND_INDEX.read_text()
    pending = {
        path
        for specifier in _HTML_ASSET_REF.findall(index)
        if (path := _local_path(specifier, _FRONTEND_INDEX)) is not None
    }
    pending.update(
        path
        for block in _INLINE_MODULE.findall(index)
        for specifier in _module_specifiers(block)
        if (path := _local_path(specifier, _FRONTEND_INDEX)) is not None
    )

    assets = set()
    while pending:
        asset = pending.pop()
        if asset in assets:
            continue
        assets.add(asset)
        if asset.suffix != ".js" or not asset.is_file():
            continue
        pending.update(
            path
            for specifier in _module_specifiers(asset.read_text())
            if (path := _local_path(specifier, asset)) is not None and path not in assets
        )
    return assets


def _served_paths() -> set[str]:
    """Read the explicit GET paths declared by api.py's hand-written routes."""
    return set(_GET_ROUTE.findall(_API.read_text()))


class FrontendAssetRoutesTest(unittest.TestCase):
    def test_server_page_mirror_equals_browser_router_pages(self):
        browser_pages = set(_PAGE_ID.findall(_TAB_ROUTING.read_text()))
        match = _SPA_PAGES.search(_API.read_text())
        self.assertIsNotNone(match, "api.py must carry the explicit SPA page mirror")
        server_pages = set(re.findall(r'"([a-z]+)"', match.group(1)))
        self.assertEqual(server_pages, browser_pages)

    def test_every_reachable_local_asset_has_a_route(self):
        assets = _local_assets()
        paths = {"/assets/" + asset.relative_to(_FRONTEND_DIR).as_posix() for asset in assets}
        served = {path for path in _served_paths() if path.startswith("/assets/")}
        missing = sorted(paths - served)
        extra = sorted(served - paths)

        # Sanity: the HTML and inline-module extractors both find known assets,
        # so a broken extraction cannot pass vacuously.
        self.assertIn("/assets/tab-routing.js", paths)
        self.assertIn("/assets/scenario.css", paths)

        self.assertFalse(
            missing or extra,
            "Frontend asset routes must equal the reachable graph; missing "
            f"{', '.join(missing)}; extra {', '.join(extra)}.",
        )

    def test_inline_modules_are_assets_absolute_and_rest_window_stays_private(self):
        inline_specifiers = {
            specifier
            for block in _INLINE_MODULE.findall(_FRONTEND_INDEX.read_text())
            for specifier in _module_specifiers(block)
        }
        self.assertTrue(inline_specifiers, "index.html must contain a module graph")
        self.assertTrue(
            all(specifier.startswith("/assets/") or not specifier.startswith(".")
                for specifier in inline_specifiers),
            "index.html inline-module local specifiers must be /assets-absolute",
        )
        assets = _local_assets()
        served = _served_paths()
        self.assertNotIn(_FRONTEND_DIR / "rest-window.js", assets)
        self.assertNotIn("/assets/rest-window.js", served)

    @unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
    def test_every_page_asset_and_generated_interface_answers_over_http(self):
        match = _SPA_PAGES.search(_API.read_text())
        self.assertIsNotNone(match)
        pages = set(re.findall(r'"([a-z]+)"', match.group(1)))
        content_types = {
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
        }
        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            client = TestClient(create_app(
                db_path=db.name, token=None, enable_fetch_loop=False))
            for path in ["/", *(f"/{page}" for page in sorted(pages))]:
                response = client.get(path)
                self.assertEqual(response.status_code, 200, path)
                self.assertTrue(response.headers["content-type"].startswith("text/html"), path)

            for asset in sorted(_local_assets()):
                path = "/assets/" + asset.relative_to(_FRONTEND_DIR).as_posix()
                response = client.get(path)
                self.assertEqual(response.status_code, 200, path)
                self.assertEqual(response.content, asset.read_bytes(), path)
                self.assertTrue(response.headers["content-type"].startswith(
                    content_types[asset.suffix]), path)

            page_paths = {"/", *(f"/{page}" for page in pages)}
            asset_paths = {
                "/assets/" + asset.relative_to(_FRONTEND_DIR).as_posix()
                for asset in _local_assets()
            }
            non_api_paths = {
                route.path for route in client.app.routes
                if not route.path.startswith("/api/")
            }
            self.assertEqual(non_api_paths, page_paths | asset_paths)

            generated = {
                "/api/openapi.json": "application/json",
                "/api/docs": "text/html",
                "/api/docs/oauth2-redirect": "text/html",
                "/api/redoc": "text/html",
            }
            for path, content_type in generated.items():
                response = client.get(path)
                self.assertEqual(response.status_code, 200, path)
                self.assertTrue(response.headers["content-type"].startswith(content_type), path)

            self.assertTrue(client.get("/plan").headers["content-type"].startswith("text/html"))
            self.assertTrue(client.get("/api/plan").headers["content-type"].startswith("application/json"))
            for path in [
                "/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json",
                "/analyze", "/scenario.css", "/assets/no-such.js", "/api/no-such",
                "/not-a-page",
            ]:
                self.assertEqual(client.get(path).status_code, 404, path)


if __name__ == "__main__":
    unittest.main()
