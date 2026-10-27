"""Tests for the Scorecard v2 PWA shell: worker, manifest and icons."""

import json
import struct

import league_manager
import pytest
from django.contrib.auth.models import User
from django.contrib.staticfiles import finders
from django.urls import reverse
from django_webtest import WebTest

from scorecard_v2 import views

MANIFEST = "scorecard_v2/manifest.webmanifest"
# Build output: gitignored, produced by `npm --prefix scorecard_v2 run build`.
BUILD_PREFIX = "scorecard_v2/js/"


def _static_file(asset):
    path = finders.find(asset)
    assert path is not None, f"{asset} does not resolve through the static finders"
    with open(path, "rb") as handle:
        return handle.read()


def _png_size(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    width, height = struct.unpack(">II", data[16:24])
    return width, height


class TestServiceWorkerView(WebTest):
    def test_worker_is_served_anonymously_without_a_login_redirect(self):
        response = self.app.get(reverse("scorecard-v2-sw"), status=200)

        assert response.content_type == "application/javascript"
        assert response.headers["Cache-Control"] == "no-cache"
        assert "{{" not in response.text, "template placeholders left unrendered"

    def test_worker_lives_on_the_app_scope(self):
        assert reverse("scorecard-v2-sw") == "/scorecard/v2/sw.js"

    def test_worker_carries_the_cache_version(self):
        response = self.app.get(reverse("scorecard-v2-sw"))

        assert views.cache_version() in response.text
        assert f'const CACHE_VERSION = "{views.cache_version()}";' in response.text

    def test_worker_precaches_the_offline_shell_and_assets_only(self):
        response = self.app.get(reverse("scorecard-v2-sw"))
        marker = "const PRECACHE_URLS = "
        start = response.text.index(marker) + len(marker)
        precache, _ = json.JSONDecoder().raw_decode(response.text[start:])

        assert "/static/scorecard_v2/offline.html" in precache
        assert "/static/scorecard_v2/js/scorecard_v2.js" in precache
        for url in precache:
            assert url.startswith("/static/scorecard_v2/"), url
            assert "/api/" not in url, url
            assert not url.startswith(views.APP_SCOPE), url

    def test_worker_never_caches_api_or_the_authenticated_page(self):
        source = self.app.get(reverse("scorecard-v2-sw")).text

        # /api/ bails out before any respondWith(): match data is the outbox's.
        assert 'if (url.pathname.startsWith("/api/")) {\n    return;\n  }' in source
        # Navigations are the only HTML path, and they store nothing.
        navigation = source.split("async function networkFirstNavigation", 1)[1]
        navigation = navigation.split("async function networkFirstStatic", 1)[0]
        assert "cache.put" not in navigation
        # Only static assets are written, and only successful same-origin ones.
        static_handler = source.split("async function networkFirstStatic", 1)[1]
        assert "cache.put(request, response.clone())" in static_handler
        assert 'if (request.method !== "GET")' in source

    def test_logout_message_clears_the_caches(self):
        source = self.app.get(reverse("scorecard-v2-sw")).text

        assert 'data.type === "logout"' in source
        assert "caches.delete" in source

    def test_old_caches_are_dropped_on_activate(self):
        source = self.app.get(reverse("scorecard-v2-sw")).text
        activate = source.split('addEventListener("activate"', 1)[1]

        assert "key !== CACHE_NAME" in activate
        assert "clients.claim" in activate


class TestPrecacheAssets:
    def test_committed_precache_assets_resolve(self):
        missing = [
            asset
            for asset in views.PRECACHE_ASSETS
            if not asset.startswith(BUILD_PREFIX) and finders.find(asset) is None
        ]

        assert missing == []

    @pytest.mark.skipif(
        finders.find("scorecard_v2/js/scorecard_v2.js") is None,
        reason="frontend build missing: run `npm --prefix scorecard_v2 run build`",
    )
    def test_built_precache_assets_resolve(self):
        missing = [
            asset for asset in views.PRECACHE_ASSETS if finders.find(asset) is None
        ]

        assert missing == []

    def test_worker_template_resolves(self):
        assert finders.find("scorecard_v2/sw.js") is not None


class TestCacheVersion:
    def test_version_is_the_app_version_plus_a_build_stamp(self):
        version = views.cache_version()
        app_version, _, stamp = version.partition("-")

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

    def test_the_512_icon_is_maskable(self):
        manifest = json.loads(_static_file(MANIFEST))

        maskable = [icon for icon in manifest["icons"] if "maskable" in icon["purpose"]]

        assert [icon["sizes"] for icon in maskable] == ["512x512"]


class TestOfflineShell:
    def test_offline_shell_is_self_contained(self):
        html = _static_file("scorecard_v2/offline.html").decode()

        assert '<html lang="de">' in html
        assert "<script src=" not in html
        assert "<link" not in html
        assert "Keine Verbindung" in html


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
