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

# Committed statics every install must have. Paths are relative to the static
# root and are rendered into the worker at /scorecard/v2/sw.js;
# tests/test_pwa.py asserts each one resolves.
PRECACHE_ASSETS = (
    # The offline boot shell. It is static on purpose (no CSRF token, no
    # server data); the Django-rendered page is never cached.
    "scorecard_v2/app-shell.html",
    # Only used when the shell itself could not be precached.
    "scorecard_v2/offline.html",
    "scorecard_v2/manifest.webmanifest",
    "scorecard_v2/icons/icon-192.png",
    "scorecard_v2/icons/icon-512.png",
    "scorecard_v2/icons/icon-512-maskable.png",
)

# Build output is discovered, not hard-coded: vite.config.ts may rename or add
# files (bundle, CSS, woff/woff2), and a stale list would 404 on install.
APP_STATIC_DIR = "scorecard_v2"
PRECACHE_BUILD_DIR = "js"
# A committed static used to locate the app's static directory (staticfiles
# can serve several roots, so it is not derived from BASE_DIR).
PRECACHE_ANCHOR = f"{APP_STATIC_DIR}/manifest.webmanifest"


@method_decorator(ensure_csrf_cookie, name="dispatch")
class ScorecardV2View(LoginRequiredMixin, TemplateView):
    template_name = "scorecard_v2/index.html"
    login_url = "login"

    def get_context_data(self, **kwargs):
        # The footer shows the running build; the static offline shell has no
        # such meta and simply leaves the version out.
        context = super().get_context_data(**kwargs)
        context["version"] = league_manager.__version__
        return context


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
                "app_shell_url": static("scorecard_v2/app-shell.html"),
                "offline_url": static("scorecard_v2/offline.html"),
            }
        )
        return HttpResponse(
            body,
            content_type="application/javascript; charset=utf-8",
            headers={"Cache-Control": "no-cache"},
        )


def precache_assets(static_root=None):
    """Every static file an install stores: committed assets plus build output."""
    return tuple(PRECACHE_ASSETS) + build_assets(static_root)


def build_assets(static_root=None):
    """The files currently in the build directory, sorted.

    ``static_root`` is the app's static directory (the one containing ``js``);
    it is injectable so tests can point at a temp dir and prove the listing is
    dynamic instead of a hard-coded tuple.
    """
    if static_root is None:
        static_root = _static_root()
    if static_root is None:
        return ()
    directory = os.path.join(static_root, PRECACHE_BUILD_DIR)
    if not os.path.isdir(directory):
        return ()
    names = sorted(
        name
        for name in os.listdir(directory)
        if os.path.isfile(os.path.join(directory, name))
    )
    return tuple(
        f"{APP_STATIC_DIR}/{PRECACHE_BUILD_DIR}/{name}" for name in names
    )


def precache_urls():
    """Absolute (STATIC_URL-prefixed) URLs the worker installs."""
    return [static(asset) for asset in precache_assets()]


def cache_version():
    """App version plus a stamp of the built assets.

    The bundle filename is fixed, so the version is what tells a device that a
    deploy shipped different bytes: a new stamp → a new cache → a fresh install.
    """
    return f"{league_manager.__version__}@{_build_stamp()}"


def _static_root():
    anchor = finders.find(PRECACHE_ANCHOR)
    if anchor is None:
        return None
    return os.path.dirname(anchor)


def _build_stamp():
    digest = hashlib.sha256()
    for asset in precache_assets():
        path = finders.find(asset)
        if path is None:
            # Missing build output: install fails loudly on the device, and
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
