"""Tests for the Scorecard v2 PWA manifest and the page links to it."""

import json
import struct

from django.contrib.auth.models import User
from django.contrib.staticfiles import finders
from django.urls import reverse
from django_webtest import WebTest

MANIFEST = "scorecard_v2/manifest.webmanifest"


def _static_file(asset):
    path = finders.find(asset)
    assert path is not None, f"{asset} does not resolve through the static finders"
    with open(path, "rb") as handle:
        return handle.read()


def _png_size(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    width, height = struct.unpack(">II", data[16:24])
    return width, height


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
