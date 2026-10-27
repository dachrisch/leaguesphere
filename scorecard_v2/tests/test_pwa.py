"""Tests for the Scorecard v2 PWA shell: worker, manifest and icons."""

import json
import os
import re
import shutil
import struct
import subprocess
import tempfile

import league_manager
import pytest
from django.contrib.auth.models import User
from django.contrib.staticfiles import finders
from django.urls import reverse
from django_webtest import WebTest

from scorecard_v2 import views

MANIFEST = "scorecard_v2/manifest.webmanifest"
# Build output: gitignored, produced by `npm --prefix scorecard_v2 run build`.
BUILD_DIR = "scorecard_v2/js"
BUILD_ENTRY = "scorecard_v2/js/scorecard_v2.js"
APP_SHELL = "scorecard_v2/app-shell.html"


def _static_file(asset):
    path = finders.find(asset)
    assert path is not None, f"{asset} does not resolve through the static finders"
    with open(path, "rb") as handle:
        return handle.read()


def _png_size(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    width, height = struct.unpack(">II", data[16:24])
    return width, height


def _relative_luminance(hex_colour):
    channels = [int(hex_colour.lstrip("#")[i : i + 2], 16) / 255 for i in (0, 2, 4)]

    def linear(channel):
        if channel <= 0.03928:
            return channel / 12.92
        return ((channel + 0.055) / 1.055) ** 2.4

    red, green, blue = (linear(channel) for channel in channels)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def _contrast(first, second):
    high, low = sorted(
        (_relative_luminance(first), _relative_luminance(second)), reverse=True
    )
    return (high + 0.05) / (low + 0.05)


class TestServiceWorkerView(WebTest):
    def test_worker_is_served_anonymously_without_a_login_redirect(self):
        response = self.app.get(reverse("scorecard-v2-sw"), status=200)

        assert response.content_type == "application/javascript"
        assert response.headers["Cache-Control"] == "no-cache"
        assert "{{" not in response.text, "template placeholders left unrendered"

    def test_worker_is_javascript_with_an_explicit_charset(self):
        response = self.app.get(reverse("scorecard-v2-sw"))

        assert (
            response.headers["Content-Type"]
            == "application/javascript; charset=utf-8"
        )

    def test_worker_lives_on_the_app_scope(self):
        assert reverse("scorecard-v2-sw") == "/scorecard/v2/sw.js"

    def test_worker_carries_the_cache_version(self):
        response = self.app.get(reverse("scorecard-v2-sw"))

        assert views.cache_version() in response.text
        assert f'const CACHE_VERSION = "{views.cache_version()}";' in response.text

    def test_worker_gives_the_precache_its_own_cache_name(self):
        source = self.app.get(reverse("scorecard-v2-sw")).text

        assert 'const PRECACHE_PREFIX = CACHE_PREFIX + "precache-";' in source
        assert 'const RUNTIME_PREFIX = CACHE_PREFIX + "runtime-";' in source
        assert "const PRECACHE_NAME = PRECACHE_PREFIX + CACHE_VERSION;" in source

    def _rendered_precache(self):
        response = self.app.get(reverse("scorecard-v2-sw"))
        marker = "const PRECACHE_URLS = "
        start = response.text.index(marker) + len(marker)
        precache, _ = json.JSONDecoder().raw_decode(response.text[start:])
        return precache

    def test_worker_precaches_the_app_shell_and_committed_statics_only(self):
        precache = self._rendered_precache()

        assert "/static/scorecard_v2/app-shell.html" in precache
        for url in precache:
            assert url.startswith("/static/scorecard_v2/"), url
            assert "/api/" not in url, url
            assert not url.startswith(views.APP_SCOPE), url

    @pytest.mark.skipif(
        finders.find(BUILD_ENTRY) is None,
        reason="frontend build missing: run `npm --prefix scorecard_v2 run build`",
    )
    def test_worker_precache_includes_the_build_output_when_it_exists(self):
        precache = self._rendered_precache()

        assert f"/static/{BUILD_ENTRY}" in precache
        assert "/static/scorecard_v2/js/scorecard_v2.css" in precache
        build_directory = os.path.dirname(finders.find(BUILD_ENTRY))
        built = {
            f"/static/scorecard_v2/js/{name}"
            for name in os.listdir(build_directory)
            if os.path.isfile(os.path.join(build_directory, name))
        }
        assert built <= set(precache), built - set(precache)

    def test_worker_never_caches_api_or_the_authenticated_page(self):
        source = self.app.get(reverse("scorecard-v2-sw")).text

        # /api/ bails out before any respondWith(): match data is the outbox's.
        assert 'if (url.pathname.startsWith("/api/")) {\n    return;\n  }' in source
        # Navigations are the only HTML path, and they store nothing.
        navigation = source.split("async function networkFirstNavigation", 1)[1]
        navigation = navigation.split("async function networkFirstStatic", 1)[0]
        assert "cache.put" not in navigation
        assert "APP_SHELL_URL" in navigation
        # Only static assets are written, and only successful same-origin ones.
        static_handler = source.split("async function networkFirstStatic", 1)[1]
        assert "cache.put(request, response.clone())" in static_handler
        assert 'if (request.method !== "GET")' in source

    def test_navigation_falls_back_to_the_static_app_shell(self):
        source = self.app.get(reverse("scorecard-v2-sw")).text
        navigation = source.split("async function networkFirstNavigation", 1)[1]
        navigation = navigation.split("async function networkFirstStatic", 1)[0]

        assert "matchPrecache(APP_SHELL_URL)" in navigation
        assert "OFFLINE_URL" in navigation
        assert "fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS)" in navigation

    def test_navigation_timeout_is_about_four_seconds(self):
        source = self.app.get(reverse("scorecard-v2-sw")).text

        assert "const NAVIGATION_TIMEOUT_MS = 4000;" in source
        assert "new AbortController()" in source

    def test_bare_app_scope_without_a_trailing_slash_is_a_navigation(self):
        source = self.app.get(reverse("scorecard-v2-sw")).text

        assert 'APP_SCOPE.replace(/\\/+$/, "")' in source
        assert "pathname === APP_SCOPE_BARE" in source

    def test_logout_message_clears_only_runtime_caches(self):
        source = self.app.get(reverse("scorecard-v2-sw")).text

        assert 'data.type === "logout"' in source
        logout = source.split('if (data.type === "logout")', 1)[1]
        logout = logout.split('if (data.type === "skip-waiting")', 1)[0]
        assert "clearRuntimeCaches" in logout
        cleared = source.split("async function clearRuntimeCaches", 1)[1]
        assert "RUNTIME_PREFIX" in cleared
        assert "PRECACHE_PREFIX" not in cleared

    def test_old_caches_are_dropped_on_activate(self):
        source = self.app.get(reverse("scorecard-v2-sw")).text
        activate = source.split('addEventListener("activate"', 1)[1]

        assert "key !== PRECACHE_NAME" in activate
        assert "key !== RUNTIME_NAME" in activate
        assert "clients.claim" in activate

    def test_rendered_worker_is_valid_javascript(self):
        node = shutil.which("node")
        if node is None:
            pytest.skip(
                "node is not installed here; src/swWorker.test.ts executes the worker"
            )

        body = self.app.get(reverse("scorecard-v2-sw")).text
        with tempfile.NamedTemporaryFile(
            "w", suffix=".js", delete=False, encoding="utf-8"
        ) as handle:
            handle.write(body)
            path = handle.name
        try:
            result = subprocess.run(
                [node, "--check", path], capture_output=True, text=True
            )
        finally:
            os.unlink(path)

        assert result.returncode == 0, result.stderr


class TestPrecacheAssets:
    def test_committed_precache_assets_resolve(self):
        missing = [
            asset for asset in views.PRECACHE_ASSETS if finders.find(asset) is None
        ]

        assert missing == []

    def test_app_shell_is_a_committed_precache_asset(self):
        assert APP_SHELL in views.PRECACHE_ASSETS

    def test_build_assets_are_discovered_from_the_directory(self, tmp_path):
        build = tmp_path / "js"
        build.mkdir()
        (build / "scorecard_v2.js").write_text("bundle")
        (build / "scorecard_v2.css").write_text("css")
        (build / "extra.woff2").write_text("font")
        (build / "nested").mkdir()

        assert views.build_assets(str(tmp_path)) == (
            "scorecard_v2/js/extra.woff2",
            "scorecard_v2/js/scorecard_v2.css",
            "scorecard_v2/js/scorecard_v2.js",
        )

    def test_precache_assets_combine_committed_and_build_files(self, tmp_path):
        build = tmp_path / "js"
        build.mkdir()
        (build / "scorecard_v2.js").write_text("bundle")

        assets = views.precache_assets(str(tmp_path))

        assert assets[: len(views.PRECACHE_ASSETS)] == views.PRECACHE_ASSETS
        assert assets[-1] == "scorecard_v2/js/scorecard_v2.js"

    def test_missing_build_directory_is_not_an_error(self, tmp_path):
        assert views.build_assets(str(tmp_path)) == ()

    def test_worker_template_resolves(self):
        assert finders.find("scorecard_v2/sw.js") is not None


class TestCacheVersion:
    def test_version_is_the_app_version_plus_a_build_stamp(self):
        version = views.cache_version()
        app_version, _, stamp = version.rpartition("-")

        assert app_version == league_manager.__version__
        assert len(stamp) == 12

    def test_version_changes_when_a_precached_asset_changes(
        self, tmp_path, monkeypatch
    ):
        asset = tmp_path / "scorecard_v2" / "app.js"
        asset.parent.mkdir()
        asset.write_bytes(b"build one")
        monkeypatch.setattr(views, "PRECACHE_ASSETS", ("scorecard_v2/app.js",))
        monkeypatch.setattr(
            views.finders,
            "find",
            lambda name: str(asset) if name == "scorecard_v2/app.js" else None,
        )

        first = views.cache_version()
        assert views.cache_version() == first
        asset.write_bytes(b"build two with more bytes")
        assert views.cache_version() != first


class TestManifest:
    def test_manifest_describes_the_app_scope(self):
        manifest = json.loads(_static_file(MANIFEST))

        assert manifest["name"] == "LeagueSphere Scorecard"
        assert manifest["short_name"] == "Scorecard"
        assert manifest["start_url"] == "/scorecard/v2/"
        assert manifest["scope"] == "/scorecard/v2/"
        assert manifest["display"] == "standalone"
        assert manifest["lang"] == "de"
        assert manifest["background_color"] == "#070a0f"
        assert manifest["theme_color"] == "#070a0f"

    def test_icons_are_pngs_of_the_declared_size(self):
        manifest = json.loads(_static_file(MANIFEST))
        sizes = {}

        for icon in manifest["icons"]:
            assert icon["type"] == "image/png"
            data = _static_file(f"scorecard_v2/{icon['src']}")
            width, height = _png_size(data)
            sizes[icon["sizes"]] = (width, height)
            assert f"{width}x{height}" == icon["sizes"]

        assert sizes == {"192x192": (192, 192), "512x512": (512, 512)}

    def test_the_maskable_icon_is_a_dedicated_padded_512(self):
        manifest = json.loads(_static_file(MANIFEST))

        maskable = [icon for icon in manifest["icons"] if "maskable" in icon["purpose"]]

        assert [icon["sizes"] for icon in maskable] == ["512x512"]
        # A padded copy: the full-bleed art of icon-512.png would lose its
        # corners in Android's mask.
        assert maskable[0]["src"] == "icons/icon-512-maskable.png"
        assert _png_size(_static_file(f"scorecard_v2/{maskable[0]['src']}")) == (
            512,
            512,
        )
        any_icons = [icon for icon in manifest["icons"] if "any" in icon["purpose"]]
        assert [icon["src"] for icon in any_icons] == [
            "icons/icon-192.png",
            "icons/icon-512.png",
        ]


class TestAppShell:
    def test_offline_shell_is_self_contained(self):
        html = _static_file("scorecard_v2/offline.html").decode()

        assert '<html lang="de">' in html
        assert "<script src=" not in html
        assert "<link" not in html
        assert "Keine Verbindung" in html

    def test_retry_button_meets_the_contrast_minimum(self):
        html = _static_file("scorecard_v2/offline.html").decode()
        background = re.search(r"--home-action:\s*(#[0-9a-fA-F]{6})", html)
        assert background is not None

        assert _contrast(background.group(1), "#ffffff") >= 4.5

    def test_static_app_shell_has_no_server_data(self):
        html = _static_file(APP_SHELL).decode()

        assert '<html lang="de">' in html
        assert 'id="scorecard-v2-app"' in html
        assert '<meta content="#070a0f" name="theme-color"/>' in html
        assert 'rel="manifest"' in html
        assert "/static/scorecard_v2/manifest.webmanifest" in html
        assert "/static/scorecard_v2/js/scorecard_v2.css" in html
        assert "/static/scorecard_v2/js/scorecard_v2.js" in html
        assert "{% csrf_token %}" not in html
        assert "csrfmiddlewaretoken" not in html
        assert "{{" not in html and "{%" not in html


class TestPageLinks(WebTest):
    def test_page_links_the_manifest_and_the_worker_scope(self):
        user = User.objects.create_user("official", password="x")
        self.app.set_user(user)
        response = self.app.get(reverse("scorecard-v2-home"))

        assert 'lang="de"' in response.text
        assert 'rel="manifest"' in response.text
        assert "/static/scorecard_v2/manifest.webmanifest" in response.text
        assert 'name="theme-color"' in response.text
        assert 'content="#070a0f"' in response.text
        assert 'rel="apple-touch-icon"' in response.text
        assert "/static/scorecard_v2/icons/icon-192.png" in response.text
