"""Guard the built shell and its same-origin asset delivery contract."""

import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
    from ciq_autotune.api import create_app
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False


_REPO = Path(__file__).resolve().parent.parent
# #416: the desk is the only shell, and it is served at root.
_DIST = _REPO / "frontend" / "dist"
_INDEX = _DIST / "index.html"
_API = _REPO / "ciq_autotune" / "api.py"
_TAB_ROUTING = _REPO / "frontend" / "tab-routing.js"
_BUILT_SHELL = _REPO / "frontend" / "built-shell.js"
_DESTINATIONS = re.compile(r"(?<![A-Z_])DESTINATIONS = [\(\[]([^\)\]]*)[\)\]]")
_MIRROR_PAGES = re.compile(r"PAGE_PATHS = new Set\(\[([^\]]*)\]\)")
_MIRROR_ROOT = re.compile(r"""const PAGE = ['"]([^'"]*)['"]""")
_JS_STRING = re.compile(r"""^(['"])([^'"]*)\1$""")
_ASSET_REF = re.compile(r'''(?:src|href)=["'](/assets/[^"']+)["']''')
# The complete non-API route set, named here so a new one cannot be added
# without this test being updated to say so.
_NON_API_ROUTES = {"/", "/diagnose", "/changes", "/day", "/assets"}
# Every address the app no longer has. None of these may answer the shell, and
# none may redirect to one: ADR 416 retired v1 and the `/v2` prefix outright.
_RETIRED = [
    "/v2", "/v2/", "/v2/diagnose", "/v2/changes", "/v2/day", "/v2/assets/x.js",
    "/verify", "/plan", "/settings", "/guide",
    "/index.html", "/not-a-page",
    # The ids retired by #99/#245/#246/#248 were never served either.
    "/dashboard", "/pump", "/review", "/patterns", "/daily", "/modelview", "/outcomes",
    "/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json", "/analyze",
    "/api/no-such", "/assets/", "/assets/no-such.js", "/main.js",
]


def _built_assets() -> set[Path]:
    return {
        _DIST / path.removeprefix("/")
        for path in _ASSET_REF.findall(_INDEX.read_text())
    }


def _quoted(text: str) -> set[str]:
    return set(re.findall(r"""['"]([a-z]+)['"]""", text))


class FrontendAssetRoutesTest(unittest.TestCase):
    def _mirror_pages(self) -> set[str]:
        """Every page path the disk-serving mirror serves, enumerated.

        Each element of its page set is READ BACK, never filtered. A filter that
        matched only the paths this test already expects would pass while the
        mirror served `/day2`, `/Day`, `/day-old` or a double-quoted `"/day"` —
        exactly the divergence this check exists to catch, because a mirror that
        serves a path the server does not is structurally blind to a missing
        route. An element this test cannot resolve fails here rather than being
        skipped.
        """
        source = _BUILT_SHELL.read_text()
        mirror = _MIRROR_PAGES.search(source)
        self.assertIsNotNone(mirror, "built-shell.js must carry the desk's page-path set")
        root = _MIRROR_ROOT.search(source)
        self.assertIsNotNone(root, "built-shell.js must declare the mirror's root page")
        pages = set()
        for element in (part.strip() for part in mirror.group(1).split(",")):
            if not element:
                continue
            if element == "PAGE":
                pages.add(root.group(1))
                continue
            literal = _JS_STRING.match(element)
            self.assertIsNotNone(
                literal, f"the mirror's page set names {element!r}, which this test cannot "
                         "resolve to a served path")
            pages.add(literal.group(2))
        return pages

    def test_server_router_and_disk_mirror_name_the_same_pages(self):
        # The three owners of the page set are compared rather than trusted: the
        # Python route policy, the browser router, and the disk-serving mirror
        # the browser gates run against.
        served = _DESTINATIONS.search(_API.read_text())
        self.assertIsNotNone(served, "api.py must carry the explicit desk page tuple")
        router = _DESTINATIONS.search(_TAB_ROUTING.read_text())
        self.assertIsNotNone(router, "tab-routing.js must carry the desk's destination list")
        server_pages = _quoted(served.group(1))
        self.assertEqual(server_pages, {"diagnose", "changes", "day"})
        self.assertEqual(_quoted(router.group(1)), server_pages)
        # The mirror's expectation is derived from the server's own page tuple,
        # so the two cannot drift apart in either direction.
        self.assertEqual(self._mirror_pages(),
                         {"/", *(f"/{page}" for page in server_pages)})

    def test_built_shell_exists_and_names_no_cdn_host_at_all(self):
        # The packaged runtime needs no Node runtime and no CDN, so this scan is
        # for every host rather than only the script CDNs.
        self.assertTrue(_INDEX.is_file(), "run npm ci && npm run build before Python tests")
        self.assertTrue(_built_assets(),
                        "the built shell must reference its assets beneath /assets/")
        for path in _DIST.rglob("*"):
            if path.is_file():
                self.assertNotRegex(
                    path.read_text(errors="ignore"),
                    r"unpkg\.com|jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.",
                    path)

    @unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
    def test_every_page_built_asset_and_generated_interface_answers_over_http(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            client = TestClient(create_app(
                db_path=db.name, token=None, enable_fetch_loop=False))
            for path in ["/", "/diagnose", "/changes", "/day"]:
                response = client.get(path)
                self.assertEqual(response.status_code, 200, path)
                self.assertTrue(response.headers["content-type"].startswith("text/html"), path)
                self.assertEqual(response.headers["cache-control"], "no-cache", path)
                self.assertEqual(response.content, _INDEX.read_bytes(), path)

            for asset in sorted(_built_assets()):
                path = "/" + asset.relative_to(_DIST).as_posix()
                response = client.get(path)
                self.assertEqual(response.status_code, 200, path)
                self.assertEqual(response.content, asset.read_bytes(), path)
                self.assertEqual(response.headers["cache-control"],
                                 "public, max-age=31536000, immutable", path)

            non_api_paths = {route.path for route in client.app.routes
                             if not route.path.startswith("/api/")}
            self.assertEqual(non_api_paths, _NON_API_ROUTES)

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

            self.assertTrue(client.get("/api/plan").headers["content-type"].startswith("application/json"))
            for path in _RETIRED:
                response = client.get(path, follow_redirects=False)
                # 404, so neither the shell nor a redirect to it.
                self.assertEqual(response.status_code, 404, path)
            # An asset URL reaches the build's own assets/ directory, nothing above it.
            for path in ["/assets/%2e%2e/index.html",
                         "/assets/%2e%2e/%2e%2e/ciq_autotune/api.py"]:
                self.assertEqual(client.get(path).status_code, 404, path)

    @unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
    def test_missing_build_fails_closed_without_hiding_the_api(self):
        with tempfile.TemporaryDirectory() as temporary, tempfile.NamedTemporaryFile(suffix=".db") as db:
            dist = Path(temporary)
            assets = dist / "assets"
            with patch("ciq_autotune.api._FRONTEND_INDEX", dist / "index.html"), \
                 patch("ciq_autotune.api._FRONTEND_ASSETS", assets):
                with self.assertLogs("ciq_autotune.api", "ERROR") as first_log:
                    client = TestClient(create_app(
                        db_path=db.name, token=None, enable_fetch_loop=False))
                self.assertIn("npm ci && npm run build", first_log.output[0])
                with self.assertLogs("ciq_autotune.api", "ERROR") as second_log:
                    create_app(db_path=db.name, token=None, enable_fetch_loop=False)
                self.assertIn("npm ci && npm run build", second_log.output[0])
                for path in ["/", "/diagnose", "/changes", "/day"]:
                    response = client.get(path)
                    self.assertEqual(response.status_code, 503, path)
                    self.assertIn("npm ci && npm run build", response.text)
                missing_asset = client.get("/assets/no-such.js")
                self.assertEqual(missing_asset.status_code, 404)
                self.assertNotIn("cache-control", missing_asset.headers)
                self.assertEqual(client.get("/api/health").status_code, 200)
                assets.mkdir()
                self.assertEqual(client.get("/assets/main.js").status_code, 404)
                self.assertEqual(client.get("/assets/index.html").status_code, 404)
                missing_asset = client.get("/assets/no-such.js")
                self.assertEqual(missing_asset.status_code, 404)
                self.assertNotIn("cache-control", missing_asset.headers)


if __name__ == "__main__":
    unittest.main()
