"""Views for the Scorecard v2 field app."""

import hashlib
import json
import os
from functools import lru_cache
from urllib.parse import urlparse

import league_manager
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.staticfiles import finders
from django.core.exceptions import ImproperlyConfigured
from django.http import HttpResponse
from django.template import engines
from django.templatetags.static import static
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.generic import TemplateView, View

APP_SCOPE = "/scorecard/v2/"

# Everything the field app needs to boot with the network gone. Paths are
# relative to the static root and are rendered into the worker at
# /scorecard/v2/sw.js; tests/test_pwa.py asserts each one still resolves, so a
# change in vite.config.ts output naming fails loudly instead of shipping a
# worker whose install throws.
PRECACHE_ASSETS = (
    "scorecard_v2/offline.html",
    "scorecard_v2/manifest.webmanifest",
    "scorecard_v2/icons/icon-192.png",
    "scorecard_v2/icons/icon-512.png",
    "scorecard_v2/js/scorecard_v2.js",
    "scorecard_v2/js/scorecard_v2.css",
    # woff2 only: the stylesheet lists `.woff` fallbacks too, but every browser
    # the app supports reads woff2 and both formats would double the precache.
    "scorecard_v2/js/scorecard_v2-inter-latin-400-normal.woff2",
    "scorecard_v2/js/scorecard_v2-inter-latin-600-normal.woff2",
    "scorecard_v2/js/scorecard_v2-inter-latin-700-normal.woff2",
    "scorecard_v2/js/scorecard_v2-barlow-condensed-latin-700-normal.woff2",
    "scorecard_v2/js/scorecard_v2-barlow-condensed-latin-800-normal.woff2",
)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class ScorecardV2View(LoginRequiredMixin, TemplateView):
    template_name = "scorecard_v2/index.html"
    login_url = "login"


class ServiceWorkerView(View):
    """The app's service worker, served from the app scope.

    Deliberately anonymous and CSRF-free: a worker update behind a login
    redirect (or a 403) would leave every device on its first cached build
    forever. The worker itself caches no authenticated response — the page and
    /api/** are passed straight through.
    """

    def get(self, request):
        template_path = finders.find("scorecard_v2/sw.js")
        if template_path is None:
            # A deploy that lost the worker must be loud, not a silent 404 that
            # leaves clients on an old worker.
            raise ImproperlyConfigured(
                "scorecard_v2/sw.js is missing from the static files"
            )

        # The worker lives under static/ next to the other PWA assets, so it is
        # rendered from source instead of through the template loader.
        with open(template_path, encoding="utf-8") as handle:
            template = engines["django"].from_string(handle.read())

        body = template.render(
            {
                "cache_version": cache_version(),
                "precache_urls": json.dumps(precache_urls()),
                "app_scope": APP_SCOPE,
                "static_prefix": _static_path("scorecard_v2/"),
                "offline_url": static("scorecard_v2/offline.html"),
            }
        )
        return HttpResponse(
            body,
            content_type="application/javascript",
            headers={"Cache-Control": "no-cache"},
        )


def precache_urls():
    """Absolute (STATIC_URL-prefixed) URLs the worker installs."""
    return [static(asset) for asset in PRECACHE_ASSETS]


def cache_version():
    """App version plus a stamp of the built assets.

    The bundle filename is fixed, so the version is what tells a device that a
    deploy shipped different bytes: a new stamp → a new cache → a fresh install.
    """
    return f"{league_manager.__version__}-{_build_stamp()}"


def _build_stamp():
    digest = hashlib.sha256()
    for asset in PRECACHE_ASSETS:
        path = finders.find(asset)
        if path is None:
            # Missing build output: install will fail loudly on the device, and
            # tests/test_pwa.py fails first. Nothing to stamp here.
            continue
        stat = os.stat(path)
        digest.update(f"{asset}:{stat.st_size}:".encode())
        digest.update(_file_digest(path, stat.st_size, stat.st_mtime_ns).encode())
    return digest.hexdigest()[:12]


@lru_cache(maxsize=64)
def _file_digest(path, size, mtime_ns):
    """Content hash of one asset, memoised on (path, size, mtime)."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(256 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _static_path(asset):
    """The URL path of a static asset, for prefix matching inside the worker."""
    return urlparse(static(asset)).path
