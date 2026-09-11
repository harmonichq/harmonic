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
_DIST = _REPO / "frontend" / "dist"
_INDEX = _DIST / "index.html"
# #389: the v2 desktop's own build, served beside v1 from the same process.
_DIST_V2 = _REPO / "frontend-v2" / "dist"
_INDEX_V2 = _DIST_V2 / "index.html"
_API = _REPO / "ciq_autotune" / "api.py"
_TAB_ROUTING = _REPO / "frontend" / "tab-routing.js"
_PAGE_ID = re.compile(r"\{ id: '([a-z]+)'")
_SPA_PAGES = re.compile(r"SPA_PAGES = \(([^)]*)\)")
_ASSET_REF = re.compile(r'''(?:src|href)=["'](/assets/[^"']+)["']''')
_ASSET_REF_V2 = re.compile(r'''(?:src|href)=["'](/v2/assets/[^"']+)["']''')
# The complete non-API route set, named here so a new one cannot be added
# without this test being updated to say so.
_NON_API_ROUTES = {"/", "/assets", "/v2/", "/v2/assets"}


def _built_assets() -> set[Path]:
    return {
        _DIST / path.removeprefix("/")
        for path in _ASSET_REF.findall(_INDEX.read_text())
    }


def _built_assets_v2() -> set[Path]:
    return {
        _DIST_V2 / path.removeprefix("/v2/")
        for path in _ASSET_REF_V2.findall(_INDEX_V2.read_text())
    }


class FrontendAssetRoutesTest(unittest.TestCase):
    def test_server_page_mirror_equals_browser_router_pages(self):
        browser_pages = set(_PAGE_ID.findall(_TAB_ROUTING.read_text()))
        match = _SPA_PAGES.search(_API.read_text())
        self.assertIsNotNone(match, "api.py must carry the explicit SPA page mirror")
        server_pages = set(re.findall(r'"([a-z]+)"', match.group(1)))
        self.assertEqual(server_pages, browser_pages)

    def test_built_shell_exists_and_never_names_a_cdn(self):
        self.assertTrue(_INDEX.is_file(), "run npm ci && npm run build before Python tests")
        self.assertTrue(_built_assets(), "built index.html must reference assets")
        for path in _DIST.rglob("*"):
            if path.is_file():
                self.assertNotRegex(path.read_text(errors="ignore"),
                                    r"unpkg\.com|jsdelivr\.net", path)

    def test_v2_shell_exists_and_names_no_cdn_host_at_all(self):
        # HV2-01: the packaged runtime needs no Node runtime and no CDN. V1 still
        # links a font CDN from its own shell; the v2 desk names none, so its
        # scan is the stricter one — every host, not only the script CDNs.
        self.assertTrue(_INDEX_V2.is_file(), "run npm ci && npm run build before Python tests")
        self.assertTrue(_built_assets_v2(),
                        "the v2 shell must reference its assets beneath /v2/assets/")
        for path in _DIST_V2.rglob("*"):
            if path.is_file():
                self.assertNotRegex(
                    path.read_text(errors="ignore"),
                    r"unpkg\.com|jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.",
                    path)

    @unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
    def test_every_page_built_asset_and_generated_interface_answers_over_http(self):
        match = _SPA_PAGES.search(_API.read_text())
        self.assertIsNotNone(match)
        pages = set(re.findall(r'"([a-z]+)"', match.group(1)))
        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            client = TestClient(create_app(
                db_path=db.name, token=None, enable_fetch_loop=False))
            for path in ["/", *(f"/{page}" for page in sorted(pages))]:
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

            # #389: /v2/ serves the second built surface from the same process,
            # against this same API and database, and its fingerprinted assets
            # live under their own prefix.
            response = client.get("/v2/")
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.headers["content-type"].startswith("text/html"))
            self.assertEqual(response.headers["cache-control"], "no-cache")
            self.assertEqual(response.content, _INDEX_V2.read_bytes())
            self.assertNotEqual(response.content, _INDEX.read_bytes(),
                                "v1 and v2 must serve their own shells, not one shell twice")
            for asset in sorted(_built_assets_v2()):
                path = "/v2/" + asset.relative_to(_DIST_V2).as_posix()
                response = client.get(path)
                self.assertEqual(response.status_code, 200, path)
                self.assertEqual(response.content, asset.read_bytes(), path)
                self.assertEqual(response.headers["cache-control"],
                                 "public, max-age=31536000, immutable", path)

            non_api_paths = {route.path for route in client.app.routes
                             if not route.path.startswith("/api/")}
            self.assertEqual(non_api_paths,
                             {*_NON_API_ROUTES, *(f"/{page}" for page in pages)})

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
            for path in [
                "/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json",
                "/analyze", "/assets/no-such.js", "/assets/main.js", "/assets/rest-window.js",
                "/api/no-such",
                "/not-a-page",
                # #352: the ids retired by #99/#245/#246/#248 are not served,
                # which is why the browser router migrates none of them.
                "/dashboard", "/pump", "/review", "/patterns", "/daily",
                "/modelview", "/outcomes",
                # #389: the v2 desk is ONE page path. Its four destinations are
                # query state, so a destination-shaped path is not served, and
                # neither is its build's interior.
                "/v2/day", "/v2/overview", "/v2/index.html", "/v2/assets/",
                "/v2/assets/no-such.js", "/v2/main.js",
            ]:
                self.assertEqual(client.get(path).status_code, 404, path)
            # Starlette's own trailing-slash handling, not a second page route:
            # /v2 redirects to the one declared path rather than being served.
            redirect = client.get("/v2", follow_redirects=False)
            self.assertEqual(redirect.status_code, 307)
            self.assertTrue(redirect.headers["location"].endswith("/v2/"))
            for path in ["/v2/assets/%2e%2e/index.html",
                         "/v2/assets/%2e%2e/%2e%2e/frontend/main.js"]:
                self.assertEqual(client.get(path).status_code, 404, path)
            self.assertTrue((_REPO / "frontend" / "rest-window.js").is_file())
            for path in ["/assets/%2e%2e/main.js",
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
                for path in ["/", "/day"]:
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
                # The surfaces fail closed independently: v1's absent build is
                # not v2's, and /v2/ keeps serving its own.
                self.assertEqual(client.get("/v2/").status_code, 200)

    @unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
    def test_a_missing_v2_build_hides_neither_v1_nor_the_api(self):
        with tempfile.TemporaryDirectory() as temporary, tempfile.NamedTemporaryFile(suffix=".db") as db:
            dist = Path(temporary)
            with patch("ciq_autotune.api._FRONTEND_V2_INDEX", dist / "index.html"), \
                 patch("ciq_autotune.api._FRONTEND_V2_ASSETS", dist / "assets"):
                with self.assertLogs("ciq_autotune.api", "ERROR") as log:
                    client = TestClient(create_app(
                        db_path=db.name, token=None, enable_fetch_loop=False))
                self.assertIn("npm ci && npm run build", log.output[0])
                response = client.get("/v2/")
                self.assertEqual(response.status_code, 503)
                self.assertIn("npm ci && npm run build", response.text)
                self.assertEqual(client.get("/").status_code, 200)
                self.assertEqual(client.get("/day").status_code, 200)
                self.assertEqual(client.get("/api/health").status_code, 200)
                self.assertEqual(client.get("/v2/assets/no-such.js").status_code, 404)


if __name__ == "__main__":
    unittest.main()
